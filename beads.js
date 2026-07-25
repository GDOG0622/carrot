// beads.js — 拼豆挂件功能（独立模块，不并入 script.js）
//
// 数据结构存在 extension_settings.carrot.beads 里：
//   { slots: [{id,name,size,cells,updatedAt}],                    进行中的存档，最多 3 个
//     archive: [{id,name,size,cells,image,createdAt}],             作品匣：已熨烫定型的成品，不占存档
//     pendant: { user: {enabled,corner,slotId,size,rotation,offsetX,offsetY,effect}, char: {同上} } }
// char/user 各自独立配置：位置（左上/右上 + 水平/垂直像素偏移）、大小、旋转角度、动效（无/呼吸缩放/摇摆/忽闪）。
// pendant.slotId 存的其实是 archive 里成品的 id（字段名沿用旧名，语义已经指向作品匣）。
// cells 是长度 size*size 的一维数组，每格是 '' (空/未拼) 或 'rgba(r,g,b,a)' 字符串。
// 透明/半透明拼豆就是 alpha 较低的 rgba，编辑时故意不与空格区分（拼豆本来就该这样）。
//
// 熨烫时用 canvas 渲染出「只含不透明豆子」的底图 PNG，同时把 cells 原样存进 archive；
// 挂件是真实 DOM（不是 ::before 伪元素）：底图负责不透明的豆子，
// 透明/半透明豆子对应的格子各自套一个带 backdrop-filter 的小方块（磨砂玻璃，模糊挂件底下的消息背景），
// 没点豆的格子什么都不画，保持彻底纯透明——这两种效果没法用同一张位图 + 一次 backdrop-filter 区分开。

const MAX_SLOTS = 3;
const CONFETTI_CDN_URL = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js';
const DEFAULT_PALETTE = [
    'rgba(231,76,60,1)', 'rgba(230,126,34,1)', 'rgba(241,196,15,1)',
    'rgba(46,204,113,1)', 'rgba(26,188,156,1)', 'rgba(52,152,219,1)',
    'rgba(155,89,182,1)', 'rgba(253,121,168,1)', 'rgba(44,62,80,1)',
];
const TRANSPARENT_ALPHA_THRESHOLD = 0.5;
const EFFECTS = [
    { value: 'none', label: '无' },
    { value: 'shrink', label: '呼吸缩放' },
    { value: 'sway', label: '摇摆' },
    { value: 'blink', label: '忽闪忽闪' },
];

function defaultRolePendant(role) {
    return {
        enabled: false,
        corner: role === 'user' ? 'top-right' : 'top-left',
        slotId: null,
        size: 36,
        rotation: 0,
        effect: 'none',
        offsetX: 0,
        offsetY: 0,
    };
}

