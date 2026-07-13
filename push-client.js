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
    return navigator.serviceWorker.register(url.pathname + url.search);
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
    await navigator.serviceWorker.ready;

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
        const reg = await navigator.serviceWorker.getRegistration(swUrl().pathname);
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
