const CACHE_NAME = 'sbryms-finance-v7';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/bg.png',
  '/assets/bg.css',
  // Add other assets like CSS, JS if any
];

self.addEventListener('install', event => {
  // Activate immediately and cache core assets
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Serve cached pages immediately, then refresh the cache in the background.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      const refresh = fetch(request).then(response => {
        if (response.ok) {
          caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
        }
        return response;
      }).catch(() => cached || caches.match('/index.html'));
      if (cached) {
        event.waitUntil(refresh.then(() => undefined));
        return cached;
      }
      try {
        return await refresh;
      } catch (err) {
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // HTML must be fresh so navigation never runs an outdated page script.
  if (url.origin === location.origin && (
    request.destination === 'document' ||
    url.pathname.endsWith('.html')
  )) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match('/index.html')))
    );
    return;
  }

  // For other same-origin resources, try cache first then network.
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request))
    );
    return;
  }

  // For cross-origin requests just allow network fetch
  // let browser handle it
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => {
        if (name !== CACHE_NAME) return caches.delete(name);
      }));
      // Take control of all clients immediately so the new SW serves them
      await self.clients.claim();
    })()
  );
});