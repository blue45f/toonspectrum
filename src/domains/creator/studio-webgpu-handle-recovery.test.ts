import { describe, expect, it, vi } from "vitest";

import { restoreStudioGpuPendingBaselineOnHandle } from "./studio-webgpu-handle-recovery";

import type { StudioGpuStroke } from "./studio-webgpu-stroke";

function stroke(id: string): StudioGpuStroke {
  return {
    id,
    points: [0, 0, 4, 4],
    pressures: [0.5, 0.5],
    size: 4,
    color: "#111111",
    opacity: 1,
    composite: "normal",
  };
}

describe("Studio WebGPU handle baseline recovery", () => {
  it("keeps a pointerup settled-only baseline through null and restores visibility exactly once", () => {
    const pendingStrokes = [stroke("settled-after-pointerup")];
    let recoveryPending = true;

    const detached = restoreStudioGpuPendingBaselineOnHandle({
      handle: null,
      pendingStrokes,
      recoveryPending,
    });
    recoveryPending = detached.pending;
    expect(detached.status).toBe("waiting-handle");

    const replacePinnedStrokes = vi.fn();
    const setPinnedVisible = vi.fn();
    const remounted = restoreStudioGpuPendingBaselineOnHandle({
      handle: { replacePinnedStrokes, setPinnedVisible },
      pendingStrokes,
      recoveryPending,
    });
    recoveryPending = remounted.pending;

    expect(remounted.status).toBe("restored");
    expect(replacePinnedStrokes).toHaveBeenCalledOnce();
    expect(replacePinnedStrokes).toHaveBeenCalledWith(pendingStrokes);
    expect(setPinnedVisible).toHaveBeenCalledOnce();
    expect(setPinnedVisible).toHaveBeenCalledWith(true);

    expect(restoreStudioGpuPendingBaselineOnHandle({
      handle: { replacePinnedStrokes, setPinnedVisible },
      pendingStrokes,
      recoveryPending,
    }).status).toBe("not-needed");
    expect(replacePinnedStrokes).toHaveBeenCalledOnce();
    expect(setPinnedVisible).toHaveBeenCalledOnce();
  });

  it("retains recovery ownership when a remounted handle throws", () => {
    const pendingStrokes = [stroke("retained")];
    const outcome = restoreStudioGpuPendingBaselineOnHandle({
      handle: {
        replacePinnedStrokes: () => { throw new Error("device still unavailable"); },
        setPinnedVisible: vi.fn(),
      },
      pendingStrokes,
      recoveryPending: true,
    });

    expect(outcome).toEqual({ status: "retained", pending: true });
  });
});
