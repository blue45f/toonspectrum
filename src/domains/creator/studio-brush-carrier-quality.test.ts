import { describe, expect, it } from "vitest";

import {
  applyStudioBrushContinuousCarrierQualityPolicy,
  STUDIO_BRUSH_CONTINUOUS_CARRIER_POLICY_VERSION,
} from "./studio-brush-carrier-quality";
import {
  normalizeStudioBrushDynamicsSettings,
  serializeStudioBrushDynamicsSettingsCanonical,
  studioBrushDynamicsPresetSettings,
} from "./studio-brush-dynamics";
import { materializeStudioBrushPackSelection } from "./studio-brush-pack-runtime";
import { STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET } from "./studio-brush-render-budget";
import { encodeStudioBrushTipAlphaMapBase64 } from "./studio-brush-tip-stamp";
import { planStudioCausalDynamicBrushDepositSegmentsV3 } from "./studio-causal-dynamic-brush-deposit-v2";
import { planStudioDynamicBrushCoverageMarks } from "./studio-dynamic-brush-coverage-renderer";

describe("continuous brush carrier quality policy", () => {
  it("bounds soft continuous station/scatter envelopes without changing pressure mappings", () => {
    const source = normalizeStudioBrushDynamicsSettings({
      ...studioBrushDynamicsPresetSettings("airbrush"),
      spacingRatio: 0.42,
      scatterRatio: 0.68,
      width: {
        base: 48,
        mappings: [{ source: "pressure", from: 0.4, to: 1.5, curve: 1.3 }],
        jitter: { mode: "multiply", amount: 0.7 },
      },
      scatter: {
        mappings: [{ source: "speed", from: 0.5, to: 1.8 }],
        jitter: { mode: "multiply", amount: 0.8 },
      },
      colorDynamics: {
        foregroundBackgroundJitter: 0.2,
        hueJitter: 12,
        saturationJitter: 0.1,
        valueJitter: 0.16,
      },
    });

    const result = applyStudioBrushContinuousCarrierQualityPolicy({
      runtimeBrushId: "airbrush",
      category: "paint",
      previewStyle: "soft",
      settings: source,
    });

    expect(STUDIO_BRUSH_CONTINUOUS_CARRIER_POLICY_VERSION)
      .toBe("continuous-carrier-quality-v2");
    expect(result.spacingRatio).toBe(0.16);
    expect(result.scatterRatio).toBe(0.08);
    expect(result.width.mappings).toEqual(source.width.mappings);
    expect(result.width.jitter).toEqual({ mode: "multiply", amount: 0.18 });
    expect(result.scatter.jitter).toEqual({ mode: "multiply", amount: 0.14 });
    expect(result.colorDynamics).toEqual({
      ...source.colorDynamics,
      foregroundBackgroundJitter: 0,
      hueJitter: 0,
      saturationJitter: 0,
      valueJitter: 0,
    });
  });

  it("adds only a subtle seeded rotation decorrelator to an otherwise repeated texture", () => {
    const source = normalizeStudioBrushDynamicsSettings({
      ...studioBrushDynamicsPresetSettings("dry-media"),
      angle: {
        base: 0,
        mappings: [{ source: "direction", mode: "add", from: 0, to: 360 }],
        jitter: null,
      },
    });

    const result = applyStudioBrushContinuousCarrierQualityPolicy({
      runtimeBrushId: "dry-media",
      category: "texture",
      previewStyle: "texture",
      settings: source,
    });

    expect(result.angle.mappings).toEqual(source.angle.mappings);
    expect(result.angle.jitter).toEqual({ mode: "add", amount: 2.5 });
    expect(
      serializeStudioBrushDynamicsSettingsCanonical(
        applyStudioBrushContinuousCarrierQualityPolicy({
          runtimeBrushId: "dry-media",
          category: "texture",
          previewStyle: "texture",
          settings: source,
        }),
      ),
    ).toBe(serializeStudioBrushDynamicsSettingsCanonical(result));
  });

  it("keeps an untextured alpha-mapped flat nib stable instead of rotating every station", () => {
    const source = normalizeStudioBrushDynamicsSettings({
      ...studioBrushDynamicsPresetSettings("ink-particle"),
      tip: {
        shape: "hard",
        softness: 0.05,
        alphaMapBase64: encodeStudioBrushTipAlphaMapBase64(
          new Uint8Array(64 * 64).fill(255),
        ),
        alphaMapSize: 64,
      },
      grain: {
        space: "canvas-fixed",
        amount: 0,
        scale: 8,
        contrast: 0.35,
        seed: 1,
      },
      angle: {
        base: -30,
        mappings: [{ source: "direction", mode: "add", from: 0, to: 360 }],
        jitter: null,
      },
    });

    const result = applyStudioBrushContinuousCarrierQualityPolicy({
      runtimeBrushId: "ink-particle",
      category: "marker",
      previewStyle: "calligraphy",
      settings: source,
    });

    expect(result.tip.alphaMapBase64).toBe(source.tip.alphaMapBase64);
    expect(result.angle.mappings).toEqual(source.angle.mappings);
    expect(result.angle.jitter).toBeNull();
  });

  it("leaves deliberately separated particle/stamp carriers semantically unchanged", () => {
    const source = normalizeStudioBrushDynamicsSettings({
      ...studioBrushDynamicsPresetSettings("airbrush"),
      spacingRatio: 0.9,
      scatterRatio: 1.6,
      angle: {
        base: 0,
        mappings: [],
        jitter: { mode: "add", amount: 180 },
      },
    });

    const result = applyStudioBrushContinuousCarrierQualityPolicy({
      runtimeBrushId: "airbrush",
      category: "effect",
      previewStyle: "dots",
      settings: source,
    });

    expect(result).toEqual(source);
    expect(result).not.toBe(source);
  });

  it("treats soft and flowing effects as continuous while preserving explicit effect particles", () => {
    const source = normalizeStudioBrushDynamicsSettings({
      ...studioBrushDynamicsPresetSettings("airbrush"),
      tip: { shape: "soft", softness: 0.82 },
      grain: {
        space: "canvas-fixed",
        amount: 0.28,
        scale: 20,
        contrast: 0.4,
        seed: 0x4b0a_2301,
      },
      spacingRatio: 0.24,
      scatterRatio: 0.18,
      width: {
        base: 52,
        mappings: [{ source: "pressure", from: 0.7, to: 1.38 }],
        jitter: { mode: "multiply", amount: 0.2 },
      },
      angle: {
        base: 0,
        mappings: [{ source: "direction", mode: "add", from: 0, to: 360 }],
        jitter: { mode: "add", amount: 32 },
      },
      roundness: {
        base: 0.84,
        mappings: [],
        jitter: { mode: "multiply", amount: 0.4 },
      },
    });

    for (const previewStyle of ["soft", "wavy"]) {
      const continuous = applyStudioBrushContinuousCarrierQualityPolicy({
        runtimeBrushId: "airbrush",
        category: "effect",
        previewStyle,
        settings: source,
      });

      expect(continuous.spacingRatio, previewStyle).toBe(
        previewStyle === "soft" ? 0.16 : 0.18,
      );
      expect(continuous.scatterRatio, previewStyle).toBe(
        previewStyle === "soft" ? 0.08 : 0.1,
      );
      expect(continuous.width.jitter, previewStyle).toEqual({
        mode: "multiply",
        amount: 0.18,
      });
      expect(continuous.angle.jitter, previewStyle).toEqual({
        mode: "add",
        amount: 12,
      });
      expect(continuous.roundness.jitter, previewStyle).toEqual({
        mode: "multiply",
        amount: 0.12,
      });
    }

    for (const previewStyle of ["dashed", "dots", "glitter", "tone"]) {
      const discrete = applyStudioBrushContinuousCarrierQualityPolicy({
        runtimeBrushId: "airbrush",
        category: "effect",
        previewStyle,
        settings: source,
      });
      expect(
        serializeStudioBrushDynamicsSettingsCanonical(discrete),
        previewStyle,
      ).toBe(serializeStudioBrushDynamicsSettingsCanonical(source));
    }

    const repeatedRay = applyStudioBrushContinuousCarrierQualityPolicy({
      runtimeBrushId: "ink-particle",
      category: "effect",
      previewStyle: "wavy",
      settings: source,
    });
    expect(serializeStudioBrushDynamicsSettingsCanonical(repeatedRay)).toBe(
      serializeStudioBrushDynamicsSettingsCanonical(source),
    );
  });

  it("stabilizes custom-map continuous paint while preserving discrete colour dynamics", () => {
    const colorDynamics = {
      foregroundBackgroundJitter: 0.2,
      hueJitter: 10,
      saturationJitter: 0.08,
      valueJitter: 0.12,
    };
    const customMap = applyStudioBrushContinuousCarrierQualityPolicy({
      runtimeBrushId: "airbrush",
      category: "paint",
      previewStyle: "soft",
      settings: normalizeStudioBrushDynamicsSettings({
        ...studioBrushDynamicsPresetSettings("airbrush"),
        tip: {
          shape: "soft",
          softness: 0.8,
          alphaMapBase64: encodeStudioBrushTipAlphaMapBase64(
            new Uint8Array(64 * 64).fill(255),
          ),
          alphaMapSize: 64,
        },
        colorDynamics,
      }),
    });
    const discrete = applyStudioBrushContinuousCarrierQualityPolicy({
      runtimeBrushId: "airbrush",
      category: "effect",
      previewStyle: "dots",
      settings: normalizeStudioBrushDynamicsSettings({
        ...studioBrushDynamicsPresetSettings("airbrush"),
        tip: { shape: "soft", softness: 0.8 },
        colorDynamics,
      }),
    });

    expect(customMap.colorDynamics).toEqual({
      ...normalizeStudioBrushDynamicsSettings({ colorDynamics }).colorDynamics,
      foregroundBackgroundJitter: 0,
      hueJitter: 0,
      saturationJitter: 0,
      valueJitter: 0,
    });
    expect(discrete.colorDynamics).toEqual(
      normalizeStudioBrushDynamicsSettings({ colorDynamics }).colorDynamics,
    );
  });

  it("keeps a long wet-watercolour wash one analytic mark per dab and one cached tint", () => {
    const selection = materializeStudioBrushPackSelection(
      "watercolor-wet-bleed",
    );
    expect(selection).not.toBeNull();
    const dynamics = selection!.brushDynamics;
    const sourcePointCount = 4_096;
    const points: number[] = [];
    const pressures: number[] = [];
    const speeds: number[] = [];
    const zeroes = new Array<number>(sourcePointCount).fill(0);
    for (let index = 0; index < sourcePointCount; index += 1) {
      points.push(index * 2, 80 + Math.sin(index / 25) * 36);
      pressures.push(0.5 + Math.sin(index / 71) * 0.18);
      speeds.push(0.6);
    }
    const deposits = planStudioCausalDynamicBrushDepositSegmentsV3({
      points,
      pressures,
      tangentialPressures: zeroes,
      speeds,
      tiltXs: zeroes,
      tiltYs: zeroes,
      twists: zeroes,
      settings: dynamics,
    });
    expect(deposits.ok).toBe(true);
    if (!deposits.ok) return;
    const segments = deposits.segments.map((segment) => segment.dabs);
    const dabCount = segments.reduce(
      (count, segment) => count + segment.length,
      0,
    );
    const coverage = planStudioDynamicBrushCoverageMarks({
      dabVariations: [{
        kind: "studio-dynamic-brush-segmented-dab-variation",
        segments,
      }],
      dynamics,
      dynamicSeed: 0x51f1_7a3e,
      stroke: "#315f9b",
      stampGrid: 3,
      markBudget: STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET,
    });

    expect(dabCount).toBeGreaterThan(1_000);
    expect(dabCount).toBeLessThan(sourcePointCount);
    expect(coverage.ok).toBe(true);
    if (!coverage.ok) return;
    expect(coverage.marks).toHaveLength(dabCount);
    expect(coverage.marks.every((mark) => (
      mark.falloff?.kind === "analytic-radial"
      && mark.texture === undefined
    ))).toBe(true);
    // Per-station colour churn both reveals the carrier lattice and forces one 259² tint pass per
    // cache miss. A continuous wet wash must retain a single reusable tinted falloff surface.
    expect(new Set(coverage.marks.map((mark) => mark.color))).toEqual(
      new Set(["#315f9b"]),
    );

    // Repeated source-over deposits of the same pigment can only increase coverage. This guards
    // the self-overlap case that previously looked as if a lighter later carrier erased pigment.
    const sampleX = coverage.marks[0]!.x;
    const sampleY = coverage.marks[0]!.y;
    let accumulatedAlpha = 0;
    let contributingMarks = 0;
    for (const mark of coverage.marks) {
      const cosine = Math.cos(mark.angleRadians);
      const sine = Math.sin(mark.angleRadians);
      const dx = sampleX - mark.x;
      const dy = sampleY - mark.y;
      const localX = dx * cosine + dy * sine;
      const localY = -dx * sine + dy * cosine;
      const radius = Math.hypot(
        localX / mark.radiusX,
        localY / mark.radiusY,
      );
      if (radius >= 1) continue;
      const sourceAlpha = mark.alpha
        * Math.pow(1 - radius, mark.falloff!.exponent);
      const nextAlpha = sourceAlpha + accumulatedAlpha * (1 - sourceAlpha);
      expect(nextAlpha).toBeGreaterThanOrEqual(accumulatedAlpha);
      accumulatedAlpha = nextAlpha;
      contributingMarks += 1;
    }
    expect(contributingMarks).toBeGreaterThan(2);
    expect(accumulatedAlpha).toBeGreaterThan(0);
    expect(accumulatedAlpha).toBeLessThanOrEqual(1);
  });
});
