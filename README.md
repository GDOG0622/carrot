# 🥕 胡萝卜快速输入面板 (Carrot Input Panel)

> SillyTavern 扩展 — 快速插入格式化内容 & 聊天增强工具箱  
> By **BunnY** · 搭配 Bunnyhole Lab 食用 · v7.0

一个功能丰富的 SillyTavern 扩展，提供快速输入面板、内置正则替换引擎、头像框装饰、主题自定义、定时指令等多种实用功能。

---

## 功能概览

| 模块 | 说明 |
|------|------|
| **快速输入面板** | 浮动按钮 + 多标签面板，一键插入格式化内容 |
| **内置正则替换** | 全部规则默认开启，通过扩展面板一键开关 |
| **扩展面板控制** | 在 ST 扩展设置区直接控制浮标显隐、自定义图标、正则开关 |
| **主题系统** | 毛玻璃 UI，可自定义配色方案 |
| **头像 & 头像框** | 为消息气泡添加角色/用户头像及装饰框 |
| **定时指令** | 后台 Worker 计时，到点自动执行斜杠命令 |
| **Unsplash 集成** | 根据描述自动拉取配图 |

---

## 安装

### 方法一：通过 SillyTavern 扩展管理器

1. 打开 SillyTavern → 扩展 → 管理扩展
2. 点击"安装扩展"
3. 输入仓库地址并安装

### 方法二：手动安装

1. 下载本仓库所有文件
2. 将文件夹放入 SillyTavern 的第三方扩展目录。installForAll 通常在：
   ```
   SillyTavern/public/scripts/extensions/third-party/carrot/
   ```
   单用户安装通常在：
   ```
   SillyTavern/data/<user>/extensions/third-party/carrot/
   ```
3. 重启 SillyTavern

---

## 使用方法

### 扩展面板设置

安装后，在 SillyTavern 的 **扩展设置面板** 中会出现「🥕 胡萝卜面板」下拉区域，包含：

- **显示浮标** — 勾选控制浮动按钮的显示/隐藏
- **内置正则** — 勾选启用/禁用聊天正则替换（默认开启）
- **浮标图片直链** — 填入图片 URL 后，浮标将变为透明背景并显示该图片

### 快速输入面板

点击页面上的浮动胡萝卜 🧀 按钮打开面板（可拖拽定位）。

面板主栏包含常用输入模式：

| 类型 | 输出格式 | 示例 |
|------|----------|------|
| 纯文本 | `"内容"` | `"你好"` |
| 图片 | `[描述.jpg]` | `[风景.jpg]` |
| 视频 | `[描述.mp4]` | `[猫咪.mp4]` |
| 音乐 | `[描述.mp3]` | `[晚风.mp3]` |
| 钱包/转账 | `[平台|金额|留言]` | `[微信|50|奶茶]` |

底部麦克风用于语音输入，输出格式：`=录音时长|识别文本=`。

Emoji 按钮会打开表情面板。最左侧是 Emoji，其后是自定义表情包合集；点击表情包会直接插入对应 `[描述]`。

添加自定义表情包格式（每行一个）：
```
描述:图片链接
开心:https://example.com/happy.png
```

---

## 进阶功能

### 内置正则替换

对聊天消息进行实时正则替换和样式增强，所有规则默认启用。

内置规则包括：时间戳高亮、群聊气泡（我方/对方）、消息样式等。

通过扩展面板中的「内置正则」勾选框一键全局开关。

### 主题自定义

毛玻璃（Frosted Glass）风格界面，可调节：

- 强调色、面板背景色、文字颜色
- 输入框背景、标签栏背景
- 预设主题 + 自定义配色保存

### 头像 & 头像框

- 为聊天消息自动应用角色/用户头像
- 支持添加装饰性头像框（透明 PNG 叠加）
- 框体参数可调：大小（100%-200%）、X/Y 偏移（-20% ~ 20%）
- 配置档管理：针对不同角色保存不同设置

### 定时指令

- 设置时/分/秒倒计时
- 到点自动执行指定斜杠命令
- 支持循环执行
- 后台 Web Worker 保证计时精准

### Unsplash 图片集成

- 根据图片描述自动从 Unsplash 获取配图
- 本地缓存 + 重试机制
- 需配置 Unsplash Access Key

### 链接卡片（v8.0 新增，需后端）

