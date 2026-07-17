import {
    saveSettings as saveSillySettings,
    saveSettingsDebounced,
} from '/script.js';
import { extension_settings } from '/scripts/extensions.js';

export const EXT_KEY = 'carrot';
export const DEFAULT_FLOAT_ICON_URL = 'https://i.postimg.cc/C14JNPMH/7564kz.jpg';

const DEFAULT_SETTINGS = {
    floatVisible: true,
    floatIconUrl: '',
    floatSize: 30,
    floatOpacity: 1,
    regexEnabled: true,
    stickerData: {},
    qqrData: [],
    qqrCollections: {},
    activeQqrCollection: '',
    lastQqrCollection: '',
    themeData: {},
    lastActiveTheme: '',
    avatarProfiles: {},
    lastAvatarProfile: '',
    frameProfiles: {},
    lastFrameProfile: '',
    unsplashAccessKey: '',
    notifSounds: {},
    notifSuccess: '',
    notifFail: '',
    notifPopupEnabled: false,
    notifKeepAlive: false,
    notifSuccessTitle: 'AI 回复完成',
    notifSuccessBody: '',
    notifFailTitle: 'AI 回复中断',
    notifFailBody: '',
    globalFonts: {},
    activeGlobalFont: '',
    globalMessageFontSize: '',
    globalMessageFontWeight: '',
    globalMessageLineHeight: '',
    globalMessageParagraphSpacing: '',
    globalMessageLetterSpacing: '',
    bubblePreset: 'ios',
    bubblePresets: {},
    syncFilename: '',
    localStorageMigrated: false,
    // v8.0: 后端 plugin / 链接解析
    linkParse: {
        disabled: false,   // 用户主动跳过 → 不再弹引导，不再做链接解析
        jinaToken: '',
        attachCoverImage: true,
    },
    // v8.1 预留：语音 STT
    asr: {
        siliconflowKey: '',
        groqKey: '',
        lastWorking: 'siliconflow',
    },
    // v8.0.31: char 主动发消息（后端驱动）
    proactive: {
        enabled: false,
        globalPrompt: `BUNNY守在梦境与现实的交界，维持梦境正常运转，隔绝并修正一切异常。<user>可以与BUNNY进行元对话；<char>永远不知道BUNNY、提示词与元层的存在。

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
</thinking>`,
        stUser: '',
        apiProfileId: '',
        apiModel: '',
        schemes: [],
    },
};

