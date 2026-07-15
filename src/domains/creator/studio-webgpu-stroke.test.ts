import { describe, expect, it } from "vitest";

import {
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
