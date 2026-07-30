import { describe, expect, it } from "vitest";

import {
  normalizeStudioBrushDynamicsSettings,
  STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V3,
} from "./studio-brush-dynamics";
import { materializeStudioBrushPackDynamics } from "./studio-brush-pack-runtime";
import {
  STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET,
  STUDIO_DYNAMIC_BRUSH_COMMITTED_MARK_BUDGET,
  STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
} from "./studio-brush-render-budget";
import { encodeStudioBrushTipAlphaMapBase64 } from "./studio-brush-tip-stamp";
import { planStudioDynamicBrushRender } from "./studio-dynamic-brush-render-plan";

import type { StudioDynamicBrushDab } from "./studio-brush-dynamics";
import type { DrawEl } from "./studio-element-model";

const ROUTE = [
  10, 20,
  24, 22,
  41, 29,
  63, 35,
  88, 31,
] as const;

function causalV3Dynamics() {
  return normalizeStudioBrushDynamicsSettings({
    depositPipeline: STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V3,
    seed: 73,
    width: { base: 8, mappings: [] },
    opacity: { base: 0.82, mappings: [] },
    flow: { base: 0.74, mappings: [] },
    spacingRatio: null,
    spacing: { base: 1.25, mappings: [] },
    scatterRatio: null,
    scatter: { base: 0, mappings: [] },
    angle: { base: 0, mappings: [] },
    roundness: { base: 1, mappings: [] },
    tip: { shape: "round", softness: 0 },
    grain: { amount: 0 },
    tipLayers: [],
    dualBrush: { enabled: false },
    taper: { enabled: false },
  });
}

function drawElement(
  id: string,
  overrides: Partial<DrawEl> = {},
): DrawEl {
  const pointCount = ROUTE.length / 2;
  return {
    id,
    type: "draw",
    kind: "freehand",
    mode: "pen",
    points: [...ROUTE],
    stroke: "#1d3f8f",
    strokeWidth: 8,
    opacity: 0.8,
    brush: "g-pen-flex",
    pressures: Array.from({ length: pointCount }, (_, index) => 0.35 + index * 0.1),
    tangentialPressures: Array.from({ length: pointCount }, () => 0),
    speeds: Array.from({ length: pointCount }, (_, index) => index * 0.08),
    tiltXs: Array.from({ length: pointCount }, (_, index) => index * 2),
    tiltYs: Array.from({ length: pointCount }, (_, index) => -index),
    twists: Array.from({ length: pointCount }, (_, index) => index * 9),
    brushDynamics: causalV3Dynamics(),
    ...overrides,
  };
}

function requireReady(
  result: ReturnType<typeof planStudioDynamicBrushRender>,
) {
  expect(result.status).toBe("ready");
  if (result.status !== "ready") {
    throw new Error(`unexpected plan rejection: ${result.reason}`);
  }
  return result.plan;
}

function requireLegacyVariation(
  plan: ReturnType<typeof requireReady>,
  index: number,
): readonly StudioDynamicBrushDab[] {
  const variation = plan.dabVariations[index];
  if (!Array.isArray(variation)) {
    throw new Error("expected a legacy flat dab variation");
  }
  return variation;
}

