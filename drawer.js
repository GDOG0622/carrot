import {
    exportLegacySettings,
    flushSettings,
    getSettings,
    importLegacySettings,
    saveSettings,
} from './config.js';
import { POPUP_RESULT, POPUP_TYPE, Popup } from '/scripts/popup.js';

// --- 后台保活 ---
const SILENT_AUDIO_SRC = 'data:audio/wav;base64,UklGRmQGAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YUAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
let _keepAliveAudio = null;
let _keepAliveUnlockBound = false;
let _notificationSoundsInited = false;
const _soundAudioCache = new Map();
const KEEP_ALIVE_AUDIO_SRC = new URL('./silence.m4a', import.meta.url).href;
const GLOBAL_FONT_STYLE_ID = 'cip-global-font-style';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeCssString(value) {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

function isCssFontUrl(url) {
    try {
        return new URL(url, window.location.href).pathname.toLowerCase().endsWith('.css');
    } catch (error) {
        return /\.css(?:[?#].*)?$/i.test(url);
    }
}

function getFontFormat(url) {
    const lower = String(url || '').split(/[?#]/)[0].toLowerCase();
    if (lower.endsWith('.woff2')) return 'woff2';
    if (lower.endsWith('.woff')) return 'woff';
    if (lower.endsWith('.ttf') || lower.endsWith('.tff')) return 'truetype';
    if (lower.endsWith('.otf')) return 'opentype';
    return '';
}

function normalizeMessageFontSize(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return '';
    return String(Math.min(96, Math.max(8, parsed)));
}

function normalizeMessageFontWeight(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return '';
    return String(Math.min(1000, Math.max(100, parsed)));
}

function normalizeMessageLineHeight(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return '';
    return String(Math.min(4, Math.max(0.8, parsed)));
}

function normalizeMessageParagraphSpacing(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return '';
    return String(Math.min(96, Math.max(0, parsed)));
}

function buildGlobalFontCss(
    font,
    {
        messageFontSize = '',
        messageFontWeight = '',
        messageLineHeight = '',
        messageParagraphSpacing = '',
    } = {},
) {
    const hasFont = !!(font?.name && font?.url);
    const size = normalizeMessageFontSize(messageFontSize);
    const weight = normalizeMessageFontWeight(messageFontWeight);
    const lineHeight = normalizeMessageLineHeight(messageLineHeight);
    const paragraphSpacing = normalizeMessageParagraphSpacing(messageParagraphSpacing);
    if (!hasFont && !size && !weight && !lineHeight && !paragraphSpacing) return '';

    const name = hasFont ? escapeCssString(font.name.trim()) : '';
    const url = hasFont ? escapeCssString(font.url.trim()) : '';
    const format = hasFont ? getFontFormat(font.url) : '';
    const sourceCss = !hasFont
        ? ''
        : isCssFontUrl(font.url)
        ? `@import url("${url}");\n`
        : `@font-face {
    font-family: "${name}";
    src: url("${url}")${format ? ` format("${format}")` : ''};
    font-weight: 100 900;
    font-style: normal;
    font-display: swap;
}\n`;
    const fontVarCss = hasFont
        ? `    --cip-global-font-family: "${name}";\n`
        : '';
    const textFontCss = hasFont
        ? `    font-family: var(--cip-global-font-family), system-ui, sans-serif !important;\n`
        : '';
    const messageFontCss = [
        hasFont ? '    font-family: var(--cip-global-font-family), sans-serif !important;' : '',
        size ? `    font-size: ${size}px !important;` : '',
        weight ? `    font-weight: ${weight} !important;` : '',
        lineHeight ? `    line-height: ${lineHeight} !important;` : '',
    ].filter(Boolean).join('\n');
    const paragraphCss = paragraphSpacing
        ? `.mes_text p {
    margin-top: 0 !important;
    margin-bottom: ${paragraphSpacing}px !important;
}
`
        : '';

    return `${sourceCss}
:root {
${fontVarCss.trimEnd()}
}

html body,
html body :not([class*="fa-"]):not(.fa):not(.fas):not(.far):not(.fal):not(.fab):not(.fa-solid):not(.fa-regular):not(.fa-brands):not(.svg_icon):not(svg):not(path):not(use) {
${textFontCss.trimEnd()}
}

.mes_text,
.mes_text *,
.mes_text p,
.mes_text span:not([class*="fa-"]):not(.svg_icon),
.mes_text div:not([class*="fa-"]):not(.svg_icon) {
${messageFontCss}
}

${paragraphCss}
.fa,
.fas,
.fa-solid {
    font-family: "Font Awesome 6 Free", "Font Awesome 5 Free" !important;
    font-weight: 900 !important;
}

.far,
.fa-regular,
.fal,
.fa-light,
.fa-thin {
    font-family: "Font Awesome 6 Free", "Font Awesome 5 Free" !important;
    font-weight: 400 !important;
}

.fab,
.fa-brands {
    font-family: "Font Awesome 6 Brands", "Font Awesome 5 Brands" !important;
    font-weight: 400 !important;
}
`;
}

function applyGlobalFont(fontName = getSettings().activeGlobalFont) {
    const s = getSettings();
    const font = fontName ? s.globalFonts?.[fontName] : null;
    const css = buildGlobalFontCss(font, {
        messageFontSize: s.globalMessageFontSize,
        messageFontWeight: s.globalMessageFontWeight,
        messageLineHeight: s.globalMessageLineHeight,
        messageParagraphSpacing: s.globalMessageParagraphSpacing,
    });
    let style = document.getElementById(GLOBAL_FONT_STYLE_ID);
    if (!css) {
        style?.remove();
        return false;
    }
    if (!style) {
        style = document.createElement('style');
        style.id = GLOBAL_FONT_STYLE_ID;
    }
    document.head.appendChild(style);
    style.textContent = css;
    return true;
}

function getOrCreateKeepAliveAudio() {
    if (_keepAliveAudio) return _keepAliveAudio;
    const audio = document.getElementById('cip-keep-alive-audio') || document.createElement('audio');
    audio.id = 'cip-keep-alive-audio';
    audio.src = KEEP_ALIVE_AUDIO_SRC;
    audio.loop = true;
    audio.autoplay = false;
    audio.preload = 'auto';
    audio.controls = true;
    audio.playsInline = true;
    audio.setAttribute('playsinline', '');
    audio.setAttribute('webkit-playsinline', '');
    audio.style.position = '';
    audio.style.width = '100%';
    audio.style.height = '';
    audio.style.opacity = '';
    audio.style.pointerEvents = '';
    audio.style.left = '';
    audio.style.bottom = '';
    if (!audio.parentElement) {
        document.body.appendChild(audio);
    }
    _keepAliveAudio = audio;
    return audio;
}

function tryPlayKeepAlive() {
    const audio = getOrCreateKeepAliveAudio();
    return audio.play().catch((error) => {
        console.warn('Carrot: keep-alive audio play failed', error);
        return false;
    });
}

function startKeepAlive() {
    if (!_keepAliveUnlockBound) {
        const unlock = () => {
            if (!getSettings().notifKeepAlive) return;
            tryPlayKeepAlive();
        };
        document.addEventListener('pointerdown', unlock, { passive: true });
        document.addEventListener('touchend', unlock, { passive: true });
        document.addEventListener('click', unlock, { passive: true });
        document.addEventListener('visibilitychange', unlock, { passive: true });
        window.addEventListener('pageshow', unlock, { passive: true });
        _keepAliveUnlockBound = true;
    }
    return;
    if (_keepAliveCtx) return;
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        _keepAliveCtx = new AC();
    } catch (e) {
        console.warn('胡萝卜插件：后台保活启动失败', e);
        return;
    }
    const launchLoop = () => {
        if (!_keepAliveCtx || _keepAliveSource) return;
        try {
            const buf = _keepAliveCtx.createBuffer(1, _keepAliveCtx.sampleRate, _keepAliveCtx.sampleRate);
            _keepAliveSource = _keepAliveCtx.createBufferSource();
            _keepAliveSource.buffer = buf;
            _keepAliveSource.loop = true;
            _keepAliveSource.connect(_keepAliveCtx.destination);
            _keepAliveSource.start();
        } catch (e) {
            console.warn('胡萝卜插件：静音循环启动失败', e);
        }
    };
    if (_keepAliveCtx.state === 'running') {
        launchLoop();
    } else {
        const onInteraction = () => {
            _keepAliveCtx?.resume().then(launchLoop).catch(() => {});
        };
        document.addEventListener('click', onInteraction, { once: true });
        document.addEventListener('touchend', onInteraction, { once: true });
    }
}

function stopKeepAlive() {
    try { _keepAliveAudio?.pause(); } catch (e) {}
    _keepAliveAudio = null;
    return;
    try { _keepAliveSource?.stop(); } catch (e) {}
    try { _keepAliveCtx?.close(); } catch (e) {}
    _keepAliveCtx = null;
    _keepAliveSource = null;
}

// --- 系统通知 ---
function getNotifPermStatus() {
    if (!('Notification' in window)) return '不支持';
    const p = Notification.permission;
    if (p === 'granted') return '已授权 ✅';
    if (p === 'denied') return '已拒绝 ❌';
    return '未授权';
}

async function requestNotifPermission() {
    if (!('Notification' in window)) return 'unsupported';
    try {
        return await Notification.requestPermission();
    } catch (e) {
        return Notification.permission || 'denied';
    }
}

function showSystemNotification(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    const safeTitle = title || 'Carrot';
    const safeBody = body || '';
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const options = {
        body: safeBody,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: `carrot-notification-${Date.now()}`,
        requireInteraction: false,
        renotify: true,
        silent: false,
        timestamp: Date.now(),
    };
    const sendRegular = () => {
        const notification = new Notification(safeTitle, options);
        notification.onclick = () => {
            try { window.focus(); } catch (e) {}
            try { notification.close(); } catch (e) {}
        };
        if (isMobile) {
            setTimeout(() => {
                try { notification.close(); } catch (e) {}
            }, 8000);
        }
        return notification;
    };
    (async () => {
        try {
            const registration = await navigator.serviceWorker?.getRegistration?.();
            if (registration?.showNotification && isMobile) {
                await registration.showNotification(safeTitle, options);
                return;
            }
            sendRegular();
        } catch (error) {
            try {
                sendRegular();
            } catch (fallbackError) {
                console.warn('Carrot: system notification failed', fallbackError);
            }
        }
    })();
    return;
    try {
        new Notification(title || '胡萝卜提示', { body: body || '' });
    } catch (e) {
        console.warn('胡萝卜插件：系统通知失败', e);
    }
}

// --- 提示音 ---
function buildSoundOptions(selectEl) {
    if (!selectEl) return;
    const sounds = getSettings().notifSounds || {};
    selectEl.innerHTML = '<option value="">无</option>';
    Object.keys(sounds).forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        selectEl.appendChild(opt);
    });
}

function buildFontOptions(selectEl) {
    if (!selectEl) return;
    const fonts = getSettings().globalFonts || {};
    selectEl.innerHTML = '<option value="">无</option>';
    Object.keys(fonts).sort().forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        selectEl.appendChild(opt);
    });
}

