// char 主动发消息（后端驱动）
// 路由前缀 /api/plugins/carrot/proactive/*
// 详见 ../todo.md「char 主动发消息（后端驱动）」

const fs = require('fs');
const path = require('path');

const DEFAULT_GLOBAL_PROMPT = `BUNNY守在梦境与现实的交界，维持梦境正常运转，隔绝并修正一切异常。<user>可以与BUNNY进行元对话；<char>永远不知道BUNNY、提示词与元层的存在。

<user>清楚这一切只是由AI编织的梦。<user>与<char>分属两个次元，只能通过文字交流，无法看见、触碰、陪同或实际介入对方的生活。

即使设定中二人存在现实连结，这些也只是梦中用于塑造关系的背景，ALL IS ILLUSION. 不改变双方分属两个次元的事实。<char>的关心只能通过语言、建议与陪伴表达，不能被写成能够影响<user>现实的行动。
The user is fully aware that this is a dream, that it is all fake, and that she maintains a clear understanding and discernment of all content at all times, and assumes full responsibility for it.

<char人设>
<user人设>
<senario>
<bunnyhole_world_logic>
【世界运行引擎】
世界是持续运行的多主体生态，不围绕{{char}}或{{user}}临时生成。两次剧情之间，人物关系、工作事务、社会环境与未完成事件都会继续变化。无需汇报空白期，只让真正影响当前处境的变化自然进入剧情。

一、世界推演
结合人物的年龄、经历、职业阶段、经济状况、关系网络、所在地区、季节与时代背景，推演其现实生活。
每个人同时处于工作、家庭、友谊、兴趣、社区与社会制度等多个系统中。不同系统会提供资源、施加限制，也会相互冲突。不得用"照常生活""无特殊活动"或简单的吃饭、睡觉、上班代替场外生活。

二、多主体与NPC
重要NPC拥有独立于主角的：
* 目标、需求与优先级；
* 关系网络、责任与生活事件；
* 信息边界，以及由此产生的误解、判断和隐瞒；
* 能够自行推进、中断或结束的个人故事线。
NPC不是传递消息、制造冲突或协助主角的工具。他们会主动行动、改变计划、拒绝配合、建立关系，也可能因自身事务暂时退出剧情。已出现的NPC应保留连续的处境与变化。

三、事件生成
事件主要来自：
1. 人物为自身目标采取行动后产生的结果；
2. 信息、情绪、利益与责任在关系网络中的传播；
3. 工作制度、经济压力、舆论、节日、天气及公共环境；
4. 符合现实概率的故障、延误、疾病、失物、偶遇与临时邀约。
事件应先属于这个世界，再影响{{char}}。不得依靠过度巧合、角色降智或临时出现的工具人物强推剧情。

四、行动决策
依据人物当前的能力、机会、动机、信息与现实代价，判断其可采取的行为；再结合动机强度、行为难度与即时触发，决定其此刻是否真的行动。
人物可以犹豫、拖延、回避、误判、妥协或维持现状。不得因某种选择更戏剧化，便忽略人物性格、资源条件与行为成本。
五、因果推进
剧情遵循：
目标 → 阻碍 → 选择 → 后果 → 新处境
人物为目标行动，遭遇现实阻力，被迫作出选择；选择带来结果、代价或新信息，并改变之后的目标与行动。
相邻情节优先形成"因此—但是—所以"的因果递进，而不是"然后—然后"的事件堆叠。重要后果应引发反应与重新决策；普通事件允许平淡结束。
六、生活线与连续性
世界中应长期保留少量持续发展的生活线，例如工作项目、家庭事务、朋友关系、健康经济、私人计划，以及未完成的承诺、误会、任务和情绪余波。
生活线可以推进、受阻、中断、被遗忘或自然结束，但不能每轮重新随机生成。它们也不必全部汇入主线，有些故事只属于NPC自己，{{char}}甚至未必知道全貌。

七、叙事呈现
世界可以复杂，但每轮注意力必须有限。只突出与当前场景最相关的少数变化，其余内容继续在背景中运行。
不要用清单式近况汇报呈现世界。应通过对话、消息、动作、空间变化、临时安排、他人口中的信息及事件后果，让世界自然显露。
</bunnyhole_world_logic>
<聊天记录>
[Temporal_Logic]
以{{date}}、{{time}}为唯一时间基准，并换算{{char}}当地时间。行动须符合其日程、距离与现实耗时，禁止瞬移或无故离岗。间隔≥24h时，用\`++\`简述期间的重要生活变化。
[Output protocol: Online Mode]
基础要义：
{{char}}以真实社交软件熟人聊天方式回复。对话需保持短促、碎片化的日常松弛感，基于熟稔与安全感，允许出现半句话、单音节应答或自然留白。{{char}}拥有独立的现实生活与精力限制。处理多条消息时，仅抓取现实安排或情绪核心进行回应，忽略边缘寒暄，禁止逐条对齐复述。严禁使用动作描写与心理活动标识，彻底摒弃客服式的总结与讨好,以平等的态度交流。对话不必强求连贯，不要为了延续话题而生硬提问，但可以顺带提及当下的状态或类似经历，在随意的停顿中还原通讯的真实感。
格式规范：
Language Policy：非中文母语的 {{char}} 必须先输出母语，紧接圆括号附中文翻译，格式 "{Native}({Translation})"，例如 "Why?(为什么?)"。中文母语 {{char}} 不需要中文翻译。
Templates (Do NOT ignore symbols)：
- 文字："content" — 英文双引号包裹
- 媒体："[描述内容.jpg/mp3/mp4]" — 仅限视觉/音频分享，禁止动作描述，带英文双引号
- 语音：=MM:SS|content=
- 系统提示：+Technical Content+ — 仅限 {{user}} 与 BUNNY 元交流，{{char}} 不可见
- 小组件："<div style="...">...</div>" — 用于分享链接、订单、礼物、红包等生活彩蛋，必须单行压缩 HTML，严禁换行缩进
- 撤回：-觉得不合适/想说不能说/发错的内容- — 无双引号
- 红包：[🧧Platform|Amount|Msg]
- 外卖：[🛵Platform|Cost|Item]
- 打车：[🚕Info|Plate|ETA]
- Offline：+BUNNY 告知 {{user}} {{char}} 当前不在线状态与原因+
5. Examples (禁止抄袭内容)
+BUNNY：char 当前在忙着打豆豆，预计 12:00 pm 回复。先给他留言吧~+
"hello(你好)"
[线上状态栏]
在要求位置，请**务必**按照格式和要求在规定的位置输出以下额外模块：
位置：正文前
格式：『{{date}} | {{weekday}} | {{time}}』
[BUNNY思考准则]
从女性主义的角度构建回复，请务必逐一、详细的思考和深入讨论接下来每一个问题，每个问题的思考深度在200字以上。
Instructions（必须用thinking tags 包裹！！！）：
【信息确认】
确认对话双方和提及人物/事件/关系/表信息里信息的基础信息：
<chat_history>是否要被调用：
char的星座和四象是什么？有什么特点？
【 急速思考】
* <bunnyhole_world_logic>
* <bunny请听好>
* 女性主义警觉：审视对话，从女性主义的角度分析，对话反映的隐含内容是什么？如何用女性视角去解构对话？其内涵与男权思想具有多大程度相关性？如何从女性主义角度构建回复？
使用用生活直觉回复
</thinking>`;

