/// <reference lib="webworker" />
/**
 * ToonSpectrum Service Worker runtime. Updates wait for explicit consent;
 * only GET assets are cached. Manuscripts and writes remain owned by the app.
 */
import { resolveStudioNavigation } from "./studio-service-worker-navigation";
import { prepareStudioOfflineResources } from "./studio-service-worker-offline";
import {
  STUDIO_SERVICE_WORKER_MESSAGE,
  STUDIO_SERVICE_WORKER_RUNTIME_LIMITS,
  classifyStudioServiceWorkerRequest,
  isStudioServiceWorkerCachedResponseUsable,
  isStudioServiceWorkerMessage,
  isStudioServiceWorkerResponseCacheable,
  legacyStudioServiceWorkerCacheNames,
  planStudioServiceWorkerCacheTrim,
  staleStudioServiceWorkerCacheNames,
  studioServiceWorkerCacheBucket,
  studioServiceWorkerCacheNames,
  studioServiceWorkerOfflineShellUrl,
  studioServiceWorkerStrategy,
  type StudioServiceWorkerCacheBucket,
  type StudioServiceWorkerRouteClass,
} from "./studio-service-worker-policy";
import {
  cachedLocalDrawingRescue,
  clearLocalDrawingCaches,
  installLocalDrawingRescue,
  isLocalDrawingRequest,
  localDrawingResponse,
  localDrawingRescueReady,
} from "./studio-local-drawing-rescue";

import type { StudioServiceWorkerManifest } from "./studio-service-worker-precache-plan";

import { isStudioOfflinePreparationMessage } from "../../shared/lib/studio-offline-protocol";

declare const __STUDIO_SERVICE_WORKER_MANIFEST__: StudioServiceWorkerManifest;

const scope = self as unknown as ServiceWorkerGlobalScope;
const manifest = __STUDIO_SERVICE_WORKER_MANIFEST__;
const cacheNames = studioServiceWorkerCacheNames(manifest.buildId);
const RUNTIME_LIMIT_BY_BUCKET: Record<StudioServiceWorkerCacheBucket, number> = {
  precache: Number.POSITIVE_INFINITY,
  immutable: STUDIO_SERVICE_WORKER_RUNTIME_LIMITS.immutable,
  media: STUDIO_SERVICE_WORKER_RUNTIME_LIMITS.media,
  data: STUDIO_SERVICE_WORKER_RUNTIME_LIMITS.data,
  cover: STUDIO_SERVICE_WORKER_RUNTIME_LIMITS.cover,
};
const putsSinceTrim = new Map<StudioServiceWorkerCacheBucket, number>();
const TRIM_INTERVAL = 25;

async function trimBucket(cache: Cache, bucket: StudioServiceWorkerCacheBucket): Promise<void> {
  const limit = RUNTIME_LIMIT_BY_BUCKET[bucket];
  if (!Number.isFinite(limit)) return;
  const pending = (putsSinceTrim.get(bucket) ?? 0) + 1;
  if (pending < TRIM_INTERVAL) { putsSinceTrim.set(bucket, pending); return; }
  putsSinceTrim.set(bucket, 0);
  const keys = await cache.keys();
  await Promise.all(planStudioServiceWorkerCacheTrim(keys, limit).map((key) => cache.delete(key)));
}

async function persist(bucket: StudioServiceWorkerCacheBucket, request: Request, response: Response): Promise<void> {
  if (!isStudioServiceWorkerResponseCacheable(response)) return;
  try {
    const cache = await caches.open(cacheNames[bucket]);
    await cache.put(request, response.clone());
    await trimBucket(cache, bucket);
  } catch {
    // Quota/storage failures must never turn a successful online load into an error.
    // Explicit offline preparation verifies every write with a subsequent read.
  }
}

async function readCached(
  bucket: StudioServiceWorkerCacheBucket,
  request: Request,
  routeClass: StudioServiceWorkerRouteClass,
): Promise<Response | undefined> {
  try {
    const cache = await caches.open(cacheNames[bucket]);
    const cached = await cache.match(request, { ignoreVary: true });
    if (!cached) return undefined;
    if (isStudioServiceWorkerCachedResponseUsable({
      routeClass, destination: request.destination, url: request.url, status: cached.status,
      crossOriginResourcePolicy: cached.headers.get("cross-origin-resource-policy"),
    })) return cached;
    await cache.delete(request);
  } catch { /* A restricted Cache API is a miss, not a failed network request. */ }
  return undefined;
}

async function handleCacheFirst(
  request: Request,
  bucket: StudioServiceWorkerCacheBucket,
  routeClass: StudioServiceWorkerRouteClass,
): Promise<Response> {
  // First-install critical assets may exist only in precache. Requiring a second
  // online visit to duplicate them into the runtime bucket breaks offline boot.
  const critical = routeClass === "immutable-asset"
    ? await readCached("precache", request, routeClass) : undefined;
  const cached = critical ?? await readCached(bucket, request, routeClass);
  if (cached) return cached;
  const response = await fetch(request);
  await persist(bucket, request, response);
  return response;
}

