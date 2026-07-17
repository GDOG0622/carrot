// carrot Web Push Service Worker
// 只负责接收推送并弹系统通知，不拦截任何网络请求

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = { body: event.data ? event.data.text() : '' };
    }
    const title = data.title || 'AI 回复完成';
    event.waitUntil(self.registration.showNotification(title, {
        body: data.body || '',
        tag: data.tag || 'carrot-push',
        // 同 tag 默认静默替换旧通知（不重新弹出/震动/响铃）。
        // 主动消息等会连续多次推送的场景必须重新提醒，所以强制 renotify。
        renotify: true,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
    }));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
            for (const client of list) {
                if ('focus' in client) return client.focus();
            }
            return self.clients.openWindow('/');
        }),
    );
});
