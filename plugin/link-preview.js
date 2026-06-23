// POST /api/plugins/carrot/link-preview
// 抄 BunnyOS server.js:1909 的 link-preview，改 express app → handler 函数
// 详见 ../PLAN_v8.md §3.3 §5

const { cachePreviewImage } = require('./cover-cache');

// Jina reader token：可通过环境变量配置，没有也能用（免费档限速更严）
const JINA_TOKEN = process.env.CARROT_JINA_TOKEN || '';

// ───────────── 域名判定 ─────────────
const isBlockedHost = (hostname) => {
    const host = String(hostname || '').toLowerCase();
    return host === 'localhost' || host === '0.0.0.0' || /^127\./.test(host) || /^10\./.test(host)
        || /^192\.168\./.test(host) || /^169\.254\./.test(host)
        || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) || /^::1$/.test(host) || /^fe80:/i.test(host);
};
const isXhsHost = (h) => /(^|\.)xhslink\.com$|(^|\.)xiaohongshu\.com$|(^|\.)xhscdn\.com$/i.test(h || '');
const isDouyinHost = (h) => /(^|\.)douyin\.com$|(^|\.)iesdouyin\.com$|(^|\.)douyinpic\.com$|(^|\.)amemv\.com$/i.test(h || '');
const isWechatHost = (h) => /(^|\.)mp\.weixin\.qq\.com$|(^|\.)weixin\.qq\.com$/i.test(h || '');

const inferSiteName = (hostname) => {
    if (isXhsHost(hostname)) return '小红书';
    if (isDouyinHost(hostname)) return '抖音';
    if (isWechatHost(hostname)) return '微信公众号';
    return hostname || '链接';
};

const isGenericPreviewText = (text, hostname) => {
    const value = String(text || '').trim().replace(/\s+/g, ' ');
    if (!value) return true;
    if (isXhsHost(hostname)) {
        return /^(小红书|小红书 - 你的生活指南|小红书 - 标记我的生活|xiaohongshu|xhs)$/i.test(value)
            || /登录|访问链接异常|正在跳转|安全验证|验证码/.test(value);
    }
    return false;
};

