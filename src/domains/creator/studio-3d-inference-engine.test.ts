import { describe, it, expect } from "vitest";

import { Studio3DInferenceEngine, type InferenceCandidate } from "./studio-3d-inference-engine";

describe("Studio3DInferenceEngine", () => {
  it("snaps to candidate endpoint within tolerance", () => {
    const engine = new Studio3DInferenceEngine(0.2);
    const candidates: InferenceCandidate[] = [
      { point: { x: 1.0, y: 2.0, z: 0.0 }, type: "endpoint", label: "Corner Vertex" },
      { point: { x: 5.0, y: 0.0, z: 0.0 }, type: "endpoint", label: "Wall End" },
    ];

    const result = engine.findBestSnap({ x: 1.05, y: 2.02, z: 0.01 }, candidates);
    expect(result).not.toBeNull();
    expect(result?.type).toBe("endpoint");
    expect(result?.label).toBe("Corner Vertex");
  });

  it("computes midpoint correctly", () => {
    const engine = new Studio3DInferenceEngine();
    const mid = engine.computeMidpoint({ x: 0, y: 0, z: 0 }, { x: 10, y: 4, z: 2 });
    expect(mid).toEqual({ x: 5, y: 2, z: 1 });
  });

  it("falls back to grid snap when no candidate is close", () => {
    const engine = new Studio3DInferenceEngine(0.2);
    const result = engine.findBestSnap({ x: 0.49, y: 0.01, z: 0.99 }, [], 0.5);
    expect(result).not.toBeNull();
    expect(result?.type).toBe("grid");
    expect(result?.snappedPoint).toEqual({ x: 0.5, y: 0.0, z: 1.0 });
  });
});
