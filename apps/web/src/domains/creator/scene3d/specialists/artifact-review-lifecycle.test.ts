import { describe, expect, it, vi } from "vitest";
import { createArtifactReviewLifecycle } from "./artifact-review-lifecycle";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const tick = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
describe("latest-only comparison resource lifecycle", () => {
  it("waits for retired parsing to settle, skips intermediate requests and never overlaps active initialization", async () => {
    const owner = createArtifactReviewLifecycle<{ dispose(): void }>();
    const first = deferred<{ dispose(): void }>();
    const created: string[] = [];
    const firstReady = vi.fn();
    const latestReady = vi.fn();
    const disposeFirst = vi.fn();
    const disposeLast = vi.fn();
    let signal: AbortSignal | undefined;
    owner.replace(
      (s) => {
        created.push("first");
        signal = s;
        return first.promise;
      },
      firstReady,
      vi.fn(),
    );
    await tick();
    owner.replace(
      async () => {
        created.push("skipped");
        return { dispose: vi.fn() };
      },
      vi.fn(),
      vi.fn(),
    );
    owner.replace(
      async () => {
        created.push("last");
        return { dispose: disposeLast };
      },
      latestReady,
      vi.fn(),
    );
    expect(signal!.aborted).toBe(true);
    expect(created).toEqual(["first"]);
    first.resolve({ dispose: disposeFirst });
    await tick();
    expect(firstReady).not.toHaveBeenCalled();
    expect(disposeFirst).toHaveBeenCalledOnce();
    expect(created).toEqual(["first", "last"]);
    expect(latestReady).toHaveBeenCalledOnce();
    owner.dispose();
    owner.dispose();
    expect(disposeLast).toHaveBeenCalledOnce();
  });
  it("disposes a ready view before constructing its replacement", async () => {
    const owner = createArtifactReviewLifecycle<{ dispose(): void }>();
    const events: string[] = [];
    owner.replace(
      async () => ({ dispose: () => events.push("old disposed") }),
      () => events.push("old ready"),
      vi.fn(),
    );
    await tick();
    owner.replace(
      async () => {
        events.push("new created");
        return { dispose: () => events.push("new disposed") };
      },
      vi.fn(),
      vi.fn(),
    );
    await tick();
    expect(events).toEqual(["old ready", "old disposed", "new created"]);
    owner.dispose();
  });
  it("cancels late loads after unmount without reporting success/errors or leaking the returned resource", async () => {
    const owner = createArtifactReviewLifecycle<{ dispose(): void }>();
    const load = deferred<{ dispose(): void }>();
    const ready = vi.fn();
    const error = vi.fn();
    const dispose = vi.fn();
    owner.replace(() => load.promise, ready, error);
    await tick();
    owner.dispose();
    load.resolve({ dispose });
    await tick();
    expect(dispose).toHaveBeenCalledOnce();
    expect(ready).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
  it("recovers from failed initialization and isolates observer/dispose exceptions", async () => {
    const owner = createArtifactReviewLifecycle<{ dispose(): void }>();
    const error = vi.fn();
    owner.replace(
      async () => {
        throw new Error("bad file");
      },
      vi.fn(),
      error,
    );
    await tick();
    expect(error).toHaveBeenCalledOnce();
    const dispose = vi.fn(() => {
      throw new Error("cleanup hook");
    });
    owner.replace(
      async () => ({ dispose }),
      () => {
        throw new Error("observer");
      },
      vi.fn(),
    );
    await tick();
    expect(dispose).toHaveBeenCalledOnce();
    const final = vi.fn();
    owner.replace(async () => ({ dispose: vi.fn() }), final, vi.fn());
    await tick();
    expect(final).toHaveBeenCalledOnce();
    owner.dispose();
  });
  it("does not initialize cancelled pending work", async () => {
    const owner = createArtifactReviewLifecycle<{ dispose(): void }>();
    const create = vi.fn(async () => ({ dispose: vi.fn() }));
    const cancel = owner.replace(create, vi.fn(), vi.fn());
    cancel();
    await tick();
    expect(create).not.toHaveBeenCalled();
    owner.dispose();
  });
});
