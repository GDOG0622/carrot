const PROCESSED_ATTR = 'data-carrot-format-rendered';
const RENDERED_CLASS = 'carrot-format-rendered';
const originalHtmlByElement = new WeakMap();

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

function readMessageText(element) {
    return normalizeText(element?.innerText || element?.textContent || '');
}

function readSourceText(element) {
    return getChatMessageText(element) ?? readMessageText(element);
}

function createBubbleShell(documentRef, side, kind = 'text') {
    const line = documentRef.createElement('div');
    line.className = `carrot-ios-line carrot-ios-${side}`;
    const wrap = documentRef.createElement('div');
    wrap.className = `carrot-ios-wrap carrot-ios-${kind}`;
    const tail = documentRef.createElement('span');
    tail.className = 'carrot-ios-tail';
    wrap.appendChild(tail);
    line.appendChild(wrap);
    return { line, wrap };
}

function createTextBubble(documentRef, token, side, preset) {
    if (preset === 'avatarTransparent') {
        return createAvatarTransparentBubble(documentRef, token, side);
    }
    const { line, wrap } = createBubbleShell(documentRef, side, 'text');
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

function createVoiceBubble(documentRef, token, side, preset) {
    if (preset === 'avatarTransparent') {
        return createAvatarTransparentVoice(documentRef, token, side);
    }
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

function createDimensionBubble(documentRef, token, side, preset) {
    if (preset === 'avatarTransparent') {
        return createAvatarTransparentDimension(documentRef, token, side);
    }
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
        return {
            type: 'textBubble',
            body: quote[1],
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

function renderTokens(element, tokens, isUser, documentRef, preset, sourceText) {
    const side = isUser ? 'user' : 'char';
    originalHtmlByElement.set(element, element.innerHTML);

    element.innerHTML = '';
    element.setAttribute(PROCESSED_ATTR, 'true');
    element.dataset.carrotFormatSource = sourceText;
    element.dataset.carrotFormatPreset = preset;

    const rendered = documentRef.createElement('div');
    rendered.className = RENDERED_CLASS;
    tokens.forEach((token) => {
        if (token.type === 'textBubble') {
            rendered.appendChild(createTextBubble(documentRef, token, side, preset));
        } else if (token.type === 'voiceBubble') {
            rendered.appendChild(createVoiceBubble(documentRef, token, side, preset));
        } else if (token.type === 'dimensionBubble') {
            rendered.appendChild(createDimensionBubble(documentRef, token, side, preset));
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
    { enabled = true, documentRef = document, preset = 'ios' } = {},
) {
    if (!element) return false;
    if (!enabled) return restoreElement(element);

    if (element.getAttribute(PROCESSED_ATTR) === 'true') {
        const source = element.dataset.carrotFormatSource || '';
        const renderedPreset = element.dataset.carrotFormatPreset || 'ios';
        const current = readSourceText(element);
        const hasRenderedContent = !!element.querySelector(`:scope > .${RENDERED_CLASS}`);
        if (source === current && renderedPreset === preset && hasRenderedContent) return false;
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
    const processElement = (element) => {
        const changed = applyFormatRendering(element, {
            enabled: getEnabled(),
            documentRef,
            preset: getPreset(),
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
            mutations.forEach((mutation) => {
                const mutationElement =
                    mutation.target?.nodeType === Node.ELEMENT_NODE
                        ? mutation.target
                        : mutation.target?.parentElement;
                if (mutationElement?.closest?.(`.${RENDERED_CLASS}`)) return;

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