async function handleStaleWhileRevalidate(
  event: FetchEvent, request: Request, bucket: StudioServiceWorkerCacheBucket,
  routeClass: StudioServiceWorkerRouteClass,
): Promise<Response> {
  const cached = await readCached(bucket, request, routeClass);
  const refresh = fetch(request).then(async (response) => {
    await persist(bucket, request, response);
    return response;
  }).catch(() => undefined);
  if (cached) { event.waitUntil(refresh); return cached; }
  const fresh = await refresh;
  if (fresh) return fresh;
  throw new Error(`offline and uncached: ${request.url}`);
}

let warmUpStarted = false;
let warming: Promise<void> | null = null;

function warmStudioPayload(): Promise<void> {
  if (warming) return warming;
  if (warmUpStarted) return Promise.resolve();
  const run = async (): Promise<void> => {
    let failed = false;
    const queue = [...manifest.warmUrls];
    const worker = async (): Promise<void> => {
      for (;;) {
        const url = queue.shift();
        if (url === undefined) return;
        const request = new Request(url, { credentials: "same-origin" });
        const routeClass = classifyStudioServiceWorkerRequest({
          url: request.url, origin: scope.location.origin, method: "GET", destination: request.destination,
        });
        const bucket = studioServiceWorkerCacheBucket(routeClass);
        if (!bucket || bucket === "precache") continue;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12_000);
        try {
          if (await readCached(bucket, request, routeClass)) continue;
          await persist(bucket, request, await fetch(request, { signal: controller.signal }));
          if (!await readCached(bucket, request, routeClass)) failed = true;
        } catch { failed = true; } finally { clearTimeout(timer); }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    // A failed warm-up is retried on the next Studio navigation, never in a loop.
    warmUpStarted = !failed;
  };
  warming = run().finally(() => { warming = null; });
  return warming;
}

function shellRequest(url: string): Request {
  return new Request(url, {
    credentials: "same-origin", headers: { Accept: "text/html,application/xhtml+xml" },
  });
}

async function handleNavigation(event: FetchEvent, routeClass: StudioServiceWorkerRouteClass): Promise<Response> {
  if (routeClass === "studio-navigation") event.waitUntil(warmStudioPayload());
  const pathname = new URL(event.request.url).pathname;
  return resolveStudioNavigation({
    request: event.request, preloadResponse: event.preloadResponse,
    isolated: routeClass === "studio-navigation", shellUrls: manifest.shellUrls,
    readRescue: routeClass === "studio-navigation" ? async () =>
      await localDrawingRescueReady() ? cachedLocalDrawingRescue() : undefined : undefined,
    readShell: async () => {
      const cache = await caches.open(cacheNames.precache);
      return cache.match(shellRequest(studioServiceWorkerOfflineShellUrl(pathname)), { ignoreVary: true });
    },
    refreshShell: (response) => persist("precache", shellRequest(pathname), response),
    waitUntil: (promise) => event.waitUntil(promise),
  });
}

scope.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await installLocalDrawingRescue();
    const cache = await caches.open(cacheNames.precache);
    // addAll is atomic: a broken deploy cannot replace a working critical cache.
    await cache.addAll(manifest.criticalUrls.map((url) => new Request(url)));
    await Promise.all(manifest.shellUrls.map((url) => cache.add(shellRequest(url))));
  })());
  // Deliberately no skipWaiting: a live editor keeps its current code and caches.
});

scope.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try { await scope.registration.navigationPreload?.enable(); } catch { /* Optional. */ }
    const existing = await caches.keys();
    const doomed = [...staleStudioServiceWorkerCacheNames(existing, manifest.buildId), ...legacyStudioServiceWorkerCacheNames(existing)];
    await Promise.all(doomed.map((name) => caches.delete(name)));
    await scope.clients.claim();
  })());
});

scope.addEventListener("fetch", (event) => {
  const { request } = event;
  if (isLocalDrawingRequest(request, scope.location.origin)) {
    event.respondWith(localDrawingResponse(request));
    return;
  }
  const routeClass = classifyStudioServiceWorkerRequest({
    url: request.url, origin: scope.location.origin, method: request.method,
    mode: request.mode, destination: request.destination, rangeHeader: request.headers.get("range"),
  });
  const strategy = studioServiceWorkerStrategy(routeClass);
  if (strategy === "network-only") return;
  const bucket = studioServiceWorkerCacheBucket(routeClass);
  if (!bucket) return;
  if (strategy === "network-first") { event.respondWith(handleNavigation(event, routeClass)); return; }
  if (strategy === "cache-first") { event.respondWith(handleCacheFirst(request, bucket, routeClass)); return; }
  event.respondWith(handleStaleWhileRevalidate(event, request, bucket, routeClass));
});

