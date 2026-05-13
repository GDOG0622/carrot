import { getSettings, saveSettings } from './config.js';

const STORAGE_KEY = 'cip_regex_enabled_v1';
const RULE_SETTINGS_KEY = 'cip_regex_rule_settings_v1';
const DEFAULT_REGEX_ENABLED = true;
const originalContentMap = new WeakMap();

const defaultDocument = typeof document !== 'undefined' ? document : null;
const TEXT_NODE_FILTER =
    typeof NodeFilter !== 'undefined' ? NodeFilter.SHOW_TEXT : 4;

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
    } catch (error) {}

    if (!mes) return false;
    return (
        mes.classList.contains('user_mes') ||
        mes.classList.contains('is_user') ||
        mes.getAttribute('is_user') === 'true' ||
        mes.dataset?.isUser === 'true'
    );
}

function createBubbleShell(documentRef, sourceNode, kind = 'text') {
    const doc = documentRef || defaultDocument;
    if (!doc) return {};
    const side = isUserMessage(sourceNode) ? 'user' : 'char';
    const line = doc.createElement('div');
    line.className = `carrot-ios-line carrot-ios-${side}`;
    const wrap = doc.createElement('div');
    wrap.className = `carrot-ios-wrap carrot-ios-${kind}`;
    const tail = doc.createElement('span');
    tail.className = 'carrot-ios-tail';
    wrap.appendChild(tail);
    line.appendChild(wrap);
    return { line, wrap, side };
}

function createTextBubbleNode({ documentRef, sourceNode, text }) {
    const doc = documentRef || defaultDocument;
    if (!doc) return null;
    const { line, wrap } = createBubbleShell(doc, sourceNode, 'text');
    const bubble = doc.createElement('div');
    bubble.className = 'carrot-ios-bubble';
    bubble.textContent = text;
    wrap.appendChild(bubble);
    return line;
}

function createVoiceBubbleNode({ documentRef, sourceNode, title, body }) {
    const doc = documentRef || defaultDocument;
    if (!doc) return null;
    const { line, wrap } = createBubbleShell(doc, sourceNode, 'voice');
    const details = doc.createElement('details');
    details.className = 'carrot-ios-bubble carrot-ios-voice-details';

    const summary = doc.createElement('summary');
    summary.className = 'carrot-ios-voice-summary';

    const play = doc.createElement('span');
    play.className = 'carrot-ios-play';
    play.textContent = '▶';

    const wave = doc.createElement('span');
    wave.className = 'carrot-ios-wave';
    [60, 80, 40, 90, 50, 75].forEach((height) => {
        const bar = doc.createElement('span');
        bar.className = 'carrot-ios-wave-bar';
        bar.style.setProperty('--carrot-bar-height', `${height}%`);
        wave.appendChild(bar);
    });

    const titleNode = doc.createElement('span');
    titleNode.className = 'carrot-ios-voice-title';
    titleNode.textContent = title;
    summary.append(play, wave, titleNode);

    const bodyNode = doc.createElement('div');
    bodyNode.className = 'carrot-ios-voice-body';
    const paragraph = doc.createElement('p');
    paragraph.textContent = body;
    bodyNode.appendChild(paragraph);

    details.append(summary, bodyNode);
    wrap.appendChild(details);
    return line;
}

function createDimensionBubbleNode({ documentRef, sourceNode, title, value, note }) {
    const doc = documentRef || defaultDocument;
    if (!doc) return null;
    const { line, wrap } = createBubbleShell(doc, sourceNode, 'dimension');
    const bubble = doc.createElement('div');
    bubble.className = 'carrot-ios-bubble carrot-ios-dimension-card';

    const titleNode = doc.createElement('span');
    titleNode.className = 'carrot-ios-dimension-title';
    titleNode.textContent = title;
    const valueNode = doc.createElement('span');
    valueNode.className = 'carrot-ios-dimension-value';
    valueNode.textContent = value;
    const noteNode = doc.createElement('span');
    noteNode.className = 'carrot-ios-dimension-note';
    noteNode.textContent = note;

    bubble.append(titleNode, valueNode, noteNode);
    wrap.appendChild(bubble);
    return line;
}

function isBracketOnlyPlaceholder(text) {
    return /^\[[^\[\]]+\]$/.test(String(text || '').trim());
}

