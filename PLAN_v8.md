# carrot v8.0 开发交接文档

> 本文档是 v8.0 开发计划与所有已拍板的设计决策。
> 若主开发 AI（Claude Opus 4.7）中断，其他 AI 可凭此文档接手。
>
> 完成 v8.0 + 后续 v8.1/v8.2 后，本文档可删除。

---

## 0. 项目背景

**carrot** 是 SillyTavern 第三方扩展（GitHub: <https://github.com/GDOG0622/carrot>，分支 main），定位"快速输入面板 + 聊天增强"。

**v8.0 目标**：把 BunnyOS 项目（路径 `D:/OneDrive/BunnyOS`，另一个独立项目）里成熟的「链接解析」功能移植到 carrot。同时为后续 v8.1（语音输入）、v8.2（图片视觉）打好后端地基。

**核心架构决策**：carrot v8.0 引入 SillyTavern **server plugin** 机制（不是 standalone 后端，不是依赖 BunnyOS）。前端 + 后端都在 carrot 仓库一处管理，用户安装时通过脚本建软链把 plugin 装到酒馆的 `plugins/carrot/`。

---

## 1. 不变约束 / 已拍板事项

### 1.1 仓库与提交

- Git remote: `https://github.com/GDOG0622/carrot.git`（已切，原 `o7xYU` 账号被盗弃用）
- 分支：直接在 `main` 干，**不开 worktree**
- **每个 commit 完成后立刻** `git add` + `git commit` + `git push origin main`
- commit message 风格：中文动词+名词一句话，无 conventional commits 前缀。参照现有历史："更新社交链接解析文档"、"添加微信公众号链接解析"、"完善世界书条目操作"
- 完成 v8.0 时打 `v8.0` tag

### 1.2 版本号

- `manifest.json` 的 `version` 从 7.0 → **8.0**
- 后续 v8.1 加语音 STT，v8.2 加图片 AI 视觉
- `manifest_version` 保持现状（酒馆扩展机制字段，不动）

### 1.3 目录结构

新增 `carrot/plugin/` 子目录，**所有后端代码 + 安装/卸载脚本都塞这**：

```
carrot/
├── manifest.json                      # 现有，version 改 8.0
├── script.js / ui.js / drawer.js …    # 现有前端文件
├── format-renderer.js                 # 现有，要加新 token 渲染规则
├── PLAN_v8.md                         # 本文档
└── plugin/                            # 新增
    ├── manifest.json                  # ST plugin 元数据
    ├── index.js                       # 入口，注册 router
    ├── link-preview.js                # 抄 BunnyOS 那段链接解析
    └── install/
        ├── install.cmd                # Windows
        ├── install.sh                 # Linux / Mac / Termux
        ├── uninstall.cmd
        └── uninstall.sh
```

### 1.4 BunnyOS 源代码参照（不要 git submodule，只参考）

| 功能 | BunnyOS 路径 | 用途 |
|---|---|---|
| 链接预览后端 | [D:/OneDrive/BunnyOS/server.js:1909](D:/OneDrive/BunnyOS/server.js) (约 200 行) | 直接抄，改 express 写法为 ST plugin 写法 |
| 语音 STT 前端 | [D:/OneDrive/BunnyOS/apps/QQ/scripts/media.js:272-523](D:/OneDrive/BunnyOS/apps/QQ/scripts/media.js) | v8.1 用，本次不动 |
| 图片附件处理 | [D:/OneDrive/BunnyOS/apps/QQ/scripts/media.js:205+](D:/OneDrive/BunnyOS/apps/QQ/scripts/media.js) + [server.js:3433](D:/OneDrive/BunnyOS/server.js) | v8.2 用，本次不动 |
| 链接卡片样式参考 | BunnyOS 渲染的小红书/抖音/公众号卡片实物 | 左图右文，标题/简介/站点名 |

---

## 2. v8.0 功能范围（链接解析）

### 2.1 用户视角的完整流程

1. 用户更新 carrot 到 v8.0，刷新酒馆
2. 弹模态引导面板（首次启动且 plugin 未启用时）：
   - 大字提示「**重启酒馆 = 重启服务器进程，不是 F5 刷新网页**」
   - 给出 Win/Linux 一键脚本下载按钮（脚本就在 carrot/plugin/install/）
   - 脚本自动完成：定位酒馆根 → 改 config.yaml `enableServerPlugins: true` → 建软链 `<酒馆>/plugins/carrot → <扩展目录>/carrot/plugin`
   - 提示用户重启酒馆，前端每 3s 轮询 `/api/plugins/carrot/ping`，通了自动关闭引导
   - 也提供"我就不开了，跳过链接解析"按钮（写 `extension_settings.carrot.linkParse.disabled = true`）
