import { describe, expect, it } from "vitest";

import {
  electStudioBrushGpuQuality,
  type StudioBrushGpuQualityElectionInput,
  type StudioBrushLongStrokePerformanceEvidence,
  type StudioBrushLongStrokeQualityEvidence,
} from "./studio-brush-gpu-quality-election";

function performance(overrides: Partial<StudioBrushLongStrokePerformanceEvidence> = {}) {
  return {
    drawMilliseconds: 1_000,
    frameP50Milliseconds: 16.7,
    frameP95Milliseconds: 20,
    frameP99Milliseconds: 28,
    longTaskCount: 1,
    longTaskTotalMilliseconds: 60,
    inputDeliveryRatio: 1,
    heapGrowthBytes: 2 * 1024 * 1024,
    ...overrides,
  };
}

function quality(overrides: Partial<StudioBrushLongStrokeQualityEvidence> = {}) {
  return {
    measured: true,
    ownQualityPassed: true,
    browserErrorCount: 0,
    refusedStrokeCount: 0,
    gpuSurfaceObserved: true,
    liveToCommittedChangedRatio: 0.005,
    committedToSettledChangedRatio: 0,
    centerlineCoverage: 0.995,
    visiblePixels: 12_000,
    inkEnergy: 500_000,
    edgeDensity: 0.2,
    ...overrides,
  };
}

function candidate(
  overrides: Partial<StudioBrushGpuQualityElectionInput> = {},
): StudioBrushGpuQualityElectionInput {
  return {
    brushId: "gpen",
    policy: "strict-continuous",
    baseline: { quality: quality({ gpuSurfaceObserved: false }), performance: performance() },
    gpu: { quality: quality(), performance: performance() },
    crossEngine: {
      comparedPixels: 1_000_000,
      changedInkRatio: 0.02,
      silhouetteIntersectionOverUnion: 0.985,
      inkEnergyRatio: 1,
      edgeDensityRatio: 1,
      gradientEnergyRatio: 1,
      luminanceHistogramIntersection: 0.99,
      horizontalProfileCorrelation: 0.99,
      verticalProfileCorrelation: 0.99,
      normalizedBoundsDrift: 0,
      normalizedCentroidDrift: 0,
    },
    ...overrides,
  };
}

describe("studio brush GPU quality election", () => {
  it("prefers a tied GPU path only after every quality gate passes", () => {
    const result = electStudioBrushGpuQuality(candidate());
    expect(result).toMatchObject({
      selected: "gpu",
      qualityEquivalent: true,
      performanceNonInferior: true,
      reasons: [],
    });
  });

  it("keeps the incumbent when texture energy is reduced even if GPU is much faster", () => {
    const input = candidate();
    const result = electStudioBrushGpuQuality(candidate({
      gpu: { quality: quality(), performance: performance({
        drawMilliseconds: 300,
        frameP50Milliseconds: 8,
        frameP95Milliseconds: 10,
        frameP99Milliseconds: 12,
      }) },
      crossEngine: { ...input.crossEngine, gradientEnergyRatio: 0.7 },
    }));
    expect(result.selected).toBe("incumbent");
    expect(result.reasons).toContain("gradient-energy");
  });

  it("keeps the incumbent when live and committed texture continuity regresses", () => {
    const result = electStudioBrushGpuQuality(candidate({
      gpu: { quality: quality({ liveToCommittedChangedRatio: 0.03 }), performance: performance() },
    }));
    expect(result.selected).toBe("incumbent");
    expect(result.reasons).toContain("live-commit-regression");
  });

  it("does not elect a path that was not observed on a GPU surface", () => {
    const result = electStudioBrushGpuQuality(candidate({
      gpu: { quality: quality({ gpuSurfaceObserved: false }), performance: performance() },
    }));
    expect(result.selected).toBe("incumbent");
    expect(result.reasons).toContain("gpu-surface-not-observed");
  });

  it("treats erasers and transparent water-only tools as measured but not generic GPU candidates", () => {
    for (const policy of ["eraser", "record-only-transparent"] as const) {
      const result = electStudioBrushGpuQuality(candidate({ policy }));
      expect(result.selected).toBe("incumbent");
      expect(result.qualityEquivalent).toBe(false);
    }
  });

  it("rejects a material p95 regression even when pixels are equivalent", () => {
    const result = electStudioBrushGpuQuality(candidate({
      gpu: { quality: quality(), performance: performance({ frameP95Milliseconds: 24 }) },
    }));
    expect(result.selected).toBe("incumbent");
    expect(result.qualityEquivalent).toBe(true);
    expect(result.performanceNonInferior).toBe(false);
    expect(result.reasons).toContain("performance-regression");
  });
});
