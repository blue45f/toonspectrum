// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  installStudioBg3dWebglContextRecovery,
  type StudioBg3dWebglRecoverySnapshot,
} from "./studio-bg3d-webgl-context-recovery";

describe("installStudioBg3dWebglContextRecovery", () => {
  it("렌더러 초기화 실패를 성공으로 표시하지 않고 명시적 재시도에서만 복구한다", async () => {
    const canvas = document.createElement("canvas");
    const invalidate = vi.fn();
    const scheduleFrame = vi.fn(() => 1);
    const resetRenderer = vi.fn().mockImplementationOnce(() => {
      throw new Error("렌더러 캐시 초기화 실패");
    });
    const onStateChange = vi.fn();
    const controller = installStudioBg3dWebglContextRecovery(canvas, {
      invalidate, scheduleFrame, resetRenderer, onStateChange,
    });
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(controller.retry()).toBe(false);
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    await Promise.resolve();
    expect(controller.snapshot().phase).toBe("failed");
    expect(onStateChange.mock.calls.map(([state]) => state.phase)).toEqual(["lost", "failed"]);
    expect(invalidate).not.toHaveBeenCalled();
    expect(scheduleFrame).not.toHaveBeenCalled();
    expect(controller.retry()).toBe(true);
    await Promise.resolve();
    expect(controller.snapshot().phase).toBe("restored");
    expect(resetRenderer).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledOnce();
    controller.dispose();
    expect(controller.retry()).toBe(false);
  });

  it("복구 실패 뒤 새 context loss가 발생하면 이전 실패의 재시도를 막는다", () => {
    const canvas = document.createElement("canvas");
    const resetRenderer = vi.fn(() => { throw new Error("복구 실패"); });
    const controller = installStudioBg3dWebglContextRecovery(canvas, {
      invalidate: vi.fn(), resetRenderer,
    });
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(controller.snapshot().phase).toBe("failed");
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(controller.retry()).toBe(false);
    expect(resetRenderer).toHaveBeenCalledOnce();
    controller.dispose();
  });

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
