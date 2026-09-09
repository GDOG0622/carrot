const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function moduleWith(file, overrides) {
    const sandbox = { module: { exports: {} }, console, URL, __dirname: path.join(root, 'plugin'),
        require: (id) => overrides[id] || require(id), ...overrides.globals };
    vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
    return sandbox.module.exports;
}

function termuxFixture({ platform = 'android', prefix = '/data/data/com.termux/files/usr', missing = false, failure = null } = {}) {
    const calls = [];
    const api = moduleWith('plugin/termux-notify.js', {
        globals: { process: { platform, env: { PREFIX: prefix }, execPath: `${prefix}/bin/node` } },
        fs: { constants: { X_OK: 1 }, accessSync() { if (missing) throw new Error('ENOENT'); } },
        child_process: { execFile(command, args, options, callback) { calls.push({ command, args, options }); callback(failure, ''); } },
    });
    return { api, calls };
}
const localReq = () => ({ socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'localhost:8000' }, body: {} });

test('only native Termux plus direct loopback request selects local notifications', () => {
    const { api } = termuxFixture();
    assert.equal(api.isLocalRequest(localReq()), true);
    for (const host of ['localhost:8000', '127.0.0.1:8000', '[::1]:8000']) {
        const req = localReq(); req.headers.host = host; assert.equal(api.isLocalRequest(req), true);
    }
    for (const host of ['example.com', '192.168.1.2:8000', 'localhost.evil.test']) {
        const req = localReq(); req.headers.host = host; assert.equal(api.isLocalRequest(req), false);
    }
    const remote = localReq(); remote.socket.remoteAddress = '192.168.1.8';
    assert.equal(api.isLocalRequest(remote), false);
    const proxy = localReq(); proxy.headers['x-forwarded-for'] = '192.168.1.8';
    assert.equal(api.isLocalRequest(proxy), false);
    assert.equal(termuxFixture({ platform: 'win32' }).api.isLocalRequest(localReq()), false);
    assert.equal(termuxFixture({ platform: 'linux', prefix: '/usr' }).api.isLocalRequest(localReq()), false);
});

test('notification text remains data, uses bounded execFile, and reports dependency/call failures', async () => {
    const { api, calls } = termuxFixture();
    const text = '中文 "quotes" $(touch /tmp/no) `id` ; &\n--action evil';
    const result = await api.send({ title: text, body: text });
    assert.equal(result.mode, 'termux-local');
    assert.equal(calls[0].args[1], text);
    assert.equal(calls[0].args[3], text);
    assert.equal(calls[0].options.shell, undefined);
    assert.equal(calls[0].options.timeout, 10000);
    await assert.rejects(termuxFixture({ missing: true }).api.send({}), /pkg install termux-api/);
    await assert.rejects(termuxFixture({ failure: { killed: true } }).api.send({}), /超时/);
});

function pushFixture() {
    const files = new Map();
    const calls = { local: 0, web: 0 };
    const termux = termuxFixture().api;
    const disk = { readFileSync(file) { if (!files.has(file)) throw new Error('ENOENT'); return files.get(file); },
        mkdirSync() {}, writeFileSync(file, value) { files.set(file, value); } };
    const load = () => moduleWith('plugin/push.js', { fs: disk, './termux-notify': {
        ...termux, send: async () => { calls.local++; return { ok: true, sent: 1, mode: 'termux-local' }; },
    }, './web-push': { generateVapidKeys: () => ({ publicKey: 'mock', privateJwk: {} }),
        sendWebPush: async () => { calls.web++; return { ok: true }; } } });
    return { api: load(), load, calls };
}
async function invoke(handler, req) {
    let value, status = 200;
    await handler(req, { status(code) { status = code; return this; }, json(data) { value = data; } });
    return { status, value };
}

