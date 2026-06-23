import { getSettings, saveSettings } from './config.js';

const providers = {
    siliconflow: {
        label: '硅基流动',
        url: 'https://api.siliconflow.cn/v1/audio/transcriptions',
        model: 'FunAudioLLM/SenseVoiceSmall',
        keyName: 'siliconflowKey',
    },
    groq: {
        label: 'Groq',
        url: 'https://api.groq.com/openai/v1/audio/transcriptions',
        model: 'whisper-large-v3-turbo',
        keyName: 'groqKey',
    },
};

const state = {
    recorder: null,
    stream: null,
    chunks: [],
    mime: '',
    startAt: 0,
    maxTimer: null,
    stopping: false,
};

function toast(message, type = 'info') {
    if (typeof toastr !== 'undefined' && toastr[type]) {
        toastr[type](message, 'carrot 语音输入', { timeOut: 4000 });
    } else {
        console.log('[carrot voice]', message);
    }
}

function getMainTextarea() {
    return document.getElementById('send_textarea');
}

function insertIntoTextarea(text) {
    const textarea = getMainTextarea();
    if (!textarea) {
        toast('找不到酒馆输入框', 'error');
        return;
    }
    const value = textarea.value || '';
    const start = Number.isFinite(textarea.selectionStart) ? textarea.selectionStart : value.length;
    const end = Number.isFinite(textarea.selectionEnd) ? textarea.selectionEnd : start;
    const prefix = value.slice(0, start);
    const suffix = value.slice(end);
    const spacerBefore = prefix && !/\s$/.test(prefix) ? ' ' : '';
    const spacerAfter = suffix && !/^\s/.test(suffix) ? ' ' : '';
    textarea.value = `${prefix}${spacerBefore}${text}${spacerAfter}${suffix}`;
    const cursor = prefix.length + spacerBefore.length + text.length + spacerAfter.length;
    textarea.focus();
    textarea.setSelectionRange(cursor, cursor);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function setRecording(active) {
    const button = document.getElementById('cip-voice-input-button');
    if (!button) return;
    button.classList.toggle('cip-recording', Boolean(active));
    button.title = active ? '停止录音' : '语音输入';
    const icon = button.querySelector('i');
    if (icon) {
        icon.classList.toggle('fa-microphone', !active);
        icon.classList.toggle('fa-stop', active);
    }
}

function pickRecorderMime() {
    const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4;codecs=mp4a.40.2',
        'audio/mp4',
        'audio/ogg;codecs=opus',
    ];
    for (const mime of candidates) {
        if (window.MediaRecorder?.isTypeSupported?.(mime)) return mime;
    }
    return '';
}

function getAsrSettings() {
    const settings = getSettings();
    settings.asr = settings.asr || {};
    return settings.asr;
}

function saveLastWorking(name) {
    const asr = getAsrSettings();
    if (asr.lastWorking === name) return;
    asr.lastWorking = name;
    saveSettings();
}

