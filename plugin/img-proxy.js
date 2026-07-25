// 猫箱（catbox.moe）等图床的流式透明代理
// 目的：浏览器端不再需要直连 catbox，由跑 carrot 后端的这台机器代为中转
// 不落盘、不常驻内存缓存——每次都是边下边转发，服务器不会因为图多了占空间/爆内存
// 只代理白名单域名，避免变成开放 SSRF 代理

const https = require('https');
const path = require('path');
const { getProxyAgent } = require('./proxy-agent');

const MAX_BYTES = 30 * 1024 * 1024; // 单文件 30MB 上限（只是转发时的限速阀，不落盘）
const DIRECT_TIMEOUT_MS = 6000;     // 服务器直连 catbox 的探测超时：连不上就别让用户等太久，赶紧走兜底
const FALLBACK_TIMEOUT_MS = 15000;
const CIRCUIT_BREAK_MS = 5 * 60 * 1000; // 直连失败后 5 分钟内不再重试直连，避免每张图都白等一次超时

const ALLOWED_HOSTS = new Set([
    'catbox.moe',
    'files.catbox.moe',
    'litterbox.catbox.moe',
]);

// wsrv.nl（原 images.weserv.nl）：免注册免配置的公共图片中转，国内前端圈常用它代理
// imgur 等被墙图床。只认图片格式，不支持 mp4/webm 之类视频文件。
const WSRV_SUPPORTED_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.svg']);

// carrot 全体用户共享的中转（plugin/relay-worker.js 部署在 Cloudflare Workers 上）：
// 不挑格式，图片/gif/mp4/webm 都能转发，是 wsrv.nl 覆盖不到的部分（尤其是视频）的关键兜底。
// CARROT_RELAY_URL 环境变量可以覆盖成自己的部署（比如担心共享额度被占满）。
const RELAY_URL = process.env.CARROT_RELAY_URL || 'https://carrot-catbox-relay.bunnyj0622.workers.dev';

function extFromType(ctype, urlPath = '') {
    const lower = String(ctype || '').toLowerCase();
    if (lower.includes('png')) return '.png';
    if (lower.includes('webp')) return '.webp';
    if (lower.includes('gif')) return '.gif';
    if (lower.includes('jpeg') || lower.includes('jpg')) return '.jpg';
    if (lower.includes('svg')) return '.svg';
    if (lower.includes('mp4')) return '.mp4';
    if (lower.includes('webm')) return '.webm';
    if (lower.includes('woff2')) return '.woff2';
    if (lower.includes('woff')) return '.woff';
    if (lower.includes('font-sfnt') || lower.includes('truetype')) return '.ttf';
    if (lower.includes('font-otf') || lower.includes('opentype')) return '.otf';
    if (lower.includes('mpeg') || lower.includes('mp3')) return '.mp3';
    if (lower.includes('wav')) return '.wav';
    if (lower.includes('ogg')) return '.ogg';
    const ext = path.extname(urlPath).toLowerCase();
    if (/^\.(png|jpe?g|webp|gif|svg|bmp|tiff|mp4|webm|woff2?|ttf|otf|mp3|wav|ogg)$/.test(ext)) return ext === '.jpeg' ? '.jpg' : ext;
    return '';
}

