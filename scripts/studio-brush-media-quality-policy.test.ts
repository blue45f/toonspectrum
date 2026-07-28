import { describe, expect, it } from "vitest";

import {
  STUDIO_BRUSH_MEDIA_CASES,
  evaluateStudioBrushMediaCase,
  evaluateStudioBrushMediaSuite,
  type StudioBrushMediaArtifactQualityMetrics,
  type StudioBrushMediaCaseMetrics,
  type StudioBrushMediaFrameMetrics,
} from "./studio-brush-media-quality-policy";

function frame(
  overrides: Partial<StudioBrushMediaFrameMetrics> = {},
): StudioBrushMediaFrameMetrics {
  return {
    changedPixels: 500,
    totalPixels: 20_000,
    maxChannelDelta: 180,
    inkEnergy: 300,
    meanChannelDelta: 153,
    p95ChannelDelta: 150,
    textureCoefficient: 0.4,
    textureEntropy: 0.62,
    pathCoverage: 0.98,
    longestGapSamples: 1,
    pathSamples: 80,
    scallopCoefficient: 0.22,
    fingerprint: "fingerprint-a",
    featureVector: [0.1, 0.2, 0.6, 0.4],
    ...overrides,
  };
}

function pixelQuality(
  overrides: Partial<StudioBrushMediaArtifactQualityMetrics> = {},
): StudioBrushMediaArtifactQualityMetrics {
  return {
    visiblePixels: 500,
    meanVisibleDelta: 153,
    p95VisibleDelta: 150,
    scallopResidualCoefficient: 0.04,
    widthSampleCount: 79,
    repetitionScore: 0.06,
    repetitionRawCorrelation: 0.72,
    repetitionAxis: "x",
    repetitionPeriodPx: 17,
    repetitionSamplePairs: 1_000,
    ...overrides,
  };
}

function metrics(
  id: StudioBrushMediaCaseMetrics["id"],
  overrides: Partial<StudioBrushMediaCaseMetrics> = {},
): StudioBrushMediaCaseMetrics {
  return {
    id,
    live: frame({ inkEnergy: 260 }),
    settled: frame(),
    pass2: frame({ changedPixels: 560, inkEnergy: 340 }),
    pass3: frame({ changedPixels: 610, inkEnergy: 370 }),
    pixelQuality: pixelQuality(),
    liveToSettled: {
      changedPixels: 30,
      totalPixels: 20_000,
      maxChannelDelta: 18,
      liveInkEnergy: 260,
      settledInkEnergy: 300,
      energyRatio: 300 / 260,
      comparedInkPixels: 520,
      differenceRatio: 30 / 520,
      ignoredCursorRadius: 16,
    },
    undoToBaseline: {
      changedPixels: 0,
      totalPixels: 20_000,
      maxChannelDelta: 0,
    },
    redoToSettled: {
      changedPixels: 2,
      totalPixels: 20_000,
      maxChannelDelta: 3,
    },
    pass1ToPass2: {
      previousInkEnergy: 300,
      nextInkEnergy: 340,
      energyRatio: 340 / 300,
      regressedInkPixels: 5,
      previousInkPixels: 500,
      regressedInkRatio: 0.01,
      regressedInkEnergy: 2,
      regressedInkEnergyRatio: 2 / 300,
      maximumPigmentLossDelta: 7,
    },
    pass2ToPass3: {
      previousInkEnergy: 340,
      nextInkEnergy: 370,
      energyRatio: 370 / 340,
      regressedInkPixels: 5,
      previousInkPixels: 560,
      regressedInkRatio: 5 / 560,
      regressedInkEnergy: 2,
      regressedInkEnergyRatio: 2 / 340,
      maximumPigmentLossDelta: 7,
    },
    ...overrides,
  };
}

