// script.js (v7.1 - extension_settings 迁移)
(async function () {
    if (document.getElementById('cip-carrot-button')) return;

    // v8.0: 给所有动态 import 加版本号，每次发版改一下，强制浏览器更新
    const V = 'v=8.0.9';
    const {
        createSettingsStorage,
        DEFAULT_FLOAT_ICON_URL,
        getSettings,
        migrateFromLocalStorage,
        saveSettings,
    } = await import(`./config.js?${V}`);
    const { createUI } = await import(`./ui.js?${V}`);
    const { injectExtensionDrawer } = await import(`./drawer.js?${V}`);
    const {
        buildStickerLookup,
        replaceStickerPlaceholders: replaceStickerPlaceholdersCore,
        reprocessStickerPlaceholders: reprocessStickerPlaceholdersCore,
    } = await import(`./stickers.js?${V}`);
    const { createUnsplashProcessor } = await import(`./unsplash.js?${V}`);
    const { initFormatRenderer } = await import(`./format-renderer.js?${V}`);
    const { initBackend } = await import(`./backend.js?${V}`);
    const { initSendHook } = await import(`./send-hook.js?${V}`);
    const { initVoiceInput } = await import(`./voice-input.js?${V}`);
    const { initLinkVision } = await import(`./link-vision.js?${V}`);

    // --- extension_settings 初始化 ---
    const settingsStorage = createSettingsStorage({
        runtimeLocalStorage: localStorage,
    });

    // 首次运行时从 localStorage 迁移数据
    migrateFromLocalStorage(localStorage);

    let renderEnabled = getSettings().regexEnabled !== false;

    const stickerPlaceholderRegex = /\[([^\[\]]+?)\]/g;

    let unsplashAccessKey = getSettings().unsplashAccessKey || '';
    let unsplashProcessor = null;
    let formatRenderer = null;
    await initLinkVision();

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
        expressionPopover,
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
        document.body.appendChild(expressionPopover);
        expressionPopover.insertBefore(
            emojiPicker,
            document.getElementById('cip-sticker-grid'),
        );
        document.body.appendChild(addCategoryModal);
        document.body.appendChild(addStickersModal);
        document.body.appendChild(settingsPanel);

        // v8.0: 启动后探测 backend plugin，不通时弹引导
        initBackend().catch((e) => console.warn('[carrot] backend init failed', e));
        // v8.0: 安装 send hook，拦截发送时解析链接
        initSendHook();
        // v8.1: 安装语音输入按钮逻辑
        initVoiceInput();
    } else {
        console.error(
            '胡萝卜输入面板：未能找到SillyTavern的UI挂载点，插件无法加载。',
        );
        return;
    }

    // --- 3. 获取所有元素的引用 ---
    const get = (id) => document.getElementById(id);
    const queryAll = (sel) => document.querySelectorAll(sel);
    const insertButton = get('cip-insert-button'),
        recallButton = get('cip-recall-button');
    const mainInput = get('cip-main-input');
    const walletContent = get('cip-wallet-content');
    const walletPlatformInput = get('cip-wallet-platform');
    const walletAmountInput = get('cip-wallet-amount');
    const walletMessageInput = get('cip-wallet-message');
    const stickerCategoriesContainer = get('cip-sticker-categories'),
        addCategoryBtn = get('cip-add-category-btn'),
        stickerGrid = get('cip-sticker-grid');
    const emojiPickerBtn = get('cip-emoji-picker-btn');
    const expressionEmojiTab = get('cip-expression-emoji-tab');
    const bunnyButton = get('cip-bunny-button');
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
    const saveThemeBtn = get('cip-save-theme-btn');
    const renameThemeBtn = get('cip-rename-theme-btn');
    const newThemeBtn = get('cip-new-theme-btn');

    const avatarSubtabs = document.querySelectorAll('.cip-avatar-subtab');
    const avatarPanes = document.querySelectorAll('.cip-avatar-pane');
    const charAvatarUrlInput = get('cip-char-avatar-url');
    const userAvatarUrlInput = get('cip-user-avatar-url');
    const charAvatarFrameUrlInput = get('cip-char-frame-url');
    const userAvatarFrameUrlInput = get('cip-user-frame-url');
    const unsplashAccessKeyInput = get('cip-unsplash-access-key');
    const avatarProfileSelect = get('cip-avatar-profile-select');
    const saveAvatarBtn = get('cip-save-avatar-btn');
    const renameAvatarBtn = get('cip-rename-avatar-btn');
    const newAvatarBtn = get('cip-new-avatar-btn');

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
    const saveFrameBtn = get('cip-save-frame-btn');
    const renameFrameBtn = get('cip-rename-frame-btn');
    const newFrameBtn = get('cip-new-frame-btn');

    const bubbleProfileSelect = get('cip-bubble-profile-select');
    const bubbleSaveBtn = get('cip-bubble-save-btn');
    const bubbleRenameBtn = get('cip-bubble-rename-btn');
    const bubbleNewBtn = get('cip-bubble-new-btn');
    const bubbleInputs = {
        text: {
            user: get('cip-bubble-text-user'),
            char: get('cip-bubble-text-char'),
        },
        voice: {
            user: get('cip-bubble-voice-user'),
            char: get('cip-bubble-voice-char'),
        },
        dimension: {
            user: get('cip-bubble-dimension-user'),
            char: get('cip-bubble-dimension-char'),
        },
    };
    const bubbleStatus = get('cip-bubble-status');

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
                saveThemeBtn,
                renameThemeBtn,
                newThemeBtn,
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
                saveAvatarBtn,
                renameAvatarBtn,
                newAvatarBtn,
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
                saveFrameBtn,
                renameFrameBtn,
                newFrameBtn,
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

    // --- 气泡设置面板 ---
    {
        const s = getSettings();
        if (!s.bubblePresets) s.bubblePresets = {};

        const BUILTIN = {
            ios: { name: 'iOS', text: '', voice: '', dimension: '' },
            avatarTransparent: { name: '带头像透明', text: '', voice: '', dimension: '' },
            clean: { name: '简洁', text: '', voice: '', dimension: '' },
        };
        const allPresets = () => ({ ...BUILTIN, ...(getSettings().bubblePresets || {}) });
        const currentKey = () => bubbleProfileSelect?.value || s.bubblePreset || 'ios';
        const normalizeBubblePair = (value) => {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                return {
                    user: String(value.user || ''),
                    char: String(value.char || ''),
                };
            }
            const text = typeof value === 'string' ? value : '';
            return { user: text, char: text };
        };
        const readBubbleFields = () => ({
            text: {
                user: bubbleInputs.text.user?.value || '',
                char: bubbleInputs.text.char?.value || '',
            },
            voice: {
                user: bubbleInputs.voice.user?.value || '',
                char: bubbleInputs.voice.char?.value || '',
            },
            dimension: {
                user: bubbleInputs.dimension.user?.value || '',
                char: bubbleInputs.dimension.char?.value || '',
            },
        });

        function refreshBubbleSelect() {
            if (!bubbleProfileSelect) return;
            const presets = allPresets();
            const cur = s.bubblePreset || 'ios';
            bubbleProfileSelect.innerHTML = '';
            for (const [key, preset] of Object.entries(presets)) {
                const opt = document.createElement('option');
                opt.value = key;
                opt.textContent = preset.name || key;
                if (key === cur) opt.selected = true;
                bubbleProfileSelect.appendChild(opt);
            }
        }

        function loadBubblePreset() {
            const key = currentKey();
            s.bubblePreset = key;
            saveSettings();
            const preset = allPresets()[key] || BUILTIN.ios;
            const text = normalizeBubblePair(preset.text);
            const voice = normalizeBubblePair(preset.voice);
            const dimension = normalizeBubblePair(preset.dimension);
            if (bubbleInputs.text.user) bubbleInputs.text.user.value = text.user;
            if (bubbleInputs.text.char) bubbleInputs.text.char.value = text.char;
            if (bubbleInputs.voice.user) bubbleInputs.voice.user.value = voice.user;
            if (bubbleInputs.voice.char) bubbleInputs.voice.char.value = voice.char;
            if (bubbleInputs.dimension.user) bubbleInputs.dimension.user.value = dimension.user;
            if (bubbleInputs.dimension.char) bubbleInputs.dimension.char.value = dimension.char;
        }

        function showBubbleStatus(msg) {
            if (!bubbleStatus) return;
            bubbleStatus.textContent = msg;
            setTimeout(() => { bubbleStatus.textContent = ''; }, 2000);
        }

        refreshBubbleSelect();
        loadBubblePreset();

        bubbleProfileSelect?.addEventListener('change', () => {
            loadBubblePreset();
            formatRenderer?.reprocess?.();
        });

        bubbleSaveBtn?.addEventListener('click', () => {
            const key = currentKey();
            if (!s.bubblePresets) s.bubblePresets = {};
            const existing = allPresets()[key] || {};
            const fields = readBubbleFields();
            s.bubblePresets[key] = {
                name: existing.name || key,
                ...fields,
            };
            s.bubblePreset = key;
            saveSettings();
            showBubbleStatus('已保存当前气泡配置');
            formatRenderer?.reprocess?.();
        });

        bubbleRenameBtn?.addEventListener('click', () => {
            const key = currentKey();
            const oldName = allPresets()[key]?.name || key;
            const newName = prompt('编辑配置名', oldName);
            if (!newName || newName === oldName) return;
            if (!s.bubblePresets) s.bubblePresets = {};
            const fields = readBubbleFields();
            s.bubblePresets[key] = {
                ...(allPresets()[key] || {}),
                name: newName,
                ...fields,
            };
            saveSettings();
            refreshBubbleSelect();
            showBubbleStatus('已重命名');
            formatRenderer?.reprocess?.();
        });

        bubbleNewBtn?.addEventListener('click', () => {
            const name = prompt('新建配置名', '新气泡配置');
            if (!name) return;
            const key = `custom_${Date.now()}`;
            if (!s.bubblePresets) s.bubblePresets = {};
            s.bubblePresets[key] = {
                name,
                text: { user: '', char: '' },
                voice: { user: '', char: '' },
                dimension: { user: '', char: '' },
            };
            s.bubblePreset = key;
            saveSettings();
            refreshBubbleSelect();
            loadBubblePreset();
            showBubbleStatus('已新建气泡配置');
            formatRenderer?.reprocess?.();
        });
    }

    // --- 4. 核心逻辑与事件监听 ---
    let currentTextSubType = 'plain',
        stickerData = {},
        stickerLookup = new Map(),
        currentStickerCategory = '',
        expressionMode = 'emoji';
    const formatTemplates = {
        text: {
            plain: '“{content}”',
            image: '“[{content}.jpg]”',
            video: '“[{content}.mp4]”',
            music: '“[{content}.mp3]”',
        },
        wallet: '[{platform}|{amount}|{message}]',
        stickers: '“[{desc}]”',
        recall: '--',
        // v8.0: BUNNY 格式（原 sub-type，现作为 footer 按钮触发）
        bunny: '+{content}+',
    };

    const textPlaceholderMap = {
        plain: '在此输入文字...',
        image: '在此输入文字...',
        video: '在此输入文字...',
        music: '在此输入文字...',
        wallet: '填写钱包信息...',
    };

    function updateFormatDisplay() {
        const e = expressionPopover.querySelector(
            `.cip-sticker-category-btn[data-category="${currentStickerCategory}"]`,
        );
        queryAll('.cip-category-action-icon').forEach((e) => e.remove());
        if (e) {
            const t = document.createElement('i');
            t.className = 'cip-category-action-icon fa-solid fa-plus';
            t.title = '向此合集添加表情包';
            t.onclick = (event) => {
                event.stopPropagation();
                openAddStickersModal(currentStickerCategory);
            };
            e.appendChild(t);
            const o = document.createElement('i');
            o.className = 'cip-category-action-icon cip-delete-category-btn fa-solid fa-trash-can';
            o.title = '删除此合集';
            o.onclick = (event) => {
                event.stopPropagation();
                confirm(`确定删除「${currentStickerCategory}」合集?`) &&
                    (delete stickerData[currentStickerCategory],
                    saveStickerData(),
                    renderCategories(),
                    switchStickerCategory(Object.keys(stickerData)[0] || ''));
            };
            e.appendChild(o);
        }
    }
    function switchTextSubType(t) {
        ((currentTextSubType = t),
            queryAll('#cip-text-content .cip-sub-option-btn').forEach((e) =>
                e.classList.toggle('active', e.dataset.type === t),
            ),
            mainInput.parentElement.classList.toggle('hidden', t === 'wallet'),
            walletContent?.classList.toggle('hidden', t !== 'wallet'),
            (mainInput.placeholder =
                textPlaceholderMap[t] || '在此输入文字...'),
            updateFormatDisplay());
    }
    function setExpressionMode(mode) {
        expressionMode = mode;
        expressionEmojiTab?.classList.toggle('active', mode === 'emoji');
        queryAll('.cip-sticker-category-btn').forEach((e) =>
            e.classList.toggle('active', mode === 'sticker' && e.dataset.category === currentStickerCategory),
        );
        emojiPicker.classList.toggle('hidden', mode !== 'emoji');
        emojiPicker.style.display = mode === 'emoji' ? 'block' : 'none';
        stickerGrid.classList.toggle('hidden', mode !== 'sticker');
    }
    function switchStickerCategory(t) {
        ((currentStickerCategory = t),
            (expressionMode = 'sticker'),
            queryAll('.cip-sticker-category-btn').forEach((e) =>
                e.classList.toggle('active', e.dataset.category === t),
            ),
            renderStickers(t),
            setExpressionMode('sticker'),
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
                    insertIntoSillyTavern(formatTemplates.stickers.replace('{desc}', t.desc));
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
    function positionExpressionPopover() {
        const btnRect = emojiPickerBtn.getBoundingClientRect();
        const panelRect = inputPanel.getBoundingClientRect();
        const isMobile = window.innerWidth <= 768;
        const width = isMobile ? Math.min(window.innerWidth - 40, 340) : 360;
        expressionPopover.style.width = `${width}px`;
        const left = isMobile
            ? Math.max(10, (window.innerWidth - width) / 2)
            : Math.max(10, Math.min(panelRect.left, window.innerWidth - width - 10));
        const top = Math.max(10, Math.min(btnRect.top - 370, window.innerHeight - 390));
        expressionPopover.style.left = `${left}px`;
        expressionPopover.style.top = `${top}px`;
        emojiPicker.style.position = 'static';
        emojiPicker.style.width = '100%';
        emojiPicker.style.maxHeight = '330px';
    }
    function hideExpressionPopover() {
        expressionPopover.classList.add('hidden');
        emojiPicker.style.display = 'none';
    }
    function showExpressionPopover(mode = 'emoji') {
        positionExpressionPopover();
        expressionPopover.classList.remove('hidden');
        setExpressionMode(mode);
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
        const chatContainer = document.getElementById('chat');
        if (!chatContainer) return;
        chatContainer.querySelectorAll('.mes_text').forEach((element) => {
            replaceStickerPlaceholders(element);
        });
    }

    function runPostRenderProcessors(element) {
        if (!element) return;
        replaceStickerPlaceholders(element);
        unsplashProcessor?.processMessageElement?.(element);
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
        const isVisible = !expressionPopover.classList.contains('hidden');
        if (isVisible) {
            hideExpressionPopover();
        } else {
            showExpressionPopover('emoji');
        }
    });
    expressionEmojiTab?.addEventListener('click', () => setExpressionMode('emoji'));

    queryAll('#cip-text-content .cip-sub-option-btn').forEach((button) =>
        button.addEventListener('click', (e) =>
            switchTextSubType(e.currentTarget.dataset.type),
        ),
    );
    recallButton.addEventListener('click', () =>
        insertIntoSillyTavern(formatTemplates.recall),
    );

    // v8.0: BUNNY 按钮（原 bunny 子按钮的功能搬到 footer）
    if (bunnyButton) {
        bunnyButton.addEventListener('click', () => {
            const content = mainInput.value.trim();
            if (!content) {
                if (typeof toastr !== 'undefined') {
                    toastr.info('请先在 carrot 主输入框打字', 'BUNNY');
                } else {
                    alert('请先在 carrot 主输入框打字');
                }
                return;
            }
            insertIntoSillyTavern(
                formatTemplates.bunny.replace('{content}', content),
            );
            mainInput.value = '';
        });
    }

    insertButton.addEventListener('click', () => {
        let formattedText = '';
        let inputToClear = null;

        switch (currentTextSubType) {
            case 'plain':
            case 'image':
            case 'video':
            case 'music':
                if (mainInput.value.trim()) {
                    formattedText = formatTemplates.text[
                        currentTextSubType
                    ].replace('{content}', mainInput.value);
                    inputToClear = mainInput;
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
        hideExpressionPopover();
    }

    document.addEventListener('click', (e) => {
        if (
            inputPanel.classList.contains('active') &&
            !inputPanel.contains(e.target) &&
            !carrotButton.contains(e.target)
        )
            hidePanel();
        if (!expressionPopover.classList.contains('hidden')
            && !expressionPopover.contains(e.target)
            && !emojiPickerBtn.contains(e.target)) {
            hideExpressionPopover();
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

            if (!expressionPopover.classList.contains('hidden')) {
                setTimeout(() => {
                    hideExpressionPopover();
                }, 100);
            }
        });
    });
    function init() {
        loadStickerData();
        unsplashProcessor = createUnsplashProcessor({
            replacePlaceholderWithNode,
            getUnsplashAccessKey: () => unsplashAccessKey,
            documentRef: document,
        });
        formatRenderer = initFormatRenderer({
            documentRef: document,
            getEnabled: () => renderEnabled,
            getPreset: () => getSettings().bubblePreset || 'ios',
            afterProcess: runPostRenderProcessors,
        });
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
            renderEnabled,
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
            setRenderEnabled: (value) => {
                renderEnabled = value;
                getSettings().regexEnabled = value ? true : false;
                saveSettings();
            },
            applyFloatIcon,
            applyFloatVisibility,
            reprocessRegexPlaceholders: () => {
                formatRenderer?.reprocess?.();
                reprocessRegexPlaceholders();
            },
        });
        switchStickerCategory(Object.keys(stickerData)[0] || '');
        switchTab('text');
    }
    init();
})();
