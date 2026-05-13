import {
    exportLegacySettings,
    flushSettings,
    getSettings,
    importLegacySettings,
    saveSettings,
} from './config.js';

// --- 后台保活 ---
const SILENT_AUDIO_SRC = 'data:audio/wav;base64,UklGRmQGAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YUAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
let _keepAliveAudio = null;
let _keepAliveUnlockBound = false;
let _notificationSoundsInited = false;
const _soundAudioCache = new Map();
const KEEP_ALIVE_AUDIO_SRC = new URL('./silence.m4a', import.meta.url).href;

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
    regexEnabled,
    regexModuleReady,
    setFloatVisible,
    setFloatIconUrl,
    setFloatSize,
    setFloatOpacity,
    setRegexEnabled,
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
                    <button class="cip-ext-nav-btn menu_button" data-cip-tab="sync">同步</button>
                </div>
                <div id="cip-ext-pane-main" class="cip-ext-pane">
                    <div class="cip-ext-checkboxes">
                        <label class="cip-ext-label checkbox_label">
                            <input type="checkbox" id="cip-ext-float-visible" ${floatVisible ? 'checked' : ''}>
                            <span>显示浮标</span>
                        </label>
                        <label class="cip-ext-label checkbox_label">
                            <input type="checkbox" id="cip-ext-regex-toggle" ${regexEnabled ? 'checked' : ''}>
                            <span>内置正则</span>
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
                    <div id="cip-ext-sound-add-modal" class="cip-ext-modal hidden">
                        <div class="cip-ext-modal-content">
                            <h4>添加提示音</h4>
                            <input type="text" id="cip-ext-sound-name" class="text_pole" placeholder="提示音名称">
                            <input type="text" id="cip-ext-sound-url" class="text_pole" placeholder="音频直链 URL">
                            <div class="cip-ext-modal-actions">
                                <button id="cip-ext-sound-add-cancel" class="menu_button">取消</button>
                                <button id="cip-ext-sound-save" class="menu_button">保存</button>
                            </div>
                        </div>
                    </div>
                    <div id="cip-ext-sound-remove-modal" class="cip-ext-modal hidden">
                        <div class="cip-ext-modal-content">
                            <h4>移除提示音</h4>
                            <select id="cip-ext-sound-remove-select" class="text_pole"></select>
                            <div class="cip-ext-modal-actions">
                                <button id="cip-ext-sound-remove-cancel" class="menu_button">取消</button>
                                <button id="cip-ext-sound-remove-confirm" class="menu_button">移除</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div id="cip-ext-pane-sync" class="cip-ext-pane" style="display:none;">
                    <div class="cip-ext-field">
                        <small>导出/导入扩展全部配置（主题、头像、头像框、表情包、提示音、Unsplash、正则等）</small>
                    </div>
                    <div class="cip-ext-sync-btns">
                        <input type="file" id="cip-ext-import-file" accept=".json" style="display:none;">
                        <button id="cip-ext-export-btn" class="menu_button">导出配置</button>
                        <button id="cip-ext-import-btn" class="menu_button">导入配置</button>
                    </div>
                    <div id="cip-ext-sync-status" class="cip-ext-status"></div>
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
    const regexToggleCheckbox = document.getElementById('cip-ext-regex-toggle');
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
    regexToggleCheckbox?.addEventListener('change', () => {
        const next = regexToggleCheckbox.checked;
        getSettings().regexEnabled = next;
        saveSettings();
        if (regexModuleReady) {
            try {
                setRegexEnabled(next);
            } catch (e) {}
        }
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

    bindSyncPane();
    initNotificationSounds();

    if (s.notifKeepAlive) startKeepAlive();
}

function bindPromptPane(wrapper, s) {
    const soundAddOpenBtn = document.getElementById('cip-ext-sound-add-open');
    const soundRemoveOpenBtn = document.getElementById('cip-ext-sound-remove-open');
    const soundAddModal = document.getElementById('cip-ext-sound-add-modal');
    const soundRemoveModal = document.getElementById('cip-ext-sound-remove-modal');
    const soundNameInput = document.getElementById('cip-ext-sound-name');
    const soundUrlInput = document.getElementById('cip-ext-sound-url');
    const soundSaveBtn = document.getElementById('cip-ext-sound-save');
    const soundAddCancelBtn = document.getElementById('cip-ext-sound-add-cancel');
    const soundRemoveSelect = document.getElementById('cip-ext-sound-remove-select');
    const soundRemoveCancelBtn = document.getElementById('cip-ext-sound-remove-cancel');
    const soundRemoveConfirmBtn = document.getElementById('cip-ext-sound-remove-confirm');
    const soundSuccessSelect = document.getElementById('cip-ext-sound-success');
    const soundFailSelect = document.getElementById('cip-ext-sound-fail');
    const soundStatus = document.getElementById('cip-ext-sound-status');
    const setSoundStatus = (message) => {
        if (soundStatus) soundStatus.textContent = message || '';
    };
    const toggleSoundModal = (modal, visible) => {
        modal?.classList.toggle('hidden', !visible);
    };

    function refreshSoundSelects() {
        buildSoundOptions(soundSuccessSelect);
        buildSoundOptions(soundFailSelect);
        buildSoundOptions(soundRemoveSelect);
        soundSuccessSelect.value = s.notifSuccess || '';
        soundFailSelect.value = s.notifFail || '';
    }
    refreshSoundSelects();

    soundAddOpenBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (soundNameInput) soundNameInput.value = '';
        if (soundUrlInput) soundUrlInput.value = '';
        toggleSoundModal(soundAddModal, true);
        soundNameInput?.focus();
    });
    soundRemoveOpenBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        refreshSoundSelects();
        toggleSoundModal(soundRemoveModal, true);
        soundRemoveSelect?.focus();
    });
    soundAddCancelBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSoundModal(soundAddModal, false);
    });
    soundRemoveCancelBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSoundModal(soundRemoveModal, false);
    });
    soundAddModal?.addEventListener('click', (e) => {
        if (e.target === soundAddModal) toggleSoundModal(soundAddModal, false);
    });
    soundRemoveModal?.addEventListener('click', (e) => {
        if (e.target === soundRemoveModal) toggleSoundModal(soundRemoveModal, false);
    });

    soundSaveBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = soundNameInput?.value?.trim();
        const url = soundUrlInput?.value?.trim();
        if (!name || !url) {
            setSoundStatus('请输入提示音名称和音频直链');
            return;
        }
        if (!s.notifSounds) s.notifSounds = {};
        s.notifSounds[name] = url;
        saveSettings();
        if (soundNameInput) soundNameInput.value = '';
        if (soundUrlInput) soundUrlInput.value = '';
        refreshSoundSelects();
        soundSuccessSelect.value = s.notifSuccess || '';
        soundFailSelect.value = s.notifFail || '';
        toggleSoundModal(soundAddModal, false);
        setSoundStatus('✅ 提示音已保存');
    });
    soundRemoveConfirmBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = soundRemoveSelect?.value;
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
        toggleSoundModal(soundRemoveModal, false);
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
}
