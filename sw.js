/**
 * Shamaadan service worker — enables install / standalone app mode and a basic
 * offline fallback. Strategy: network-first for same-origin GETs (so content is
 * always fresh when online), falling back to cache when offline.
 *
 * Never touches /api/* (env + orders) or cross-origin requests (Supabase,
 * esm.sh, Google Fonts) — those always go straight to the network.
 */
const CACHE = 'shamaadan-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // let cross-origin pass through
  if (url.pathname.startsWith('/api/')) return; // always live

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/'))),
  );
});
