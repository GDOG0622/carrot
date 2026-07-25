import { CarrotPhotoStack } from './photo-stack.js';
import { isCatboxHost, catboxProxyUrl, rewriteCatboxUrl } from './catbox-proxy.js';

const PROCESSED_ATTR = 'data-carrot-format-rendered';
const RENDERING_ATTR = 'data-carrot-format-rendering';
const RENDERED_CLASS = 'carrot-format-rendered';
const originalHtmlByElement = new WeakMap();
const SAFE_HTML_TAGS = new Set([
    'div',
    'p',
    'span',
    'br',
    'b',
    'strong',
    'i',
    'em',
    'u',
    'small',
    'sup',
    'sub',
    'ul',
    'ol',
    'li',
    'details',
    'summary',
    'abstract',
]);
const DROP_HTML_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'svg']);

// 猫箱（catbox.moe）图床代理：不管图片是从 AI 输出的 markdown、carrot 自己的 token
// 还是用户手动粘贴的裸链接来的，只要最终落到 <img src> 或纯文本自动链接上，
// 都改走后端 /img-proxy，浏览器端不用直连 catbox。
const CATBOX_MEDIA_EXT_RE = /\.(png|jpe?g|gif|webp|svg|mp4|webm)(\?.*)?$/i;
const CATBOX_PROXY_PREFIX = '/api/plugins/carrot/img-proxy?url=';

function resolveUrl(raw, documentRef) {
    try { return new URL(raw, documentRef?.baseURI || window.location.href); } catch { return null; }
}

// 把某个渲染完成的消息节点里所有指向 catbox 的 <img src> / 纯链接自动改走本地代理
function rewriteCatboxMedia(root, documentRef) {
    if (!root || typeof root.querySelectorAll !== 'function') return;

    root.querySelectorAll('img[src]').forEach((img) => {
        const src = img.getAttribute('src') || '';
        if (!src || src.startsWith(CATBOX_PROXY_PREFIX) || src.startsWith('/api/plugins/carrot/')) return;
        const parsed = resolveUrl(src, documentRef);
        if (!parsed || !/^https?:$/.test(parsed.protocol) || !isCatboxHost(parsed.hostname)) return;
        img.src = catboxProxyUrl(parsed.toString());
    });

    // 任何指向猫箱的 <a href> 都改走代理——不管什么后缀，点开/下载都不用连梯子。
    // showdown 会把裸 URL 自动转成 <a href>；文本内容等于链接本身、且看着像图片后缀时，
    // 额外升级成内嵌 <img> 预览（纯链接没法预判是不是图片，只能靠后缀猜）。
    root.querySelectorAll('a[href]').forEach((a) => {
        if (a.querySelector('img')) return;
        const href = a.getAttribute('href') || '';
        const parsed = resolveUrl(href, documentRef);
        if (!parsed || !/^https?:$/.test(parsed.protocol) || !isCatboxHost(parsed.hostname)) return;
        const proxied = catboxProxyUrl(parsed.toString());

        if (CATBOX_MEDIA_EXT_RE.test(parsed.pathname)) {
            const text = a.textContent.trim();
            if (text === href.trim() || text === parsed.toString()) {
                const img = documentRef.createElement('img');
                img.className = 'carrot-image-card carrot-catbox-autoembed';
                img.loading = 'lazy';
                img.alt = '';
                img.src = proxied;
                a.replaceWith(img);
                return;
            }
        }
        a.href = proxied;
    });
}
const SAFE_STYLE_PROPS = new Set([
    'background',
    'background-color',
    'border',
    'border-color',
    'border-radius',
    'border-style',
    'border-width',
    'box-shadow',
    'color',
    'display',
    'font',
    'font-family',
    'font-size',
    'font-style',
    'font-weight',
    'letter-spacing',
    'line-height',
    'margin',
    'margin-bottom',
    'margin-left',
    'margin-right',
    'margin-top',
    'max-width',
    'min-width',
    'opacity',
    'padding',
    'padding-bottom',
    'padding-left',
    'padding-right',
    'padding-top',
    'text-align',
    'text-decoration',
    'white-space',
    'width',
]);

function getMessageId(element) {
    const mes = element?.closest?.('.mes');
    if (!mes) return null;
    const candidates = [
        mes.getAttribute('mesid'),
        mes.dataset?.mesid,
        mes.dataset?.id,
        mes.id?.match(/\d+/)?.[0],
    ];
    for (const value of candidates) {
        if (value === undefined || value === null || value === '') continue;
        const parsed = Number(value);
        if (Number.isInteger(parsed)) return parsed;
    }
    return null;
}

function getChatMessage(element) {
    const messageId = getMessageId(element);
    if (messageId === null) return null;
    try {
        const chat = window.SillyTavern?.getContext?.()?.chat || [];
        return chat[messageId] || null;
    } catch (error) {
        return null;
    }
}

function getChatMessageText(element) {
    const message = getChatMessage(element);
    if (!message) return null;
    if (typeof message.mes === 'string') return normalizeText(message.mes);
    if (typeof message.message === 'string') return normalizeText(message.message);
    return null;
}

function isUserMessage(element) {
    const mes = element?.closest?.('.mes');
    const message = getChatMessage(element);
    if (message) return !!message.is_user;

    if (!mes) return false;
    return (
        mes.classList.contains('user_mes') ||
        mes.classList.contains('is_user') ||
        mes.getAttribute('is_user') === 'true' ||
        mes.dataset?.isUser === 'true'
    );
}