3. 用户在酒馆输入框打字时正常贴 URL（不需要在 carrot 面板里操作）
4. 用户点发送 / 按 Enter：
   - hook 拦截，扫消息里所有 `https?://...` URL（**跳过 ``` 代码块、跳过已是 [link\|...] token**）
   - 发送按钮变 loading
   - 调 `/api/plugins/carrot/link-preview` 批量解析（最多 5 并发，单 URL 15s，总 30s）
   - URL **原地 block 替换**为 `[link|标题|简介|封面URL]原URL[/link]`
   - 放行原生 send
5. 消息显示在酒馆 chat 区：carrot 渲染层把 token 替换成左图右文的卡片，点击新标签页打开原 URL

### 2.2 失败处理

| 场景 | 处理 |
|---|---|
| plugin 未启用（ping 失败） | 阻止发送 + 弹引导面板（除非用户已勾"跳过"） |
| 用户勾了"跳过链接解析" | 不再阻止，URL 原文发出 |
| 单 URL 解析失败（404/超时/SSRF 拦截） | 该 URL 保留原文，其他 URL 正常替换，toast 一行"X 个链接解析失败"，消息照发 |
| 整批失败（网络断/plugin 崩） | 阻止发送 + toast「链接解析服务异常」+ 提供"放弃解析直接发"按钮 |

### 2.3 UI 改动（具体到行）

**ui.js**（[D:/OneDrive/dcbot/carrot/ui.js](D:/OneDrive/dcbot/carrot/ui.js)）

- [line 26](D:/OneDrive/dcbot/carrot/ui.js:26)：从 `cip-sub-options-container` 里**删除** `data-type="post"` 和 `data-type="bunny"` 两个按钮
- [line 37-42](D:/OneDrive/dcbot/carrot/ui.js:37)：footer-controls 里在 emoji 按钮**右侧**加：
  ```html
  <button id="cip-bunny-button" class="cip-footer-icon-button" type="button" title="BUNNY">
    <i class="fa-solid fa-robot"></i>
  </button>
  ```
- 不需要新的 tab/section（语音 tab 不在本期删除，留 v8.1）

**style.css**

- footer 三个图标按钮（齿轮 / emoji / robot）之间 `gap` 收紧到 4px 左右
- robot 图标颜色跟现有 footer 按钮一致

**script.js**（[D:/OneDrive/dcbot/carrot/script.js](D:/OneDrive/dcbot/carrot/script.js)）

- [line 414](D:/OneDrive/dcbot/carrot/script.js:414)：删除 `formatTemplates.text.post`
- [line 415](D:/OneDrive/dcbot/carrot/script.js:415)：**保留** `formatTemplates.text.bunny = "+{content}+"`
- [line 428-429](D:/OneDrive/dcbot/carrot/script.js:428)：删除对应 `subTypePlaceholders.post` 和 `.bunny`
- [line 704-708](D:/OneDrive/dcbot/carrot/script.js:704)：`switchTextSubType` 因为只剩 4 个 sub-type，默认值 plain（现状即可）
- 新增：`#cip-bunny-button` 点击 → 取 carrot 主输入框（`#cip-main-input`）内容，包成 `+内容+` 插入酒馆 textarea；无内容 toast「BUNNY 模式需要先在输入框打字」
- 新增：carrot 启动时 ping `/api/plugins/carrot/ping`，不通且未 dismiss 时弹引导面板
- 新增：hook 酒馆 `#send_but` click 和 textarea Enter（注意只 hook 主聊天输入框，不要影响其他扩展的输入框）

**format-renderer.js**（[D:/OneDrive/dcbot/carrot/format-renderer.js](D:/OneDrive/dcbot/carrot/format-renderer.js)）

