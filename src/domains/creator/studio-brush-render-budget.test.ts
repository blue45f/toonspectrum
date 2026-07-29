import { describe, expect, it } from "vitest";

import {
  normalizeStudioBrushDynamicsSettings,
  planStudioDynamicBrushDabs,
  STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V2,
  STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V3,
} from "./studio-brush-dynamics";
import {
  countStudioDynamicBrushMarksPerDab,
  planStudioDynamicBrushRenderBudget,
  STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_DAB_BUDGET,
  STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET,
  STUDIO_DYNAMIC_BRUSH_CAUSAL_DAB_BUDGET,
  STUDIO_DYNAMIC_BRUSH_CAUSAL_MARK_BUDGET,
  STUDIO_DYNAMIC_BRUSH_CAUSAL_STAMP_GRID,
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
  it("counts causal-v2 full alpha textures as one command instead of a three-sample circle grid", () => {
    const settings = normalizeStudioBrushDynamicsSettings({
      depositPipeline: STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V2,
      tip: fullAlphaTip(),
      grain: { amount: 0.25 },
    });
    const tap = planStudioDynamicBrushRenderBudget({
      settings,
      dabCount: 1,
      symmetryCount: 1,
      markBudget: STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
    });
    const longStroke = planStudioDynamicBrushRenderBudget({
      settings,
      dabCount: 1_024,
      symmetryCount: 1,
      markBudget: STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
    });

    expect(tap).toMatchObject({
      stampGrid: STUDIO_DYNAMIC_BRUSH_CAUSAL_STAMP_GRID,
      maxDabsPerVariation: 1,
      marksPerDab: 1,
      stampGridReduced: false,
      capped: false,
    });
    expect(longStroke).toMatchObject({
      stampGrid: STUDIO_DYNAMIC_BRUSH_CAUSAL_STAMP_GRID,
      maxDabsPerVariation: 1_024,
      marksPerDab: 1,
      estimatedMarks: 1_024,
      stampGridReduced: false,
      dabCapped: false,
      capped: false,
    });
  });

  it("charges one causal command for each enabled full-texture tip layer", () => {
    const settings = normalizeStudioBrushDynamicsSettings({
      depositPipeline: STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V2,
      tip: fullAlphaTip(),
      grain: { amount: 0.25 },
      tipLayers: [
        { tip: fullAlphaTip(), opacity: 1 },
        { tip: fullAlphaTip(), opacity: 0.5 },
      ],
      dualBrush: {
        enabled: true,
        tip: { shape: "star", softness: 0.1 },
        blendMode: "multiply",
        sizeRatio: 0.8,
      },
    });

    expect(countStudioDynamicBrushMarksPerDab(settings, 3)).toBe(3);
    expect(countStudioDynamicBrushMarksPerDab(settings, 7)).toBe(3);
    expect(planStudioDynamicBrushRenderBudget({
      settings,
      dabCount: 1_000,
      symmetryCount: 1,
      markBudget: STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
    })).toMatchObject({
      maxDabsPerVariation: 1_000,
      marksPerDab: 3,
      estimatedMarks: 3_000,
      dabCapped: false,
    });
  });

  it("issues a deterministic complete-dab-wave prefix receipt at 64-way symmetry", () => {
    const settings = normalizeStudioBrushDynamicsSettings({
      depositPipeline: STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V2,
      tip: fullAlphaTip(),
      grain: { amount: 0.25 },
      tipLayers: [
        { tip: fullAlphaTip(), opacity: 1 },
        { tip: fullAlphaTip(), opacity: 0.5 },
      ],
      taper: { enabled: false },
    });
    const acceptedWaveCount = Math.floor(
      STUDIO_DYNAMIC_BRUSH_CAUSAL_MARK_BUDGET / (64 * 3),
    );
    const atBudget = planStudioDynamicBrushRenderBudget({
      settings,
      dabCount: acceptedWaveCount,
      symmetryCount: 64,
      markBudget: STUDIO_DYNAMIC_BRUSH_CAUSAL_MARK_BUDGET,
    });
    const overBudget = planStudioDynamicBrushRenderBudget({
      settings,
      dabCount: acceptedWaveCount + 1,
      symmetryCount: 64,
      markBudget: STUDIO_DYNAMIC_BRUSH_CAUSAL_MARK_BUDGET,
    });

    expect(atBudget).toMatchObject({
      maxDabsPerVariation: acceptedWaveCount,
      marksPerDab: 3,
      estimatedMarks: acceptedWaveCount * 64 * 3,
      dabCapped: false,
    });
    expect(atBudget.acceptedPrefixReceipt).toBeUndefined();
    expect(overBudget).toMatchObject({
      maxDabsPerVariation: acceptedWaveCount,
      estimatedMarks: acceptedWaveCount * 64 * 3,
      dabCapped: true,
      acceptedPrefixReceipt: {
        kind: "studio-dynamic-brush-accepted-prefix-receipt",
        version: 1,
        policy: "accepted-prefix-v1",
        requestedDabsPerVariation: acceptedWaveCount + 1,
        acceptedDabsPerVariation: acceptedWaveCount,
        rejectedDabsPerVariation: 1,
        marksPerDab: 3,
        symmetryCount: 64,
        markBudget: STUDIO_DYNAMIC_BRUSH_CAUSAL_MARK_BUDGET,
        acceptedMarkBudget: acceptedWaveCount * 64 * 3,
      },
    });
    expect(overBudget.estimatedMarks).toBeLessThanOrEqual(
      STUDIO_DYNAMIC_BRUSH_CAUSAL_MARK_BUDGET,
    );
  });

  it("retains 1,500 causal solid-tip dabs inside the shared live/retained/SVG ceiling", () => {
    const settings = normalizeStudioBrushDynamicsSettings({
      depositPipeline: STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V2,
      tip: { shape: "round", softness: 0 },
      grain: { amount: 0 },
      tipLayers: [],
      dualBrush: { enabled: false },
      taper: { enabled: false },
    });
    const plan = planStudioDynamicBrushRenderBudget({
      settings,
      dabCount: 1_500,
      symmetryCount: 1,
      markBudget: STUDIO_DYNAMIC_BRUSH_CAUSAL_MARK_BUDGET,
    });

    expect(plan).toMatchObject({
      stampGrid: STUDIO_DYNAMIC_BRUSH_CAUSAL_STAMP_GRID,
      maxDabsPerVariation: 1_500,
      marksPerDab: 1,
      estimatedMarks: 1_500,
      dabCapped: false,
      capped: false,
    });
  });

  it("keeps v2 capped at 65,536 while v3 admits deterministic continuation work", () => {
    const base = {
      tip: { shape: "round" as const, softness: 0 },
      grain: { amount: 0 },
      tipLayers: [],
      dualBrush: { enabled: false },
      taper: { enabled: false },
    };
    const requestedDabs = STUDIO_DYNAMIC_BRUSH_CAUSAL_DAB_BUDGET + 769;
    const v2 = planStudioDynamicBrushRenderBudget({
      settings: normalizeStudioBrushDynamicsSettings({
        ...base,
        depositPipeline: STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V2,
      }),
      dabCount: requestedDabs,
      symmetryCount: 1,
      markBudget: STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET,
    });
    const v3 = planStudioDynamicBrushRenderBudget({
      settings: normalizeStudioBrushDynamicsSettings({
        ...base,
        depositPipeline: STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V3,
      }),
      dabCount: requestedDabs,
      symmetryCount: 1,
      markBudget: STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET,
    });

    expect(v2).toMatchObject({
      maxDabsPerVariation: STUDIO_DYNAMIC_BRUSH_CAUSAL_DAB_BUDGET,
      estimatedMarks: STUDIO_DYNAMIC_BRUSH_CAUSAL_DAB_BUDGET,
      estimatedUnbudgetedMarks: requestedDabs,
      dabCapped: true,
      acceptedPrefixReceipt: {
        requestedDabsPerVariation: requestedDabs,
        acceptedDabsPerVariation: STUDIO_DYNAMIC_BRUSH_CAUSAL_DAB_BUDGET,
        rejectedDabsPerVariation: 769,
      },
    });
    expect(v3).toMatchObject({
      maxDabsPerVariation: requestedDabs,
      estimatedMarks: requestedDabs,
      dabCapped: false,
    });
  });

  it("reports v3 work rejected above the sixteen-segment ceiling without admitting it", () => {
    const settings = normalizeStudioBrushDynamicsSettings({
      depositPipeline: STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V3,
      tip: { shape: "round", softness: 0 },
      grain: { amount: 0 },
      tipLayers: [],
      dualBrush: { enabled: false },
      taper: { enabled: false },
    });
    const rejectedDabs = 513;
    const requestedDabs =
      STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_DAB_BUDGET + rejectedDabs;
    const plan = planStudioDynamicBrushRenderBudget({
      settings,
      dabCount: requestedDabs,
      symmetryCount: 1,
      markBudget: STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET,
    });

    expect(plan).toMatchObject({
      maxDabsPerVariation:
        STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_DAB_BUDGET,
      estimatedMarks: STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET,
      estimatedUnbudgetedMarks: requestedDabs,
      dabCapped: true,
      capped: true,
      acceptedPrefixReceipt: {
        requestedDabsPerVariation: requestedDabs,
        acceptedDabsPerVariation:
          STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_DAB_BUDGET,
        rejectedDabsPerVariation: rejectedDabs,
        symmetryCount: 1,
        markBudget: STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET,
        acceptedMarkBudget:
          STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET,
      },
    });
  });

  it("combines the v3 version ceiling with a tighter symmetry mark ceiling in one receipt", () => {
    const settings = normalizeStudioBrushDynamicsSettings({
      depositPipeline: STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V3,
      tip: { shape: "round", softness: 0 },
      grain: { amount: 0 },
      tipLayers: [],
      dualBrush: { enabled: false },
      taper: { enabled: false },
    });
    const requestedDabs =
      STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_DAB_BUDGET + 257;
    const symmetryCount = 4;
    const acceptedDabs = Math.floor(
      STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET / symmetryCount,
    );
    const plan = planStudioDynamicBrushRenderBudget({
      settings,
      dabCount: requestedDabs,
      symmetryCount,
      markBudget: STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET,
    });

    expect(plan).toMatchObject({
      maxDabsPerVariation: acceptedDabs,
      estimatedMarks:
        acceptedDabs * symmetryCount,
      estimatedUnbudgetedMarks:
        requestedDabs * symmetryCount,
      dabCapped: true,
      acceptedPrefixReceipt: {
        requestedDabsPerVariation: requestedDabs,
        acceptedDabsPerVariation: acceptedDabs,
        rejectedDabsPerVariation: requestedDabs - acceptedDabs,
        marksPerDab: 1,
        symmetryCount,
        markBudget: STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET,
        acceptedMarkBudget:
          acceptedDabs * symmetryCount,
      },
    });
    expect(plan.maxDabsPerVariation).toBeLessThan(
      STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_DAB_BUDGET,
    );
  });

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

  it("counts exact multi-tip samples and bounds both grid quality and live stations", () => {
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
      stampGrid: 3,
      maxDabsPerVariation: 75,
      estimatedMarks: 4_050,
      dabCapped: true,
      stampGridReduced: true,
      capped: true,
    });
  });

  it("retains the legacy adaptive seven, five and three-sample quality ladder", () => {
    const settings = worstCaseSettings();
    const plan = (dabCount: number, symmetryCount = 1) =>
      planStudioDynamicBrushRenderBudget({
        settings,
        dabCount,
        symmetryCount,
        markBudget: STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
      });

    expect(plan(20).stampGrid).toBe(7);
    expect(plan(32).stampGrid).toBe(5);
    expect(plan(100, 2).stampGrid).toBe(3);
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
      maxDabsPerVariation: 2,
      marksPerDab: 27,
      estimatedMarks: 3_456,
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