function normalizeText(text) {
    return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function looksLikeHtmlFragment(text) {
    const value = String(text || '').trim();
    return /^<([a-z][\w:-]*)(?:\s[^>]*)?>[\s\S]*<\/\1>$|^<br\s*\/?>$/i.test(value);
}

function sanitizeStyle(styleText) {
    return String(styleText || '')
        .split(';')
        .map((rule) => rule.trim())
        .filter(Boolean)
        .map((rule) => {
            const separatorIndex = rule.indexOf(':');
            if (separatorIndex <= 0) return '';
            const property = rule.slice(0, separatorIndex).trim().toLowerCase();
            const value = rule.slice(separatorIndex + 1).trim();
            if (!SAFE_STYLE_PROPS.has(property)) return '';
            if (/expression\s*\(|javascript\s*:|url\s*\(/i.test(value)) return '';
            return `${property}: ${value}`;
        })
        .filter(Boolean)
        .join('; ');
}

function sanitizeHtmlNode(documentRef, node) {
    if (node.nodeType === Node.TEXT_NODE) {
        return documentRef.createTextNode(node.textContent || '');
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
        return documentRef.createDocumentFragment();
    }

    const tagName = node.tagName.toLowerCase();
    if (DROP_HTML_TAGS.has(tagName)) {
        return documentRef.createDocumentFragment();
    }

    const children = documentRef.createDocumentFragment();
    node.childNodes.forEach((child) => children.appendChild(sanitizeHtmlNode(documentRef, child)));

    if (!SAFE_HTML_TAGS.has(tagName)) {
        return children;
    }

    const element = documentRef.createElement(tagName);
    if (node.hasAttribute('style')) {
        const style = sanitizeStyle(node.getAttribute('style'));
        if (style) element.setAttribute('style', style);
    }
    element.appendChild(children);
    return element;
}

function sanitizeHtmlFragment(documentRef, html) {
    const template = documentRef.createElement('template');
    template.innerHTML = html;
    const fragment = documentRef.createDocumentFragment();
    template.content.childNodes.forEach((node) => fragment.appendChild(sanitizeHtmlNode(documentRef, node)));
    return fragment;
}

function readMessageText(element) {
    return normalizeText(element?.innerText || element?.textContent || '');
}

function readSourceText(element) {
    return getChatMessageText(element) ?? readMessageText(element);
}

function createBubbleShell(documentRef, side, kind = 'text', { hasTail = true } = {}) {
    const line = documentRef.createElement('div');
    line.className = `carrot-ios-line carrot-ios-${side}`;
    const wrap = documentRef.createElement('div');
    wrap.className = `carrot-ios-wrap carrot-ios-${kind}`;
    if (!hasTail) line.classList.add('carrot-ios-no-tail');
    const tail = documentRef.createElement('span');
    tail.className = 'carrot-ios-tail';
    wrap.appendChild(tail);
    line.appendChild(wrap);
    return { line, wrap };
}

function createTextBubble(documentRef, token, side, preset, options = {}) {
    if (preset === 'avatarTransparent') {
        return createAvatarTransparentBubble(documentRef, token, side);
    }
    const { line, wrap } = createBubbleShell(documentRef, side, 'text', options);
    const bubble = documentRef.createElement('div');
    bubble.className = 'carrot-ios-bubble';
    bubble.textContent = token.body;
    wrap.appendChild(bubble);
    return line;
}

function createAvatarTransparentBubble(documentRef, token, side) {
    const line = createAvatarTransparentLine(documentRef, side);
    const bubble = documentRef.createElement('div');
    bubble.className = 'carrot-avatar-transparent-bubble';

    const body = documentRef.createElement('span');
    body.className = 'carrot-avatar-transparent-body';
    body.textContent = token.body;

    bubble.append(
        createAvatarTransparentShine(documentRef),
        body,
        createAvatarTransparentDot(documentRef),
    );
    line.appendChild(bubble);
    return line;
}

function createAvatarTransparentLine(documentRef, side) {
    const line = documentRef.createElement('div');
    line.className = `carrot-avatar-transparent-line carrot-avatar-transparent-${side}`;

    const avatar = documentRef.createElement('div');
    avatar.className =
        side === 'user'
            ? 'carrot-avatar-transparent-avatar custom-B_U_avar B_U_avar'
            : 'carrot-avatar-transparent-avatar custom-B_C_avar B_C_avar';

    line.appendChild(avatar);
    return line;
}

function createAvatarTransparentShine(documentRef) {
    const shine = documentRef.createElement('span');
    shine.className = 'carrot-avatar-transparent-shine';
    return shine;
}

function createAvatarTransparentDot(documentRef) {
    const dot = documentRef.createElement('span');
    dot.className = 'carrot-avatar-transparent-dot';
    return dot;
}

function createVoiceBubble(documentRef, token, side, preset, options = {}) {
    if (preset === 'avatarTransparent') {
        return createAvatarTransparentVoice(documentRef, token, side);
    }
    const { line, wrap } = createBubbleShell(documentRef, side, 'voice', options);
    const details = documentRef.createElement('details');
    details.className = 'carrot-ios-bubble carrot-ios-voice-details';

    const summary = documentRef.createElement('summary');
    summary.className = 'carrot-ios-voice-summary';

    const play = documentRef.createElement('span');
    play.className = 'carrot-ios-play';
    play.textContent = '▶';

    const wave = documentRef.createElement('span');
    wave.className = 'carrot-ios-wave';
    [60, 80, 40, 90, 50, 75].forEach((height) => {
        const bar = documentRef.createElement('span');
        bar.className = 'carrot-ios-wave-bar';
        bar.style.setProperty('--carrot-bar-height', `${height}%`);
        wave.appendChild(bar);
    });

    const title = documentRef.createElement('span');
    title.className = 'carrot-ios-voice-title';
    title.textContent = token.title;
    summary.append(play, wave, title);

    const body = documentRef.createElement('div');
    body.className = 'carrot-ios-voice-body';
    const paragraph = documentRef.createElement('p');
    paragraph.textContent = token.body;
    body.appendChild(paragraph);

    details.append(summary, body);
    wrap.appendChild(details);
    return line;
}

function createAvatarTransparentVoice(documentRef, token, side) {
    const line = createAvatarTransparentLine(documentRef, side);
    line.classList.add('carrot-avatar-transparent-voice-line');

    const details = documentRef.createElement('details');
    details.className = 'carrot-avatar-transparent-voice';

    const summary = documentRef.createElement('summary');
    summary.className = 'carrot-avatar-transparent-voice-summary';

    const play = documentRef.createElement('span');
    play.className = 'carrot-avatar-transparent-voice-play';
    play.textContent = '▶';

    const wave = documentRef.createElement('span');
    wave.className = 'carrot-avatar-transparent-voice-wave';
    [60, 80, 40, 90, 50, 75].forEach((height) => {
        const bar = documentRef.createElement('span');
        bar.className = 'carrot-avatar-transparent-voice-bar';
        bar.style.setProperty('--carrot-bar-height', `${height}%`);
        wave.appendChild(bar);
    });

    const title = documentRef.createElement('span');
    title.className = 'carrot-avatar-transparent-voice-title';
    title.textContent = token.title;

    summary.append(
        play,
        wave,
        title,
        createAvatarTransparentShine(documentRef),
        createAvatarTransparentDot(documentRef),
    );

    const body = documentRef.createElement('div');
    body.className = 'carrot-avatar-transparent-voice-body';
    const paragraph = documentRef.createElement('p');
    paragraph.textContent = token.body;
    body.appendChild(paragraph);

    details.append(summary, body);
    line.appendChild(details);
    return line;
}

function createDimensionBubble(documentRef, token, side, preset, options = {}) {
    if (preset === 'avatarTransparent') {
        return createAvatarTransparentDimension(documentRef, token, side);
    }
    const { line, wrap } = createBubbleShell(documentRef, side, 'dimension', options);
    const bubble = documentRef.createElement('div');
    bubble.className = 'carrot-ios-bubble carrot-ios-dimension-card';

    const title = documentRef.createElement('span');
    title.className = 'carrot-ios-dimension-title';
    title.textContent = token.title;
    const value = documentRef.createElement('span');
    value.className = 'carrot-ios-dimension-value';
    value.textContent = token.value;
    const note = documentRef.createElement('span');
    note.className = 'carrot-ios-dimension-note';
    note.textContent = token.note;

    bubble.append(title, value, note);
    wrap.appendChild(bubble);
    return line;
}

function createAvatarTransparentDimension(documentRef, token, side) {
    const line = createAvatarTransparentLine(documentRef, side);
    const bubble = documentRef.createElement('div');
    bubble.className = 'carrot-avatar-transparent-dimension';

    const title = documentRef.createElement('span');
    title.className = 'carrot-avatar-transparent-dimension-title';
    title.textContent = token.title;
    const value = documentRef.createElement('span');
    value.className = 'carrot-avatar-transparent-dimension-value';
    value.textContent = token.value;
    const note = documentRef.createElement('span');
    note.className = 'carrot-avatar-transparent-dimension-note';
    note.textContent = token.note;

    bubble.append(
        title,
        value,
        note,
        createAvatarTransparentShine(documentRef),
        createAvatarTransparentDot(documentRef),
    );
    line.appendChild(bubble);
    return line;
}

function createTimestampLine(documentRef, token) {
    const container = documentRef.createElement('div');
    container.className = 'carrot-render-timestamp';
    container.textContent = `${token.time}\u00a0\u00a0\u00a0${token.text}`;
    return container;
}

function createSystemLine(documentRef, token) {
    const container = documentRef.createElement('div');
    container.className = 'carrot-render-system';
    container.textContent = token.body;
    return container;
}

function createRecallLine(documentRef, token) {
    const outer = documentRef.createElement('div');
    outer.className = 'carrot-render-recall';
    const details = documentRef.createElement('details');
    const summary = documentRef.createElement('summary');
    summary.textContent = '对方撤回了一条消息';
    const content = documentRef.createElement('div');
    content.className = 'carrot-render-recall-content';
    content.textContent = token.body;
    details.append(summary, content);
    outer.appendChild(details);
    return outer;
}

function createLinkCard(documentRef, token, side = 'user') {
    // 把 sanitize 时换成全角的 ｜ 还原显示（仅显示用）
    const restore = (s) => String(s || '').replace(/｜/g, '|');
    const wrap = documentRef.createElement('div');
    wrap.className = `carrot-link-card-line carrot-link-card-line-${side}`;

    const card = documentRef.createElement('a');
    card.className = 'carrot-link-card';
    card.href = token.url;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';

    if (token.cover) {
        const img = documentRef.createElement('img');
        img.className = 'carrot-link-card__cover';
        img.src = token.cover;
        img.alt = '';
        img.loading = 'lazy';
        img.addEventListener('error', () => {
            img.classList.add('carrot-link-card__cover--failed');
            img.removeAttribute('src');
        });
        card.appendChild(img);
    } else {
        const ph = documentRef.createElement('div');
        ph.className = 'carrot-link-card__cover carrot-link-card__cover--failed';
        card.appendChild(ph);
    }

    const body = documentRef.createElement('div');
    body.className = 'carrot-link-card__body';

    const title = documentRef.createElement('div');
    title.className = 'carrot-link-card__title';
    title.textContent = restore(token.title) || '链接';
    body.appendChild(title);

    if (token.description) {
        const desc = documentRef.createElement('div');
        desc.className = 'carrot-link-card__desc';
        desc.textContent = restore(token.description);
        body.appendChild(desc);
    }

    const site = documentRef.createElement('div');
    site.className = 'carrot-link-card__site';
    let host = '';
    try { host = new URL(token.url).hostname; } catch {}
    site.textContent = `🌐 ${host || '链接'}`;
    body.appendChild(site);

    card.appendChild(body);
    wrap.appendChild(card);
    return wrap;
}

function createCarrotImage(documentRef, token, side = 'user') {
    const wrap = documentRef.createElement('div');
    wrap.className = `carrot-image-line carrot-image-line-${side}`;

    const img = documentRef.createElement('img');
    img.className = 'carrot-image-card';
    img.src = token.src;
    img.alt = '';
    img.loading = 'lazy';

    const fallback = documentRef.createElement('div');
    fallback.className = 'carrot-image-fallback';
    fallback.textContent = '图片加载失败';

    img.addEventListener('error', () => {
        img.classList.add('carrot-image-card--failed');
        fallback.classList.add('active');
    });

    wrap.append(img, fallback);
    return wrap;
}

// 全屏看大图：点堆叠卡（未拖动）时打开，可用 ‹ › / 方向键翻页，点背景 / × / Esc 关闭
function openCarrotImageViewer(documentRef, srcList, startIndex = 0) {
    let idx = Math.min(srcList.length - 1, Math.max(0, startIndex));
    const overlay = documentRef.createElement('div');
    overlay.className = 'carrot-image-viewer-overlay';

    const img = documentRef.createElement('img');
    img.className = 'carrot-image-viewer-img';
    img.alt = '';

    const counter = documentRef.createElement('div');
    counter.className = 'carrot-image-viewer-counter';

    const prev = documentRef.createElement('button');
    prev.className = 'carrot-image-viewer-nav carrot-image-viewer-prev';
    prev.type = 'button';
    prev.textContent = '‹';
    const next = documentRef.createElement('button');
    next.className = 'carrot-image-viewer-nav carrot-image-viewer-next';
    next.type = 'button';
    next.textContent = '›';
    const close = documentRef.createElement('button');
    close.className = 'carrot-image-viewer-close';
    close.type = 'button';
    close.textContent = '×';

    const render = () => {
        img.src = srcList[idx];
        counter.textContent = `${idx + 1} / ${srcList.length}`;
        prev.style.visibility = idx > 0 ? '' : 'hidden';
        next.style.visibility = idx < srcList.length - 1 ? '' : 'hidden';
    };
    const dismiss = () => {
        overlay.remove();
        documentRef.removeEventListener('keydown', onKey);
    };
    const go = (delta) => {
        idx = Math.min(srcList.length - 1, Math.max(0, idx + delta));
        render();
    };
    const onKey = (e) => {
        if (e.key === 'Escape') dismiss();
        else if (e.key === 'ArrowLeft') go(-1);
        else if (e.key === 'ArrowRight') go(1);
    };

    overlay.addEventListener('click', dismiss);
    [img, counter].forEach((el) => el.addEventListener('click', (e) => e.stopPropagation()));
    prev.addEventListener('click', (e) => { e.stopPropagation(); go(-1); });
    next.addEventListener('click', (e) => { e.stopPropagation(); go(1); });
    close.addEventListener('click', (e) => { e.stopPropagation(); dismiss(); });
    documentRef.addEventListener('keydown', onKey);

    if (srcList.length < 2) { prev.remove(); next.remove(); }
    overlay.append(img, counter, prev, next, close);
    (documentRef.body || documentRef.documentElement).appendChild(overlay);
    render();
}

// 多图堆叠卡：移植 / 改编自 Wren036/PhotoStack（github.com/Wren036/PhotoStack，
// 许可证 PolyForm Noncommercial 1.0.0），微信风格堆叠 + 拖拽/快滑翻页。致谢原作者。
function createCarrotImageStack(documentRef, tokens, side = 'user') {
    const wrap = documentRef.createElement('div');
    wrap.className = `carrot-image-line carrot-image-line-${side} carrot-image-line--stack`;
    // 直接在源头改写：堆叠缩略图之后会被 rewriteCatboxMedia 扫到，但全屏大图查看器是
    // 挂在 document.body 上、用这份 srcList 原样建的，扫不到，所以这里必须先改好。
    const srcList = tokens.map((t) => rewriteCatboxUrl(t.src));
    try {
        new CarrotPhotoStack(wrap, srcList, {
            onTap: (i) => openCarrotImageViewer(documentRef, srcList, i),
        });
    } catch (e) {
        // 兜底：堆叠组件异常时退回逐张平铺
        tokens.forEach((t) => wrap.appendChild(createCarrotImage(documentRef, t, side)));
    }
    return wrap;
}

function decodeAttr(value) {
    return String(value || '')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

function parseAttrs(raw) {
    const attrs = {};
    String(raw || '').replace(/([a-zA-Z][\w-]*)="([^"]*)"/g, (_, key, value) => {
        attrs[key] = decodeAttr(value);
        return '';
    });
    return attrs;
}

function createTextLine(documentRef, token) {
    const line = documentRef.createElement('p');
    line.className = 'carrot-render-text-line';
    line.textContent = token.body;
    return line;
}

function createQqrLine(documentRef, token) {
    const line = documentRef.createElement('div');
    line.className = 'carrot-render-text-line carrot-render-qqr-line';
    const source = String(token.body || '');
    const regex = /<!--\s*([^<>]+?)\.qqr\s*-->/gi;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(source))) {
        if (match.index > lastIndex) {
            line.appendChild(documentRef.createTextNode(source.slice(lastIndex, match.index)));
        }
        const description = match[1].trim();
        if (description && !/--|[<>]/.test(description)) {
            const placeholder = documentRef.createElement('span');
            placeholder.className = 'carrot-qqr-placeholder';
            placeholder.dataset.carrotQqrPlaceholder = description;
            placeholder.setAttribute('aria-hidden', 'true');
            line.appendChild(placeholder);
        }
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < source.length) {
        line.appendChild(documentRef.createTextNode(source.slice(lastIndex)));
    }
    return line;
}