const REGEX_RULES = [
    {
        id: 'carrot-ios-text-bubble',
        name: 'iOS 文字气泡',
        patternSource: '^\\s*(?:"([^"\\n]*)"|“([^”\\n]*)”)\\s*$',
        flags: 'gm',
        defaultReplacement: '$1$2',
        createNode({ documentRef, groups, sourceNode }) {
            const body = (groups[0] || groups[1] || '').trim();
            if (!body || isBracketOnlyPlaceholder(body)) return null;
            return createTextBubbleNode({
                documentRef,
                sourceNode,
                text: body,
            });
        },
    },
    {
        id: 'carrot-ios-voice-bubble',
        name: 'iOS 语音气泡',
        patternSource: '^\\s*=([^|=]+)\\|([\\s\\S]*?)=\\s*$',
        flags: 'gm',
        defaultReplacement: '$2',
        createNode({ documentRef, groups, sourceNode }) {
            const [title = '', body = ''] = groups;
            return createVoiceBubbleNode({
                documentRef,
                sourceNode,
                title: title.trim(),
                body: body.trim(),
            });
        },
    },
    {
        id: 'carrot-ios-dimension-bubble',
        name: 'iOS 超次元气泡',
        patternSource: '^\\s*\\[([^|\\]]+)\\|([^|\\]]+)\\|([^\\]]+)\\]\\s*$',
        flags: 'gm',
        defaultReplacement: '$3',
        createNode({ documentRef, groups, sourceNode }) {
            const [title = '', value = '', note = ''] = groups;
            return createDimensionBubbleNode({
                documentRef,
                sourceNode,
                title: title.trim(),
                value: value.trim(),
                note: note.trim(),
            });
        },
    },
    {
        id: 'bhl-timestamp',
        name: '时间戳',
        patternSource: '^『(.*?) \\|(.*?)』$',
        flags: 'gm',
        defaultReplacement: '$1   $2',
        createNode({ documentRef, groups, config }) {
            const doc = documentRef || defaultDocument;
            if (!doc) return null;
            const custom = resolveCustomReplacement({
                documentRef: doc,
                replacement: config?.replacement,
                defaultReplacement: this?.defaultReplacement,
                groups,
            });
            if (custom) return custom;

            const [time = '', text = ''] = groups;
            const container = doc.createElement('div');
            container.style.textAlign = 'center';
            container.style.color = '#8e8e93';
            container.style.fontFamily = "'linja waso', sans-serif";
            container.style.fontSize = '13px';
            container.style.margin = '12px 0';
            const safeTime = time.trim();
            const safeText = text.trim();
            const display = applyTemplate(
                config?.replacement,
                groups,
                `${safeTime}\u00A0\u00A0\u00A0${safeText}`,
            );
            container.textContent = display;
            return container;
        },
    },
    {
        id: 'bhl-bubble-self',
        name: '群-我方气泡',
        patternSource: '\\[(.*?)\\\\(.*?)\\\\(.*?)\\\]',
        flags: 'gm',
        defaultReplacement: '$3',
        createNode({ documentRef, groups, config }) {
            const doc = documentRef || defaultDocument;
            if (!doc) return null;
            const custom = resolveCustomReplacement({
                documentRef: doc,
                replacement: config?.replacement,
                defaultReplacement: this?.defaultReplacement,
                groups,
            });
            if (custom) return custom;

            const [name = '', time = '', message = ''] = groups;

            const container = doc.createElement('div');
            container.style.margin = '0';
            container.style.maxWidth = '75%';
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.alignItems = 'flex-end';
            container.style.marginLeft = 'auto';

            const header = doc.createElement('div');
            header.style.fontSize = '12px';
            header.style.color = '#8a8a8a';
            header.style.marginRight = '5px';
            header.style.marginBottom = '5px';

            const nameSpan = doc.createElement('span');
            nameSpan.textContent = name.trim();

            header.appendChild(nameSpan);

            const bodyWrapper = doc.createElement('div');
            bodyWrapper.style.display = 'flex';
            bodyWrapper.style.alignItems = 'flex-end';
            bodyWrapper.style.width = '100%';
            bodyWrapper.style.justifyContent = 'flex-end';

            const timeSpan = doc.createElement('span');
            timeSpan.style.fontSize = '12px';
            timeSpan.style.color = '#b2b2b2';
            timeSpan.style.marginRight = '8px';
            timeSpan.style.flexShrink = '0';
            timeSpan.textContent = time.trim();

            const bubble = doc.createElement('div');
            bubble.style.backgroundColor = '#8DE041';
            bubble.style.color = '#000000';
            bubble.style.padding = '12px 16px';
            bubble.style.borderRadius = '20px';
            bubble.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.08)';
            bubble.style.position = 'relative';
            bubble.style.maxWidth = '100%';

            const paragraph = doc.createElement('p');
            paragraph.style.margin = '0';
            paragraph.style.whiteSpace = 'pre-wrap';
            paragraph.style.wordWrap = 'break-word';
            paragraph.style.fontSize = '12px';
            paragraph.style.lineHeight = '1.5';
            paragraph.textContent = applyTemplate(
                config?.replacement,
                groups,
                message.trim(),
            );

            bubble.appendChild(paragraph);

            bodyWrapper.appendChild(timeSpan);
            bodyWrapper.appendChild(bubble);

            container.appendChild(header);
            container.appendChild(bodyWrapper);

            return container;
        },
    },
    {
        id: 'bhl-bubble',
        name: '群-对方气泡',
        patternSource: '\\[(.*?)\\/(.*?)\\/(.*?)\\\]',
        flags: 'gm',
        defaultReplacement: '$2',
        createNode({ documentRef, groups, config }) {
            const doc = documentRef || defaultDocument;
            if (!doc) return null;
            const custom = resolveCustomReplacement({
                documentRef: doc,
                replacement: config?.replacement,
                defaultReplacement: this?.defaultReplacement,
                groups,
            });
            if (custom) return custom;

            const [name = '', message = '', time = ''] = groups;

            const container = doc.createElement('div');
            container.style.margin = '0';
            container.style.maxWidth = '75%';
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.alignItems = 'flex-start';

            const header = doc.createElement('div');
            header.style.fontSize = '13px';
            header.style.color = '#8a8a8a';
            header.style.marginLeft = '5px';
            header.style.marginBottom = '5px';
            header.style.display = 'flex';
            header.style.alignItems = 'center';

            const nameSpan = doc.createElement('span');
            nameSpan.style.fontWeight = '300';
            nameSpan.textContent = name.trim();

            header.appendChild(nameSpan);

            const bodyWrapper = doc.createElement('div');
            bodyWrapper.style.display = 'flex';
            bodyWrapper.style.alignItems = 'flex-end';
            bodyWrapper.style.width = '100%';

            const bubble = doc.createElement('div');
            bubble.style.backgroundColor = '#F0EBE3';
            bubble.style.color = '#000000';
            bubble.style.padding = '12px 16px';
            bubble.style.borderRadius = '20px';
            bubble.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.08)';
            bubble.style.position = 'relative';
            bubble.style.maxWidth = '100%';

            const content = doc.createElement('div');
            content.style.margin = '0';
            content.style.whiteSpace = 'pre-wrap';
            content.style.wordWrap = 'break-word';
            content.style.fontSize = '12px';
            content.style.lineHeight = '1.5';
            content.textContent = applyTemplate(
                config?.replacement,
                groups,
                message.trim(),
            );

            bubble.appendChild(content);

            const timeSpan = doc.createElement('span');
            timeSpan.style.fontSize = '12px';
            timeSpan.style.color = '#b2b2b2';
            timeSpan.style.marginLeft = '8px';
            timeSpan.style.flexShrink = '0';
            timeSpan.textContent = time.trim();

            bodyWrapper.appendChild(bubble);
            bodyWrapper.appendChild(timeSpan);

            container.appendChild(header);
            container.appendChild(bodyWrapper);

            return container;
        },
    },
    {
        id: 'bhl-system',
        name: '系统提示',
        patternSource: '\\+([\s\S]*?)\\+',
        flags: 'g',
        defaultReplacement: '$1',
        createNode({ documentRef, groups, config }) {
            const doc = documentRef || defaultDocument;
            if (!doc) return null;
            const custom = resolveCustomReplacement({
                documentRef: doc,
                replacement: config?.replacement,
                defaultReplacement: this?.defaultReplacement,
                groups,
            });
            if (custom) return custom;

            const [message = ''] = groups;
            const container = doc.createElement('div');
            container.style.textAlign = 'center';
            container.style.color = '#888888';
            container.style.fontSize = '14px';
            container.style.margin = '0';
            container.textContent = applyTemplate(
                config?.replacement,
                groups,
                message.trim(),
            );
            return container;
        },
    },
    {
        id: 'bhl-recall',
        name: '撤回提示',
        patternSource: '^-(.*?)-$',
        flags: 'gm',
        defaultReplacement: '$1',
        createNode({ documentRef, groups, config }) {
            const doc = documentRef || defaultDocument;
            if (!doc) return null;
            const custom = resolveCustomReplacement({
                documentRef: doc,
                replacement: config?.replacement,
                defaultReplacement: this?.defaultReplacement,
                groups,
            });
            if (custom) return custom;

            const [message = ''] = groups;
            const outer = doc.createElement('div');
            outer.style.textAlign = 'center';
            outer.style.marginBottom = '6px';

            const details = doc.createElement('details');
            details.style.display = 'inline-block';

            const summary = doc.createElement('summary');
            summary.style.color = '#999999';
            summary.style.fontStyle = 'italic';
            summary.style.fontSize = '13px';
            summary.style.cursor = 'pointer';
            summary.style.listStyle = 'none';
            summary.style.webkitTapHighlightColor = 'transparent';
            summary.textContent = '对方撤回了一条消息';

            const content = doc.createElement('div');
            content.style.padding = '8px 12px';
            content.style.marginTop = '8px';
            content.style.backgroundColor = 'rgba(0,0,0,0.04)';
            content.style.borderRadius = '10px';
            content.style.textAlign = 'left';

            const paragraph = doc.createElement('p');
            paragraph.style.margin = '0';
            paragraph.style.color = '#555';
            paragraph.style.fontStyle = 'normal';
            paragraph.style.fontSize = '14px';
            paragraph.style.lineHeight = '1.4';
            paragraph.textContent = applyTemplate(
                config?.replacement,
                groups,
                message.trim(),
            );

            content.appendChild(paragraph);
            details.appendChild(summary);
            details.appendChild(content);
            outer.appendChild(details);

            return outer;
        },
    },
];

