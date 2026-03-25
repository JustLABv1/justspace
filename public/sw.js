const STATIC_CACHE = 'justspace-static-v1';
const CACHEABLE_DESTINATIONS = new Set(['font', 'image', 'manifest', 'script', 'style']);

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    return;
  }

  if (!CACHEABLE_DESTINATIONS.has(request.destination) && !url.pathname.startsWith('/_next/static/')) {
    return;
  }

  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cachedResponse = await cache.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }

      const response = await fetch(request);
      if (response.ok) {
        cache.put(request, response.clone());
      }

      return response;
    })
  );
});