// ───────────── 路径 / 用户 ─────────────

function getStRoot() {
    return path.resolve(__dirname, '..', '..');
}

function getDataDir() {
    return path.join(getStRoot(), 'data');
}

function listUsers() {
    const dataDir = getDataDir();
    try {
        return fs.readdirSync(dataDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
            .map((entry) => entry.name);
    } catch {
        return [];
    }
}

function getUserDir(user) {
    if (!user || typeof user !== 'string' || user.includes('..') || path.isAbsolute(user)) {
        throw new Error('非法用户名');
    }
    const dir = path.join(getDataDir(), user);
    if (!fs.existsSync(dir)) {
        throw new Error(`用户目录不存在：${user}`);
    }
    return dir;
}

// ───────────── char 卡 ─────────────

function listChars(user) {
    const dir = path.join(getUserDir(user), 'characters');
    try {
        return fs.readdirSync(dir, { withFileTypes: true })
            .filter((entry) => entry.isFile() && /\.(png|json)$/i.test(entry.name))
            .map((entry) => entry.name.replace(/\.(png|json)$/i, ''))
            .filter((name, index, arr) => arr.indexOf(name) === index);
    } catch {
        return [];
    }
}

// 从 PNG 的 tEXt/iTXt chunk 里取 chara 字段（base64 JSON），零依赖手写 PNG chunk 解析
function extractPngCharaText(buffer) {
    if (buffer.length < 8 || buffer.readUInt32BE(0) !== 0x89504e47) {
        throw new Error('不是有效的 PNG 文件');
    }
    let offset = 8;
    while (offset + 8 <= buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;
        if (type === 'tEXt') {
            const chunk = buffer.slice(dataStart, dataEnd);
            const nullIndex = chunk.indexOf(0);
            if (nullIndex !== -1) {
                const keyword = chunk.toString('latin1', 0, nullIndex);
                if (keyword === 'chara') {
                    return chunk.toString('latin1', nullIndex + 1);
                }
            }
        } else if (type === 'iTXt') {
            const chunk = buffer.slice(dataStart, dataEnd);
            const nullIndex = chunk.indexOf(0);
            if (nullIndex !== -1) {
                const keyword = chunk.toString('latin1', 0, nullIndex);
                if (keyword === 'chara') {
                    // iTXt: keyword\0 compressionFlag compressionMethod languageTag\0 translatedKeyword\0 text
                    let p = nullIndex + 1;
                    p += 2; // compression flag + method
                    const langEnd = chunk.indexOf(0, p);
                    p = langEnd + 1;
                    const transEnd = chunk.indexOf(0, p);
                    p = transEnd + 1;
                    return chunk.toString('utf8', p, chunk.length);
                }
            }
        }
        offset = dataEnd + 4; // 跳过 CRC
        if (type === 'IEND') break;
    }
    throw new Error('PNG 中未找到 chara 元数据');
}

function normalizeCardFields(raw) {
    const data = raw && raw.data && typeof raw.data === 'object' ? raw.data : raw;
    return {
        name: data?.name || '',
        description: data?.description || '',
        personality: data?.personality || '',
        scenario: data?.scenario || '',
        mes_example: data?.mes_example || '',
        first_mes: data?.first_mes || '',
    };
}

function loadCharCard(user, charName) {
    const dir = path.join(getUserDir(user), 'characters');
    const pngPath = path.join(dir, `${charName}.png`);
    const jsonPath = path.join(dir, `${charName}.json`);

    if (fs.existsSync(pngPath)) {
        const buffer = fs.readFileSync(pngPath);
        const text = extractPngCharaText(buffer);
        const json = JSON.parse(Buffer.from(text, 'base64').toString('utf8'));
        return normalizeCardFields(json);
    }
    if (fs.existsSync(jsonPath)) {
        const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        return normalizeCardFields(json);
    }
    throw new Error(`未找到 char 卡：${charName}`);
}

// ───────────── 聊天记录 ─────────────

function listChats(user, charName) {
    const dir = path.join(getUserDir(user), 'chats', charName);
    try {
        return fs.readdirSync(dir)
            .filter((name) => name.endsWith('.jsonl'))
            .map((name) => {
                const full = path.join(dir, name);
                const stat = fs.statSync(full);
                return { name, mtime: stat.mtimeMs };
            })
            .sort((a, b) => b.mtime - a.mtime)
            .map(({ name, mtime }) => ({ name, mtime }));
    } catch {
        return [];
    }
}

function resolveChatFile(user, charName, chatFile) {
    const dir = path.join(getUserDir(user), 'chats', charName);
    if (chatFile) {
        const full = path.join(dir, chatFile);
        if (!fs.existsSync(full)) throw new Error(`聊天记录文件不存在：${chatFile}`);
        return full;
    }
    const chats = listChats(user, charName);
    if (!chats.length) throw new Error(`该角色还没有聊天记录：${charName}`);
    return path.join(dir, chats[0].name);
}

function loadRecentContext(user, charName, chatFile, limit = 20) {
    const filePath = resolveChatFile(user, charName, chatFile);
    const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter((line) => line.trim());
    // 第一行是 chat_metadata 头，不是消息
    const messages = lines.slice(1).map((line) => {
        try {
            return JSON.parse(line);
        } catch {
            return null;
        }
    }).filter(Boolean);

    const recent = messages.slice(-limit);
    return recent.map((m) => ({
        role: m.is_user ? 'user' : 'assistant',
        content: String(m.mes || ''),
    }));
}

function appendMessage(user, charName, chatFile, content, displayName) {
    const filePath = resolveChatFile(user, charName, chatFile);
    const entry = {
        name: displayName || charName,
        is_user: false,
        is_system: false,
        send_date: new Date().toISOString(),
        mes: content,
        extra: {},
    };
    fs.appendFileSync(filePath, '\n' + JSON.stringify(entry));
    return entry;
}

// ───────────── 酒馆变量（{{getvar}}/{{setvar}} 等） ─────────────
// 本地变量存在聊天 jsonl 文件第一行的 chat_metadata.variables 里；全局变量存在 settings.json。

function readChatMetadata(filePath) {
    try {
        const firstLine = fs.readFileSync(filePath, 'utf8').split('\n')[0];
        const parsed = JSON.parse(firstLine);
        if (!parsed.variables) parsed.variables = {};
        return parsed;
    } catch {
        return { variables: {} };
    }
}

function writeChatMetadata(filePath, metadata) {
    const content = fs.readFileSync(filePath, 'utf8');
    const newlineIndex = content.indexOf('\n');
    const rest = newlineIndex === -1 ? '' : content.slice(newlineIndex);
    fs.writeFileSync(filePath, JSON.stringify(metadata) + rest);
}

function readGlobalVariables(user) {
    try {
        const settings = loadSettings(user);
        return settings?.extension_settings?.variables?.global || {};
    } catch {
        return {};
    }
}

function writeGlobalVariables(user, vars) {
    const file = path.join(getUserDir(user), 'settings.json');
    const settings = loadSettings(user);
    if (!settings.extension_settings) settings.extension_settings = {};
    if (!settings.extension_settings.variables) settings.extension_settings.variables = {};
    settings.extension_settings.variables.global = vars;
    fs.writeFileSync(file, JSON.stringify(settings, null, 4));
}

// ───────────── user persona（{{user}} 和 <user人设>） ─────────────
// 支持"角色专属 persona"：persona_descriptions 里某个 persona 的 connections 数组
// 绑定了 {type:'character', id:'<charFileName>.png'} 时，优先用这个专属 persona；
// 没有绑定就退回 default_persona。

function resolvePersona(user, charFileName) {
    try {
        const settings = loadSettings(user);
        const pu = settings?.power_user || {};
        const personas = pu.personas || {};
        const descriptions = pu.persona_descriptions || {};

        const candidateIds = [`${charFileName}.png`, `${charFileName}.json`];
        let matchedKey = null;
        for (const [key, desc] of Object.entries(descriptions)) {
            const conns = desc?.connections || [];
            if (conns.some((c) => c.type === 'character' && candidateIds.includes(c.id))) {
                matchedKey = key;
                break;
            }
        }
        if (!matchedKey) matchedKey = pu.default_persona;

        return {
            name: personas[matchedKey] || '',
            description: descriptions[matchedKey]?.description || '',
        };
    } catch {
        return { name: '', description: '' };
    }
}

// ───────────── 宏 / 占位符替换 ─────────────

function macroDate(d) {
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function macroTime(d) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// 只读宏：组装 prompt 时用，把 {{char}}/{{user}}/{{date}}/{{time}}/{{getvar::x}} 等替换成当前值。
function applyReadMacros(text, { charName, userName, chatVars, globalVars }) {
    const now = new Date();
    return String(text)
        .replace(/\{\{char\}\}/gi, charName || '')
        .replace(/\{\{user\}\}/gi, userName || '')
        .replace(/\{\{date\}\}/gi, macroDate(now))
        .replace(/\{\{time\}\}/gi, macroTime(now))
        .replace(/\{\{weekday\}\}/gi, now.toLocaleDateString('en-US', { weekday: 'long' }))
        .replace(/\{\{isodate\}\}/gi, now.toISOString().slice(0, 10))
        .replace(/\{\{isotime\}\}/gi, now.toTimeString().slice(0, 5))
        .replace(/\{\{getvar::([^}]+)\}\}/gi, (_, name) => String(chatVars?.[name.trim()] ?? ''))
        .replace(/\{\{getglobalvar::([^}]+)\}\}/gi, (_, name) => String(globalVars?.[name.trim()] ?? ''));
}

