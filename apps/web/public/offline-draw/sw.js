/* Scoped to /offline-draw/. No API interception, automatic takeover or cache deletion. */
self.importScripts('/offline-draw/cache.js');
self.addEventListener('install', (event) => { event.waitUntil(self.ToonLocalCache.prepare()); });
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith('/offline-draw/')) return;
  if (url.pathname === '/offline-draw/sw.js') return;
  event.respondWith((async () => (await self.ToonLocalCache.respond(event.request)) ?? fetch(event.request))());
});