- 注册新规则：匹配 `\[link\|([^|]+)\|([^|]*)\|([^\]]*)\](https?://[^\s]+)\[/link\]`
- 渲染成左图右文 DOM（参考 BunnyOS 卡片视觉）
- 只对**插件安装后新发的、用户消息**渲染（历史消息忽略）；用 `data-carrot-rendered` 属性防重渲染
- 封面 URL 是 plugin 后端缓存的本地路径，形如 `/api/plugins/carrot/covers/<hash>.jpg`
- 封面 `<img onerror>` fallback 默认图标
- 卡片移动端等比缩小（CSS @media）

**drawer.js**（[D:/OneDrive/dcbot/carrot/drawer.js](D:/OneDrive/dcbot/carrot/drawer.js)）

齿轮设置面板里加新折叠区「**API**」，含三个子节：

1. **语音 STT**（本期预留，不接逻辑）：Siliconflow Key + Groq Key 输入框 + 测试按钮 + 折叠"如何获取 Key"说明
2. **链接解析**：plugin 状态指示（绿色已启用 / 灰掉 + 红色顶条「需要启用后端」+ "重开引导"按钮）；底部"检测 plugin 状态"手动 ping 按钮；"重新启用链接解析"按钮（如果 disabled）
3. **图片视觉**（v8.2 预留占位，本期可以只放标题"敬请期待"）

### 2.4 链接卡片样式细则

```
┌────────────────────────────────────────────┐
│ [80×80] │ 标题（最多 2 行）                │
│  封面   │ 简介（最多 2 行，灰色小字）       │
│  图     │ 🌐 站点名                       │
└────────────────────────────────────────────┘
```

- 卡片占一整行（block），URL 原文被替换
- 整体 cursor: pointer，点击新标签页（`target="_blank" rel="noopener"`）
- 配色：白色半透明背景 + 圆角 8px + 细边框，跟 carrot 毛玻璃主题协调
- 移动端（max-width 480px）：缩略图 60×60，字体降一档，仍左图右文

---

## 3. Plugin 后端规范

### 3.1 ST Server Plugin 集成（已调研 ✅ 2026-06-23）

**调研依据**：<https://docs.sillytavern.app/for-contributors/server-plugins/> + ST release 源码

| 项 | 实情 |
|---|---|
| 安装位置 | `<ST_ROOT>/plugins/<id>/` |
| 启用开关 | `config.yaml` 的 `enableServerPlugins: true` |
| 入口文件 | 子目录形式按优先级：`package.json` "main" → `index.js` → `index.mjs` |
| 必须导出 | `init(router)` + `info: {id, name, description}`；`exit()` 可选 |
| init 接收 | **裸的** `express.Router()`，**没有任何中间件**（包括 body parser，得自己加） |
| 路由前缀 | `/api/plugins/<id>/<route>`（id 来自 `info.id`） |
| 沙箱 | 无，plugin 拥有完整 fs/网络访问 |
| 热加载 | 不支持，改了 plugin 代码必须重启 ST 服务器进程 |
| 模块系统 | CommonJS (.js) 或 ES Modules (.mjs)，二选一 |

**carrot plugin 入口形态**（实现时按此结构）：

```js
// plugin/index.js (CommonJS)
const express = require('express');   // 复用 ST 进程的 express，不用自带依赖

const info = {
  id: 'carrot',                                          // → /api/plugins/carrot/*
  name: 'Carrot Backend',
  description: '为 carrot 扩展提供链接解析、封面缓存等后端能力',
};

async function init(router) {
  router.use(express.json({ limit: '1mb' }));            // !! 必须自己加 body parser
  router.get('/ping', (req, res) => res.json({ ok: true, version: '8.0' }));
  router.post('/link-preview', require('./link-preview'));
  router.get('/covers/:filename', require('./cover-cache').serve);
}

async function exit() {}

module.exports = { init, exit, info };
```

对外 API 路径锁定：
- `GET  /api/plugins/carrot/ping`
- `POST /api/plugins/carrot/link-preview`
- `GET  /api/plugins/carrot/covers/<hash>.jpg`

### 3.2 `/ping` 接口

```
GET /api/plugins/carrot/ping
→ 200 { ok: true, version: "8.0" }
```

### 3.3 `/link-preview` 接口

**单 URL 形式**（与 BunnyOS 一致；前端需要多 URL 时自己并发调多次）：

