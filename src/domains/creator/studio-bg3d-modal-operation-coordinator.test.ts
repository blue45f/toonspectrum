import { describe, expect, it, vi } from "vitest";

import {
  StudioBg3dAssetLoadGate,
  StudioBg3dModalOperationCoordinator,
} from "./studio-bg3d-modal-operation-coordinator";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe("StudioBg3dModalOperationCoordinator", () => {
  it("accepts commits only from the exact active modal epoch", () => {
    const coordinator = new StudioBg3dModalOperationCoordinator();
    const first = coordinator.beginSession();
    const firstCommit = vi.fn();

    expect(coordinator.commitIfCurrent(first, firstCommit)).toBe(true);
    expect(firstCommit).toHaveBeenCalledOnce();

    const second = coordinator.beginSession();
    expect(second.epoch).toBeGreaterThan(first.epoch);
    expect(coordinator.isCurrent(first)).toBe(false);
    expect(coordinator.commitIfCurrent(first, firstCommit)).toBe(false);
    expect(coordinator.isCurrent(second)).toBe(true);
    expect(coordinator.endSession(first)).toBe(false);
    expect(coordinator.endSession(second)).toBe(true);
    expect(coordinator.isCurrent(second)).toBe(false);
  });

  it("does not let a stale async completion commit into a reopened modal", async () => {
    const coordinator = new StudioBg3dModalOperationCoordinator();
    const oldSession = coordinator.beginSession();
    const oldResult = deferred<string>();
    const oldCommit = vi.fn();
    const oldMutation = coordinator.runSceneMutation(
      oldSession,
      () => oldResult.promise,
      oldCommit,
    );

    const newSession = coordinator.beginSession();
    const newCommit = vi.fn();
    const newMutation = coordinator.runSceneMutation(
      newSession,
      () => "new-scene",
      newCommit,
    );
    oldResult.resolve("old-scene");

    await expect(oldMutation).resolves.toEqual({ status: "stale" });
    expect(oldCommit).not.toHaveBeenCalled();
    await expect(newMutation).resolves.toEqual({ status: "committed", value: "new-scene" });
    expect(newCommit).toHaveBeenCalledExactlyOnceWith("new-scene");
  });

  it("serializes scene mutations in intent order and recovers after a failure", async () => {
    const coordinator = new StudioBg3dModalOperationCoordinator();
    const session = coordinator.beginSession();
    const firstResult = deferred<string>();
    const order: string[] = [];
    const first = coordinator.runSceneMutation(
      session,
      () => {
        order.push("prepare-add");
        return firstResult.promise;
      },
      () => order.push("commit-add"),
    );
    const secondPrepare = vi.fn(() => {
      order.push("prepare-delete");
      throw new Error("delete failed");
    });
    const second = coordinator.runSceneMutation(session, secondPrepare, vi.fn());
    const third = coordinator.runSceneMutation(
      session,
      () => {
        order.push("prepare-readd");
        return "readded";
      },
      () => order.push("commit-readd"),
    );

    await Promise.resolve();
    expect(order).toEqual(["prepare-add"]);
    expect(secondPrepare).not.toHaveBeenCalled();
    firstResult.resolve("added");

    await expect(first).resolves.toEqual({ status: "committed", value: "added" });
    await expect(second).rejects.toThrow("delete failed");
    await expect(third).resolves.toEqual({ status: "committed", value: "readded" });
    expect(order).toEqual([
      "prepare-add",
      "commit-add",
      "prepare-delete",
      "prepare-readd",
      "commit-readd",
    ]);
  });

  it("skips queued work from a closed epoch before its prepare phase starts", async () => {
    const coordinator = new StudioBg3dModalOperationCoordinator();
    const session = coordinator.beginSession();
    const headResult = deferred<void>();
    const head = coordinator.runSceneMutation(session, () => headResult.promise, vi.fn());
    const stalePrepare = vi.fn(() => "stale");
    const stale = coordinator.runSceneMutation(session, stalePrepare, vi.fn());

    coordinator.endSession(session);
    const reopened = coordinator.beginSession();
    const reopenedCommit = vi.fn();
    const current = coordinator.runSceneMutation(
      reopened,
      () => "current",
      reopenedCommit,
    );
    headResult.resolve();

    await expect(head).resolves.toEqual({ status: "stale" });
    await expect(stale).resolves.toEqual({ status: "stale" });
    expect(stalePrepare).not.toHaveBeenCalled();
    await expect(current).resolves.toEqual({ status: "committed", value: "current" });
    expect(reopenedCommit).toHaveBeenCalledExactlyOnceWith("current");
  });
});

describe("StudioBg3dAssetLoadGate", () => {
  it("bounds global work and admits queued loads in FIFO order", async () => {
    const gate = new StudioBg3dAssetLoadGate(2);
    const releases = [deferred<number>(), deferred<number>(), deferred<number>()];
    const starts: number[] = [];
    let active = 0;
    let maximumActive = 0;
    const tasks = releases.map((release, index) => gate.run(async () => {
      starts.push(index);
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      try {
        return await release.promise;
      } finally {
        active -= 1;
      }
    }));

    await Promise.resolve();
    expect(starts).toEqual([0, 1]);
    expect(gate.activeCount).toBe(2);
    expect(gate.queuedCount).toBe(1);

    releases[1]!.resolve(20);
    await expect(tasks[1]).resolves.toBe(20);
    await Promise.resolve();
    expect(starts).toEqual([0, 1, 2]);
    expect(maximumActive).toBe(2);

    releases[0]!.resolve(10);
    releases[2]!.resolve(30);
    await expect(Promise.all(tasks)).resolves.toEqual([10, 20, 30]);
    expect(gate.activeCount).toBe(0);
    expect(gate.queuedCount).toBe(0);
  });

  it("rejects a stale queued generation before the load allocates resources", async () => {
    const gate = new StudioBg3dAssetLoadGate(1);
    const headResult = deferred<void>();
    let current = true;
    const head = gate.run(() => headResult.promise);
    const staleTask = vi.fn(() => "must-not-load");
    const stale = gate.run(staleTask, { isCurrent: () => current });

    await Promise.resolve();
    current = false;
    headResult.resolve();

    await expect(head).resolves.toBeUndefined();
    await expect(stale).rejects.toMatchObject({
      code: "stale-modal-epoch",
      name: "AbortError",
    });
    expect(staleTask).not.toHaveBeenCalled();
    expect(gate.activeCount).toBe(0);
  });

  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY])(
    "rejects invalid concurrency %s",
    (capacity) => {
      expect(() => new StudioBg3dAssetLoadGate(capacity)).toThrow(RangeError);
    },
  );
});