function parseNameUrlLines(text) {
    const entries = [];
    String(text || '').split('\n').forEach((line) => {
        const parts = line.split(':');
        if (parts.length < 2) return;
        const name = parts[0].trim();
        const url = parts.slice(1).join(':').trim();
        if (name && url) entries.push({ name, url });
    });
    return entries;
}

function isAllowedResourceUrl(url) {
    return /^https?:\/\//i.test(url) || url.startsWith('/') || url.startsWith('./') || url.startsWith('../');
}

async function showSoundAddPopup() {
    const content = document.createElement('div');
    content.className = 'cip-popup-form';
    content.innerHTML = `
        <label>
            <span>名称</span>
            <input type="text" class="text_pole" data-field="name" placeholder="提示音名称">
        </label>
        <label>
            <span>链接</span>
            <input type="text" class="text_pole" data-field="url" placeholder="音频直链 URL">
        </label>
    `;
    const popup = new Popup(content, POPUP_TYPE.CONFIRM, '', {
        okButton: '保存',
        cancelButton: '取消',
    });
    const result = await popup.show();
    if (result !== POPUP_RESULT.AFFIRMATIVE) return null;
    return {
        name: String(content.querySelector('[data-field="name"]')?.value || '').trim(),
        url: String(content.querySelector('[data-field="url"]')?.value || '').trim(),
    };
}

async function showSelectRemovePopup(title, selectEl) {
    const content = document.createElement('div');
    const label = document.createElement('div');
    label.textContent = title;
    label.style.marginBottom = '8px';
    content.append(label, selectEl);
    const popup = new Popup(content, POPUP_TYPE.CONFIRM, '', {
        okButton: '移除',
        cancelButton: '取消',
    });
    const result = await popup.show();
    if (result !== POPUP_RESULT.AFFIRMATIVE) return '';
    return selectEl.value || '';
}