function applyTemplate(template, groups, fallback) {
    if (!template) return fallback;
    try {
        return template.replace(/\$(\d+)/g, (_, index) => {
            const position = Number(index) - 1;
            return groups[position] !== undefined ? groups[position] : '';
        });
    } catch (error) {
        console.warn('胡萝卜插件：渲染正则模板失败', error);
        return fallback;
    }
}

function buildCustomReplacement(documentRef, template, groups) {
    const doc = documentRef || defaultDocument;
    if (!doc) return null;
    if (typeof template !== 'string') return null;
    if (!template.trim()) return null;
    try {
        const html = applyTemplate(template, groups, template);
        const tpl = doc.createElement('template');
        tpl.innerHTML = html;
        return tpl.content;
    } catch (error) {
        console.warn('胡萝卜插件：渲染自定义替换失败', error);
        return null;
    }
}

function resolveCustomReplacement({
    documentRef,
    replacement,
    defaultReplacement,
    groups,
}) {
    const template = typeof replacement === 'string' ? replacement : '';
    const baseline =
        typeof defaultReplacement === 'string' ? defaultReplacement : '';
    if (!template.trim()) return null;
    if (template === baseline) return null;
    return buildCustomReplacement(documentRef, template, groups);
}

let cachedRuleSettings = null;