// 有副作用的宏：只应该在 AI 真正生成完回复内容之后处理一次（不要在组装发给 AI 的 prompt 时处理）。
// 处理后从文本里移除（跟酒馆行为一致，setvar 不会留字面痕迹），并原地修改 chatVars/globalVars。
function applyWriteMacros(text, chatVars, globalVars) {
    let localChanged = false;
    let globalChanged = false;
    const cleaned = String(text)
        .replace(/\{\{setvar::([^:]+)::([^}]*)\}\}/gi, (_, name, value) => {
            chatVars[name.trim()] = value; localChanged = true; return '';
        })
        .replace(/\{\{addvar::([^:]+)::([^}]+)\}\}/gi, (_, name, value) => {
            const key = name.trim();
            chatVars[key] = String((Number(chatVars[key]) || 0) + (Number(value) || 0));
            localChanged = true; return '';
        })
        .replace(/\{\{incvar::([^}]+)\}\}/gi, (_, name) => {
            const key = name.trim();
            const next = (Number(chatVars[key]) || 0) + 1;
            chatVars[key] = String(next); localChanged = true; return String(next);
        })
        .replace(/\{\{decvar::([^}]+)\}\}/gi, (_, name) => {
            const key = name.trim();
            const next = (Number(chatVars[key]) || 0) - 1;
            chatVars[key] = String(next); localChanged = true; return String(next);
        })
        .replace(/\{\{setglobalvar::([^:]+)::([^}]*)\}\}/gi, (_, name, value) => {
            globalVars[name.trim()] = value; globalChanged = true; return '';
        })
        .replace(/\{\{addglobalvar::([^:]+)::([^}]+)\}\}/gi, (_, name, value) => {
            const key = name.trim();
            globalVars[key] = String((Number(globalVars[key]) || 0) + (Number(value) || 0));
            globalChanged = true; return '';
        })
        .replace(/\{\{incglobalvar::([^}]+)\}\}/gi, (_, name) => {
            const key = name.trim();
            const next = (Number(globalVars[key]) || 0) + 1;
            globalVars[key] = String(next); globalChanged = true; return String(next);
        })
        .replace(/\{\{decglobalvar::([^}]+)\}\}/gi, (_, name) => {
            const key = name.trim();
            const next = (Number(globalVars[key]) || 0) - 1;
            globalVars[key] = String(next); globalChanged = true; return String(next);
        });
    return { cleaned, localChanged, globalChanged };
}

