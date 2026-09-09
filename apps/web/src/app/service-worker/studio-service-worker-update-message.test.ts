import { afterEach, describe, expect, it, vi } from "vitest";

const listeners = new Map<string, (event: Record<string, unknown>) => void>();

async function loadWorker(): Promise<{ readonly skipWaiting: ReturnType<typeof vi.fn> }> {
  const skipWaiting = vi.fn(async () => undefined);
  vi.stubGlobal("self", {
    addEventListener: (type: string, listener: (event: Record<string, unknown>) => void) => {
      listeners.set(type, listener);
    },
    skipWaiting,
    clients: { claim: vi.fn(async () => undefined) },
    registration: {
      unregister: vi.fn(async () => true),
      navigationPreload: { enable: vi.fn(async () => undefined) },
    },
    location: { origin: "https://toonspectrum.test" },
  });
  vi.stubGlobal("__STUDIO_SERVICE_WORKER_MANIFEST__", {
    buildId: "update-test",
    shellUrls: ["/", "/studio"],
    criticalUrls: [],
    warmUrls: [],
  });
  vi.resetModules();
  await import("./studio-service-worker-entry");
  return { skipWaiting };
}

afterEach(() => {
  listeners.clear();
  vi.unstubAllGlobals();
});

describe("service worker update acknowledgement", () => {
  it("acknowledges the user's update request after skipWaiting resolves", async () => {
    const { skipWaiting } = await loadWorker();
    const replies: unknown[] = [];
    let waited: Promise<unknown> = Promise.resolve();

    listeners.get("message")?.({
      data: { type: "toonspectrum-sw:apply-update" },
      ports: [{ postMessage: (value: unknown) => replies.push(value) }],
      waitUntil: (value: Promise<unknown>) => { waited = value; },
    });
    await waited;

    expect(skipWaiting).toHaveBeenCalledTimes(1);
    expect(replies).toEqual([{ ok: true }]);
  });
});