test('local test sends no Web Push; remote access stays Web Push; persisted proactive channel respects disable', async () => {
    const { api, load, calls } = pushFixture();
    const req = localReq(); req.body = { enabled: true };
    assert.equal((await invoke(api.localSettings, req)).value.ok, true);
    api.subscribe({ body: { subscription: { endpoint: 'https://example.test/push', keys: { p256dh: 'a', auth: 'b' } } } }, { json() {} });
    await invoke(api.notify, localReq());
    assert.deepEqual(calls, { local: 1, web: 0 });
    const remote = localReq(); remote.headers.host = 'remote.example';
    await invoke(api.notify, remote);
    assert.deepEqual(calls, { local: 1, web: 1 });
    remote.body = { enabled: false };
    assert.equal((await invoke(api.localSettings, remote)).status, 403);
    await load().sendToAllSubscriptions({ title: 'proactive after restart' });
    assert.deepEqual(calls, { local: 2, web: 2 });
    req.body.enabled = false;
    await invoke(api.localSettings, req);
    assert.equal((await invoke(api.notify, localReq())).value.ok, false);
    await load().sendToAllSubscriptions({});
    assert.deepEqual(calls, { local: 2, web: 3 });
});

function clientFixture(mode = 'termux-local', hostname = 'localhost') {
    const calls = [];
    let removed = false;
    const sub = { endpoint: 'https://example.test/old', unsubscribe: async () => { removed = true; } };
    const source = fs.readFileSync(path.join(root, 'push-client.js'), 'utf8')
        .replace(/^import .*;\r?\n/m, '').replace(/export /g, '')
        .replace(/import\.meta\.url/g, "'http://localhost/scripts/extensions/carrot/push-client.js'");
    const sandbox = { URL, console, jsonRequestHeaders: () => ({}),
        window: { location: { hostname } },
        navigator: { serviceWorker: { getRegistrations: async () => [{ scope: 'http://localhost/scripts/extensions/carrot/',
            pushManager: { getSubscription: async () => removed ? null : sub } }] } },
        fetch: async (url, options) => {
            calls.push({ url, options });
            return { ok: true, status: 200, json: async () => ({ ok: true, mode, count: 1 }) };
        } };
    vm.runInNewContext(source, sandbox);
    return { api: sandbox, calls, removed: () => removed };
}

test('Termux enable and startup restore work without browser Notification/PushManager and remove old subscription', async () => {
    const { api, calls, removed } = clientFixture();
    assert.equal((await api.enableBackendPush()).mode, 'termux-local');
    assert.equal(removed(), true);
    assert.equal(calls.some(c => /public-key|\/subscribe$/.test(c.url)), false);
    assert.equal(await api.resyncBackendPush(), true);
    await api.disableBackendPush();
    const states = calls.filter(c => c.url.endsWith('/local')).map(c => JSON.parse(c.options.body).enabled);
    assert.deepEqual(states, [true, true, false]);
});

test('remote browser retains Web Push mode without attempting local detection', async () => {
    const { api, calls } = clientFixture('termux-local', 'my-vps.example');
    assert.equal(await api.getBackendPushMode(), 'webpush');
    assert.equal(calls.length, 0);
});

test('overlapping disable and enable execute in order', async () => {
    const { api, calls } = clientFixture();
    await Promise.all([api.disableBackendPush(), api.enableBackendPush()]);
    assert.deepEqual(calls.filter(c => c.url.endsWith('/local')).map(c => JSON.parse(c.options.body).enabled), [false, true]);
});

test('startup restore cannot overtake a subsequent disable', async () => {
    const { api, calls } = clientFixture();
    await Promise.all([api.resyncBackendPush(), api.disableBackendPush()]);
    assert.deepEqual(calls.filter(c => c.url.endsWith('/local')).map(c => JSON.parse(c.options.body).enabled), [true, false]);
});

test('remote Web Push still fetches VAPID key and uploads browser subscription', async () => {
    const { api } = clientFixture('webpush', 'my-vps.example');
    const calls = [];
    api.window.PushManager = {};
    api.window.Notification = {};
    api.Notification = { permission: 'granted' };
    api.navigator.serviceWorker.register = async () => ({ active: {}, update: async () => {},
        pushManager: { getSubscription: async () => ({ options: {}, toJSON: () => ({ endpoint: 'https://push.example/device' }) }) } });
    api.fetch = async (url, options) => {
        calls.push(url);
        if (url.endsWith('/public-key')) return { ok: true, json: async () => ({ key: 'mock' }) };
        assert.equal(JSON.parse(options.body).subscription.endpoint, 'https://push.example/device');
        return { ok: true, json: async () => ({ ok: true, count: 1 }) };
    };
    assert.equal((await api.enableBackendPush()).ok, true);
    assert.deepEqual(calls, ['/api/plugins/carrot/push/public-key', '/api/plugins/carrot/push/subscribe']);
});