function createHtmlBlock(documentRef, token, side) {
    const line = documentRef.createElement('div');
    line.className = `carrot-render-html-block carrot-render-html-${side}`;
    const content = documentRef.createElement('div');
    content.className = 'carrot-render-html-content';
    content.appendChild(sanitizeHtmlFragment(documentRef, token.body));
    line.appendChild(content);
    return line;
}

function parseVoiceBlock(lines, startIndex) {
    const firstLine = lines[startIndex];
    const firstMatch = firstLine.match(/^\s*=([^|=]+)\|([\s\S]*)$/);
    if (!firstMatch) return null;

    const title = firstMatch[1].trim();
    const bodyLines = [firstMatch[2]];
    let endIndex = startIndex;

    while (endIndex < lines.length) {
        const current = bodyLines[bodyLines.length - 1];
        if (/\s*=\s*$/.test(current)) {
            bodyLines[bodyLines.length - 1] = current.replace(/\s*=\s*$/, '');
            return {
                token: {
                    type: 'voiceBubble',
                    title,
                    body: bodyLines.join('\n').trim(),
                },
                endIndex,
            };
        }
        endIndex += 1;
        if (endIndex >= lines.length) return null;
        bodyLines.push(lines[endIndex]);
    }

    return null;
}

function parseLinkBlock(lines, startIndex, isUser) {
    if (!isUser) return null;
    const first = lines[startIndex];
    const open = first.match(/^\s*<link\b([^>]*)>\s*$/i);
    if (!open) return null;
    const bodyLines = [];
    let endIndex = startIndex + 1;
    for (; endIndex < lines.length; endIndex += 1) {
        if (/^\s*<\/link>\s*$/i.test(lines[endIndex])) break;
        bodyLines.push(lines[endIndex]);
    }
    if (endIndex >= lines.length) return null;
    const attrs = parseAttrs(open[1]);
    const firstPipe = bodyLines.findIndex(line => line.trim().startsWith('|'));
    if (firstPipe < 0) return null;
    const secondPipeRel = bodyLines.slice(firstPipe + 1).findIndex(line => line.trim().startsWith('|'));
    const secondPipe = secondPipeRel >= 0 ? firstPipe + 1 + secondPipeRel : -1;
    const before = bodyLines.slice(0, firstPipe).join('\n').trim();
    const title = bodyLines[firstPipe].replace(/^\s*\|/, '').trim();
    const description = (secondPipe >= 0
        ? bodyLines.slice(firstPipe + 1, secondPipe)
        : bodyLines.slice(firstPipe + 1))
        .join('\n')
        .trim();
    const imageText = secondPipe >= 0 ? bodyLines[secondPipe].replace(/^\s*\|/, '').trim() : '';
    const after = secondPipe >= 0 ? bodyLines.slice(secondPipe + 1).join('\n').trim() : '';
    return {
        token: {
            type: 'linkCard',
            title,
            description,
            cover: attrs.cover || '',
            url: attrs.href || attrs.url || '',
            before,
            after,
            imageText,
        },
        endIndex,
    };
}

