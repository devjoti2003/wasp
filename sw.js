/**
 * WASP Service Worker
 * Enables offline caching, fast cold starts, and Android PWA app installation
 */

const CACHE_NAME = 'wasp-cache-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './firebase-config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/icon.svg'
];

// Install: precache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: remove old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Stale-While-Revalidate for local assets, Network-first / pass-through for Firebase APIs
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Let Firebase / Google APIs bypass service worker cache
  if (url.origin !== self.location.origin) {
    return;
  }

  // Handle local app shell requests
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(event.request);
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      }).catch(() => {
        // Network failed (offline)
        return cachedResponse;
      });

      // Return cached immediately if available, otherwise wait for network
      return cachedResponse || fetchPromise;
    })
  );
});
