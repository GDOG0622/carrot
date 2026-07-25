// 出站代理支持：跑 carrot 后端的服务器自己也连不上 catbox 时（比如国内 VPS），
// 管理员可以把手头能出墙的代理（clash / v2ray / sing-box 的 HTTP 端口，或别的中转）
// 填进环境变量 CARROT_IMG_PROXY，img-proxy 下载 catbox 资源就会走这个代理中转，
// 访问网页的用户自己完全不需要任何代理。
//
// 依赖 https-proxy-agent（已加进 plugin/package.json，install.sh/install.cmd 会自动
// npm install）。没装这个依赖时不影响其它功能，只是代理这一项配了也不会生效，
// 会在日志里提示手动装一下。

let HttpsProxyAgent = null;
try {
    ({ HttpsProxyAgent } = require('https-proxy-agent'));
} catch { /* 未安装依赖，走下面的兜底提示 */ }

let cachedAgent;
let cachedRaw;
let warned = false;

/**
 * 读环境变量拿一个可用于 https.request 的代理 agent；没配就返回 null（走服务器自己的直连）。
 * 优先级：CARROT_IMG_PROXY 专用变量 > 系统常见的 HTTPS_PROXY / https_proxy。
 */
function getProxyAgent() {
    const raw = process.env.CARROT_IMG_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy || '';
    if (!raw) return null;

    if (!HttpsProxyAgent) {
        if (!warned) {
            warned = true;
            console.warn('[carrot img-proxy] 配置了出站代理但缺少依赖，请在 plugin 目录下执行: npm install');
        }
        return null;
    }

    if (raw === cachedRaw) return cachedAgent;
    cachedRaw = raw;
    try {
        cachedAgent = new HttpsProxyAgent(raw);
    } catch (e) {
        console.warn('[carrot img-proxy] 代理地址解析失败', e?.message || e);
        cachedAgent = null;
    }
    return cachedAgent;
}

module.exports = { getProxyAgent };