function normalizeFlags(flags = 'g') {
    const raw = typeof flags === 'string' ? flags : '';
    const uniq = [];
    for (const ch of `${raw}g`) {
        if (!uniq.includes(ch)) uniq.push(ch);
    }
    return uniq.join('');
}

function parsePatternInput(input, fallbackFlags = 'gm') {
    if (typeof input !== 'string') return null;
    const trimmed = input.trim();
    if (!trimmed) return null;

    let source = trimmed;
    let flags = normalizeFlags(fallbackFlags);

    if (trimmed.startsWith('/') && trimmed.lastIndexOf('/') > 0) {
        const lastSlash = trimmed.lastIndexOf('/');
        source = trimmed.slice(1, lastSlash);
        const flagPart = trimmed.slice(lastSlash + 1).trim();
        if (flagPart) {
            flags = normalizeFlags(flagPart);
        }
    }

    try {
        // eslint-disable-next-line no-new
        new RegExp(source, flags);
    } catch (error) {
        return null;
    }

    return { source, flags };
}

function getAllRules() {
    return REGEX_RULES;
}

function getDefaultRuleSettings() {
    const defaults = {};
    for (const rule of getAllRules()) {
        defaults[rule.id] = {
            enabled: true,
            pattern: rule.patternSource,
            replacement: rule.defaultReplacement || '',
            flags: rule.flags || 'g',
        };
    }
    return defaults;
}