describe("studio dynamic brush render plan", () => {
  it("builds a deterministic segmented causal-v3 plan", () => {
    const element = drawElement("causal-v3-stroke");

    const first = requireReady(
      planStudioDynamicBrushRender(element, "g-pen-flex", true),
    );
    const replay = requireReady(
      planStudioDynamicBrushRender(
        structuredClone(element),
        "g-pen-flex",
        false,
      ),
    );

    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      materialIdentity: {
        brushId: "g-pen-flex",
        dryMediaPresetId: null,
      },
      markBudget: STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET,
      usesCausalDepositPlan: true,
      renderBudget: {
        symmetryCount: 1,
        dabCapped: false,
      },
    });
    expect(first.dabVariations).toHaveLength(1);
    expect(first.dabVariations[0]).toMatchObject({
      kind: "studio-dynamic-brush-segmented-dab-variation",
    });
  });

  it("carries the explicit catalogue material identity into every renderer-neutral plan", () => {
    const plan = requireReady(planStudioDynamicBrushRender(
      drawElement("catalogue-chalk", {
        brush: "dry-media",
        brushCatalogId: "chalk-rough",
      }),
      "dry-media",
      false,
    ));

    expect(plan.materialIdentity).toEqual({
      brushId: "dry-media",
      brushCatalogId: "chalk-rough",
      dryMediaPresetId: "chalk",
    });
  });

  it("budgets the connected professional shelf carrier as one command per causal dab", () => {
    const brushDynamics = materializeStudioBrushPackDynamics("bristle-fan-dry");
    if (!brushDynamics) throw new Error("missing bristle-fan-dry dynamics");
    const plan = requireReady(planStudioDynamicBrushRender(
      drawElement("professional-fan-bristle", {
        brush: "dry-media",
        brushCatalogId: "bristle-fan-dry",
        brushDynamics,
      }),
      "dry-media",
      true,
    ));

    expect(plan.materialIdentity).toEqual({
      brushId: "dry-media",
      brushCatalogId: "bristle-fan-dry",
      dryMediaPresetId: "charcoal",
    });
    expect(brushDynamics.tipLayers.length).toBeGreaterThan(0);
    expect(plan.renderBudget).toMatchObject({
      marksPerDab: 10,
      dabCapped: false,
    });
    expect(plan.renderBudget.estimatedMarks)
      .toBe(plan.renderBudget.maxDabsPerVariation * 10);
  });

  it("produces one exact affine dab variation per symmetry transform", () => {
    const legacyDynamics = normalizeStudioBrushDynamicsSettings({
      seed: 19,
      width: { base: 10, mappings: [] },
      opacity: { base: 1, mappings: [] },
      flow: { base: 1, mappings: [] },
      spacingRatio: null,
      spacing: { base: 4, mappings: [] },
      scatterRatio: null,
      scatter: { base: 0, mappings: [] },
      angle: { base: 0, mappings: [] },
      roundness: { base: 1, mappings: [] },
      taper: { enabled: false },
    });
    const plan = requireReady(planStudioDynamicBrushRender(
      drawElement("vertical-symmetry", {
        brushDynamics: legacyDynamics,
        symmetry: {
          type: "vertical",
          centerX: 50,
          centerY: 0,
        },
      }),
      "dry-media",
      false,
    ));
    const identity = requireLegacyVariation(plan, 0);
    const reflected = requireLegacyVariation(plan, 1);

    expect(plan.usesCausalDepositPlan).toBe(false);
    expect(plan.renderBudget.symmetryCount).toBe(2);
    expect(plan.dabVariations).toHaveLength(2);
    expect(reflected).toHaveLength(identity.length);
    expect(reflected.map((dab) => ({
      sourceX: dab.sourceX,
      sourceY: dab.sourceY,
      x: dab.x,
      y: dab.y,
    }))).toEqual(identity.map((dab) => ({
      sourceX: 100 - dab.sourceX,
      sourceY: dab.sourceY,
      x: 100 - dab.x,
      y: dab.y,
    })));
  });

  it("uses the live legacy budget only for active drafts and restores committed fidelity", () => {
    const alphaBytes = new Uint8Array(8 * 8);
    alphaBytes.fill(255);
    const texturedLegacyDynamics = normalizeStudioBrushDynamicsSettings({
      seed: 5,
      width: { base: 8, mappings: [] },
      opacity: { base: 1, mappings: [] },
      flow: { base: 1, mappings: [] },
      spacingRatio: null,
      spacing: { base: 0.25, mappings: [] },
      scatterRatio: null,
      scatter: { base: 0, mappings: [] },
      roundness: { base: 1, mappings: [] },
      tip: {
        shape: "hard",
        softness: 0,
        alphaMapBase64: encodeStudioBrushTipAlphaMapBase64(alphaBytes),
        alphaMapSize: 8,
      },
      taper: { enabled: false },
    });
    const element = drawElement("legacy-budget", {
      points: [0, 0, 10_000, 0],
      pressures: [1, 1],
      tangentialPressures: [0, 0],
      speeds: [0, 0.5],
      tiltXs: [0, 0],
      tiltYs: [0, 0],
      twists: [0, 0],
      brushDynamics: texturedLegacyDynamics,
    });
    const active = requireReady(
      planStudioDynamicBrushRender(element, "dry-media", true),
    );
    const committed = requireReady(
      planStudioDynamicBrushRender(element, "dry-media", false),
    );
    const activeDabs = requireLegacyVariation(active, 0);
    const committedDabs = requireLegacyVariation(committed, 0);

    expect(active.markBudget).toBe(STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET);
    expect(committed.markBudget).toBe(STUDIO_DYNAMIC_BRUSH_COMMITTED_MARK_BUDGET);
    expect(active.renderBudget.dabCapped).toBe(true);
    expect(committed.renderBudget.dabCapped).toBe(false);
    expect(activeDabs.length).toBe(active.renderBudget.maxDabsPerVariation);
    expect(committedDabs.length).toBe(committed.renderBudget.maxDabsPerVariation);
    expect(committedDabs.length).toBeGreaterThan(activeDabs.length);
  });

  it("rejects malformed causal input instead of falling back to a legacy deposition", () => {
    const malformed = drawElement("malformed-causal", {
      points: [0, 0, Number.NaN, 12],
      pressures: [0.5, 0.7],
      tangentialPressures: [0, 0],
      speeds: [0, 0.3],
      tiltXs: [0, 0],
      tiltYs: [0, 0],
      twists: [0, 0],
    });

    expect(planStudioDynamicBrushRender(
      malformed,
      "g-pen-flex",
      true,
    )).toEqual({
      status: "rejected",
      reason: "deposit-plan",
    });
  });
});