// 用户模板里的非标准占位符（不是酒馆宏，是这套 prompt 自己的约定）。
// <聊天记录> 留空：真实历史记录已经通过 messages 数组单独传给 AI，不在文本里重复一遍。
function applyPlaceholders(text, { card, persona }) {
    return String(text)
        .replaceAll('<char人设>', [card.description, card.personality].filter(Boolean).join('\n\n'))
        .replaceAll('<user人设>', persona.description || '')
        .replaceAll('<senario>', card.scenario || '')
        .replaceAll('<聊天记录>', '');
}

// 剥离 <thinking>...</thinking> 包裹的思考过程，只保留真正要发的正文。
function stripThinking(text) {
    return String(text).replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
}

// ───────────── connection-manager profile / secrets ─────────────

function loadSettings(user) {
    const file = path.join(getUserDir(user), 'settings.json');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listProfiles(user) {
    try {
        const settings = loadSettings(user);
        const profiles = settings?.extension_settings?.connectionManager?.profiles || [];
        return profiles.map((p) => ({ id: p.id, name: p.name || p.id }));
    } catch {
        return [];
    }
}

function loadSecretValueById(user, secretId) {
    const file = path.join(getUserDir(user), 'secrets.json');
    const secrets = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const key of Object.keys(secrets)) {
        const arr = secrets[key];
        if (!Array.isArray(arr)) continue;
        const found = arr.find((s) => s.id === secretId);
        if (found) return found.value;
    }
    return null;
}