function normalizeRuleSettings(raw) {
    const defaults = getDefaultRuleSettings();
    if (!raw || typeof raw !== 'object') return defaults;

    const merged = { ...defaults };
    for (const [ruleId, ruleDefaults] of Object.entries(defaults)) {
        const candidate = raw[ruleId];
        if (!candidate || typeof candidate !== 'object') continue;
        merged[ruleId] = { ...ruleDefaults };
        if (typeof candidate.enabled === 'boolean') {
            merged[ruleId].enabled = candidate.enabled;
        }
        if (typeof candidate.pattern === 'string' && candidate.pattern.trim()) {
            merged[ruleId].pattern = candidate.pattern;
        }
        if (typeof candidate.replacement === 'string') {
            merged[ruleId].replacement = candidate.replacement;
        }
        if (typeof candidate.flags === 'string' && candidate.flags.trim()) {
            merged[ruleId].flags = candidate.flags.trim();
        }
    }
    return merged;
}

function loadRuleSettingsFromStorage() {
    cachedRuleSettings = normalizeRuleSettings(getSettings().regexRuleSettings);
    return cachedRuleSettings;
}

function persistRuleSettings(settings) {
    cachedRuleSettings = normalizeRuleSettings(settings);
    getSettings().regexRuleSettings = cachedRuleSettings;
    saveSettings();
}

function getRuleSettingsWithDefaults() {
    return normalizeRuleSettings(loadRuleSettingsFromStorage());
}

function getRuleConfig(ruleSettings, rule) {
    const defaults = getDefaultRuleSettings();
    const merged = {
        ...(defaults[rule.id] || {}),
        ...(ruleSettings?.[rule.id] || {}),
    };
    return merged;
}

function buildPattern(rule, config) {
    if (!rule) return null;
    const parsed =
        parsePatternInput(
            config?.pattern || rule.patternSource,
            config?.flags || rule.flags || 'g',
        ) || {
            source: config?.pattern || rule.patternSource,
            flags: normalizeFlags(config?.flags || rule.flags || 'g'),
        };
    const { source } = parsed;
    const flags = normalizeFlags(parsed.flags);
    try {
        return new RegExp(source, flags);
    } catch (error) {
        console.warn('胡萝卜插件：正则表达式无效', {
            id: rule.id,
            source,
            flags,
            error,
        });
        return null;
    }
}

function clonePattern(pattern) {
    if (!(pattern instanceof RegExp)) return null;
    return new RegExp(pattern.source, pattern.flags);
}

function isInsideRegexNode(node) {
    let current = node;
    while (current) {
        if (current.nodeType === 1 && current.dataset?.cipRegexNode === '1') {
            return true;
        }
        current = current.parentNode;
    }
    return false;
}

function collectTextNodes(root, documentRef) {
    const doc = documentRef || defaultDocument;
    if (!root || !doc?.createTreeWalker) return [];

    const nodes = [];
    const walker = doc.createTreeWalker(root, TEXT_NODE_FILTER);
    while (walker.nextNode()) {
        const current = walker.currentNode;
        if (!current || !current.nodeValue) continue;
        if (isInsideRegexNode(current.parentNode)) continue;
        nodes.push(current);
    }
    return nodes;
}

function markRegexNode(node, ruleId) {
    if (!node) return;
    if (node.nodeType === 11) {
        const elements = node.children || [];
        for (const child of elements) {
            markRegexNode(child, ruleId);
        }
        return;
    }

    if (node.nodeType !== 1) return;
    node.dataset.cipRegexNode = '1';
    node.dataset.cipRegexRule = ruleId || '';
}

function hasQuoteAncestor(node) {
    let current = node?.parentElement;
    while (current) {
        const tag = current.tagName ? current.tagName.toUpperCase() : '';
        if (tag === 'Q' || tag === 'BLOCKQUOTE') return true;
        current = current.parentElement;
    }
    return false;
}