```
POST /api/plugins/carrot/link-preview
body: { url: "https://...", rawText: "可选，整条消息原文" }
→ 200 {
  url: "最终 URL（可能 redirect 后变了）",
  title: "...",
  description: "...",
  image: "原始封面 URL",
  imageLocal: "/api/plugins/carrot/covers/<hash>.jpg",   // 本地缓存路径，前端用这个
  siteName: "微信公众号" | "小红书" | "抖音" | "<域名>",
  source: "og" | "xhs-state" | "wechat-html" | "douyin-html" | "jina" | "fallback" | ...,
  limitedReason: "解析失败原因（可能为空）"
}
→ 400 { error: "URL 格式无效" | "禁止访问内网地址" | "缺少 URL" }
→ 502 { error: "抓取超时" | "抓取失败" }
```

**rawText 字段用途**：当解析失败时，从用户消息原文里清洗出"分享文案"做兜底标题，特别针对小红书"复制本条信息...打开 App 查看"这种场景。

**实现要点**（直接搬 [BunnyOS server.js:1909](D:/OneDrive/BunnyOS/server.js:1909)）：

- SSRF 防护：拒绝 localhost / 127.x / 10.x / 192.168.x / 169.254.x / 172.16-31.x / fe80::/ ::1
- 协议白名单：只允许 http / https
- 跟随重定向上限 5
- 用域名嗅探 + UA 切换：
  - `mp.weixin.qq.com` → 微信公众号 UA
  - `xiaohongshu.com` / `xhslink.com` / `xhscdn.com` → 小红书 UA
  - `douyin.com` / `iesdouyin.com` / `douyinpic.com` / `amemv.com` → 抖音 UA
  - 其他 → 通用 Chrome UA
- 解析 OG / Twitter meta，三家特化页面有自己的提取规则（看 BunnyOS 源码）
- 单 URL 超时 15s，并发 5
- 拿到 cover URL 后**后端代理下载**到本地 `<酒馆>/plugins/carrot/covers/<sha256(url).slice(0,16)>.<ext>`
- 内存 URL→result 缓存，LRU 上限 5 条，TTL 24h
- 磁盘 covers 文件 LRU 上限 5 个（超出删除最早访问的，并删除对应内存缓存）

### 3.4 `/covers/<filename>` 接口

静态文件服务，从 `<酒馆>/plugins/carrot/covers/` 读图返回。注意防路径穿越（filename 必须匹配 `^[a-f0-9]{16}\.(jpg|png|webp|gif)$`）。

---

## 4. 安装脚本规范

### 4.1 install.cmd（Windows）

伪代码：

```bat
@echo off
setlocal

:: 1. 定位酒馆根：当前目录 → ../SillyTavern → 询问
set ST_ROOT=
if exist "config.yaml" if exist "server.js" set ST_ROOT=%CD%
if "%ST_ROOT%"=="" if exist "..\SillyTavern\config.yaml" set ST_ROOT=..\SillyTavern
if "%ST_ROOT%"=="" (
  echo 未找到酒馆根目录。请把本脚本放到酒馆根目录运行，或修改脚本指定路径。
  pause
  exit /b 1
)

:: 2. 改 config.yaml：enableServerPlugins: true（PowerShell sed）
powershell -Command "(Get-Content '%ST_ROOT%\config.yaml') -replace '^enableServerPlugins:\s*false', 'enableServerPlugins: true' | Set-Content '%ST_ROOT%\config.yaml'"

:: 3. 建软链：plugins\carrot → <扩展目录>\carrot\plugin
::    扩展目录约定为：<ST_ROOT>\data\default-user\extensions\carrot\plugin
::    （多用户场景可能要扫 data\*\extensions\carrot\plugin）
mklink /D "%ST_ROOT%\plugins\carrot" "%ST_ROOT%\data\default-user\extensions\carrot\plugin"
if errorlevel 1 (
  echo mklink 失败 —— 请右键以管理员身份运行本脚本
  pause
  exit /b 1
)

echo 安装完成。请重启酒馆服务器（关掉跑 node 的黑窗口，重新启动）。
pause
```

**注意**：扩展目录的实际位置可能不是 `data/default-user/extensions/carrot`。要先扫 `data/*/extensions/carrot` 找出来。

### 4.2 install.sh（Linux / Mac / Termux）

伪代码：

