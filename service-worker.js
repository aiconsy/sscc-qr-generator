const CACHE_NAME = 'qr-generator-v4';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './script.js',
  './styles.css',
  './qrcode.min.js',
  './icon.svg',
  './favicon.svg',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  // skipWaiting() so an updated worker activates without waiting for every tab
  // to close; without it a deployed fix can sit dormant behind an open tab.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS_TO_CACHE);
    await self.skipWaiting();
  })());
});

// Clear old caches
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name !== CACHE_NAME)
        .map((name) => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GETs from our own origin. Anything else (POST, cross-origin
  // analytics, fonts) must go straight to the network untouched.
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) {
    return;
  }

  // Navigations: network-first so a new deploy is picked up, falling back to the
  // cached shell only when actually offline. A cache-first navigation is what
  // makes an installed PWA appear "stuck" on an old version.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, fresh.clone());
        return fresh;
      } catch (_) {
        const cached = await caches.match(request);
        return cached || caches.match('./index.html');
      }
    })());
    return;
  }

  // Static assets: cache-first (they are content-addressed enough for this app),
  // then network, caching successful same-origin responses for offline use.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response && response.status === 200 && response.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
      }
      return response;
    } catch (_) {
      // Icons: an empty 404 keeps the <img> from breaking layout.
      if (/\.(png|ico|svg)$/.test(new URL(request.url).pathname)) {
        return new Response('', { status: 404 });
      }
      return new Response('Offline - Please check your connection', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Headers({ 'Content-Type': 'text/plain' })
      });
    }
  })());
}); 