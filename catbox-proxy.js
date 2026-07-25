// 猫箱（catbox.moe）链接改写成走 carrot 后端代理，浏览器端不用直连 catbox。
//
// 两种用法：
//   1. rewriteCatboxUrl(url) —— carrot 自己的代码在"把链接塞进 src / url() 之前"主动调，
//      好处是第一次渲染就是对的，不会闪一下加载失败的图。
//   2. initGlobalCatboxRewrite() —— 全局兜底：盯住整个酒馆页面的 DOM，
//      不管是酒馆本体、别的扩展、还是 AI 输出塞进来的猫箱链接，一律改写。

const CATBOX_HOSTS = new Set(['catbox.moe', 'files.catbox.moe', 'litterbox.catbox.moe']);
const PROXY_PREFIX = '/api/plugins/carrot/img-proxy?url=';

export function isCatboxHost(hostname) {
    return CATBOX_HOSTS.has(String(hostname || '').toLowerCase());
}

export function catboxProxyUrl(originalUrl) {
    return `${PROXY_PREFIX}${encodeURIComponent(originalUrl)}`;
}

/**
 * 把 URL 改写成走 carrot 代理（仅当它指向猫箱域名时），其它 URL 原样返回。
 * 用于任何"把用户/AI 给的 URL 塞进 src / url() 之类地方"的场景，不只是 <img>。
 */
export function rewriteCatboxUrl(raw, baseHref) {
    const value = String(raw || '');
    if (!value || value.startsWith(PROXY_PREFIX)) return value;
    let parsed;
    try { parsed = new URL(value, baseHref || window.location.href); } catch { return value; }
    if (!/^https?:$/.test(parsed.protocol) || !isCatboxHost(parsed.hostname)) return value;
    return catboxProxyUrl(parsed.toString());
}

// --- 全局兜底：整个酒馆页面的猫箱链接都改走代理 ---

// 只盯这几个"会真的发起网络请求"的属性。输入框的 value 不能碰——那是用户存的设置原文，
// 改了会把代理地址写回存档里。
const URL_ATTRS = ['src', 'href', 'poster'];
const ATTR_FILTER = [...URL_ATTRS, 'srcset', 'style'];
// CSS 里的 url(...)，三种引号写法都要认
const CSS_URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;

function rewriteCssText(cssText) {
    const text = String(cssText || '');
    if (!text.includes('catbox')) return text; // 绝大多数样式都不含猫箱，先便宜地筛掉
    return text.replace(CSS_URL_RE, (whole, quote, url) => {
        const next = rewriteCatboxUrl(url);
        return next === url ? whole : `url(${quote}${next}${quote})`;
    });
}

// srcset 形如 "a.png 1x, b.png 2x"，按逗号切开逐个改
function rewriteSrcset(value) {
    return String(value || '')
        .split(',')
        .map((part) => {
            const trimmed = part.trim();
            if (!trimmed) return part;
            const spaceAt = trimmed.search(/\s/);
            const url = spaceAt === -1 ? trimmed : trimmed.slice(0, spaceAt);
            const descriptor = spaceAt === -1 ? '' : trimmed.slice(spaceAt);
            return `${rewriteCatboxUrl(url)}${descriptor}`;
        })
        .join(', ');
}

function rewriteElement(el) {
    if (!el || el.nodeType !== 1) return;
    const tag = el.tagName;
    if (tag === 'BASE') return; // 改 <base href> 会连锁改变整页相对路径的解析

    if (tag === 'STYLE') {
        const next = rewriteCssText(el.textContent);
        if (next !== el.textContent) el.textContent = next;
        return;
    }

    for (const attr of URL_ATTRS) {
        const value = el.getAttribute?.(attr);
        if (!value) continue;
        const next = rewriteCatboxUrl(value);
        if (next !== value) el.setAttribute(attr, next);
    }

    const srcset = el.getAttribute?.('srcset');
    if (srcset) {
        const next = rewriteSrcset(srcset);
        if (next !== srcset) el.setAttribute('srcset', next);
    }

    const style = el.getAttribute?.('style');
    if (style) {
        const next = rewriteCssText(style);
        if (next !== style) el.setAttribute('style', next);
    }
}

function rewriteWithin(root) {
    if (!root) return;
    if (root.nodeType === 1) rewriteElement(root);
    // 只在含 catbox 的属性上花时间：先用选择器粗筛，比遍历所有元素快得多
    root.querySelectorAll?.(
        '[src*="catbox"],[href*="catbox"],[poster*="catbox"],[srcset*="catbox"],[style*="catbox"],style',
    ).forEach(rewriteElement);
}

let globalRewriteStarted = false;

/**
 * 盯住整个酒馆页面：任何扩展 / 酒馆本体 / AI 输出往 DOM 里塞的猫箱链接，
 * 只要是会发起网络请求的属性（src/href/poster/srcset/style 里的 url()）就改走代理。
 * 只认域名，不看后缀——.png 也好 .大西瓜 也好，一视同仁。
 */
export function initGlobalCatboxRewrite(documentRef = document) {
    if (globalRewriteStarted) return;
    globalRewriteStarted = true;

    const pending = new Set();
    let flushHandle = 0;

    const flush = () => {
        flushHandle = 0;
        const items = Array.from(pending);
        pending.clear();
        items.forEach((node) => {
            if (node.isConnected) rewriteWithin(node);
        });
    };

    const schedule = () => {
        if (flushHandle) return;
        flushHandle = typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame(flush)
            : setTimeout(flush, 16);
    };

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes') {
                // 改写属性本身会再触发一次 attributes 事件，但 rewriteCatboxUrl 对已经
                // 是代理地址的输入原样返回，第二轮不会再改，所以不会来回打转
                if (mutation.target?.nodeType === 1) pending.add(mutation.target);
                continue;
            }
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) pending.add(node);
                else if (node.nodeType === 3 && node.parentElement?.tagName === 'STYLE') {
                    pending.add(node.parentElement);
                }
            });
        }
        if (pending.size) schedule();
    });

    const start = () => {
        rewriteWithin(documentRef.documentElement);
        observer.observe(documentRef.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ATTR_FILTER,
            characterData: false,
        });
    };

    if (documentRef.readyState === 'loading') {
        documentRef.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }

    return { stop: () => observer.disconnect() };
}
