export function createUI() {
    const create = (tag, id, className, html) => {
        const el = document.createElement(tag);
        if (id) el.id = id;
        if (className) el.className = className;
        if (html) el.innerHTML = html;
        return el;
    };
    const carrotButton = create('div', 'cip-carrot-button', null, '');
    carrotButton.title = '胡萝卜快捷输入';

    const inputPanel = create(
        'div',
        'cip-input-panel',
        'cip-frosted-glass',
        `
        <nav id="cip-panel-tabs">
            <button class="cip-tab-button active" data-tab="text">文字信息</button>
            <button class="cip-tab-button" data-tab="voice">语音</button>
            <button class="cip-tab-button" data-tab="wallet">钱包</button>
            <button class="cip-tab-button" data-tab="stickers">表情包</button>
        </nav>
        <div id="cip-format-display"></div>
        <div id="cip-panel-content">
             <div id="cip-text-content" class="cip-content-section">
                <div class="cip-sub-options-container"><button class="cip-sub-option-btn active" data-type="plain">纯文本</button><button class="cip-sub-option-btn" data-type="image">图片</button><button class="cip-sub-option-btn" data-type="video">视频</button><button class="cip-sub-option-btn" data-type="music">音乐</button><button class="cip-sub-option-btn" data-type="post">帖子</button><button class="cip-sub-option-btn" data-type="bunny">BUNNY</button></div>
                <div class="cip-main-input-wrapper">
                    <textarea id="cip-main-input" placeholder="在此输入文字..."></textarea>
                </div>
            </div>
            <div id="cip-voice-content" class="cip-content-section"><input type="number" id="cip-voice-duration" placeholder="输入时长 (秒, 仅数字)"><textarea id="cip-voice-message" placeholder="输入语音识别出的内容..."></textarea></div>
            <div id="cip-wallet-content" class="cip-content-section"><div class="cip-wallet-row"><input type="text" id="cip-wallet-platform" placeholder="平台名称"><input type="text" id="cip-wallet-amount" placeholder="金额/车牌号"></div><div class="cip-wallet-row"><input type="text" id="cip-wallet-message" placeholder="留言/物品名称"></div></div>
            <div id="cip-stickers-content" class="cip-content-section"><div id="cip-sticker-categories" class="cip-sub-options-container"><button id="cip-add-category-btn" class="cip-sub-option-btn"><i class="fa-solid fa-plus"></i></button></div><div id="cip-sticker-grid"></div></div>
        </div>
        <div id="cip-panel-footer">
            <div id="cip-footer-controls">
                <button id="cip-settings-button" class="cip-footer-icon-button" type="button" title="功能设置">
                    <i class="fa-solid fa-gear"></i>
                </button>
                <button id="cip-emoji-picker-btn" class="cip-footer-icon-button" type="button" title="Emoji">
                    <i class="fa-solid fa-face-smile"></i>
                </button>
            </div>
            <div class="cip-footer-actions">
                <button id="cip-recall-button" title="撤回">撤回</button>
                <button id="cip-insert-button">插入</button>
            </div>
        </div>
    `,
    );

    const emojiPicker = create(
        'emoji-picker',
        'cip-emoji-picker',
        'cip-frosted-glass',
    );
    const addCategoryModal = create(
        'div',
        'cip-add-category-modal',
        'cip-modal-backdrop hidden',
        `<div class="cip-modal-content cip-frosted-glass"><h3>添加新分类</h3><input type="text" id="cip-new-category-name" placeholder="输入分类名称"><div class="cip-modal-actions"><button id="cip-cancel-category-btn">取消</button><button id="cip-save-category-btn">保存</button></div></div>`,
    );
    const addStickersModal = create(
        'div',
        'cip-add-stickers-modal',
        'cip-modal-backdrop hidden',
        `<div class="cip-modal-content cip-frosted-glass"><h3 id="cip-add-sticker-title"></h3><p>每行一个，格式为：<br><code>表情包描述:图片链接</code></p><textarea id="cip-new-stickers-input" placeholder="可爱猫猫:https://example.com/cat.png\n狗狗点头:https://example.com/dog.gif"></textarea><div class="cip-modal-actions"><button id="cip-cancel-stickers-btn">取消</button><button id="cip-save-stickers-btn">保存</button></div></div>`,
    );
    const settingsPanel = create(
        'div',
        'cip-settings-panel',
        'cip-frosted-glass hidden',
        `
        <div class="cip-settings-header">
            <nav id="cip-settings-tabs">
                <button class="cip-settings-tab active" data-target="theme">主题</button>
                <button class="cip-settings-tab" data-target="avatar">头像</button>
                <button class="cip-settings-tab" data-target="bubble">气泡</button>
            </nav>
        </div>
        <div id="cip-settings-sections">
            <section id="cip-settings-theme" class="cip-settings-section active">
                <div class="cip-preset-bar">
                    <select id="cip-theme-select"></select>
                    <button id="cip-save-theme-btn" class="cip-preset-icon-btn" title="保存到当前配置">
                        <i class="fa-solid fa-save"></i>
                    </button>
                    <button id="cip-rename-theme-btn" class="cip-preset-icon-btn" title="编辑配置名">
                        <i class="fa-solid fa-pencil"></i>
                    </button>
                    <button id="cip-new-theme-btn" class="cip-preset-icon-btn" title="新建配置">
                        <i class="fa-solid fa-file-circle-plus"></i>
                    </button>
                </div>
                <div class="cip-theme-options-grid">
                    <label for="cip-color-accent">高亮颜色:</label>
                    <div class="cip-color-input-wrapper">
                        <input type="text" id="cip-color-accent" data-var="--cip-accent-color">
                        <input type="color" class="cip-color-picker" data-target="cip-color-accent">
                    </div>

                    <label for="cip-color-panel-bg">面板背景:</label>
                    <div class="cip-color-input-wrapper">
                        <input type="text" id="cip-color-panel-bg" data-var="--cip-panel-bg-color">
                        <input type="color" class="cip-color-picker" data-target="cip-color-panel-bg">
                    </div>

                    <label for="cip-color-tabs-bg">功能栏背景:</label>
                    <div class="cip-color-input-wrapper">
                        <input type="text" id="cip-color-tabs-bg" data-var="--cip-tabs-bg-color">
                        <input type="color" class="cip-color-picker" data-target="cip-color-tabs-bg">
                    </div>

                    <label for="cip-color-text">字体颜色:</label>
                    <div class="cip-color-input-wrapper">
                        <input type="text" id="cip-color-text" data-var="--cip-text-color">
                        <input type="color" class="cip-color-picker" data-target="cip-color-text">
                    </div>
                </div>
            </section>
            <section id="cip-settings-avatar" class="cip-settings-section">
                <div class="cip-avatar-subtabs">
                    <button class="cip-avatar-subtab active" data-subtab="avatar">头像</button>
                    <span class="cip-avatar-divider">｜</span>
                    <button class="cip-avatar-subtab" data-subtab="frame">头像框</button>
                </div>

                <div id="cip-avatar-pane-avatar" class="cip-avatar-pane cip-avatar-section active">
                    <div class="cip-preset-bar">
                        <select id="cip-avatar-profile-select"></select>
                        <button id="cip-save-avatar-btn" class="cip-preset-icon-btn" title="保存到当前配置">
                            <i class="fa-solid fa-save"></i>
                        </button>
                        <button id="cip-rename-avatar-btn" class="cip-preset-icon-btn" title="编辑配置名">
                            <i class="fa-solid fa-pencil"></i>
                        </button>
                        <button id="cip-new-avatar-btn" class="cip-preset-icon-btn" title="新建配置">
                            <i class="fa-solid fa-file-circle-plus"></i>
                        </button>
                    </div>
                    <div class="cip-avatar-grid">
                        <label for="cip-char-avatar-url">角色 (Char):</label>
                        <input type="text" id="cip-char-avatar-url" placeholder="粘贴角色头像链接...">

                        <label for="cip-user-avatar-url">你 (User):</label>
                        <input type="text" id="cip-user-avatar-url" placeholder="粘贴你的头像链接...">

                        <label for="cip-unsplash-access-key">Unsplash Key:</label>
                        <input type="text" id="cip-unsplash-access-key" placeholder="输入 Unsplash Access Key...">
                    </div>
                </div>

                <div id="cip-avatar-pane-frame" class="cip-avatar-pane cip-frame-section">
                    <div class="cip-preset-bar">
                        <select id="cip-frame-profile-select"></select>
                        <button id="cip-save-frame-btn" class="cip-preset-icon-btn" title="保存到当前配置">
                            <i class="fa-solid fa-save"></i>
                        </button>
                        <button id="cip-rename-frame-btn" class="cip-preset-icon-btn" title="编辑配置名">
                            <i class="fa-solid fa-pencil"></i>
                        </button>
                        <button id="cip-new-frame-btn" class="cip-preset-icon-btn" title="新建配置">
                            <i class="fa-solid fa-file-circle-plus"></i>
                        </button>
                    </div>
                    <div class="cip-avatar-grid">
                        <label for="cip-char-frame-url">角色头像框:</label>
                        <div class="cip-frame-input-wrapper">
                            <input type="text" id="cip-char-frame-url" placeholder="粘贴角色头像框链接(透明PNG)...">
                            <button id="cip-adjust-char-frame-btn" class="cip-adjust-frame-btn" title="调整">
                                <i class="fa-solid fa-gear"></i>
                            </button>
                        </div>

                        <label for="cip-user-frame-url">你的头像框:</label>
                        <div class="cip-frame-input-wrapper">
                            <input type="text" id="cip-user-frame-url" placeholder="粘贴你的头像框链接(透明PNG)...">
                            <button id="cip-adjust-user-frame-btn" class="cip-adjust-frame-btn" title="调整">
                                <i class="fa-solid fa-gear"></i>
                            </button>
                        </div>
                    </div>

                    <div id="cip-frame-adjust-panel" class="cip-frame-adjust-panel hidden">
                        <h4 id="cip-frame-adjust-title">调整头像框</h4>
                        <div class="cip-adjust-control">
                            <label>尺寸: <span id="cip-frame-size-value">120</span>%</label>
                            <input type="range" id="cip-frame-size-slider" min="100" max="200" value="120" step="5">
                        </div>
                        <div class="cip-adjust-control">
                            <label>水平偏移: <span id="cip-frame-offset-x-value">0</span>%</label>
                            <input type="range" id="cip-frame-offset-x-slider" min="-20" max="20" value="0" step="1">
                        </div>
                        <div class="cip-adjust-control">
                            <label>垂直偏移: <span id="cip-frame-offset-y-value">0</span>%</label>
                            <input type="range" id="cip-frame-offset-y-slider" min="-20" max="20" value="0" step="1">
                        </div>
                        <div class="cip-adjust-actions">
                            <button id="cip-frame-reset-btn">重置</button>
                            <button id="cip-frame-close-btn">关闭</button>
                        </div>
                    </div>
                </div>
            </section>
            <section id="cip-settings-bubble" class="cip-settings-section">
                <div class="cip-bubble-manager">
                    <div class="cip-preset-bar">
                        <select id="cip-bubble-profile-select"></select>
                        <button id="cip-bubble-save-btn" class="cip-preset-icon-btn" title="保存到当前配置">
                            <i class="fa-solid fa-save"></i>
                        </button>
                        <button id="cip-bubble-rename-btn" class="cip-preset-icon-btn" title="编辑配置名">
                            <i class="fa-solid fa-pencil"></i>
                        </button>
                        <button id="cip-bubble-new-btn" class="cip-preset-icon-btn" title="新建配置">
                            <i class="fa-solid fa-file-circle-plus"></i>
                        </button>
                    </div>
                    <details class="cip-bubble-section" open>
                        <summary>文字</summary>
                        <label class="cip-bubble-code-row">
                            <span>user</span>
                            <input type="text" id="cip-bubble-text-user" placeholder="用户文字气泡美化代码">
                        </label>
                        <label class="cip-bubble-code-row">
                            <span>char</span>
                            <input type="text" id="cip-bubble-text-char" placeholder="角色文字气泡美化代码">
                        </label>
                    </details>
                    <details class="cip-bubble-section">
                        <summary>语音</summary>
                        <label class="cip-bubble-code-row">
                            <span>user</span>
                            <input type="text" id="cip-bubble-voice-user" placeholder="用户语音气泡美化代码">
                        </label>
                        <label class="cip-bubble-code-row">
                            <span>char</span>
                            <input type="text" id="cip-bubble-voice-char" placeholder="角色语音气泡美化代码">
                        </label>
                    </details>
                    <details class="cip-bubble-section">
                        <summary>超次元</summary>
                        <label class="cip-bubble-code-row">
                            <span>user</span>
                            <input type="text" id="cip-bubble-dimension-user" placeholder="用户超次元气泡美化代码">
                        </label>
                        <label class="cip-bubble-code-row">
                            <span>char</span>
                            <input type="text" id="cip-bubble-dimension-char" placeholder="角色超次元气泡美化代码">
                        </label>
                    </details>
                    <details class="cip-bubble-section">
                        <summary>自定义教程</summary>
                        <div class="cip-bubble-tutorial"></div>
                    </details>
                    <div id="cip-bubble-status" class="cip-settings-panel-note"></div>
                </div>
            </section>
        </div>
        <div class="cip-settings-footer">
            <button id="cip-close-settings-panel-btn">完成</button>
        </div>
        `,
    );

    return {
        carrotButton,
        inputPanel,
        emojiPicker,
        addCategoryModal,
        addStickersModal,
        settingsPanel,
    };
}
