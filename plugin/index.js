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

async function init(router) {
    // router 是裸的 express.Router，需要自己加 body parser
    router.use(express.json({ limit: '1mb' }));

    // 健康检查 —— 前端用它探测 plugin 是否启用
    router.get('/ping', (req, res) => {
        res.json({
            ok: true,
            version: manifest.version,
            name: manifest.name,
        });
    });

    // 链接解析
    router.post('/link-preview', require('./link-preview'));

    // 封面静态服务
    router.get('/covers/:filename', require('./cover-cache').serve);

    console.log(`[carrot-plugin] v${manifest.version} 已加载，路由前缀 /api/plugins/carrot`);
}

async function exit() {
    console.log('[carrot-plugin] 退出');
}

module.exports = { init, exit, info };
