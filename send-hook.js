// 拦截酒馆发送（#send_but click + #send_textarea Enter），先解析链接再发出
// 详见 ./PLAN_v8.md §2.1 §2.3

import { getSettings } from './config.js';
import { isBackendReady, pingBackend, showGuideModal } from './backend.js';
import { extractUrls, parseAndReplace } from './link-parser.js';

let isProcessing = false;        // 防止我们自己 dispatch 的 send 触发再次拦截
let isInstalled = false;
const hookedTextareas = new WeakSet();

function toast(msg) {
    // 复用酒馆的 toastr 若存在
    if (typeof toastr !== 'undefined') {
        toastr.warning(msg, 'carrot 链接解析', { timeOut: 4000 });
    } else {
        console.warn('[carrot]', msg);
    }
}

function setSendButtonLoading(loading) {
    const btn = document.getElementById('send_but');
    if (!btn) return;
    btn.classList.toggle('cip-link-parsing', loading);
    if (loading) {
        btn.setAttribute('data-cip-prev-disabled', btn.disabled ? '1' : '0');
        btn.disabled = true;
    } else {
        const prev = btn.getAttribute('data-cip-prev-disabled');
        if (prev !== '1') btn.disabled = false;
        btn.removeAttribute('data-cip-prev-disabled');
    }
}

function getSendTextareas() {
    return Array.from(document.querySelectorAll('#send_textarea'));
}

function findSendTextarea() {
    const all = getSendTextareas();
    for (const el of all) {
        if (el.offsetWidth > 0 && el.offsetHeight > 0) return el;
    }
    return all[0] || null;
}

function setTextareaValue(textarea, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) setter.call(textarea, value);
    else textarea.value = value;
}

function dispatchTextareaInput(textarea) {
    try {
        textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    } catch (error) {
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

function syncAllSendTextareas(value) {
    getSendTextareas().forEach((textarea) => {
        setTextareaValue(textarea, value);
        dispatchTextareaInput(textarea);
    });
}

/**
 * 真正触发酒馆 send：恢复 textarea 内容 + 模拟原生 send 行为
 */
function triggerNativeSend() {
    isProcessing = true;
    try {
        const btn = document.getElementById('send_but');
        if (btn) btn.click();
    } finally {
        // 给酒馆一点时间消费 click，再放开拦截
        setTimeout(() => { isProcessing = false; }, 50);
    }
}

async function processBeforeSend(textarea) {
    const original = textarea.value;
    const urls = extractUrls(original);
    if (urls.length === 0) return true;  // 没 URL，让原生 send 继续

    const settings = getSettings();
    const linkParseDisabled = !!(settings.linkParse && settings.linkParse.disabled);
    if (linkParseDisabled) return true;  // 用户主动跳过，原样发

    // 检查 plugin 是否启用
    if (!isBackendReady()) {
        // 再 ping 一次确认（用户可能刚启用）
        const ok = await pingBackend();
        if (!ok) {
            showGuideModal();
            toast('链接解析需要 carrot 后端插件，已弹出引导');
            return false;
        }
    }

    setSendButtonLoading(true);
    try {
        const result = await parseAndReplace(original);
        if (result.text !== original) {
            syncAllSendTextareas(result.text);
        }
        if (result.failed > 0 && result.success > 0) {
            toast(`${result.failed} 个链接解析失败，已跳过`);
        } else if (result.failed > 0 && result.success === 0) {
            const goAhead = confirm(
                `所有 ${result.failed} 个链接都解析失败：\n${result.errors.map(e => `• ${e.error}`).join('\n')}\n\n仍要按原样发送吗？`,
            );
            if (!goAhead) return false;
        }
        return true;
    } catch (e) {
        toast('链接解析服务异常：' + (e?.message || e));
        const goAhead = confirm('链接解析失败，是否按原样发送？');
        return !!goAhead;
    } finally {
        setSendButtonLoading(false);
    }
}

function onSendClick(e) {
    if (isProcessing) return;       // 我们自己 dispatch 的 click，放行
    const ta = findSendTextarea();
    if (!ta) return;
    const urls = extractUrls(ta.value);
    if (urls.length === 0) return;  // 没链接，让酒馆原生处理
    const settings = getSettings();
    if (settings.linkParse && settings.linkParse.disabled) return;

    // 拦下
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    processBeforeSend(ta).then((shouldSend) => {
        if (shouldSend) triggerNativeSend();
    });
}

function onTextareaKeydown(e) {
    if (isProcessing) return;
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    const ta = e.currentTarget;
    if (!ta || ta.tagName !== 'TEXTAREA') return;
    const urls = extractUrls(ta.value);
    if (urls.length === 0) return;
    const settings = getSettings();
    if (settings.linkParse && settings.linkParse.disabled) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    processBeforeSend(ta).then((shouldSend) => {
        if (shouldSend) triggerNativeSend();
    });
}

/**
 * 安装 send hook。等酒馆的 #send_but / #send_textarea 出现后再装
 */
export function initSendHook() {
    if (isInstalled) return;

    const attach = () => {
        const btn = document.getElementById('send_but');
        const textareas = getSendTextareas();
        if (!btn || textareas.length === 0) return false;
        // capture: true 确保比酒馆自己的 listener 先触发
        btn.addEventListener('click', onSendClick, { capture: true });
        textareas.forEach((ta) => {
            if (hookedTextareas.has(ta)) return;
            ta.addEventListener('keydown', onTextareaKeydown, { capture: true });
            hookedTextareas.add(ta);
        });
        isInstalled = true;
        console.log('[carrot] send hook 已安装');
        return true;
    };

    if (attach()) return;

    // 元素还没渲染好，监听 DOM 等
    const observer = new MutationObserver(() => {
        if (attach()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // 5s 兜底
    setTimeout(() => observer.disconnect(), 5000);
}
