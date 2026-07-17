// 零依赖 Web Push 发送实现
// VAPID：RFC 8292（JWT ES256 签名）；消息加密：RFC 8291（aes128gcm）
// 只用 node 内置 crypto，避免给用户增加 npm install 步骤

const crypto = require('crypto');

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const fromB64url = (str) => Buffer.from(String(str), 'base64url');

/**
 * 生成 VAPID 密钥对（P-256）。
 * publicKey 为 65 字节未压缩公钥的 base64url，直接给前端 pushManager.subscribe 用。
 */
function generateVapidKeys() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const pubJwk = publicKey.export({ format: 'jwk' });
    const privJwk = privateKey.export({ format: 'jwk' });
    const raw = Buffer.concat([Buffer.from([4]), fromB64url(pubJwk.x), fromB64url(pubJwk.y)]);
    return { publicKey: b64url(raw), privateJwk: privJwk };
}

function signVapidJwt(audience, privateJwk, subject) {
    const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
    const now = Math.floor(Date.now() / 1000);
    const payload = b64url(JSON.stringify({
        aud: audience,
        exp: now + 12 * 3600,
        sub: subject,
        iat: now, // Apple/WebKit push 服务严格校验，缺 iat 会返回 403 BadJwtToken；其它推送服务不强制
    }));
    const signingInput = `${header}.${payload}`;
    const key = crypto.createPrivateKey({ key: privateJwk, format: 'jwk' });
    // JWT ES256 需要 r||s 裸签名（64 字节），不是 DER
    const sig = crypto.sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' });
    return `${signingInput}.${b64url(sig)}`;
}

function hkdf(salt, ikm, info, len) {
    return Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));
}

/**
 * RFC 8291 aes128gcm 加密推送正文。
 * @param {string} plaintext
 * @param {string} p256dhB64 订阅里的客户端公钥（base64url，65 字节未压缩）
 * @param {string} authB64 订阅里的 auth secret（base64url，16 字节）
 */
function encryptPayload(plaintext, p256dhB64, authB64) {
    const clientPub = fromB64url(p256dhB64);
    const authSecret = fromB64url(authB64);
    if (clientPub.length !== 65) throw new Error('p256dh 公钥格式不正确');

    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    const serverPub = ecdh.getPublicKey();
    const sharedSecret = ecdh.computeSecret(clientPub);

    const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), clientPub, serverPub]);
    const ikm = hkdf(authSecret, sharedSecret, keyInfo, 32);
    const salt = crypto.randomBytes(16);
    const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
    const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);

    // 单记录：正文 + 0x02 分隔符（最后一条记录）
    const record = Buffer.concat([Buffer.from(plaintext, 'utf8'), Buffer.from([2])]);
    const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
    const encrypted = Buffer.concat([cipher.update(record), cipher.final(), cipher.getAuthTag()]);

    // aes128gcm 头：salt(16) + record size(4) + keyid 长度(1) + keyid(服务端临时公钥 65)
    const headerBuf = Buffer.concat([
        salt,
        Buffer.from([0, 0, 16, 0]), // rs = 4096
        Buffer.from([serverPub.length]),
        serverPub,
    ]);
    return Buffer.concat([headerBuf, encrypted]);
}

/**
 * 向单个订阅端点发送一条推送。
 * @returns {Promise<{status:number, ok:boolean}>}
 */
async function sendWebPush(subscription, payloadObj, vapid) {
    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const auth = subscription?.keys?.auth;
    if (!endpoint || !p256dh || !auth) throw new Error('订阅数据不完整');

    const body = encryptPayload(JSON.stringify(payloadObj), p256dh, auth);
    const audience = new URL(endpoint).origin;
    // sub 必须是能通过域名格式校验的 mailto/https，用 .invalid 之类的保留域名会被 Apple Web Push 判 403 BadJwtToken
    const jwt = signVapidJwt(audience, vapid.privateJwk, vapid.subject || 'mailto:carrot@example.com');

    const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `vapid t=${jwt}, k=${vapid.publicKey}`,
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            'TTL': '300',
            'Urgency': 'high',
        },
        body,
    });
    const bodyText = res.ok ? '' : await res.text().catch(() => '');
    return { status: res.status, ok: res.ok, body: bodyText };
}

module.exports = {
    generateVapidKeys,
    sendWebPush,
};