function parseHtmlBlock(lines, startIndex) {
    const first = lines[startIndex];
    const open = first.match(/^\s*<([a-z][\w:-]*)(?:\s[^>]*)?>/i);
    if (!open) return null;

    const tag = open[1].toLowerCase();
    if (tag === 'link' || tag === 'carrot-image') return null;
    if (DROP_HTML_TAGS.has(tag)) return null;

    const closeRe = new RegExp(`</${tag}>\\s*$`, 'i');
    if (closeRe.test(first) && looksLikeHtmlFragment(first)) {
        return {
            token: {
                type: 'htmlBlock',
                body: first.trim(),
            },
            endIndex: startIndex,
        };
    }

    const bodyLines = [first];
    for (let endIndex = startIndex + 1; endIndex < lines.length; endIndex += 1) {
        bodyLines.push(lines[endIndex]);
        if (closeRe.test(lines[endIndex])) {
            const body = bodyLines.join('\n').trim();
            if (!looksLikeHtmlFragment(body)) return null;
            return {
                token: {
                    type: 'htmlBlock',
                    body,
                },
                endIndex,
            };
        }
    }

    return null;
}

function parseLine(line, isUser) {
    if (/<!--\s*([^<>]+?)\.qqr\s*-->/i.test(line)) {
        return {
            type: 'qqrLine',
            body: line,
        };
    }

    if (isUser) {
        const carrotImage = line.match(/^\s*<carrot-image\b([^>]*)>([\s\S]*?)<\/carrot-image>\s*$/i);
        if (carrotImage) {
            const attrs = parseAttrs(carrotImage[1]);
            if (attrs.src) {
                return {
                    type: 'carrotImage',
                    src: attrs.src,
                    note: carrotImage[2].trim(),
                };
            }
        }
    }

    // v8.0 旧链接卡片：[link|title|desc|cover]url[/link]（兼容历史消息）
    // 仅在用户消息里渲染（AI 不会输出这个 token）
    if (isUser) {
        const link = line.match(/^\s*\[link\|([^|]*)\|([^|]*)\|([^\]]*)\](https?:\/\/[^\s\[]+)\[\/link\]\s*$/);
        if (link) {
            return {
                type: 'linkCard',
                title: link[1].trim(),
                description: link[2].trim(),
                cover: link[3].trim(),
                url: link[4].trim(),
            };
        }
    }

    const timestamp = line.match(/^\s*『([\s\S]*?)\s+\|\s*([\s\S]*?)』\s*$/);
    if (timestamp) {
        return {
            type: 'timestamp',
            time: timestamp[1].trim(),
            text: timestamp[2].trim(),
        };
    }

    const quote = isUser
        ? line.match(/^\s*“([\s\S]*)”\s*$/)
        : line.match(/^\s*"([\s\S]*)"\s*$/);
    if (quote) {
        const body = quote[1];
        if (looksLikeHtmlFragment(body)) {
            return {
                type: 'htmlBlock',
                body,
            };
        }
        return {
            type: 'textBubble',
            body,
        };
    }

    const dimension = line.match(/^\s*\[([^|\]]+)\|([^|\]]+)\|([^\]]+)\]\s*$/);
    if (dimension) {
        return {
            type: 'dimensionBubble',
            title: dimension[1].trim(),
            value: dimension[2].trim(),
            note: dimension[3].trim(),
        };
    }

    const system = line.match(/^\s*\+([\s\S]*)\+\s*$/);
    if (system) {
        return {
            type: 'system',
            body: system[1].trim(),
        };
    }

    const recall = line.match(/^\s*-([\s\S]*)-\s*$/);
    if (recall) {
        return {
            type: 'recall',
            body: recall[1].trim(),
        };
    }

    if (looksLikeHtmlFragment(line)) {
        return {
            type: 'htmlBlock',
            body: line.trim(),
        };
    }

    return {
        type: 'text',
        body: line,
    };
}

