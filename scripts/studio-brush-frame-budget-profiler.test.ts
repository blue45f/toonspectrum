import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createStudioBrushFrameBudgetRoute } from "./studio-brush-frame-budget-profiler";

const profilerSource = readFileSync(
  new URL("./studio-brush-frame-budget-profiler.ts", import.meta.url),
  "utf8",
);

describe("Studio continuous brush frame-budget profiler", () => {
  it("creates a dense curved stress route inside the visible canvas", () => {
    const route = createStudioBrushFrameBudgetRoute(
      { x: 100, y: 80, width: 1_100, height: 820 },
      { width: 1_440, height: 1_100 },
      24,
    );
    expect(route.points).toHaveLength(73);
    expect(route.durationTargetMs).toBeGreaterThanOrEqual(140);
    expect(route.points.every((point) => (
      point.x >= 100
      && point.x <= 1_200
      && point.y >= 80
      && point.y <= 900
    ))).toBe(true);
    expect(new Set(route.points.map((point) => Math.round(point.y))).size).toBeGreaterThan(20);
  });

  it("fails closed when the canvas cannot host a representative long stroke", () => {
    expect(() => createStudioBrushFrameBudgetRoute(
      { x: 0, y: 0, width: 260, height: 180 },
      { width: 320, height: 240 },
      18,
    )).toThrow(/too small/u);
  });

  it("profiles every sibling canvas with a bounded compositor blank-frame probe", () => {
    expect(profilerSource).toContain(
      'const compositorRoot = root.parentElement?.closest<HTMLElement>(".relative") ?? root;',
    );
    expect(profilerSource).toContain(
      'compositorRoot.querySelectorAll<HTMLCanvasElement>("canvas")',
    );
    expect(profilerSource).toContain('PerformanceObserver.supportedEntryTypes.includes("longtask")');
    expect(profilerSource).toContain("const BLANK_PROBE_WIDTH = 64;");
    expect(profilerSource).toContain("const BLANK_PROBE_HEIGHT = 32;");
    expect(profilerSource).toContain("blankFrameObservationCount");
    expect(profilerSource).toContain("blankFrameCount");
    expect(profilerSource).toContain("getImageData(");
    expect(profilerSource).not.toContain("toDataURL(");
  });

  it("keeps canvas-call instrumentation opt-in and restores patched browser prototypes", () => {
    expect(profilerSource).toContain("captureRenderWorkload?: boolean");
    expect(profilerSource).toContain("instrumentationExcludedContexts.has(context)");
    expect(profilerSource).toContain("restoreRenderInstrumentation();");
    expect(profilerSource).toContain("movingLongTaskDurationsMs");
    expect(profilerSource).toContain("releaseLongTaskDurationsMs");
  });

  it("measures synchronous append and seal work at 120/240Hz without prefix batching", () => {
    expect(profilerSource).toContain("pointerAppendDurationsMs");
    expect(profilerSource).toContain("pointerUpMainThreadMs");
    expect(profilerSource).toContain("queueMicrotask(() => {");
    expect(profilerSource).toContain("execution.targetInputSamples");
    expect(profilerSource).toContain("execution.intendedStrokeDurationMs");
    expect(profilerSource).toContain("await page.mouse.move(");
    expect(profilerSource).not.toContain("steps: execution.targetInputSamples");
  });

  it("fails full coverage closed until product route and resource receipts are exposed", () => {
    expect(profilerSource).toContain("data-studio-canonical-brush-provider-route");
    expect(profilerSource).toContain("__studioBrushCompetitiveRouteDiagnostics");
    expect(profilerSource).toContain("routeDiagnostics = snapshot");
  });
});
