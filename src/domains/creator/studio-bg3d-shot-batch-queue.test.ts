import { describe, expect, it, vi } from "vitest";

import { createStudioBg3dShotBatchPlan } from "./studio-bg3d-shot-batch-plan";
import {
  createStudioBg3dShotBatchQueue,
  failStudioBg3dShotBatchQueueItem,
  isStudioBg3dShotBatchQueueCompatible,
  retryStudioBg3dShotBatchQueue,
  startStudioBg3dShotBatchQueueItem,
  studioBg3dShotBatchQueueCompletedCount,
  succeedStudioBg3dShotBatchQueueItem,
  waitForStudioBg3dBatchDocumentVisible,
} from "./studio-bg3d-shot-batch-queue";

function plan(revision = "scene-a") {
  const result = createStudioBg3dShotBatchPlan([
    { id: "shot-a", name: "A" },
    { id: "shot-b", name: "B" },
  ], { sourceRevision: revision });
  if (!result.ok) throw new Error(result.message);
  return result.plan;
}

describe("Studio BG3D retryable shot queue", () => {
  it("allows only pending→running→succeeded|failed and preserves successes on retry", () => {
    const initial = createStudioBg3dShotBatchQueue(plan());
    const runningA = startStudioBg3dShotBatchQueueItem(initial, "shot-a")!;
    expect(startStudioBg3dShotBatchQueueItem(runningA, "shot-b")).toBeNull();
    expect(succeedStudioBg3dShotBatchQueueItem(initial, "shot-a")).toBeNull();
    const succeededA = succeedStudioBg3dShotBatchQueueItem(runningA, "shot-a")!;
    const runningB = startStudioBg3dShotBatchQueueItem(succeededA, "shot-b")!;
    const failedB = failStudioBg3dShotBatchQueueItem(runningB, "shot-b", "capture-failed")!;
    const retry = retryStudioBg3dShotBatchQueue(failedB);

    expect(studioBg3dShotBatchQueueCompletedCount(retry)).toBe(1);
    expect(retry.items).toEqual([
      { shotId: "shot-a", status: "succeeded", attempts: 1 },
      { shotId: "shot-b", status: "pending", attempts: 1 },
    ]);
    expect(initial.items.every(({ status }) => status === "pending")).toBe(true);
  });

  it("invalidates recovery when the canonical scene revision or shot order changes", () => {
    const queue = createStudioBg3dShotBatchQueue(plan("scene-a"));
    expect(isStudioBg3dShotBatchQueueCompatible(queue, plan("scene-a"))).toBe(true);
    expect(isStudioBg3dShotBatchQueueCompatible(queue, plan("scene-b"))).toBe(false);
  });

  it("waits while hidden, resumes on visibility, and removes listeners on abort", async () => {
    let visibilityState = "hidden";
    const listeners = new Set<() => void>();
    const visibilityDocument = {
      get visibilityState() { return visibilityState; },
      addEventListener: vi.fn((_type: "visibilitychange", listener: () => void) => listeners.add(listener)),
      removeEventListener: vi.fn((_type: "visibilitychange", listener: () => void) => listeners.delete(listener)),
    };
    let resolved = false;
    const waiting = waitForStudioBg3dBatchDocumentVisible(visibilityDocument).then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    visibilityState = "visible";
    for (const listener of listeners) listener();
    await waiting;
    expect(resolved).toBe(true);
    expect(listeners.size).toBe(0);

    visibilityState = "hidden";
    const controller = new AbortController();
    const aborted = waitForStudioBg3dBatchDocumentVisible(visibilityDocument, controller.signal);
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ name: "AbortError" });
    expect(listeners.size).toBe(0);
  });
});
