const CACHE_NAME = 'propig-static-v5';
const PRECACHE_URLS = [
  '/manifest.json',
  '/favicon.ico',
  '/propig-favicon.svg',
  '/icons/icon-48.webp',
  '/icons/icon-72.webp',
  '/icons/icon-96.webp',
  '/icons/icon-128.webp',
  '/icons/icon-192.webp',
  '/icons/icon-256.webp',
  '/icons/icon-512.webp',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => undefined),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
            return undefined;
          }),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

const shouldBypassCache = (requestUrl, request) => {
  if (request.method !== 'GET') return true;
  if (requestUrl.origin !== self.location.origin) return true;

  return (
    requestUrl.pathname.startsWith('/_next/') ||
    requestUrl.pathname.startsWith('/api/') ||
    requestUrl.pathname === '/sw.js' ||
    request.headers.get('rsc') === '1' ||
    request.headers.has('next-router-state-tree') ||
    request.headers.has('next-url')
  );
};

const shouldCacheStaticAsset = (requestUrl) =>
  requestUrl.pathname === '/manifest.json' ||
  requestUrl.pathname.startsWith('/icons/') ||
  requestUrl.pathname.startsWith('/corp/') ||
  /\.(?:png|jpg|jpeg|gif|webp|svg|ico|mp4|webm)$/i.test(requestUrl.pathname);

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  if (shouldBypassCache(requestUrl, event.request)) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/')),
    );
    return;
  }

  if (!shouldCacheStaticAsset(requestUrl)) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const networkResponse = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }

          return response;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkResponse;
    }),
  );
});