async function killStudioServiceWorker(): Promise<void> {
  const existing = await caches.keys();
  const doomed = [...staleStudioServiceWorkerCacheNames(existing, "__none__"),
    ...legacyStudioServiceWorkerCacheNames(existing), ...Object.values(cacheNames)];
  await Promise.all([...new Set(doomed)].map((name) => caches.delete(name)));
  await clearLocalDrawingCaches();
  await scope.registration.unregister();
}

async function describeStudioServiceWorker(): Promise<Record<string, unknown>> {
  const entries: Record<string, number> = {};
  for (const [bucket, name] of Object.entries(cacheNames)) {
    try { entries[bucket] = (await (await caches.open(name)).keys()).length; }
    catch { entries[bucket] = -1; }
  }
  return { buildId: manifest.buildId, cacheNames, entries,
    criticalUrls: manifest.criticalUrls.length, warmUrls: manifest.warmUrls.length, warmUpStarted };
}

let preparationInFlight = false;

async function prepareOffline(urls: readonly string[]): Promise<unknown> {
  if (preparationInFlight) return { ok: false, error: "offline-preparation-busy" };
  preparationInFlight = true;
  const classify = (url: string): StudioServiceWorkerRouteClass => classifyStudioServiceWorkerRequest({
    url: new URL(url, scope.location.origin).href, origin: scope.location.origin,
    method: "GET", mode: manifest.shellUrls.includes(url) ? "navigate" : undefined,
  });
  try {
    return await prepareStudioOfflineResources({
      origin: scope.location.origin, buildId: manifest.buildId, urls,
      drawingUrls: manifest.offlineUrls ?? [],
      shellUrls: manifest.shellUrls, criticalUrls: manifest.criticalUrls, warmUrls: manifest.warmUrls,
      read: async (url) => {
        const routeClass = classify(url);
        const request = manifest.shellUrls.includes(url) ? shellRequest(url) : new Request(url);
        const critical = await readCached("precache", request, routeClass);
        if (critical) return critical;
        const bucket = studioServiceWorkerCacheBucket(routeClass);
        const cached = bucket ? await readCached(bucket, request, routeClass) : undefined;
        if (cached && (manifest.offlineUrls ?? []).includes(url)) {
          // Only the build-bounded core pack is pinned against runtime trimming.
          await persist("precache", request, cached);
          const pinned = await readCached("precache", request, routeClass);
          if (pinned && bucket && bucket !== "precache") {
            // Remove a redundant copy only after the protected copy is verified.
            await caches.open(cacheNames[bucket]).then((cache) => cache.delete(request)).catch(() => undefined);
          }
          return pinned;
        }
        return cached;
      },
      write: async (url, response) => {
        const bucket = manifest.shellUrls.includes(url) || manifest.criticalUrls.includes(url)
          || (manifest.offlineUrls ?? []).includes(url)
          ? "precache" : studioServiceWorkerCacheBucket(classify(url));
        if (bucket) await persist(bucket, new Request(url), response);
      },
    });
  } finally { preparationInFlight = false; }
}

scope.addEventListener("message", (event) => {
  const data: unknown = event.data;
  const reply = (payload: unknown): void => { event.ports[0]?.postMessage(payload); };
  if (data && typeof data === "object" && "type" in data && data.type === "toonstudio-local-drawing:inspect") {
    event.waitUntil(localDrawingRescueReady().then(
      (ready) => reply({ type: "toonstudio-local-drawing:ready", ready }),
      () => reply({ type: "toonstudio-local-drawing:ready", ready: false }),
    ));
    return;
  }
  if (isStudioOfflinePreparationMessage(data)) {
    // Only a same-origin Studio client may request explicit preparation. Never
    // accept URLs from arbitrary frames, the public catalogue, or worker peers.
    const source = event.source;
    if (!source || !("url" in source)) return;
    const url = new URL(source.url);
    if (url.origin !== scope.location.origin || !(url.pathname === "/studio" || url.pathname.startsWith("/studio/"))) return;
    event.waitUntil(prepareOffline(data.urls).then(reply, () => reply({ ok: false, error: "offline-preparation-failed" })));
    return;
  }
  if (!isStudioServiceWorkerMessage(data)) return;
  switch (data.type) {
    case STUDIO_SERVICE_WORKER_MESSAGE.applyUpdate:
      event.waitUntil(scope.skipWaiting().then(
        () => reply({ ok: true }), (error: unknown) => reply({ ok: false, error: String(error) }),
      ));
      break;
    case STUDIO_SERVICE_WORKER_MESSAGE.kill:
      event.waitUntil(killStudioServiceWorker().then(
        () => reply({ ok: true }), (error: unknown) => reply({ ok: false, error: String(error) }),
      ));
      break;
    case STUDIO_SERVICE_WORKER_MESSAGE.inspect:
      event.waitUntil(describeStudioServiceWorker().then(reply));
      break;
  }
});
