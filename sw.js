// Service Worker for Aivis-chan Bot Website
// PWA機能、オフライン対応、6台Bot対応

const CACHE_NAME = 'aivis-bot-v2.0.0';
const STATIC_CACHE = 'aivis-static-v2.0.0';
const DYNAMIC_CACHE = 'aivis-dynamic-v2.0.0';

// キャッシュするファイルリスト
const STATIC_FILES = [
    '/',
    '/index.html',
    '/css/main.css',
    '/js/main.js',
    '/images/aivis-logo.svg',
    '/images/favicon.svg',
    '/images/icon-192.png',
    '/images/icon-512.png',
    '/manifest.json',
    '/offline.html'
];

// Bot API エンドポイント（動的キャッシュ）
const BOT_API_ENDPOINTS = [
    'https://status.aivis-chan-bot.com/api/bot1/status',
    'https://status.aivis-chan-bot.com/api/bot2/status',
    'https://status.aivis-chan-bot.com/api/bot3/status',
    'https://status.aivis-chan-bot.com/api/bot4/status',
    'https://status.aivis-chan-bot.com/api/bot5/status',
    'https://status.aivis-chan-bot.com/api/bot6/status',
    'https://discord.com/api/v10/gateway'
];

// インストール時の処理
self.addEventListener('install', event => {
    console.log('[SW] Service Worker インストール中...', event);
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log('[SW] 静的ファイルをキャッシュ中...');
                return cache.addAll(STATIC_FILES);
            })
            .then(() => {
                console.log('[SW] 静的ファイルキャッシュ完了');
                return self.skipWaiting(); // 即座にアクティブ化
            })
            .catch(error => {
                console.error('[SW] 静的ファイルキャッシュエラー:', error);
            })
    );
});

// アクティベート時の処理
self.addEventListener('activate', event => {
    console.log('[SW] Service Worker アクティベート中...', event);
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        // 古いキャッシュを削除
                        if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
                            console.log('[SW] 古いキャッシュを削除:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[SW] Service Worker アクティベート完了');
                return self.clients.claim(); // 即座に制御開始
            })
    );
});

// フェッチイベントの処理
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    // 認証判定APIは常にネットワーク直行（キャッシュ禁止）
    if (url.pathname === '/api/session') {
        return; // そのままブラウザに処理させる
    }
    
    // リクエストタイプに応じて処理を分岐
    if (request.method === 'GET') {
        if (isStaticAsset(request)) {
            // 静的アセット: Cache First戦略
            event.respondWith(cacheFirst(request));
    } else if (isAPIRequest(request)) {
            // API リクエスト: Network First戦略
            event.respondWith(networkFirst(request));
        } else {
            // HTML ページ: Stale While Revalidate戦略
            event.respondWith(staleWhileRevalidate(request));
        }
    }
});

// 静的アセットかどうかの判定
function isStaticAsset(request) {
    const url = new URL(request.url);
    return url.pathname.match(/\.(css|js|png|jpg|jpeg|svg|gif|ico|woff|woff2|ttf)$/);
}

// API リクエストかどうかの判定
function isAPIRequest(request) {
    const url = new URL(request.url);
    return BOT_API_ENDPOINTS.some(endpoint => request.url.includes(endpoint)) ||
           url.pathname.includes('/api/') ||
           url.pathname.includes('/speakers');
}

// Cache First戦略（静的アセット用）
async function cacheFirst(request) {
    try {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            console.log('[SW] キャッシュからレスポンス:', request.url);
            return cachedResponse;
        }
        
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        console.error('[SW] Cache First エラー:', error);
        return new Response('オフラインです', { status: 503 });
    }
}

// Network First戦略（API用）
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        console.log('[SW] ネットワークエラー、キャッシュからレスポンス:', request.url);
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // オフライン用のモックレスポンス
        return new Response(JSON.stringify({
            error: 'オフライン',
            message: 'ネットワークに接続できません',
            offline: true
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 503
        });
    }
}

// Stale While Revalidate戦略（HTML用）
async function staleWhileRevalidate(request) {
    const cache = await caches.open(DYNAMIC_CACHE);
    const cachedResponse = await cache.match(request);
    
    const fetchPromise = fetch(request).then(networkResponse => {
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    }).catch(() => {
        // ネットワークエラー時はオフラインページを返す
        return caches.match('/offline.html') || 
               new Response('オフラインです', { status: 503 });
    });
    
    // キャッシュがあれば即座に返し、バックグラウンドで更新
    return cachedResponse || fetchPromise;
}

// メッセージ受信処理
self.addEventListener('message', event => {
    console.log('[SW] メッセージ受信:', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    } else if (event.data && event.data.type === 'CACHE_UPDATE') {
        // キャッシュ強制更新
        updateCache();
    }
});

// キャッシュ更新処理
async function updateCache() {
    try {
        const cache = await caches.open(STATIC_CACHE);
        await cache.addAll(STATIC_FILES);
        console.log('[SW] キャッシュ更新完了');
        
        // クライアントに通知
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'CACHE_UPDATED',
                message: 'キャッシュが更新されました'
            });
        });
    } catch (error) {
        console.error('[SW] キャッシュ更新エラー:', error);
    }
}

// プッシュ通知処理（将来の拡張用）
self.addEventListener('push', event => {
    if (event.data) {
        const data = event.data.json();
        const options = {
            body: data.body || 'Aivis-chan Botからの通知',
            icon: '/images/icon-192.png',
            badge: '/images/badge-72.png',
            data: data.url,
            actions: [
                {
                    action: 'open',
                    title: '開く'
                },
                {
                    action: 'close',
                    title: '閉じる'
                }
            ]
        };
        
        event.waitUntil(
            self.registration.showNotification(data.title || 'Aivis-chan Bot', options)
        );
    }
});

// 通知クリック処理
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    if (event.action === 'open' || !event.action) {
        event.waitUntil(
            clients.openWindow(event.notification.data || '/')
        );
    }
});

// 同期処理（バックグラウンド同期）
self.addEventListener('sync', event => {
    if (event.tag === 'status-sync') {
        event.waitUntil(syncStatus());
    }
});

// ステータス同期処理
async function syncStatus() {
    try {
        console.log('[SW] バックグラウンドでステータス同期中...');
        
        // Discord Gateway チェック
        const discordResponse = await fetch('https://discord.com/api/v10/gateway');
        
        // TTS Engine チェック
        const ttsResponse = await fetch('http://alecjp02.asuscomm.com:10101/speakers');
        
        // キャッシュに保存
        const cache = await caches.open(DYNAMIC_CACHE);
        if (discordResponse.ok) {
            cache.put('https://discord.com/api/v10/gateway', discordResponse.clone());
        }
        if (ttsResponse.ok) {
            cache.put('http://alecjp02.asuscomm.com:10101/speakers', ttsResponse.clone());
        }
        
        console.log('[SW] バックグラウンド同期完了');
    } catch (error) {
        console.error('[SW] バックグラウンド同期エラー:', error);
    }
}
