// 链接封面的下载、LRU 清理、静态服务
// 详见 ../PLAN_v8.md §3.4 §5

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const COVERS_DIR = path.join(__dirname, 'covers');
const MAX_FILES = 5;
const MAX_BYTES = 8 * 1024 * 1024; // 单个封面 8MB 上限

function ensureDir() {
    if (!fs.existsSync(COVERS_DIR)) fs.mkdirSync(COVERS_DIR, { recursive: true });
}

function cleanup() {
    ensureDir();
    let entries;
    try {
        entries = fs.readdirSync(COVERS_DIR)
            .map(f => {
                const full = path.join(COVERS_DIR, f);
                let stat;
                try { stat = fs.statSync(full); } catch { return null; }
                return stat.isFile() ? { name: f, mtimeMs: stat.mtimeMs } : null;
            })
            .filter(Boolean);
    } catch { return; }
    if (entries.length <= MAX_FILES) return;
    // 按 mtime 升序，最旧的先删
    entries.sort((a, b) => a.mtimeMs - b.mtimeMs);
    const toDelete = entries.slice(0, entries.length - MAX_FILES);
    for (const e of toDelete) {
        try { fs.unlinkSync(path.join(COVERS_DIR, e.name)); } catch {}
    }
}

function imageExtFromType(ctype, imageUrl = '') {
    const lower = String(ctype || '').toLowerCase();
    if (lower.includes('png')) return '.png';
    if (lower.includes('webp')) return '.webp';
    if (lower.includes('gif')) return '.gif';
    if (lower.includes('jpeg') || lower.includes('jpg')) return '.jpg';
    try {
        const ext = path.extname(new URL(imageUrl).pathname).toLowerCase();
        if (/^\.(png|jpe?g|webp|gif)$/.test(ext)) return ext === '.jpeg' ? '.jpg' : ext;
    } catch {}
    return '.jpg';
}

function isBlockedHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    return host === 'localhost' || host === '0.0.0.0' || /^127\./.test(host) || /^10\./.test(host)
        || /^192\.168\./.test(host) || /^169\.254\./.test(host)
        || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) || /^::1$/.test(host) || /^fe80:/i.test(host);
}

/**
 * 下载并缓存封面图，返回前端可用的相对 URL（/api/plugins/carrot/covers/<filename>）
 * 失败返回空字符串
 */
async function cachePreviewImage(imageUrl, refererUrl = '') {
    if (!imageUrl) return '';
    let parsed;
    try { parsed = new URL(imageUrl); } catch { return ''; }
    if (!/^https?:$/.test(parsed.protocol) || isBlockedHost(parsed.hostname)) return '';

    const candidates = [];
    if (parsed.protocol === 'http:') {
        const httpsUrl = new URL(parsed.toString());
        httpsUrl.protocol = 'https:';
        candidates.push(httpsUrl.toString());
    }
    candidates.push(parsed.toString());

    const hash = crypto.createHash('sha1').update(parsed.toString()).digest('hex').slice(0, 20);
    ensureDir();
    cleanup();

    for (const candidate of candidates) {
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 12000);
            let imgResp;
            try {
                imgResp = await fetch(candidate, {
                    signal: ctrl.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
                        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                        ...(refererUrl ? { 'Referer': refererUrl } : {})
                    }
                });
            } finally { clearTimeout(timer); }

            const ctype = imgResp.headers.get('content-type') || '';
            const len = Number(imgResp.headers.get('content-length') || 0);
            if (!imgResp.ok || !/^image\//i.test(ctype) || len > MAX_BYTES) continue;
            const bytes = Buffer.from(await imgResp.arrayBuffer());
            if (!bytes.length || bytes.length > MAX_BYTES) continue;
            const ext = imageExtFromType(ctype, candidate);
            const filename = `${hash}${ext}`;
            const filePath = path.join(COVERS_DIR, filename);

            if (fs.existsSync(filePath)) {
                const now = new Date();
                try { fs.utimesSync(filePath, now, now); } catch {}
                return `/api/plugins/carrot/covers/${filename}`;
            }
            fs.writeFileSync(filePath, bytes);
            cleanup();
            return `/api/plugins/carrot/covers/${filename}`;
        } catch (e) {
            console.warn('[carrot cover-cache] 下载失败', e?.message || e);
        }
    }
    return '';
}

/**
 * GET /api/plugins/carrot/covers/:filename
 */
function serve(req, res) {
    const filename = String(req.params.filename || '');
    // 防路径穿越：限定 hex 文件名 + 扩展
    if (!/^[a-f0-9]{20}\.(jpg|png|webp|gif)$/i.test(filename)) {
        return res.status(400).send('invalid filename');
    }
    const full = path.join(COVERS_DIR, filename);
    if (!fs.existsSync(full)) return res.status(404).send('not found');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(full);
}

module.exports = {
    cachePreviewImage,
    serve,
    cleanup,
};