- 在消息里贴 URL，发送时自动解析为带封面/标题/简介的卡片
- 支持微信公众号、小红书、抖音、微博特化解析；其它站点走 OG 抓取
- 封面图后端代理下载，规避 CDN 防盗链
- 单 URL 超时 15s，整条消息总 30s，最多并行 5 个
- 代码块 ` ``` ` 里的 URL 不解析
- 仅在用户消息渲染为卡片，AI 看到的是 `<link>...</link>` 结构化块，包含分享文案、标题、正文、评论和图片代码
- 链接封面当前以文本/URL 形式进入上下文，不会自动作为多模态图片附件发送给 AI

---

## 启用后端（v8.0+）

链接解析、封面缓存等功能需要一个 **SillyTavern 服务器插件**。安装一次即可。

### 一键启用

1. 打开酒馆扩展目录里的 `carrot/plugin/install/` 文件夹
2. 双击运行对应脚本：
   - **Windows**：`install.cmd`
   - **Linux / Mac / Termux**：`bash install.sh`
     若你在服务器终端里，不确定扩展目录在哪，先用下面这组命令自动查找：
     ```sh
     cd /root/SillyTavern
     EXT_INSTALL=$(find "$PWD/public/scripts/extensions" "$PWD/data" -path '*/carrot/plugin/install/install.sh' -type f 2>/dev/null | head -n 1)
     bash "$EXT_INSTALL" "$PWD"
     ```
3. 脚本会自动完成：
   - 定位酒馆根目录（扫常见路径 + 当前位置）
   - 把 `config.yaml` 的 `enableServerPlugins` 改为 `true`
   - 把 `carrot/plugin/` **复制**到 `<酒馆根>/plugins/carrot/`（v8.0.2+ 不再用软链，Windows 不需要管理员）
   - carrot 升级后可在设置面板的「API」里点「同步后端」，也可以重跑 install 脚本手动同步
4. **重启酒馆服务器进程**：
   - ⚠️ 这里指**关掉跑 `node server.js` 的命令行黑窗口重新启动**，不是按 F5 刷新网页！
   - pm2 用户：`pm2 restart sillytavern`
   - systemd 用户：`sudo systemctl restart sillytavern`
   - Termux 用户：Ctrl+C 停掉 → 重新跑 `node server.js`
5. 重启后回到酒馆，carrot 设置面板的「API」标签会显示绿色「已启用」

### 更新后端

v8.0.8 起，carrot 设置面板 → API 里有：

- **同步后端**：把新版 `carrot/plugin/` 复制到 `<酒馆根>/plugins/carrot/`，所有环境可用；同步后需要重启酒馆服务器进程才会加载新版。
- **同步并重启**：仅在 pm2 / systemd 环境显示，会先同步后端，再退出 node 进程等待管理器自动拉起。

Docker、Termux、Windows、裸 `node server.js` 无法安全判断是否会自动拉起，所以只提供同步，重启请按你的部署方式手动完成。

### 语音输入

在 carrot 面板底部「撤回」左侧点击麦克风开始录音，再点一次停止，识别文本会插入酒馆主输入框。
输出格式为 `=MM:SS|识别文本=`，其中 `MM:SS` 来自实际录音时长。
浏览器要求 HTTPS 或 localhost 才允许麦克风权限；如果你用公网 IP 的 HTTP 页面访问，语音输入会被浏览器拦截。

### Jina 兜底

链接解析小节里可填写 Jina Reader Key。小红书等站点直抓受限时，carrot 会用 Jina 作为兜底解析；不需要配置 BunnyOS 那种第三方解析入口。

### 手动启用（脚本失败时）

1. 编辑 `<酒馆根>/config.yaml`，找到或添加：
   ```yaml
   enableServerPlugins: true
   ```
2. 复制 plugin 目录到酒馆 plugins 目录：
   ```sh
   # Linux/Mac/Termux/VPS
   cp -r /path/to/SillyTavern/data/<user>/extensions/third-party/carrot/plugin \
         /path/to/SillyTavern/plugins/carrot

   # Windows
   xcopy /E /I /Y "C:\SillyTavern\data\default-user\extensions\third-party\carrot\plugin" "C:\SillyTavern\plugins\carrot"
   ```
3. 重启酒馆服务器进程

### 不想启用后端

仍然可以使用 carrot 的所有其它功能。链接解析会自动跳过，URL 原样发送。
若关闭后想再启用，到设置 → 🥕 胡萝卜面板 → API → 「重开引导」即可。

---

## 卸载后端

1. 打开 `carrot/plugin/install/` 文件夹
2. 运行对应脚本：
   - **Windows**：`uninstall.cmd`
   - **Linux / Mac / Termux**：`bash uninstall.sh`
3. 脚本会：
   - 删除复制到 `<酒馆根>/plugins/carrot` 的后端 plugin
   - 删除封面缓存目录
   - 询问是否把 `enableServerPlugins` 改回 `false`（若你还有其它 plugin 在用，选 N）
4. 重启酒馆服务器进程生效

完全卸载 carrot 扩展请通过酒馆扩展管理器移除。

---

## 项目结构

```
carrot/
├── manifest.json          # 扩展清单
├── script.js              # 主入口（动态导入各模块）
├── ui.js                  # 面板 DOM 构建
├── drawer.js              # 扩展设置面板（含 v8.0 API 折叠区）
├── config.js              # 设置存储 / 迁移
├── format-renderer.js     # 消息渲染（含 v8.0 链接卡片）
├── backend.js             # v8.0 后端 plugin 探测 + 引导面板
├── send-hook.js           # v8.0 拦截发送，调链接解析
├── link-parser.js         # v8.0 URL 提取 + 调 plugin /link-preview
├── stickers.js            # 表情包逻辑
├── unsplash.js            # Unsplash 配图
├── selects.js             # 渲染辅助
├── style.css              # 样式
├── setting/               # 子模块（主题 / 头像）
└── plugin/                # v8.0 后端（SillyTavern server plugin）
    ├── index.js           # plugin 入口（注册 /api/plugins/carrot/*）
    ├── manifest.json
    ├── link-preview.js    # 链接解析（OG/微信/小红书/抖音 + Jina 兜底）
    ├── cover-cache.js     # 封面下载 + LRU + 静态服务
    └── install/           # 安装/卸载脚本（Win/Linux/Mac/Termux）
```

---

## 技术特性

- 纯原生 JavaScript（ES6 模块），无框架依赖
- LocalStorage 持久化存储所有配置
- Web Worker 后台计时 + Service Worker 通知唤醒
- MutationObserver 实时监听聊天消息变动
- 响应式设计，适配桌面与移动端
- 模块化设置系统，各功能独立管理
- 集成 SillyTavern `inline-drawer` 扩展面板

## 系统要求

- SillyTavern >= 1.10.0
- 现代浏览器（Chrome / Edge / Firefox）

---

## 许可证

MIT License

---

## 问题反馈

如遇问题或有建议，请在仓库 Issues 页面提出。