function parseTokens(text, isUser) {
    const lines = normalizeText(text).split('\n');
    const tokens = [];
    let changed = false;

    for (let i = 0; i < lines.length; i += 1) {
        if (/^\s*$/.test(lines[i])) continue;

        const linkBlock = parseLinkBlock(lines, i, isUser);
        if (linkBlock) {
            tokens.push(linkBlock.token);
            i = linkBlock.endIndex;
            changed = true;
            continue;
        }

        const voice = parseVoiceBlock(lines, i);
        if (voice) {
            tokens.push(voice.token);
            i = voice.endIndex;
            changed = true;
            continue;
        }

        const htmlBlock = parseHtmlBlock(lines, i);
        if (htmlBlock) {
            tokens.push(htmlBlock.token);
            i = htmlBlock.endIndex;
            changed = true;
            continue;
        }

        const token = parseLine(lines[i], isUser);
        if (token.type !== 'text') changed = true;
        tokens.push(token);
    }

    return changed ? tokens : null;
}

function isTailBubbleToken(token) {
    return token.type === 'textBubble' || token.type === 'voiceBubble' || token.type === 'dimensionBubble';
}

function shouldRenderTail(tokens, index, preset) {
    if (preset === 'avatarTransparent') return true;
    if (!isTailBubbleToken(tokens[index])) return true;
    for (let i = index + 1; i < tokens.length; i += 1) {
        if (isTailBubbleToken(tokens[i])) return false;
        if (tokens[i].type !== 'text' || String(tokens[i].body || '').trim()) return true;
    }
    return true;
}