function getReplacementTarget(textNode) {
    if (!textNode?.parentNode) return textNode;
    const parent = textNode.parentNode;
    if (parent.nodeType !== 1) return textNode;

    const tagName = parent.tagName ? parent.tagName.toUpperCase() : '';
    if (tagName !== 'Q' && tagName !== 'BLOCKQUOTE') return textNode;

    const children = Array.from(parent.childNodes || []);
    const onlyText = children.every((child) => {
        if (child === textNode) return true;
        if (child.nodeType === 3) {
            return !child.nodeValue || !child.nodeValue.trim();
        }
        return false;
    });

    if (!onlyText) return textNode;

    if (hasQuoteAncestor(parent)) {
        return textNode;
    }

    return parent;
}

function replaceMatchesInTextNode({
    textNode,
    rule,
    pattern,
    documentRef,
    ensureOriginalStored,
    ruleConfig,
}) {
    if (!textNode?.parentNode) return false;
    const targetNode = getReplacementTarget(textNode);
    const text = targetNode.textContent || textNode.nodeValue;
    if (!text) return false;

    const doc = documentRef || defaultDocument;
    if (!doc) return false;

    const workingPattern = clonePattern(pattern);
    if (!workingPattern) return false;

    let match;
    let lastIndex = 0;
    let replaced = false;
    const fragment = doc.createDocumentFragment();

    workingPattern.lastIndex = 0;

    while ((match = workingPattern.exec(text)) !== null) {
        const matchText = match[0];
        if (!matchText) {
            if (workingPattern.lastIndex === match.index) {
                workingPattern.lastIndex++;
            }
            continue;
        }

        const startIndex = match.index;
        if (startIndex > lastIndex) {
            fragment.appendChild(
                doc.createTextNode(text.slice(lastIndex, startIndex)),
            );
        }

        const replacementNode = createReplacementNode({
            documentRef: doc,
            groups: match.slice(1),
            config: ruleConfig,
            rule,
            fallbackText: matchText,
            sourceNode: targetNode,
        });

        if (replacementNode) {
            markRegexNode(replacementNode, rule.id);
            fragment.appendChild(replacementNode);
            replaced = true;
        } else {
            fragment.appendChild(doc.createTextNode(matchText));
        }

        lastIndex = startIndex + matchText.length;

        if (workingPattern.lastIndex === match.index) {
            workingPattern.lastIndex++;
        }
    }

    if (!replaced) {
        return false;
    }

    if (lastIndex < text.length) {
        fragment.appendChild(doc.createTextNode(text.slice(lastIndex)));
    }

    if (typeof ensureOriginalStored === 'function') {
        ensureOriginalStored();
    }

    targetNode.parentNode.replaceChild(fragment, targetNode);
    return true;
}

function clearAppliedFlag(element) {
    if (!element?.dataset) return;
    delete element.dataset.cipRegexApplied;
}

function markApplied(element) {
    if (!element?.dataset) return;
    element.dataset.cipRegexApplied = '1';
}

function restoreOriginal(element) {
    if (!element) return false;
    const original = originalContentMap.get(element);
    if (typeof original !== 'string') return false;
    element.innerHTML = original;
    originalContentMap.delete(element);
    clearAppliedFlag(element);
    return true;
}

export function getRegexEnabled() {
    try {
        return getSettings().regexEnabled !== false;
    } catch (error) {
        console.warn('胡萝卜插件：读取正则开关失败', error);
        return DEFAULT_REGEX_ENABLED;
    }
}

export function setRegexEnabled(enabled) {
    try {
        getSettings().regexEnabled = enabled ? true : false;
        saveSettings();
    } catch (error) {
        console.warn('胡萝卜插件：写入正则开关失败', error);
    }
}


function createReplacementNode({
    rule,
    groups,
    config,
    documentRef,
    fallbackText = '',
    sourceNode = null,
}) {
    const doc = documentRef || defaultDocument;
    if (!doc) return null;

    if (typeof rule?.createNode === 'function') {
        return rule.createNode({
            documentRef: doc,
            groups,
            config,
            sourceNode,
        });
    }

    const template =
        typeof config?.replacement === 'string'
            ? config.replacement
            : typeof rule?.defaultReplacement === 'string'
              ? rule.defaultReplacement
              : '';

    if (template && template.trim()) {
        const custom = buildCustomReplacement(doc, template, groups);
        if (custom) return custom;
    }

    const text = applyTemplate(template, groups, fallbackText || '');
    return doc.createTextNode(text);
}

export function getRegexRuleSettings() {
    return getRuleSettingsWithDefaults();
}

