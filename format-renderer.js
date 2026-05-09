const PROCESSED_ATTR = 'data-carrot-format-rendered';
const RENDERED_CLASS = 'carrot-format-rendered';
const originalHtmlByElement = new WeakMap();
let rendererEnabled = true;

window.carrotFormatRendererLoaded = true;

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

function isUserMessage(element) {
    const mes = element?.closest?.('.mes');
    const messageId = getMessageId(element);
    try {
        const chat = window.SillyTavern?.getContext?.()?.chat || [];
        if (messageId !== null && chat[messageId]) {
            return !!chat[messageId].is_user;
        }
    } catch (e) {}
    if (!mes) return false;
    return (
        mes.classList.contains('user_mes') ||
        mes.classList.contains('is_user') ||
        mes.getAttribute('is_user') === 'true' ||
        mes.dataset?.isUser === 'true'
    );
}

function isComplexMessage(element) {
    return !!element.querySelector(
        [
            'video',
            'audio',
            'canvas',
            'table',
            'pre',
            'code',
            '.mes_reasoning',
            '.sticker',
            '.carrot-format-rendered',
        ].join(','),
    );
}

function getLineImages(nodes) {
    const images = [];
    nodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (node.matches?.('img')) images.push(node);
        node.querySelectorAll?.('img').forEach((img) => images.push(img));
    });
    return images;
}

function lineHasMedia(nodes) {
    return nodes.some((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return false;
        return node.matches?.('img, video, audio, canvas, table, pre, code')
            || !!node.querySelector?.('img, video, audio, canvas, table, pre, code');
    });
}

function splitDomLines(element) {
    const host = element.querySelector('p') || element;
    const lines = [];
    let current = [];
    host.childNodes.forEach((node) => {
        if (node.nodeName === 'BR') {
            lines.push(current);
            current = [];
        } else {
            current.push(node);
        }
    });
    lines.push(current);
    return lines;
}

function normalizeText(text) {
    return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function readMessageText(element) {
    return normalizeText(element?.innerText || element?.textContent || '');
}

function parseQuoteLine(line, isUser) {
    const match = isUser
        ? line.match(/^\s*“([\s\S]+)”\s*$/)
        : line.match(/^\s*"([\s\S]+)"\s*$/);
    if (!match) return null;
    if (/^\[[^|\]]+\]$/.test(match[1].trim())) return null;
    return {
        type: 'textBubble',
        body: match[1],
    };
}

function parseDimensionLine(line, isUser) {
    const match = isUser
        ? line.match(/^\s*\[([^|\]]+)\|([^|\]]+)\|([^\]]+)\]\s*$/)
        : line.match(/^\s*"\[([^|\]]+)\|([^|\]]+)\|([^\]]+)\]"\s*$/);
    if (!match) return null;
    return {
        type: 'dimensionBubble',
        title: match[1],
        value: match[2],
        note: match[3],
    };
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
            break;
        }
        endIndex += 1;
        if (endIndex >= lines.length) return null;
        bodyLines.push(lines[endIndex]);
    }

    return {
        token: {
            type: 'voiceBubble',
            title,
            body: bodyLines.join('\n').trim(),
        },
        endIndex,
    };
}

function parseTokens(text, isUser) {
    const lines = normalizeText(text).split('\n');
    const tokens = [];
    let changed = false;

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];

        const voice = parseVoiceBlock(lines, i);
        if (voice) {
            tokens.push(voice.token);
            i = voice.endIndex;
            changed = true;
            continue;
        }

        const dimension = parseDimensionLine(line, isUser);
        if (dimension) {
            tokens.push(dimension);
            changed = true;
            continue;
        }

        const quote = parseQuoteLine(line, isUser);
        if (quote) {
            tokens.push(quote);
            changed = true;
            continue;
        }

        tokens.push({
            type: 'text',
            body: line,
        });
    }

    return changed ? tokens : null;
}

function parseSingleLineToken(text, isUser) {
    return parseDimensionLine(text, isUser)
        || parseQuoteLine(text, isUser)
        || parseVoiceBlock([text], 0)?.token
        || null;
}

function parseStickerBubbleLine(text, nodes, isUser) {
    const images = getLineImages(nodes);
    if (images.length !== 1) return null;

    const expected = isUser
        ? /^\s*“\s*”\s*$/
        : /^\s*"\s*"\s*$/;
    if (!expected.test(text)) return null;

    return {
        type: 'stickerBubble',
        image: images[0],
    };
}

function appendWaveBars(documentRef, parent) {
    const heights = [60, 80, 40, 90, 50, 75];
    heights.forEach((height) => {
        const bar = documentRef.createElement('span');
        bar.className = 'carrot-ios-wave-bar';
        bar.style.setProperty('--carrot-bar-height', `${height}%`);
        parent.appendChild(bar);
    });
}