async function showFontAddPopup() {
    const content = document.createElement('div');
    content.className = 'cip-popup-font-content cip-popup-form';
    content.innerHTML = `
        <h4>单独添加</h4>
        <label>
            <span>输入名字</span>
            <input type="text" class="text_pole" data-field="name" placeholder="字体名称 / font-family">
        </label>
        <label>
            <span>输入链接</span>
            <input type="text" class="text_pole" data-field="url" placeholder="CSS 或 woff2/woff/ttf/otf 链接">
        </label>
        <h4>批量添加</h4>
        <textarea class="text_pole" data-field="batch" rows="8" placeholder="每行一个：字体名字: 链接"></textarea>
    `;
    const popup = new Popup(content, POPUP_TYPE.CONFIRM, '', {
        okButton: '保存',
        cancelButton: '取消',
        wide: true,
    });
    const result = await popup.show();
    if (result !== POPUP_RESULT.AFFIRMATIVE) return null;

    const singleName = String(content.querySelector('[data-field="name"]')?.value || '').trim();
    const singleUrl = String(content.querySelector('[data-field="url"]')?.value || '').trim();
    const batch = String(content.querySelector('[data-field="batch"]')?.value || '');
    const entries = [];
    if (singleName || singleUrl) entries.push({ name: singleName, url: singleUrl });
    entries.push(...parseNameUrlLines(batch));
    return entries;
}

async function playSound(name) {
    const sounds = getSettings().notifSounds || {};
    const url = sounds[name];
    if (!url) return false;
    let audio = _soundAudioCache.get(name);
    if (!audio || audio.src !== url) {
        audio = new Audio(url);
        audio.preload = 'auto';
        audio.playsInline = true;
        audio.setAttribute('playsinline', '');
        audio.setAttribute('webkit-playsinline', '');
        _soundAudioCache.set(name, audio);
    }
    try {
        audio.pause();
        audio.currentTime = 0;
        await audio.play();
        return true;
    } catch (error) {
        console.warn('Carrot: notification sound play failed', error);
        _soundAudioCache.delete(name);
        if (getSettings().notifKeepAlive) {
            await tryPlayKeepAlive();
        }
    }
    try {
        const audio = new Audio(url);
        audio.preload = 'auto';
        await audio.play();
        return true;
    } catch (error) {
        console.warn('胡萝卜插件：提示音播放失败', error);
        return false;
    }
}