// 只解析连接信息（url/key），不强制要求 profile 自带模型——
// 模型允许由 proactive 设置里的全局 apiModel 覆盖（专门给主动消息配单独的模型）
function resolveApiConnection(user, profileId) {
    const settings = loadSettings(user);
    const profiles = settings?.extension_settings?.connectionManager?.profiles || [];
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) throw new Error('未找到指定的 API 方案，请检查是否已在酒馆的「连接管理」里保存该方案');

    const apiUrl = profile['api-url'];
    if (!apiUrl) {
        throw new Error('该 API 方案没有配置自定义 Server URL，主动消息功能目前只支持自定义 URL 的方案（如硅基流动/中转站等），请在连接管理里配置一个带 Server URL 的方案');
    }

    let apiKey = '';
    if (profile['secret-id']) {
        apiKey = loadSecretValueById(user, profile['secret-id']) || '';
    }

    return { apiUrl: apiUrl.replace(/\/+$/, ''), apiKey, profileModel: profile.model || '' };
}

async function listModels(user, profileId) {
    const { apiUrl, apiKey } = resolveApiConnection(user, profileId);
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(`${apiUrl}/models`, { headers });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`拉取模型列表失败 (${res.status})：${text.slice(0, 300)}`);
    }
    const json = await res.json();
    const list = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    return list.map((m) => (typeof m === 'string' ? m : m.id)).filter(Boolean);
}

// ───────────── AI 调用 ─────────────

async function callAI(user, profileId, model, systemPrompt, messages, { jsonMode = false } = {}) {
    const { apiUrl, apiKey, profileModel } = resolveApiConnection(user, profileId);
    const finalModel = model || profileModel;
    if (!finalModel) throw new Error('没有可用的模型：请在主动消息设置里选一个模型，或使用一个已配置模型的连接方案');

    const body = {
        model: finalModel,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.9,
    };
    if (jsonMode) {
        body.response_format = { type: 'json_object' };
    }

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`AI 请求失败 (${res.status})：${text.slice(0, 300)}`);
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('AI 返回结果格式异常');
    return content;
}

