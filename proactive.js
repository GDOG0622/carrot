// char 主动发消息（后端驱动）——前端设置面板
// 详见 ./todo.md「char 主动发消息（后端驱动）」

import { getSettings, saveSettings } from './config.js';
import { jsonRequestHeaders } from './request-headers.js';

const API = '/api/plugins/carrot/proactive';

async function getJson(url) {
    const res = await fetch(url, { headers: jsonRequestHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

async function postJson(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: jsonRequestHeaders(),
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

function uuid() {
    return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function makeScheme() {
    return {
        id: uuid(),
        enabled: true,
        charName: '',
        chatFile: null,
        intervalMinutes: 60,
        mode: 'probability',
        probability: 30,
    };
}

// 按钮容易在酒馆窄侧栏里被挤成逐字换行的破版效果，新按钮一律显式加 nowrap。
const NOWRAP = 'white-space:nowrap;flex-shrink:0;';

export function initProactive() {
    const container = document.getElementById('proactive-container');
    if (!container) return;

    const settings = getSettings();
    const p = settings.proactive;

    let users = [];
    let chars = [];
    let models = [];
    // scheme.id -> chat 文件列表缓存
    const chatsCache = new Map();
    let profiles = [];
    let syncTimer = null;
    // 正在编辑（未折叠）的方案 id；新建的方案默认进入编辑态
    const editingIds = new Set();

    function scheduleSync() {
        clearTimeout(syncTimer);
        syncTimer = setTimeout(() => {
            const url = p.enabled ? `${API}/start` : `${API}/stop`;
            postJson(url, p).catch((e) => console.warn('[carrot] 主动消息同步后端失败', e));
        }, 500);
    }

    function persist() {
        saveSettings();
        scheduleSync();
    }

    async function loadUsers() {
        try {
            const data = await getJson(`${API}/users`);
            users = data.users || [];
            if (!p.stUser || !users.includes(p.stUser)) {
                p.stUser = users[0] || '';
            }
        } catch (e) {
            console.warn('[carrot] 读取酒馆用户列表失败', e);
        }
    }

    async function loadChars() {
        if (!p.stUser) { chars = []; return; }
        try {
            const data = await getJson(`${API}/chars?user=${encodeURIComponent(p.stUser)}`);
            chars = data.chars || [];
        } catch (e) {
            console.warn('[carrot] 读取角色列表失败', e);
            chars = [];
        }
    }

    async function loadProfiles() {
        if (!p.stUser) { profiles = []; return; }
        try {
            const data = await getJson(`${API}/profiles?user=${encodeURIComponent(p.stUser)}`);
            profiles = data.profiles || [];
        } catch (e) {
            console.warn('[carrot] 读取 API 方案列表失败', e);
            profiles = [];
        }
    }

    async function loadModels(statusEl) {
        if (!p.stUser || !p.apiProfileId) { models = []; return; }
        try {
            if (statusEl) statusEl.textContent = '拉取模型列表中…';
            const data = await getJson(`${API}/models?user=${encodeURIComponent(p.stUser)}&profileId=${encodeURIComponent(p.apiProfileId)}`);
            models = data.models || [];
            if (statusEl) statusEl.textContent = models.length ? `已拉取 ${models.length} 个模型` : '该接口没有返回模型列表';
        } catch (e) {
            models = [];
            if (statusEl) statusEl.textContent = `拉取失败：${e.message}`;
        }
    }

    async function loadChatsFor(scheme) {
        if (!p.stUser || !scheme.charName) return [];
        try {
            const data = await getJson(`${API}/chats?user=${encodeURIComponent(p.stUser)}&char=${encodeURIComponent(scheme.charName)}`);
            const chats = data.chats || [];
            chatsCache.set(scheme.id, chats);
            return chats;
        } catch (e) {
            console.warn('[carrot] 读取聊天记录列表失败', e);
            return [];
        }
    }

    // 一个 char 只能挂一个方案：排除已被其他方案占用的角色
    function availableCharsFor(scheme) {
        const usedByOthers = new Set(
            p.schemes.filter((s) => s.id !== scheme.id && s.charName).map((s) => s.charName),
        );
        return chars.filter((name) => name === scheme.charName || !usedByOthers.has(name));
    }

    function renderSchemeView(scheme) {
        const card = document.createElement('div');
        card.className = 'cip-ext-field';
        card.style.cssText = 'border:1px solid rgba(128,128,128,.25);border-radius:8px;padding:10px;margin-bottom:10px;';

        const title = scheme.charName || '（未选择角色）';
        const modeLabel = scheme.mode === 'ai' ? 'AI 判断' : `概率 ${scheme.probability}%`;

        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:.6em;">
                <div style="display:flex;align-items:center;gap:.6em;min-width:0;">
                    <label class="checkbox_label" style="display:flex;gap:.4em;align-items:center;${NOWRAP}">
                        <input type="checkbox" class="cip-proactive-scheme-enabled" ${scheme.enabled ? 'checked' : ''}>
                    </label>
                    <b style="overflow:hidden;text-overflow:ellipsis;">${title}</b>
                    <span style="color:#888;font-size:.85em;${NOWRAP}">每 ${scheme.intervalMinutes} 分钟 · ${modeLabel}</span>
                </div>
                <div style="display:flex;gap:.4em;${NOWRAP}">
                    <button class="menu_button cip-proactive-scheme-edit" style="${NOWRAP}">编辑</button>
                    <button class="menu_button cip-proactive-scheme-delete" style="${NOWRAP}" title="删除方案"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </div>
        `;

        card.querySelector('.cip-proactive-scheme-enabled').addEventListener('change', (e) => {
            scheme.enabled = e.target.checked;
            persist();
        });
        card.querySelector('.cip-proactive-scheme-edit').addEventListener('click', () => {
            editingIds.add(scheme.id);
            render();
        });
        card.querySelector('.cip-proactive-scheme-delete').addEventListener('click', () => {
            if (!confirm(`确定删除「${title}」这个方案？`)) return;
            p.schemes = p.schemes.filter((s) => s.id !== scheme.id);
            chatsCache.delete(scheme.id);
            editingIds.delete(scheme.id);
            persist();
            render();
        });

        return card;
    }

    function renderSchemeEdit(scheme) {
        // 编辑态用草稿副本，取消时不影响已保存的数据
        const draft = { ...scheme };
        const isNew = !scheme.charName;

        const card = document.createElement('div');
        card.className = 'cip-ext-field';
        card.style.cssText = 'border:1px solid var(--theme-color-1, #888);border-radius:8px;padding:10px;margin-bottom:10px;';

        function charOptionsHtml() {
            return ['<option value="">选择角色…</option>']
                .concat(availableCharsFor(scheme).map((name) => `<option value="${name}" ${name === draft.charName ? 'selected' : ''}>${name}</option>`))
                .join('');
        }
        function chatOptionsHtml() {
            const cachedChats = chatsCache.get(scheme.id) || [];
            return ['<option value="">自动（最新）</option>']
                .concat(cachedChats.map((c) => `<option value="${c.name}" ${c.name === draft.chatFile ? 'selected' : ''}>${c.name}</option>`))
                .join('');
        }

        card.innerHTML = `
            <div class="cip-ext-field">
                <small>角色（一个角色只能挂一个方案）</small>
                <select class="text_pole cip-proactive-scheme-char">${charOptionsHtml()}</select>
            </div>
            <div class="cip-ext-field">
                <small>聊天记录</small>
                <select class="text_pole cip-proactive-scheme-chat">${chatOptionsHtml()}</select>
            </div>
            <div class="cip-ext-field">
                <label>
                    <span>间隔（分钟）</span>
                    <input type="number" min="1" class="text_pole cip-proactive-scheme-interval" value="${draft.intervalMinutes}">
                </label>
            </div>
            <div class="cip-ext-field">
                <small>触发模式</small>
                <div style="display:flex;gap:1em;">
                    <label class="checkbox_label" style="display:flex;gap:.3em;align-items:center;${NOWRAP}">
                        <input type="radio" name="mode-${scheme.id}" value="probability" class="cip-proactive-scheme-mode" ${draft.mode === 'probability' ? 'checked' : ''}>
                        <span>纯概率</span>
                    </label>
                    <label class="checkbox_label" style="display:flex;gap:.3em;align-items:center;${NOWRAP}">
                        <input type="radio" name="mode-${scheme.id}" value="ai" class="cip-proactive-scheme-mode" ${draft.mode === 'ai' ? 'checked' : ''}>
                        <span>AI 判断</span>
                    </label>
                </div>
            </div>
            <div class="cip-ext-field cip-proactive-probability-row" style="display:${draft.mode === 'probability' ? '' : 'none'};">
                <small>概率（0-100）</small>
                <input type="number" min="0" max="100" class="text_pole cip-proactive-scheme-probability" value="${draft.probability}">
            </div>
            <div style="display:flex;gap:.5em;justify-content:flex-end;margin-top:.5em;">
                <button class="menu_button cip-proactive-scheme-cancel" style="${NOWRAP}">取消</button>
                <button class="menu_button cip-proactive-scheme-save" style="${NOWRAP}">保存</button>
            </div>
        `;

        const charSelect = card.querySelector('.cip-proactive-scheme-char');
        charSelect.addEventListener('change', async (e) => {
            draft.charName = e.target.value;
            draft.chatFile = null;
            if (draft.charName) await loadChatsFor({ id: scheme.id, charName: draft.charName });
            const chatSelect = card.querySelector('.cip-proactive-scheme-chat');
            if (chatSelect) chatSelect.innerHTML = chatOptionsHtml();
        });
        card.querySelector('.cip-proactive-scheme-chat').addEventListener('change', (e) => {
            draft.chatFile = e.target.value || null;
        });
        card.querySelector('.cip-proactive-scheme-interval').addEventListener('change', (e) => {
            draft.intervalMinutes = Math.max(1, Number(e.target.value) || 60);
        });
        card.querySelectorAll('.cip-proactive-scheme-mode').forEach((radio) => {
            radio.addEventListener('change', (e) => {
                if (!e.target.checked) return;
                draft.mode = e.target.value;
                card.querySelector('.cip-proactive-probability-row').style.display = draft.mode === 'probability' ? '' : 'none';
            });
        });
        card.querySelector('.cip-proactive-scheme-probability').addEventListener('change', (e) => {
            draft.probability = Math.min(100, Math.max(0, Number(e.target.value) || 0));
        });

        card.querySelector('.cip-proactive-scheme-save').addEventListener('click', () => {
            if (!draft.charName) {
                alert('请先选择角色');
                return;
            }
            const index = p.schemes.findIndex((s) => s.id === scheme.id);
            if (index !== -1) p.schemes[index] = draft;
            editingIds.delete(scheme.id);
            persist();
            render();
        });
        card.querySelector('.cip-proactive-scheme-cancel').addEventListener('click', () => {
            if (isNew) {
                p.schemes = p.schemes.filter((s) => s.id !== scheme.id);
                persist();
            }
            editingIds.delete(scheme.id);
            render();
        });

        // 已选角色但还没缓存聊天记录列表时，先拉一次
        if (draft.charName && !chatsCache.has(scheme.id)) {
            loadChatsFor({ id: scheme.id, charName: draft.charName }).then(() => {
                const chatSelect = card.querySelector('.cip-proactive-scheme-chat');
                if (chatSelect) chatSelect.innerHTML = chatOptionsHtml();
            });
        }

        return card;
    }

    function render() {
        const userOptions = users.map((u) => `<option value="${u}" ${u === p.stUser ? 'selected' : ''}>${u}</option>`).join('');
        const profileOptions = ['<option value="">选择 API 方案…</option>']
            .concat(profiles.map((pr) => `<option value="${pr.id}" ${pr.id === p.apiProfileId ? 'selected' : ''}>${pr.name}</option>`))
            .join('');
        const modelOptions = ['<option value="">（使用方案自带模型）</option>']
            .concat(models.map((m) => `<option value="${m}" ${m === p.apiModel ? 'selected' : ''}>${m}</option>`))
            .join('');

        container.innerHTML = `
            <div class="cip-ext-checkboxes">
                <label class="cip-ext-label checkbox_label">
                    <input type="checkbox" id="cip-proactive-enabled" ${p.enabled ? 'checked' : ''}>
                    <span>主动消息总开关</span>
                </label>
            </div>
            ${users.length > 1 ? `
            <div class="cip-ext-field">
                <small>酒馆用户</small>
                <select class="text_pole" id="cip-proactive-user">${userOptions}</select>
            </div>` : ''}
            <div class="cip-ext-field">
                <small>API 方案（读取酒馆「连接管理」里已保存的方案，需带自定义 Server URL）</small>
                <div style="display:flex;gap:.4em;">
                    <select class="text_pole" id="cip-proactive-profile" style="flex:1;min-width:0;">${profileOptions}</select>
                    <button class="menu_button" id="cip-proactive-refresh-profiles" style="${NOWRAP}" title="重新拉取方案列表"><i class="fa-solid fa-rotate"></i></button>
                </div>
            </div>
            <div class="cip-ext-field">
                <small>模型（可选，覆盖方案自带的模型；专门给主动消息配一个便宜模型时用）</small>
                <div style="display:flex;gap:.4em;">
                    <select class="text_pole" id="cip-proactive-model" style="flex:1;min-width:0;">${modelOptions}</select>
                    <button class="menu_button" id="cip-proactive-refresh-models" style="${NOWRAP}" title="从当前 API 方案拉取可用模型列表">拉取模型</button>
                </div>
                <div id="cip-proactive-model-status" style="font-size:.8em;color:#888;margin-top:.3em;"></div>
            </div>
            <div class="cip-ext-field">
                <small>全局 Prompt（追加给每次主动消息生成，默认已带时间/线上线下判断逻辑）</small>
                <textarea class="text_pole" id="cip-proactive-global-prompt" rows="3">${p.globalPrompt || ''}</textarea>
            </div>
            <hr class="cip-ext-divider">
            <div id="cip-proactive-scheme-list"></div>
            <button class="menu_button" id="cip-proactive-add-scheme" style="${NOWRAP}">+ 新增方案</button>
        `;

        const list = container.querySelector('#cip-proactive-scheme-list');
        p.schemes.forEach((scheme) => {
            list.appendChild(editingIds.has(scheme.id) ? renderSchemeEdit(scheme) : renderSchemeView(scheme));
        });

        container.querySelector('#cip-proactive-enabled').addEventListener('change', (e) => {
            p.enabled = e.target.checked;
            persist();
        });

        const userSelect = container.querySelector('#cip-proactive-user');
        userSelect?.addEventListener('change', async (e) => {
            p.stUser = e.target.value;
            p.apiProfileId = '';
            p.apiModel = '';
            chatsCache.clear();
            models = [];
            persist();
            await Promise.all([loadChars(), loadProfiles()]);
            render();
        });

        container.querySelector('#cip-proactive-profile').addEventListener('change', async (e) => {
            p.apiProfileId = e.target.value;
            p.apiModel = '';
            models = [];
            persist();
            render();
        });
        container.querySelector('#cip-proactive-refresh-profiles').addEventListener('click', async () => {
            await loadProfiles();
            render();
        });
        container.querySelector('#cip-proactive-model').addEventListener('change', (e) => {
            p.apiModel = e.target.value;
            persist();
        });
        container.querySelector('#cip-proactive-refresh-models').addEventListener('click', async () => {
            if (!p.apiProfileId) {
                alert('请先选择一个 API 方案');
                return;
            }
            await loadModels(container.querySelector('#cip-proactive-model-status'));
            render();
        });
        container.querySelector('#cip-proactive-global-prompt').addEventListener('change', (e) => {
            p.globalPrompt = e.target.value;
            persist();
        });
        container.querySelector('#cip-proactive-add-scheme').addEventListener('click', () => {
            const scheme = makeScheme();
            p.schemes.push(scheme);
            editingIds.add(scheme.id);
            persist();
            render();
        });
    }

    (async function boot() {
        await loadUsers();
        await Promise.all([loadChars(), loadProfiles()]);
        render();
    })();
}