function getMessageFormattingContext(element, isUser) {
    try {
        const ctx = window.SillyTavern?.getContext?.();
        if (!ctx || typeof ctx.messageFormatting !== 'function') return null;
        const messageId = getMessageId(element);
        const message = messageId !== null ? (ctx.chat?.[messageId] || null) : null;
        const chName = message?.name || '';
        const isSystem = !!message?.is_system;
        return {
            format: (text) => ctx.messageFormatting(text, chName, isSystem, isUser, messageId),
        };
    } catch (error) {
        return null;
    }
}

function renderTokens(element, tokens, isUser, documentRef, preset, sourceText) {
    const side = isUser ? 'user' : 'char';
    originalHtmlByElement.set(element, element.innerHTML);

    element.setAttribute(RENDERING_ATTR, 'true');
    element.innerHTML = '';
    element.setAttribute(PROCESSED_ATTR, 'true');
    element.dataset.carrotFormatSource = sourceText;
    element.dataset.carrotFormatPreset = preset;

    const rendered = documentRef.createElement('div');
    rendered.className = RENDERED_CLASS;
    const formatContext = getMessageFormattingContext(element, isUser);
    let textBuffer = [];
    const flushTextBuffer = () => {
        if (!textBuffer.length) return;
        const merged = textBuffer.join('\n').replace(/^\n+|\n+$/g, '');
        textBuffer = [];
        if (!merged.trim()) return;
        const line = createTextLine(documentRef, { body: merged });
        if (formatContext) {
            try {
                const formatted = formatContext.format(merged);
                if (typeof formatted === 'string' && formatted.length) {
                    line.textContent = '';
                    line.innerHTML = formatted;
                }
            } catch (error) { /* keep plain textContent */ }
        }
        rendered.appendChild(line);
    };
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token.type === 'text') {
            if (String(token.body || '').trim() === '') {
                flushTextBuffer();
            } else {
                textBuffer.push(token.body);
            }
            continue;
        }
        flushTextBuffer();
        if (token.type === 'carrotImage') {
            // 收集相邻的连续图片：≥2 张就堆叠成 iOS 短信式一摞，点击展开成网格
            const group = [token];
            let j = index + 1;
            while (j < tokens.length && tokens[j].type === 'carrotImage') {
                group.push(tokens[j]);
                j += 1;
            }
            if (group.length >= 2) {
                rendered.appendChild(createCarrotImageStack(documentRef, group, side));
            } else {
                rendered.appendChild(createCarrotImage(documentRef, token, side));
            }
            index = j - 1;
            continue;
        }
        const bubbleOptions = { hasTail: shouldRenderTail(tokens, index, preset) };
        if (token.type === 'textBubble') {
            rendered.appendChild(createTextBubble(documentRef, token, side, preset, bubbleOptions));
        } else if (token.type === 'voiceBubble') {
            rendered.appendChild(createVoiceBubble(documentRef, token, side, preset, bubbleOptions));
        } else if (token.type === 'dimensionBubble') {
            rendered.appendChild(createDimensionBubble(documentRef, token, side, preset, bubbleOptions));
        } else if (token.type === 'htmlBlock') {
            rendered.appendChild(createHtmlBlock(documentRef, token, side));
        } else if (token.type === 'timestamp') {
            rendered.appendChild(createTimestampLine(documentRef, token));
        } else if (token.type === 'system') {
            rendered.appendChild(createSystemLine(documentRef, token));
        } else if (token.type === 'recall') {
            rendered.appendChild(createRecallLine(documentRef, token));
        } else if (token.type === 'linkCard') {
            rendered.appendChild(createLinkCard(documentRef, token, side));
        } else if (token.type === 'qqrLine') {
            rendered.appendChild(createQqrLine(documentRef, token));
        }
    }
    flushTextBuffer();

    element.appendChild(rendered);
    setTimeout(() => {
        element.removeAttribute(RENDERING_ATTR);
    }, 0);
}