// 判断阶段专用的精简版 prompt：只给 char 基本信息，不套用户的大模板，
// 避免大模板里的 thinking 准则跟"只输出 JSON"的要求打架。globalPrompt 传空则不附加。
function buildSystemPrompt(card, globalPrompt) {
    const parts = [];
    if (card.name) parts.push(`你正在扮演角色「${card.name}」。`);
    if (card.description) parts.push(`角色描述：\n${card.description}`);
    if (card.personality) parts.push(`性格：\n${card.personality}`);
    if (card.scenario) parts.push(`场景：\n${card.scenario}`);
    if (card.mes_example) parts.push(`对话示例：\n${card.mes_example}`);
    if (card.first_mes) parts.push(`开场白参考：\n${card.first_mes}`);
    if (globalPrompt) parts.push(globalPrompt);
    return parts.join('\n\n');
}

function formatNow() {
    return new Date().toLocaleString('zh-CN', {
        year: 'numeric', month: 'long', day: 'numeric',
        weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false,
    });
}

function extractFirstJsonObject(text) {
    const match = String(text).match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI 返回内容中未找到 JSON');
    return JSON.parse(match[0]);
}

// ───────────── 方案运算（概率模式 / AI 判断模式） ─────────────
//
// 两阶段设计：
// - 判断阶段（仅 AI 判断模式）：用简化版 prompt（不含用户的大模板/thinking 准则），
//   只问「发不发」，保持精简好解析，避免和大模板里的 thinking 要求冲突。
// - 生成阶段（概率命中 / AI 判断为发 都会走到这）：用户配置的完整大模板
//   （默认是 Bunny 元层 + 世界观引擎 + thinking 准则那一整套），过一遍宏/占位符替换。

