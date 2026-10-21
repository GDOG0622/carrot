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
const parse = (text, user = false) => JSON.parse(JSON.stringify(ctx.parseTokens(text, user)));

test('quoted replies distinguish speaker syntax and preserve original remainder', () => {
    for (const [user, open, close] of [[false, '"', '"'], [true, '“', '”']]) {
        assert.deepEqual(parse(`${open}回复>原文>后续${close}`, user), [{ type: 'textBubble', body: '回复', quote: '原文>后续' }]);
        assert.deepEqual(parse(`${open}回复\n第二行>原文\n后续${close}`, user), [{ type: 'textBubble', body: '回复\n第二行', quote: '原文\n后续' }]);
        assert.equal(parse(`${open}普通消息${close}`, user)[0].quote, undefined);
        assert.equal(parse(`${open}回复>${close}`, user)[0].quote, undefined);
        assert.equal(parse(`${open}<b>正文</b>${close}`, user)[0].type, 'htmlBlock');
    }
    assert.equal(parse('“回复>原文”'), null);
    assert.equal(parse('"回复>原文"', true), null);
    assert.equal(parse('"回复>原文"\n"下一条"').length, 2);
    assert.equal(parse('"未闭合\n"正常>原文"')[1].quote, '原文');
});

let chromium;
try { ({ chromium } = require(process.env.CARROT_PLAYWRIGHT_MODULE || 'playwright')); } catch {}
test('browser: reply selection, composer, native formatting and every preset', {
    skip: !chromium && 'Set CARROT_PLAYWRIGHT_MODULE',
}, async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        const page = await browser.newPage();
        await page.setContent('<main id="chat"></main><div id="cip-input-panel"><div id="cip-reply-preview" hidden><blockquote id="cip-reply-text"></blockquote><button id="cip-reply-cancel">×</button></div><textarea id="cip-main-input"></textarea></div>');
        await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'style.css'), 'utf8') });
        await page.addScriptTag({ content: source });
        await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'quote-reply.js'), 'utf8').replace(/^export /gm, '') });
        await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'ui.js'), 'utf8').replace(/^export /gm, '') });
        await page.evaluate(() => {
            document.querySelector('#cip-input-panel').remove();
            document.body.appendChild(createUI().inputPanel);
            window.SillyTavern = { getContext: () => ({ eventTypes: { CHAT_CHANGED: 'chat_changed' }, eventSource: { on: (_, callback) => window.changeChat = callback }, chat: window.chatMessages, messageFormatting: text => '<p>' + text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') + '</p>' }) };
            window.composer = initQuoteReply({ inputPanel: document.querySelector('#cip-input-panel'), mainInput: document.querySelector('textarea'), showPanel: () => document.querySelector('#cip-input-panel').classList.add('active'), switchTextSubType: type => window.composer.setType(type) });
        });
        for (const width of [320, 393, 1280]) {
            await page.setViewportSize({ width, height: 800 });
            for (const preset of ['ios', 'avatarTransparent', 'custom_test']) {
                const result = await page.evaluate(preset => {
                    window.chatMessages = [{ is_user: false, mes: '"回复>**原文**"' }, { is_user: true, mes: '“用户回复>原文”' }];
                    document.querySelector('#chat').innerHTML = window.chatMessages.map((_, i) => `<div class="mes" mesid="${i}"><div class="mes_text"></div></div>`).join('');
                    document.querySelectorAll('.mes_text').forEach(el => applyFormatRendering(el, { preset, documentRef: document }));
                    const bubble = document.querySelector('[data-carrot-reply-body]');
                    const quote = document.querySelector('.carrot-reply-quote');
                    return { count: document.querySelectorAll('[data-carrot-reply-body]').length, text: bubble.dataset.carrotReplyBody,
                        bold: !!quote.querySelector('strong'), below: quote.getBoundingClientRect().top >= bubble.getBoundingClientRect().bottom,
                        overflow: document.documentElement.scrollWidth > innerWidth };
                }, preset);
                assert.deepEqual(result, { count: 1, text: '回复', bold: true, below: true, overflow: false });
                await page.locator('[data-carrot-reply-body]').click();
                await page.locator('.cip-reply-menu').click();
                assert.equal(await page.locator('#cip-reply-text').textContent(), '回复');
                assert.equal(await page.evaluate(() => window.composer.content('新的回复')), '新的回复>回复');
                assert.equal(await page.locator('textarea').evaluate(el => el === document.activeElement), true);
                if (process.env.CARROT_PREVIEW_DIR && width === 393 && preset === 'ios') {
                    await page.locator('#cip-main-input').fill('这是我的回复');
                    await page.screenshot({ path: path.join(process.env.CARROT_PREVIEW_DIR, 'carrot-quote-reply.png') });
                }
                await page.locator('#cip-reply-cancel').click();
                assert.equal(await page.evaluate(() => window.composer.content('普通')), '普通');
                await page.locator('[data-carrot-reply-body]').click();
                await page.locator('.cip-reply-menu').click();
                await page.evaluate(() => window.changeChat());
                assert.equal(await page.evaluate(() => window.composer.content('新聊天')), '新聊天');
            }
        }
    } finally { await browser.close(); }
});
