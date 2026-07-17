// char 主动发消息（后端驱动）
// 路由前缀 /api/plugins/carrot/proactive/*
// 详见 ../todo.md「char 主动发消息（后端驱动）」

const fs = require('fs');
const path = require('path');

const DEFAULT_GLOBAL_PROMPT = 'user当前不在线，char主动根据当前时间发消息联系user（线上模式）或推进剧情（线下模式）。根据上下文判断当前为线上或线下。';

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

function buildSystemPrompt(card, globalPrompt) {
    const parts = [];
    if (card.name) parts.push(`你正在扮演角色「${card.name}」。`);
    if (card.description) parts.push(`角色描述：\n${card.description}`);
    if (card.personality) parts.push(`性格：\n${card.personality}`);
    if (card.scenario) parts.push(`场景：\n${card.scenario}`);
    if (card.mes_example) parts.push(`对话示例：\n${card.mes_example}`);
    if (card.first_mes) parts.push(`开场白参考：\n${card.first_mes}`);
    parts.push(globalPrompt || DEFAULT_GLOBAL_PROMPT);
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

async function runScheme(user, globalConfig, scheme) {
    const { apiProfileId, apiModel, globalPrompt } = globalConfig;
    const card = loadCharCard(user, scheme.charName);
    const context = loadRecentContext(user, scheme.charName, scheme.chatFile, 20);
    const systemPrompt = buildSystemPrompt(card, globalPrompt);
    const now = formatNow();

    if (scheme.mode === 'probability') {
        const roll = Math.random() * 100;
        if (roll >= Number(scheme.probability || 0)) {
            return { sent: false, reason: `概率未命中 (roll=${roll.toFixed(1)}, threshold=${scheme.probability})` };
        }
        const instruction = { role: 'user', content: `（系统提示：当前时间 ${now}。请直接以角色身份主动发一条消息，不要输出任何系统说明或旁白解释。）` };
        const content = await callAI(user, apiProfileId, apiModel, systemPrompt, [...context, instruction]);
        const entry = appendMessage(user, scheme.charName, scheme.chatFile, content, card.name);
        return { sent: true, content, entry };
    }

    if (scheme.mode === 'ai') {
        const judgePrompt = systemPrompt + `\n\n你现在不是在角色扮演对话，而是在后台执行一次判断任务。请判断此刻角色是否应该主动联系 user（考虑作息、上次互动时间、氛围等，避免深夜打扰或过于频繁）。
无论上面的聊天记录进行到哪里，都不要续写剧情或以角色身份说话。只输出一个 JSON 对象，不要有任何其他文字、不要用 markdown 代码块包裹：
如果不该发：{"send": false}
如果该发：{"send": true, "content": "要发送的消息内容"}`;
        // 明确追加一条 user 提问收尾：messages 数组最后一条如果是历史剧情，模型会倾向于"接着演"而不是停下回答判断问题。
        const judgeInstruction = { role: 'user', content: `（系统提示：当前时间 ${now}。请立刻输出上述格式的 JSON 判断结果，不要扮演角色回复。）` };
        const raw = await callAI(user, apiProfileId, apiModel, judgePrompt, [...context, judgeInstruction], { jsonMode: true });
        const decision = extractFirstJsonObject(raw);
        if (!decision.send) {
            return { sent: false, reason: decision.reason || 'AI 判断不发送' };
        }
        const content = String(decision.content || '').trim();
        if (!content) return { sent: false, reason: 'AI 判断要发但内容为空' };
        const entry = appendMessage(user, scheme.charName, scheme.chatFile, content, card.name);
        return { sent: true, content, entry };
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

function makeOnResult(pushNotify) {
    return async function onResult(scheme, result, error) {
        if (error) {
            console.error(`[carrot-plugin] 主动消息方案「${scheme.charName}」运算失败：`, error.message);
            return;
        }
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
    runScheme,
};
