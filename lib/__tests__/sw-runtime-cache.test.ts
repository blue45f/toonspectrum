import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ORIGIN = "https://toonspectrum.test";
const source = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
const cacheName = source.match(/const CACHE_NAME = '([^']+)'/)?.[1] ?? "";
const coverCacheName = source.match(/const COVER_CACHE_NAME = '([^']+)'/)?.[1] ?? "";
const coverCacheLimit = Number(source.match(/const COVER_CACHE_LIMIT = (\d+)/)?.[1] ?? 0);

const coverPath = (upstream: string) => `/api/cover?u=${encodeURIComponent(upstream)}`;

interface WorkerRequest {
  url: string;
  method: string;
  mode: string;
}

interface WorkerEvent {
  request?: WorkerRequest;
  respondWith?: (value: Response | undefined | Promise<Response | undefined>) => void;
  waitUntil?: (value: Promise<unknown>) => void;
}

const request = (path: string, overrides: Partial<WorkerRequest> = {}): WorkerRequest => ({
  url: new URL(path, ORIGIN).href,
  method: "GET",
  mode: "cors",
  ...overrides,
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// Runs public/sw.js against in-memory ServiceWorker globals so each caching
// strategy can be exercised without a browser.
function createWorker() {
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const fetchCalls: string[] = [];
  const counters = { claim: 0 };
  let network: (target: WorkerRequest) => Promise<Response> = () =>
    Promise.reject(new Error("offline"));

  const keyOf = (target: WorkerRequest | string) =>
    new URL(typeof target === "string" ? target : target.url, ORIGIN).href;
  const storeOf = (name: string) => {
    let store = stores.get(name);
    if (!store) {
      store = new Map();
      stores.set(name, store);
    }
    return store;
  };
  const workerFetch = (target: WorkerRequest) => {
    fetchCalls.push(keyOf(target));
    return network(target);
  };

  const cachesMock = {
    open: async (name: string) => {
      const store = storeOf(name);
      return {
        put: async (target: WorkerRequest | string, response: Response) => {
          store.set(keyOf(target), response);
        },
        // Real Cache.add fetches the target and rejects on non-ok responses.
        add: async (target: WorkerRequest | string) => {
          const response = await workerFetch(typeof target === "string" ? request(target) : target);
          if (!response.ok) throw new Error(`cache.add failed: ${response.status}`);
          store.set(keyOf(target), response);
        },
        match: async (target: WorkerRequest | string) => store.get(keyOf(target))?.clone(),
        // Real Cache.keys() yields entries oldest-first; Map iteration order mirrors that.
        keys: async () => [...store.keys()],
        delete: async (target: WorkerRequest | string) => store.delete(keyOf(target)),
      };
    },
    match: async (target: WorkerRequest | string) => {
      const key = keyOf(target);
      for (const store of stores.values()) {
        const hit = store.get(key);
        if (hit) return hit.clone();
      }
      return undefined;
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };

  const workerSelf = {
    addEventListener: (type: string, listener: (event: WorkerEvent) => void) => {
      listeners.set(type, listener);
    },
    skipWaiting: () => {},
    clients: {
      claim: async () => {
        counters.claim += 1;
      },
    },
    location: { origin: ORIGIN },
  };

  new Function("self", "caches", "fetch", source)(workerSelf, cachesMock, workerFetch);

  return {
    fetchCalls,
    claimCount: () => counters.claim,
    cacheKeys: () => [...stores.keys()],
    setNetwork(impl: (target: WorkerRequest) => Promise<Response>) {
      network = impl;
    },
    seed(name: string, path: string, response: Response) {
      storeOf(name).set(keyOf(path), response);
    },
    cached(name: string, path: string) {
      return stores.get(name)?.get(keyOf(path));
    },
    cachedCount(name: string) {
      return stores.get(name)?.size ?? 0;
    },
    async dispatchFetch(target: WorkerRequest) {
      let handled = false;
      let responded: Response | undefined | Promise<Response | undefined>;
      listeners.get("fetch")?.({
        request: target,
        respondWith: (value) => {
          handled = true;
          responded = value;
        },
      });
      return { handled, response: await responded };
    },
    async dispatchInstall() {
      let waited: Promise<unknown> = Promise.resolve();
      listeners.get("install")?.({
        waitUntil: (value) => {
          waited = value;
        },
      });
      await waited;
    },
    async dispatchActivate() {
      let waited: Promise<unknown> = Promise.resolve();
      listeners.get("activate")?.({
        waitUntil: (value) => {
          waited = value;
        },
      });
      await waited;
    },
  };
}

describe("service worker runtime caching", () => {
  it("retires superseded cache names so stale runtime caches get purged", () => {
    expect(cacheName).toMatch(/^webtoon-index-pwa-v\d+$/);
    expect(cacheName).not.toBe("webtoon-index-pwa-v1");
    expect(cacheName).not.toBe("webtoon-index-pwa-v2");
    expect(coverCacheName).toMatch(/^webtoon-index-covers-v\d+$/);
  });

  it("precaches the app shell on install so first-run deep links can fall back offline", async () => {
    const worker = createWorker();
    worker.setNetwork(async () => new Response("<html>shell</html>", { status: 200 }));

    await worker.dispatchInstall();
    expect(worker.fetchCalls).toEqual([new URL("/", ORIGIN).href]);
    expect(worker.cached(cacheName, "/")).toBeDefined();

    worker.setNetwork(() => Promise.reject(new Error("offline")));
    const deepLink = await worker.dispatchFetch(request("/title/never-visited", { mode: "navigate" }));
    expect(await deepLink.response?.text()).toBe("<html>shell</html>");
  });

  it("deletes previous-version caches on activate and claims clients", async () => {
    const worker = createWorker();
    worker.seed("webtoon-index-pwa-v1", "/", new Response("old shell"));
    worker.seed(cacheName, "/", new Response("current shell"));

    await worker.dispatchActivate();

    expect(worker.cacheKeys()).toEqual([cacheName]);
    expect(worker.claimCount()).toBe(1);
  });

  it("serves hashed /assets/ bundles cache-first without hitting the network", async () => {
    const worker = createWorker();
    worker.seed(cacheName, "/assets/index-abc123.js", new Response("cached bundle"));

    const { handled, response } = await worker.dispatchFetch(request("/assets/index-abc123.js"));

    expect(handled).toBe(true);
    expect(await response?.text()).toBe("cached bundle");
    expect(worker.fetchCalls).toEqual([]);
  });

  it("fills the /assets/ cache from the network and reuses it offline", async () => {
    const worker = createWorker();
    worker.setNetwork(async () => new Response("fresh bundle", { status: 200 }));

    const first = await worker.dispatchFetch(request("/assets/index-abc123.js"));
    expect(await first.response?.text()).toBe("fresh bundle");
    await flush();

    worker.setNetwork(() => Promise.reject(new Error("offline")));
    const second = await worker.dispatchFetch(request("/assets/index-abc123.js"));
    expect(await second.response?.text()).toBe("fresh bundle");
    expect(worker.fetchCalls).toHaveLength(1);
  });

  it("does not pin non-ok /assets/ responses in the cache", async () => {
    const worker = createWorker();
    worker.setNetwork(async () => new Response("not found", { status: 404 }));

    const { response } = await worker.dispatchFetch(request("/assets/missing.js"));
    expect(response?.status).toBe(404);
    await flush();

    expect(worker.cached(cacheName, "/assets/missing.js")).toBeUndefined();
  });

  it("keeps the cover cache across activate while purging stale shell caches", async () => {
    const worker = createWorker();
    worker.seed("webtoon-index-pwa-v2", "/", new Response("old shell"));
    worker.seed(cacheName, "/", new Response("current shell"));
    worker.seed(coverCacheName, coverPath("https://img.ridicdn.net/cover.jpg"), new Response("cover"));

    await worker.dispatchActivate();

    expect(worker.cacheKeys().sort()).toEqual([cacheName, coverCacheName].sort());
  });

  it("serves /api/cover cache-first without hitting the network", async () => {
    const worker = createWorker();
    const cover = coverPath("https://ccdn.lezhin.com/v2/comics/1/images/wide.jpg");
    worker.seed(coverCacheName, cover, new Response("cached cover"));

    const { handled, response } = await worker.dispatchFetch(request(cover));

    expect(handled).toBe(true);
    expect(await response?.text()).toBe("cached cover");
    expect(worker.fetchCalls).toEqual([]);
  });

  it("fills the cover cache from the network and reuses it offline", async () => {
    const worker = createWorker();
    worker.setNetwork(async () => new Response("cover bytes", { status: 200 }));

    const cover = coverPath("https://image.yes24.com/goods/1/L");
    const first = await worker.dispatchFetch(request(cover));
    expect(await first.response?.text()).toBe("cover bytes");
    await flush();

    expect(worker.cached(coverCacheName, cover)).toBeDefined();
    expect(worker.cached(cacheName, cover)).toBeUndefined();

    worker.setNetwork(() => Promise.reject(new Error("offline")));
    const second = await worker.dispatchFetch(request(cover));
    expect(await second.response?.text()).toBe("cover bytes");
    expect(worker.fetchCalls).toHaveLength(1);
  });

  it("does not pin non-ok cover responses in the cache", async () => {
    const worker = createWorker();
    worker.setNetwork(async () => new Response("forbidden host", { status: 403 }));

    const cover = coverPath("https://evil.example/cover.jpg");
    const { response } = await worker.dispatchFetch(request(cover));
    expect(response?.status).toBe(403);
    await flush();

    expect(worker.cached(coverCacheName, cover)).toBeUndefined();
  });

  it("caps the cover cache by evicting the oldest covers", async () => {
    expect(coverCacheLimit).toBeGreaterThan(0);
    const worker = createWorker();
    for (let i = 0; i < coverCacheLimit; i += 1) {
      worker.seed(coverCacheName, coverPath(`https://img.ridicdn.net/${i}.jpg`), new Response(`cover ${i}`));
    }
    worker.setNetwork(async () => new Response("newest cover", { status: 200 }));

    const newest = coverPath("https://img.ridicdn.net/newest.jpg");
    await worker.dispatchFetch(request(newest));
    await flush();

    expect(worker.cachedCount(coverCacheName)).toBe(coverCacheLimit);
    expect(worker.cached(coverCacheName, coverPath("https://img.ridicdn.net/0.jpg"))).toBeUndefined();
    expect(worker.cached(coverCacheName, newest)).toBeDefined();
  });

  it("leaves other /api/ routes to the network so data stays fresh", async () => {
    const worker = createWorker();

    const search = await worker.dispatchFetch(request("/api/search?q=%EB%82%98%20%ED%98%BC%EC%9E%90"));
    const ranking = await worker.dispatchFetch(request("/api/rankings"));

    expect(search.handled).toBe(false);
    expect(ranking.handled).toBe(false);
    expect(worker.fetchCalls).toEqual([]);
  });

  it("serves /data/ JSON stale-while-revalidate: cached now, refreshed behind", async () => {
    const worker = createWorker();
    worker.seed(cacheName, "/data/catalog.json", new Response('{"rev":"stale"}'));
    worker.setNetwork(async () => new Response('{"rev":"fresh"}', { status: 200 }));

    const { response } = await worker.dispatchFetch(request("/data/catalog.json"));
    expect(await response?.text()).toBe('{"rev":"stale"}');
    expect(worker.fetchCalls).toEqual([new URL("/data/catalog.json", ORIGIN).href]);

    await flush();
    const revalidated = worker.cached(cacheName, "/data/catalog.json");
    expect(await revalidated?.clone().text()).toBe('{"rev":"fresh"}');
  });

  it("falls through to the network for uncached /data/ and primes the cache", async () => {
    const worker = createWorker();
    worker.setNetwork(async () => new Response('{"rev":"first"}', { status: 200 }));

    const { response } = await worker.dispatchFetch(request("/data/calendar.json"));
    expect(await response?.text()).toBe('{"rev":"first"}');
    await flush();

    worker.setNetwork(() => Promise.reject(new Error("offline")));
    const offline = await worker.dispatchFetch(request("/data/calendar.json"));
    expect(await offline.response?.text()).toBe('{"rev":"first"}');
  });

  it("keeps navigations network-first with the cached shell as offline fallback", async () => {
    const worker = createWorker();
    worker.setNetwork(async () => new Response("<html>live</html>", { status: 200 }));

    const online = await worker.dispatchFetch(request("/ranking", { mode: "navigate" }));
    expect(await online.response?.text()).toBe("<html>live</html>");
    await flush();

    worker.setNetwork(() => Promise.reject(new Error("offline")));
    const revisit = await worker.dispatchFetch(request("/ranking", { mode: "navigate" }));
    expect(await revisit.response?.text()).toBe("<html>live</html>");

    worker.seed(cacheName, "/", new Response("<html>shell</html>"));
    const uncachedRoute = await worker.dispatchFetch(request("/insights", { mode: "navigate" }));
    expect(await uncachedRoute.response?.text()).toBe("<html>shell</html>");
  });

  it("leaves cross-origin and non-GET requests to the browser", async () => {
    const worker = createWorker();

    const font = await worker.dispatchFetch(request("https://fonts.gstatic.com/s/font.woff2"));
    const post = await worker.dispatchFetch(request("/data/catalog.json", { method: "POST" }));

    expect(font.handled).toBe(false);
    expect(post.handled).toBe(false);
    expect(worker.fetchCalls).toEqual([]);
  });
});