```sh
#!/bin/bash
set -e

# 1. 定位酒馆根
ST_ROOT=""
for candidate in "$PWD" "$HOME/SillyTavern" "/data/SillyTavern" "/opt/SillyTavern"; do
  if [ -f "$candidate/config.yaml" ] && [ -f "$candidate/server.js" ]; then
    ST_ROOT="$candidate"
    break
  fi
done

# Termux 特殊路径
if [ -z "$ST_ROOT" ] && [ -d "$HOME/SillyTavern" ]; then
  ST_ROOT="$HOME/SillyTavern"
fi

if [ -z "$ST_ROOT" ]; then
  echo "未找到酒馆根目录"; exit 1
fi

# 2. 改 config.yaml
sed -i.bak 's/^enableServerPlugins:.*false/enableServerPlugins: true/' "$ST_ROOT/config.yaml"

# 3. 找扩展目录并建软链
EXT_PLUGIN=$(find "$ST_ROOT/data" -maxdepth 4 -type d -name "plugin" -path "*/extensions/carrot/plugin" | head -1)
if [ -z "$EXT_PLUGIN" ]; then
  echo "未找到 carrot 扩展目录"; exit 1
fi
mkdir -p "$ST_ROOT/plugins"
ln -sfn "$EXT_PLUGIN" "$ST_ROOT/plugins/carrot"

echo "安装完成。请重启酒馆服务器（kill 掉 node 进程，重新启动）"
```

### 4.3 uninstall.cmd / uninstall.sh

- 删除 `<ST_ROOT>/plugins/carrot` 软链
- 删除 `<ST_ROOT>/plugins/carrot/covers/` 缓存目录（如果存在为真实目录而非软链下的子目录）
- 询问"是否恢复 config.yaml 的 enableServerPlugins: false"（Y/N，默认 N，因为可能有其他 plugin 在用）

---

## 5. 数据存储

| 数据 | 位置 | 备注 |
|---|---|---|
| 前端配置（开关、API key、disabled 标记） | `extension_settings.carrot.*` | 跟酒馆现有约定一致，参考 [script.js:22-28](D:/OneDrive/dcbot/carrot/script.js:22) |
| URL 解析结果缓存 | plugin 进程内存（LRU 5） | TTL 24h |
| 封面图缓存 | `<ST_ROOT>/plugins/carrot/covers/<hash>.<ext>` | LRU 5 个文件 |
| 引导面板 dismiss 状态 | `extension_settings.carrot.linkParse.disabled` | 永久 |
| 引导面板 dontShowAgain（仅本次跳过） | `extension_settings.carrot.linkParse.guideSnoozeUntil` | 暂未启用，留口子 |

---

## 6. 工作顺序（开发执行清单）

每完成一项 commit + push。

| # | 任务 | 输出文件 | 验证方式 | 状态 |
|---|---|---|---|---|
| 1 | **调研 ST plugin API**（不写代码） | 本文档 §3.1 补充结论 | 看官方源码或社区示例 | ✅ |
| 2 | 建 `plugin/manifest.json` + `plugin/index.js` 脚手架，含 `/ping` | `plugin/*` | 本地手动建软链测试 ping 通 | ✅ |
| 3 | 写 `install.cmd` + `install.sh` + `uninstall.*` | `plugin/install/*` | 用户本地实测 | ✅ |
| 4 | 前端：carrot 启动 ping + 引导面板（首次未启用时弹） | `backend.js`、`config.js`、`script.js` | 模拟 plugin 不通时弹窗 | ✅ |
| 5 | 写 `plugin/link-preview.js`：抄 BunnyOS link-preview，改 express → router | `plugin/link-preview.js` | postman 调 /link-preview | ✅ |
| 6 | 写 `plugin/cover-cache.js`：封面下载 + LRU + `/covers/<id>` 静态服务 | `plugin/cover-cache.js` | 实测小红书/微信 URL | ✅ |
| 7 | 前端：hook send_but + Enter，URL 提取 + 调后端 + 原地替换 + loading | `link-parser.js`、`send-hook.js`、`script.js`、`style.css` | 在酒馆贴 URL 发送 | ✅ |
| 8 | 前端：`format-renderer.js` 加 `[link\|...]` token 渲染规则 | `format-renderer.js`、`link-parser.js`、`style.css` | 看渲染卡片 | ✅ |
| 9 | 前端：删 post/bunny 子按钮 + footer 加 robot 图标 | `ui.js`、`script.js`、`style.css` | 看面板 | ✅ |
| 10 | 前端：齿轮 API 折叠区（语音预留 + 链接解析状态 + 视觉预留） | `drawer.js`、`config.js` | 看设置面板 | ✅ |
| 11 | 更新 README.md，加「启用后端」+「卸载」两节 | `README.md` | 阅读 | ✅ |
| 12 | 改 manifest.json version → 8.0；打 tag v8.0 | `manifest.json` | git tag | ✅ |
| 13 | plugin 加 /restart + 进程管理器检测（pm2/systemd） | `plugin/index.js`、`backend.js` | 在 pm2 环境下点重启按钮 | ✅ |
| 14 | 齿轮加"重启后端"按钮（仅 managed 环境显示） | `drawer.js` | 看 UI | ✅ |
| 15 | install 脚本输出根据环境检测的重启指引 | `plugin/install/install.{cmd,sh}` | 跑脚本看输出 | ✅ |

