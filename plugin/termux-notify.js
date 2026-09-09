// Only native Termux on this device; do not infer Termux from an Android browser.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

function isTermux() {
    return ['android', 'linux'].includes(process.platform)
        && /^\/data\/data\/[^/]*termux[^/]*\/files\/usr\/?$/.test(process.env.PREFIX || '')
        && process.execPath.startsWith(`${process.env.PREFIX.replace(/\/$/, '')}/`);
}

function isLocalRequest(req) {
    const peer = req.socket?.remoteAddress;
    const host = String(req.headers?.host || '').toLowerCase();
    return isTermux()
        && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer)
        && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)
        && !req.headers?.forwarded && !req.headers?.['x-forwarded-for'];
}

function command() {
    return path.join(process.env.PREFIX || '', 'bin', 'termux-notification');
}

const setupHelp = 'Google Play 版 Termux 2026.02.11 及以上已内置通知支持，无需额外 App；缺少命令时请更新 Termux 及其软件包。GitHub/F-Droid 版需同来源的 Termux:API 应用及 pkg install termux-api。请允许对应应用的安卓通知权限';

function checkReady() {
    if (!isTermux()) throw new Error('当前后端不是原生 Termux');
    try { fs.accessSync(command(), fs.constants.X_OK); }
    catch { throw new Error(`未找到 termux-notification。${setupHelp}`); }
}

async function send(payload) {
    checkReady();
    const clean = (value, max) => String(value || '').replace(/\0/g, '').slice(0, max);
    // No shell, actions or interpolated command text: message content is data only.
    const args = ['--title', clean(payload.title || 'AI 回复完成', 256),
        '--content', clean(payload.body, 4096), '--id', clean(payload.tag || 'carrot-push', 128),
        '--priority', 'high', '--sound'];
    await new Promise((resolve, reject) => {
        execFile(command(), args, { timeout: 10000, maxBuffer: 16384, encoding: 'utf8' }, (error, stdout) => {
            if (error || /"error"\s*:|permission denied|exception/i.test(stdout || '')) {
                reject(new Error(`Termux 本地通知调用失败${error?.killed ? '（超时）' : ''}。${setupHelp}`));
            } else resolve();
        });
    });
    // Command acceptance does not prove Android displayed the notification.
    return { ok: true, sent: 1, mode: 'termux-local' };
}

module.exports = { isTermux, isLocalRequest, checkReady, send };
