// carrot SillyTavern server plugin
// 入口：注册 /api/plugins/carrot/* 路由
// 详见 ../PLAN_v8.md §3

const express = require('express');
const fs = require('fs');
const path = require('path');

const manifest = require('./manifest.json');

const info = {
    id: 'carrot',
    name: 'Carrot Backend',
    description: manifest.description,
};

/**
 * 探测当前 node 进程是不是被进程管理器（pm2/systemd/docker+restart）看着。
 * 只有受管的环境，process.exit(0) 才会被自动拉起 —— 否则会"重启"= 直接死。
 */
function detectRuntime() {
    if (process.env.pm_id || process.env.PM2_HOME) {
        return { managed: true, manager: 'pm2' };
    }
    if (process.env.NOTIFY_SOCKET || process.env.JOURNAL_STREAM) {
        return { managed: true, manager: 'systemd' };
    }
    // Docker 检测：进程在容器里（cgroup 或 /.dockerenv），但拿不到 restart policy。
    // 保守起见标 unknown，前端按"不可重启"处理，避免裸 docker run 用户点了挂掉。
    try {
        if (require('fs').existsSync('/.dockerenv')) {
            return { managed: false, manager: 'docker-unknown' };
        }
    } catch {}
    return { managed: false, manager: null };
}

const runtime = detectRuntime();

function getStRoot() {
    return path.resolve(__dirname, '..', '..');
}

function findSourcePluginDir() {
    const stRoot = getStRoot();
    const candidates = [
        path.join(stRoot, 'public', 'scripts', 'extensions', 'third-party', 'carrot', 'plugin'),
        path.join(stRoot, 'data', 'default-user', 'extensions', 'third-party', 'carrot', 'plugin'),
        path.join(stRoot, 'data', 'default-user', 'extensions', 'carrot', 'plugin'),
    ];

    const dataDir = path.join(stRoot, 'data');
    try {
        for (const user of fs.readdirSync(dataDir)) {
            candidates.push(path.join(dataDir, user, 'extensions', 'third-party', 'carrot', 'plugin'));
            candidates.push(path.join(dataDir, user, 'extensions', 'carrot', 'plugin'));
        }
    } catch {}

    const checked = [];
    for (const candidate of candidates) {
        const resolved = path.resolve(candidate);
        checked.push(resolved);
        if (resolved === path.resolve(__dirname)) continue;
        if (fs.existsSync(path.join(resolved, 'index.js')) && fs.existsSync(path.join(resolved, 'manifest.json'))) {
            return { source: resolved, checked };
        }
    }
    return { source: '', checked };
}

function copyDirContents(source, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
        if (entry.name === 'covers') continue;
        const from = path.join(source, entry.name);
        const to = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirContents(from, to);
        } else if (entry.isFile()) {
            fs.copyFileSync(from, to);
        }
    }
}

function syncPluginFiles() {
    const { source, checked } = findSourcePluginDir();
    if (!source) {
        const err = new Error('未找到 carrot 前端扩展目录里的 plugin 源文件，请先更新 carrot 扩展');
        err.checked = checked;
        throw err;
    }
    copyDirContents(source, __dirname);
    return {
        ok: true,
        source,
        target: __dirname,
        version: manifest.version,
    };
}

async function init(router) {
    // router 是裸的 express.Router，需要自己加 body parser
    router.use(express.json({ limit: '1mb' }));

    // 健康检查 —— 前端用它探测 plugin 是否启用，附带运行环境信息
    router.get('/ping', (req, res) => {
        res.json({
            ok: true,
            version: manifest.version,
            name: manifest.name,
            runtime,
        });
    });

    // 仅返回运行环境（前端按需查询，不依赖 ping 缓存）
    router.get('/runtime', (req, res) => res.json(runtime));

    // 同步后端：把前端扩展目录里的 carrot/plugin 复制到 ST plugins/carrot。
    // 所有环境都可用；同步后是否能自动重启另看 runtime.managed。
    router.post('/sync-plugin', (req, res) => {
        try {
            res.json(syncPluginFiles());
        } catch (e) {
            res.status(500).json({
                ok: false,
                error: e?.message || '同步失败',
                checked: e?.checked || [],
            });
        }
    });

    // 重启：先同步后端文件，再仅在受管环境（pm2/systemd）下退出等待自动拉起
    router.post('/restart', (req, res) => {
        let syncResult = null;
        try {
            syncResult = syncPluginFiles();
        } catch (e) {
            return res.status(500).json({
                ok: false,
                error: e?.message || '同步失败',
                checked: e?.checked || [],
                runtime,
            });
        }
        if (!runtime.managed) {
            return res.status(409).json({
                ok: false,
                error: '后端已同步，但当前进程未被 pm2 / systemd 管理，无法安全自动重启。请手动重启酒馆。',
                synced: syncResult,
                runtime,
            });
        }
        res.json({ ok: true, manager: runtime.manager, synced: syncResult });
        // 给响应一点时间发回去
        setTimeout(() => {
            console.log(`[carrot-plugin] 已同步后端文件，收到重启请求，由 ${runtime.manager} 接管拉起`);
            process.exit(0);
        }, 200);
    });

    // 链接解析
    router.post('/link-preview', require('./link-preview'));

    // 封面静态服务
    router.get('/covers/:filename', require('./cover-cache').serve);

    console.log(`[carrot-plugin] v${manifest.version} 已加载，路由前缀 /api/plugins/carrot；运行环境 ${runtime.manager || '裸 node'}`);
    console.log(`[carrot-plugin] 提示：每次升级 carrot 前端后，可在 carrot API 面板点击“同步后端”`);
}

async function exit() {
    console.log('[carrot-plugin] 退出');
}

module.exports = { init, exit, info };