describe("Studio browser brush-media quality policy", () => {
  it("accepts a visible continuous medium whose pigment accumulates and history is stable", () => {
    const policy = STUDIO_BRUSH_MEDIA_CASES.find((entry) => entry.id === "g-pen-flex")!;
    expect(evaluateStudioBrushMediaCase(policy, metrics(policy.id))).toEqual({
      ok: true,
      findings: [],
    });
  });

  it("fails obvious pointerup loss, interior holes, pigment removal, and history residue", () => {
    const policy = STUDIO_BRUSH_MEDIA_CASES.find(
      (entry) => entry.id === "airbrush-grand-soft",
    )!;
    const result = evaluateStudioBrushMediaCase(policy, metrics(policy.id, {
      settled: frame({
        changedPixels: 80,
        inkEnergy: 40,
        pathCoverage: 0.35,
        longestGapSamples: 32,
      }),
      liveToSettled: {
        changedPixels: 320,
        totalPixels: 20_000,
        maxChannelDelta: 120,
        liveInkEnergy: 260,
        settledInkEnergy: 40,
        energyRatio: 40 / 260,
        comparedInkPixels: 400,
        differenceRatio: 320 / 400,
        ignoredCursorRadius: 16,
      },
      undoToBaseline: {
        changedPixels: 70,
        totalPixels: 20_000,
        maxChannelDelta: 100,
      },
      redoToSettled: {
        changedPixels: 60,
        totalPixels: 20_000,
        maxChannelDelta: 80,
      },
      pass1ToPass2: {
        previousInkEnergy: 300,
        nextInkEnergy: 120,
        energyRatio: 0.4,
        regressedInkPixels: 280,
        previousInkPixels: 500,
        regressedInkRatio: 0.56,
        regressedInkEnergy: 180,
        regressedInkEnergyRatio: 0.6,
        maximumPigmentLossDelta: 140,
      },
    }));

    expect(result.ok).toBe(false);
    expect(new Set(result.findings.filter((finding) => finding.level === "error")
      .map((finding) => finding.code))).toEqual(new Set([
      "no-visible-media",
      "settled-stroke-disappeared",
      "live-settled-divergence",
      "interior-gap",
      "pigment-regressed",
      "pigment-energy-loss",
      "undo-residue",
      "redo-diverged",
    ]));
  });

  it("keeps small cross-platform settle and accumulation changes diagnostic-only", () => {
    const policy = STUDIO_BRUSH_MEDIA_CASES.find(
      (entry) => entry.id === "watercolor-wet-wash",
    )!;
    const result = evaluateStudioBrushMediaCase(policy, metrics(policy.id, {
      liveToSettled: {
        changedPixels: 220,
        totalPixels: 20_000,
        maxChannelDelta: 22,
        liveInkEnergy: 260,
        settledInkEnergy: 300,
        energyRatio: 300 / 260,
        comparedInkPixels: 540,
        differenceRatio: 220 / 540,
        ignoredCursorRadius: 16,
      },
      pass1ToPass2: {
        previousInkEnergy: 300,
        nextInkEnergy: 291,
        energyRatio: 0.97,
        regressedInkPixels: 55,
        previousInkPixels: 500,
        regressedInkRatio: 0.11,
        regressedInkEnergy: 9,
        regressedInkEnergyRatio: 0.03,
        maximumPigmentLossDelta: 12,
      },
      settled: frame({ scallopCoefficient: 0.78 }),
    }));

    expect(result.ok).toBe(true);
    expect(result.findings.every((finding) => finding.level === "warning")).toBe(true);
    expect(result.findings.map((finding) => finding.code)).toEqual([
      "settle-churn",
      "pigment-regressed",
      "scallop-variance",
    ]);
  });

  it("fails faint ink, live parity drift, scalloping, tiling, and local pigment energy loss", () => {
    const policy = STUDIO_BRUSH_MEDIA_CASES.find((entry) => entry.id === "g-pen-flex")!;
    const result = evaluateStudioBrushMediaCase(policy, metrics(policy.id, {
      settled: frame({
        meanChannelDelta: 12,
        p95ChannelDelta: 24,
      }),
      liveToSettled: {
        changedPixels: 420,
        totalPixels: 20_000,
        maxChannelDelta: 160,
        liveInkEnergy: 260,
        settledInkEnergy: 300,
        energyRatio: 300 / 260,
        comparedInkPixels: 500,
        differenceRatio: 0.84,
        ignoredCursorRadius: 16,
      },
      pixelQuality: pixelQuality({
        scallopResidualCoefficient: 0.46,
        repetitionScore: 0.67,
        repetitionRawCorrelation: 0.96,
        repetitionPeriodPx: 12,
      }),
      pass2ToPass3: {
        previousInkEnergy: 340,
        nextInkEnergy: 350,
        energyRatio: 350 / 340,
        regressedInkPixels: 18,
        previousInkPixels: 560,
        regressedInkRatio: 18 / 560,
        regressedInkEnergy: 52,
        regressedInkEnergyRatio: 52 / 340,
        maximumPigmentLossDelta: 92,
      },
    }));

    expect(result.ok).toBe(false);
    expect(new Set(result.findings.filter((finding) => finding.level === "error")
      .map((finding) => finding.code))).toEqual(new Set([
      "faint-media",
      "live-settled-divergence",
      "pigment-energy-loss",
      "scallop-artifact",
      "repeated-grid-pattern",
    ]));
  });

  it("requires at least seven distinct visual fingerprints across the eight media", () => {
    const representatives = STUDIO_BRUSH_MEDIA_CASES.map((policy, index) => metrics(
      policy.id,
      {
        pass3: frame({
          fingerprint: index < 3 ? "same" : `fingerprint-${index}`,
          featureVector: [index / 10, 0.2, 0.4, 0.6],
        }),
      },
    ));

    const result = evaluateStudioBrushMediaSuite(representatives);
    expect(result.ok).toBe(false);
    expect(result.uniqueFingerprintCount).toBe(6);
    expect(result.findings.some((finding) => (
      finding.level === "error" && finding.code === "fingerprint-collision"
    ))).toBe(true);
  });
});
