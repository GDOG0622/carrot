const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

function backend(send = true) {
    const requests = [], appended = [], intervals = new Map();
    let timerId = 0;
    const ctx = vm.createContext({
        module: { exports: {} }, require, console, URL, __dirname: path.join(root, 'plugin'), appended,
        setInterval(fn) { intervals.set(++timerId, fn); return timerId; },
        clearInterval(id) { intervals.delete(id); },
        async fetch(url, options) {
            const body = JSON.parse(options.body);
            requests.push(body);
            return { ok: true, json: async () => ({ choices: [{ message: { content:
                body.response_format ? JSON.stringify({ send, reason: '判断理由' }) : '"生成正文"',
            } }] }) };
        },
    });
    vm.runInContext(read('plugin/proactive.js') + `
        loadCharCard = () => ({ name: '角色甲', description: '角色描述', personality: '角色性格', scenario: '场景信息' });
        resolvePersona = () => ({ name: '用户乙', description: '用户人设' });
        loadRecentContext = () => [{ role: 'user', content: '历史消息' }];
        resolveChatFile = () => 'fixture.jsonl';
        readChatMetadata = () => ({ variables: {} });
        readGlobalVariables = () => ({});
        resolveApiConnection = () => ({ apiUrl: 'https://fixture.invalid', profileModel: 'test' });
        appendMessage = (...args) => appended.push(args);
    `, ctx);
    return { api: ctx.module.exports, requests, appended, intervals };
}
const scheme = { id: 's', enabled: true, charName: '角色甲', mode: 'probability', probability: 100, intervalMinutes: 60 };

test('generation uses fixed context and editable trigger after history; legacy global prompt is ignored', async () => {
    const { api, requests } = backend();
    await api.runScheme('u', { globalPrompt: '旧模板不应生效', triggerPrompt: 'BUNNY：{{char}} 找 {{user}}\n<div>&amp;</div>' }, scheme);
    const messages = requests[0].messages;
    assert.deepEqual(messages.map(m => m.role), ['system', 'user', 'user']);
    assert.match(messages[0].content, /\[Light Slumber\]/);
    for (const text of ['角色描述', '角色性格', '用户人设', '场景信息', '[Temporal_Logic]', 'Instant Messaging Mode']) {
        assert.ok(messages[0].content.includes(text));
    }
    assert.doesNotMatch(messages[0].content, /旧模板不应生效|判断准则|BUNNY思考准则|bunnyhole_world_logic/);
    assert.equal(messages[1].content, '历史消息');
    assert.equal(messages[2].content, '+BUNNY：角色甲 找 用户乙\n<div>&amp;</div>+');
});

test('AI judgment and generation remain separate requests', async () => {
    const { api, requests } = backend();
    await api.runScheme('u', { triggerPrompt: '自定义触发词' }, { ...scheme, mode: 'ai' });
    assert.equal(requests.length, 2);
    assert.equal(requests[0].response_format.type, 'json_object');
    assert.match(requests[0].messages[0].content, /Light Slumber[\s\S]*用户人设[\s\S]*判断准则/);
    assert.doesNotMatch(JSON.stringify(requests[0]), /Instant Messaging Mode|自定义触发词/);
    assert.doesNotMatch(JSON.stringify(requests[1]), /判断准则|判断理由/);
    assert.equal(requests[1].messages.at(-1).content, '+自定义触发词+');
});

test('negative judgment sends no message; missing trigger falls back but explicit empty stays empty', async () => {
    const no = backend(false);
    await no.api.runScheme('u', {}, { ...scheme, mode: 'ai' });
    assert.equal(no.requests.length, 1);
    assert.equal(no.appended.length, 0);
    const yes = backend();
    let defaults;
    yes.api.defaultsHandler({}, { json(data) { defaults = data; } });
    assert.ok(defaults.triggerPrompt.startsWith('BUNNY：'));
    await yes.api.runScheme('u', {}, scheme);
    assert.match(yes.requests[0].messages.at(-1).content, /^\+BUNNY：现在是/);
    await yes.api.runScheme('u', { triggerPrompt: '' }, scheme);
    assert.equal(yes.requests[1].messages.at(-1).content, '++');
});