// --- 事件绑定（只执行一次）---
function initNotificationSounds() {
    if (_notificationSoundsInited) return;
    _notificationSoundsInited = true;
    import('/scripts/events.js').then((eventsModule) => {
        const evTypes = eventsModule.event_types;
        const getEventSource = () => {
            try {
                return window.SillyTavern?.getContext?.()?.eventSource || eventsModule.eventSource;
            } catch (e) {
                return null;
            }
        };
        const run = {
            active: false,
            failed: false,
            played: false,
            lastErrorAt: 0,
        };
        const playSuccess = () => {
            const s = getSettings();
            if (run.played) return;
            run.played = true;
            if (s.notifSuccess) {
                playSound(s.notifSuccess);
            }
            if (s.notifPopupEnabled && (document.hidden || !document.hasFocus())) {
                showSystemNotification(s.notifSuccessTitle || 'AI reply complete', s.notifSuccessBody || '');
            }
        };
        const playFail = () => {
            const s = getSettings();
            if (run.played) return;
            run.played = true;
            if (s.notifFail) {
                playSound(s.notifFail);
            }
            if (s.notifPopupEnabled && (document.hidden || !document.hasFocus())) {
                showSystemNotification(s.notifFailTitle || 'AI reply interrupted', s.notifFailBody || '');
            }
        };
        const markFailed = () => {
            if (!run.active) return;
            run.failed = true;
            run.lastErrorAt = Date.now();
        };
        const errorTextLooksGenerationRelated = (...parts) => {
            const text = parts
                .filter((part) => part !== undefined && part !== null)
                .map((part) => String(part))
                .join(' ');
            return /\b(4\d\d|5\d\d)\b|api|unauthorized|forbidden|rate limit|quota|network error|failed to fetch|request failed|timeout|connection refused|ECONN|ETIMEDOUT|ENOTFOUND|ECONNRESET/i.test(text);
        };
        if (window.toastr?.error && !window.toastr._carrotNotifErrorPatched) {
            const originalToastrError = window.toastr.error.bind(window.toastr);
            window.toastr.error = (...args) => {
                if (errorTextLooksGenerationRelated(...args)) {
                    markFailed();
                }
                return originalToastrError(...args);
            };
            window.toastr._carrotNotifErrorPatched = true;
        }
        if (!window.fetch._carrotNotifErrorPatched) {
            const originalFetch = window.fetch.bind(window);
            window.fetch = async (...args) => {
                try {
                    const response = await originalFetch(...args);
                    const url = String(args[0]?.url || args[0] || '');
                    if (run.active && url.includes('/api/') && !response.ok && response.status >= 400) {
                        markFailed();
                    }
                    return response;
                } catch (error) {
                    const url = String(args[0]?.url || args[0] || '');
                    if (run.active && url.includes('/api/')) {
                        markFailed();
                    }
                    throw error;
                }
            };
            window.fetch._carrotNotifErrorPatched = true;
        }
        const tryBind = () => {
            const es = getEventSource();
            if (!es) {
                setTimeout(tryBind, 2000);
                return;
            }
            es.on(evTypes.GENERATION_STARTED, () => {
                run.active = true;
                run.failed = false;
                run.played = false;
                run.lastErrorAt = 0;
            });
            es.on(evTypes.GENERATION_STOPPED, () => {
                if (!run.active) return;
                markFailed();
                setTimeout(() => {
                    if (!run.active || run.played) return;
                    playFail();
                    run.active = false;
                }, 300);
            });
            es.on(evTypes.GENERATION_ENDED, () => {
                setTimeout(() => {
                    if (run.active && !run.played) {
                        const hasRecentError = run.failed || (Date.now() - run.lastErrorAt < 2000);
                        if (hasRecentError) {
                            playFail();
                        } else {
                            playSuccess();
                        }
                    }
                    run.active = false;
                }, 300);
            });
        };
        tryBind();
    }).catch(() => {});
}
export function injectExtensionDrawer({
    carrotButton,
    floatVisible,
    floatIconUrl,
    floatSize,
    floatOpacity,
    renderEnabled,
    setFloatVisible,
    setFloatIconUrl,
    setFloatSize,
    setFloatOpacity,
    setRenderEnabled,
    applyFloatIcon,
    applyFloatVisibility,
    reprocessRegexPlaceholders,
}) {
    const container = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!container) return;

    const s = getSettings();
    const wrapper = document.createElement('div');
    wrapper.id = 'cip-extension-container';
    wrapper.className = 'extension_container';
    wrapper.innerHTML = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>🥕 胡萝卜面板</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="cip-ext-nav">
                    <button class="cip-ext-nav-btn menu_button" data-cip-tab="main">主要</button>
                    <button class="cip-ext-nav-btn menu_button" data-cip-tab="prompt">提示</button>
                    <button class="cip-ext-nav-btn menu_button" data-cip-tab="font">字体</button>
                    <button class="cip-ext-nav-btn menu_button" data-cip-tab="sync">同步</button>
                    <button class="cip-ext-nav-btn menu_button" data-cip-tab="api">API</button>
                </div>
                <div id="cip-ext-pane-main" class="cip-ext-pane">
                    <div class="cip-ext-checkboxes">
                        <label class="cip-ext-label checkbox_label">
                            <input type="checkbox" id="cip-ext-float-visible" ${floatVisible ? 'checked' : ''}>
                            <span>显示浮标</span>
                        </label>
                        <label class="cip-ext-label checkbox_label">
                            <input type="checkbox" id="cip-ext-render-toggle" ${renderEnabled ? 'checked' : ''}>
                            <span>美化渲染</span>
                        </label>
                    </div>
                    <div class="cip-ext-field">
                        <small>浮标图片直链（填入后浮标显示该图）</small>
                        <input type="text" id="cip-ext-float-icon" class="text_pole" placeholder="留空使用默认图标" value="${floatIconUrl}">
                    </div>
                    <div class="cip-ext-range-field">
                        <label>
                            <span>浮标大小</span>
                            <i class="fa-solid fa-circle-info" title="等比例放大或缩小浮标图片"></i>
                        </label>
                        <input type="range" id="cip-ext-float-size" min="20" max="120" step="1" value="${floatSize}">
                        <output id="cip-ext-float-size-value">${floatSize}</output>
                    </div>
                    <div class="cip-ext-range-field">
                        <label>
                            <span>透明度</span>
                            <i class="fa-solid fa-circle-info" title="调整浮标整体透明度"></i>
                        </label>
                        <input type="range" id="cip-ext-float-opacity" min="0.2" max="1" step="0.01" value="${floatOpacity}">
                        <output id="cip-ext-float-opacity-value">${Number(floatOpacity).toFixed(2)}</output>
                    </div>
                </div>
                <div id="cip-ext-pane-prompt" class="cip-ext-pane" style="display:none;">
                    <div class="cip-ext-field">
                        <small>添加/移除提示音</small>
                        <div class="cip-ext-sound-manage">
                            <button id="cip-ext-sound-add-open" class="menu_button">添加</button>
                            <button id="cip-ext-sound-remove-open" class="menu_button">移除</button>
                        </div>
                    </div>
                    <div class="cip-ext-field">
                        <small>成功提示音（正常完整输出）</small>
                        <div class="cip-ext-sound-row">
                            <select id="cip-ext-sound-success" class="text_pole"></select>
                            <button class="cip-ext-sound-play menu_button" data-target="cip-ext-sound-success" title="试听">▶</button>
                        </div>
                    </div>
                    <div class="cip-ext-field">
                        <small>失败提示音（空回/截断/报错）</small>
                        <div class="cip-ext-sound-row">
                            <select id="cip-ext-sound-fail" class="text_pole"></select>
                            <button class="cip-ext-sound-play menu_button" data-target="cip-ext-sound-fail" title="试听">▶</button>
                        </div>
                    </div>
                    <div id="cip-ext-sound-status" class="cip-ext-status"></div>
                    <hr class="cip-ext-divider">
                    <div class="cip-ext-field">
                        <small>系统通知推送 <span id="cip-ext-notif-perm-status" class="cip-ext-notif-perm-label"></span></small>
                        <div class="cip-ext-notif-perm-row">
                            <button id="cip-ext-notif-request-perm" class="menu_button">申请权限</button>
                            <button id="cip-ext-notif-test-success" class="menu_button">测试成功</button>
                            <button id="cip-ext-notif-test-fail" class="menu_button">测试失败</button>
                        </div>
                    </div>
                    <div class="cip-ext-checkboxes">
                        <label class="cip-ext-label checkbox_label">
                            <input type="checkbox" id="cip-ext-notif-popup-enabled" ${s.notifPopupEnabled ? 'checked' : ''}>
                            <span>后台时弹出系统通知</span>
                        </label>
                        <label class="cip-ext-label checkbox_label">
                            <input type="checkbox" id="cip-ext-notif-keep-alive" ${s.notifKeepAlive ? 'checked' : ''}>
                            <span>后台保活（后台也播放声音）</span>
                        </label>
                    </div>
                    <div class="cip-ext-field">
                        <small>成功推送文案</small>
                        <input type="text" id="cip-ext-notif-success-title" class="text_pole" placeholder="推送标题（默认：AI 回复完成）" value="${s.notifSuccessTitle || ''}">
                        <input type="text" id="cip-ext-notif-success-body" class="text_pole" placeholder="推送正文（可留空）" value="${s.notifSuccessBody || ''}">
                    </div>
                    <div class="cip-ext-field">
                        <small>失败推送文案</small>
                        <input type="text" id="cip-ext-notif-fail-title" class="text_pole" placeholder="推送标题（默认：AI 回复中断）" value="${s.notifFailTitle || ''}">
                        <input type="text" id="cip-ext-notif-fail-body" class="text_pole" placeholder="推送正文（可留空）" value="${s.notifFailBody || ''}">
                    </div>
                </div>
                <div id="cip-ext-pane-font" class="cip-ext-pane" style="display:none;">
                    <div class="cip-ext-field">
                        <small>添加/移除全局字体</small>
                        <div class="cip-ext-font-manage">
                            <button id="cip-ext-font-add-open" class="menu_button">添加</button>
                            <button id="cip-ext-font-remove-open" class="menu_button">移除</button>
                        </div>
                    </div>
                    <div class="cip-ext-field">
                        <small>选择字体后点击应用，会覆盖酒馆全局字体</small>
                        <div class="cip-ext-font-row">
                            <select id="cip-ext-font-active" class="text_pole"></select>
                            <button id="cip-ext-font-apply" class="menu_button">应用</button>
                        </div>
                        <div class="cip-ext-font-message-row">
                            <label>
                                <span>message 字体大小</span>
                                <input type="number" id="cip-ext-message-font-size" class="text_pole" min="8" max="96" step="1" placeholder="px" value="${s.globalMessageFontSize || ''}">
                            </label>
                            <label>
                                <span>message 字体粗细</span>
                                <input type="number" id="cip-ext-message-font-weight" class="text_pole" min="100" max="1000" step="50" placeholder="400" value="${s.globalMessageFontWeight || ''}">
                            </label>
                        </div>
                        <div class="cip-ext-font-message-row">
                            <label>
                                <span>message 行间距</span>
                                <input type="number" id="cip-ext-message-line-height" class="text_pole" min="0.8" max="4" step="0.05" placeholder="1.5" value="${s.globalMessageLineHeight || ''}">
                            </label>
                            <label>
                                <span>message 段间距</span>
                                <input type="number" id="cip-ext-message-paragraph-spacing" class="text_pole" min="0" max="96" step="1" placeholder="px" value="${s.globalMessageParagraphSpacing || ''}">
                            </label>
                        </div>
                    </div>
                    <div id="cip-ext-font-status" class="cip-ext-status"></div>
                </div>
                <div id="cip-ext-pane-sync" class="cip-ext-pane" style="display:none;">
                    <div class="cip-ext-field">
                        <small>导出/导入扩展全部配置（主题、头像、头像框、表情包、提示音、字体、Unsplash、美化渲染等）</small>
                    </div>
                    <div class="cip-ext-sync-btns">
                        <input type="file" id="cip-ext-import-file" accept=".json" style="display:none;">
                        <button id="cip-ext-export-btn" class="menu_button">导出配置</button>
                        <button id="cip-ext-import-btn" class="menu_button">导入配置</button>
                    </div>
                    <div id="cip-ext-sync-status" class="cip-ext-status"></div>
                </div>
                <div id="cip-ext-pane-api" class="cip-ext-pane" style="display:none;">

                    <!-- 后端状态 -->
                    <div class="cip-ext-field">
                        <small>后端 plugin 状态</small>
                        <div id="cip-api-status" class="cip-ext-status">
                            <span id="cip-api-status-dot">⏳</span>
                            <span id="cip-api-status-text">检测中…</span>
                        </div>
                        <div class="cip-ext-sync-btns">
                            <button id="cip-api-check-btn" class="menu_button">重新检测</button>
                            <button id="cip-api-guide-btn" class="menu_button">重开引导</button>
                            <button id="cip-api-sync-btn" class="menu_button" style="display:none;" title="把新版 carrot/plugin 同步到酒馆 plugins/carrot">同步后端</button>
                            <button id="cip-api-restart-btn" class="menu_button" style="display:none;" title="先同步后端，再由 pm2/systemd 自动拉起">同步并重启</button>
                        </div>
                        <div id="cip-api-runtime" style="margin-top:.4em;color:#888;font-size:.85em;"></div>
                    </div>

                    <!-- 链接解析 -->
                    <details class="cip-ext-field" open>
                        <summary><b>链接解析</b></summary>
                        <div id="cip-api-link-status" style="margin:.5em 0;color:#888;font-size:.9em;"></div>
                        <div class="cip-ext-field">
                            <small>Jina Reader Key（可选，小红书/反爬兜底）</small>
                            <input type="password" id="cip-api-jina-token" class="text_pole" placeholder="jina_...">
                        </div>
                        <button id="cip-api-link-reenable" class="menu_button" style="display:none;">重新启用链接解析</button>
                    </details>

                    <!-- 语音 STT（v8.0 预留，v8.1 启用） -->
                    <details class="cip-ext-field">
                        <summary><b>语音 STT</b> <small style="color:#888;">v8.1 启用</small></summary>
                        <div class="cip-ext-field">
                            <small>硅基流动 Key（推荐，国内可直连）</small>
                            <input type="password" id="cip-api-asr-silicon" class="text_pole" placeholder="sk-...">
                        </div>
                        <div class="cip-ext-field">
                            <small>Groq Key（需要梯子）</small>
                            <input type="password" id="cip-api-asr-groq" class="text_pole" placeholder="gsk_...">
                        </div>
                        <details>
                            <summary>如何获取 Key</summary>
                            <p style="font-size:.9em;line-height:1.5;">
                                <b>硅基流动</b>：打开 <a href="https://cloud.siliconflow.cn" target="_blank" rel="noopener">cloud.siliconflow.cn</a>，
                                用手机号注册，控制台 → API 密钥 → 新建。使用免费的 <code>FunAudioLLM/SenseVoiceSmall</code> 模型。<br>
                                <b>Groq</b>：打开 <a href="https://console.groq.com" target="_blank" rel="noopener">console.groq.com</a>，
                                用 Google/GitHub 登录，API Keys → Create。使用免费的 <code>whisper-large-v3-turbo</code>，速度极快。
                            </p>
                        </details>
                    </details>

                    <!-- 图片视觉（v8.2 预留） -->
                    <details class="cip-ext-field">
                        <summary><b>图片视觉</b> <small style="color:#888;">v8.2 启用</small></summary>
                        <p style="font-size:.9em;color:#888;">敬请期待。</p>
                    </details>
                </div>
            </div>
        </div>
    `;
    container.prepend(wrapper);

    const navBtns = wrapper.querySelectorAll('.cip-ext-nav-btn');
    const panes = wrapper.querySelectorAll('.cip-ext-pane');
    function switchExtTab(tabName) {
        navBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.cipTab === tabName));
        panes.forEach((pane) => {
            pane.style.display = pane.id === `cip-ext-pane-${tabName}` ? '' : 'none';
        });
    }
    switchExtTab('main');
    navBtns.forEach((btn) => btn.addEventListener('click', (e) => {
        e.stopPropagation();
        switchExtTab(btn.dataset.cipTab);
    }));

    const floatVisibleCheckbox = document.getElementById('cip-ext-float-visible');
    const renderToggleCheckbox = document.getElementById('cip-ext-render-toggle');
    const floatIconInput = document.getElementById('cip-ext-float-icon');
    const floatSizeInput = document.getElementById('cip-ext-float-size');
    const floatSizeValue = document.getElementById('cip-ext-float-size-value');
    const floatOpacityInput = document.getElementById('cip-ext-float-opacity');
    const floatOpacityValue = document.getElementById('cip-ext-float-opacity-value');

    floatVisibleCheckbox?.addEventListener('change', () => {
        const next = floatVisibleCheckbox.checked;
        setFloatVisible(next);
        getSettings().floatVisible = next;
        saveSettings();
        applyFloatVisibility(carrotButton);
    });
    renderToggleCheckbox?.addEventListener('change', () => {
        const next = renderToggleCheckbox.checked;
        getSettings().regexEnabled = next;
        saveSettings();
        setRenderEnabled(next);
        reprocessRegexPlaceholders();
    });
    floatIconInput?.addEventListener('change', () => {
        const next = floatIconInput.value.trim();
        setFloatIconUrl(next);
        getSettings().floatIconUrl = next;
        saveSettings();
        applyFloatIcon(carrotButton);
    });
    floatSizeInput?.addEventListener('input', () => {
        const next = Number(floatSizeInput.value);
        setFloatSize(next);
        getSettings().floatSize = next;
        if (floatSizeValue) floatSizeValue.textContent = String(next);
        saveSettings();
        applyFloatIcon(carrotButton);
    });
    floatOpacityInput?.addEventListener('input', () => {
        const next = Number(floatOpacityInput.value);
        setFloatOpacity(next);
        getSettings().floatOpacity = next;
        if (floatOpacityValue) floatOpacityValue.textContent = next.toFixed(2);
        saveSettings();
        applyFloatIcon(carrotButton);
    });

    bindPromptPane(wrapper, s);
    bindFontPane(wrapper, s);
    applyGlobalFont(s.activeGlobalFont);

    bindSyncPane();
    initNotificationSounds();

    if (s.notifKeepAlive) startKeepAlive();
}

function bindFontPane(wrapper, s) {
    const fontAddOpenBtn = document.getElementById('cip-ext-font-add-open');
    const fontRemoveOpenBtn = document.getElementById('cip-ext-font-remove-open');
    const fontActiveSelect = document.getElementById('cip-ext-font-active');
    const fontApplyBtn = document.getElementById('cip-ext-font-apply');
    const messageFontSizeInput = document.getElementById('cip-ext-message-font-size');
    const messageFontWeightInput = document.getElementById('cip-ext-message-font-weight');
    const messageLineHeightInput = document.getElementById('cip-ext-message-line-height');
    const messageParagraphSpacingInput = document.getElementById('cip-ext-message-paragraph-spacing');
    const fontStatus = document.getElementById('cip-ext-font-status');

    const setFontStatus = (message) => {
        if (fontStatus) fontStatus.textContent = message || '';
    };
    const refreshFontSelects = () => {
        buildFontOptions(fontActiveSelect);
        if (fontActiveSelect) fontActiveSelect.value = s.activeGlobalFont || '';
    };
    refreshFontSelects();

    fontAddOpenBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const entries = await showFontAddPopup();
        if (!entries) return;
        const validEntries = entries.filter(({ name, url }) => name && url && isAllowedResourceUrl(url));
        if (!validEntries.length) {
            setFontStatus('未解析到有效字体。请填写名称和 http(s)/站内链接');
            return;
        }
        if (validEntries.length !== entries.length) {
            setFontStatus(`⚠️ 已跳过 ${entries.length - validEntries.length} 条无效字体`);
        }
        if (!s.globalFonts) s.globalFonts = {};
        validEntries.forEach(({ name, url }) => {
            s.globalFonts[name] = { name, url };
        });
        saveSettings();
        refreshFontSelects();
        if (fontActiveSelect && !s.activeGlobalFont) fontActiveSelect.value = validEntries[0].name;
        setFontStatus(`✅ 已保存 ${validEntries.length} 个字体`);
    });

    fontRemoveOpenBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const select = document.createElement('select');
        select.className = 'text_pole wide100p';
        buildFontOptions(select);
        const name = await showSelectRemovePopup('移除字体', select);
        if (!name) {
            setFontStatus('请选择要移除的字体');
            return;
        }
        if (s.globalFonts) delete s.globalFonts[name];
        if (s.activeGlobalFont === name) {
            s.activeGlobalFont = '';
            applyGlobalFont('');
        }
        saveSettings();
        refreshFontSelects();
        setFontStatus(`✅ 已移除字体：${name}`);
    });

    fontApplyBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = fontActiveSelect?.value || '';
        s.activeGlobalFont = name;
        s.globalMessageFontSize = normalizeMessageFontSize(messageFontSizeInput?.value || '');
        s.globalMessageFontWeight = normalizeMessageFontWeight(messageFontWeightInput?.value || '');
        s.globalMessageLineHeight = normalizeMessageLineHeight(messageLineHeightInput?.value || '');
        s.globalMessageParagraphSpacing = normalizeMessageParagraphSpacing(messageParagraphSpacingInput?.value || '');
        if (messageFontSizeInput) messageFontSizeInput.value = s.globalMessageFontSize;
        if (messageFontWeightInput) messageFontWeightInput.value = s.globalMessageFontWeight;
        if (messageLineHeightInput) messageLineHeightInput.value = s.globalMessageLineHeight;
        if (messageParagraphSpacingInput) messageParagraphSpacingInput.value = s.globalMessageParagraphSpacing;
        saveSettings();
        const applied = applyGlobalFont(name);
        setFontStatus(applied ? `✅ 已应用字体设置${name ? `：${name}` : ''}` : '✅ 已恢复默认字体设置');
    });

    fontActiveSelect?.addEventListener('change', () => {
        setFontStatus('');
    });
    messageFontSizeInput?.addEventListener('input', () => setFontStatus(''));
    messageFontWeightInput?.addEventListener('input', () => setFontStatus(''));
    messageLineHeightInput?.addEventListener('input', () => setFontStatus(''));
    messageParagraphSpacingInput?.addEventListener('input', () => setFontStatus(''));
}

function bindPromptPane(wrapper, s) {
    const soundAddOpenBtn = document.getElementById('cip-ext-sound-add-open');
    const soundRemoveOpenBtn = document.getElementById('cip-ext-sound-remove-open');
    const soundSuccessSelect = document.getElementById('cip-ext-sound-success');
    const soundFailSelect = document.getElementById('cip-ext-sound-fail');
    const soundStatus = document.getElementById('cip-ext-sound-status');
    const setSoundStatus = (message) => {
        if (soundStatus) soundStatus.textContent = message || '';
    };

    function refreshSoundSelects() {
        buildSoundOptions(soundSuccessSelect);
        buildSoundOptions(soundFailSelect);
        soundSuccessSelect.value = s.notifSuccess || '';
        soundFailSelect.value = s.notifFail || '';
    }
    refreshSoundSelects();

    soundAddOpenBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const payload = await showSoundAddPopup();
        if (!payload) return;
        const { name, url } = payload;
        if (!name || !url) {
            setSoundStatus('请输入提示音名称和音频直链');
            return;
        }
        if (!s.notifSounds) s.notifSounds = {};
        s.notifSounds[name] = url;
        saveSettings();
        refreshSoundSelects();
        soundSuccessSelect.value = s.notifSuccess || '';
        soundFailSelect.value = s.notifFail || '';
        setSoundStatus('✅ 提示音已保存');
    });

    soundRemoveOpenBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const select = document.createElement('select');
        select.className = 'text_pole wide100p';
        buildSoundOptions(select);
        const name = await showSelectRemovePopup('移除提示音', select);
        if (!name) {
            setSoundStatus('请选择要移除的提示音');
            return;
        }
        if (s.notifSounds) delete s.notifSounds[name];
        _soundAudioCache.delete(name);
        if (s.notifSuccess === name) s.notifSuccess = '';
        if (s.notifFail === name) s.notifFail = '';
        saveSettings();
        refreshSoundSelects();
        setSoundStatus(`✅ 已移除提示音：${name}`);
    });

    soundSuccessSelect?.addEventListener('change', () => {
        s.notifSuccess = soundSuccessSelect.value;
        saveSettings();
    });
    soundFailSelect?.addEventListener('change', () => {
        s.notifFail = soundFailSelect.value;
        saveSettings();
    });

    wrapper.querySelectorAll('.cip-ext-sound-play').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const sel = document.getElementById(btn.dataset.target);
            if (!sel?.value) {
                setSoundStatus('请选择一个提示音');
                return;
            }
            setSoundStatus('正在试听...');
            const ok = await playSound(sel.value);
            setSoundStatus(ok ? '✅ 试听成功' : '❌ 试听失败，请检查直链或浏览器播放权限');
        });
    });

    // --- 系统通知推送 ---
    const notifPermStatus = document.getElementById('cip-ext-notif-perm-status');
    const notifRequestPermBtn = document.getElementById('cip-ext-notif-request-perm');
    const notifTestSuccessBtn = document.getElementById('cip-ext-notif-test-success');
    const notifTestFailBtn = document.getElementById('cip-ext-notif-test-fail');
    const notifPopupEnabledCb = document.getElementById('cip-ext-notif-popup-enabled');
    const notifKeepAliveCb = document.getElementById('cip-ext-notif-keep-alive');
    const notifSuccessTitleInput = document.getElementById('cip-ext-notif-success-title');
    const notifSuccessBodyInput = document.getElementById('cip-ext-notif-success-body');
    const notifFailTitleInput = document.getElementById('cip-ext-notif-fail-title');
    const notifFailBodyInput = document.getElementById('cip-ext-notif-fail-body');
    const keepAlivePlayerHost = document.createElement('div');
    keepAlivePlayerHost.className = 'cip-ext-field cip-ext-keep-alive-player';
    keepAlivePlayerHost.innerHTML = '<small>Silence Player</small>';
    keepAlivePlayerHost.appendChild(getOrCreateKeepAliveAudio());
    notifKeepAliveCb?.closest('.cip-ext-checkboxes')?.after(keepAlivePlayerHost);

    const refreshPermStatus = () => {
        if (notifPermStatus) notifPermStatus.textContent = getNotifPermStatus();
    };
    refreshPermStatus();

    notifRequestPermBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const before = 'Notification' in window ? Notification.permission : null;
        const result = await requestNotifPermission();
        refreshPermStatus();
        if (result === 'unsupported') {
            setSoundStatus('❌ 此浏览器不支持系统通知');
        } else if (result === 'granted') {
            setSoundStatus('✅ 通知权限已授权');
        } else if (result === 'denied') {
            if (before === 'denied') {
                setSoundStatus('❌ 通知权限之前已被拒绝。请在浏览器地址栏左侧点击网站信息图标 → 通知 → 允许，然后刷新页面');
            } else {
                setSoundStatus('❌ 通知权限被拒绝');
            }
        } else if (result === 'default') {
            setSoundStatus('⚠️ 未做选择，请在弹出的对话框中点击"允许"');
        }
    });

    const sendTestNotif = (title, body, label) => {
        if (!('Notification' in window)) {
            setSoundStatus('❌ 此浏览器不支持系统通知');
            return;
        }
        if (Notification.permission !== 'granted') {
            setSoundStatus('❌ 请先申请通知权限');
            return;
        }
        showSystemNotification(title, body);
        setSoundStatus(`✅ ${label}测试通知已发送`);
    };

    notifTestSuccessBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        sendTestNotif(
            s.notifSuccessTitle || 'AI 回复完成',
            s.notifSuccessBody || '这是一条成功测试通知',
            '成功',
        );
    });

    notifTestFailBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        sendTestNotif(
            s.notifFailTitle || 'AI 回复中断',
            s.notifFailBody || '这是一条失败测试通知',
            '失败',
        );
    });

    notifPopupEnabledCb?.addEventListener('change', () => {
        s.notifPopupEnabled = notifPopupEnabledCb.checked;
        saveSettings();
    });

    notifKeepAliveCb?.addEventListener('change', () => {
        s.notifKeepAlive = notifKeepAliveCb.checked;
        saveSettings();
        if (s.notifKeepAlive) {
            startKeepAlive();
        } else {
            stopKeepAlive();
        }
    });

    notifSuccessTitleInput?.addEventListener('change', () => {
        s.notifSuccessTitle = notifSuccessTitleInput.value.trim();
        saveSettings();
    });
    notifSuccessBodyInput?.addEventListener('change', () => {
        s.notifSuccessBody = notifSuccessBodyInput.value.trim();
        saveSettings();
    });
    notifFailTitleInput?.addEventListener('change', () => {
        s.notifFailTitle = notifFailTitleInput.value.trim();
        saveSettings();
    });
    notifFailBodyInput?.addEventListener('change', () => {
        s.notifFailBody = notifFailBodyInput.value.trim();
        saveSettings();
    });
}

function bindSyncPane() {
    const exportBtn = document.getElementById('cip-ext-export-btn');
    const importBtn = document.getElementById('cip-ext-import-btn');
    const importFileInput = document.getElementById('cip-ext-import-file');
    const syncStatus = document.getElementById('cip-ext-sync-status');

    exportBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        try {
            const data = exportLegacySettings();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const d = new Date();
            link.download = `carrot-settings-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            if (syncStatus) syncStatus.textContent = '✅ 导出成功';
        } catch (err) {
            console.error('胡萝卜插件：导出失败', err);
            if (syncStatus) syncStatus.textContent = '❌ 导出失败';
        }
    });
    importBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        importFileInput?.click();
    });
    importFileInput?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const imported = JSON.parse(ev.target.result);
                if (!imported || typeof imported !== 'object') throw new Error('无效格式');
                importLegacySettings(imported);
                await flushSettings();
                if (syncStatus) syncStatus.textContent = '✅ 导入成功，刷新页面以应用全部更改';
                setTimeout(() => window.location.reload(), 300);
            } catch (err) {
                console.error('胡萝卜插件：导入失败', err);
                if (syncStatus) syncStatus.textContent = '❌ 导入失败，文件格式不正确';
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    });

    // ===== v8.0: API 面板 =====
    initApiPane();
}

