const CACHE_NAME = 'sbryms-finance-v16';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
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
  const title = notification.title || data.title || 'SBRYMS Finance';
  const options = {
    body: notification.body || data.body || 'You have a new message or call.',
    icon: '/assets/team-meet-icon.png',
    badge: '/assets/team-meet-icon.png',
    tag: notification.tag || (isCall && callId ? `sbryms-call-${callId}` : `sbryms-${data.type || 'notification'}`),
    requireInteraction: isCall,
    renotify: isCall,
    vibrate: isCall ? [0, 500, 250, 500] : [0, 150],
    actions: isCall
      ? [{ action: 'answer', title: 'Answer' }, { action: 'dismiss', title: 'Dismiss' }]
      : [{ action: 'open', title: 'Open chat' }],
    data: {
      url: data.url || notification.url || '/team-meet.html',
      answerUrl: data.answerUrl || ''
    }
  };
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows.some(client => client.visibilityState === 'visible' && client.focused)) return;
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const notificationData = event.notification.data;
  if (event.action === 'dismiss') return;
  const requestedPath = event.action === 'answer'
    ? notificationData && notificationData.answerUrl
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
        const fallback = await caches.match('/index.html');
        if (fallback) return fallback;
        throw error;
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
