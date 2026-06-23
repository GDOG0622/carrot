const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const MAX_FILES = 80;
const MAX_BYTES = 12 * 1024 * 1024;

function ensureDir() {
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function cleanup() {
    ensureDir();
    let entries = [];
    try {
        entries = fs.readdirSync(UPLOADS_DIR)
            .map((name) => {
                const full = path.join(UPLOADS_DIR, name);
                let stat;
                try { stat = fs.statSync(full); } catch { return null; }
                return stat.isFile() ? { name, mtimeMs: stat.mtimeMs } : null;
            })
            .filter(Boolean);
    } catch {
        return;
    }
    if (entries.length <= MAX_FILES) return;
    entries.sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const entry of entries.slice(0, entries.length - MAX_FILES)) {
        try { fs.unlinkSync(path.join(UPLOADS_DIR, entry.name)); } catch {}
    }
}

function extFromType(type) {
    const lower = String(type || '').toLowerCase();
    if (lower.includes('png')) return '.png';
    if (lower.includes('webp')) return '.webp';
    if (lower.includes('gif')) return '.gif';
    if (lower.includes('jpeg') || lower.includes('jpg')) return '.jpg';
    return '';
}

function upload(req, res) {
    ensureDir();
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const ext = extFromType(type);
    if (!ext || !type.startsWith('image/')) {
        return res.status(400).json({ ok: false, error: '只支持图片文件' });
    }

    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
    if (!bytes.length) return res.status(400).json({ ok: false, error: '图片为空' });
    if (bytes.length > MAX_BYTES) return res.status(413).json({ ok: false, error: '图片超过 12MB' });

    const hash = crypto.createHash('sha1')
        .update(bytes)
        .update(String(Date.now()))
        .digest('hex')
        .slice(0, 20);
    const filename = `${hash}${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), bytes);
    cleanup();
    res.json({
        ok: true,
        url: `/api/plugins/carrot/uploads/${filename}`,
        filename,
    });
}

function serve(req, res) {
    const filename = String(req.params.filename || '');
    if (!/^[a-f0-9]{20}\.(jpg|png|webp|gif)$/i.test(filename)) {
        return res.status(400).send('invalid filename');
    }
    const full = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(full)) return res.status(404).send('not found');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(full);
}

module.exports = {
    upload,
    serve,
    cleanup,
};
