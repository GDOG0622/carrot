// script.js (v7.1 - extension_settings 迁移)
(async function () {
    if (document.getElementById('cip-carrot-button')) return;

    const {
        createSettingsStorage,
        DEFAULT_FLOAT_ICON_URL,
        getSettings,
        migrateFromLocalStorage,
        saveSettings,
    } = await import('./config.js');
    const { createUI } = await import('./ui.js');
    const { injectExtensionDrawer } = await import('./drawer.js');
    const {
        buildStickerLookup,
        replaceStickerPlaceholders: replaceStickerPlaceholdersCore,
        reprocessStickerPlaceholders: reprocessStickerPlaceholdersCore,
    } = await import('./stickers.js');
    const { createUnsplashProcessor } = await import('./unsplash.js');
    const { initCompactSelectDropdowns } = await import('./selects.js');

    // --- extension_settings 初始化 ---
    const settingsStorage = createSettingsStorage({
        runtimeLocalStorage: localStorage,
    });

    // 首次运行时从 localStorage 迁移数据
    migrateFromLocalStorage(localStorage);

    let applyRegexReplacements = () => false;
    let getRegexEnabled = () => true;
    let setRegexEnabled = () => {};
    let clearRegexState = () => {};
    let regexModuleReady = false;
    let regexEnabled = true;

    try {
        const regexModule = await import('./regex.js');
        applyRegexReplacements =
            typeof regexModule.applyRegexReplacements === 'function'
                ? regexModule.applyRegexReplacements
                : applyRegexReplacements;
        getRegexEnabled =
            typeof regexModule.getRegexEnabled === 'function'
                ? regexModule.getRegexEnabled
                : getRegexEnabled;
        setRegexEnabled =
            typeof regexModule.setRegexEnabled === 'function'
                ? regexModule.setRegexEnabled
                : setRegexEnabled;
        clearRegexState =
            typeof regexModule.clearRegexState === 'function'
                ? regexModule.clearRegexState
                : clearRegexState;

        regexModuleReady =
            typeof regexModule.applyRegexReplacements === 'function';

        if (regexModuleReady) {
            try {
                regexEnabled = !!getRegexEnabled();
            } catch (error) {
                regexEnabled = true;
                console.warn('胡萝卜插件：读取正则开关状态失败', error);
            }
        }
    } catch (error) {
        console.warn('胡萝卜插件：加载正则模块失败', error);
    }

    const stickerPlaceholderRegex = /\[([^\[\]]+?)\]/g;

    let unsplashAccessKey = getSettings().unsplashAccessKey || '';
    let unsplashProcessor = null;

    function setUnsplashAccessKey(value) {
        unsplashAccessKey = value.trim();
        getSettings().unsplashAccessKey = unsplashAccessKey;
        saveSettings();
    }

    function reprocessUnsplashPlaceholders() {
        unsplashProcessor?.reprocess();
    }

    // --- 动态加载Emoji Picker库 ---
    const pickerScript = document.createElement('script');
    pickerScript.type = 'module';
    pickerScript.src =
        'https://cdn.jsdelivr.net/npm/emoji-picker-element@^1/index.js';
    document.head.appendChild(pickerScript);

    // --- 浮标显隐与自定义图标 ---
    let floatVisible = getSettings().floatVisible !== false;
    let floatIconUrl = getSettings().floatIconUrl || '';
    let floatSize = getSettings().floatSize || 30;
    let floatOpacity = getSettings().floatOpacity || 1;

    function applyFloatIcon(button) {
        const iconUrl = floatIconUrl || DEFAULT_FLOAT_ICON_URL;
        button.textContent = '';
        button.style.width = `${floatSize}px`;
        button.style.height = `${floatSize}px`;
        button.style.opacity = String(floatOpacity);
        button.style.backgroundImage = `url(${iconUrl})`;
        button.style.backgroundSize = 'contain';
        button.style.backgroundRepeat = 'no-repeat';
        button.style.backgroundPosition = 'center';
        button.style.backgroundColor = 'transparent';
        button.style.boxShadow = 'none';
        button.style.border = 'none';
        button.style.borderRadius = '0';
        button.style.overflow = 'visible';
    }

    function applyFloatVisibility(button) {
        button.style.display = floatVisible ? '' : 'none';
    }

    // --- 1. 创建所有UI元素 ---
    // --- 2. 注入UI到页面中 ---
    const {
        carrotButton,
        inputPanel,
        emojiPicker,
        addCategoryModal,
        addStickersModal,
        settingsPanel,
    } = createUI();
    const anchor = document.querySelector(
        '#chat-buttons-container, #send_form',
    );
    if (anchor) {
        document.body.appendChild(carrotButton);
        document.body.appendChild(inputPanel);
        document.body.appendChild(emojiPicker);
        document.body.appendChild(addCategoryModal);
        document.body.appendChild(addStickersModal);
        document.body.appendChild(settingsPanel);
        initCompactSelectDropdowns(document);
    } else {
        console.error(
            '胡萝卜输入面板：未能找到SillyTavern的UI挂载点，插件无法加载。',
        );
        return;
    }

    // --- 3. 获取所有元素的引用 ---
    const get = (id) => document.getElementById(id);
    const queryAll = (sel) => document.querySelectorAll(sel);
    const formatDisplay = get('cip-format-display'),
        insertButton = get('cip-insert-button'),
        recallButton = get('cip-recall-button');
    const mainInput = get('cip-main-input'),
        voiceDurationInput = get('cip-voice-duration'),
        voiceMessageInput = get('cip-voice-message');
    const walletPlatformInput = get('cip-wallet-platform');
    const walletAmountInput = get('cip-wallet-amount');
    const walletMessageInput = get('cip-wallet-message');
    const stickerCategoriesContainer = get('cip-sticker-categories'),
        addCategoryBtn = get('cip-add-category-btn'),
        stickerGrid = get('cip-sticker-grid');
    const emojiPickerBtn = get('cip-emoji-picker-btn');
    const saveCategoryBtn = get('cip-save-category-btn'),
        cancelCategoryBtn = get('cip-cancel-category-btn'),
        newCategoryNameInput = get('cip-new-category-name');
    const addStickerTitle = get('cip-add-sticker-title'),
        saveStickersBtn = get('cip-save-stickers-btn'),
        cancelStickersBtn = get('cip-cancel-stickers-btn'),
        newStickersInput = get('cip-new-stickers-input');
    const settingsButton = get('cip-settings-button');
    const settingsPanelEl = get('cip-settings-panel');
    const closeSettingsPanelBtn = get('cip-close-settings-panel-btn');
    const settingsTabs = Array.from(queryAll('.cip-settings-tab'));
    const settingsSections = Array.from(queryAll('.cip-settings-section'));
    const colorInputs = queryAll('.cip-theme-options-grid input[type="text"]');
    const colorPickers = queryAll('.cip-color-picker');
    const themeSelect = get('cip-theme-select');
    const newThemeNameInput = get('cip-new-theme-name');
    const saveThemeBtn = get('cip-save-theme-btn');
    const deleteThemeBtn = get('cip-delete-theme-btn');

    const avatarSubtabs = document.querySelectorAll('.cip-avatar-subtab');
    const avatarPanes = document.querySelectorAll('.cip-avatar-pane');
    const charAvatarUrlInput = get('cip-char-avatar-url');
    const userAvatarUrlInput = get('cip-user-avatar-url');
    const charAvatarFrameUrlInput = get('cip-char-frame-url');
    const userAvatarFrameUrlInput = get('cip-user-frame-url');
    const unsplashAccessKeyInput = get('cip-unsplash-access-key');
    const avatarProfileSelect = get('cip-avatar-profile-select');
    const applyAvatarBtn = get('cip-apply-avatar-btn');
    const deleteAvatarBtn = get('cip-delete-avatar-btn');
    const newAvatarProfileNameInput = get('cip-new-avatar-profile-name');
    const saveAvatarBtn = get('cip-save-avatar-btn');

    const adjustCharFrameBtn = get('cip-adjust-char-frame-btn');
    const adjustUserFrameBtn = get('cip-adjust-user-frame-btn');
    const frameAdjustPanel = get('cip-frame-adjust-panel');
    const frameAdjustTitle = get('cip-frame-adjust-title');
    const frameSizeSlider = get('cip-frame-size-slider');
    const frameSizeValue = get('cip-frame-size-value');
    const frameOffsetXSlider = get('cip-frame-offset-x-slider');
    const frameOffsetXValue = get('cip-frame-offset-x-value');
    const frameOffsetYSlider = get('cip-frame-offset-y-slider');
    const frameOffsetYValue = get('cip-frame-offset-y-value');
    const frameResetBtn = get('cip-frame-reset-btn');
    const frameCloseBtn = get('cip-frame-close-btn');
    const frameProfileSelect = get('cip-frame-profile-select');
    const applyFrameBtn = get('cip-apply-frame-btn');
    const deleteFrameBtn = get('cip-delete-frame-btn');
    const newFrameProfileNameInput = get('cip-new-frame-profile-name');
    const saveFrameBtn = get('cip-save-frame-btn');

    let themeApi;
    let avatarApi;
    try {
        const settingLoader = await import('./setting/index.js');
        if (typeof settingLoader.loadSettingModules !== 'function') {
            throw new Error('缺少设置模块加载器 loadSettingModules');
        }

        const {
            initThemeSettings,
            initAvatarSettings,
        } = await settingLoader.loadSettingModules();

        themeApi = initThemeSettings(
            {
                colorInputs,
                colorPickers,
                themeSelect,
                newThemeNameInput,
                saveThemeBtn,
                deleteThemeBtn,
            },
            {
                documentRef: document,
                localStorageRef: settingsStorage,
            },
        );

        avatarApi = initAvatarSettings(
            {
                charAvatarUrlInput,
                userAvatarUrlInput,
                charAvatarFrameUrlInput,
                userAvatarFrameUrlInput,
                unsplashAccessKeyInput,
                avatarProfileSelect,
                applyAvatarBtn,
                deleteAvatarBtn,
                newAvatarProfileNameInput,
                saveAvatarBtn,
                avatarSubtabs,
                avatarPanes,
                adjustCharFrameBtn,
                adjustUserFrameBtn,
                frameAdjustPanel,
                frameAdjustTitle,
                frameSizeSlider,
                frameSizeValue,
                frameOffsetXSlider,
                frameOffsetXValue,
                frameOffsetYSlider,
                frameOffsetYValue,
                frameResetBtn,
                frameCloseBtn,
                frameProfileSelect,
                applyFrameBtn,
                deleteFrameBtn,
                newFrameProfileNameInput,
                saveFrameBtn,
            },
            {
                documentRef: document,
                localStorageRef: settingsStorage,
                alertRef: (message) => alert(message),
                confirmRef: (message) => confirm(message),
                unsplashAccessKey,
                setUnsplashAccessKey,
                reprocessUnsplashPlaceholders,
            },
        );

    } catch (error) {
        console.error('胡萝卜插件：加载设置模块失败', error);
    }

    // --- 4. 核心逻辑与事件监听 ---
    let currentTab = 'text',
        currentTextSubType = 'plain',
        stickerData = {},
        stickerLookup = new Map(),
        currentStickerCategory = '',
        selectedSticker = null;
    const formatTemplates = {
        text: {
            plain: '“{content}”',
            image: '“[{content}.jpg]”',
            video: '“[{content}.mp4]”',
            music: '“[{content}.mp3]”',
            post: '"[{content}.link]”',
            bunny: "+{content}+",
        },
        voice: '={duration}|{message}=',
        wallet: '[{platform}|{amount}|{message}]',
        stickers: '"[{desc}]"',
        recall: '--',
    };

    const textPlaceholderMap = {
        plain: '在此输入文字...',
        image: '在此输入文字...',
        video: '在此输入文字...',
        music: '在此输入文字...',
        post: '在此输入文字...',
        bunny: '在这里鞭策BUNNY吧...',
    };

    function updateFormatDisplay() {
        const e = get('cip-input-panel').querySelector(
            `.cip-sticker-category-btn[data-category="${currentStickerCategory}"]`,
        );
        queryAll('.cip-category-action-icon').forEach((e) => e.remove());
        switch (currentTab) {
            case 'text':
                formatDisplay.textContent = `格式: ${formatTemplates.text[currentTextSubType].replace('{content}', '内容')}`;
                break;
            case 'voice':
                formatDisplay.textContent = '格式: =数字|内容=';
                break;
            case 'wallet':
                formatDisplay.textContent =
                    '格式: [平台名称-金额/车牌号-留言/物品名称]';
                break;
            case 'stickers':
                formatDisplay.textContent = '格式: "描述"';
                if (e) {
                    const t = document.createElement('i');
                    t.className =
                        'cip-category-action-icon fa-solid fa-plus';
                    t.title = '向此分类添加表情包';
                    t.onclick = (t) => {
                        t.stopPropagation();
                        openAddStickersModal(currentStickerCategory);
                    };
                    e.appendChild(t);
                    const o = document.createElement('i');
                    o.className =
                        'cip-category-action-icon cip-delete-category-btn fa-solid fa-trash-can';
                    o.title = '删除此分类';
                    o.onclick = (t) => {
                        t.stopPropagation();
                        confirm(`确定删除「${currentStickerCategory}」分类?`) &&
                            (delete stickerData[currentStickerCategory],
                            saveStickerData(),
                            renderCategories(),
                            switchStickerCategory(
                                Object.keys(stickerData)[0] || '',
                            ));
                    };
                    e.appendChild(o);
                }
        }
    }
    function switchTab(t) {
        ((currentTab = t),
            queryAll('.cip-tab-button').forEach((e) =>
                e.classList.toggle('active', e.dataset.tab === t),
            ),
            queryAll('.cip-content-section').forEach((e) =>
                e.classList.toggle('active', e.id === `cip-${t}-content`),
            ));
        const o = Object.keys(stickerData)[0];
        ('stickers' === t &&
            (!currentStickerCategory && o
                ? switchStickerCategory(o)
                : switchStickerCategory(currentStickerCategory)),
            updateFormatDisplay());
    }
    function switchTextSubType(t) {
        ((currentTextSubType = t),
            queryAll('#cip-text-content .cip-sub-option-btn').forEach((e) =>
                e.classList.toggle('active', e.dataset.type === t),
            ),
            (mainInput.placeholder =
                textPlaceholderMap[t] || '在此输入文字...'),
            updateFormatDisplay());
    }
    function switchStickerCategory(t) {
        ((currentStickerCategory = t),
            queryAll('.cip-sticker-category-btn').forEach((e) =>
                e.classList.toggle('active', e.dataset.category === t),
            ),
            renderStickers(t),
            (selectedSticker = null),
            updateFormatDisplay());
    }
    function renderStickers(t) {
        if (((stickerGrid.innerHTML = ''), !t || !stickerData[t]))
            return void (stickerGrid.innerHTML =
                '<div class="cip-sticker-placeholder">请先选择或添加一个分类...</div>');
        const o = stickerData[t];
        if (0 === o.length)
            return void (stickerGrid.innerHTML =
                '<div class="cip-sticker-placeholder">这个分类还没有表情包...</div>');
        o.forEach((t, o) => {
            const e = document.createElement('div');
            e.className = 'cip-sticker-wrapper';
            const i = document.createElement('img');
            ((i.src = t.url),
                (i.title = t.desc),
                (i.className = 'cip-sticker-item'),
                (i.onclick = () => {
                    (queryAll('.cip-sticker-item.selected').forEach((e) =>
                        e.classList.remove('selected'),
                    ),
                        i.classList.add('selected'),
                        (selectedSticker = t));
                }));
            const n = document.createElement('button');
            ((n.innerHTML = '<i class="fa-solid fa-trash-can"></i>'),
                (n.className = 'cip-delete-sticker-btn'),
                (n.title = '删除这个表情包'),
                (n.onclick = (e) => {
                    (e.stopPropagation(),
                        confirm(`确定删除表情「${t.desc}」?`) &&
                            (stickerData[currentStickerCategory].splice(o, 1),
                            saveStickerData(),
                            renderStickers(currentStickerCategory)));
                }),
                e.appendChild(i),
                e.appendChild(n),
                stickerGrid.appendChild(e));
        });
    }
    function renderCategories() {
        (queryAll('.cip-sticker-category-btn').forEach((e) => e.remove()),
            Object.keys(stickerData).forEach((t) => {
                const o = document.createElement('button'),
                    e = document.createElement('span');
                ((e.textContent = t),
                    o.appendChild(e),
                    (o.className =
                        'cip-sub-option-btn cip-sticker-category-btn'),
                    (o.dataset.category = t),
                    (o.onclick = () => switchStickerCategory(t)),
                    stickerCategoriesContainer.appendChild(o));
            }));
    }
    function insertIntoSillyTavern(t) {
        const o = document.querySelector('#send_textarea');
        o
            ? ((o.value += (o.value.trim() ? '\n' : '') + t),
              o.dispatchEvent(new Event('input', { bubbles: !0 })),
              o.focus())
            : alert('未能找到SillyTavern的输入框！');
    }

    function replacePlaceholderWithNode(container, placeholder, node) {
        const walker = document.createTreeWalker(
            container,
            NodeFilter.SHOW_TEXT,
        );
        while (walker.nextNode()) {
            const current = walker.currentNode;
            const index = current.nodeValue.indexOf(placeholder);
            if (index === -1) continue;
            const range = document.createRange();
            range.setStart(current, index);
            range.setEnd(current, index + placeholder.length);
            range.deleteContents();
            range.insertNode(node);
            return true;
        }
        return false;
    }

    function reprocessRegexPlaceholders() {
        if (!regexModuleReady) return;
        const chatContainer = document.getElementById('chat');
        if (!chatContainer) return;
        chatContainer.querySelectorAll('.mes_text').forEach((element) => {
            clearRegexState(element);
            applyRegexReplacements(element, {
                enabled: regexEnabled,
                replacePlaceholderWithNode,
                documentRef: document,
            });
            replaceStickerPlaceholders(element);
        });
    }

    function rebuildStickerLookup() {
        stickerLookup = buildStickerLookup(stickerData);
    }
    function replaceStickerPlaceholders(element) {
        return replaceStickerPlaceholdersCore({
            element,
            stickerLookup,
            stickerPlaceholderRegex,
            replacePlaceholderWithNode,
            documentRef: document,
        });
    }
    function reprocessStickerPlaceholders() {
        reprocessStickerPlaceholdersCore({
            stickerLookup,
            stickerPlaceholderRegex,
            replacePlaceholderWithNode,
            documentRef: document,
        });
    }
    function saveStickerData() {
        getSettings().stickerData = stickerData;
        saveSettings();
        rebuildStickerLookup();
        reprocessStickerPlaceholders();
    }
    function loadStickerData() {
        stickerData = getSettings().stickerData || {};
        rebuildStickerLookup();
    }
    function toggleModal(t, o) {
        get(t).classList.toggle('hidden', !o);
    }
    function openAddStickersModal(t) {
        ((addStickerTitle.textContent = `为「${t}」分类添加表情包`),
            (newStickersInput.value = ''),
            (addStickersModal.dataset.currentCategory = t),
            toggleModal('cip-add-stickers-modal', !0),
            newStickersInput.focus());
    }

    // --- 事件监听 (主区域) ---

    emojiPicker.addEventListener('emoji-click', (event) => {
        const emoji = event.detail.unicode;
        let target;
        if (get('cip-input-panel').contains(document.activeElement)) {
            target = document.activeElement;
        } else {
            target = mainInput;
        }

        if (target && typeof target.value !== 'undefined') {
            const { selectionStart, selectionEnd, value } = target;
            target.value =
                value.substring(0, selectionStart) +
                emoji +
                value.substring(selectionEnd);
            target.focus();
            target.selectionEnd = selectionStart + emoji.length;
        }
        emojiPicker.style.display = 'none';
    });

    emojiPickerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = emojiPicker.style.display === 'block';
        if (isVisible) {
            emojiPicker.style.display = 'none';
        } else {
            const btnRect = emojiPickerBtn.getBoundingClientRect();
            const panelRect = inputPanel.getBoundingClientRect();
            const isMobile = window.innerWidth <= 768;

            if (isMobile) {
                const pickerWidth = 300;
                const pickerHeight = 350;
                const left = Math.max(10, (window.innerWidth - pickerWidth) / 2);
                const top = Math.max(10, (window.innerHeight - pickerHeight) / 2);
                emojiPicker.style.top = `${top}px`;
                emojiPicker.style.left = `${left}px`;
            } else {
                let top = panelRect.top;
                let left = panelRect.right + 10;
                if (left + 350 > window.innerWidth) {
                    left = panelRect.left - 350 - 10;
                }
                emojiPicker.style.top = `${top}px`;
                emojiPicker.style.left = `${Math.max(10, left)}px`;
            }
            emojiPicker.style.display = 'block';
        }
    });

    queryAll('.cip-tab-button').forEach((button) =>
        button.addEventListener('click', (e) =>
            switchTab(e.currentTarget.dataset.tab),
        ),
    );
    queryAll('#cip-text-content .cip-sub-option-btn').forEach((button) =>
        button.addEventListener('click', (e) =>
            switchTextSubType(e.currentTarget.dataset.type),
        ),
    );
    recallButton.addEventListener('click', () =>
        insertIntoSillyTavern(formatTemplates.recall),
    );

    insertButton.addEventListener('click', () => {
        let formattedText = '';
        let inputToClear = null;

        switch (currentTab) {
            case 'text':
                if (mainInput.value.trim()) {
                    formattedText = formatTemplates.text[
                        currentTextSubType
                    ].replace('{content}', mainInput.value);
                    inputToClear = mainInput;
                }
                break;
            case 'voice':
                if (
                    voiceDurationInput.value.trim() &&
                    voiceMessageInput.value.trim()
                ) {
                    formattedText = formatTemplates.voice
                        .replace('{duration}', voiceDurationInput.value)
                        .replace('{message}', voiceMessageInput.value);
                    inputToClear = voiceMessageInput;
                    voiceDurationInput.value = '';
                }
                break;
            case 'wallet': {
                const platform = walletPlatformInput.value.trim();
                const amount = walletAmountInput.value.trim();
                const message = walletMessageInput.value.trim();
                if (platform && amount && message) {
                    formattedText = formatTemplates.wallet
                        .replace('{platform}', platform)
                        .replace('{amount}', amount)
                        .replace('{message}', message);
                    walletPlatformInput.value = '';
                    walletAmountInput.value = '';
                    walletMessageInput.value = '';
                }
                break;
            }
            case 'stickers':
                if (selectedSticker) {
                    formattedText = formatTemplates.stickers
                        .replace('{desc}', selectedSticker.desc)
                        .replace('{url}', selectedSticker.url);
                }
                break;
        }

        if (formattedText) {
            insertIntoSillyTavern(formattedText);
            if (inputToClear) {
                inputToClear.value = '';
            }
        }
    });

    addCategoryBtn.addEventListener('click', () => {
        newCategoryNameInput.value = '';
        toggleModal('cip-add-category-modal', true);
        newCategoryNameInput.focus();
    });
    cancelCategoryBtn.addEventListener('click', () =>
        toggleModal('cip-add-category-modal', false),
    );
    saveCategoryBtn.addEventListener('click', () => {
        const name = newCategoryNameInput.value.trim();
        if (name && !stickerData[name]) {
            stickerData[name] = [];
            saveStickerData();
            renderCategories();
            switchStickerCategory(name);
            toggleModal('cip-add-category-modal', false);
        } else if (stickerData[name]) alert('该分类已存在！');
        else alert('请输入有效的分类名称！');
    });
    cancelStickersBtn.addEventListener('click', () =>
        toggleModal('cip-add-stickers-modal', false),
    );
    saveStickersBtn.addEventListener('click', () => {
        const category = addStickersModal.dataset.currentCategory;
        const text = newStickersInput.value.trim();
        if (!category || !text) return;
        let addedCount = 0;
        text.split('\n').forEach((line) => {
            const parts = line.split(':');
            if (parts.length >= 2) {
                const desc = parts[0].trim();
                const url = parts.slice(1).join(':').trim();
                if (desc && url) {
                    stickerData[category].push({ desc, url });
                    addedCount++;
                }
            }
        });
        if (addedCount > 0) {
            saveStickerData();
            if (currentStickerCategory === category) renderStickers(category);
            toggleModal('cip-add-stickers-modal', false);
        } else alert('未能解析任何有效的表情包信息。');
    });

    // --- 设置面板事件监听 ---
    function activateSettingsTab(target) {
        if (!target) return;
        settingsTabs.forEach((tab) => {
            tab.classList.toggle('active', tab.dataset.target === target);
        });
        settingsSections.forEach((section) => {
            section.classList.toggle(
                'active',
                section.id === `cip-settings-${target}`,
            );
        });
    }

    settingsTabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            activateSettingsTab(tab.dataset.target);
        });
    });

    settingsButton?.addEventListener('click', () => {
        if (!settingsPanelEl) return;
        settingsPanelEl.classList.remove('hidden');
        const activeTab = settingsTabs.find((tab) =>
            tab.classList.contains('active'),
        );
        if (!activeTab && settingsTabs.length > 0) {
            activateSettingsTab(settingsTabs[0].dataset.target);
        }
    });

    closeSettingsPanelBtn?.addEventListener('click', () => {
        settingsPanelEl?.classList.add('hidden');
    });

    // --- 5. 交互处理逻辑 ---
    function showPanel() {
        const isMobile = window.innerWidth <= 768;

        if (inputPanel.classList.contains('active')) return;

        inputPanel.style.visibility = 'hidden';
        inputPanel.classList.add('active');

        const panelWidth = inputPanel.offsetWidth;
        const panelHeight = inputPanel.offsetHeight;

        const btnRect = carrotButton.getBoundingClientRect();

        if (isMobile) {
            const maxHeight = window.innerHeight - 40;
            const actualHeight = Math.min(panelHeight, maxHeight);

            const left = Math.max(10, (window.innerWidth - panelWidth) / 2);
            const top = Math.max(20, Math.min(
                (window.innerHeight - actualHeight) / 2,
                window.innerHeight - actualHeight - 20,
            ));

            inputPanel.style.top = `${top}px`;
            inputPanel.style.left = `${left}px`;
        } else {
            let top = btnRect.top - panelHeight - 10;
            if (top < 10) {
                top = btnRect.bottom + 10;
            }
            let left = btnRect.left + btnRect.width / 2 - panelWidth / 2;
            left = Math.max(
                10,
                Math.min(left, window.innerWidth - panelWidth - 10),
            );
            inputPanel.style.top = `${top}px`;
            inputPanel.style.left = `${left}px`;
        }

        inputPanel.style.visibility = 'visible';
    }
    function hidePanel() {
        inputPanel.classList.remove('active');
    }

    document.addEventListener('click', (e) => {
        if (
            inputPanel.classList.contains('active') &&
            !inputPanel.contains(e.target) &&
            !carrotButton.contains(e.target)
        )
            hidePanel();
        if (
            emojiPicker.style.display === 'block' &&
            !emojiPicker.contains(e.target) &&
            !emojiPickerBtn.contains(e.target)
        ) {
            emojiPicker.style.display = 'none';
        }
    });

    function dragHandler(e) {
        let isClick = true;
        if (e.type === 'touchstart') e.preventDefault();
        const rect = carrotButton.getBoundingClientRect();
        const startClientX = e.type.includes('mouse')
            ? e.clientX
            : e.touches[0].clientX;
        const startClientY = e.type.includes('mouse')
            ? e.clientY
            : e.touches[0].clientY;
        const offsetX = startClientX - rect.left;
        const offsetY = startClientY - rect.top;
        const dragThreshold = 6;
        const move = (e) => {
            const currentClientX = e.type.includes('mouse')
                ? e.clientX
                : e.touches[0].clientX;
            const currentClientY = e.type.includes('mouse')
                ? e.clientY
                : e.touches[0].clientY;
            const distanceX = currentClientX - startClientX;
            const distanceY = currentClientY - startClientY;
            if (Math.hypot(distanceX, distanceY) < dragThreshold) {
                return;
            }
            isClick = false;
            carrotButton.classList.add('is-dragging');
            let newLeft = currentClientX - offsetX;
            let newTop = currentClientY - offsetY;
            newLeft = Math.max(
                0,
                Math.min(newLeft, window.innerWidth - carrotButton.offsetWidth),
            );
            newTop = Math.max(
                0,
                Math.min(
                    newTop,
                    window.innerHeight - carrotButton.offsetHeight,
                ),
            );
            carrotButton.style.position = 'fixed';
            carrotButton.style.left = `${newLeft}px`;
            carrotButton.style.top = `${newTop}px`;
        };
        const end = () => {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', end);
            document.removeEventListener('touchmove', move);
            document.removeEventListener('touchend', end);
            carrotButton.classList.remove('is-dragging');
            if (isClick) {
                inputPanel.classList.contains('active')
                    ? hidePanel()
                    : showPanel();
            } else {
                localStorage.setItem(
                    'cip_button_position_v4',
                    JSON.stringify({
                        top: carrotButton.style.top,
                        left: carrotButton.style.left,
                    }),
                );
            }
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', end);
        document.addEventListener('touchmove', move, { passive: false });
        document.addEventListener('touchend', end);
    }

    carrotButton.addEventListener('mousedown', dragHandler);
    carrotButton.addEventListener('touchstart', dragHandler, {
        passive: false,
    });

    function loadButtonPosition() {
        const savedPos = JSON.parse(
            localStorage.getItem('cip_button_position_v4'),
        );
        if (savedPos?.top && savedPos?.left) {
            carrotButton.style.position = 'fixed';
            carrotButton.style.top = savedPos.top;
            carrotButton.style.left = savedPos.left;
        }
    }

    $(() => {
        $(window).on('resize orientationchange', function () {
            if (inputPanel.classList.contains('active')) {
                const btnRect = carrotButton.getBoundingClientRect();
                const isMobile = window.innerWidth <= 768;
                const panelWidth = inputPanel.offsetWidth;
                const panelHeight = inputPanel.offsetHeight;

                if (isMobile) {
                    const maxHeight = window.innerHeight - 40;
                    const actualHeight = Math.min(panelHeight, maxHeight);
                    const left = Math.max(10, (window.innerWidth - panelWidth) / 2);
                    const top = Math.max(20, Math.min(
                        (window.innerHeight - actualHeight) / 2,
                        window.innerHeight - actualHeight - 20
                    ));
                    inputPanel.style.top = `${top}px`;
                    inputPanel.style.left = `${left}px`;
                } else {
                    let top = btnRect.top - panelHeight - 10;
                    if (top < 10) {
                        top = btnRect.bottom + 10;
                    }
                    let left = btnRect.left + btnRect.width / 2 - panelWidth / 2;
                    left = Math.max(10, Math.min(left, window.innerWidth - panelWidth - 10));
                    inputPanel.style.top = `${top}px`;
                    inputPanel.style.left = `${left}px`;
                }
            }

            if (emojiPicker.style.display === 'block') {
                setTimeout(() => {
                    emojiPicker.style.display = 'none';
                }, 100);
            }
        });
    });
    function init() {
        loadStickerData();
        unsplashProcessor = createUnsplashProcessor({
            applyRegexReplacements,
            getRegexEnabled: () => regexEnabled,
            replaceStickerPlaceholders,
            replacePlaceholderWithNode,
            getUnsplashAccessKey: () => unsplashAccessKey,
            clearRegexState,
            documentRef: document,
        });
        unsplashProcessor.init();
        renderCategories();
        loadButtonPosition();
        applyFloatIcon(carrotButton);
        applyFloatVisibility(carrotButton);
        injectExtensionDrawer({
            carrotButton,
            floatVisible,
            floatIconUrl,
            floatSize,
            floatOpacity,
            regexEnabled,
            regexModuleReady,
            setFloatVisible: (value) => {
                floatVisible = value;
            },
            setFloatIconUrl: (value) => {
                floatIconUrl = value;
            },
            setFloatSize: (value) => {
                floatSize = value;
            },
            setFloatOpacity: (value) => {
                floatOpacity = value;
            },
            setRegexEnabled: (value) => {
                regexEnabled = value;
                setRegexEnabled(value);
            },
            applyFloatIcon,
            applyFloatVisibility,
            reprocessRegexPlaceholders,
        });
        switchStickerCategory(Object.keys(stickerData)[0] || '');
        switchTab('text');
    }
    init();
})();
