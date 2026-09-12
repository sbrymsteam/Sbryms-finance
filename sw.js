<<<<<<< HEAD
const CACHE_NAME = 'sbryms-finance-v8';
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
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(
        urlsToCache.map(url => fetch(url).then(response => {
          if (response.ok) return cache.put(url, response);
          return undefined;
        }).catch(() => undefined))
      ))
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Never intercept writes, Firebase calls, browser extensions, or other origins.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Show cached HTML immediately and refresh it in the background.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      const refresh = fetch(request).then(async response => {
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      }).catch(() => cached || caches.match('/index.html'));
      if (cached) {
        event.waitUntil(refresh.catch(() => undefined));
        return cached;
      }
      return refresh;
    })());
    return;
  }

  // Static assets are cache-first and are updated when a new version is fetched.
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
=======
const CACHE_NAME = 'sbryms-finance-v6';
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

  // Navigation requests -> try network first, fallback to cache
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request);
        // Update cache with fresh index.html
        const cache = await caches.open(CACHE_NAME);
        cache.put('/index.html', networkResponse.clone());
        return networkResponse;
      } catch (err) {
        const cached = await caches.match('/index.html');
        if (cached) return cached;
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
>>>>>>> 8fceecbfbe6f3fb64c92aef170e3f711ba638301
});