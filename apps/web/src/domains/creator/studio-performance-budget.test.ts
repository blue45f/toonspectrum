import { describe, expect, it } from "vitest";

import { planStudioPerformance } from "./studio-performance-budget";

const DEVICE = Object.freeze({
  memoryBudgetBytes: 512 * 1024 * 1024,
  drawCallBudget: 2_000,
  triangleBudget: 500_000,
  liveEffectBudget: 16,
  webGpuAvailable: true,
  reducedMotion: false,
});

describe("Studio performance budget", () => {
  it("keeps a lightweight scene at full quality", () => {
    const plan = planStudioPerformance([{
      id: "page-1",
      kind: "raster",
      estimatedMemoryBytes: 64 * 1024 * 1024,
      drawCalls: 12,
      triangles: 0,
      liveEffectCount: 2,
      visible: true,
      editable: true,
    }], DEVICE);
    expect(plan.status).toBe("healthy");
    expect(plan.actions[0]).toMatchObject({ id: "keep-original", preservesOriginal: true });
  });

  it("automatically proposes proxies and LOD while preserving originals", () => {
    const plan = planStudioPerformance([
      {
        id: "large-paint",
        kind: "raster",
        estimatedMemoryBytes: 700 * 1024 * 1024,
        drawCalls: 20,
        triangles: 0,
        liveEffectCount: 4,
        visible: true,
        editable: true,
      },
      {
        id: "city-3d",
        kind: "3d",
        estimatedMemoryBytes: 200 * 1024 * 1024,
        drawCalls: 3_000,
        triangles: 800_000,
        liveEffectCount: 20,
        visible: true,
        editable: true,
      },
    ], DEVICE);
    expect(plan.status).toBe("limited");
    expect(plan.findings.map((item) => item.code)).toEqual(expect.arrayContaining([
      "memory-budget",
      "scene-complexity",
      "live-effect-budget",
    ]));
    expect(plan.actions.map((item) => item.id)).toEqual(expect.arrayContaining([
      "generate-proxy",
      "generate-lod",
      "reduce-preview-quality",
      "pause-live-effect",
    ]));
    expect(plan.actions.every((item) => item.preservesOriginal)).toBe(true);
  });

  it("defers invisible resources without deleting or flattening them", () => {
    const plan = planStudioPerformance([{
      id: "hidden-reference",
      kind: "raster",
      estimatedMemoryBytes: 10,
      drawCalls: 1,
      triangles: 0,
      liveEffectCount: 0,
      visible: false,
      editable: true,
    }], DEVICE);
    expect(plan.actions).toContainEqual(expect.objectContaining({
      id: "defer-offscreen",
      automatic: true,
      resourceIds: ["hidden-reference"],
    }));
  });

  it("rejects invalid resource metrics and device budgets", () => {
    expect(() => planStudioPerformance([], { ...DEVICE, memoryBudgetBytes: 0 })).toThrow(
      "Invalid memory budget",
    );
    expect(() => planStudioPerformance([{
      id: "bad",
      kind: "effect",
      estimatedMemoryBytes: -1,
      drawCalls: 0,
      triangles: 0,
      liveEffectCount: 0,
      visible: true,
      editable: true,
    }], DEVICE)).toThrow("non-negative");
  });
});
