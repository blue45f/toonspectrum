import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ORIGIN = "https://toonspectrum.test";
const source = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
const cacheName = source.match(/const CACHE_NAME = '([^']+)'/)?.[1] ?? "";

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

  const cachesMock = {
    open: async (name: string) => {
      const store = storeOf(name);
      return {
        put: async (target: WorkerRequest | string, response: Response) => {
          store.set(keyOf(target), response);
        },
        match: async (target: WorkerRequest | string) => store.get(keyOf(target))?.clone(),
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

  new Function("self", "caches", "fetch", source)(
    workerSelf,
    cachesMock,
    (target: WorkerRequest) => {
      fetchCalls.push(keyOf(target));
      return network(target);
    }
  );

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
  it("retires the v1 cache name so stale runtime caches get purged", () => {
    expect(cacheName).toMatch(/^webtoon-index-pwa-v\d+$/);
    expect(cacheName).not.toBe("webtoon-index-pwa-v1");
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
