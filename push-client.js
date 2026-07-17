// carrot Web Push 前端：Service Worker 注册、订阅管理、触发后端推送
// 订阅需要 HTTPS（或 localhost）；触发推送只是普通 fetch，任何环境都能发

import { jsonRequestHeaders } from './request-headers.js';

const BASE = '/api/plugins/carrot/push';

export function isPushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function swUrl() {
    // 跟随扩展自身的加载路径，query 里带版本号以便浏览器检测 SW 更新
    return new URL('./push-sw.js', import.meta.url);
}

function urlBase64ToUint8Array(base64) {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
    return output;
}

function bufferToB64url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getSwRegistration() {
    const url = swUrl();
    const reg = await navigator.serviceWorker.register(url.pathname + url.search);
    // 浏览器默认最多每 24 小时才自动检查一次 SW 更新，光刷新页面等不到新版生效。
    // 每次拿 registration 时都主动触发一次检查，push-sw.js 改了逻辑（如 renotify）才能及时生效。
    reg.update().catch(() => {});
    return reg;
}

/**
 * 等这个具体的 registration 激活。
 * 不能用 navigator.serviceWorker.ready —— 它只在「有 SW 控制当前页面」时 resolve，
 * 而我们的 SW 注册在扩展子目录、scope 不含主页面 `/`，ready 会永远卡住。
 * push 事件不依赖 SW 是否控制页面，只要这个 registration 激活即可订阅。
 */
function waitForActive(reg) {
    if (reg.active) return Promise.resolve(reg);
    return new Promise((resolve) => {
        const sw = reg.installing || reg.waiting;
        if (!sw) { resolve(reg); return; }
        const onChange = () => {
            if (sw.state === 'activated') {
                sw.removeEventListener('statechange', onChange);
                resolve(reg);
            }
        };
        sw.addEventListener('statechange', onChange);
        if (sw.state === 'activated') {
            sw.removeEventListener('statechange', onChange);
            resolve(reg);
        }
    });
}

/**
 * 拿一个能用来 showNotification 的 SW registration（没有就注册一个）。
 * 用途：桌面 Windows 的 Chrome/Edge 对 new Notification()（非持久化通知）显示很不可靠，
 * 而 registration.showNotification()（持久化通知）稳定 —— Claude/GPT 等站点走的就是后者。
 * push-sw 很轻，不缓存、不拦截请求，仅用于弹通知也没有副作用。
 */
export async function ensureNotifRegistration() {
    if (!('serviceWorker' in navigator)) return null;
    try {
        const regs = await navigator.serviceWorker.getRegistrations();
        const existing = regs.find((r) => r.active && /\/carrot\//.test(r.scope));
        if (existing) {
            existing.update().catch(() => {}); // 同上：顺手触发一次更新检查
            return existing;
        }
        const reg = await getSwRegistration();
        await waitForActive(reg);
        return reg;
    } catch (e) {
        console.warn('[carrot] 获取通知 SW 失败', e);
        return null;
    }
}

/**
 * 开启后端推送：申请通知权限 → 注册 SW → 用后端 VAPID 公钥订阅 → 上报订阅。
 * 失败时抛出带中文说明的 Error。
 */
export async function enableBackendPush() {
    if (!isPushSupported()) {
        if (!window.isSecureContext) {
            throw new Error('当前是 HTTP 直连，浏览器禁用了推送订阅。请用 HTTPS 域名打开酒馆后再开启（开启一次后，其它访问方式也能触发推送）');
        }
        throw new Error('当前浏览器不支持 Web Push。iOS 需 16.4+ 且先「分享 → 添加到主屏幕」，再从主屏幕图标打开酒馆');
    }
    if (Notification.permission !== 'granted') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') throw new Error('通知权限被拒绝，请在浏览器网站设置里允许通知');
    }

    const keyRes = await fetch(`${BASE}/public-key`);
    const keyData = await keyRes.json().catch(() => ({}));
    if (!keyRes.ok || !keyData.key) {
        throw new Error(keyData.error || '获取推送公钥失败，请确认 carrot 后端已启用并同步到 v8.0.23+');
    }

    const reg = await getSwRegistration();
    await waitForActive(reg);

    let sub = await reg.pushManager.getSubscription();
    if (sub) {
        // 后端换过 VAPID 密钥时旧订阅无法使用，重订阅
        const currentKey = sub.options?.applicationServerKey
            ? bufferToB64url(sub.options.applicationServerKey)
            : '';
        if (currentKey && currentKey !== keyData.key) {
            await sub.unsubscribe().catch(() => {});
            sub = null;
        }
    }
    if (!sub) {
        sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(keyData.key),
        });
    }

    const res = await fetch(`${BASE}/subscribe`, {
        method: 'POST',
        headers: jsonRequestHeaders(),
        body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || '订阅上报后端失败');
    return data;
}

/** 关闭后端推送：注销本设备订阅并通知后端删除 */
export async function disableBackendPush() {
    try {
        if (!('serviceWorker' in navigator)) return;
        // 按 scope 找到 carrot 自己的 SW 注册（scope 在扩展子目录，getRegistration() 无参拿不到）
        const swPath = swUrl().pathname;
        const regs = await navigator.serviceWorker.getRegistrations();
        const reg = regs.find((r) => swPath.startsWith(new URL(r.scope).pathname));
        const sub = await reg?.pushManager?.getSubscription();
        if (sub) {
            await fetch(`${BASE}/unsubscribe`, {
                method: 'POST',
                headers: jsonRequestHeaders(),
                body: JSON.stringify({ endpoint: sub.endpoint }),
            }).catch(() => {});
            await sub.unsubscribe().catch(() => {});
        }
    } catch (e) {
        console.warn('[carrot] 注销推送订阅失败', e);
    }
}

/**
 * 启动时静默恢复订阅：清缓存会注销 Service Worker，这里自动重建。
 * 权限未授予/环境不支持时静默跳过，不打扰用户。
 */
export async function resyncBackendPush() {
    if (!isPushSupported()) return false;
    if (Notification.permission !== 'granted') return false;
    try {
        await enableBackendPush();
        return true;
    } catch (e) {
        console.warn('[carrot] 恢复推送订阅失败', e);
        return false;
    }
}

/**
 * 让后端向所有已订阅设备发一条推送。
 * keepalive 保证页面正在被关闭时请求也能发出去。
 */
export async function sendBackendPush(title, body, tag) {
    try {
        const res = await fetch(`${BASE}/notify`, {
            method: 'POST',
            headers: jsonRequestHeaders(),
            body: JSON.stringify({ title, body, tag: tag || 'carrot-push' }),
            keepalive: true,
        });
        return await res.json().catch(() => null);
    } catch (e) {
        console.warn('[carrot] 触发后端推送失败', e);
        return null;
    }
}