function restoreElement(element) {
    if (!element || element.getAttribute(PROCESSED_ATTR) !== 'true') return false;
    const renderedSource = element.dataset.carrotFormatSource || '';
    const currentSource = getChatMessageText(element);
    const originalHtml = originalHtmlByElement.get(element);

    if (currentSource !== null && currentSource !== renderedSource) {
        element.textContent = currentSource;
    } else if (originalHtml !== undefined) {
        element.innerHTML = originalHtml;
    } else {
        element.textContent = currentSource ?? renderedSource;
    }
    element.removeAttribute(PROCESSED_ATTR);
    delete element.dataset.carrotFormatSource;
    delete element.dataset.carrotFormatPreset;
    return true;
}

export function applyFormatRendering(
    element,
    { enabled = true, documentRef = document, preset = 'ios', force = false } = {},
) {
    if (!element) return false;
    if (!enabled) return restoreElement(element);

    if (element.getAttribute(PROCESSED_ATTR) === 'true') {
        const source = element.dataset.carrotFormatSource || '';
        const renderedPreset = element.dataset.carrotFormatPreset || 'ios';
        const current = readSourceText(element);
        const hasRenderedContent = !!element.querySelector(`:scope > .${RENDERED_CLASS}`);
        if (!force && source === current && renderedPreset === preset && hasRenderedContent) return false;
        restoreElement(element);
    }

    const user = isUserMessage(element);
    const sourceText = readSourceText(element);
    const tokens = parseTokens(sourceText, user);
    if (!tokens) return false;
    renderTokens(element, tokens, user, documentRef, preset, sourceText);
    return true;
}

