/** Runs the real worker against in-memory ServiceWorker globals. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGIN = "https://toonspectrum.test";
const BUILD_ID = "testbuild001";
const PRECACHE = `toonspectrum-sw-precache-v5-${BUILD_ID}`;
const MANIFEST = {
  buildId: BUILD_ID, shellUrls: ["/", "/studio"],
  criticalUrls: ["/assets/index-abc.js", "/assets/index-abc.css"],
  warmUrls: ["/i18n/studio/mainMenu/ko.json"],
  offlineUrls: ["/assets/pen-def.js"],
};
interface Listener { (event: Record<string, unknown>): void }

function createCacheStorage() {
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (target: Request | string): string => new URL(typeof target === "string" ? target : target.url, ORIGIN).href;
  const storeOf = (name: string): Map<string, Response> => {
    const existing = stores.get(name);
    if (existing) return existing;
    const created = new Map<string, Response>(); stores.set(name, created); return created;
  };
  const openCache = (name: string) => {
    const store = storeOf(name);
    return {
      put: async (target: Request | string, response: Response) => { store.set(keyOf(target), response); },
      add: async (target: Request | string) => {
        const response = await fetch(target);
        if (!response.ok) throw new Error(`cache.add failed: ${response.status}`);
        store.set(keyOf(target), response);
      },
      addAll: async (targets: Array<Request | string>) => {
        const staged = new Map<string, Response>();
        for (const target of targets) {
          const response = await fetch(target);
          if (!response.ok) throw new Error(`addAll failed: ${response.status}`);
          staged.set(keyOf(target), response);
        }
        for (const [key, value] of staged) store.set(key, value);
      },
      match: async (target: Request | string) => store.get(keyOf(target))?.clone(),
      keys: async () => [...store.keys()],
      delete: async (target: Request | string) => store.delete(keyOf(target)),
    };
  };
  return {
    api: { open: async (name: string) => openCache(name), keys: async () => [...stores.keys()], delete: async (name: string) => stores.delete(name) },
    stores,
    seed(name: string, url: string, response: Response) { storeOf(name).set(keyOf(url), response); },
    entries(name: string) { return [...(stores.get(name)?.keys() ?? [])]; },
  };
}

function createHarness() {
  const listeners = new Map<string, Listener>();
  const counters = { claim: 0, skipWaiting: 0, unregister: 0, preload: 0 };
  const caches = createCacheStorage();
  const fetchCalls: string[] = [];
  let network: (url: string) => Promise<Response> = async () => new Response("ok", { status: 200 });
  const workerFetch = vi.fn(async (target: Request | string | URL) => {
    const url = typeof target === "string" || target instanceof URL ? new URL(target, ORIGIN).href : target.url;
    fetchCalls.push(url); return network(url);
  });
  const scope = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: async () => { counters.skipWaiting += 1; },
    clients: { claim: async () => { counters.claim += 1; } },
    registration: {
      unregister: async () => { counters.unregister += 1; return true; },
      navigationPreload: { enable: async () => { counters.preload += 1; } },
    },
    location: { origin: ORIGIN },
  };
  const ScopedRequest = class extends Request {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(typeof input === "string" ? new URL(input, ORIGIN).href : input, init);
    }
  };
  vi.stubGlobal("location", scope.location); vi.stubGlobal("self", scope); vi.stubGlobal("caches", caches.api);
  vi.stubGlobal("fetch", workerFetch); vi.stubGlobal("Request", ScopedRequest);
  vi.stubGlobal("__STUDIO_SERVICE_WORKER_MANIFEST__", MANIFEST);
  return {
    listeners, counters, caches, fetchCalls,
    setNetwork(impl: (url: string) => Promise<Response>) { network = impl; },
    async dispatch(type: string, event: Record<string, unknown> = {}) {
      const pending: Promise<unknown>[] = [];
      let responded: Promise<Response> | Response | undefined;
      listeners.get(type)?.({ ...event,
        waitUntil: (value: Promise<unknown>) => { pending.push(value); },
        respondWith: (value: Promise<Response> | Response) => { responded = value; },
      });
      const response = await Promise.resolve(responded).catch(() => undefined);
      const waited = Promise.all(pending);
      await waited.catch(() => undefined);
      return { response, waited };
    },
  };
}
let harness: ReturnType<typeof createHarness>;
async function loadWorker(): Promise<void> { vi.resetModules(); await import("./studio-service-worker-entry"); }
function navigationEvent(path: string) {
  return { request: { url: new URL(path, ORIGIN).href, method: "GET", mode: "navigate", destination: "document", headers: new Headers() },
    preloadResponse: Promise.resolve(undefined) };
}
function shell(body: string, isolated = false): Response {
  return new Response(body, { headers: { "content-type": "text/html",
    ...(isolated ? { "cross-origin-opener-policy": "same-origin", "cross-origin-embedder-policy": "credentialless" } : {}) } });
}
function assetResponse(url: string): Response {
  const mime = url.endsWith(".js") ? "application/javascript" : url.endsWith(".css") ? "text/css" : "text/html";
  return new Response(url.endsWith("/offline-drawing.html") ? "local rescue" : "body", { headers: { "content-type": mime } });
}
beforeEach(() => { harness = createHarness(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("install", () => {
  it("precaches the critical set plus both shells and never skips waiting", async () => {
    harness.setNetwork(async (url) => assetResponse(url));
    await loadWorker(); await harness.dispatch("install");
    const precache = harness.caches.entries(PRECACHE);
    expect(precache).toHaveLength(4); expect(precache).toContain(`${ORIGIN}/studio`);
    expect(harness.counters.skipWaiting).toBe(0);
  });
  it("fails install atomically when a critical URL is missing", async () => {
    harness.setNetwork(async (url) => url.endsWith("index-abc.css") ? new Response("gone", { status: 404 }) : assetResponse(url));
    await loadWorker();
    let captured: Promise<unknown> = Promise.resolve();
    harness.listeners.get("install")?.({ waitUntil: (value: Promise<unknown>) => { captured = value; } });
    await expect(captured).rejects.toThrow("addAll failed");
    expect(harness.caches.entries(PRECACHE)).toHaveLength(0);
    expect(harness.counters.skipWaiting).toBe(0);
  });
});

describe("activate", () => {
  it("purges stale and legacy caches, keeps foreign ones, and claims clients", async () => {
    harness.caches.seed("toonspectrum-sw-precache-v5-oldbuild0000", "/", new Response("old"));
    harness.caches.seed("toonspectrum-sw-immutable-v5", "/assets/keep.js", new Response("keep"));
    harness.caches.seed("toonspectrum-pwa-v4", "/assets/legacy.js", new Response("legacy"));
    harness.caches.seed("toonspectrum-covers-v1", "/api/cover", new Response("cover"));
    harness.caches.seed("some-other-app", "/x", new Response("theirs"));
    await loadWorker(); await harness.dispatch("activate");
    expect([...harness.caches.stores.keys()].sort()).toEqual(["some-other-app", "toonspectrum-sw-immutable-v5"]);
    expect(harness.counters.claim).toBe(1); expect(harness.counters.preload).toBe(1);
  });
});

describe("fetch routing", () => {
  it("leaves mutations and other /api/ routes entirely alone", async () => {
    await loadWorker();
    const post = await harness.dispatch("fetch", { request: new Request(`${ORIGIN}/api/works`, { method: "POST" }) });
    const search = await harness.dispatch("fetch", { request: new Request(`${ORIGIN}/api/search?q=x`) });
    expect(post.response).toBeUndefined(); expect(search.response).toBeUndefined(); expect(harness.fetchCalls).toEqual([]);
  });
  it("serves hashed assets cache-first without touching the network", async () => {
    harness.caches.seed("toonspectrum-sw-immutable-v5", "/assets/index-abc.js", new Response("cached bundle"));
    await loadWorker();
    const { response } = await harness.dispatch("fetch", { request: new Request(`${ORIGIN}/assets/index-abc.js`) });
    expect(await response?.text()).toBe("cached bundle"); expect(harness.fetchCalls).toEqual([]);
  });
  it("serves first-install critical code from precache without needing a second online visit", async () => {
    harness.caches.seed(PRECACHE, "/assets/index-abc.js", new Response("critical bundle"));
    harness.setNetwork(async () => { throw new Error("offline"); }); await loadWorker();
    const { response } = await harness.dispatch("fetch", { request: new Request(`${ORIGIN}/assets/index-abc.js`) });
    expect(await response?.text()).toBe("critical bundle"); expect(harness.fetchCalls).toEqual([]);
  });
  it("re-fetches a worker asset cached without CORP instead of replaying it", async () => {
    harness.caches.seed("toonspectrum-sw-immutable-v5", "/assets/studio-engine.worker-abc123.js", new Response("stale worker without CORP"));
    harness.setNetwork(async () => new Response("repaired", { headers: { "cross-origin-resource-policy": "same-origin" } }));
    await loadWorker();
    const { response } = await harness.dispatch("fetch", { request: new Request(`${ORIGIN}/assets/studio-engine.worker-abc123.js`) });
    expect(await response?.text()).toBe("repaired"); expect(harness.fetchCalls).toHaveLength(1);
  });
  it("falls back to the isolated shell for an offline studio navigation", async () => {
    harness.caches.seed(PRECACHE, "/studio", shell("<html>isolated studio shell</html>", true));
    harness.caches.seed(PRECACHE, "/", shell("<html>public shell</html>"));
    harness.setNetwork(async () => { throw new Error("offline"); }); await loadWorker();
    const { response } = await harness.dispatch("fetch", navigationEvent("/studio/work/42"));
    expect(await response?.text()).toBe("<html>isolated studio shell</html>");
    expect(response?.headers.get("cross-origin-opener-policy")).toBe("same-origin");
  });
  it("falls back to the public shell for a non-studio navigation", async () => {
    harness.caches.seed(PRECACHE, "/", shell("<html>public shell</html>"));
    harness.setNetwork(async () => { throw new Error("offline"); }); await loadWorker();
    const { response } = await harness.dispatch("fetch", navigationEvent("/ranking"));
    expect(await response?.text()).toBe("<html>public shell</html>");
  });
  it("falls back on an HTTP 503 without caching the error page", async () => {
    harness.caches.seed(PRECACHE, "/studio", shell("saved shell", true));
    harness.setNetwork(async () => new Response("unavailable", { status: 503 })); await loadWorker();
    const { response } = await harness.dispatch("fetch", navigationEvent("/studio"));
    expect(await response?.text()).toBe("saved shell");
    expect(await (await (await harness.caches.api.open(PRECACHE)).match("/studio"))?.text()).toBe("saved shell");
  });
  it("keeps cache denial non-fatal when the network can serve code", async () => {
    vi.stubGlobal("caches", { open: async () => { throw new Error("denied"); } });
    harness.setNetwork(async () => new Response("online code")); await loadWorker();
    const { response } = await harness.dispatch("fetch", { request: new Request(`${ORIGIN}/assets/index-abc.js`) });
    expect(await response?.text()).toBe("online code");
  });
  it("retries a failed dictionary warm-up on a later navigation", async () => {
    harness.caches.seed(PRECACHE, "/studio", shell("saved shell", true));
    harness.setNetwork(async () => { throw new Error("offline"); }); await loadWorker();
    await harness.dispatch("fetch", navigationEvent("/studio"));
    harness.setNetwork(async (url) => url.includes("/i18n/") ? new Response("{}", { headers: { "content-type": "application/json" } }) : shell("online", true));
    await harness.dispatch("fetch", navigationEvent("/studio"));
    expect(harness.fetchCalls.filter((url) => url.includes("/i18n/"))).toHaveLength(2);
    expect(harness.caches.entries("toonspectrum-sw-data-v5")).toContain(`${ORIGIN}/i18n/studio/mainMenu/ko.json`);
  });
});

describe("messages", () => {
  it("skips waiting only on an explicit apply-update", async () => {
    await loadWorker(); await harness.dispatch("message", { data: { type: "SKIP_WAITING" }, ports: [] });
    expect(harness.counters.skipWaiting).toBe(0);
    await harness.dispatch("message", { data: { type: "toonspectrum-sw:apply-update" }, ports: [] });
    expect(harness.counters.skipWaiting).toBe(1);
  });
  it("kill switch purges every owned cache and unregisters", async () => {
    harness.caches.seed("toonspectrum-sw-immutable-v5", "/assets/a.js", new Response("a"));
    harness.caches.seed("toonspectrum-pwa-v4", "/", new Response("legacy"));
    harness.caches.seed("some-other-app", "/x", new Response("theirs")); await loadWorker();
    const replies: unknown[] = [];
    await harness.dispatch("message", { data: { type: "toonspectrum-sw:kill" }, ports: [{ postMessage: (value: unknown) => replies.push(value) }] });
    expect([...harness.caches.stores.keys()]).toEqual(["some-other-app"]);
    expect(harness.counters.unregister).toBe(1); expect(replies).toEqual([{ ok: true }]);
  });
  it("does not accept preparation requests from foreign or non-studio pages", async () => {
    await loadWorker();
    for (const url of ["https://foreign.test/studio", `${ORIGIN}/market`]) {
      await harness.dispatch("message", { source: { url }, data: { type: "toonspectrum-sw:prepare-offline", urls: ["/assets/a.js"] }, ports: [] });
    }
    expect(harness.fetchCalls).toEqual([]);
  });
});


describe("local drawing rescue integration", () => {
  it("serves a complete installed rescue on an origin outage and acknowledges readiness", async () => {
    harness.setNetwork(async url => assetResponse(url)); await loadWorker();
    const install = await harness.dispatch("install"); await install.waited;
    harness.setNetwork(async () => new Response("server outage", { status: 503 }));
    const { response } = await harness.dispatch("fetch", navigationEvent("/studio/work/offline"));
    expect(await response?.text()).toBe("local rescue");
    const replies: unknown[] = [];
    await harness.dispatch("message", { data: { type: "toonstudio-local-drawing:inspect" }, ports: [{ postMessage: (value: unknown) => replies.push(value) }] });
    expect(replies).toEqual([{ type: "toonstudio-local-drawing:ready", ready: true }]);
    expect(harness.counters.skipWaiting).toBe(0);
  });
});


describe("prepared full editor and rescue coexistence", () => {
  async function preparedWorker(): Promise<void> {
    harness.setNetwork(async (url) => assetResponse(url));
    await loadWorker();
    await (await harness.dispatch("install")).waited;
    harness.caches.seed(PRECACHE, "/studio", shell("prepared editor", true));
    harness.caches.seed(PRECACHE, "/assets/pen-def.js", assetResponse("pen.js"));
    harness.caches.seed("toonspectrum-sw-data-v5", MANIFEST.warmUrls[0], new Response("{}", { headers: { "content-type": "application/json" } }));
    harness.setNetwork(async () => new Response("origin unavailable", { status: 503 }));
  }
  it("serves the fully prepared isolated editor before the installed rescue", async () => {
    await preparedWorker();
    const { response } = await harness.dispatch("fetch", navigationEvent("/studio/canvas?document=local"));
    expect(await response?.text()).toBe("prepared editor");
    expect(response?.headers.get("cross-origin-embedder-policy")).toBe("credentialless");
  });
  it("reports full-pack readiness to the controlling Studio client", async () => {
    await preparedWorker();
    const replies: unknown[] = [];
    await harness.dispatch("message", {
      source: { url: `${ORIGIN}/studio/canvas` },
      data: { type: "toonspectrum-sw:offline-status" },
      ports: [{ postMessage: (value: unknown) => replies.push(value) }],
    });
    expect(replies).toEqual([{ schema: 1, buildId: BUILD_ID, ready: true }]);
  });
  it("keeps the same cached Studio if an optional drawing resource has been evicted", async () => {
    await preparedWorker();
    await (await harness.caches.api.open(PRECACHE)).delete("/assets/pen-def.js");
    const { response } = await harness.dispatch("fetch", navigationEvent("/studio/canvas"));
    expect(await response?.text()).toBe("prepared editor");
  });
  it("keeps the same cached Studio if a dictionary needs recovery", async () => {
    await preparedWorker();
    harness.caches.seed("toonspectrum-sw-data-v5", MANIFEST.warmUrls[0], shell("error page"));
    const { response } = await harness.dispatch("fetch", navigationEvent("/studio/canvas"));
    expect(await response?.text()).toBe("prepared editor");
  });
});
