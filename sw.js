/* MAEA service worker — local shell + visited scenes (offline after caching). */
const VERSION = 'maea-shell-1';
const IMAGE_CACHE = 'maea-scenes-1';
const CORE = ['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./favicon.svg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => ![VERSION,IMAGE_CACHE].includes(k)).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin) {
    if (event.request.mode === 'navigate') {
      event.respondWith(fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(VERSION).then(c => c.put('./index.html', copy));
        return response;
      }).catch(() => caches.match('./index.html')));
    } else {
      event.respondWith(fetch(event.request).then(response => {
        if (response.ok) caches.open(VERSION).then(c => c.put(event.request, response.clone()));
        return response;
      }).catch(() => caches.match(event.request)));
    }
  } else if (url.hostname === 'images.unsplash.com') {
    event.respondWith(caches.open(IMAGE_CACHE).then(async cache => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok || response.type === 'opaque') {
        await cache.put(event.request, response.clone());
        const keys = await cache.keys();
        if (keys.length > 18) await cache.delete(keys[0]);
      }
      return response;
    }));
  }
});
