// carrot v8 plugin 后端探测与引导
// 详见 ./PLAN_v8.md §2.1 §3

import { getSettings, saveSettings } from './config.js';

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

/**
 * 调 plugin 触发自身退出，由 pm2/systemd 自动拉起。
 * 仅 state.runtime.managed === true 时调用才有意义。
 */
export async function requestBackendRestart() {
    try {
        const res = await fetch('/api/plugins/carrot/restart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
function buildModal() {
    if (state.modal) return state.modal;

    const root = document.createElement('div');
    root.id = 'carrot-backend-guide';
    root.className = 'cip-modal-backdrop hidden';
    root.innerHTML = `
        <div class="cip-modal-content cip-frosted-glass" style="max-width:520px;">
            <h3>🥕 启用 carrot 后端</h3>
            <p>链接解析、封面抓取等功能依赖一个酒馆服务器插件。</p>

            <ol style="line-height:1.7;padding-left:1.2em;">
                <li>打开酒馆扩展目录里的 <code>carrot/plugin/install/</code> 文件夹</li>
                <li>双击运行对应脚本：
                    <ul style="margin:.3em 0;">
                        <li><b>Windows</b>：<code>install.cmd</code>（需右键以管理员身份运行）</li>
                        <li><b>Linux / Mac / Termux</b>：<code>bash install.sh</code></li>
                    </ul>
                </li>
                <li style="color:#d33;font-weight:600;">
                    重启酒馆<u>服务器进程</u>
                    <div style="font-weight:400;color:#666;font-size:.92em;margin-top:.3em;">
                        ⚠ 不是按 F5 / 刷新网页！是关掉跑 <code>node server.js</code> 的命令行窗口重新启动。<br>
                        pm2 用户：<code>pm2 restart sillytavern</code>
                    </div>
                </li>
            </ol>

            <div id="carrot-backend-status" style="padding:8px 12px;border-radius:6px;margin:1em 0;background:rgba(0,0,0,.05);">
                <span id="carrot-backend-status-dot">⏳</span>
                <span id="carrot-backend-status-text">未检测到后端</span>
                <span id="carrot-backend-status-err" style="color:#a33;font-size:.85em;margin-left:.5em;"></span>
            </div>

            <div class="cip-modal-actions">
                <button id="carrot-backend-skip">不启用，跳过链接解析</button>
                <button id="carrot-backend-recheck">重新检测</button>
                <button id="carrot-backend-close">先关闭</button>
            </div>
        </div>
    `;
    document.body.appendChild(root);

    root.querySelector('#carrot-backend-recheck').addEventListener('click', async () => {
        await refreshStatus();
    });
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
    if (state.ready) {
        // 通了之后等 1s 自动关闭，给用户看一眼成功状态
        setTimeout(() => {
            hideModal();
        }, 1000);
    }
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