async function callProvider(name, key, blob, mime) {
    const provider = providers[name];
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    const ext = mime.includes('webm') ? 'webm'
        : mime.includes('mp4') ? 'mp4'
            : mime.includes('ogg') ? 'ogg'
                : 'bin';
    const form = new FormData();
    form.append('file', new File([blob], `audio.${ext}`, { type: mime }));
    form.append('model', provider.model);

    let res;
    try {
        res = await fetch(provider.url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}` },
            body: form,
            signal: ctrl.signal,
        });
    } catch (e) {
        clearTimeout(timer);
        const err = new Error(e?.name === 'AbortError' ? '请求超时' : '网络失败');
        err.kind = 'network';
        throw err;
    }
    clearTimeout(timer);

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        const err = new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 160)}` : ''}`);
        if (res.status === 401 || res.status === 403) err.kind = 'auth';
        else if (res.status === 429 || /quota|rate.?limit|insufficient|exceed/i.test(body)) err.kind = 'quota';
        else err.kind = 'http';
        throw err;
    }
    const data = await res.json().catch(() => ({}));
    return String(data.text || '').trim();
}

async function transcribe(blob, mime) {
    const asr = getAsrSettings();
    const order = [
        { name: 'siliconflow', key: asr.siliconflowKey },
        { name: 'groq', key: asr.groqKey },
    ].filter(item => item.key);
    if (!order.length) {
        toast('请先在 carrot 设置的 API / 语音 STT 里填写 Key', 'warning');
        return '';
    }
    order.sort((a, b) => (a.name === asr.lastWorking ? -1 : b.name === asr.lastWorking ? 1 : 0));

    let lastError = null;
    for (let i = 0; i < order.length; i += 1) {
        const current = order[i];
        const provider = providers[current.name];
        try {
            const text = await callProvider(current.name, current.key, blob, mime);
            if (!text) {
                lastError = new Error('识别结果为空');
                continue;
            }
            saveLastWorking(current.name);
            return text;
        } catch (e) {
            lastError = e;
            if (e.kind === 'auth') {
                toast(`${provider.label} Key 无效，请检查设置`, 'error');
                return '';
            }
            if (i < order.length - 1) {
                const next = providers[order[i + 1].name].label;
                const reason = e.kind === 'quota' ? '额度或频率受限' : e.kind === 'network' ? '网络失败' : '请求失败';
                toast(`${provider.label} ${reason}，切换到 ${next}`, 'warning');
            }
        }
    }
    toast(`语音识别失败：${lastError?.message || '所有服务商均不可用'}`, 'error');
    return '';
}

async function startRecording() {
    if (!window.isSecureContext) {
        toast('浏览器要求 HTTPS 或 localhost 才能使用麦克风', 'warning');
        return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        toast('当前浏览器不支持录音，请换 Chrome / Edge / Safari', 'error');
        return;
    }
    const asr = getAsrSettings();
    if (!asr.siliconflowKey && !asr.groqKey) {
        toast('请先在 carrot 设置的 API / 语音 STT 里填写 Key', 'warning');
        return;
    }
    const mime = pickRecorderMime();
    if (!mime) {
        toast('当前浏览器没有可用的录音编码', 'error');
        return;
    }

    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
        toast(`麦克风权限被拒绝：${e?.message || e?.name || '失败'}`, 'error');
        return;
    }

    try {
        state.recorder = new MediaRecorder(stream, { mimeType: mime });
    } catch (e) {
        stream.getTracks().forEach(track => track.stop());
        toast(`无法启动录音：${e?.message || e?.name || '失败'}`, 'error');
        return;
    }

    state.stream = stream;
    state.chunks = [];
    state.mime = mime;
    state.startAt = Date.now();
    state.stopping = false;
    state.recorder.ondataavailable = (event) => {
        if (event.data?.size) state.chunks.push(event.data);
    };
    state.recorder.start();
    setRecording(true);
    toast('录音中，再点一次停止');
    state.maxTimer = setTimeout(() => {
        if (state.recorder) {
            toast('已到 60 秒上限，自动停止', 'info');
            stopRecording();
        }
    }, 60000);
}

async function stopRecording() {
    const recorder = state.recorder;
    const stream = state.stream;
    const mime = state.mime;
    if (!recorder) return;
    if (state.maxTimer) clearTimeout(state.maxTimer);
    state.maxTimer = null;
    state.recorder = null;
    state.stream = null;
    setRecording(false);

    const stopped = new Promise(resolve => recorder.addEventListener('stop', resolve, { once: true }));
    try { recorder.stop(); } catch {}
    await stopped;
    try { stream?.getTracks?.().forEach(track => track.stop()); } catch {}

    const blob = new Blob(state.chunks, { type: mime });
    state.chunks = [];
    if (!blob.size) {
        toast('没录到声音', 'warning');
        return;
    }
    toast('识别中...');
    const text = await transcribe(blob, mime);
    if (text) insertIntoTextarea(text);
}

export function initVoiceInput() {
    const button = document.getElementById('cip-voice-input-button');
    if (!button) return;
    button.addEventListener('click', () => {
        if (state.recorder) {
            if (state.stopping) return;
            state.stopping = true;
            stopRecording().finally(() => { state.stopping = false; });
            return;
        }
        startRecording();
    });
}