const cleanSharedText = (text) => String(text || '')
    .replace(/https?:\/\/[^\s"'<>，。！？、；）)】\]]+/gi, '')
    .replace(/复制本条信息.*?(小红书|App).*$/i, '')
    .replace(/打开【?小红书】?App查看精彩内容.*$/i, '')
    .replace(/[""""']/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[,，。:：\s]+|[,，。:：\s]+$/g, '')
    .slice(0, 200);

// ───────────── HTML 解析工具 ─────────────
const htmlDecode = (s) => String(s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

const htmlToPlainText = (fragment) => htmlDecode(String(fragment || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<(?:br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(?:p|section|div|h[1-6]|li|blockquote|article)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/ /g, ' '))
    .split(/\r?\n/)
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .filter((line, idx, arr) => arr.indexOf(line) === idx)
    .join('\n')
    .trim();

const findMetaContent = (html, prop) => {
    const r1 = new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${prop}["'][^>]*content\\s*=\\s*["']([^"']*)["']`, 'i');
    const r2 = new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]+(?:property|name)\\s*=\\s*["']${prop}["']`, 'i');
    return htmlDecode(html.match(r1)?.[1] || html.match(r2)?.[1] || '').trim();
};

const findWechatVar = (html, name) => {
    const re = new RegExp(`var\\s+${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i');
    const rawValue = html.match(re)?.[2] || '';
    return htmlDecode(rawValue.replace(/\\(['"\\])/g, '$1')).trim();
};

const parseOgFromHtml = (html, baseUrl) => {
    const pick = (re) => { const m = html.match(re); return m ? m[1].trim() : ''; };
    const metaC = (prop) => {
        const r1 = new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${prop}["'][^>]*content\\s*=\\s*["']([^"']+)["']`, 'i');
        const r2 = new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]+(?:property|name)\\s*=\\s*["']${prop}["']`, 'i');
        return htmlDecode(pick(r1) || pick(r2));
    };
    let finalHost = '';
    try { finalHost = new URL(baseUrl).hostname; } catch {}
    const title = metaC('og:title') || htmlDecode(pick(/<title[^>]*>([^<]+)<\/title>/i));
    const description = metaC('og:description') || metaC('description');
    const imageRaw = metaC('og:image') || metaC('twitter:image');
    let image = '';
    if (imageRaw) { try { image = new URL(imageRaw, baseUrl).toString(); } catch {} }
    const siteName = metaC('og:site_name') || inferSiteName(finalHost);
    return { title, description, image, siteName };
};

const parseDouyinFromHtml = (html, baseUrl, rawText) => {
    const metaC = (prop) => {
        const r1 = new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${prop}["'][^>]*content\\s*=\\s*["']([^"']+)["']`, 'i');
        const r2 = new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]+(?:property|name)\\s*=\\s*["']${prop}["']`, 'i');
        return htmlDecode(html.match(r1)?.[1] || html.match(r2)?.[1] || '');
    };
    const rawDescription = metaC('description') || metaC('og:description');
    const titleText = htmlDecode(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '');
    const canonical = htmlDecode(html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] || '');
    const imgRaw = metaC('og:image') || htmlDecode(html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || '');
    let image = '';
    try { image = imgRaw ? new URL(imgRaw, baseUrl).toString() : ''; } catch {}
    const cleanedDescription = rawDescription
        .replace(/-\s*[^-，。]{1,40}于\d{8}发布在抖音，?/g, '')
        .replace(/来抖音，记录美好生活！?$/g, '')
        .trim();
    const descTitle = rawDescription.split(/\s+-\s+[^-，。]{1,40}于\d{8}发布在抖音/)[0]?.trim() || '';
    const sharedTitle = cleanSharedText(rawText);
    return {
        url: canonical || baseUrl,
        title: descTitle || titleText.replace(/-抖音$/, '').trim() || sharedTitle || '抖音视频',
        description: cleanedDescription || rawDescription || sharedTitle,
        image,
        siteName: '抖音',
        source: 'douyin-html',
    };
};

const parseWechatFromHtml = (html, baseUrl) => {
    const og = parseOgFromHtml(html, baseUrl);
    const author = findMetaContent(html, 'author') || findWechatVar(html, 'nickname') || findWechatVar(html, 'profile_nickname');
    const jsContentId = html.search(/\bid=["']js_content["']/i);
    let contentHtml = '';
    if (jsContentId >= 0) {
        const start = html.lastIndexOf('<div', jsContentId);
        const endMarkers = ['id="js_pc_qr_code"', "id='js_pc_qr_code'", 'id="js_article_bottom_bar"', "id='js_article_bottom_bar'", '<script'];
        const ends = endMarkers.map(m => html.indexOf(m, jsContentId)).filter(p => p > start);
        const end = ends.length ? Math.min(...ends) : Math.min(html.length, start + 600000);
        if (start >= 0 && end > start) contentHtml = html.slice(start, end);
    }
    const articleText = htmlToPlainText(contentHtml).replace(/^微信扫一扫\s*关注该公众号\s*/i, '').trim();
    const contentImage = contentHtml.match(/\b(?:data-src|src)=["'](https?:\/\/mmbiz\.qpic\.cn\/[^"']+)["']/i)?.[1] || '';
    const varImage = findWechatVar(html, 'msg_cdn_url');
    const imageRaw = og.image || varImage || contentImage;
    let image = '';
    try { image = imageRaw ? new URL(imageRaw, baseUrl).toString() : ''; } catch {}
    const title = (og.title || findWechatVar(html, 'msg_title') || '').replace(/\.html\(false\)$/i, '').trim();
    const summary = og.description || findWechatVar(html, 'msg_desc');
    const description = articleText || summary;
    if (!title && !description && !image) return null;
    return {
        url: baseUrl,
        title: title || summary || '微信公众号文章',
        description,
        image,
        siteName: author ? `微信公众号 · ${author}` : '微信公众号',
        source: articleText ? 'wechat-html' : 'wechat-og',
    };
};

// 括号配平抠 JSON 对象（小红书 __INITIAL_STATE__ 提取）
const extractJsonObjectAfterKey = (html, key) => {
    let from = 0;
    while (true) {
        const k = html.indexOf(key, from);
        if (k === -1) return null;
        const start = k + key.length;
        from = start;
        if (html[start] !== '{') continue;
        let depth = 0, inStr = false, esc = false, end = -1;
        for (let j = start; j < html.length; j++) {
            const c = html[j];
            if (esc) { esc = false; continue; }
            if (c === '\\') { esc = true; continue; }
            if (c === '"') { inStr = !inStr; continue; }
            if (inStr) continue;
            if (c === '{') depth++;
            else if (c === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
        }
        if (end === -1) continue;
        try {
            const obj = JSON.parse(html.slice(start, end));
            if (obj && typeof obj === 'object') return obj;
        } catch {}
    }
};

const normalizeXhsComments = (commentData) => {
    const list = Array.isArray(commentData?.comments) ? commentData.comments : [];
    const out = [];
    const pushComment = (item, parentNickname = '') => {
        if (!item || out.length >= 10) return;
        const user = item.user || {};
        const nickname = String(user.nickname || user.nickName || '').trim();
        const content = String(item.content || '').trim()
            || (Array.isArray(item.pictures) && item.pictures.length ? '[图片评论]' : '');
        const ipLocation = String(item.ipLocation || '').trim();
        const likeCount = item.likeCount ?? item.likeViewCount ?? '';
        const subCommentCount = item.subCommentCount ?? (Array.isArray(item.subComments) ? item.subComments.length : 0);
        if (!content && !nickname) return;
        out.push({
            nickname,
            content,
            ipLocation,
            likeCount,
            subCommentCount,
            parentNickname,
        });
    };

    for (const item of list) {
        if (out.length >= 10) break;
        const parentName = String(item?.user?.nickname || item?.user?.nickName || '').trim();
        pushComment(item);
        const subs = Array.isArray(item?.subComments) ? item.subComments : [];
        for (const sub of subs) {
            if (out.length >= 10) break;
            pushComment(sub, parentName);
        }
    }
    return out;
};

const extractXhsCommentsFromHtml = (html) => {
    let from = 0;
    const KEY = '"commentData":';
    while (true) {
        const k = html.indexOf(KEY, from);
        if (k === -1) return [];
        from = k + KEY.length;
        const data = extractJsonObjectAfterKey(html.slice(k), KEY);
        const comments = normalizeXhsComments(data);
        if (comments.length) return comments;
    }
};

const parseXhsFromHtml = (html, baseUrl) => {
    let from = 0;
    const KEY = '"noteData":';
    const comments = extractXhsCommentsFromHtml(html);
    while (true) {
        const k = html.indexOf(KEY, from);
        if (k === -1) break;
        from = k + KEY.length;
        const note = extractJsonObjectAfterKey(html.slice(k), KEY);
        if (note && (note.title || note.desc)) {
            const title = String(note.title || '').trim();
            const desc = String(note.desc || '').trim();
            const images = Array.isArray(note.imageList) ? note.imageList : [];
            const image = note.cover?.urlDefault
                || images[0]?.url
                || images[0]?.infoList?.find(i => /WB_DFT|H5_DTL|DFT/i.test(i.imageScene))?.url
                || images[0]?.infoList?.[0]?.url
                || '';
            return {
                title: title || desc || '小红书笔记',
                description: desc,
                image,
                comments,
                siteName: '小红书',
                source: 'xhs-state',
                url: baseUrl,
            };
        }
    }
    // 方案 B：OG
    const og = parseOgFromHtml(html, baseUrl);
    const finalHost = (() => { try { return new URL(baseUrl).hostname; } catch { return ''; } })();
    if (og.title && !isGenericPreviewText(og.title, finalHost)) {
        return { ...og, comments, source: 'xhs-og', url: baseUrl };
    }
    return null;
};

// ───────────── HTML 抓取 ─────────────
const fetchHtml = async (targetUrl, timeout = 10000) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    let resp;
    try {
        resp = await fetch(targetUrl, {
            redirect: 'follow',
            signal: ctrl.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            },
        });
    } finally { clearTimeout(t); }
    const finalU = resp.url || targetUrl;
    const ctype = resp.headers.get('content-type') || '';
    if (!resp.ok || !/text\/html|application\/xhtml/i.test(ctype)) {
        return { finalUrl: finalU, html: '', resp };
    }
    const maxHtmlBytes = 4 * 1024 * 1024;
    const reader = resp.body?.getReader?.();
    let html = '', total = 0;
    const dec = new TextDecoder('utf-8');
    if (reader) {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.length;
            if (total > maxHtmlBytes) { try { await reader.cancel(); } catch {} break; }
            html += dec.decode(value, { stream: true });
        }
        html += dec.decode();
    } else {
        html = await resp.text();
        if (html.length > maxHtmlBytes) html = html.slice(0, maxHtmlBytes);
    }
    return { finalUrl: finalU, html, resp };
};

const extractHtmlRedirect = (html) => {
    const metaR = html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^;]*;\s*url=([^"'\s>]+)/i)
        || html.match(/content=["'][^;]*;\s*url=([^"'\s>]+)[^>]+http-equiv=["']refresh["']/i);
    if (metaR?.[1]) return metaR[1].trim();
    const jsR = html.match(/(?:window\.location(?:\.href)?|location\.replace\()\s*[=\(]\s*["'](https?:\/\/[^"']+)["']/i);
    if (jsR?.[1]) return jsR[1].trim();
    return null;
};

// ───────────── Jina Reader 兜底 ─────────────
const trimMarkdownNoise = (text) => String(text || '')
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/\[[^\]]+]\([^)]+\)/g, '$1')
    .replace(/[>*_`~|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeJinaMarkdown = (markdown, sourceUrl, rawText) => {
    const content = String(markdown || '').trim();
    if (!content) return null;
    const titleLine = content.match(/^Title:\s*(.+)$/im)?.[1] || content.match(/^#\s+(.+)$/m)?.[1] || '';
    const descriptionLine = content.match(/^Description:\s*(.+)$/im)?.[1] || '';
    const imageMatch = content.match(/!\[[^\]]*]\((https?:\/\/[^)\s]+)[^)]*\)/i);
    const genericTitle = /小红书|xiaohongshu|xhs|生活指南|发现精彩|正在跳转/i.test(titleLine);
    const sharedText = cleanSharedText(rawText);
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(line => line
        && !/^Title:/i.test(line)
        && !/^Description:/i.test(line)
        && !/^URL Source:/i.test(line)
        && !/^Markdown Content:/i.test(line)
        && !/^#+\s*/.test(line)
        && !/^!\[[^\]]*]\(/.test(line)
        && !/^(打开|下载|登录|注册|复制|扫码|点击|更多精彩|当前浏览器)/.test(line));
    const bodyText = trimMarkdownNoise(lines.map(l => trimMarkdownNoise(l))
        .filter(l => l.length >= 8)
        .filter((l, i, arr) => arr.indexOf(l) === i)
        .join(' '));
    const description = trimMarkdownNoise(descriptionLine || sharedText || bodyText);
    const title = trimMarkdownNoise((genericTitle ? '' : titleLine) || sharedText || description);
    if (!title && !description && !imageMatch?.[1]) return null;
    let host = '';
    try { host = new URL(sourceUrl).hostname; } catch {}
    return {
        url: sourceUrl,
        title: title || inferSiteName(host),
        description: description && description !== title ? description : '',
        image: imageMatch?.[1] ? new URL(imageMatch[1], sourceUrl).toString() : '',
        siteName: inferSiteName(host),
        source: 'jina',
    };
};

const tryJinaReader = async (targetUrl, rawText) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
        const r = await fetch(`https://r.jina.ai/${targetUrl}`, {
            method: 'GET',
            redirect: 'follow',
            signal: ctrl.signal,
            headers: {
                'Accept': 'text/markdown,text/plain;q=0.9,*/*;q=0.8',
                ...(JINA_TOKEN ? { Authorization: `Bearer ${JINA_TOKEN}` } : {}),
            },
        });
        if (!r.ok) return null;
        return normalizeJinaMarkdown(await r.text(), targetUrl, rawText);
    } catch (e) {
        console.warn('[carrot link-preview jina failed]', e?.message || e);
        return null;
    } finally { clearTimeout(t); }
};

const isUsefulPreview = (preview, hostname) => {
    if (!preview) return false;
    return Boolean(
        String(preview.description || '').trim()
        || String(preview.image || '').trim()
        || !isGenericPreviewText(preview.title, hostname),
    );
};

// ───────────── 主流程 ─────────────
async function handler(req, res) {
    try {
        let raw = String(req.body?.url || '').trim();
        const rawText = String(req.body?.rawText || raw).trim();
        if (!raw) return res.status(400).json({ error: '缺少 URL' });
        if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
            && /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/|$)/i.test(raw)) {
            raw = `https://${raw}`;
        }
        let u;
        try { u = new URL(raw); } catch { return res.status(400).json({ error: 'URL 格式无效' }); }
        if (!/^https?:$/.test(u.protocol)) return res.status(400).json({ error: '仅支持 http/https' });
        const host = u.hostname.toLowerCase();
        if (isBlockedHost(host)) return res.status(400).json({ error: '禁止访问内网地址' });

        const fallbackPreview = (finalUrl = u.toString(), reason = '') => {
            let finalHost = host;
            try { finalHost = new URL(finalUrl).hostname; } catch {}
            const sharedTitle = cleanSharedText(rawText);
            return {
                url: finalUrl,
                title: sharedTitle || inferSiteName(finalHost),
                description: '',
                image: '',
                siteName: inferSiteName(finalHost),
                source: 'fallback',
                limitedReason: reason || '',
            };
        };

        const sendPreview = async (preview, refererUrl = '') => {
            const out = preview && typeof preview === 'object' ? { ...preview } : fallbackPreview();
            if (out.image && !out.imageLocal) {
                out.imageLocal = await cachePreviewImage(out.image, refererUrl || out.url || u.toString());
            }
            return res.json(out);
        };

        // Step 1: 抓 HTML
        let fetchResult;
        try { fetchResult = await fetchHtml(u.toString()); } catch (e) {
            const jinaFb = await tryJinaReader(u.toString(), rawText);
            return await sendPreview(isUsefulPreview(jinaFb, host) ? jinaFb : fallbackPreview(u.toString(), '抓取超时'), u.toString());
        }
        let { finalUrl, html } = fetchResult;

        // Step 2: 追 HTML 内 redirect
        if (!html && !isXhsHost(host)) {
            const jinaFb = await tryJinaReader(finalUrl, rawText);
            return await sendPreview(isUsefulPreview(jinaFb, new URL(finalUrl).hostname)
                ? jinaFb : fallbackPreview(finalUrl, `远程返回 ${fetchResult.resp?.status}`), finalUrl);
        }
        if (html) {
            const redirectTarget = extractHtmlRedirect(html);
            if (redirectTarget && redirectTarget !== finalUrl) {
                try {
                    const newParsed = new URL(redirectTarget);
                    if (!isBlockedHost(newParsed.hostname)) {
                        const r2 = await fetchHtml(redirectTarget, 8000);
                        if (r2.html) { finalUrl = r2.finalUrl; html = r2.html; }
                    }
                } catch {}
            }
        }

        const finalHost = (() => { try { return new URL(finalUrl).hostname; } catch { return host; } })();
        if (isBlockedHost(finalHost)) return res.status(400).json({ error: '禁止访问内网地址' });

        // Step 3: 小红书特化
        if (isXhsHost(finalHost)) {
            const looksBlocked = /验证|滑动|captcha|访问异常|网络不给力|当前页面无法访问/i.test(html);
            const xhsData = html ? parseXhsFromHtml(html, finalUrl) : null;
            if (xhsData && isUsefulPreview(xhsData, finalHost)) {
                return await sendPreview({ ...xhsData, url: xhsData.url || finalUrl }, finalUrl);
            }
            const jinaXhs = await tryJinaReader(finalUrl, rawText);
            if (isUsefulPreview(jinaXhs, finalHost)) return await sendPreview(jinaXhs, finalUrl);
            const sharedXhs = cleanSharedText(rawText);
            const reason = looksBlocked ? '小红书反爬拦截，建议配置 Jina Token'
                : '小红书内容解析失败';
            return await sendPreview({
                url: finalUrl,
                title: xhsData?.title || sharedXhs || '小红书笔记',
                description: sharedXhs || '',
                image: xhsData?.image || '',
                siteName: '小红书',
                source: 'xhs-limited',
                limitedReason: reason,
            }, finalUrl);
        }

        // Step 3b: 抖音特化
        if (isDouyinHost(finalHost)) {
            const douyinData = html ? parseDouyinFromHtml(html, finalUrl, rawText) : null;
            if (douyinData && isUsefulPreview(douyinData, finalHost)) {
                return await sendPreview(douyinData, finalUrl);
            }
            const jinaDouyin = await tryJinaReader(finalUrl, rawText);
            if (isUsefulPreview(jinaDouyin, finalHost)) {
                return await sendPreview({ ...jinaDouyin, siteName: '抖音' }, finalUrl);
            }
            const sharedDouyin = cleanSharedText(rawText);
            if (sharedDouyin) {
                return await sendPreview({ url: finalUrl, title: sharedDouyin, description: sharedDouyin, image: '', siteName: '抖音', source: 'douyin-shared-text' }, finalUrl);
            }
        }

        // Step 3c: 微信公众号特化
        if (isWechatHost(finalHost)) {
            const wechatData = html ? parseWechatFromHtml(html, finalUrl) : null;
            if (wechatData && isUsefulPreview(wechatData, finalHost)) {
                return await sendPreview(wechatData, finalUrl);
            }
            const jinaWechat = await tryJinaReader(finalUrl, rawText);
            if (isUsefulPreview(jinaWechat, finalHost)) {
                return await sendPreview({ ...jinaWechat, siteName: '微信公众号' }, finalUrl);
            }
        }

        // Step 4: 通用 OG
        const sharedText = cleanSharedText(rawText);
        if (html) {
            const og = parseOgFromHtml(html, finalUrl);
            const hasUseful = Boolean(og.description || og.image
                || (og.title && !isGenericPreviewText(og.title, finalHost)));
            if (hasUseful) {
                return await sendPreview({
                    url: finalUrl,
                    title: og.title,
                    description: og.description,
                    image: og.image,
                    siteName: String(og.siteName).slice(0, 80),
                    source: 'og',
                }, finalUrl);
            }
        }

        // Step 5: OG 没内容 → Jina
        const jinaFinal = await tryJinaReader(finalUrl, rawText);
        if (isUsefulPreview(jinaFinal, finalHost)) return await sendPreview(jinaFinal, finalUrl);

        // Step 6: 兜底
        if (sharedText) {
            return await sendPreview({
                url: finalUrl, title: sharedText, description: '', image: '',
                siteName: inferSiteName(finalHost), source: 'shared-text',
            }, finalUrl);
        }
        return await sendPreview(fallbackPreview(finalUrl, '无法解析'), finalUrl);
    } catch (e) {
        const msg = e?.name === 'AbortError' ? '抓取超时' : '抓取失败';
        console.warn('[carrot link-preview error]', e?.message || e);
        res.status(502).json({ error: msg });
    }
}

module.exports = handler;
