// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  installStudioBg3dWebglContextRecovery,
  type StudioBg3dWebglRecoverySnapshot,
} from "./studio-bg3d-webgl-context-recovery";

describe("installStudioBg3dWebglContextRecovery", () => {
  it("keeps browser restoration available and redraws two recovery frames", async () => {
    const canvas = document.createElement("canvas");
    const invalidate = vi.fn();
    const resetRenderer = vi.fn();
    const snapshots: StudioBg3dWebglRecoverySnapshot[] = [];
    let scheduled: FrameRequestCallback = () => {
      throw new Error("redraw frame was not scheduled");
    };
    let now = 1_000;

    const controller = installStudioBg3dWebglContextRecovery(canvas, {
      invalidate,
      now: () => now,
      onStateChange: (snapshot) => snapshots.push(snapshot),
      resetRenderer,
      scheduleFrame: (callback) => {
        scheduled = callback;
        return 7;
      },
    });

    const lost = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(lost);

    expect(lost.defaultPrevented).toBe(true);
    expect(controller.snapshot()).toMatchObject({
      degraded: false,
      lossCount: 1,
      phase: "lost",
    });

    now = 2_000;
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    await Promise.resolve();

    expect(resetRenderer).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
    scheduled(2_016);
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(snapshots.at(-1)).toMatchObject({
      degraded: false,
      phase: "restored",
    });
  });

  it("degrades only after repeated losses inside the rolling window", () => {
    const canvas = document.createElement("canvas");
    let now = 0;
    const controller = installStudioBg3dWebglContextRecovery(canvas, {
      invalidate: vi.fn(),
      now: () => now,
      resetRenderer: vi.fn(),
      scheduleFrame: () => 1,
    });

    for (const timestamp of [1_000, 5_000, 10_000]) {
      now = timestamp;
      canvas.dispatchEvent(
        new Event("webglcontextlost", { cancelable: true }),
      );
    }

    expect(controller.snapshot()).toMatchObject({
      degraded: true,
      lossCount: 3,
      phase: "degraded",
    });

    now = 50_000;
    canvas.dispatchEvent(
      new Event("webglcontextlost", { cancelable: true }),
    );
    expect(controller.snapshot()).toMatchObject({
      degraded: false,
      lossCount: 1,
      phase: "lost",
    });
  });

  it("cancels stale redraw work and detaches event ownership on dispose", async () => {
    const canvas = document.createElement("canvas");
    const invalidate = vi.fn();
    const cancelFrame = vi.fn();
    let scheduled: FrameRequestCallback = () => {
      throw new Error("redraw frame was not scheduled");
    };
    const controller = installStudioBg3dWebglContextRecovery(canvas, {
      cancelFrame,
      invalidate,
      resetRenderer: vi.fn(),
      scheduleFrame: (callback) => {
        scheduled = callback;
        return 99;
      },
    });

    canvas.dispatchEvent(new Event("webglcontextrestored"));
    controller.dispose();
    controller.dispose();
    await Promise.resolve();
    scheduled(1_000);
    canvas.dispatchEvent(
      new Event("webglcontextlost", { cancelable: true }),
    );

    expect(cancelFrame).toHaveBeenCalledWith(99);
    expect(invalidate).not.toHaveBeenCalled();
    expect(controller.snapshot().lossCount).toBe(0);
  });
});