test('updating trigger preserves timer and next run uses latest text', async () => {
    const { api, intervals, requests } = backend();
    const start = api.makeStartHandler();
    const res = { json() {} };
    const config = { stUser: 'u', enabled: true, schemes: [scheme], triggerPrompt: '旧' };
    start({ body: config }, res);
    const [id, tick] = [...intervals][0];
    start({ body: { ...config, triggerPrompt: '新' } }, res);
    assert.equal(intervals.size, 1);
    assert.equal(intervals.get(id), tick);
    await tick();
    assert.equal(requests[0].messages.at(-1).content, '+新+');
    api.stopHandler({ body: { stUser: 'u' } }, res);
    assert.equal(intervals.size, 0);
});

// Minimal DOM fixture exercises the real panel event handlers without a running Tavern.
async function frontend({ saved, oldBackend = false, failPost = false } = {}) {
    const elements = new Map(), timers = new Map(), posts = [];
    let saves = 0, id = 0;
    function element(selector) {
        if (!elements.has(selector)) elements.set(selector, {
            value: '', textContent: '', events: {},
            addEventListener(name, fn) { this.events[name] = fn; },
        });
        return elements.get(selector);
    }
    const container = { innerHTML: '', querySelector: element };
    const p = { enabled: true, stUser: 'u', schemes: [], globalPrompt: '旧模板', ...saved };
    const ctx = vm.createContext({
        document: { getElementById: () => container }, console: { warn() {} },
        getSettings: () => ({ proactive: p }), saveSettings: () => saves++, jsonRequestHeaders: () => ({}),
        setTimeout(fn) { timers.set(++id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
        async fetch(url, options = {}) {
            if (options.method === 'POST') {
                posts.push(JSON.parse(options.body));
                if (failPost) throw new Error('离线');
                return { ok: true, json: async () => ({ ok: true }) };
            }
            if (url.endsWith('/defaults')) return { ok: !oldBackend, status: 404, json: async () => ({ triggerPrompt: 'BUNNY：默认 {{char}}' }) };
            return { ok: true, json: async () => ({ users: ['u'], chars: [], profiles: [] }) };
        },
    });
    const source = read('proactive.js').replace(/^import .*;\r?\n/gm, '').replace('export function initProactive', 'function initProactive');
    vm.runInContext(source + '\ninitProactive();', ctx);
    await settle();
    return { p, posts, container, element, saves: () => saves, async flush() {
        const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); await settle();
    } };
}

test('front input shows defaults, preserves literal HTML and syncs on input without blur', async () => {
    const f = await frontend();
    const input = f.element('#cip-proactive-trigger-prompt');
    assert.equal(input.value, 'BUNNY：默认 {{char}}');
    const value = '</textarea><div>文字 &amp;</div>\n{{char}}';
    input.events.input({ target: { value } });
    assert.equal(f.p.triggerPrompt, value);
    assert.ok(f.saves() > 0);
    assert.ok(!f.container.innerHTML.includes(value));
    await f.flush();
    assert.equal(f.posts.length, 1);
    assert.equal(f.posts[0].triggerPrompt, value);
    assert.match(f.element('#cip-proactive-prompt-status').textContent, /已同步/);
    const reopened = await frontend({ saved: { triggerPrompt: value } });
    assert.equal(reopened.element('#cip-proactive-trigger-prompt').value, value);
});

test('explicit empty is retained; old backend and sync failure are visible', async () => {
    const empty = await frontend({ saved: { triggerPrompt: '' } });
    assert.equal(empty.element('#cip-proactive-trigger-prompt').value, '');
    const old = await frontend({ oldBackend: true });
    assert.match(old.container.innerHTML, /rows="8" disabled/);
    assert.match(old.element('#cip-proactive-prompt-status').textContent, /同步后端/);
    await old.flush();
    assert.equal(old.posts.length, 0);
    old.element('#cip-proactive-enabled').events.change({ target: { checked: false } });
    await old.flush();
    assert.equal(old.posts.length, 1);
    assert.equal(old.posts[0].enabled, false);
    const failed = await frontend({ failPost: true });
    await failed.flush();
    assert.match(failed.element('#cip-proactive-prompt-status').textContent, /同步失败/);
});
