// Web Push 订阅管理与推送路由
// 密钥和订阅持久化在 plugin 目录下 push-data/（sync-plugin 复制时会跳过该目录）

const fs = require('fs');
const path = require('path');
const { generateVapidKeys, sendWebPush } = require('./web-push');

const DATA_DIR = path.join(__dirname, 'push-data');
const VAPID_FILE = path.join(DATA_DIR, 'vapid.json');
const SUBS_FILE = path.join(DATA_DIR, 'subscriptions.json');
const MAX_SUBS = 8; // 最多保留 8 个设备订阅，超出淘汰最旧的

function loadJson(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return fallback;
    }
}

function saveJson(file, data) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getVapid() {
    let vapid = loadJson(VAPID_FILE, null);
    if (!vapid?.publicKey || !vapid?.privateJwk) {
        vapid = generateVapidKeys();
        saveJson(VAPID_FILE, vapid);
        console.log('[carrot-plugin] 已生成 Web Push VAPID 密钥');
    }
    return vapid;
}

const loadSubs = () => loadJson(SUBS_FILE, []);
const saveSubs = (subs) => saveJson(SUBS_FILE, subs);

function publicKey(req, res) {
    try {
        res.json({ ok: true, key: getVapid().publicKey });
    } catch (e) {
        res.status(500).json({ ok: false, error: e?.message || '生成推送密钥失败' });
    }
}

function subscribe(req, res) {
    const sub = req.body?.subscription;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
        return res.status(400).json({ ok: false, error: '订阅数据不完整' });
    }
    let subs = loadSubs().filter((item) => item.endpoint !== sub.endpoint);
    subs.push({ endpoint: sub.endpoint, keys: sub.keys, addedAt: Date.now() });
    if (subs.length > MAX_SUBS) {
        subs.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
        subs = subs.slice(subs.length - MAX_SUBS);
    }
    saveSubs(subs);
    res.json({ ok: true, count: subs.length });
}

function unsubscribe(req, res) {
    const endpoint = req.body?.endpoint;
    if (!endpoint) return res.status(400).json({ ok: false, error: '缺少 endpoint' });
    const subs = loadSubs().filter((item) => item.endpoint !== endpoint);
    saveSubs(subs);
    res.json({ ok: true, count: subs.length });
}

// 核心推送逻辑，供 express handler 和其他模块（如 proactive.js）直接调用
async function sendToAllSubscriptions(payload) {
    const subs = loadSubs();
    if (!subs.length) {
        return { ok: false, sent: 0, error: '没有已订阅的设备，请先在通知设置里开启后端推送' };
    }
    const vapid = getVapid();
    const results = await Promise.allSettled(subs.map((sub) => sendWebPush(sub, payload, vapid)));

    let sent = 0;
    const dead = new Set();
    results.forEach((result, i) => {
        if (result.status === 'fulfilled' && result.value.ok) {
            sent++;
            return;
        }
        const host = (() => { try { return new URL(subs[i].endpoint).host; } catch { return '?'; } })();
        if (result.status === 'rejected') {
            console.warn('[carrot-plugin] Web Push 发送异常', host, result.reason?.message);
        } else {
            console.warn('[carrot-plugin] Web Push 发送失败', host, result.value.status, result.value.body);
        }
        if (result.status === 'fulfilled' && [400, 403, 404, 410].includes(result.value.status)) {
            // 订阅已过期/被撤销，从存储里清掉
            dead.add(subs[i].endpoint);
        }
    });
    if (dead.size) {
        saveSubs(subs.filter((sub) => !dead.has(sub.endpoint)));
    }
    return { ok: true, sent, failed: subs.length - sent, removed: dead.size };
}

async function notify(req, res) {
    const payload = {
        title: String(req.body?.title || 'AI 回复完成'),
        body: String(req.body?.body || ''),
        tag: String(req.body?.tag || 'carrot-push'),
    };
    const result = await sendToAllSubscriptions(payload);
    res.json(result);
}

module.exports = {
    publicKey,
    subscribe,
    unsubscribe,
    notify,
    sendToAllSubscriptions,
};
