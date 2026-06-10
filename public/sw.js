/* eslint-disable no-undef */
const CACHE_NAME = 'webtoon-index-pwa-v2'

const cacheCopy = (request, response) => {
  const copy = response.clone()
  caches
    .open(CACHE_NAME)
    .then((cache) => cache.put(request, copy))
    .catch(() => {})
}

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  // App shell: network-first so deploys land immediately, cached copy as offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          cacheCopy(request, response)
          return response
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/'))),
    )
    return
  }

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Hashed bundles are immutable (vercel.json: max-age=31536000, immutable) — cache-first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) cacheCopy(request, response)
            return response
          }),
      ),
    )
    return
  }

  // Catalog snapshots (vercel.json: stale-while-revalidate) — serve cache, refresh behind.
  if (url.pathname.startsWith('/data/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const refreshed = fetch(request)
          .then((response) => {
            if (response.ok) cacheCopy(request, response)
            return response
          })
          .catch(() => cached)
        return cached || refreshed
      }),
    )
  }
})