const legacyDefinitions = {
    cip_sticker_data: ['stickerData', parseJson, stringifyJson],
    cip_qqr_data_v1: ['qqrData', parseJson, stringifyJson],
    cip_qqr_collections_v1: ['qqrCollections', parseJson, stringifyJson],
    cip_qqr_active_collection_v1: ['activeQqrCollection', parseString, stringifyString],
    cip_qqr_last_collection_v1: ['lastQqrCollection', parseString, stringifyString],
    cip_theme_data_v1: ['themeData', parseJson, stringifyJson],
    cip_last_active_theme_v1: ['lastActiveTheme', parseString, stringifyString],
    cip_avatar_profiles_v1: ['avatarProfiles', parseJson, stringifyJson],
    cip_last_avatar_profile_v1: ['lastAvatarProfile', parseString, stringifyString],
    cip_frame_profiles_v1: ['frameProfiles', parseJson, stringifyJson],
    cip_last_frame_profile_v1: ['lastFrameProfile', parseString, stringifyString],
    cip_unsplash_access_key_v1: ['unsplashAccessKey', parseString, stringifyString],
    cip_sync_filename_v1: ['syncFilename', parseString, stringifyString],
    cip_regex_enabled_v1: ['regexEnabled', parseBoolean, stringifyBoolean],
    cip_float_visible_v1: ['floatVisible', parseBoolean, stringifyBoolean],
    cip_float_icon_v1: ['floatIconUrl', parseString, stringifyString],
    cip_float_size_v1: ['floatSize', parseNumber, stringifyString],
    cip_float_opacity_v1: ['floatOpacity', parseNumber, stringifyString],
    cip_notif_sounds_v1: ['notifSounds', parseJson, stringifyJson],
    cip_notif_success_v1: ['notifSuccess', parseString, stringifyString],
    cip_notif_fail_v1: ['notifFail', parseString, stringifyString],
    cip_notif_popup_enabled_v1: ['notifPopupEnabled', parseBoolean, stringifyBoolean],
    cip_notif_keep_alive_v1: ['notifKeepAlive', parseBoolean, stringifyBoolean],
    cip_notif_success_title_v1: ['notifSuccessTitle', parseString, stringifyString],
    cip_notif_success_body_v1: ['notifSuccessBody', parseString, stringifyString],
    cip_notif_fail_title_v1: ['notifFailTitle', parseString, stringifyString],
    cip_notif_fail_body_v1: ['notifFailBody', parseString, stringifyString],
    cip_global_fonts_v1: ['globalFonts', parseJson, stringifyJson],
    cip_active_global_font_v1: ['activeGlobalFont', parseString, stringifyString],
    cip_global_message_font_size_v1: ['globalMessageFontSize', parseString, stringifyString],
    cip_global_message_font_weight_v1: ['globalMessageFontWeight', parseString, stringifyString],
    cip_global_message_line_height_v1: ['globalMessageLineHeight', parseString, stringifyString],
    cip_global_message_paragraph_spacing_v1: ['globalMessageParagraphSpacing', parseString, stringifyString],
    cip_global_message_letter_spacing_v1: ['globalMessageLetterSpacing', parseString, stringifyString],
    cip_bubble_preset_v1: ['bubblePreset', parseString, stringifyString],
    cip_bubble_presets_v1: ['bubblePresets', parseJson, stringifyJson],
};

const settingToLegacyKey = Object.fromEntries(
    Object.entries(legacyDefinitions).map(([legacyKey, [settingKey]]) => [
        settingKey,
        legacyKey,
    ]),
);

function parseJson(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string') return value;
    return JSON.parse(value);
}

function stringifyJson(value) {
    return JSON.stringify(value ?? null);
}

function parseString(value) {
    return value === null || value === undefined ? '' : String(value);
}

function stringifyString(value) {
    return value === null || value === undefined ? '' : String(value);
}

function parseBoolean(value) {
    if (typeof value === 'boolean') return value;
    return String(value) === 'true';
}

function stringifyBoolean(value) {
    return value ? 'true' : 'false';
}

function parseNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
}

function sameValue(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function clampNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function normalizeSettingsShape(settings) {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (settings[key] === undefined) {
            settings[key] = clone(value);
        }
    }
    if (!isPlainObject(settings.stickerData)) settings.stickerData = {};
    if (!Array.isArray(settings.qqrData)) settings.qqrData = [];
    if (!isPlainObject(settings.qqrCollections)) settings.qqrCollections = {};
    if (!isPlainObject(settings.themeData)) settings.themeData = {};
    if (!isPlainObject(settings.avatarProfiles)) settings.avatarProfiles = {};
    if (!isPlainObject(settings.frameProfiles)) settings.frameProfiles = {};
    if (!isPlainObject(settings.notifSounds)) settings.notifSounds = {};
    if (!isPlainObject(settings.globalFonts)) settings.globalFonts = {};
    if (!isPlainObject(settings.bubblePresets)) settings.bubblePresets = {};
    if (!isPlainObject(settings.proactive)) settings.proactive = clone(DEFAULT_SETTINGS.proactive);
    if (!Array.isArray(settings.proactive.schemes)) settings.proactive.schemes = [];
    settings.floatVisible = settings.floatVisible !== false;
    settings.floatSize = clampNumber(settings.floatSize, 20, 120, DEFAULT_SETTINGS.floatSize);
    settings.floatOpacity = clampNumber(settings.floatOpacity, 0.2, 1, DEFAULT_SETTINGS.floatOpacity);
    settings.regexEnabled = settings.regexEnabled !== false;
    return settings;
}