export function setRegexRuleSettings(settings) {
    persistRuleSettings(settings);
    return getRegexRuleSettings();
}

export function updateRegexRuleSetting(ruleId, updates = {}) {
    const settings = getRuleSettingsWithDefaults();
    if (!settings[ruleId]) return settings;
    let nextPattern = updates.pattern;
    let nextFlags = updates.flags;

    if (typeof updates.pattern === 'string') {
        const parsed = parsePatternInput(
            updates.pattern,
            updates.flags || settings[ruleId]?.flags || 'g',
        );
        if (parsed) {
            nextPattern = parsed.source;
            nextFlags = parsed.flags;
        }
    }

    const next = {
        ...settings[ruleId],
        ...updates,
        ...(typeof nextPattern === 'string' ? { pattern: nextPattern } : {}),
        ...(typeof nextFlags === 'string'
            ? { flags: normalizeFlags(nextFlags) }
            : {}),
    };
    return setRegexRuleSettings({
        ...settings,
        [ruleId]: next,
    });
}

export function resetRegexRuleSetting(ruleId) {
    const defaults = getDefaultRuleSettings();
    if (!defaults[ruleId]) return getRuleSettingsWithDefaults();
    const current = getRuleSettingsWithDefaults();
    return setRegexRuleSettings({
        ...current,
        [ruleId]: defaults[ruleId],
    });
}

export function resetAllRegexRuleSettings() {
    const defaults = getDefaultRuleSettings();
    setRegexRuleSettings(defaults);
    return defaults;
}

export function getRegexRulesForUI() {
    const settings = getRuleSettingsWithDefaults();
    return getAllRules().map((rule) => ({
        id: rule.id,
        name: rule.name || rule.id,
        enabled: settings[rule.id]?.enabled !== false,
        pattern: settings[rule.id]?.pattern || rule.patternSource,
        replacement:
            settings[rule.id]?.replacement ?? rule.defaultReplacement ?? '',
        flags: settings[rule.id]?.flags || rule.flags || 'g',
        isCustom: !!rule.isCustom,
        defaults: {
            pattern: rule.patternSource,
            replacement: rule.defaultReplacement || '',
            flags: rule.flags || 'g',
        },
    }));
}

export function applyRegexReplacements(element, options = {}) {
    if (!element) return false;

    const {
        enabled = true,
        documentRef = defaultDocument,
    } = options;

    if (!enabled) {
        return restoreOriginal(element);
    }

    if (!documentRef) {
        return false;
    }

    let replacedAny = false;
    let storedOriginal = false;

    const ensureOriginalStored = () => {
        if (storedOriginal) return;
        originalContentMap.set(element, element.innerHTML);
        storedOriginal = true;
    };

    const ruleSettings = getRuleSettingsWithDefaults();

    for (const rule of getAllRules()) {
        try {
            const config = getRuleConfig(ruleSettings, rule);
            if (!config.enabled) continue;
            const pattern = buildPattern(rule, config);
            if (!pattern) continue;

            const textNodes = collectTextNodes(element, documentRef);
            if (!textNodes.length) continue;

            for (const textNode of textNodes) {
                const replaced = replaceMatchesInTextNode({
                    textNode,
                    rule,
                    pattern,
                    documentRef,
                    ensureOriginalStored,
                    ruleConfig: config,
                });
                if (replaced) {
                    replacedAny = true;
                }
            }
        } catch (error) {
            console.warn('胡萝卜插件：应用正则规则失败', {
                id: rule?.id,
                name: rule?.name,
                error,
            });
            continue;
        }
    }

    if (replacedAny) {
        markApplied(element);
        return true;
    }

    if (element?.dataset?.cipRegexApplied) {
        if (!originalContentMap.has(element)) {
            clearAppliedFlag(element);
            return false;
        }
        return true;
    }

    return false;
}

export default {
    applyRegexReplacements,
    getRegexEnabled,
    setRegexEnabled,
    getRegexRuleSettings,
    setRegexRuleSettings,
    updateRegexRuleSetting,
    resetRegexRuleSetting,
    resetAllRegexRuleSettings,
    getRegexRulesForUI,
};

export function restoreRegexOriginal(element) {
    return restoreOriginal(element);
}

export function clearRegexState(element) {
    clearAppliedFlag(element);
    restoreOriginal(element);
}

export function getRegexRules() {
    return getAllRules();
}