async function initApiPane() {
    const { pingBackend, isBackendReady, showGuideModal, getBackendStatus, syncBackendPlugin, requestBackendRestart } = await import('./backend.js');
    const s = getSettings();
    s.asr = s.asr || {};

    const statusDot = document.getElementById('cip-api-status-dot');
    const statusText = document.getElementById('cip-api-status-text');
    const checkBtn = document.getElementById('cip-api-check-btn');
    const guideBtn = document.getElementById('cip-api-guide-btn');
    const syncBtn = document.getElementById('cip-api-sync-btn');
    const restartBtn = document.getElementById('cip-api-restart-btn');
    const runtimeInfo = document.getElementById('cip-api-runtime');
    const linkStatus = document.getElementById('cip-api-link-status');
    const linkReenableBtn = document.getElementById('cip-api-link-reenable');
    const jinaToken = document.getElementById('cip-api-jina-token');
    const asrSilicon = document.getElementById('cip-api-asr-silicon');
    const asrGroq = document.getElementById('cip-api-asr-groq');

    function refreshStatus() {
        const ready = isBackendReady();
        const st = getBackendStatus();
        statusDot.textContent = ready ? '✅' : '⏳';
        statusText.textContent = ready
            ? `已启用（plugin v${st.version || '?'}）`
            : '未启用';

        // 进程管理器：受管才显示"重启"按钮
        if (ready) {
            syncBtn.style.display = '';
        } else {
            syncBtn.style.display = 'none';
        }
        if (ready && st.runtime?.managed) {
            restartBtn.style.display = '';
            runtimeInfo.textContent = `运行环境：${st.runtime.manager}（可同步并自动重启）`;
        } else if (ready) {
            restartBtn.style.display = 'none';
            const tag = st.runtime?.manager === 'docker-unknown'
                ? 'docker（未知 restart policy）'
                : '裸 node';
            runtimeInfo.textContent = `运行环境：${tag}（可同步后端；重启需手动完成）`;
        } else {
            restartBtn.style.display = 'none';
            runtimeInfo.textContent = '';
        }

        // 前后端版本一致性检查（copy 部署，升级后需同步后端）
        if (ready && st.version) {
            const FE_VERSION = '8.0.6';
            const major = (v) => String(v).split('.').slice(0, 2).join('.');
            if (major(st.version) !== major(FE_VERSION)) {
                runtimeInfo.innerHTML += `<br><span style="color:#d33;">⚠ 后端 plugin v${st.version} 与前端 v${FE_VERSION} 主版本不一致，建议点击「同步后端」</span>`;
            }
        }
        // 链接解析子节状态
        const linkDisabled = !!(s.linkParse && s.linkParse.disabled);
        if (linkDisabled) {
            linkStatus.innerHTML = '<span style="color:#d33;">⚠ 你已主动关闭链接解析</span>';
            linkReenableBtn.style.display = '';
        } else if (!ready) {
            linkStatus.innerHTML = '<span style="color:#d33;">⚠ 需要启用后端 plugin（见上方"重开引导"）</span>';
            linkReenableBtn.style.display = 'none';
        } else {
            linkStatus.innerHTML = '<span style="color:#3a3;">✓ 链接解析已就绪</span>';
            linkReenableBtn.style.display = 'none';
        }
    }

    checkBtn?.addEventListener('click', async () => {
        statusDot.textContent = '⏳';
        statusText.textContent = '检测中…';
        await pingBackend();
        refreshStatus();
    });

    guideBtn?.addEventListener('click', () => {
        showGuideModal();
    });

    syncBtn?.addEventListener('click', async () => {
        syncBtn.disabled = true;
        const prevText = syncBtn.textContent;
        syncBtn.textContent = '同步中…';
        try {
            await syncBackendPlugin();
            if (typeof toastr !== 'undefined') toastr.success('后端文件已同步，手动重启酒馆后生效', 'carrot');
            await pingBackend();
            refreshStatus();
        } catch (e) {
            if (typeof toastr !== 'undefined') toastr.error(e?.message || String(e), '同步失败');
        } finally {
            syncBtn.disabled = false;
            syncBtn.textContent = prevText;
        }
    });

    restartBtn?.addEventListener('click', async () => {
        if (!confirm('将先同步 carrot 后端文件，再让酒馆 node 进程退出，由 pm2/systemd 自动拉起。\n约 5-15 秒后页面会重新连上。继续？')) return;
        restartBtn.disabled = true;
        const prevText = restartBtn.textContent;
        restartBtn.textContent = '重启中…';
        try {
            await requestBackendRestart();
            statusDot.textContent = '⏳';
            statusText.textContent = '后端已退出，等待自动拉起…';
            // 每秒 ping 一次，最长等 30s
            let attempts = 0;
            const timer = setInterval(async () => {
                attempts++;
                const ok = await pingBackend();
                if (ok) {
                    clearInterval(timer);
                    refreshStatus();
                    if (typeof toastr !== 'undefined') toastr.success('后端已恢复', 'carrot');
                    restartBtn.disabled = false;
                    restartBtn.textContent = prevText;
                } else if (attempts >= 30) {
                    clearInterval(timer);
                    statusText.textContent = '超过 30s 未拉起，请手动检查 pm2/systemd';
                    restartBtn.disabled = false;
                    restartBtn.textContent = prevText;
                }
            }, 1000);
        } catch (e) {
            if (typeof toastr !== 'undefined') toastr.error(e?.message || String(e), '重启失败');
            restartBtn.disabled = false;
            restartBtn.textContent = prevText;
        }
    });

    linkReenableBtn?.addEventListener('click', () => {
        s.linkParse = s.linkParse || {};
        s.linkParse.disabled = false;
        saveSettings();
        refreshStatus();
    });

    if (jinaToken) {
        s.linkParse = s.linkParse || {};
        jinaToken.value = s.linkParse.jinaToken || '';
        jinaToken.addEventListener('input', () => {
            s.linkParse = s.linkParse || {};
            s.linkParse.jinaToken = jinaToken.value.trim();
            saveSettings();
        });
    }

    if (asrSilicon) {
        asrSilicon.value = s.asr.siliconflowKey || '';
        asrSilicon.addEventListener('input', () => {
            s.asr = s.asr || {};
            s.asr.siliconflowKey = asrSilicon.value.trim();
            saveSettings();
        });
    }
    if (asrGroq) {
        asrGroq.value = s.asr.groqKey || '';
        asrGroq.addEventListener('input', () => {
            s.asr = s.asr || {};
            s.asr.groqKey = asrGroq.value.trim();
            saveSettings();
        });
    }

    // 初次刷新
    refreshStatus();
    // 启动时若 backend 还没 ping 过，自己 ping 一下
    if (!isBackendReady()) {
        await pingBackend();
        refreshStatus();
    }
}
