// carrot SillyTavern server plugin
// 入口：注册 /api/plugins/carrot/* 路由
// 详见 ../PLAN_v8.md §3

const express = require('express');
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

    // 重启：仅在受管环境（pm2/systemd）下有意义，会被自动拉起
    router.post('/restart', (req, res) => {
        if (!runtime.managed) {
            return res.status(409).json({
                ok: false,
                error: '当前进程未被 pm2 / systemd 管理，退出后无法自动拉起。请手动重启酒馆。',
                runtime,
            });
        }
        res.json({ ok: true, manager: runtime.manager });
        // 给响应一点时间发回去
        setTimeout(() => {
            console.log(`[carrot-plugin] 收到重启请求，由 ${runtime.manager} 接管拉起`);
            process.exit(0);
        }, 200);
    });

    // 链接解析
    router.post('/link-preview', require('./link-preview'));

    // 封面静态服务
    router.get('/covers/:filename', require('./cover-cache').serve);

    console.log(`[carrot-plugin] v${manifest.version} 已加载，路由前缀 /api/plugins/carrot；运行环境 ${runtime.manager || '裸 node'}`);
}

async function exit() {
    console.log('[carrot-plugin] 退出');
}

module.exports = { init, exit, info };
