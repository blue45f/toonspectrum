import { describe, expect, it } from "vitest";

import {
  renderStudioBrushEngineSelectionMarkdown,
  runStudioBrushEngineSelectionBenchmark,
  STUDIO_BRUSH_ENGINE_SELECTION_REPORT_SCHEMA_VERSION,
} from "../studio-brush-engine-selection-benchmark";

describe("Studio brush-engine role selection benchmark", () => {
  it("compares current providers on common fixtures without collapsing media roles", async () => {
    const report = await runStudioBrushEngineSelectionBenchmark({
      sampleCount: 96,
      longStrokeSampleCount: 192,
      hokusaiSampleCount: 64,
      timingRuns: 1,
    });

    expect(report.schemaVersion).toBe(
      STUDIO_BRUSH_ENGINE_SELECTION_REPORT_SCHEMA_VERSION,
    );
    expect(report.inputTransport).toMatchObject({
      preservationRatio: 1,
      exactDeliveryOrderPreserved: true,
      pressureTiltTwistPreserved: true,
      passed: true,
    });

    const stabilizerIds = report.stabilization.candidates.map(({ id }) => id);
    expect(stabilizerIds).toEqual(expect.arrayContaining([
      "none",
      "standard-strength-4",
      "adaptive-strength-4",
      "precision-strength-4",
      "lazy-precision-strength-4",
      "one-euro-v1-balanced",
      "one-euro-v1-max-smooth",
    ]));
    expect(report.stabilization.candidates.every((candidate) => (
      Number.isFinite(candidate.jitterCrossTrackRmsPx)
      && Number.isFinite(candidate.cornerDeviationAtTurnPx)
      && Number.isFinite(candidate.fastMotionEndpointLagPx)
      && candidate.endpointCatchUpErrorPx <= 1e-6
      && Number.isFinite(candidate.frequencyInvariance.maximumRmsPx)
    ))).toBe(true);
    expect(stabilizerIds).toContain(
      report.stabilization.defaultDecision.selected,
    );

    expect(report.lineArt).toMatchObject({
      available: true,
      deterministicReplay: true,
      passed: true,
    });
    if (report.lineArt.available) {
      expect(report.lineArt.pressureResponse.highToLowAreaRatio).toBeGreaterThan(1.25);
      expect(report.lineArt.curvatureContinuity.finite).toBe(true);
    }

    expect(report.dynamicRaster.passed).toBe(true);
    for (const brush of report.dynamicRaster.brushes) {
      expect(brush).toMatchObject({
        available: true,
        deterministicSeedReplay: true,
        differentSeedChangesPlan: true,
        liveIncrementalEqualsCommittedPlan: true,
        passed: true,
      });
      if (brush.available) {
        expect(brush.overlapAlpha).toMatchObject({
          alphaDecreaseRegressionPixels: 0,
          premultipliedColorDecreaseRegressionChannels: 0,
          monotonic: true,
        });
        expect(brush.erase).toMatchObject({
          alphaIncreaseRegressionPixels: 0,
          monotonic: true,
        });
      }
    }

    expect(report.wetInk).toMatchObject({
      pigmentWetMixDistinctness: {
        watercolorAndInkWashProduceDistinctFields: true,
        passed: true,
      },
      passed: true,
    });
    expect(report.wetInk.brushes.every((brush) => (
      brush.available
      && brush.liveCommitFieldParity
      && brush.liveCommitPixelParity
    ))).toBe(true);

    expect(report.naturalMedia).toMatchObject({
      available: true,
      deterministicSeedReplay: true,
      changedSeedChangesFrame: true,
      passed: true,
    });
    expect(report.longStroke.performanceVetoPassed).toBe(true);

    expect(report.roleDecisions.map(({ role }) => role)).toEqual(
      expect.arrayContaining([
        "manga line-art geometry",
        "dry/texture dab planning",
        "physical watercolor and ink wash",
        "natural-media settled raster",
      ]),
    );
    expect(report.externalBrowserGates.every(
      ({ measuredInThisNodeRun }) => measuredInThisNodeRun === false,
    )).toBe(true);
    expect(report.qualityGatePassed).toBe(true);

    const markdown = renderStudioBrushEngineSelectionMarkdown(report);
    expect(markdown).toContain("## Role decisions");
    expect(markdown).toContain("## Stabilization (same fixtures)");
    expect(markdown).toContain("## Perfect Freehand line art");
    expect(markdown).toContain("## Dynamic dab / dry texture");
    expect(markdown).toContain("## Wet pigment");
    expect(markdown).toContain("## Mandatory external browser gates");
  }, 60_000);
});
