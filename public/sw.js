/* eslint-disable no-undef */
const CACHE_NAME = 'webtoon-index-pwa-v3'
const COVER_CACHE_NAME = 'webtoon-index-covers-v1'
const COVER_CACHE_LIMIT = 300

const cacheCopy = (request, response) => {
  const copy = response.clone()
  caches
    .open(CACHE_NAME)
    .then((cache) => cache.put(request, copy))
    .catch(() => {})
}

// Cache keys come back oldest-first, so dropping the head keeps the most recent covers.
const trimCoverCache = (cache) =>
  cache.keys().then((keys) => {
    const excess = keys.length - COVER_CACHE_LIMIT
    if (excess <= 0) return undefined
    return Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)))
  })

// Covers get their own capped cache so image bytes never crowd out the app shell.
const cacheCover = (request, response) => {
  const copy = response.clone()
  caches
    .open(COVER_CACHE_NAME)
    .then((cache) => cache.put(request, copy).then(() => trimCoverCache(cache)))
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
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key !== COVER_CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
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

  // Cover proxy (catalog.controller proxyCover: max-age=2592000, immutable) — cache-first into
  // the capped cover cache. Other /api/ routes stay uncached so data freshness is preserved.
  if (url.pathname === '/api/cover') {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) cacheCover(request, response)
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