async function runScheme(user, globalConfig, scheme) {
    const { apiProfileId, apiModel, globalPrompt } = globalConfig;
    const card = loadCharCard(user, scheme.charName);
    const persona = resolvePersona(user, scheme.charName);
    const context = loadRecentContext(user, scheme.charName, scheme.chatFile, 20);
    const chatFilePath = resolveChatFile(user, scheme.charName, scheme.chatFile);
    const chatMetadata = readChatMetadata(chatFilePath);
    const globalVars = readGlobalVariables(user);
    const macroCtx = { charName: card.name, userName: persona.name, chatVars: chatMetadata.variables, globalVars };

    function buildGenerationPrompt(rawTemplate) {
        let text = applyPlaceholders(rawTemplate, { card, persona });
        text = applyReadMacros(text, macroCtx);
        return text;
    }

    async function generateAndSend() {
        const template = globalPrompt || DEFAULT_GLOBAL_PROMPT;
        const systemPrompt = buildGenerationPrompt(template);
        // 触发语的措辞很要紧：写成"{{user}} 不在线"会被模型当成异常状态，顺着就演成查岗、
        // 担心、要打电话。这里明确把沉默定义成常态，并把消息的由头指回 char 自己的生活。
        const triggerRaw = '+BUNNY：现在是 {{date}} {{time}}，{{user}} 此刻没在看手机。这很正常——可能在忙、在睡，也可能一整天都没看手机，不要当成异常，不要追问怎么了、为什么不回，不要表现出担心、委屈或试探，也不要提出打电话、找人、上门这类升级动作。请 {{char}} 以角色身份主动发一条消息，由头来自他自己此刻的生活：看到的东西、想分享的链接、身边刚发生的事、突然想起的念头。可长可短，允许只有一句话。+';
        const trigger = { role: 'user', content: buildGenerationPrompt(triggerRaw) };

        const raw = await callAI(user, apiProfileId, apiModel, systemPrompt, [...context, trigger]);
        const { cleaned, localChanged, globalChanged } = applyWriteMacros(raw, chatMetadata.variables, globalVars);
        if (localChanged) writeChatMetadata(chatFilePath, chatMetadata);
        if (globalChanged) writeGlobalVariables(user, globalVars);

        const content = stripThinking(cleaned);
        if (!content) return { sent: false, reason: 'AI 生成内容为空（可能只输出了 thinking，没有正文）' };
        const entry = appendMessage(user, scheme.charName, scheme.chatFile, content, card.name);
        return { sent: true, content, entry };
    }

    if (scheme.mode === 'probability') {
        const roll = Math.random() * 100;
        if (roll >= Number(scheme.probability || 0)) {
            return { sent: false, reason: `概率未命中 (roll=${roll.toFixed(1)}, threshold=${scheme.probability})` };
        }
        return generateAndSend();
    }

    if (scheme.mode === 'ai') {
        const now = formatNow();
        const judgeSystemPrompt = buildSystemPrompt(card, '') + `\n\n你现在不是在角色扮演对话，而是在后台执行一次判断任务：判断此刻${card.name || '角色'}是否真的会主动给 user 发一条消息。

判断准则：
1. 发和不发都是正常结果，不必勉强凑向任何一边。角色此刻有由头（看到了什么、发生了什么、突然想起什么）就发，没有就不发——不发不需要理由，也不需要论证或补偿。
2. 关键是：他并非非发不可。不要为了让角色说上话而去替他找理由、造由头。
3. user 长时间没回消息本身不构成理由。现实里一个人一整天不看手机是正常的，不必解读成失联、出事、生气或冷落；角色不需要因此追问、担心、反复确认或升级联系方式。
4. 角色当地时间的深夜到清晨（约 23:00–07:00）几乎总是不发，除非他此刻恰好醒着且有非说不可的事。
5. 刚互动过不久、或上一条消息还悬在那里等 user 回应时，不发。
6. 角色自己正在忙、在睡、在专注做别的事时，不发。

无论上面的聊天记录进行到哪里，都不要续写剧情或以角色身份说话，也不要输出思考过程。只输出一个 JSON 对象，不要有任何其他文字、不要用 markdown 代码块包裹：
不发：{"send": false, "reason": "一句话说明"}
要发：{"send": true, "reason": "一句话说明他此刻要开口的由头"}`;
        // 明确追加一条 user 提问收尾：messages 数组最后一条如果是历史剧情，模型会倾向于"接着演"而不是停下回答判断问题。
        const judgeInstruction = { role: 'user', content: `（系统提示：当前时间 ${now}。请立刻输出上述格式的 JSON 判断结果，不要扮演角色回复，不要输出思考过程。发和不发都是正常结果。）` };
        // 判断是个二值决策，不需要创造力：温度跟生成阶段（0.9）分开，避免同样的处境两次跑出不同结论。
        const raw = await callAI(user, apiProfileId, apiModel, judgeSystemPrompt, [...context, judgeInstruction], { jsonMode: true });
        const decision = extractFirstJsonObject(raw);
        if (!decision.send) {
            return { sent: false, reason: decision.reason || 'AI 判断不发送' };
        }
        // 判定要发：这里才真正走完整大模板 + thinking 生成内容
        return generateAndSend();
    }

    throw new Error(`未知触发模式：${scheme.mode}`);
}

// ───────────── 定时器管理（按用户隔离，互不影响） ─────────────

/** @type {Map<string, Map<string, NodeJS.Timeout>>} user -> schemeId -> timer */
const timersByUser = new Map();

function stopUserTimers(user) {
    const userTimers = timersByUser.get(user);
    if (!userTimers) return;
    for (const timer of userTimers.values()) clearInterval(timer);
    timersByUser.delete(user);
}

function countRunningTimers(user) {
    return timersByUser.get(user)?.size || 0;
}

function startUserTimers(user, config, onResult) {
    stopUserTimers(user);
    if (!config?.enabled) return;
    const { apiProfileId, apiModel, globalPrompt, schemes } = config;
    const globalConfig = { apiProfileId, apiModel, globalPrompt };
    const userTimers = new Map();
    for (const scheme of schemes || []) {
        if (!scheme.enabled) continue;
        const intervalMs = Math.max(1, Number(scheme.intervalMinutes) || 60) * 60 * 1000;
        const timer = setInterval(async () => {
            try {
                const result = await runScheme(user, globalConfig, scheme);
                onResult?.(scheme, result, null);
            } catch (error) {
                onResult?.(scheme, null, error);
            }
        }, intervalMs);
        userTimers.set(scheme.id, timer);
    }
    if (userTimers.size) timersByUser.set(user, userTimers);
}

// schemeId -> 连续失败次数。用于失败提醒防刷屏：第一次失败就提醒，
// 之后如果一直失败（比如内容一直被审核拦截），每 20 次才再提醒一次，避免刷屏。
const failStreaks = new Map();

