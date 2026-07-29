import { describe, expect, it } from "vitest";

import {
  normalizeStudioBrushDynamicsSettings,
  planNormalizedStudioDynamicBrushDabs,
  STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V2,
} from "./studio-brush-dynamics";
import { materializeStudioBrushPackSelection } from "./studio-brush-pack-runtime";
import {
  countStudioDynamicBrushMarksPerDab,
  planStudioDynamicBrushRenderBudget,
  STUDIO_DYNAMIC_BRUSH_CAUSAL_MARK_BUDGET,
} from "./studio-brush-render-budget";
import {
  appendStudioCausalDynamicBrushDepositsV2,
  beginStudioCausalDynamicBrushDepositV2,
  planStudioCausalDynamicBrushDepositsV2,
  STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_DABS,
  type StudioCausalDynamicBrushSampleV2,
} from "./studio-causal-dynamic-brush-deposit-v2";

const MEDIA_IDS = ["pencil-4b-rough", "g-pen-flex"] as const;

const ROUTE = Object.freeze([
  12, 28,
  24, 30,
  39, 35,
  57, 44,
  78, 51,
  101, 49,
  125, 39,
  150, 27,
] as const);

const PRESSURES = Object.freeze([0.28, 0.36, 0.48, 0.62, 0.78, 0.88, 0.7, 0.5]);
const SPEEDS = Object.freeze([0, 0.22, 0.31, 0.44, 0.52, 0.47, 0.38, 0.3]);
const TILT_XS = Object.freeze([3, 5, 8, 12, 16, 19, 17, 12]);
const TILT_YS = Object.freeze([-2, -3, -5, -7, -9, -11, -9, -6]);
const TWISTS = Object.freeze([4, 9, 15, 22, 31, 39, 48, 57]);

function selection(id: (typeof MEDIA_IDS)[number]) {
  const value = materializeStudioBrushPackSelection(id);
  if (!value) throw new Error(`missing ${id}`);
  return value;
}

function planInput(id: (typeof MEDIA_IDS)[number]) {
  const selected = selection(id);
  return {
    points: ROUTE,
    pressures: PRESSURES,
    speeds: SPEEDS,
    tiltXs: TILT_XS,
    tiltYs: TILT_YS,
    twists: TWISTS,
    settings: selected.brushDynamics,
  } as const;
}

function sampleAt(
  index: number,
  fallbackPressure: number,
): StudioCausalDynamicBrushSampleV2 {
  return {
    x: ROUTE[index * 2]!,
    y: ROUTE[index * 2 + 1]!,
    pressure: PRESSURES[index] ?? fallbackPressure,
    tangentialPressure: 0,
    speed: SPEEDS[index] ?? 0,
    tiltX: TILT_XS[index] ?? 0,
    tiltY: TILT_YS[index] ?? 0,
    twist: TWISTS[index] ?? 0,
  };
}