function clamp(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function create(tag, className, html) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (html !== undefined) el.innerHTML = html;
    return el;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return { r: 0, g: 0, b: 0 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function makeColor(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r},${g},${b},${Math.round(alpha * 100) / 100})`;
}

function parseRgba(str) {
    const m = /rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\)/.exec(str || '');
    if (!m) return null;
    return {
        r: Number(m[1]), g: Number(m[2]), b: Number(m[3]),
        a: m[4] !== undefined ? Number(m[4]) : 1,
    };
}

function rgbToHex(r, g, b) {
    const h = (n) => n.toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
}

function genId() {
    return `bead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function cellPxFor(size) {
    if (size <= 16) return 12;
    if (size <= 32) return 8;
    return 5;
}

// 编辑器里的格子比挂件底图大得多（要能点击），缩放在这个基准上再乘 editorZoom%
function editorBaseCellPx(size) {
    if (size <= 8) return 32;
    if (size <= 16) return 22;
    if (size <= 32) return 14;
    return 8;
}
const ZOOM_MIN = 50;
const ZOOM_MAX = 400;
const ZOOM_STEP = 25;
const COORD_STEP = 5;

// 挂件底图只画"不透明"的豆子；透明/半透明豆子留白（真正纯透明），
// 它们在挂件里改用真实 DOM + backdrop-filter 单独叠一层玻璃质感（见 buildPendantElement），
// 这样没点豆的地方才是彻底的空，不会被误伤出一层雾。
function renderOpaqueImage(slot) {
    const cellPx = cellPxFor(slot.size);
    const canvas = document.createElement('canvas');
    canvas.width = slot.size * cellPx;
    canvas.height = slot.size * cellPx;
    const ctx = canvas.getContext('2d');
    for (let y = 0; y < slot.size; y++) {
        for (let x = 0; x < slot.size; x++) {
            const raw = slot.cells[y * slot.size + x];
            if (!raw) continue;
            const parsed = parseRgba(raw);
            if (parsed && parsed.a < TRANSPARENT_ALPHA_THRESHOLD) continue;
            ctx.fillStyle = raw;
            ctx.fillRect(x * cellPx, y * cellPx, cellPx, cellPx);
        }
    }
    return canvas.toDataURL('image/png');
}

export function initBeads({ documentRef = document, getSettings, saveSettings } = {}) {
    if (!getSettings || !saveSettings) {
        console.warn('[carrot] initBeads: 缺少 getSettings/saveSettings');
        return null;
    }

    function normalizeRolePendant(role, raw) {
        const r = (raw && typeof raw === 'object') ? raw : {};
        const d = defaultRolePendant(role);
        return {
            enabled: !!r.enabled,
            corner: r.corner === 'top-left' || r.corner === 'top-right' ? r.corner : d.corner,
            slotId: r.slotId || null,
            size: clamp(r.size, 16, 96, d.size),
            rotation: clamp(r.rotation, -180, 180, d.rotation),
            effect: EFFECTS.some((e) => e.value === r.effect) ? r.effect : d.effect,
            offsetX: clamp(r.offsetX, -80, 80, d.offsetX),
            offsetY: clamp(r.offsetY, -80, 80, d.offsetY),
        };
    }

    function state() {
        const s = getSettings();
        if (!s.beads || typeof s.beads !== 'object') s.beads = { slots: [], archive: [], pendant: {} };
        if (!Array.isArray(s.beads.slots)) s.beads.slots = [];
        if (!Array.isArray(s.beads.archive)) s.beads.archive = [];
        if (!Array.isArray(s.beads.palette) || s.beads.palette.length !== DEFAULT_PALETTE.length) {
            s.beads.palette = DEFAULT_PALETTE.slice();
        }

        // 迁移旧版数据（v8.0.38~43 曾经把熨烫/完成的成品和进行中的存档混在同一个 slots 数组里）
        const legacyFinished = s.beads.slots.filter((slot) => slot.finished && slot.image);
        if (legacyFinished.length) {
            legacyFinished.forEach((slot) => {
                s.beads.archive.push({
                    id: slot.id,
                    name: slot.name,
                    size: slot.size,
                    cells: Array.isArray(slot.cells) ? slot.cells : [],
                    image: slot.image,
                    createdAt: slot.updatedAt || Date.now(),
                });
            });
            s.beads.slots = s.beads.slots.filter((slot) => !(slot.finished && slot.image));
        }

        const pendant = (s.beads.pendant && typeof s.beads.pendant === 'object') ? s.beads.pendant : {};
        // 迁移旧版全局挂件配置（v8.0.38~40 曾是不分 char/user 的单一配置）
        const legacyFlat = !pendant.user && !pendant.char && ('enabled' in pendant || 'corner' in pendant);
        if (legacyFlat) {
            s.beads.pendant = {
                user: normalizeRolePendant('user', pendant),
                char: normalizeRolePendant('char', { ...pendant, corner: 'top-left' }),
            };
        } else {
            s.beads.pendant = {
                user: normalizeRolePendant('user', pendant.user),
                char: normalizeRolePendant('char', pendant.char),
            };
        }
        return s.beads;
    }
    function persist() { saveSettings(); }

    // ---------- 挂件渲染到消息角落（真实 DOM，不是 ::before 伪元素） ----------
    // 之所以不用一张整图 + CSS ::before：没点豆的格子要彻底纯透明，
    // 点了透明/半透明豆的格子要磨砂玻璃（backdrop-filter 模糊挂件底下的消息背景），
    // 这两种效果没法用同一张位图 + 同一个 backdrop-filter 区分开——
    // 一整块 backdrop-filter 会把"没点豆的空白"也一起模糊。只能按格子拆成独立的小 DOM 块。
    function isUserMes(el) {
        return el.getAttribute('is_user') === 'true' || el.classList.contains('user_mes');
    }

    function buildPendantElement(cfg, piece) {
        const el = documentRef.createElement('div');
        el.className = 'cip-bead-pendant-el';
        const baseInset = 4;
        el.style.top = `${baseInset + cfg.offsetY}px`;
        if (cfg.corner === 'top-left') {
            el.style.left = `${baseInset + cfg.offsetX}px`;
            el.style.right = 'auto';
        } else {
            el.style.right = `${baseInset - cfg.offsetX}px`;
            el.style.left = 'auto';
        }
        el.style.width = `${cfg.size}px`;
        el.style.height = `${cfg.size}px`;
        el.style.setProperty('--cip-bead-rot', `${cfg.rotation}deg`);
        if (cfg.effect === 'shrink') el.style.animation = 'cip-bead-anim-shrink 1.6s ease-in-out infinite';
        else if (cfg.effect === 'sway') el.style.animation = 'cip-bead-anim-sway 1.8s ease-in-out infinite';
        else if (cfg.effect === 'blink') el.style.animation = 'cip-bead-anim-blink 1.4s ease-in-out infinite';

        const base = documentRef.createElement('div');
        base.className = 'cip-bead-pendant-base';
        base.style.backgroundImage = `url("${piece.image}")`;
        el.appendChild(base);

        const size = piece.size;
        const cells = Array.isArray(piece.cells) ? piece.cells : [];
        const cellPct = 100 / size;
        cells.forEach((raw, i) => {
            if (!raw) return;
            const parsed = parseRgba(raw);
            if (!parsed || parsed.a >= TRANSPARENT_ALPHA_THRESHOLD) return;
            const x = i % size;
            const y = Math.floor(i / size);
            const glass = documentRef.createElement('div');
            glass.className = 'cip-bead-pendant-glass';
            glass.style.left = `${(x * cellPct).toFixed(3)}%`;
            glass.style.top = `${(y * cellPct).toFixed(3)}%`;
            glass.style.width = `${cellPct.toFixed(3)}%`;
            glass.style.height = `${cellPct.toFixed(3)}%`;
            glass.style.background = `rgba(${parsed.r},${parsed.g},${parsed.b},${(parsed.a * 0.5 + 0.08).toFixed(2)})`;
            el.appendChild(glass);
        });
        return el;
    }

    function applyPendantToChat() {
        const chat = documentRef.getElementById('chat');
        if (!chat) return;
        const st = state();

        // 挂件用哪张图只取决于设置，跟具体是哪条消息无关。以前在下面的循环里逐条查，
        // 而那个查找内部会调 state() —— 等于把整套设置归一化 + 旧数据迁移逻辑
        // 按消息条数重跑一遍。这里整体算一次就够。
        const cfg = { user: st.pendant.user, char: st.pendant.char };
        const piece = {
            user: cfg.user.enabled ? (st.archive.find((p) => p.id === cfg.user.slotId) || null) : null,
            char: cfg.char.enabled ? (st.archive.find((p) => p.id === cfg.char.slotId) || null) : null,
        };
        const on = {
            user: !!(cfg.user.enabled && piece.user?.image),
            char: !!(cfg.char.enabled && piece.char?.image),
        };

        // 两边都没开：不再逐条遍历消息（没用过挂件的用户以前也要付这份全量扫描的钱），
        // 只把之前可能留下的挂件和定位属性清干净就收工。
        if (!on.user && !on.char) {
            chat.querySelectorAll('.cip-bead-pendant-el').forEach((el) => el.remove());
            chat.querySelectorAll('.mes[data-cip-bead-pendant]')
                .forEach((mes) => mes.removeAttribute('data-cip-bead-pendant'));
            return;
        }

        chat.querySelectorAll('.mes').forEach((mes) => {
            const role = isUserMes(mes) ? 'user' : 'char';
            mes.querySelectorAll(':scope > .cip-bead-pendant-el').forEach((el) => el.remove());
            if (!on[role]) {
                mes.removeAttribute('data-cip-bead-pendant');
                return;
            }
            mes.setAttribute('data-cip-bead-pendant', role);
            mes.appendChild(buildPendantElement(cfg[role], piece[role]));
        });
    }

    function watchChatForPendant() {
        const setup = () => {
            const chat = documentRef.getElementById('chat');
            if (!chat) return false;
            applyPendantToChat();

            // applyPendantToChat 是整段聊天的全量重扫，一帧内被触发多次没有意义；
            // 攒到 rAF 里合并成一次。
            let sweepHandle = 0;
            const scheduleSweep = () => {
                if (sweepHandle) return;
                sweepHandle = typeof requestAnimationFrame === 'function'
                    ? requestAnimationFrame(() => { sweepHandle = 0; applyPendantToChat(); })
                    : setTimeout(() => { sweepHandle = 0; applyPendantToChat(); }, 16);
            };

            const observer = new MutationObserver((mutations) => {
                // 一旦确定有新消息就不用再查了：querySelector('.mes') 是子树搜索，
                // 流式输出时每帧会有大量新增节点，全部查一遍纯属浪费。
                for (const m of mutations) {
                    let hit = false;
                    for (const node of m.addedNodes) {
                        if (node.nodeType !== Node.ELEMENT_NODE) continue;
                        if (node.classList?.contains('mes') || node.querySelector?.('.mes')) { hit = true; break; }
                    }
                    if (hit) { scheduleSweep(); return; }
                }
            });
            observer.observe(chat, { childList: true, subtree: true });
            return true;
        };
        if (!setup()) {
            const bodyObserver = new MutationObserver(() => {
                if (setup()) bodyObserver.disconnect();
            });
            bodyObserver.observe(documentRef.body, { childList: true, subtree: true });
        }
    }

    // ---------- 熨烫礼花动效（用开源的 canvas-confetti，跟项目里加载 emoji-picker-element 一样走 CDN） ----------
    if (!documentRef.getElementById('cip-bead-confetti-script')) {
        const confettiScript = documentRef.createElement('script');
        confettiScript.id = 'cip-bead-confetti-script';
        confettiScript.src = CONFETTI_CDN_URL;
        documentRef.head.appendChild(confettiScript);
    }
    function fireConfetti() {
        if (typeof window.confetti !== 'function') return;
        window.confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
        window.confetti({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0, y: 0.7 } });
        window.confetti({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1, y: 0.7 } });
    }

    // ---------- 入口按钮（胡萝卜面板底部功能栏，机器人图标右边，见 ui.js） ----------
    const beadButton = documentRef.getElementById('cip-bead-button');
    beadButton?.addEventListener('click', () => openOverview());

    // ---------- 总览面板：像游戏主菜单一样——新建拼豆 / 继续拼 / 作品匣 / 调整挂件 ----------
    const overviewBackdrop = create('div', 'cip-modal-backdrop cip-bead-modal hidden');
    const overviewContent = create('div', 'cip-modal-content cip-frosted-glass cip-bead-overview-content');
    overviewBackdrop.appendChild(overviewContent);
    documentRef.body.appendChild(overviewBackdrop);
    overviewBackdrop.addEventListener('click', (e) => { if (e.target === overviewBackdrop) closeOverview(); });

    function closeOverview() { overviewBackdrop.classList.add('hidden'); }
    function openOverview() { renderOverview(); overviewBackdrop.classList.remove('hidden'); }

    function renderOverview() {
        const st = state();
        overviewContent.innerHTML = '';
        overviewContent.appendChild(create('h3', null, '拼豆'));

        const newBtn = create('button', 'cip-bead-new-btn', '新建拼豆');
        newBtn.type = 'button';
        newBtn.disabled = st.slots.length >= MAX_SLOTS;
        newBtn.addEventListener('click', () => openNewSlotDialog());
        overviewContent.appendChild(newBtn);

        const continueBtn = create('button', 'cip-bead-new-btn', '继续拼');
        continueBtn.type = 'button';
        continueBtn.disabled = !st.slots.length;
        continueBtn.addEventListener('click', () => openPickSlotDialog());
        overviewContent.appendChild(continueBtn);

        const archiveBtn = create('button', 'cip-bead-new-btn', '作品匣');
        archiveBtn.type = 'button';
        archiveBtn.addEventListener('click', () => openArchiveDialog());
        overviewContent.appendChild(archiveBtn);

        const pendantBtn = create('button', 'cip-bead-pendant-btn', '调整挂件');
        pendantBtn.type = 'button';
        pendantBtn.addEventListener('click', () => openPendantDialog());
        overviewContent.appendChild(pendantBtn);

        const closeBtn = create('button', 'cip-bead-close-btn', '关闭');
        closeBtn.type = 'button';
        closeBtn.addEventListener('click', () => closeOverview());
        overviewContent.appendChild(closeBtn);
    }

    // ---------- 继续拼：进行中存档列表 ----------
    const pickSlotBackdrop = create('div', 'cip-modal-backdrop cip-bead-modal hidden');
    const pickSlotContent = create('div', 'cip-modal-content cip-frosted-glass cip-bead-overview-content');
    pickSlotBackdrop.appendChild(pickSlotContent);
    documentRef.body.appendChild(pickSlotBackdrop);
    pickSlotBackdrop.addEventListener('click', (e) => { if (e.target === pickSlotBackdrop) pickSlotBackdrop.classList.add('hidden'); });

    function renderPickSlot() {
        const st = state();
        pickSlotContent.innerHTML = '';
        pickSlotContent.appendChild(create('h3', null, '继续拼'));

        const list = create('div', 'cip-bead-slot-list');
        for (let i = 0; i < MAX_SLOTS; i++) {
            const slot = st.slots[i];
            const card = create('div', 'cip-bead-slot-card');
            if (slot) {
                const thumb = create('div', 'cip-bead-slot-thumb');
                thumb.textContent = '进行中';
                card.appendChild(thumb);

                const meta = create('div', 'cip-bead-slot-meta');
                meta.appendChild(create('div', 'cip-bead-slot-name', escapeHtml(slot.name)));
                meta.appendChild(create('div', 'cip-bead-slot-info', `${slot.size}×${slot.size}`));
                card.appendChild(meta);

                const actions = create('div', 'cip-bead-slot-actions');
                const continueBtn = create('button', 'cip-bead-slot-btn', '继续拼');
                continueBtn.type = 'button';
                continueBtn.addEventListener('click', () => {
                    pickSlotBackdrop.classList.add('hidden');
                    openEditor(slot.id);
                });
                actions.appendChild(continueBtn);
                const deleteBtn = create('button', 'cip-bead-slot-btn cip-bead-slot-delete', '删除');
                deleteBtn.type = 'button';
                deleteBtn.addEventListener('click', () => {
                    if (!confirm(`确定删除图纸「${slot.name}」？`)) return;
                    const s2 = state();
                    s2.slots = s2.slots.filter((x) => x.id !== slot.id);
                    persist();
                    renderPickSlot();
                });
                actions.appendChild(deleteBtn);
                card.appendChild(actions);
            } else {
                card.classList.add('cip-bead-slot-empty');
                card.textContent = '空档';
            }
            list.appendChild(card);
        }
        pickSlotContent.appendChild(list);

        const closeBtn = create('button', 'cip-bead-close-btn', '关闭');
        closeBtn.type = 'button';
        closeBtn.addEventListener('click', () => pickSlotBackdrop.classList.add('hidden'));
        pickSlotContent.appendChild(closeBtn);
    }
    function openPickSlotDialog() {
        renderPickSlot();
        pickSlotBackdrop.classList.remove('hidden');
    }

    // ---------- 作品匣：已熨烫的成品，点开看大图 / 删除 ----------
    const archiveBackdrop = create('div', 'cip-modal-backdrop cip-bead-modal hidden');
    const archiveContent = create('div', 'cip-modal-content cip-frosted-glass cip-bead-overview-content');
    archiveBackdrop.appendChild(archiveContent);
    documentRef.body.appendChild(archiveBackdrop);
    archiveBackdrop.addEventListener('click', (e) => { if (e.target === archiveBackdrop) archiveBackdrop.classList.add('hidden'); });

    const lightboxBackdrop = create('div', 'cip-modal-backdrop cip-bead-modal hidden');
    const lightboxContent = create('div', 'cip-bead-lightbox-content', `
        <img id="cip-bead-lightbox-img" alt="">
        <div id="cip-bead-lightbox-name"></div>
        <button type="button" id="cip-bead-lightbox-close">关闭</button>
    `);
    lightboxBackdrop.appendChild(lightboxContent);
    documentRef.body.appendChild(lightboxBackdrop);
    lightboxBackdrop.addEventListener('click', (e) => { if (e.target === lightboxBackdrop) lightboxBackdrop.classList.add('hidden'); });
    lightboxContent.querySelector('#cip-bead-lightbox-close').addEventListener('click', () => lightboxBackdrop.classList.add('hidden'));
    function openLightbox(piece) {
        lightboxContent.querySelector('#cip-bead-lightbox-img').src = piece.image;
        lightboxContent.querySelector('#cip-bead-lightbox-name').textContent = `${piece.name}（${piece.size}×${piece.size}）`;
        lightboxBackdrop.classList.remove('hidden');
    }

    function renderArchive() {
        const st = state();
        archiveContent.innerHTML = '';
        archiveContent.appendChild(create('h3', null, '作品匣'));

        if (!st.archive.length) {
            archiveContent.appendChild(create('div', 'cip-bead-slot-empty', '还没有熨烫好的作品'));
        } else {
            const grid = create('div', 'cip-bead-archive-grid');
            st.archive.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).forEach((piece) => {
                const card = create('div', 'cip-bead-archive-card');
                const img = documentRef.createElement('img');
                img.src = piece.image;
                img.alt = piece.name;
                img.addEventListener('click', () => openLightbox(piece));
                card.appendChild(img);
                card.appendChild(create('div', 'cip-bead-slot-name', escapeHtml(piece.name)));
                const deleteBtn = create('button', 'cip-bead-slot-btn cip-bead-slot-delete', '删除');
                deleteBtn.type = 'button';
                deleteBtn.addEventListener('click', () => {
                    if (!confirm(`确定删除作品「${piece.name}」？`)) return;
                    const s2 = state();
                    s2.archive = s2.archive.filter((x) => x.id !== piece.id);
                    ['user', 'char'].forEach((role) => {
                        if (s2.pendant[role].slotId === piece.id) s2.pendant[role].slotId = null;
                    });
                    persist();
                    applyPendantToChat();
                    renderArchive();
                });
                card.appendChild(deleteBtn);
                grid.appendChild(card);
            });
            archiveContent.appendChild(grid);
        }

        const closeBtn = create('button', 'cip-bead-close-btn', '关闭');
        closeBtn.type = 'button';
        closeBtn.addEventListener('click', () => archiveBackdrop.classList.add('hidden'));
        archiveContent.appendChild(closeBtn);
    }
    function openArchiveDialog() {
        renderArchive();
        archiveBackdrop.classList.remove('hidden');
    }

    // ---------- 新建图纸弹窗 ----------
    const newBackdrop = create('div', 'cip-modal-backdrop cip-bead-modal hidden');
    const newContent = create('div', 'cip-modal-content cip-frosted-glass', `
        <h3>新建拼豆</h3>
        <div class="cip-bead-size-options">
            <button type="button" class="cip-bead-size-btn" data-size="8">8×8</button>
            <button type="button" class="cip-bead-size-btn" data-size="16">16×16</button>
            <button type="button" class="cip-bead-size-btn" data-size="32">32×32</button>
            <button type="button" class="cip-bead-size-btn" data-size="64">64×64</button>
        </div>
        <input type="text" id="cip-bead-new-name" placeholder="图纸名字">
        <div class="cip-modal-actions">
            <button type="button" id="cip-bead-new-cancel">取消</button>
            <button type="button" id="cip-bead-new-confirm">创建</button>
        </div>
    `);
    newBackdrop.appendChild(newContent);
    documentRef.body.appendChild(newBackdrop);

    let selectedNewSize = 16;
    const sizeButtons = Array.from(newContent.querySelectorAll('.cip-bead-size-btn'));
    sizeButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            selectedNewSize = Number(btn.dataset.size);
            sizeButtons.forEach((b) => b.classList.toggle('active', b === btn));
        });
    });
    newContent.querySelector('#cip-bead-new-cancel').addEventListener('click', () => newBackdrop.classList.add('hidden'));
    newContent.querySelector('#cip-bead-new-confirm').addEventListener('click', () => {
        const nameInput = newContent.querySelector('#cip-bead-new-name');
        const name = nameInput.value.trim() || `图纸${Date.now() % 10000}`;
        const st = state();
        if (st.slots.length >= MAX_SLOTS) return;
        const slot = {
            id: genId(),
            name,
            size: selectedNewSize,
            cells: new Array(selectedNewSize * selectedNewSize).fill(''),
            updatedAt: Date.now(),
        };
        st.slots.push(slot);
        persist();
        newBackdrop.classList.add('hidden');
        nameInput.value = '';
        closeOverview();
        openEditor(slot.id);
    });
    function openNewSlotDialog() {
        selectedNewSize = 16;
        sizeButtons.forEach((b, i) => b.classList.toggle('active', i === 0));
        newBackdrop.classList.remove('hidden');
    }

    // ---------- 调整挂件弹窗（char / user 分别设置） ----------
    const effectOptionsHtml = EFFECTS.map((e) => `<option value="${e.value}">${e.label}</option>`).join('');
    function pendantPaneHtml(role, roleLabel, active) {
        return `
        <div class="cip-bead-pendant-pane${active ? ' active' : ''}" data-role="${role}">
            <label class="cip-bead-pendant-row">
                <input type="checkbox" class="cip-bead-pendant-enabled">
                在${roleLabel}消息上显示挂件
            </label>
            <div class="cip-bead-pendant-row">
                <span>使用图纸：</span>
                <select class="cip-bead-pendant-slot"></select>
            </div>
            <div class="cip-bead-pendant-row">
                <span>位置：</span>
                <select class="cip-bead-pendant-corner">
                    <option value="top-left">左上</option>
                    <option value="top-right">右上</option>
                </select>
            </div>
            <div class="cip-bead-pendant-row">
                <span>大小：<output class="cip-bead-pendant-size-value">36</output>px</span>
                <input type="range" class="cip-bead-pendant-size" min="16" max="96" step="1" value="36">
            </div>
            <div class="cip-bead-pendant-row">
                <span>旋转：<output class="cip-bead-pendant-rotation-value">0</output>°</span>
                <input type="range" class="cip-bead-pendant-rotation" min="-180" max="180" step="1" value="0">
            </div>
            <div class="cip-bead-pendant-row">
                <span>水平偏移：<output class="cip-bead-pendant-offsetx-value">0</output>px</span>
                <input type="range" class="cip-bead-pendant-offsetx" min="-80" max="80" step="1" value="0">
            </div>
            <div class="cip-bead-pendant-row">
                <span>垂直偏移：<output class="cip-bead-pendant-offsety-value">0</output>px</span>
                <input type="range" class="cip-bead-pendant-offsety" min="-80" max="80" step="1" value="0">
            </div>
            <div class="cip-bead-pendant-row">
                <span>动效：</span>
                <select class="cip-bead-pendant-effect">${effectOptionsHtml}</select>
            </div>
        </div>`;
    }
    const pendantBackdrop = create('div', 'cip-modal-backdrop cip-bead-modal hidden');
    const pendantContent = create('div', 'cip-modal-content cip-frosted-glass cip-bead-pendant-content', `
        <h3>调整挂件</h3>
        <div class="cip-bead-pendant-tabs">
            <button type="button" class="cip-bead-pendant-tab active" data-role="char">角色 (Char)</button>
            <button type="button" class="cip-bead-pendant-tab" data-role="user">你 (User)</button>
        </div>
        ${pendantPaneHtml('char', '角色', true)}
        ${pendantPaneHtml('user', '你', false)}
        <div class="cip-modal-actions">
            <button type="button" id="cip-bead-pendant-close">完成</button>
        </div>
    `);
    pendantBackdrop.appendChild(pendantContent);
    documentRef.body.appendChild(pendantBackdrop);

    const pendantTabs = Array.from(pendantContent.querySelectorAll('.cip-bead-pendant-tab'));
    const pendantPanes = Array.from(pendantContent.querySelectorAll('.cip-bead-pendant-pane'));
    pendantTabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            pendantTabs.forEach((t) => t.classList.toggle('active', t === tab));
            pendantPanes.forEach((p) => p.classList.toggle('active', p.dataset.role === tab.dataset.role));
        });
    });

    function fillPendantPane(role) {
        const st = state();
        const cfg = st.pendant[role];
        const pane = pendantPanes.find((p) => p.dataset.role === role);
        const enabledInput = pane.querySelector('.cip-bead-pendant-enabled');
        const cornerSelect = pane.querySelector('.cip-bead-pendant-corner');
        const slotSelect = pane.querySelector('.cip-bead-pendant-slot');
        const sizeInput = pane.querySelector('.cip-bead-pendant-size');
        const sizeValue = pane.querySelector('.cip-bead-pendant-size-value');
        const rotationInput = pane.querySelector('.cip-bead-pendant-rotation');
        const rotationValue = pane.querySelector('.cip-bead-pendant-rotation-value');
        const offsetXInput = pane.querySelector('.cip-bead-pendant-offsetx');
        const offsetXValue = pane.querySelector('.cip-bead-pendant-offsetx-value');
        const offsetYInput = pane.querySelector('.cip-bead-pendant-offsety');
        const offsetYValue = pane.querySelector('.cip-bead-pendant-offsety-value');
        const effectSelect = pane.querySelector('.cip-bead-pendant-effect');

        enabledInput.checked = cfg.enabled;
        cornerSelect.value = cfg.corner;
        sizeInput.value = cfg.size;
        sizeValue.textContent = cfg.size;
        rotationInput.value = cfg.rotation;
        rotationValue.textContent = cfg.rotation;
        offsetXInput.value = cfg.offsetX;
        offsetXValue.textContent = cfg.offsetX;
        offsetYInput.value = cfg.offsetY;
        offsetYValue.textContent = cfg.offsetY;
        effectSelect.value = cfg.effect;

        slotSelect.innerHTML = '';
        const pieces = st.archive;
        if (!pieces.length) {
            const opt = documentRef.createElement('option');
            opt.value = '';
            opt.textContent = '作品匣里还没有熨烫好的作品';
            slotSelect.appendChild(opt);
        } else {
            pieces.forEach((s) => {
                const opt = documentRef.createElement('option');
                opt.value = s.id;
                opt.textContent = s.name;
                slotSelect.appendChild(opt);
            });
            slotSelect.value = pieces.some((s) => s.id === cfg.slotId) ? cfg.slotId : pieces[0].id;
        }

        const commit = () => {
            const s2 = state();
            s2.pendant[role].enabled = enabledInput.checked;
            s2.pendant[role].corner = cornerSelect.value === 'top-left' ? 'top-left' : 'top-right';
            if (slotSelect.value) s2.pendant[role].slotId = slotSelect.value;
            s2.pendant[role].size = clamp(sizeInput.value, 16, 96, 36);
            s2.pendant[role].rotation = clamp(rotationInput.value, -180, 180, 0);
            s2.pendant[role].offsetX = clamp(offsetXInput.value, -80, 80, 0);
            s2.pendant[role].offsetY = clamp(offsetYInput.value, -80, 80, 0);
            s2.pendant[role].effect = effectSelect.value;
            persist();
            applyPendantToChat();
        };
        enabledInput.onchange = commit;
        cornerSelect.onchange = commit;
        slotSelect.onchange = commit;
        effectSelect.onchange = commit;
        sizeInput.oninput = () => { sizeValue.textContent = sizeInput.value; commit(); };
        rotationInput.oninput = () => { rotationValue.textContent = rotationInput.value; commit(); };
        offsetXInput.oninput = () => { offsetXValue.textContent = offsetXInput.value; commit(); };
        offsetYInput.oninput = () => { offsetYValue.textContent = offsetYInput.value; commit(); };
    }

    function openPendantDialog() {
        fillPendantPane('char');
        fillPendantPane('user');
        pendantBackdrop.classList.remove('hidden');
    }
    pendantContent.querySelector('#cip-bead-pendant-close').addEventListener('click', () => pendantBackdrop.classList.add('hidden'));

    // ---------- 拼豆编辑器（悬浮面板：PC 右下角、移动端居中，可拖拽/可缩放） ----------
    const editorBackdrop = create('div', 'cip-modal-backdrop cip-bead-editor-backdrop hidden');
    const editorContent = create('div', 'cip-modal-content cip-frosted-glass cip-bead-editor-content', `
        <h3 id="cip-bead-editor-title" class="cip-bead-drag-handle"></h3>
        <div id="cip-bead-palette" class="cip-bead-palette"></div>
        <div id="cip-bead-alpha-row" class="cip-bead-alpha-row">
            <input type="color" id="cip-bead-custom-color" value="#e74c3c">
            <input type="range" id="cip-bead-custom-alpha" min="0" max="1" step="0.01" value="1">
            <output id="cip-bead-custom-alpha-value">1.00</output>
        </div>
        <div id="cip-bead-zoom-row" class="cip-bead-zoom-row">
            <button type="button" id="cip-bead-zoom-out">－</button>
            <output id="cip-bead-zoom-value">100%</output>
            <button type="button" id="cip-bead-zoom-in">＋</button>
        </div>
        <div id="cip-bead-grid-scroll" class="cip-bead-grid-scroll">
            <div id="cip-bead-grid-layout" class="cip-bead-grid-layout">
                <div class="cip-bead-ruler-corner"></div>
                <div id="cip-bead-ruler-x" class="cip-bead-ruler-x"></div>
                <div id="cip-bead-ruler-y" class="cip-bead-ruler-y"></div>
                <div id="cip-bead-grid" class="cip-bead-grid"></div>
            </div>
        </div>
        <div class="cip-modal-actions">
            <button type="button" id="cip-bead-editor-close">存档</button>
            <button type="button" id="cip-bead-editor-finish">熨烫</button>
        </div>
        <div id="cip-bead-resize-handle" class="cip-bead-resize-handle" title="拖拽调整大小">
            <i class="fa-solid fa-up-right-and-down-left-from-center"></i>
        </div>
    `);
    editorBackdrop.appendChild(editorContent);
    documentRef.body.appendChild(editorBackdrop);

    function pointFromEvent(e) {
        const src = e.touches?.[0] || e.changedTouches?.[0] || e;
        return { x: src.clientX, y: src.clientY };
    }
    function makeDraggable(handle, panel) {
        function start(e) {
            if (e.type === 'mousedown' && e.button !== 0) return;
            e.preventDefault();
            const { x: startX, y: startY } = pointFromEvent(e);
            const rect = panel.getBoundingClientRect();
            panel.style.transform = 'none';
            panel.style.left = `${rect.left}px`;
            panel.style.top = `${rect.top}px`;
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            const move = (ev) => {
                const { x, y } = pointFromEvent(ev);
                const newLeft = Math.max(0, Math.min(rect.left + (x - startX), window.innerWidth - panel.offsetWidth));
                const newTop = Math.max(0, Math.min(rect.top + (y - startY), window.innerHeight - panel.offsetHeight));
                panel.style.left = `${newLeft}px`;
                panel.style.top = `${newTop}px`;
            };
            const end = () => {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', end);
                document.removeEventListener('touchmove', move);
                document.removeEventListener('touchend', end);
            };
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', end);
            document.addEventListener('touchmove', move, { passive: false });
            document.addEventListener('touchend', end);
        }
        handle.addEventListener('mousedown', start);
        handle.addEventListener('touchstart', start, { passive: false });
    }
    function makeResizable(handle, panel) {
        function start(e) {
            if (e.type === 'mousedown' && e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            const { x: startX } = pointFromEvent(e);
            const startWidth = panel.getBoundingClientRect().width;
            const move = (ev) => {
                const { x } = pointFromEvent(ev);
                const newWidth = Math.max(240, Math.min(startWidth + (x - startX), window.innerWidth - 20));
                panel.style.width = `${newWidth}px`;
            };
            const end = () => {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', end);
                document.removeEventListener('touchmove', move);
                document.removeEventListener('touchend', end);
            };
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', end);
            document.addEventListener('touchmove', move, { passive: false });
            document.addEventListener('touchend', end);
        }
        handle.addEventListener('mousedown', start);
        handle.addEventListener('touchstart', start, { passive: false });
    }
    makeDraggable(editorContent.querySelector('.cip-bead-drag-handle'), editorContent);
    makeResizable(editorContent.querySelector('#cip-bead-resize-handle'), editorContent);

    function positionEditorDefault() {
        // 用测量到的像素定位，不用 top/left 百分比——这个页面里 body 本身是
        // position:fixed，会打乱嵌套 fixed 元素的百分比/transform 居中计算。
        const isMobile = window.innerWidth <= 768;
        editorContent.style.transform = 'none';
        editorContent.style.width = '';
        if (isMobile) {
            editorContent.style.right = 'auto';
            editorContent.style.bottom = 'auto';
            editorContent.style.left = '0px';
            editorContent.style.top = '0px';
            // 同步读 offsetWidth/Height 会强制触发一次布局回流，不用等 rAF
            const w = editorContent.offsetWidth;
            const h = editorContent.offsetHeight;
            editorContent.style.left = `${Math.max(0, (window.innerWidth - w) / 2)}px`;
            editorContent.style.top = `${Math.max(0, (window.innerHeight - h) / 2)}px`;
        } else {
            editorContent.style.left = 'auto';
            editorContent.style.top = 'auto';
            editorContent.style.right = '20px';
            editorContent.style.bottom = '20px';
        }
    }

    let editingSlotId = null;
    let currentColor = makeColor('#e74c3c', 1);
    let eraserMode = false;
    let selectedSwatchIndex = null;

    const paletteEl = editorContent.querySelector('#cip-bead-palette');
    function highlightSwatch(target) {
        paletteEl.querySelectorAll('.cip-bead-swatch').forEach((s) => s.classList.toggle('active', s === target));
    }
    function buildPalette() {
        paletteEl.innerHTML = '';
        const palette = state().palette;
        palette.forEach((color, i) => {
            const swatch = create('button', 'cip-bead-swatch');
            swatch.type = 'button';
            swatch.style.backgroundColor = color;
            swatch.addEventListener('click', () => {
                eraserMode = false;
                selectedSwatchIndex = i;
                currentColor = state().palette[i];
                const parsed = parseRgba(currentColor) || { r: 231, g: 76, b: 60, a: 1 };
                customColorInput.value = rgbToHex(parsed.r, parsed.g, parsed.b);
                customAlphaInput.value = parsed.a;
                customAlphaValue.textContent = parsed.a.toFixed(2);
                highlightSwatch(swatch);
            });
            paletteEl.appendChild(swatch);
        });
        const eraser = create('button', 'cip-bead-swatch cip-bead-eraser', '<i class="fa-solid fa-eraser"></i>');
        eraser.type = 'button';
        eraser.title = '橡皮擦';
        eraser.addEventListener('click', () => {
            eraserMode = true;
            selectedSwatchIndex = null;
            highlightSwatch(eraser);
        });
        paletteEl.appendChild(eraser);
    }

    const customColorInput = editorContent.querySelector('#cip-bead-custom-color');
    const customAlphaInput = editorContent.querySelector('#cip-bead-custom-alpha');
    const customAlphaValue = editorContent.querySelector('#cip-bead-custom-alpha-value');
    function syncCustomColor() {
        eraserMode = false;
        const alpha = Number(customAlphaInput.value) || 0;
        customAlphaValue.textContent = alpha.toFixed(2);
        currentColor = makeColor(customColorInput.value, alpha);
        // 选中了某个色槽时，调色盘的改动直接改写这个色槽本身（同一个槽位记住你调过的颜色）
        if (selectedSwatchIndex !== null) {
            const st = state();
            st.palette[selectedSwatchIndex] = currentColor;
            persist();
            const swatchEls = paletteEl.querySelectorAll('.cip-bead-swatch');
            const target = swatchEls[selectedSwatchIndex];
            if (target) target.style.backgroundColor = currentColor;
        } else {
            highlightSwatch(null);
        }
    }
    customColorInput.addEventListener('input', syncCustomColor);
    customAlphaInput.addEventListener('input', syncCustomColor);
    buildPalette();

    const gridEl = editorContent.querySelector('#cip-bead-grid');
    let cellDots = [];
    let isPointerDown = false;

    function applyDotStyle(dot, color) {
        dot.style.background = color || 'transparent';
        const parsed = color ? parseRgba(color) : null;
        dot.classList.toggle('cip-bead-dot-transparent', !!parsed && parsed.a < TRANSPARENT_ALPHA_THRESHOLD);
    }

    function paintCell(index) {
        const st = state();
        const slot = st.slots.find((s) => s.id === editingSlotId);
        if (!slot) return;
        slot.cells[index] = eraserMode ? '' : currentColor;
        slot.updatedAt = Date.now();
        const dot = cellDots[index];
        if (dot) applyDotStyle(dot, slot.cells[index]);
        persist();
    }

    gridEl.addEventListener('pointerdown', (e) => {
        const cell = e.target.closest('.cip-bead-cell');
        if (!cell) return;
        isPointerDown = true;
        paintCell(Number(cell.dataset.index));
    });
    gridEl.addEventListener('pointerover', (e) => {
        if (!isPointerDown) return;
        const cell = e.target.closest('.cip-bead-cell');
        if (!cell) return;
        paintCell(Number(cell.dataset.index));
    });
    documentRef.addEventListener('pointerup', () => { isPointerDown = false; });

    const rulerXEl = editorContent.querySelector('#cip-bead-ruler-x');
    const rulerYEl = editorContent.querySelector('#cip-bead-ruler-y');
    const zoomOutBtn = editorContent.querySelector('#cip-bead-zoom-out');
    const zoomInBtn = editorContent.querySelector('#cip-bead-zoom-in');
    const zoomValueEl = editorContent.querySelector('#cip-bead-zoom-value');
    let editorZoom = 100;

    function buildRulers(slot, cellPx) {
        const totalPx = cellPx * slot.size;
        rulerXEl.innerHTML = '';
        rulerYEl.innerHTML = '';
        rulerXEl.style.width = `${totalPx}px`;
        rulerYEl.style.height = `${totalPx}px`;
        for (let i = COORD_STEP; i <= slot.size; i += COORD_STEP) {
            const labelX = create('span', 'cip-bead-ruler-label', String(i));
            labelX.style.left = `${(i - 0.5) * cellPx}px`;
            rulerXEl.appendChild(labelX);

            const labelY = create('span', 'cip-bead-ruler-label', String(i));
            labelY.style.top = `${(i - 0.5) * cellPx}px`;
            rulerYEl.appendChild(labelY);
        }
    }

    function buildGrid(slot) {
        const cellPx = Math.max(4, Math.round(editorBaseCellPx(slot.size) * editorZoom / 100));
        gridEl.innerHTML = '';
        gridEl.style.gridTemplateColumns = `repeat(${slot.size}, ${cellPx}px)`;
        gridEl.style.gridAutoRows = `${cellPx}px`;
        gridEl.style.width = `${cellPx * slot.size}px`;
        gridEl.style.height = `${cellPx * slot.size}px`;
        cellDots = [];
        for (let i = 0; i < slot.size * slot.size; i++) {
            const cell = create('div', 'cip-bead-cell');
            cell.dataset.index = String(i);
            const dot = create('div', 'cip-bead-dot');
            applyDotStyle(dot, slot.cells[i]);
            cell.appendChild(dot);
            gridEl.appendChild(cell);
            cellDots.push(dot);
        }
        buildRulers(slot, cellPx);
        zoomValueEl.textContent = `${editorZoom}%`;
    }

    function applyZoom(delta) {
        const st = state();
        const slot = st.slots.find((s) => s.id === editingSlotId);
        if (!slot) return;
        editorZoom = clamp(editorZoom + delta, ZOOM_MIN, ZOOM_MAX, editorZoom);
        buildGrid(slot);
    }
    zoomOutBtn.addEventListener('click', () => applyZoom(-ZOOM_STEP));
    zoomInBtn.addEventListener('click', () => applyZoom(ZOOM_STEP));

    function openEditor(slotId) {
        const st = state();
        const slot = st.slots.find((s) => s.id === slotId);
        if (!slot) return;
        editingSlotId = slotId;
        eraserMode = false;
        selectedSwatchIndex = null;
        editorZoom = 100;
        highlightSwatch(null);
        buildPalette();
        editorContent.querySelector('#cip-bead-editor-title').textContent = `${slot.name}（${slot.size}×${slot.size}）`;
        buildGrid(slot);
        positionEditorDefault();
        editorBackdrop.classList.remove('hidden');
    }

    editorContent.querySelector('#cip-bead-editor-close').addEventListener('click', () => {
        editorBackdrop.classList.add('hidden');
        editingSlotId = null;
        openOverview();
    });
    editorContent.querySelector('#cip-bead-editor-finish').addEventListener('click', () => {
        const st = state();
        const slot = st.slots.find((s) => s.id === editingSlotId);
        if (!slot) return;
        const hasAny = slot.cells.some((c) => !!c);
        if (!hasAny && !confirm('画板还是空的，确定熨烫吗？')) return;
        const image = renderOpaqueImage(slot);
        st.archive.push({
            id: slot.id,
            name: slot.name,
            size: slot.size,
            cells: slot.cells.slice(),
            image,
            createdAt: Date.now(),
        });
        st.slots = st.slots.filter((s) => s.id !== editingSlotId);
        persist();
        applyPendantToChat();
        fireConfetti();
        editorBackdrop.classList.add('hidden');
        editingSlotId = null;
        openOverview();
    });

    watchChatForPendant();

    return { openOverview };
}
