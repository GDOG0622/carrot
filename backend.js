// carrot v8 plugin 后端探测与引导
// 详见 ./PLAN_v8.md §2.1 §3

import { getSettings, saveSettings } from './config.js';
import { jsonRequestHeaders } from './request-headers.js';

const PING_URL = '/api/plugins/carrot/ping';
const POLL_INTERVAL_MS = 3000;

const state = {
    ready: false,            // plugin 是否可用
    version: '',             // plugin 返回的版本
    lastError: '',
    pollTimer: null,
    modal: null,             // 引导面板 DOM
    runtime: { managed: false, manager: null },  // 进程是否受 pm2/systemd 管
};

export function isBackendReady() {
    return state.ready;
}

export function getBackendStatus() {
    return { ...state, modal: undefined, pollTimer: undefined };
}

export async function syncBackendPlugin() {
    const res = await fetch('/api/plugins/carrot/sync-plugin', {
        method: 'POST',
        headers: jsonRequestHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
}

/**
 * 调 plugin 触发自身退出，由 pm2/systemd 自动拉起。
 * 后端会先同步 plugin 文件；仅 state.runtime.managed === true 时会真正退出重启。
 */
export async function requestBackendRestart() {
    try {
        const res = await fetch('/api/plugins/carrot/restart', {
            method: 'POST',
            headers: jsonRequestHeaders(),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `HTTP ${res.status}`);
        }
        return await res.json();
    } catch (e) {
        // plugin 进程 exit 后这个请求会断开（fetch reject），属于预期行为
        if (/Failed to fetch|NetworkError|connection|aborted/i.test(String(e?.message))) {
            return { ok: true, disconnected: true };
        }
        throw e;
    }
}

export async function pingBackend() {
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(PING_URL, { signal: ctrl.signal, cache: 'no-store' });
        clearTimeout(t);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json().catch(() => ({}));
        if (data?.ok) {
            state.ready = true;
            state.version = data.version || '';
            state.lastError = '';
            if (data.runtime) state.runtime = data.runtime;
            return true;
        }
        throw new Error('ping 返回非 ok');
    } catch (e) {
        state.ready = false;
        state.lastError = e?.message || String(e);
        return false;
    }
}

/**
 * 创建引导面板 DOM（只创建一次，存于 state.modal）
 */
// 各平台 / 安装方式的说明文本
const PLATFORM_GUIDES = {
    windows: {
        label: '💻 Windows',
        intro: '本地双击 <code>Start.bat</code> 或 <code>node server.js</code> 启动的酒馆。',
        installModes: [
            {
                label: 'Install for All（默认）',
                hint: '扩展装在所有用户共享的目录',
                path: `<ST根>\\public\\scripts\\extensions\\third-party\\carrot\\plugin\\install\\`,
                cmd: '双击 <code>install.cmd</code>',
            },
            {
                label: 'Install only for me（单用户）',
                hint: '扩展装在当前登录用户目录',
                path: `<ST根>\\data\\<你的用户名>\\extensions\\third-party\\carrot\\plugin\\install\\`,
                cmd: '双击 <code>install.cmd</code>（找不到路径时把酒馆完整路径作参数：<code>install.cmd "D:\\path\\to\\SillyTavern"</code>）',
            },
        ],
        restart: [
            '关闭跑 node 的黑窗口（Start.bat 的窗口）',
            '重新双击 <code>Start.bat</code> 或重新执行 <code>node server.js</code>',
        ],
    },
    mac: {
        label: '🍎 Mac',
        intro: '本地终端启动的酒馆。',
        installModes: [
            {
                label: 'Install for All',
                path: `<ST根>/public/scripts/extensions/third-party/carrot/plugin/install/`,
                cmd: '终端 cd 到该目录后执行 <code>bash install.sh</code>',
            },
            {
                label: 'Install only for me',
                path: `<ST根>/data/&lt;你的用户名&gt;/extensions/third-party/carrot/plugin/install/`,
                cmd: '终端 cd 到该目录后执行 <code>bash install.sh</code>',
            },
        ],
        restart: [
            '跑 node 的终端窗口按 <kbd>Ctrl+C</kbd> 停止',
            '原地重新执行 <code>node server.js</code>（或你的启动命令）',
        ],
    },
    vps: {
        label: '☁️ Linux VPS',
        intro: 'SSH 上去的 Linux 服务器，不管你是 pm2 / systemd / screen / 裸 node 都先用同一个脚本，区别只在<b>重启命令</b>。',
        oneLiner: true,
        installModes: [
            {
                label: '一键命令（自动找扩展，installForAll/forMe 都兼容）',
                cmd: `cd /root/SillyTavern   <span style="opacity:.6">#换成你的酒馆根目录</span>
EXT=$(find "$PWD/public/scripts/extensions" "$PWD/data" \\
    -path '*/carrot/plugin/install/install.sh' -type f 2&gt;/dev/null | head -n 1)
bash "$EXT" "$PWD"`,
            },
        ],
        restart: [
            '<b>pm2</b>：<code>pm2 restart sillytavern</code>',
            '<b>systemd</b>：<code>sudo systemctl restart sillytavern</code>',
            '<b>裸 node / screen / tmux</b>：到 node 进程的会话里 <kbd>Ctrl+C</kbd> 后重新跑 <code>node server.js</code>',
        ],
        tip: '不确定用的哪种？跑 <code>pm2 list</code> 看有没有 sillytavern；<code>systemctl status sillytavern</code> 看是否有 systemd 单元。',
    },
    docker: {
        label: '🐳 Docker',
        intro: '酒馆跑在 docker 容器里。需要先进入容器、再执行脚本、最后<b>重启容器</b>（容器内部 Ctrl+C 会直接退出容器）。',
        installModes: [
            {
                label: '在宿主机一条龙（推荐）',
                cmd: `<span style="opacity:.6"># 1) 找你的容器名，例如 sillytavern</span>
docker ps

<span style="opacity:.6"># 2) 进容器执行安装脚本（自动找扩展目录）</span>
docker exec -it sillytavern bash -c '
  cd /home/node/app &amp;&amp;
  EXT=$(find "$PWD/public/scripts/extensions" "$PWD/data" \\
        -path "*/carrot/plugin/install/install.sh" -type f 2&gt;/dev/null | head -n 1) &amp;&amp;
  bash "$EXT" "$PWD"
'

<span style="opacity:.6"># 3) 重启容器（关键！）</span>
docker restart sillytavern`,
            },
        ],
        restart: [
            '只用 <code>docker restart &lt;容器名&gt;</code>',
            '<b>千万别</b>在容器里 Ctrl+C —— 那是停容器，不是软重启',
        ],
        tip: 'config.yaml / plugins 目录通过 volume 映射到宿主机时，脚本改的就是宿主机文件，<code>docker restart</code> 后才会生效。',
    },
    termux: {
        label: '📱 安卓 Termux',
        intro: '手机 Termux 里跑酒馆。',
        installModes: [
            {
                label: '通用命令',
                cmd: `cd ~/SillyTavern
EXT=$(find "$PWD/public/scripts/extensions" "$PWD/data" \\
    -path '*/carrot/plugin/install/install.sh' -type f 2&gt;/dev/null | head -n 1)
bash "$EXT" "$PWD"`,
            },
        ],
        restart: [
            '跑 node 的 Termux 会话按 <kbd>Ctrl+C</kbd>',
            '原地重新执行 <code>node server.js</code>',
        ],
        tip: '安装/重启都在同一个 Termux 会话里完成即可。',
    },
};

function renderPlatformContent(key) {
    const g = PLATFORM_GUIDES[key];
    if (!g) return '';
    const modes = g.installModes.map((m, i) => `
        <div class="cip-guide-mode">
            <div class="cip-guide-mode-title">${m.label}${m.hint ? ` <span class="cip-guide-mode-hint">${m.hint}</span>` : ''}</div>
            ${m.path ? `<div class="cip-guide-mode-path">📁 <code>${m.path}</code></div>` : ''}
            <div class="cip-guide-mode-cmd"><pre>${m.cmd}</pre></div>
        </div>
    `).join(g.oneLiner ? '' : '<div class="cip-guide-mode-sep">— 或者 —</div>');

    const restartList = g.restart.map(r => `<li>${r}</li>`).join('');

    return `
        <p class="cip-guide-intro">${g.intro}</p>
        <div class="cip-guide-step">
            <div class="cip-guide-step-head"><span class="cip-guide-step-num">1</span> 运行安装脚本</div>
            ${modes}
        </div>
        <div class="cip-guide-step">
            <div class="cip-guide-step-head"><span class="cip-guide-step-num">2</span> 重启酒馆 <b>服务器进程</b>（不是刷新网页！）</div>
            <ul class="cip-guide-restart">${restartList}</ul>
        </div>
        ${g.tip ? `<div class="cip-guide-tip">💡 ${g.tip}</div>` : ''}
    `;
}

function buildModal() {
    if (state.modal) return state.modal;

    const root = document.createElement('div');
    root.id = 'carrot-backend-guide';
    root.className = 'cip-modal-backdrop hidden';

    const tabsHtml = Object.entries(PLATFORM_GUIDES).map(([k, g], i) => `
        <button class="cip-guide-tab${i === 0 ? ' active' : ''}" data-platform="${k}">${g.label}</button>
    `).join('');

    root.innerHTML = `
        <div class="cip-modal-content cip-frosted-glass cip-backend-guide-modal">
            <h3 style="margin:0;">🥕 启用 carrot 后端</h3>
            <p style="margin:0;font-size:13px;opacity:.85;">链接解析 / 封面缓存 / 图片上传 依赖一个酒馆服务器插件，全平台只需一次。<b>选你的部署方式</b>：</p>

            <div class="cip-guide-tabs">${tabsHtml}</div>
            <div class="cip-guide-body" id="carrot-guide-body"></div>

            <details class="cip-guide-update">
                <summary>🔄 以后 carrot 升级了，怎么更新后端？</summary>
                <div class="cip-guide-update-body">
                    <p>前端扩展（通过酒馆扩展管理器或 git pull）更新后，<b>酒馆 plugins 目录下的 carrot 后端文件不会自动跟着变</b>，需要同步一次：</p>
                    <ol>
                        <li><b>推荐</b>：到 carrot 设置面板 → <b>API</b> 标签 → 点 <code>同步后端</code>（pm2 / systemd 环境会显示 <code>同步并重启</code>，一键完成）</li>
                        <li><b>或者</b>：重跑安装脚本（命令和第一次安装完全一样），脚本会覆盖旧文件</li>
                        <li><b>最后</b>：除 pm2 / systemd 环境外，需要按本面板上方对应平台的"重启"步骤手动重启 node 进程</li>
                    </ol>
                    <div class="cip-guide-tip">💡 前后端版本不一致时，API 面板会用红字提示，按它说的点就行。</div>
                </div>
            </details>

            <div id="carrot-backend-status" class="cip-guide-status">
                <span id="carrot-backend-status-dot">⏳</span>
                <span id="carrot-backend-status-text">未检测到后端</span>
                <span id="carrot-backend-status-err" style="color:#a33;font-size:.85em;margin-left:.5em;"></span>
            </div>

            <div class="cip-modal-actions">
                <button id="carrot-backend-skip">不启用，跳过</button>
                <button id="carrot-backend-recheck">重新检测</button>
                <button id="carrot-backend-close">先关闭</button>
            </div>
        </div>
    `;
    document.body.appendChild(root);

    const body = root.querySelector('#carrot-guide-body');
    const tabs = root.querySelectorAll('.cip-guide-tab');
    const setPlatform = (key) => {
        tabs.forEach(t => t.classList.toggle('active', t.dataset.platform === key));
        body.innerHTML = renderPlatformContent(key);
    };
    tabs.forEach(t => t.addEventListener('click', () => setPlatform(t.dataset.platform)));

    // 默认平台：根据 UA 猜
    const ua = navigator.userAgent || '';
    let defaultKey = 'windows';
    if (/Android/i.test(ua)) defaultKey = 'termux';
    else if (/Mac OS X|Macintosh/i.test(ua)) defaultKey = 'mac';
    else if (/Linux/i.test(ua) && !/Android/i.test(ua)) defaultKey = 'vps';
    setPlatform(defaultKey);

    root.querySelector('#carrot-backend-recheck').addEventListener('click', refreshStatus);
    root.querySelector('#carrot-backend-skip').addEventListener('click', () => {
        const s = getSettings();
        s.linkParse = s.linkParse || {};
        s.linkParse.disabled = true;
        saveSettings();
        hideModal();
    });
    root.querySelector('#carrot-backend-close').addEventListener('click', hideModal);

    state.modal = root;
    return root;
}

function setModalStatus() {
    const m = state.modal;
    if (!m) return;
    const dot = m.querySelector('#carrot-backend-status-dot');
    const text = m.querySelector('#carrot-backend-status-text');
    const err = m.querySelector('#carrot-backend-status-err');
    if (state.ready) {
        dot.textContent = '✅';
        text.textContent = `已就绪（plugin v${state.version}）`;
        err.textContent = '';
    } else {
        dot.textContent = '⏳';
        text.textContent = '未检测到后端';
        err.textContent = state.lastError ? `（${state.lastError}）` : '';
    }
}

async function refreshStatus() {
    await pingBackend();
    setModalStatus();
    // 不自动关闭：用户读完会自己点关闭
}

export function showGuideModal() {
    const m = buildModal();
    m.classList.remove('hidden');
    setModalStatus();
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(refreshStatus, POLL_INTERVAL_MS);
}

export function hideModal() {
    if (state.modal) state.modal.classList.add('hidden');
    if (state.pollTimer) {
        clearInterval(state.pollTimer);
        state.pollTimer = null;
    }
}

/**
 * carrot 启动时调用：探测一次，未通且用户未跳过则弹引导
 */
export async function initBackend() {
    await pingBackend();
    const s = getSettings();
    const userSkipped = !!(s.linkParse && s.linkParse.disabled);
    if (!state.ready && !userSkipped) {
        showGuideModal();
    }
}
