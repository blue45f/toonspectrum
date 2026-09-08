import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import pencil299 from "./__fixtures__/dry-media-spacing/native-pencil-299.json";
import pencil304 from "./__fixtures__/dry-media-spacing/native-pencil-304.json";
import {
  isStudioDynamicBrushCausalDepositPipeline,
  normalizeStudioBrushDynamicsSettings,
  serializeStudioBrushDynamicsSettingsCanonical,
  studioReplaySafeBrushDynamicsSettingsForBrushId,
  STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V4,
} from "./brush/studio-brush-dynamics";
import { materializeAllStudioBrushPackSelections } from "./brush/studio-brush-pack-runtime";
import {
  appendStudioCausalDynamicBrushDepositsV2,
  beginStudioCausalDynamicBrushDepositV2,
  planStudioCausalDynamicBrushDepositsV2,
} from "./studio-causal-dynamic-brush-deposit-v2";
import { validateStudioCanonicalVNextDryMediaCompiledFrame } from "./studio-canonical-vnext-dry-media-presentation-controller";
import { compileStudioCanonicalVNextDryMediaProductFrame } from "./studio-canonical-vnext-dry-media-product-adapter";

import { planStudioDynamicBrushRender } from "./studio-dynamic-brush-render-plan";

import type { DrawEl } from "./studio-element-model";

// Native Metal UI recordings of the same public precision pencil at full opacity. The second
// recording failed the unchanged overlap gate at its first two deposits; no browser is needed to
// replay the actual immutable input through the shared planner and product compiler.
const recordings = [
  ["299", pencil299 as DrawEl],
  ["304", pencil304 as DrawEl],
] as const;