export function initFormatRenderer({
    documentRef = document,
    getEnabled = () => true,
    getPreset = () => 'ios',
    afterProcess = null,
} = {}) {
    const processElement = (element, options = {}) => {
        const changed = applyFormatRendering(element, {
            enabled: getEnabled(),
            documentRef,
            preset: getPreset(),
            force: !!options.force,
        });
        rewriteCatboxMedia(element, documentRef);
        if (typeof afterProcess === 'function') {
            afterProcess(element, { sourceText: readSourceText(element) });
        }
        return changed;
    };

    const pendingElements = new Set();
    const forcedElements = new Set();
    let flushHandle = 0;

    const isStreaming = () => {
        try {
            const ctx = window.SillyTavern?.getContext?.();
            if (ctx?.streamingProcessor) return true;
        } catch (error) { /* ignore */ }
        const stop = documentRef.getElementById('mes_stop');
        if (stop && stop.style.display !== 'none' && stop.offsetParent !== null) return true;
        return false;
    };

    const flushPending = () => {
        flushHandle = 0;
        const streaming = isStreaming();
        let streamingMes = null;
        if (streaming) {
            const lastMes = documentRef.querySelector('#chat .mes.last_mes');
            const isUserLast = !!lastMes && (
                lastMes.getAttribute('is_user') === 'true'
                || lastMes.classList.contains('is_user')
                || lastMes.classList.contains('user_mes')
            );
            if (lastMes && !isUserLast) streamingMes = lastMes;
        }
        const flushSet = (set, options) => {
            if (!set.size) return;
            const items = Array.from(set);
            set.clear();
            items.forEach((element) => {
                if (!element.isConnected) return;
                if (streamingMes && streamingMes.contains(element)) {
                    set.add(element);
                    return;
                }
                processElement(element, options);
            });
        };
        flushSet(pendingElements, {});
        flushSet(forcedElements, { force: true });
        if (streaming && (pendingElements.size || forcedElements.size)) {
            scheduleFlush(250);
        }
    };

    const scheduleFlush = (delayMs = 0) => {
        if (flushHandle) return;
        if (delayMs > 0) {
            flushHandle = setTimeout(flushPending, delayMs);
        } else if (typeof requestAnimationFrame === 'function') {
            flushHandle = requestAnimationFrame(flushPending);
        } else {
            flushHandle = setTimeout(flushPending, 16);
        }
    };

    const observeChat = (chatContainer) => {
        chatContainer.querySelectorAll('.mes_text').forEach(processElement);

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                const mutationElement =
                    mutation.target?.nodeType === Node.ELEMENT_NODE
                        ? mutation.target
                        : mutation.target?.parentElement;
                const renderedElement = mutationElement?.closest?.(`.${RENDERED_CLASS}`);
                if (renderedElement) {
                    const element = renderedElement.closest?.('.mes_text');
                    if (element && element.getAttribute(RENDERING_ATTR) !== 'true') {
                        forcedElements.add(element);
                    }
                    continue;
                }

                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.classList?.contains('mes_text')) pendingElements.add(node);
                        node.querySelectorAll?.('.mes_text').forEach((el) => pendingElements.add(el));
                    } else {
                        const element = node.parentElement?.closest?.('.mes_text');
                        if (element) pendingElements.add(element);
                    }
                });
            }
            if (pendingElements.size || forcedElements.size) scheduleFlush();
        });

        observer.observe(chatContainer, {
            childList: true,
            subtree: true,
        });

        try {
            const ctx = window.SillyTavern?.getContext?.();
            const eventSource = ctx?.eventSource;
            const eventTypes = ctx?.eventTypes || ctx?.event_types;
            if (eventSource && eventTypes) {
                const rerenderLast = () => {
                    const last = chatContainer.querySelector('.mes.last_mes .mes_text');
                    if (last) {
                        forcedElements.add(last);
                        scheduleFlush();
                    }
                };
                const rerenderAll = () => {
                    chatContainer.querySelectorAll('.mes_text').forEach((el) => forcedElements.add(el));
                    scheduleFlush();
                };
                const finishedEvents = [
                    eventTypes.CHARACTER_MESSAGE_RENDERED,
                    eventTypes.USER_MESSAGE_RENDERED,
                    eventTypes.MESSAGE_RECEIVED,
                    eventTypes.MESSAGE_SENT,
                    eventTypes.MESSAGE_EDITED,
                    eventTypes.MESSAGE_SWIPED,
                    eventTypes.GENERATION_ENDED,
                ].filter(Boolean);
                finishedEvents.forEach((evt) => eventSource.on(evt, rerenderLast));
                if (eventTypes.CHAT_CHANGED) eventSource.on(eventTypes.CHAT_CHANGED, rerenderAll);
            }
        } catch (error) {
            console.warn('胡萝卜插件：ST 事件绑定失败，将仅依赖 DOM 观察', error);
        }
    };

    const setup = () => {
        const chatContainer = documentRef.getElementById('chat');
        if (!chatContainer) return false;
        observeChat(chatContainer);
        return true;
    };

    if (!setup()) {
        const bodyObserver = new MutationObserver(() => {
            if (setup()) bodyObserver.disconnect();
        });
        bodyObserver.observe(documentRef.body, {
            childList: true,
            subtree: true,
        });
    }

    return {
        reprocess: () => {
            const chatContainer = documentRef.getElementById('chat');
            if (!chatContainer) return;
            chatContainer.querySelectorAll('.mes_text').forEach(processElement);
        },
    };
}