function createTail(documentRef) {
    const tail = documentRef.createElement('span');
    tail.className = 'carrot-ios-tail';
    return tail;
}

function createBubbleShell(documentRef, side, kind) {
    const line = documentRef.createElement('div');
    line.className = `carrot-ios-line carrot-ios-${side}`;
    const wrap = documentRef.createElement('div');
    wrap.className = `carrot-ios-wrap carrot-ios-${kind}`;
    wrap.appendChild(createTail(documentRef));
    line.appendChild(wrap);
    return { line, wrap };
}

function createTextBubble(documentRef, token, side) {
    const { line, wrap } = createBubbleShell(documentRef, side, 'text');
    const bubble = documentRef.createElement('div');
    bubble.className = 'carrot-ios-bubble';
    bubble.textContent = token.body;
    wrap.appendChild(bubble);
    return line;
}

function createStickerBubble(documentRef, token, side) {
    const { line, wrap } = createBubbleShell(documentRef, side, 'sticker');
    const bubble = documentRef.createElement('div');
    bubble.className = 'carrot-ios-bubble carrot-ios-sticker-bubble';
    bubble.appendChild(token.image.cloneNode(true));
    wrap.appendChild(bubble);
    return line;
}

function createVoiceBubble(documentRef, token, side) {
    const { line, wrap } = createBubbleShell(documentRef, side, 'voice');
    const details = documentRef.createElement('details');
    details.className = 'carrot-ios-bubble carrot-ios-voice-details';

    const summary = documentRef.createElement('summary');
    summary.className = 'carrot-ios-voice-summary';
    const play = documentRef.createElement('span');
    play.className = 'carrot-ios-play';
    play.textContent = '▶';
    const wave = documentRef.createElement('span');
    wave.className = 'carrot-ios-wave';
    appendWaveBars(documentRef, wave);
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

function createDimensionBubble(documentRef, token, side) {
    const { line, wrap } = createBubbleShell(documentRef, side, 'dimension');
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

function createTextLine(documentRef, token) {
    const line = documentRef.createElement('div');
    line.className = 'carrot-format-text-line';
    line.textContent = token.body || '\u00a0';
    return line;
}

function createOriginalLine(documentRef, nodes) {
    const line = documentRef.createElement('div');
    line.className = 'carrot-format-original-line';
    nodes.forEach((node) => line.appendChild(node.cloneNode(true)));
    return line;
}

function renderTokens(element, tokens, isUser, documentRef) {
    const side = isUser ? 'user' : 'char';
    const sourceText = readMessageText(element);

    if (!originalHtmlByElement.has(element)) {
        originalHtmlByElement.set(element, element.innerHTML);
    }
    element.innerHTML = '';
    element.setAttribute(PROCESSED_ATTR, 'true');
    element.dataset.carrotFormatSource = sourceText;

    const rendered = documentRef.createElement('div');
    rendered.className = RENDERED_CLASS;
    tokens.forEach((token) => {
        if (token.type === 'textBubble') {
            rendered.appendChild(createTextBubble(documentRef, token, side));
        } else if (token.type === 'stickerBubble') {
            rendered.appendChild(createStickerBubble(documentRef, token, side));
        } else if (token.type === 'voiceBubble') {
            rendered.appendChild(createVoiceBubble(documentRef, token, side));
        } else if (token.type === 'dimensionBubble') {
            rendered.appendChild(createDimensionBubble(documentRef, token, side));
        } else if (token.type === 'originalLine') {
            rendered.appendChild(createOriginalLine(documentRef, token.nodes));
        } else {
            rendered.appendChild(createTextLine(documentRef, token));
        }
    });

    element.append(rendered);
}

function restoreElement(element) {
    if (!element || element.getAttribute(PROCESSED_ATTR) !== 'true') return false;
    const originalHtml = originalHtmlByElement.get(element);
    if (originalHtml !== undefined) {
        element.innerHTML = originalHtml;
    } else {
        element.textContent = element.dataset.carrotFormatSource || '';
    }
    element.removeAttribute(PROCESSED_ATTR);
    delete element.dataset.carrotFormatSource;
    return true;
}

function parseMixedDomTokens(element, isUser) {
    const lines = splitDomLines(element);
    const tokens = [];
    let changed = false;

    lines.forEach((nodes) => {
        const text = normalizeText(nodes.map((node) => node.innerText || node.textContent || '').join('')).trim();
        const sticker = parseStickerBubbleLine(text, nodes, isUser);
        if (sticker) {
            tokens.push(sticker);
            changed = true;
            return;
        }
        if (lineHasMedia(nodes)) {
            tokens.push({ type: 'originalLine', nodes });
            return;
        }
        const token = parseSingleLineToken(text, isUser);
        if (token) {
            tokens.push(token);
            changed = true;
        } else {
            tokens.push({ type: 'text', body: text });
        }
    });

    return changed ? tokens : null;
}

export function applyFormatRendering(element, { documentRef = document } = {}) {
    if (!element) return false;
    if (!rendererEnabled) {
        return restoreElement(element);
    }
    if (element.getAttribute(PROCESSED_ATTR) === 'true') {
        const source = element.dataset.carrotFormatSource || '';
        const current = readMessageText(element);
        if (source === current) return false;
        element.removeAttribute(PROCESSED_ATTR);
        delete element.dataset.carrotFormatSource;
    }
    if (isComplexMessage(element)) return false;

    const user = isUserMessage(element);
    const text = readMessageText(element);
    const tokens = element.querySelector('img')
        ? parseMixedDomTokens(element, user)
        : parseTokens(text, user);
    if (!tokens) return false;

    renderTokens(element, tokens, user, documentRef);
    return true;
}

export function setFormatRendererEnabled(enabled, { documentRef = document } = {}) {
    rendererEnabled = enabled !== false;
    const chatContainer = documentRef.getElementById('chat');
    if (!chatContainer) return;
    chatContainer.querySelectorAll('.mes_text').forEach((element) => {
        if (rendererEnabled) {
            applyFormatRendering(element, { documentRef });
        } else {
            restoreElement(element);
        }
    });
}

window.carrotFormatDebug = (selector = '.mes_text') => {
    const element = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!element) return { found: false };
    const mes = element.closest?.('.mes');
    const user = isUserMessage(element);
    const text = readMessageText(element);
    return {
        found: true,
        user,
        complex: isComplexMessage(element),
        processed: element.getAttribute(PROCESSED_ATTR),
        text,
        lines: text.split('\n'),
        tokens: parseTokens(text, user),
        classes: element.className,
        htmlPreview: element.innerHTML?.slice?.(0, 500) || '',
        parentClasses: mes?.className || '',
        parentText: normalizeText(mes?.innerText || '').slice(0, 1000),
        parentHtmlPreview: mes?.innerHTML?.slice?.(0, 1000) || '',
        descendants: Array.from(mes?.querySelectorAll?.('*') || []).slice(0, 40).map((node) => ({
            tag: node.tagName,
            className: node.className,
            id: node.id,
            text: normalizeText(node.innerText || node.textContent || '').slice(0, 120),
        })),
        mesid: getMessageId(element),
    };
};

window.carrotFormatApplyAll = () => {
    let count = 0;
    document.querySelectorAll('#chat .mes_text').forEach((element) => {
        if (applyFormatRendering(element)) count += 1;
    });
    return count;
};

window.carrotFormatScan = () => {
    const chat = document.getElementById('chat');
    if (!chat) return { chatFound: false };
    return {
        chatFound: true,
        mesCount: chat.querySelectorAll('.mes').length,
        mesTextCount: chat.querySelectorAll('.mes_text').length,
        candidates: Array.from(chat.querySelectorAll('.mes')).map((mes, index) => {
            const textNode = mes.querySelector('.mes_text');
            const text = normalizeText(textNode?.innerText || textNode?.textContent || mes.innerText || '');
            return {
                index,
                className: mes.className,
                mesid: mes.getAttribute('mesid') || mes.dataset?.mesid || '',
                isUser: isUserMessage(textNode || mes),
                hasMesText: !!textNode,
                mesTextHtml: textNode?.innerHTML?.slice?.(0, 300) || '',
                text: text.trim().slice(0, 500),
                tokens: textNode ? parseTokens(text, isUserMessage(textNode)) : null,
            };
        }),
    };
};

export function initFormatRenderer({ documentRef = document } = {}) {
    const processElement = (element) => applyFormatRendering(element, { documentRef });

    const observeChat = (chatContainer) => {
        chatContainer.querySelectorAll('.mes_text').forEach(processElement);

        const observer = new MutationObserver((mutations) => {
            const pending = new Set();
            mutations.forEach((mutation) => {
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
            pending.forEach((element) => {
                setTimeout(() => processElement(element), 0);
            });
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

    if (setup()) {
        return {
            setEnabled: (enabled) => setFormatRendererEnabled(enabled, { documentRef }),
            reprocess: () => setFormatRendererEnabled(rendererEnabled, { documentRef }),
        };
    }

    const bodyObserver = new MutationObserver(() => {
        if (setup()) bodyObserver.disconnect();
    });
    bodyObserver.observe(documentRef.body, {
        childList: true,
        subtree: true,
    });

    return {
        setEnabled: (enabled) => setFormatRendererEnabled(enabled, { documentRef }),
        reprocess: () => setFormatRendererEnabled(rendererEnabled, { documentRef }),
    };
}
