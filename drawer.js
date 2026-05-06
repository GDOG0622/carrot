import {
    exportLegacySettings,
    flushSettings,
    getSettings,
    importLegacySettings,
    saveSettings,
} from './config.js';

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

function initNotificationSounds() {
    import('/scripts/events.js').then((eventsModule) => {
        const evTypes = eventsModule.event_types;
        const getEventSource = () => {
            try {
                return window.SillyTavern?.getContext?.()?.eventSource || eventsModule.eventSource;
            } catch (e) {
                return null;
            }
        };
        let generationActive = false;
        let receivedMessage = false;
        let playedForGeneration = false;
        const hasMessageText = (messageId) => {
            try {
                const chat = window.SillyTavern?.getContext?.()?.chat || [];
                const message = chat[messageId];
                const text = (message?.mes || '').replace(/<[^>]*>/g, '').trim();
                return !!text;
            } catch (e) {
                return true;
            }
        };
        const playSuccess = () => {
            const s = getSettings();
            if (s.notifSuccess && !playedForGeneration) {
                playedForGeneration = true;
                playSound(s.notifSuccess);
            }
        };
        const playFail = () => {
            const s = getSettings();
            if (s.notifFail && !playedForGeneration) {
                playedForGeneration = true;
                playSound(s.notifFail);
            }
        };
        const tryBind = () => {
            const es = getEventSource();
            if (!es) {
                setTimeout(tryBind, 2000);
                return;
            }
            es.on(evTypes.GENERATION_STARTED, () => {
                generationActive = true;
                receivedMessage = false;
                playedForGeneration = false;
            });
            es.on(evTypes.MESSAGE_RECEIVED, (messageId, type) => {
                if (!generationActive) return;
                if (type === 'first_message') return;
                if (!hasMessageText(messageId)) return;
                receivedMessage = true;
                playSuccess();
            });
            es.on(evTypes.GENERATION_STOPPED, () => {
                if (generationActive && !receivedMessage) {
                    playFail();
                }
                generationActive = false;
            });
            es.on(evTypes.GENERATION_ENDED, () => {
                setTimeout(() => {
                    if (generationActive && !receivedMessage) {
                        playFail();
                    }
                    generationActive = false;
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
    regexEnabled,
    regexModuleReady,
    setFloatVisible,
    setFloatIconUrl,
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

    bindPromptPane(wrapper, s);
    bindSyncPane();
    initNotificationSounds();
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