describe("causal tip-width spacing", () => {
  it.each([
    ["299", pencil299, "919fddd97d19705dd7fb2b4daa4b92fc7956ee64cd8c7a1e478268709fdcef47"],
    ["304", pencil304, "99119ba0e6d8b6be3a82d5973d05a6bb972128e117abc5946951bb671f3decd3"],
  ] as const)("preserves the exact historical %s V3 replay and quality result", async (label, input, hash) => {
    const element = input as DrawEl;
    const plan = planStudioDynamicBrushRender(element, "dry-media", false);
    expect(createHash("sha256").update(JSON.stringify(plan)).digest("hex")).toBe(hash);
    const result = await compileStudioCanonicalVNextDryMediaProductFrame({
      element, sessionEpoch: 1, strokeEpoch: 1, commandSequence: 1,
    });
    if (label === "299") {
      expect(result.status).toBe("ready");
      if (result.status !== "ready") throw new Error(result.reason);
      expect(createHash("sha256").update(JSON.stringify(result.frame.texturedPlan.dabs)).digest("hex"))
        .toBe("04a4560d57bcb529d57c2ffa3b3f9dbee3ef43d4009bc2cfcac4307568288cad");
    } else {
      expect(result).toEqual({
        status: "unavailable", reason: "quality-gate-rejected", detail: "spacing-continuity-required",
      });
    }
  });

  it.each([
    ["299", pencil299, "c363c59e9a27cee774317d4ca7bb4dd824f831304ed290b03c63ae7645efb83f"],
    ["304", pencil304, "a7d3a7647e1caa577083ab117aec536a152fc23164fbef6779ee2e5775f23f46"],
  ] as const)("preserves the original V2 planner bytes for %s geometry", (_label, input, hash) => {
    const element = {
      ...input as DrawEl,
      brushDynamics: normalizeStudioBrushDynamicsSettings({
        ...input.brushDynamics, depositPipeline: "causal-deposit-v2",
      }),
    };
    const plan = planStudioDynamicBrushRender(element, "dry-media", false);
    expect(createHash("sha256").update(JSON.stringify(plan)).digest("hex")).toBe(hash);
  });

  it("round-trips explicit V4 snapshots without upgrading historical or snapshot-less replay", () => {
    const settings = materializeAllStudioBrushPackSelections().find(
      ({ catalogId }) => catalogId === pencil304.brushCatalogId,
    )!.brushDynamics;
    expect(settings.depositPipeline).toBe(STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V4);
    expect(normalizeStudioBrushDynamicsSettings(
      JSON.parse(serializeStudioBrushDynamicsSettingsCanonical(settings)),
    )).toEqual(settings);
    for (const version of ["causal-deposit-v2", "causal-deposit-v3-segmented"] as const) {
      expect(normalizeStudioBrushDynamicsSettings({ ...settings, depositPipeline: version }).depositPipeline)
        .toBe(version);
    }
    expect(studioReplaySafeBrushDynamicsSettingsForBrushId(pencil304.brush)?.depositPipeline)
      .toBe("causal-deposit-v3-segmented");
  });

  it.each([0.01, 0.1, 0.55, 1])("keeps a newly authored 1px pencil continuous at pressure %s", async (pressure) => {
    const result = await compileStudioCanonicalVNextDryMediaProductFrame({
      element: {
        ...pencil304 as DrawEl,
        strokeWidth: 1,
        pressures: pencil304.pressures.map(() => pressure),
        brushDynamics: normalizeStudioBrushDynamicsSettings({
          ...pencil304.brushDynamics, depositPipeline: STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V4,
        }),
      },
      sessionEpoch: 1, strokeEpoch: 1, commandSequence: 1,
    });
    expect(result.status, result.status === "unavailable" ? result.detail : undefined).toBe("ready");
  });

  for (const [label, element] of recordings) {
    it.each(["recorded", "other-seed", "slow", "fast", "duplicate-sample"] as const)(
      `keeps the actual ${label} pencil continuous with %s input`,
      async (variant) => {
        const stroke = structuredClone(element);
        stroke.brushDynamics = normalizeStudioBrushDynamicsSettings({
          ...stroke.brushDynamics, depositPipeline: STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V4,
        });
        if (variant === "other-seed") stroke.id = `spacing-seed-${label}`;
        if (variant === "slow" || variant === "fast") {
          const factor = variant === "slow" ? 0.25 : 4;
          stroke.speeds = stroke.speeds?.map((speed) => speed * factor);
          stroke.sampleTimeOffsets = stroke.sampleTimeOffsets?.map((time) => time / factor);
        }
        if (variant === "duplicate-sample") {
          stroke.points.splice(2, 0, stroke.points[0]!, stroke.points[1]!);
          for (const key of [
            "pressures", "speeds", "tiltXs", "tiltYs", "twists", "tangentialPressures",
            "altitudeAngles", "azimuthAngles", "contactWidths", "contactHeights", "sampleTimeOffsets",
          ] as const) {
            const samples = stroke[key];
            if (samples) samples.splice(1, 0, samples[0]!);
          }
        }
        const before = structuredClone(stroke);
        const result = await compileStudioCanonicalVNextDryMediaProductFrame({
          element: stroke,
          sessionEpoch: 1,
          strokeEpoch: 1,
          commandSequence: 1,
        });
        expect(stroke).toEqual(before);
        expect(result.status, result.status === "unavailable" ? result.detail : undefined).toBe("ready");
        if (result.status !== "ready") throw new Error(result.reason);
        expect(validateStudioCanonicalVNextDryMediaCompiledFrame(result.frame)).toMatchObject({
          status: "ready",
        });
        expect(result.texturedDabCount).toBe(result.sourceDabCount * result.laneCount);
      },
    );
  }

  it("uses the final tapered diameter for ratio spacing and keeps the minimum-diameter floor", () => {
    const settings = normalizeStudioBrushDynamicsSettings({
      depositPipeline: STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V4,
      width: { base: 10, mappings: [], jitter: null },
      spacingRatio: 0.2,
      spacing: { mappings: [], jitter: null },
      minimumDiameterRatio: 0.3,
      taper: { enabled: true, startLength: 0.5, endLength: 0, minSizeRatio: 0.1 },
    });
    const result = planStudioCausalDynamicBrushDepositsV2({
      settings,
      points: [0, 0, 80, 0],
      pressures: [1, 1],
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.dabs[0]!.size).toBe(3);
    expect(result.dabs[1]!.sourceX).toBeCloseTo(0.6, 12);
    for (const dab of result.dabs) {
      expect(dab.spacing).toBeCloseTo(dab.size * 0.2, 12);
    }
  });

  it.each([false, true])("preserves authored absolute spacing with taper=%s", (enabled) => {
    const result = planStudioCausalDynamicBrushDepositsV2({
      settings: normalizeStudioBrushDynamicsSettings({
        depositPipeline: STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V4,
        width: { base: 10, mappings: [], jitter: null },
        spacingRatio: null,
        spacing: { base: 2, mappings: [], jitter: null },
        taper: { enabled, startLength: 0.5, endLength: 0, minSizeRatio: 0.1 },
      }),
      points: [0, 0, 20, 0],
      pressures: [1, 1],
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.dabs.map(({ sourceX }) => sourceX)).toEqual(
      Array.from({ length: 11 }, (_, index) => index * 2),
    );
  });

  it("retains the explicit bounded prefix when a thin tip needs more deposits", () => {
    const settings = normalizeStudioBrushDynamicsSettings({
      depositPipeline: STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V4,
      width: { base: 10, mappings: [], jitter: null },
      spacingRatio: 0.2,
      taper: { enabled: true, startLength: 0.5, endLength: 0, minSizeRatio: 0.1 },
    });
    const input = { settings, points: [0, 0, 200, 0], pressures: [1, 1] };
    const bounded = planStudioCausalDynamicBrushDepositsV2({ ...input, maximumDabs: 8 });
    const complete = planStudioCausalDynamicBrushDepositsV2(input);
    if (!bounded.ok || !complete.ok) throw new Error("expected valid plans");
    expect(bounded.dabCapped).toBe(true);
    expect(bounded.dabs).toHaveLength(8);
    expect(bounded.dabs).toEqual(complete.dabs.slice(0, 8));
  });

  it("keeps live batches identical to committed replay for every shipped causal brush", () => {
    const selections = materializeAllStudioBrushPackSelections().filter(({ brushDynamics }) =>
      isStudioDynamicBrushCausalDepositPipeline(brushDynamics.depositPipeline),
    );
    expect(selections.length).toBeGreaterThan(0);
    const samples = Array.from({ length: 12 }, (_, index) => ({
      x: index * 4,
      y: index * 3,
      pressure: 0.1 + index / 15,
      tangentialPressure: 0,
      speed: index / 10,
      tiltX: index,
      tiltY: -index,
      twist: index * 2,
    }));
    for (const selection of selections) {
      const settings = selection.brushDynamics;
      const input = {
        settings,
        points: samples.flatMap(({ x, y }) => [x, y]),
        pressures: samples.map(({ pressure }) => pressure),
        speeds: samples.map(({ speed }) => speed),
        tiltXs: samples.map(({ tiltX }) => tiltX),
        tiltYs: samples.map(({ tiltY }) => tiltY),
        twists: samples.map(({ twist }) => twist),
      };
      const committed = planStudioCausalDynamicBrushDepositsV2(input);
      const begun = beginStudioCausalDynamicBrushDepositV2(samples[0]!, settings);
      if (!committed.ok || !begun.ok) throw new Error(selection.catalogId);
      let state = begun.state;
      let live = [begun.dab];
      for (const batch of [samples.slice(1, 3), samples.slice(3, 4), samples.slice(4)]) {
        const appended = appendStudioCausalDynamicBrushDepositsV2(state, batch, settings);
        if (!appended.ok) throw new Error(selection.catalogId);
        if (appended.replaceInitialTap) live = [];
        live.push(...appended.dabs);
        state = appended.state;
      }
      expect(live, selection.catalogId).toEqual(committed.dabs);
      expect(state.nextDabIndex, selection.catalogId).toBe(committed.dabs.length);
    }
  });
});
