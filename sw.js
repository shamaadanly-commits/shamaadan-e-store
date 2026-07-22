/**
 * Shamaadan service worker — offline shell for Admin + POS, Web Push.
 * First open online caches assets; later visits work offline.
 */
const CACHE = 'shamaadan-v3-offline';

const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/css/base.css',
  '/css/dashboard.css',
  '/css/pos.css',
  '/css/mobile-perf.css',
  '/css/storefront/fonts.css',
  '/js/router.js',
  '/js/config/domains.js',
  '/js/config/supabase.js',
  '/js/shared/offline.js',
  '/js/shared/auth-client.js',
  '/js/shared/format.js',
  '/js/shared/brand.js',
  '/js/shared/ids.js',
  '/js/shared/barcode.js',
  '/js/shared/stock-status.js',
  '/js/dashboard.js',
  '/assets/images/logo.png',
  '/assets/images/iwanzazapersonal-Regular.otf',
];

function isEsmCdn(url) {
  return url.hostname === 'esm.sh' || url.hostname.endsWith('.esm.sh');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE).catch(() => undefined)),
  );
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

/**
 * @param {Request} request
 * @param {Response} response
 */
function putCache(request, response) {
  if (!response || !response.ok) return;
  const copy = response.clone();
  caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cache CDN modules (Supabase client, scanner libs) for offline boots
  if (isEsmCdn(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (err) {
        if (cached) return cached;
        throw err;
      }
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Auth / mutating APIs stay network-only
  if (url.pathname.startsWith('/api/') && url.pathname !== '/api/env.js') return;

  // App shell navigations
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        putCache(request, response);
        putCache(new Request('/'), response.clone());
        return response;
      } catch {
        return (await caches.match('/index.html'))
          || (await caches.match('/'))
          || Response.error();
      }
    })());
    return;
  }

  // Static assets + env: stale-while-revalidate
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    const networkPromise = fetch(request)
      .then((response) => {
        if (response && response.ok && (response.type === 'basic' || response.type === 'cors')) {
          cache.put(request, response.clone()).catch(() => undefined);
        }
        return response;
      })
      .catch(() => null);

    if (cached) {
      networkPromise.catch(() => undefined);
      return cached;
    }

    const network = await networkPromise;
    if (network) return network;

    if (url.pathname.startsWith('/js/') || url.pathname.startsWith('/css/')) {
      return (await caches.match('/index.html')) || Response.error();
    }

    return Response.error();
  })());
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'Shamaadan',
    body: 'New online order',
    url: '/?app=admin&view=website-orders',
    tag: 'shamaadan-order',
  };

  try {
    if (event.data) {
      const data = event.data.json();
      payload = { ...payload, ...data };
    }
  } catch {
    try {
      payload.body = event.data?.text() || payload.body;
    } catch {
      /* ignore */
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Shamaadan', {
      body: payload.body || '',
      icon: '/assets/images/logo.png',
      badge: '/assets/images/logo.png',
      tag: payload.tag || 'shamaadan-order',
      renotify: true,
      data: {
        url: payload.url || '/?app=admin&view=website-orders',
        ...(payload.data || {}),
      },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/?app=admin&view=website-orders';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) {
            try {
              client.navigate(targetUrl);
            } catch {
              /* ignore */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    }),
  );
});
