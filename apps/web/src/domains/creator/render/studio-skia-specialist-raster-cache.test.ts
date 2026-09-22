import { describe, expect, it, vi } from "vitest";

import {
  createStudioSkiaSpecialistRasterCache,
} from "./studio-skia-specialist-raster-cache";

import type {
  StudioSkiaSpecialistRasterElement,
  StudioSkiaSpecialistRasterLease,
  StudioSkiaSpecialistRasterPlan,
} from "./studio-skia-specialist-raster";

function element(id: string): StudioSkiaSpecialistRasterElement {
  return {
    id,
    type: "image",
    src: `${id}.png`,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    rotation: 0,
  };
}

function plan(key: string): StudioSkiaSpecialistRasterPlan {
  return {
    key,
    source: `${key}.png`,
    displayWidth: 1,
    displayHeight: 1,
    density: 1,
    padding: 0,
    pixelWidth: 1,
    pixelHeight: 1,
    contentOffsetX: 0,
    contentOffsetY: 0,
    contentPixelWidth: 1,
    contentPixelHeight: 1,
    filterMaskSource: null,
    layerMaskSource: null,
    hasFilters: false,
    capturesLiveFrame: false,
    frameIdentity: null,
    cornerRadius: 0,
    liveFrameRevision: null,
  };
}

function lease(key: string, bytes: number, release = vi.fn()): StudioSkiaSpecialistRasterLease {
  return {
    key,
    src: `blob:${key}`,
    width: 1,
    height: 1,
    bytes,
    localX: 0,
    localY: 0,
    displayWidth: 1,
    displayHeight: 1,
    capturesLiveFrame: false,
    release,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("createStudioSkiaSpecialistRasterCache", () => {
  it("deduplicates an exact preparation and revokes only after eviction", async () => {
    const release = vi.fn();
    const prepare = vi.fn(async () => lease("same", 6, release));
    const cache = createStudioSkiaSpecialistRasterCache({
      maxResidentBytes: 6,
      maxEntries: 1,
      prepare,
    });
    const [first, second] = await Promise.all([
      cache.acquire(element("same"), plan("same")),
      cache.acquire(element("same"), plan("same")),
    ]);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(cache.snapshot()).toMatchObject({
      entryCount: 1,
      activeReferenceCount: 2,
      residentBytes: 6,
    });
    first.release();
    expect(release).not.toHaveBeenCalled();
    second.release();
    await cache.acquire(element("other"), plan("other"), {}).then((value) => value.release());
    expect(release).toHaveBeenCalledTimes(1);
    cache.dispose();
  });

  it("bounds concurrent preparations and drains its queue", async () => {
    const gates = new Map<string, ReturnType<typeof deferred<StudioSkiaSpecialistRasterLease>>>();
    let active = 0;
    let maxActive = 0;
    const prepare = vi.fn(async (_element, requestPlan) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      const gate = deferred<StudioSkiaSpecialistRasterLease>();
      gates.set(requestPlan.key, gate);
      try {
        return await gate.promise;
      } finally {
        active -= 1;
      }
    });
    const cache = createStudioSkiaSpecialistRasterCache({
      maxConcurrentPreparations: 2,
      prepare,
    });
    const requests = ["a", "b", "c"].map((key) => cache.acquire(element(key), plan(key)));
    await vi.waitFor(() => expect(gates.size).toBe(2));
    expect(maxActive).toBe(2);
    gates.get("a")!.resolve(lease("a", 1));
    await vi.waitFor(() => expect(gates.has("c")).toBe(true));
    gates.get("b")!.resolve(lease("b", 1));
    gates.get("c")!.resolve(lease("c", 1));
    const leases = await Promise.all(requests);
    leases.forEach((value) => value.release());
    expect(maxActive).toBe(2);
    cache.dispose();
  });

  it("removes an aborted queued preparation without consuming a permit", async () => {
    const firstGate = deferred<StudioSkiaSpecialistRasterLease>();
    const prepare = vi.fn(async (_element, requestPlan) => {
      if (requestPlan.key === "first") return firstGate.promise;
      return lease(requestPlan.key, 1);
    });
    const cache = createStudioSkiaSpecialistRasterCache({
      maxConcurrentPreparations: 1,
      prepare,
    });
    const first = cache.acquire(element("first"), plan("first"));
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    const controller = new AbortController();
    const queued = cache.acquire(element("queued"), plan("queued"), { signal: controller.signal });
    await vi.waitFor(() => expect(cache.snapshot().queuedCount).toBe(1));
    controller.abort();
    await expect(queued).rejects.toMatchObject({ name: "AbortError" });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(cache.snapshot().queuedCount).toBe(0);
    firstGate.resolve(lease("first", 1));
    const ready = await first;
    ready.release();
    cache.dispose();
  });

  it("does not cancel a shared preparation when only one waiter aborts", async () => {
    const gate = deferred<StudioSkiaSpecialistRasterLease>();
    const prepare = vi.fn(async () => gate.promise);
    const cache = createStudioSkiaSpecialistRasterCache({ prepare });
    const controller = new AbortController();
    const first = cache.acquire(element("same"), plan("same"), { signal: controller.signal });
    const second = cache.acquire(element("same"), plan("same"));
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    gate.resolve(lease("same", 1));
    const surviving = await second;
    expect(prepare).toHaveBeenCalledTimes(1);
    surviving.release();
    cache.dispose();
  });

  it("aborts an orphaned preparation and removes it", async () => {
    let preparationSignal: AbortSignal | undefined;
    const prepare = vi.fn(async (_element, _plan, options) => {
      preparationSignal = options.signal;
      return await new Promise<StudioSkiaSpecialistRasterLease>((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {
          once: true,
        });
      });
    });
    const cache = createStudioSkiaSpecialistRasterCache({ prepare });
    const controller = new AbortController();
    const request = cache.acquire(element("orphan"), plan("orphan"), { signal: controller.signal });
    await vi.waitFor(() => expect(preparationSignal).toBeDefined());
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(preparationSignal?.aborted).toBe(true));
    await vi.waitFor(() => expect(cache.snapshot().entryCount).toBe(0));
    cache.dispose();
  });

  it("invalidates a resident entry after its final reference releases", async () => {
    const release = vi.fn();
    const cache = createStudioSkiaSpecialistRasterCache({
      prepare: async () => lease("a", 1, release),
    });
    const acquired = await cache.acquire(element("a"), plan("a"));
    expect(cache.invalidate("a")).toBe(true);
    expect(release).not.toHaveBeenCalled();
    acquired.release();
    expect(release).toHaveBeenCalledTimes(1);
    expect(cache.snapshot().entryCount).toBe(0);
    cache.dispose();
  });
});
