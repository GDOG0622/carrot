import { getSettings } from './config.js';

const LINK_BLOCK_RE = /<link\b([^>]*)>[\s\S]*?<\/link>/gi;
const CARROT_IMAGE_RE = /<carrot-image\b([^>]*)>[\s\S]*?<\/carrot-image>/gi;
const MAX_IMAGES_PER_MESSAGE = 3;
const MAX_IMAGE_SIDE = 1280;
const JPEG_QUALITY = 0.86;
const attachedMessages = new WeakSet();

function decodeAttr(value) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = String(value || '');
    return textarea.value;
}

function parseAttrs(attrText) {
    const attrs = {};
    const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = re.exec(attrText || '')) !== null) {
        attrs[m[1].toLowerCase()] = decodeAttr(m[2]);
    }
    return attrs;
}

function extractCoverUrls(text) {
    const covers = [];
    LINK_BLOCK_RE.lastIndex = 0;
    CARROT_IMAGE_RE.lastIndex = 0;
    let m;
    while ((m = LINK_BLOCK_RE.exec(String(text || ''))) !== null) {
        const cover = parseAttrs(m[1]).cover;
        if (cover && !covers.includes(cover)) covers.push(cover);
        if (covers.length >= MAX_IMAGES_PER_MESSAGE) break;
    }
    while (covers.length < MAX_IMAGES_PER_MESSAGE && (m = CARROT_IMAGE_RE.exec(String(text || ''))) !== null) {
        const src = parseAttrs(m[1]).src;
        if (src && !covers.includes(src)) covers.push(src);
    }
    return covers;
}

function getMessageText(message) {
    const content = message?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .filter((part) => part?.type === 'text' && typeof part.text === 'string')
            .map((part) => part.text)
            .join('\n');
    }
    if (typeof message?.mes === 'string') return message.mes;
    if (typeof message?.message === 'string') return message.message;
    return '';
}

function normalizeCoverUrl(url) {
    try {
        const parsed = new URL(url, window.location.origin);
        if (parsed.origin !== window.location.origin) return '';
        if (!/^\/api\/plugins\/carrot\/(covers|uploads)\//.test(parsed.pathname)) return '';
        return parsed.href;
    } catch (error) {
        return '';
    }
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Failed to read image'));
        reader.readAsDataURL(blob);
    });
}

function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Failed to load image'));
        image.src = dataUrl;
    });
}

async function compressDataUrl(dataUrl) {
    const image = await loadImage(dataUrl);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
    const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

async function coverToDataUrl(url) {
    const res = await fetch(url, { method: 'GET', cache: 'force-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    if (!String(blob.type || '').startsWith('image/')) return '';
    const dataUrl = await blobToDataUrl(blob);
    return compressDataUrl(dataUrl).catch(() => dataUrl);
}

function ensureOpenAiContentArray(message) {
    if (Array.isArray(message.content)) return message.content;
    const text = typeof message.content === 'string' ? message.content : getMessageText(message);
    message.content = text ? [{ type: 'text', text }] : [];
    return message.content;
}

async function attachCoversToMessage(message) {
    if (!message || typeof message !== 'object' || attachedMessages.has(message)) return 0;
    const text = getMessageText(message);
    const covers = extractCoverUrls(text)
        .map(normalizeCoverUrl)
        .filter(Boolean);
    if (!covers.length) return 0;

    const content = ensureOpenAiContentArray(message);
    let added = 0;
    for (const cover of covers) {
        try {
            const dataUrl = await coverToDataUrl(cover);
            if (!dataUrl) continue;
            content.push({
                type: 'image_url',
                image_url: {
                    url: dataUrl,
                    detail: 'auto',
                },
            });
            added++;
        } catch (error) {
            console.warn('Carrot: image attach skipped', cover, error);
        }
    }
    if (added) attachedMessages.add(message);
    return added;
}

async function handlePromptReady(eventData) {
    const settings = getSettings();
    if (settings.linkParse?.attachCoverImage === false) return;
    const chat = Array.isArray(eventData) ? eventData : eventData?.chat;
    if (!Array.isArray(chat)) return;

    let added = 0;
    for (const message of chat) {
        added += await attachCoversToMessage(message);
    }
    if (added) {
        console.info(`Carrot: attached ${added} image(s) for multimodal prompt`);
    }
}

export async function initLinkVision() {
    const eventsModule = await import('/scripts/events.js').catch(() => null);
    const eventSource = (() => {
        try {
            return window.SillyTavern?.getContext?.()?.eventSource || eventsModule?.eventSource;
        } catch (error) {
            return eventsModule?.eventSource;
        }
    })();
    const eventName = eventsModule?.event_types?.CHAT_COMPLETION_PROMPT_READY;
    if (!eventSource?.on || !eventName) {
        console.warn('Carrot: link vision hook unavailable');
        return;
    }
    eventSource.on(eventName, handlePromptReady);
}
