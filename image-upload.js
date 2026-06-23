import { requestHeaders } from './request-headers.js';

const UPLOAD_URL = '/api/plugins/carrot/uploads';

function escapeAttr(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function sanitizeNote(value) {
    return String(value || '')
        .replace(/<\/?carrot-image\b[^>]*>/gi, '')
        .replace(/\s*\n+\s*/g, ' ')
        .trim()
        .slice(0, 1200);
}

export function buildCarrotImageToken(src, note = '') {
    return `<carrot-image src="${escapeAttr(src)}">${sanitizeNote(note)}</carrot-image>`;
}

export async function uploadCarrotImage(file) {
    if (!file || !String(file.type || '').startsWith('image/')) {
        throw new Error('请选择图片文件');
    }
    const res = await fetch(UPLOAD_URL, {
        method: 'POST',
        headers: {
            ...requestHeaders(),
            'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
        throw new Error(data.error || `上传失败 HTTP ${res.status}`);
    }
    return data.url;
}
