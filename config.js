import {
    saveSettings as saveSillySettings,
    saveSettingsDebounced,
} from '/script.js';
import { extension_settings } from '/scripts/extensions.js';

export const EXT_KEY = 'carrot';

const DEFAULT_SETTINGS = {
    floatVisible: true,
    floatIconUrl: '',
    regexEnabled: true,
    stickerData: {},
    themeData: {},
    lastActiveTheme: '',
    avatarProfiles: {},
    lastAvatarProfile: '',
    frameProfiles: {},
    lastFrameProfile: '',
    unsplashAccessKey: '',
    regexRuleSettings: {},
    notifSounds: {},
    notifSuccess: '',
    notifFail: '',
    syncFilename: '',
    localStorageMigrated: false,
};

const legacyDefinitions = {
    cip_sticker_data: ['stickerData', parseJson, stringifyJson],
    cip_theme_data_v1: ['themeData', parseJson, stringifyJson],
    cip_last_active_theme_v1: ['lastActiveTheme', parseString, stringifyString],
    cip_avatar_profiles_v1: ['avatarProfiles', parseJson, stringifyJson],
    cip_last_avatar_profile_v1: ['lastAvatarProfile', parseString, stringifyString],
    cip_frame_profiles_v1: ['frameProfiles', parseJson, stringifyJson],
    cip_last_frame_profile_v1: ['lastFrameProfile', parseString, stringifyString],
    cip_unsplash_access_key_v1: ['unsplashAccessKey', parseString, stringifyString],
    cip_sync_filename_v1: ['syncFilename', parseString, stringifyString],
    cip_regex_enabled_v1: ['regexEnabled', parseBoolean, stringifyBoolean],
    cip_regex_rule_settings_v1: ['regexRuleSettings', parseJson, stringifyJson],
    cip_float_visible_v1: ['floatVisible', parseBoolean, stringifyBoolean],
    cip_float_icon_v1: ['floatIconUrl', parseString, stringifyString],
    cip_notif_sounds_v1: ['notifSounds', parseJson, stringifyJson],
    cip_notif_success_v1: ['notifSuccess', parseString, stringifyString],
    cip_notif_fail_v1: ['notifFail', parseString, stringifyString],
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

function normalizeSettingsShape(settings) {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (settings[key] === undefined) {
            settings[key] = clone(value);
        }
    }
    if (!isPlainObject(settings.stickerData)) settings.stickerData = {};
    if (!isPlainObject(settings.themeData)) settings.themeData = {};
    if (!isPlainObject(settings.avatarProfiles)) settings.avatarProfiles = {};
    if (!isPlainObject(settings.frameProfiles)) settings.frameProfiles = {};
    if (!isPlainObject(settings.regexRuleSettings)) settings.regexRuleSettings = {};
    if (!isPlainObject(settings.notifSounds)) settings.notifSounds = {};
    settings.floatVisible = settings.floatVisible !== false;
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