function contentTypeFromExt(ext) {
    switch (ext) {
        case '.png': return 'image/png';
        case '.webp': return 'image/webp';
        case '.gif': return 'image/gif';
        case '.jpg': return 'image/jpeg';
        case '.svg': return 'image/svg+xml';
        case '.bmp': return 'image/bmp';
        case '.tiff': return 'image/tiff';
        case '.mp4': return 'video/mp4';
        case '.webm': return 'video/webm';
        case '.woff2': return 'font/woff2';
        case '.woff': return 'font/woff';
        case '.ttf': return 'font/ttf';
        case '.otf': return 'font/otf';
        case '.mp3': return 'audio/mpeg';
        case '.wav': return 'audio/wav';
        case '.ogg': return 'audio/ogg';
        default: return '';
    }
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// 服务器直连 catbox 是不是已知连不上（简单熔断，避免每张图都白等一遍超时）
let directBrokenUntil = 0;
function shouldTryDirect() {
    return Date.now() >= directBrokenUntil;
}
function markDirectResult(ok) {
    directBrokenUntil = ok ? 0 : Date.now() + CIRCUIT_BREAK_MS;
}

/**
 * 边下边转发：不整段缓冲进内存，也不落盘。头部（Content-Type/长度上限）确认后
 * 直接 upstream.pipe(res)。
 * 一旦开始往 res 写字节（headersSent），失败就不能再切换链路了，只能直接结束。
 */
function streamThrough(targetUrl, res, { agent, timeoutMs, redirectsLeft = 5 } = {}) {
    return new Promise((resolve, reject) => {
        let u;
        try { u = new URL(targetUrl); } catch (e) { return reject(e); }

        const req = https.request({
            hostname: u.hostname,
            port: u.port || 443,
            path: `${u.pathname}${u.search}`,
            method: 'GET',
            headers: { 'User-Agent': USER_AGENT },
            agent,
            timeout: timeoutMs,
        }, (upRes) => {
            const status = upRes.statusCode || 0;

            if (status >= 300 && status < 400 && upRes.headers.location && redirectsLeft > 0) {
                upRes.resume();
                const next = new URL(upRes.headers.location, targetUrl).toString();
                resolve(streamThrough(next, res, { agent, timeoutMs, redirectsLeft: redirectsLeft - 1 }));
                return;
            }
            if (status < 200 || status >= 300) {
                upRes.resume();
                return reject(new Error(`upstream status ${status}`));
            }

            const ctype = upRes.headers['content-type'] || '';
            const ext = extFromType(ctype, u.pathname);
            res.setHeader('Content-Type', contentTypeFromExt(ext) || ctype || 'application/octet-stream');
            res.setHeader('Cache-Control', 'public, max-age=604800, immutable');

            let total = 0;
            let overflowed = false;
            upRes.on('data', (chunk) => {
                total += chunk.length;
                if (!overflowed && total > MAX_BYTES) {
                    overflowed = true;
                    req.destroy(new Error('response too large'));
                    try { res.end(); } catch {} // pipe 被中断收不到干净的 end，手动收尾避免连接挂住
                    reject(new Error('response too large'));
                }
            });
            upRes.pipe(res);
            upRes.once('end', () => { if (!overflowed) resolve(); });
            upRes.once('error', (e) => { if (!overflowed) reject(e); });
        });
        req.on('timeout', () => req.destroy(new Error('request timeout')));
        req.on('error', reject);
        req.end();
    });
}

/**
 * GET /api/plugins/carrot/img-proxy?url=<catbox 直链>
 * 白名单域名内边下边转发，浏览器端不再需要直连 catbox。按顺序试：
 *   1. 服务器直连（配了 CARROT_IMG_PROXY 就走那条隧道）
 *   2. carrot 共享中转（RELAY_URL，不挑格式，包括视频）
 *   3. wsrv.nl（免配置公共中转，仅图片格式）
 * 前一步已经开始往浏览器传字节了就不会再切下一步——那种情况下要么整个传完，要么传一半断掉，
 * 没法再换一条链路重新来。
 */
async function proxy(req, res) {
    const raw = String(req.query.url || '');
    if (!raw) return res.status(400).send('missing url');

    let parsed;
    try { parsed = new URL(raw); } catch { return res.status(400).send('invalid url'); }
    if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
        return res.status(403).send('host not allowed');
    }

    const agent = getProxyAgent() || undefined; // 配了出站代理就走隧道，没配就走服务器自己的网络
    const ext = extFromType('', parsed.pathname);

    const attempts = [];
    if (agent || shouldTryDirect()) {
        attempts.push({
            label: '直连',
            run: () => streamThrough(parsed.toString(), res, { agent, timeoutMs: agent ? FALLBACK_TIMEOUT_MS : DIRECT_TIMEOUT_MS }),
            onResult: markDirectResult,
        });
    }
    if (RELAY_URL) {
        attempts.push({
            label: 'carrot 共享中转',
            run: () => streamThrough(`${RELAY_URL}?url=${encodeURIComponent(parsed.toString())}`, res, { timeoutMs: FALLBACK_TIMEOUT_MS }),
        });
    }
    if (WSRV_SUPPORTED_EXT.has(ext)) {
        attempts.push({
            label: 'wsrv.nl',
            run: () => streamThrough(`https://wsrv.nl/?url=${encodeURIComponent(parsed.hostname + parsed.pathname)}`, res, { timeoutMs: FALLBACK_TIMEOUT_MS }),
        });
    }

    for (const attempt of attempts) {
        try {
            // streamThrough 内部 upRes.pipe(res) 会在传完后自动 res.end()，这里不用再调一次
            await attempt.run();
            attempt.onResult?.(true);
            return;
        } catch (e) {
            attempt.onResult?.(false);
            if (res.headersSent) { try { res.end(); } catch {} return; } // 已经开始转发字节了，不能再改道；出错时手动收尾，避免连接挂着不结束
            console.warn(`[carrot img-proxy] ${attempt.label}失败`, e?.message || e);
        }
    }

    res.status(502).send('all upstream attempts failed');
}

module.exports = {
    proxy,
    ALLOWED_HOSTS,
};