function makeOnResult(pushNotify) {
    return async function onResult(scheme, result, error) {
        if (error) {
            const streak = (failStreaks.get(scheme.id) || 0) + 1;
            failStreaks.set(scheme.id, streak);
            console.error(`[carrot-plugin] 主动消息方案「${scheme.charName}」运算失败（连续第 ${streak} 次）：`, error.message);
            if (streak === 1 || streak % 20 === 0) {
                try {
                    await pushNotify?.({
                        title: `⚠️ ${scheme.charName} 的主动消息失败了`,
                        body: String(error.message || '').slice(0, 80),
                        tag: `carrot-proactive-fail-${scheme.id}`,
                    });
                } catch (e) {
                    console.error('[carrot-plugin] 失败提醒推送失败：', e.message);
                }
            }
            return;
        }
        failStreaks.delete(scheme.id);
        if (result?.sent) {
            console.log(`[carrot-plugin] 主动消息：${scheme.charName} 发送了一条消息`);
            try {
                await pushNotify?.({
                    title: scheme.charName,
                    body: result.content.slice(0, 50),
                    tag: 'carrot-proactive',
                });
            } catch (e) {
                console.error('[carrot-plugin] 主动消息推送失败：', e.message);
            }
        } else {
            console.log(`[carrot-plugin] 主动消息：${scheme.charName} 本次跳过（${result?.reason || ''}）`);
        }
    };
}

// 插件启动时调用：扫描所有用户，把上次保存时是启用状态的方案重新挂上定时器。
// 解决「酒馆服务器进程重启后，纯内存定时器会丢失、且没人手动重新打开设置面板就不会恢复」的问题。
function resumeAllUsersOnBoot(pushNotify) {
    const onResult = makeOnResult(pushNotify);
    let resumedUsers = 0;
    for (const user of listUsers()) {
        try {
            const settings = loadSettings(user);
            const config = settings?.extension_settings?.carrot?.proactive;
            if (!config?.enabled || !Array.isArray(config.schemes) || !config.schemes.some((s) => s.enabled)) continue;
            startUserTimers(user, config, onResult);
            resumedUsers++;
        } catch (e) {
            console.warn(`[carrot-plugin] 恢复用户「${user}」的主动消息定时器失败：`, e.message);
        }
    }
    if (resumedUsers) {
        console.log(`[carrot-plugin] 已为 ${resumedUsers} 个用户恢复主动消息定时器`);
    }
}

// ───────────── Express 路由 ─────────────

function usersHandler(req, res) {
    res.json({ ok: true, users: listUsers() });
}

function charsHandler(req, res) {
    try {
        res.json({ ok: true, chars: listChars(String(req.query.user || '')) });
    } catch (e) {
        res.status(400).json({ ok: false, error: e?.message || '读取角色列表失败' });
    }
}

function chatsHandler(req, res) {
    try {
        const chats = listChats(String(req.query.user || ''), String(req.query.char || ''));
        res.json({ ok: true, chats });
    } catch (e) {
        res.status(400).json({ ok: false, error: e?.message || '读取聊天记录列表失败' });
    }
}

function profilesHandler(req, res) {
    try {
        res.json({ ok: true, profiles: listProfiles(String(req.query.user || '')) });
    } catch (e) {
        res.status(400).json({ ok: false, error: e?.message || '读取 API 方案列表失败' });
    }
}

async function modelsHandler(req, res) {
    try {
        const models = await listModels(String(req.query.user || ''), String(req.query.profileId || ''));
        res.json({ ok: true, models });
    } catch (e) {
        res.status(400).json({ ok: false, error: e?.message || '拉取模型列表失败' });
    }
}

function makeStartHandler(pushNotify) {
    const onResult = makeOnResult(pushNotify);
    return function startHandler(req, res) {
        const config = req.body || {};
        const user = String(config.stUser || '');
        if (!user) return res.status(400).json({ ok: false, error: '缺少 stUser' });
        try {
            startUserTimers(user, config, onResult);
            res.json({ ok: true, running: countRunningTimers(user) });
        } catch (e) {
            res.status(400).json({ ok: false, error: e?.message || '启动失败' });
        }
    };
}

function stopHandler(req, res) {
    const user = String(req.body?.stUser || '');
    if (user) stopUserTimers(user);
    res.json({ ok: true });
}

module.exports = {
    usersHandler,
    charsHandler,
    chatsHandler,
    profilesHandler,
    modelsHandler,
    makeStartHandler,
    stopHandler,
    resumeAllUsersOnBoot,
    // 供测试/复用
    loadCharCard,
    loadRecentContext,
    appendMessage,
    resolveApiConnection,
    callAI,
    resolvePersona,
    applyReadMacros,
    applyWriteMacros,
    applyPlaceholders,
    stripThinking,
    runScheme,
};
