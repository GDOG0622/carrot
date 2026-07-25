// carrot 猫箱中转 —— 部署在 Cloudflare Workers 上的独立小服务，跟 plugin/ 里其它文件不是一回事，
// 不会被 node 加载，只是把源码存进仓库方便以后改/重新部署。
//
// 用途：img-proxy.js 直连 catbox 失败时（服务器自己也被墙）会走这个中转，原样转发任意格式
// （图片/gif/mp4/webm 都行，不像 wsrv.nl 只认图片）。Cloudflare 的网络本身能连到 catbox，
// 国内到 *.workers.dev 通常比直连 catbox.moe 稳定得多。
//
// 部署步骤（一次性，几分钟，免信用卡）：
//   1. https://dash.cloudflare.com 免费注册
//   2. 左侧 Workers & Pages → Create → Create Worker，随便起个名字（比如 carrot-catbox-relay）
//   3. 进编辑器，把这个文件的全部内容粘进去，替换默认代码，点 Deploy
//   4. 部署完会给一个 https://<你起的名字>.<你的子域>.workers.dev 地址，把它填进
//      img-proxy.js 顶部的 RELAY_URL 常量
//
// 免费额度：每天 10 万次请求，个人/小社区用的酒馆基本用不完；真用满了当天该额度用户会看到
// 图片加载失败，第二天自动恢复。

const ALLOWED_HOSTS = new Set([
    'catbox.moe',
    'files.catbox.moe',
    'litterbox.catbox.moe',
]);

export default {
    async fetch(request) {
        const url = new URL(request.url);
        const raw = url.searchParams.get('url') || '';

        let target;
        try { target = new URL(raw); } catch { return new Response('invalid url', { status: 400 }); }
        if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname.toLowerCase())) {
            return new Response('host not allowed', { status: 403 });
        }

        let upstream;
        try {
            upstream = await fetch(target.toString(), {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                cf: { cacheTtl: 604800, cacheEverything: true }, // 用 Cloudflare 自己的边缘缓存兜一层，减少回源次数
            });
        } catch (e) {
            return new Response(`upstream fetch failed: ${e.message}`, { status: 502 });
        }
        if (!upstream.ok) {
            return new Response('upstream error', { status: 502 });
        }

        const headers = new Headers(upstream.headers);
        headers.set('Cache-Control', 'public, max-age=604800, immutable');
        headers.set('Access-Control-Allow-Origin', '*');
        return new Response(upstream.body, { status: 200, headers });
    },
};
