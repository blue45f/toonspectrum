import { describe, expect, it } from "vitest";

import { STUDIO_INK_PRESSURE_MODEL_LINEAR_RESIDUAL_V2 } from "./studio-ink-pressure-model";
import {
  planStudioGpuDabs,
  planStudioGpuDabUpdate,
} from "./studio-webgpu-dab-planner";

import type { PlannedStudioGpuDabs } from "./studio-webgpu-dab-plan-contract";
import type { StudioGpuStroke } from "./studio-webgpu-stroke";

function expectContiguousBatches(plan: PlannedStudioGpuDabs): void {
  let cursor = 0;
  for (const batch of plan.batches) {
    expect(batch.firstInstance).toBe(cursor);
    expect(batch.instanceCount).toBeGreaterThan(0);
    cursor += batch.instanceCount;
  }
  expect(cursor).toBe(plan.dabs.length);
}

describe("studio WebGPU dab planner incremental concatenation", () => {
  it("keeps a long legacy live extension plus a new eraser byte-for-byte with the full plan", () => {
    const sharedPrefix = [0, 0, 10, 0];
    const previousTerminal: StudioGpuStroke = {
      id: "live",
      points: sharedPrefix,
      pressures: [0.5, 0.6],
      color: "#204080",
      size: 8,
      opacity: 0.9,
    };
    // The appended 2,000px segment expands to well over a thousand dabs, exercising the indexed
    // (non-spread) concatenation used by the append-mode planner.
    const nextTerminal: StudioGpuStroke = {
      ...previousTerminal,
      points: [...sharedPrefix, 2_000, 0],
      pressures: [0.5, 0.6, 1],
    };
    const appendedEraser: StudioGpuStroke = {
      id: "eraser",
      points: [100, 5, 300, 5],
      pressures: [0.7, 0.7],
      color: "#000000",
      size: 12,
      composite: "erase",
    };

    const update = planStudioGpuDabUpdate(
      [previousTerminal],
      [nextTerminal, appendedEraser]
    );
    expect(update.mode).toBe("append");
    expect(update.complete).toBe(true);
    expect(update.dabs.length).toBeGreaterThan(1_000);

    // Applying the append over the previous full plan reproduces the next full plan exactly.
    const previousFull = planStudioGpuDabs([previousTerminal]);
    const nextFull = planStudioGpuDabs([nextTerminal, appendedEraser]);
    expect(previousFull.complete).toBe(true);
    expect(nextFull.complete).toBe(true);
    expect([...previousFull.dabs, ...update.dabs]).toEqual(nextFull.dabs);

    // Batches must tile the concatenated dab list contiguously and split at the erase boundary.
    expectContiguousBatches(update);
    expect(update.batches.map(({ composite }) => composite)).toEqual(["normal", "erase"]);
  });

  it("keeps a residual V2 extension identical to replanning the whole stroke", () => {
    const sharedPrefix = [0, 0, 40, 0, 40, 30];
    const previousTerminal: StudioGpuStroke = {
      id: "residual",
      points: sharedPrefix,
      pressures: [0.4, 0.6, 0.8],
      color: "#113355",
      size: 10,
      pressureModel: STUDIO_INK_PRESSURE_MODEL_LINEAR_RESIDUAL_V2,
    };
    const nextTerminal: StudioGpuStroke = {
      ...previousTerminal,
      points: [...sharedPrefix, 400, 30, 400, 200],
      pressures: [0.4, 0.6, 0.8, 0.9, 0.5],
    };

    const update = planStudioGpuDabUpdate([previousTerminal], [nextTerminal]);
    expect(update.mode).toBe("append");
    expect(update.complete).toBe(true);
    expect(update.dabs.length).toBeGreaterThan(10);

    const previousFull = planStudioGpuDabs([previousTerminal]);
    const nextFull = planStudioGpuDabs([nextTerminal]);
    expect([...previousFull.dabs, ...update.dabs]).toEqual(nextFull.dabs);
    expectContiguousBatches(update);
  });
});
