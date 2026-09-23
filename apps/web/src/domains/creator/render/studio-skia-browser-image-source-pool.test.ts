import { describe, expect, it, vi } from "vitest";

import { createStudioSkiaBrowserImageSourcePool } from "./studio-skia-browser-image-source-pool";

function fakeImage(source: string): HTMLImageElement {
  return { src: source } as HTMLImageElement;
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

describe("createStudioSkiaBrowserImageSourcePool", () => {
  it("deduplicates decode and keeps an idle image alive for animated frame continuity", async () => {
    const load = vi.fn(async (source: string) => fakeImage(source));
    const disposeImage = vi.fn();
    const pool = createStudioSkiaBrowserImageSourcePool({ load, disposeImage });
    const [first, second] = await Promise.all([
      pool.acquire("animated.gif"),
      pool.acquire("animated.gif"),
    ]);
    expect(first.image).toBe(second.image);
    expect(load).toHaveBeenCalledTimes(1);
    first.release();
    second.release();
    const later = await pool.acquire("animated.gif");
    expect(later.image).toBe(first.image);
    expect(load).toHaveBeenCalledTimes(1);
    later.release();
    expect(disposeImage).not.toHaveBeenCalled();
    pool.dispose();
    expect(disposeImage).toHaveBeenCalledTimes(1);
  });

  it("evicts the least-recent idle source while preserving active references", async () => {
    const disposeImage = vi.fn();
    const pool = createStudioSkiaBrowserImageSourcePool({
      maxEntries: 2,
      load: async (source) => fakeImage(source),
      disposeImage,
    });
    const active = await pool.acquire("active.png");
    const old = await pool.acquire("old.png");
    old.release();
    const newest = await pool.acquire("new.png");
    newest.release();
    expect(disposeImage).toHaveBeenCalledTimes(1);
    expect((disposeImage.mock.calls[0]?.[0] as HTMLImageElement).src).toBe("old.png");
    expect(pool.snapshot()).toMatchObject({ entryCount: 2, activeReferenceCount: 1 });
    active.release();
    pool.dispose();
  });

  it("does not abort a shared load when only one waiter cancels", async () => {
    const gate = deferred<HTMLImageElement>();
    let loadSignal: AbortSignal | undefined;
    const pool = createStudioSkiaBrowserImageSourcePool({
      load: async (_source, signal) => {
        loadSignal = signal;
        return gate.promise;
      },
    });
    const controller = new AbortController();
    const first = pool.acquire("same.png", controller.signal);
    const second = pool.acquire("same.png");
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(loadSignal?.aborted).toBe(false);
    gate.resolve(fakeImage("same.png"));
    const survivor = await second;
    survivor.release();
    pool.dispose();
  });

  it("aborts an orphaned load and removes it", async () => {
    let loadSignal: AbortSignal | undefined;
    const pool = createStudioSkiaBrowserImageSourcePool({
      load: async (_source, signal) => {
        loadSignal = signal;
        return new Promise<HTMLImageElement>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {
            once: true,
          });
        });
      },
    });
    const controller = new AbortController();
    const request = pool.acquire("orphan.png", controller.signal);
    await vi.waitFor(() => expect(loadSignal).toBeDefined());
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(loadSignal?.aborted).toBe(true));
    await vi.waitFor(() => expect(pool.snapshot().entryCount).toBe(0));
    pool.dispose();
  });

  it("defers invalidation until the active lease releases", async () => {
    const disposeImage = vi.fn();
    const pool = createStudioSkiaBrowserImageSourcePool({
      load: async (source) => fakeImage(source),
      disposeImage,
    });
    const active = await pool.acquire("one.png");
    expect(pool.invalidate("one.png")).toBe(true);
    expect(disposeImage).not.toHaveBeenCalled();
    active.release();
    expect(disposeImage).toHaveBeenCalledTimes(1);
    expect(pool.snapshot().entryCount).toBe(0);
    pool.dispose();
  });
});