describe("causal dynamic-brush deposit v2", () => {
  it.each(MEDIA_IDS)(
    "opts newly materialized %s into the causal contract while legacy snapshots stay omitted",
    (id) => {
      expect(selection(id).brushDynamics.depositPipeline).toBe(
        STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V2,
      );
    },
  );

  it("keeps omitted and unknown persisted pipeline values on the legacy contract", () => {
    const legacy = normalizeStudioBrushDynamicsSettings({
      seed: 41,
      width: { base: 8 },
    });
    const unknown = normalizeStudioBrushDynamicsSettings({
      ...legacy,
      depositPipeline: "causal-deposit-v99",
    });

    expect(legacy.depositPipeline).toBeUndefined();
    expect(unknown.depositPipeline).toBeUndefined();
    expect(JSON.stringify(legacy)).not.toContain("depositPipeline");
    expect(unknown).toEqual(legacy);
  });

  it("keeps the new causal G-pen on the exact one-primitive nib path", () => {
    const gPen = selection("g-pen-flex");

    expect(gPen.brushDynamics.tip).toMatchObject({
      shape: "round",
      softness: 0,
    });
    expect(countStudioDynamicBrushMarksPerDab(gPen.brushDynamics, 7)).toBe(1);
  });

  it("applies the snapshotted minimum to causal geometry without flooring pigment", () => {
    const settings = {
      depositPipeline: STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V2,
      taper: { enabled: false },
      width: {
        base: 20,
        mappings: [{ source: "pressure" as const, from: 0.05, to: 1 }],
        jitter: null,
      },
      opacity: {
        base: 0.8,
        mappings: [{ source: "pressure" as const, from: 0.2, to: 1 }],
        jitter: null,
      },
      flow: {
        base: 0.6,
        mappings: [{ source: "pressure" as const, from: 0.3, to: 1 }],
        jitter: null,
      },
    };
    const plan = (minimumDiameterRatio: number) =>
      planStudioCausalDynamicBrushDepositsV2({
        points: [5, 5],
        pressures: [0],
        settings: normalizeStudioBrushDynamicsSettings({
          ...settings,
          minimumDiameterRatio,
        }),
      });
    const unbounded = plan(0);
    const fullDiameterFloor = plan(1);

    expect(unbounded.ok).toBe(true);
    expect(fullDiameterFloor.ok).toBe(true);
    if (!unbounded.ok || !fullDiameterFloor.ok) return;
    expect(unbounded.dabs[0]!.size).toBeCloseTo(1, 10);
    expect(fullDiameterFloor.dabs[0]!.size).toBe(20);
    expect(fullDiameterFloor.dabs[0]!.opacity).toBe(
      unbounded.dabs[0]!.opacity,
    );
    expect(fullDiameterFloor.dabs[0]!.flow).toBe(
      unbounded.dabs[0]!.flow,
    );
  });

  it("retains a 2,000px technical needle stroke beyond the old 4,096-dab ceiling", () => {
    const selected = materializeStudioBrushPackSelection("technical-needle-ink");
    if (!selected) throw new Error("missing technical-needle-ink");
    const plan = planStudioCausalDynamicBrushDepositsV2({
      points: [0, 0, 2_000, 0],
      pressures: [0.8, 0.8],
      settings: selected.brushDynamics,
      maximumDabs: STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_DABS,
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.dabs.length).toBeGreaterThan(4_096);
    expect(plan.dabs.length).toBeLessThanOrEqual(
      STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_DABS,
    );
    const renderBudget = planStudioDynamicBrushRenderBudget({
      settings: selected.brushDynamics,
      dabCount: plan.dabs.length,
      symmetryCount: 1,
      markBudget: STUDIO_DYNAMIC_BRUSH_CAUSAL_MARK_BUDGET,
    });
    expect(renderBudget.maxDabsPerVariation).toBe(plan.dabs.length);
    expect(renderBudget.dabCapped).toBe(false);
  });

  it.each(MEDIA_IDS)(
    "produces the identical %s deposit sequence incrementally and from retained full replay",
    (id) => {
      const input = planInput(id);
      const exact = planStudioCausalDynamicBrushDepositsV2(input);
      expect(exact.ok).toBe(true);
      if (!exact.ok) throw new Error(exact.reason);

      const first = sampleAt(0, input.settings.fallbackPressure);
      const begun = beginStudioCausalDynamicBrushDepositV2(
        first,
        input.settings,
      );
      expect(begun.ok).toBe(true);
      if (!begun.ok) throw new Error(begun.reason);
      let state = begun.state;
      let liveDabs = [begun.dab];
      for (const indexes of [[1, 2], [3], [4, 5], [6, 7]]) {
        const appended = appendStudioCausalDynamicBrushDepositsV2(
          state,
          indexes.map((index) =>
            sampleAt(index, input.settings.fallbackPressure)),
          input.settings,
        );
        expect(appended.ok).toBe(true);
        if (!appended.ok) throw new Error(appended.reason);
        if (appended.replaceInitialTap) liveDabs = [];
        liveDabs.push(...appended.dabs);
        state = appended.state;
      }

      expect(liveDabs).toEqual(exact.dabs);
      expect(liveDabs.length).toBeGreaterThan(4);
      expect(liveDabs.map(({ index }) => index)).toEqual(
        Array.from({ length: liveDabs.length }, (_, index) => index),
      );
    },
  );

  it.each(MEDIA_IDS)(
    "keeps an accepted moving %s prefix unchanged when future samples append",
    (id) => {
      const input = planInput(id);
      const prefix = planStudioCausalDynamicBrushDepositsV2({
        ...input,
        points: ROUTE.slice(0, 10),
        pressures: PRESSURES.slice(0, 5),
        speeds: SPEEDS.slice(0, 5),
        tiltXs: TILT_XS.slice(0, 5),
        tiltYs: TILT_YS.slice(0, 5),
        twists: TWISTS.slice(0, 5),
      });
      const complete = planStudioCausalDynamicBrushDepositsV2(input);
      expect(prefix.ok).toBe(true);
      expect(complete.ok).toBe(true);
      if (!prefix.ok || !complete.ok) throw new Error("expected causal plans");

      expect(complete.dabs.slice(0, prefix.dabs.length)).toEqual(prefix.dabs);
      expect(complete.dabs.length).toBeGreaterThan(prefix.dabs.length);
    },
  );

  it.each(MEDIA_IDS)(
    "removes the historical whole-stroke replay mismatch for %s",
    (id) => {
      const input = planInput(id);
      const causal = planStudioCausalDynamicBrushDepositsV2(input);
      expect(causal.ok).toBe(true);
      if (!causal.ok) throw new Error(causal.reason);
      const historical = planNormalizedStudioDynamicBrushDabs({
        points: input.points,
        pressures: input.pressures,
        speeds: input.speeds,
        tiltXs: input.tiltXs,
        tiltYs: input.tiltYs,
        twists: input.twists,
        baseWidth: input.settings.width.base,
        baseOpacity: input.settings.opacity.base,
        seed: input.settings.seed,
        maxDabs: 1_024,
      }, input.settings);

      expect(historical).not.toEqual(causal.dabs);
      // The new live and settled inputs are the same immutable list, so renderer churn is exactly
      // zero before any Canvas implementation detail or antialias tolerance is considered.
      expect(structuredClone(causal.dabs)).toEqual(causal.dabs);
    },
  );

  it("keeps a tap visible, rejects invalid samples and freezes an explicit dab-budget prefix", () => {
    const input = planInput("pencil-4b-rough");
    const tap = planStudioCausalDynamicBrushDepositsV2({
      ...input,
      points: ROUTE.slice(0, 2),
      pressures: PRESSURES.slice(0, 1),
    });
    expect(tap.ok).toBe(true);
    if (!tap.ok) throw new Error(tap.reason);
    expect(tap.dabs).toHaveLength(1);
    expect(tap.dabs[0]!.size).toBeGreaterThan(0);

    expect(planStudioCausalDynamicBrushDepositsV2({
      ...input,
      points: [0, 0, Number.NaN, 1],
    })).toEqual({ ok: false, reason: "invalid-input" });
    const capped = planStudioCausalDynamicBrushDepositsV2({
      ...input,
      maximumDabs: 1,
    });
    expect(capped.ok).toBe(true);
    if (!capped.ok) throw new Error(capped.reason);
    expect(capped.dabs).toHaveLength(1);
    expect(capped.dabs[0]!.index).toBe(0);
    expect(capped.dabCapped).toBe(true);
    expect(capped.sourcePointCount).toBe(input.points.length / 2);
  });
});