---

## 7. 关键 API 与事件参考

### 7.1 酒馆扩展能用的 API（已知）

- `import { extension_settings, saveSettingsDebounced } from '...extensions.js'`
- `getContext()` —— 拿 chat、character、event 等
- `eventSource.on(event_types.XXX, handler)` —— 事件监听
- 主输入框：`#send_textarea`
- 主发送按钮：`#send_but`

### 7.2 需要在调研阶段确认的点

- ST plugin 加载时序（在哪个生命周期初始化）
- plugin 是否能访问酒馆的用户数据（chat、setting）
- plugin 报错是否会让酒馆崩
- 多 ST 实例共存时 plugin 路径冲突

---

## 8. 常见陷阱 / 避坑提示

1. **酒馆扩展目录可能在 `data/<user>/extensions/carrot`，user 不一定是 default-user**。安装脚本要扫所有用户目录。
2. **Windows mklink 需要管理员或开发者模式**，普通用户跑 cmd 会失败。脚本检测到失败要明确报错"右键管理员运行"。
3. **config.yaml 的 sed 改写**：用户可能已经把 `enableServerPlugins: true`（被其他 plugin 用），脚本要先检测再决定改不改；用户也可能注释了这行，要兼容。建议用 yaml parser 而不是正则，但脚本依赖少更好——折中是先用 grep 检测当前状态。
4. **format-renderer 重复渲染**：消息可能被酒馆多次重渲染（编辑、流式更新），新 token 渲染必须 idempotent。加 `data-carrot-link-rendered="1"` 属性防重。
5. **send hook 的优先级**：其他扩展（如 Quick Reply）可能也 hook 同样事件，要避免冲突。优先使用 `eventSource.on` 而不是直接 patch DOM 事件，如果 eventSource 不行再降级 DOM。
6. **URL 提取要小心 markdown 链接**：`[文字](https://x.com)` 里的 URL **要不要解析？决策为：不在 URL 提取范围**（用户已经手写了描述，不需要再解析）。正则要排除 `\]\(.*?\)` 的情况。
7. **封面 URL 字符串长度**：BunnyOS 给 cover URL 是绝对路径含域名。carrot 这里用相对路径 `/api/plugins/carrot/covers/<hash>.jpg` 即可，更短，token 也省。
8. **缓存淘汰要顺序一致**：内存 URL→result 缓存和磁盘 covers 文件必须同步淘汰，避免内存说有但磁盘没了。

---

## 9. 后续版本占位

- **v8.1 语音输入**：抄 [BunnyOS media.js:272-523](D:/OneDrive/BunnyOS/apps/QQ/scripts/media.js:272)，在酒馆 textarea 旁加麦克风按钮。前端直传 Groq/硅基流动，不走 plugin。API key 走 v8.0 已建好的齿轮 API 折叠区「语音 STT」小节。
- **v8.2 图片 AI 视觉**：仍要走酒馆原生附件 API（hook `CHAT_COMPLETION_PROMPT_READY` 可选）。详细评估见对话历史。

---

## 10. 联系方式 / 上下文

- 用户：GDOG0622（GitHub），ashmaltz0905@gmail.com
- 用户偏好（来自 memory）：
  - 写完代码直接跑 push 命令，不要只提议
  - 现在沟通用中文
  - 不喜欢冗长的解释，直接给结果
- 用户对 BunnyOS 项目熟悉（自己写的），对 carrot 熟悉（自己维护）

---

> **更新日志**
> - 2026-06-23 初版（Opus 4.7 撰写）