export function getSettings() {
    if (!extension_settings[EXT_KEY]) {
        extension_settings[EXT_KEY] = {};
    }
    return normalizeSettingsShape(extension_settings[EXT_KEY]);
}

export function saveSettings() {
    saveSettingsDebounced();
}

export async function flushSettings() {
    await saveSillySettings();
}

export function getDefaultSettings() {
    return clone(DEFAULT_SETTINGS);
}

export function importLegacySettings(payload, { onlyDefaults = false, preserveUnknown = false } = {}) {
    const settings = getSettings();
    let changed = false;

    for (const [settingKey, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
        if (!Object.prototype.hasOwnProperty.call(payload || {}, settingKey)) continue;
        if (onlyDefaults && !sameValue(settings[settingKey], defaultValue)) continue;
        settings[settingKey] = clone(payload[settingKey]);
        changed = true;
    }

    for (const [legacyKey, value] of Object.entries(payload || {})) {
        const definition = legacyDefinitions[legacyKey];
        if (!definition) {
            if (preserveUnknown) {
                settings[legacyKey] = value;
                changed = true;
            }
            continue;
        }

        const [settingKey, parse] = definition;
        if (
            onlyDefaults &&
            !sameValue(settings[settingKey], DEFAULT_SETTINGS[settingKey])
        ) {
            continue;
        }
        try {
            const parsed = parse(value);
            if (parsed !== null) {
                settings[settingKey] = parsed;
                changed = true;
            }
        } catch (error) {
            console.warn('Carrot: failed to import legacy setting', legacyKey, error);
        }
    }

    normalizeSettingsShape(settings);
    if (changed) saveSettings();
    return changed;
}

export function migrateFromLocalStorage(localStorageRef = globalThis.localStorage) {
    if (!localStorageRef) return false;
    const settings = getSettings();
    if (settings.localStorageMigrated) return false;

    const payload = {};
    for (const legacyKey of Object.keys(legacyDefinitions)) {
        const raw = localStorageRef.getItem(legacyKey);
        if (raw !== null) payload[legacyKey] = raw;
    }

    const changed = importLegacySettings(payload, { onlyDefaults: true });
    settings.localStorageMigrated = true;
    saveSettings();
    return changed;
}

export function exportLegacySettings() {
    const settings = getSettings();
    const payload = {};

    for (const [legacyKey, [settingKey, , stringify]] of Object.entries(legacyDefinitions)) {
        const value = settings[settingKey];
        if (value === undefined || value === null) continue;
        payload[legacyKey] = stringify(value);
    }

    return payload;
}

export function getLegacyKey(settingKey) {
    return settingToLegacyKey[settingKey] || '';
}

export function createSettingsStorage({ runtimeLocalStorage = globalThis.localStorage } = {}) {
    return {
        getItem(key) {
            const definition = legacyDefinitions[key];
            if (!definition) {
                return runtimeLocalStorage?.getItem(key) ?? null;
            }
            const [settingKey, , stringify] = definition;
            const value = getSettings()[settingKey];
            if (value === undefined || value === null) return null;
            return stringify(value);
        },
        setItem(key, value) {
            const definition = legacyDefinitions[key];
            if (!definition) {
                runtimeLocalStorage?.setItem(key, value);
                return;
            }
            const [settingKey, parse] = definition;
            getSettings()[settingKey] = parse(value);
            saveSettings();
        },
        removeItem(key) {
            const definition = legacyDefinitions[key];
            if (!definition) {
                runtimeLocalStorage?.removeItem(key);
                return;
            }
            const [settingKey] = definition;
            getSettings()[settingKey] = clone(DEFAULT_SETTINGS[settingKey]);
            saveSettings();
        },
    };
}
