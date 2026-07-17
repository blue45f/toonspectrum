import { describe, expect, it } from "vitest";

import { STUDIO_INK_PRESSURE_MODEL_LINEAR_FULL_V1 } from "./studio-ink-pressure-model";
import { planStudioGpuDabUpdate } from "./studio-webgpu-engine";
import {
  buildStudioGpuLiveStroke,
  sameStudioGpuStroke,
  sameStudioGpuStrokes,
  snapshotStudioGpuStrokes,
  type StudioGpuStroke,
} from "./studio-webgpu-stroke";

function stroke(overrides: Partial<StudioGpuStroke> = {}): StudioGpuStroke {
  return {
    id: "ink",
    points: [0, 0, 12, 8],
    pressures: [0.25, 0.75],
    color: "#123456",
    size: 6,
    opacity: 1,
    composite: "normal",
    ...overrides,
  };
}

describe("studio WebGPU stroke authority helpers", () => {
  it("keeps every curved live sample immutable when one point is appended", () => {
    const sharedPoints = [0, 0, 8, 5, 17, 13, 25, 6];
    const sharedPressures = [0.2, Number.NaN, 1.4, 0.7];
    const before = buildStudioGpuLiveStroke({
      id: "live-ink",
      points: sharedPoints,
      pressures: sharedPressures,
      color: "#123456",
      size: 6,
      opacity: 0.8,
      composite: "normal",
    });
    const after = buildStudioGpuLiveStroke({
      id: "live-ink",
      points: [...sharedPoints, 31, -4],
      pressures: [...sharedPressures, -0.2],
      color: "#123456",
      size: 6,
      opacity: 0.8,
      composite: "normal",
    });

    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(after!.points.slice(0, before!.points.length)).toEqual(before!.points);
    expect(after!.pressures?.slice(0, before!.pressures!.length)).toEqual(before!.pressures);
    expect(before!.pressures).toEqual([0.2, 0.5, 1, 0.7]);
    expect(after!.pressures).toEqual([0.2, 0.5, 1, 0.7, 0]);
    expect(planStudioGpuDabUpdate([before!], [after!]).mode).toBe("append");
  });

  it("copies only the finite coordinate-pair prefix and keeps a one-point tap", () => {
    expect(buildStudioGpuLiveStroke({
      id: "tap",
      points: [4, 7, 12],
      pressures: [0.8],
      color: "#000000",
      size: 4,
    })).toMatchObject({
      points: [4, 7],
      pressures: [0.8],
    });

    expect(buildStudioGpuLiveStroke({
      id: "finite-prefix",
      points: [0, 0, 4, 6, Number.POSITIVE_INFINITY, 8, 10, 12],
      pressures: [0.75],
      color: "#000000",
      size: 4,
    })).toMatchObject({
      points: [0, 0, 4, 6],
      pressures: [0.75, 0.5],
    });
  });

  it("extends a one-point tap through the append-only GPU update path", () => {
    const tap = buildStudioGpuLiveStroke({
      id: "tap",
      points: [4, 7],
      pressures: [0.8],
      color: "#000000",
      size: 4,
    });
    const moved = buildStudioGpuLiveStroke({
      id: "tap",
      points: [4, 7, 12, 9],
      pressures: [0.8, 0.6],
      color: "#000000",
      size: 4,
    });

    expect(tap).not.toBeNull();
    expect(moved).not.toBeNull();
    expect(planStudioGpuDabUpdate([tap!], [moved!]).mode).toBe("append");
  });

  it("threads the versioned pressure model through live snapshots and authority equality", () => {
    const pressureModel = STUDIO_INK_PRESSURE_MODEL_LINEAR_FULL_V1;
    const live = buildStudioGpuLiveStroke({
      id: "linear-live",
      points: [1, 2, 3, 4],
      pressures: [0, 1],
      color: "#000000",
      size: 12,
      pressureModel,
    });

    expect(live?.pressureModel).toBe(pressureModel);
    expect(snapshotStudioGpuStrokes([live!])[0]?.pressureModel).toBe(pressureModel);
    expect(sameStudioGpuStroke(live!, { ...live!, pressureModel: undefined })).toBe(false);
    expect(planStudioGpuDabUpdate(
      [{ ...live!, pressureModel: undefined }],
      [live!]
    ).mode).toBe("rebuild");
  });

  it("fills short live pressure arrays with model-specific nominal pressure", () => {
    const linear = buildStudioGpuLiveStroke({
      id: "linear-short",
      points: [0, 0, 10, 0],
      pressures: [0],
      color: "#000000",
      size: 10,
      pressureModel: STUDIO_INK_PRESSURE_MODEL_LINEAR_FULL_V1,
    });
    const legacy = buildStudioGpuLiveStroke({
      id: "legacy-short",
      points: [0, 0, 10, 0],
      pressures: [0],
      color: "#000000",
      size: 10,
    });

    expect(linear?.pressures).toEqual([0, 1]);
    expect(legacy?.pressures).toEqual([0, 0.5]);
  });

  it("accepts independently allocated but exactly equivalent operations", () => {
    expect(sameStudioGpuStroke(stroke(), stroke({
      points: [0, 0, 12, 8],
      pressures: [0.25, 0.75],
    }))).toBe(true);
    expect(sameStudioGpuStrokes([stroke()], [stroke()])).toBe(true);
  });

  it.each([
    ["point", stroke({ points: [0, 0, 12, 9] })],
    ["pressure", stroke({ pressures: [0.25, 0.8] })],
    ["pressure model", stroke({ pressureModel: STUDIO_INK_PRESSURE_MODEL_LINEAR_FULL_V1 })],
    ["style", stroke({ opacity: 0.99 })],
    ["order", stroke({ orderKey: "front" })],
  ] as const)("rejects a changed %s without relying on fingerprints", (_label, changed) => {
    expect(sameStudioGpuStroke(stroke(), changed)).toBe(false);
  });

  it("deep-snapshots mutable pointer arrays at the receipt boundary", () => {
    const points = [0, 0, 12, 8];
    const pressures = [0.25, 0.75];
    const source = [stroke({ points, pressures })];
    const snapshot = snapshotStudioGpuStrokes(source);

    points.push(20, 20);
    pressures.push(1);

    expect(snapshot[0]?.points).toEqual([0, 0, 12, 8]);
    expect(snapshot[0]?.pressures).toEqual([0.25, 0.75]);
    expect(sameStudioGpuStrokes(snapshot, source)).toBe(false);
  });
});
