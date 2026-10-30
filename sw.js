const CACHE_NAME = 'sbryms-finance-v22';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/app-icon-192.png',
  '/assets/bg.png',
  '/assets/bg.css'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(
        urlsToCache.map(url =>
          fetch(url)
            .then(response => response.ok ? cache.put(url, response) : undefined)
            .catch(() => undefined)
        )
      )
    )
  );
});

self.addEventListener('push', event => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch (error) {
    console.error('Received an unreadable push payload:', error);
    return;
  }
  const data = payload.data || payload;
  const notification = payload.notification || {};
  const isCall = data.type === 'team_call';
  const callId = data.callId || '';
  const eventId = data.messageId || data.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const title = isCall
    ? (notification.title || data.callerName || data.title || 'Incoming call')
    : (data.senderName || data.title || notification.title || 'SBRYMS Finance');
  const senderPhoto = !isCall && typeof data.senderPhoto === 'string'
    && data.senderPhoto.startsWith('https://')
    ? data.senderPhoto
    : '';
  const options = {
    body: notification.body || data.body || 'You have a new message or call.',
    icon: isCall ? '/assets/app-icon-192.png' : (senderPhoto || '/assets/app-icon-192.png'),
    image: senderPhoto || undefined,
    badge: '/assets/app-icon-192.png',
    tag: isCall && callId
      ? `sbryms-call-${callId}`
      : (data.type === 'message'
        ? `sbryms-message-${data.chat || eventId}`
        : (notification.tag || `sbryms-${data.type || 'notification'}-${eventId}`)),
    requireInteraction: isCall,
    renotify: isCall,
    vibrate: isCall ? [0, 500, 250, 500] : [0, 150],
    actions: isCall
      ? [{ action: 'answer', title: 'Answer' }, { action: 'decline', title: 'Decline' }]
      : [{ action: 'open', title: 'Open chat' }],
    data: {
      url: data.url || notification.url || '/team-meet.html',
      answerUrl: data.answerUrl || '',
      chatUrl: data.chatUrl || data.url || ''
    }
  };
  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const notificationData = event.notification.data;
  const requestedPath = event.action === 'answer' || event.action === 'decline'
    ? notificationData && notificationData.answerUrl
    : event.action === 'message'
      ? notificationData && notificationData.chatUrl
    : notificationData && notificationData.url;
  const targetUrl = new URL(
    typeof requestedPath === 'string' && requestedPath.startsWith('/')
      ? requestedPath
      : '/team-meet.html',
    self.location.origin
  );
  if (targetUrl.origin !== self.location.origin) {
    targetUrl.pathname = '/team-meet.html';
    targetUrl.search = '';
  }
  if (event.action === 'decline') targetUrl.searchParams.set('action', 'decline');
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(targetUrl.href);
        return;
      }
    }
    await self.clients.openWindow(targetUrl.href);
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' && url.pathname === '/assets/login.html') {
    event.respondWith(Response.redirect(new URL('/login.html', self.location.origin).href, 302));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        if (cached) return cached;
        if (url.pathname === '/' || url.pathname === '/index.html') {
          const fallback = await caches.match('/index.html');
          if (fallback) return fallback;
        }
        return new Response(
          '<!doctype html><html lang="bn"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><body><h1>ইন্টারনেট সংযোগ নেই</h1><p>এই পেজটি আগে খোলা হয়নি। সংযোগ ফিরে এলে আবার চেষ্টা করুন।</p></body></html>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
