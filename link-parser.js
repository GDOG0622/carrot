// 前端：扫消息里的 URL，调 plugin /link-preview，把分享文本整理为 <link>...</link>
// 详见 ./PLAN_v8.md §2.1 §2.2

import { getSettings } from './config.js';
import { jsonRequestHeaders } from './request-headers.js';

const PREVIEW_URL = '/api/plugins/carrot/link-preview';
const URL_RE = /https?:\/\/[^\s<>"'）)】\]]+/g;

const SINGLE_URL_TIMEOUT_MS = 15000;
const TOTAL_TIMEOUT_MS = 30000;
const MAX_URLS = 5;

// 把字符串切成 [{type: 'normal'|'skip', start, end}] 的"区段"列表
// skip 区段不参与 URL 提取
function buildSkipRanges(text) {
    const skips = [];

    // 三反引号代码块（含语言标记）—— 跨行
    const fence = /```[\s\S]*?```/g;
    let m;
    while ((m = fence.exec(text)) !== null) {
        skips.push([m.index, m.index + m[0].length]);
    }

    // 单行行内代码 `xxx`
    const inline = /`[^`\n]*`/g;
    while ((m = inline.exec(text)) !== null) {
        skips.push([m.index, m.index + m[0].length]);
    }

    // 已经是 <link>...</link> 或旧 [link|...]URL[/link] 的 token
    const linkBlocks = /<link\b[\s\S]*?<\/link>/gi;
    while ((m = linkBlocks.exec(text)) !== null) {
        skips.push([m.index, m.index + m[0].length]);
    }
    const tokens = /\[link\|[^\]]*\]https?:\/\/[^\s<>]+\[\/link\]/gi;
    while ((m = tokens.exec(text)) !== null) {
        skips.push([m.index, m.index + m[0].length]);
    }

    skips.sort((a, b) => a[0] - b[0]);
    return skips;
}

function inSkip(pos, skips) {
    for (const [s, e] of skips) {
        if (pos >= s && pos < e) return true;
        if (s > pos) break;
    }
    return false;
}

/**
 * 从文本里提取 URL（跳过代码块 / 已 token 化的 URL）
 * 返回 [{start, end, url}, ...]
 */
export function extractUrls(text) {
    const skips = buildSkipRanges(text);
    const out = [];
    let m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(text)) !== null) {
        if (inSkip(m.index, skips)) continue;
        // 去掉常见尾部标点（句号、逗号、中文标点等）
        let raw = m[0].replace(/[.,;:!?，。；：！？、)\]）】]+$/, '');
        out.push({ start: m.index, end: m.index + raw.length, url: raw });
        if (out.length >= MAX_URLS) break;
    }
    return out;
}

/**
 * 调 plugin /link-preview 解析单个 URL
 */
async function fetchPreview(url, rawText) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SINGLE_URL_TIMEOUT_MS);
    try {
        const res = await fetch(PREVIEW_URL, {
            method: 'POST',
            headers: jsonRequestHeaders(),
            body: JSON.stringify({
                url,
                rawText,
                jinaToken: getSettings().linkParse?.jinaToken || '',
            }),
            signal: ctrl.signal,
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `HTTP ${res.status}`);
        }
        return await res.json();
    } finally { clearTimeout(timer); }
}

// 把结构块里的危险字符清理或截断
function sanitizeField(value, maxLen = 2000) {
    return String(value || '')
        .replace(/<\/?link\b[^>]*>/gi, '')
        .trim()
        .slice(0, maxLen);
}

function escapeAttr(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function formatComment(item, index) {
    const parent = item.parentNickname ? `回复${item.parentNickname} ` : '';
    const name = item.nickname ? `${item.nickname}: ` : '';
    const ip = item.ipLocation ? `(${item.ipLocation})` : '';
    const likes = item.likeCount !== '' && item.likeCount !== undefined ? ` 赞${item.likeCount}` : '';
    return `${index + 1}. ${parent}${name}${item.content || ''}${ip}${likes}`;
}

function buildToken(preview, originalUrl, beforeText = '', afterText = '') {
    const title = sanitizeField(preview.title || preview.siteName || '链接', 160);
    const comments = Array.isArray(preview.comments) ? preview.comments.slice(0, 15) : [];
    const commentLines = comments.map((item, index) => {
        return sanitizeField(formatComment(item, index), 280);
    }).filter(Boolean);
    const descLines = [];
    const description = sanitizeField(preview.description || '', 2400);
    if (description) descLines.push(description);
    if (commentLines.length) {
        descLines.push(`评论前${commentLines.length}：`);
        descLines.push(...commentLines);
    }
    const cover = sanitizeField(preview.imageLocal || preview.image || '', 600);
    const finalUrl = sanitizeField(preview.url || originalUrl, 800);
    const lines = [
        `<link href="${escapeAttr(finalUrl)}" cover="${escapeAttr(cover)}" site="${escapeAttr(preview.siteName || '')}">`,
    ];
    const before = sanitizeField(beforeText, 1200);
    const after = sanitizeField(afterText, 1200);
    if (before) lines.push(before);
    lines.push(`|${title}`);
    if (descLines.length) lines.push(...descLines);
    if (cover) lines.push(`|图片：${cover}`);
    if (after) lines.push(after);
    lines.push('</link>');
    return lines.join('\n');
}

function getSameLineContext(text, start, end) {
    const lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const nextBreak = text.indexOf('\n', end);
    const lineEnd = nextBreak === -1 ? text.length : nextBreak;
    return {
        before: text.slice(lineStart, start),
        after: text.slice(end, lineEnd),
        lineStart,
        lineEnd,
    };
}

/**
 * 解析文本里所有 URL 并替换为 token。
 * 返回 { text: 新文本, total, success, failed, errors: [...] }
 */
export async function parseAndReplace(text) {
    const urls = extractUrls(text);
    if (urls.length === 0) {
        return { text, total: 0, success: 0, failed: 0, errors: [] };
    }

    // 总超时保护
    const totalCtrl = new AbortController();
    const totalTimer = setTimeout(() => totalCtrl.abort(), TOTAL_TIMEOUT_MS);

    const tasks = urls.map(async (u) => {
        try {
            if (totalCtrl.signal.aborted) throw new Error('总超时');
            const preview = await fetchPreview(u.url, text);
            return { ...u, preview, error: null };
        } catch (e) {
            return { ...u, preview: null, error: e?.message || String(e) };
        }
    });

    let results;
    try {
        results = await Promise.all(tasks);
    } finally { clearTimeout(totalTimer); }

    // 单链接分享文案：把前文/后文一起收进 <link>，避免普通文本漏在外面。
    if (results.length === 1 && results[0].preview && !results[0].error) {
        const r = results[0];
        const ctx = getSameLineContext(text, r.start, r.end);
        const token = buildToken(r.preview, r.url, ctx.before, ctx.after);
        return {
            text: text.slice(0, ctx.lineStart) + token + text.slice(ctx.lineEnd),
            total: 1,
            success: 1,
            failed: 0,
            errors: [],
        };
    }

    // 多链接时从后往前替换，避免位置偏移；token 强制独占一行（渲染层按块匹配卡片）
    let newText = text;
    let success = 0;
    let failed = 0;
    const errors = [];
    for (let i = results.length - 1; i >= 0; i--) {
        const r = results[i];
        if (r.preview && !r.error) {
            const token = buildToken(r.preview, r.url);
            const before = r.start > 0 && newText[r.start - 1] !== '\n' ? '\n' : '';
            const after = r.end < newText.length && newText[r.end] !== '\n' ? '\n' : '';
            newText = newText.slice(0, r.start) + before + token + after + newText.slice(r.end);
            success++;
        } else {
            failed++;
            errors.push({ url: r.url, error: r.error });
        }
    }

    return { text: newText, total: urls.length, success, failed, errors };
}
