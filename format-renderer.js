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
]);
const DROP_HTML_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'svg']);
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

function createTextLine(documentRef, token) {
    const line = documentRef.createElement('div');
    line.className = 'carrot-render-text-line';
    line.textContent = token.body || '\u00a0';
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

function parseLine(line, isUser) {
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

        const voice = parseVoiceBlock(lines, i);
        if (voice) {
            tokens.push(voice.token);
            i = voice.endIndex;
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
    tokens.forEach((token, index) => {
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
        } else {
            rendered.appendChild(createTextLine(documentRef, token));
        }
    });

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
        if (typeof afterProcess === 'function') {
            afterProcess(element);
        }
        return changed;
    };

    const observeChat = (chatContainer) => {
        chatContainer.querySelectorAll('.mes_text').forEach(processElement);

        const observer = new MutationObserver((mutations) => {
            const pending = new Set();
            const forced = new Set();
            mutations.forEach((mutation) => {
                const mutationElement =
                    mutation.target?.nodeType === Node.ELEMENT_NODE
                        ? mutation.target
                        : mutation.target?.parentElement;
                const renderedElement = mutationElement?.closest?.(`.${RENDERED_CLASS}`);
                if (renderedElement) {
                    const element = renderedElement.closest?.('.mes_text');
                    if (element && element.getAttribute(RENDERING_ATTR) !== 'true') {
                        forced.add(element);
                    }
                    return;
                }

                if (mutation.type === 'characterData') {
                    const element = mutation.target.parentElement?.closest?.('.mes_text');
                    if (element) pending.add(element);
                    return;
                }

                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.classList?.contains('mes_text')) pending.add(node);
                        node.querySelectorAll?.('.mes_text').forEach((el) => pending.add(el));
                    } else {
                        const element = node.parentElement?.closest?.('.mes_text');
                        if (element) pending.add(element);
                    }
                });
            });
            pending.forEach((element) => setTimeout(() => processElement(element), 0));
            forced.forEach((element) => setTimeout(() => processElement(element, { force: true }), 0));
        });

        observer.observe(chatContainer, {
            childList: true,
            subtree: true,
            characterData: true,
        });
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
