const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'format-renderer.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const ctx = vm.createContext({});
vm.runInContext(source, ctx);
const parse = text => JSON.parse(JSON.stringify(ctx.parseTokens(text, false)));

test('group parser preserves URL, nested brackets, HTML slashes and multiline body', () => {
    const tokens = parse('[主角/看 https://example.com/a/b 和 [表情]\n**粗体** <b>你好</b>/12:30]\n[小明/好呀/12:31]');
    assert.equal(tokens.length, 2);
    assert.deepEqual(tokens[0], {
        type: 'groupBubble', sender: '主角',
        body: '看 https://example.com/a/b 和 [表情]\n**粗体** <b>你好</b>', time: '12:30',
    });
    assert.equal(tokens[1].sender, '小明');
});

test('existing formats and incomplete group syntax retain their meaning', () => {
    const tokens = parse('"普通气泡"\n[红包|20|吃饭]\n+系统提示+\n[未完成/内容\n[小明/你好/12:30]');
    assert.deepEqual(tokens.map(t => t.type), ['textBubble', 'dimensionBubble', 'system', 'text', 'groupBubble']);
    assert.equal(parse('[表情]'), null);
    assert.equal(parse('[文件/路径]'), null);
    assert.equal(parse('[/消息/12:30]'), null);
    assert.equal(parse('[小明//12:30]'), null);
});

test('NPC initials preserve complete emoji graphemes', () => {
    assert.equal(ctx.senderInitial('👩🏽‍💻开发者'), '👩🏽‍💻');
    assert.equal(ctx.senderInitial('小明'), '小');
});

let chromium;
try { ({ chromium } = require(process.env.CARROT_PLAYWRIGHT_MODULE || 'playwright')); } catch {}
test('browser: every preset renders group headers; transparent avatars distinguish character and NPC', {
    skip: !chromium && 'Set CARROT_PLAYWRIGHT_MODULE to the installed playwright module',
}, async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        const page = await browser.newPage();
        await page.setContent('<main id="chat"></main>');
        await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'style.css'), 'utf8') });
        await page.addScriptTag({ content: source });
        for (const width of [320, 393, 1280]) {
            await page.setViewportSize({ width, height: 800 });
            for (const preset of ['ios', 'avatarTransparent', 'clean', 'custom_test']) {
                const result = await page.evaluate(({ preset }) => {
                    const content = '[主角/**角色消息**/12:30]\n[小明/网址 https://example.com/a/b/12:31]\n[👩🏽‍💻开发者/一段很长很长很长很长很长很长很长很长很长很长很长很长的消息/12:32]\n[<img src=x>/安全文本/12:33]';
                    const chat = [{ name: '主角', is_user: false, mes: content }];
                    window.SillyTavern = { getContext: () => ({ chat, name2: '主角', characterId: 0,
                        characters: [{ name: '主角' }], messageFormatting: text => '<p>' + text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') + '</p>',
                    }) };
                    document.querySelector('#chat').innerHTML = '<div class="mes" mesid="0"><div class="avatar"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"></div><div class="mes_text"></div></div>';
                    const el = document.querySelector('.mes_text');
                    applyFormatRendering(el, { preset, documentRef: document });
                    const headers = [...el.querySelectorAll('.carrot-group-header')];
                    const bubbles = [...el.querySelectorAll('.carrot-ios-bubble, .carrot-avatar-transparent-bubble')];
                    const rects = bubbles.map((b, i) => ({ header: headers[i].getBoundingClientRect().bottom, bubble: b.getBoundingClientRect().top }));
                    return {
                        headers: headers.map(h => h.textContent), count: bubbles.length,
                        body: bubbles[0].textContent, bold: !!bubbles[0].querySelector('strong'),
                        headerInside: bubbles.some(b => !!b.querySelector('.carrot-group-header')),
                        initials: [...el.querySelectorAll('.carrot-group-initial-avatar')].map(a => a.textContent),
                        characterAvatars: el.querySelectorAll('.custom-B_C_avar').length,
                        fallback: el.querySelector('.custom-B_C_avar')?.style.backgroundImage,
                        injectedName: !!headers.at(-1).querySelector('img'),
                        overflow: document.documentElement.scrollWidth > innerWidth,
                        headersAbove: rects.every(r => r.header <= r.bubble),
                        rerenderSkipped: !applyFormatRendering(el, { preset, documentRef: document }),
                    };
                }, { preset });
                assert.equal(result.count, 4, `${preset} ${width}`);
                assert.deepEqual(result.headers, ['主角12:30', '小明12:31', '👩🏽‍💻开发者12:32', '<img src=x>12:33']);
                assert.equal(result.body, '角色消息');
                assert.equal(result.bold, true);
                assert.equal(result.headerInside, false);
                assert.equal(result.headersAbove, true);
                assert.equal(result.injectedName, false);
                assert.equal(result.overflow, false, `${preset} ${width} overflows`);
                assert.equal(result.rerenderSkipped, true);
                if (preset === 'avatarTransparent') {
                    assert.deepEqual(result.initials, ['小', '👩🏽‍💻', '<']);
                    assert.equal(result.characterAvatars, 1);
                    assert.match(result.fallback, /data:image/);
                }
                if (process.env.CARROT_PREVIEW_DIR && width === 393 && ['ios', 'avatarTransparent'].includes(preset)) {
                    await page.screenshot({ path: path.join(process.env.CARROT_PREVIEW_DIR, `carrot-group-${preset}.png`) });
                }
            }
        }
    } finally { await browser.close(); }
});
