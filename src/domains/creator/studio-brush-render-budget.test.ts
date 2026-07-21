import { describe, expect, it } from "vitest";

import {
  normalizeStudioBrushDynamicsSettings,
  planStudioDynamicBrushDabs,
} from "./studio-brush-dynamics";
import {
  countStudioDynamicBrushMarksPerDab,
  planStudioDynamicBrushRenderBudget,
  STUDIO_DYNAMIC_BRUSH_COMMITTED_MARK_BUDGET,
  STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
} from "./studio-brush-render-budget";
import { encodeStudioBrushTipAlphaMapBase64 } from "./studio-brush-tip-stamp";

function fullAlphaTip() {
  const alphaMapSize = 8;
  const bytes = new Uint8Array(alphaMapSize * alphaMapSize);
  bytes.fill(255);
  return {
    shape: "hard" as const,
    softness: 0,
    alphaMapBase64: encodeStudioBrushTipAlphaMapBase64(bytes),
    alphaMapSize,
  };
}

function worstCaseSettings() {
  const tip = fullAlphaTip();
  return normalizeStudioBrushDynamicsSettings({
    tip,
    tipLayers: [
      { tip, opacity: 1 },
      { tip, opacity: 1 },
    ],
    taper: { enabled: false },
    spacingRatio: null,
    spacing: { base: 0.25, mappings: [] },
  });
}

describe("studio dynamic brush render budget", () => {
  it("preserves every ordinary solid-tip dab and the existing seven-sample quality", () => {
    const settings = normalizeStudioBrushDynamicsSettings({
      tip: { shape: "round" },
      grain: { amount: 0 },
    });
    const plan = planStudioDynamicBrushRenderBudget({
      settings,
      dabCount: 1_024,
      symmetryCount: 1,
      markBudget: STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
    });

    expect(plan).toMatchObject({
      stampGrid: 7,
      maxDabsPerVariation: 1_024,
      marksPerDab: 1,
      estimatedMarks: 1_024,
      dabCapped: false,
      stampGridReduced: false,
      capped: false,
    });
  });

  it("counts exact multi-tip samples and reduces the grid before dropping full-path dabs", () => {
    const settings = worstCaseSettings();
    expect(countStudioDynamicBrushMarksPerDab(settings, 7)).toBe(147);
    expect(countStudioDynamicBrushMarksPerDab(settings, 5)).toBe(75);
    expect(countStudioDynamicBrushMarksPerDab(settings, 3)).toBe(27);

    const plan = planStudioDynamicBrushRenderBudget({
      settings,
      dabCount: 100,
      symmetryCount: 2,
      markBudget: STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
    });
    expect(plan).toMatchObject({
      stampGrid: 5,
      maxDabsPerVariation: 100,
      estimatedMarks: 15_000,
      dabCapped: false,
      stampGridReduced: true,
      capped: true,
    });
  });

  it("bounds the 1024 x three-tip x 49-sample x 64-symmetry worst case deterministically", () => {
    const settings = worstCaseSettings();
    const input = {
      settings,
      dabCount: 1_024,
      symmetryCount: 64,
      markBudget: STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
    } as const;
    const first = planStudioDynamicBrushRenderBudget(input);
    const second = planStudioDynamicBrushRenderBudget(input);

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      stampGrid: 3,
      maxDabsPerVariation: 9,
      marksPerDab: 27,
      estimatedMarks: 15_552,
      dabCapped: true,
      stampGridReduced: true,
      capped: true,
    });
    expect(first.estimatedMarks).toBeLessThanOrEqual(STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET);
    expect(first.estimatedUnbudgetedMarks).toBe(1_024 * 3 * 49 * 64);
  });

  it("redistributes a capped plan over the whole stroke and retains both source endpoints", () => {
    const settings = worstCaseSettings();
    const input = {
      points: [0, 0, 5_000, 0],
      pressures: [0.7, 0.7],
      baseWidth: 8,
      baseOpacity: 1,
      settings,
      seed: 918,
    } as const;
    const ordinaryDabs = planStudioDynamicBrushDabs({ ...input, maxDabs: 1_024 });
    const renderBudget = planStudioDynamicBrushRenderBudget({
      settings,
      dabCount: ordinaryDabs.length,
      symmetryCount: 64,
      markBudget: STUDIO_DYNAMIC_BRUSH_COMMITTED_MARK_BUDGET,
    });
    const cappedDabs = planStudioDynamicBrushDabs({
      ...input,
      maxDabs: renderBudget.maxDabsPerVariation,
    });
    const replay = planStudioDynamicBrushDabs({
      ...input,
      maxDabs: renderBudget.maxDabsPerVariation,
    });

    expect(ordinaryDabs).toHaveLength(1_024);
    expect(renderBudget.maxDabsPerVariation).toBe(37);
    expect(cappedDabs).toHaveLength(37);
    expect(cappedDabs[0]?.sourceX).toBe(0);
    expect(cappedDabs.at(-1)?.sourceX).toBe(5_000);
    for (const [index, dab] of cappedDabs.entries()) {
      expect(dab.sourceX).toBeCloseTo(5_000 * index / 36, 10);
    }
    expect(replay).toEqual(cappedDabs);
  });
});
