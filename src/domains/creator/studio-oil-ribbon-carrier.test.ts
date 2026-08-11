import { describe, expect, it } from "vitest";

import { planOilBrushDabs } from "./studio-fx-brush";
import {
  planStudioOilRibbonCarrier,
  studioOilRibbonPathData,
  STUDIO_OIL_RIBBON_CARRIER_VERSION,
  traceStudioOilRibbonPath,
} from "./studio-oil-ribbon-carrier";

describe("studio oil/acrylic ribbon carrier", () => {
  it("replaces repeated ellipse bodies with one contiguous variable-width outline", () => {
    const dabs = planOilBrushDabs({
      points: [0, 0, 80, 30, 160, -10, 240, 45],
      pressures: [0.25, 0.65, 0.9, 0.45],
      baseWidth: 27,
      seed: 71,
    });
    const plan = planStudioOilRibbonCarrier(dabs);

    expect(plan.version).toBe(STUDIO_OIL_RIBBON_CARRIER_VERSION);
    expect(plan.sourceStationCount).toBe(dabs.length);
    expect(plan.repeatedBodyStampCount).toBe(0);
    expect(plan.body).not.toBeNull();
    expect(plan.body!.points.length).toBe(dabs.length * 4 + 12);
    // Five bristles cut into runs and regrouped into load bands. Every station of every bristle
    // is still covered — the relief is quantised for compositing, never dropped.
    expect(plan.bristleLanes.length).toBeGreaterThan(0);
    const runStations = plan.bristleLanes
      .flatMap((lane) => lane.runs)
      .reduce((total, run) => total + run.points.length / 2, 0);
    expect(runStations).toBeGreaterThanOrEqual(5 * dabs.length);
    expect(plan.bodyOpacity).toBeGreaterThan(
      dabs.reduce((sum, dab) => sum + dab.opacity, 0) / dabs.length,
    );
  });

  it("keeps bristle load varying along the stroke instead of collapsing it to one mean", () => {
    const dabs = planOilBrushDabs({
      points: [0, 0, 240, 0, 480, 0, 720, 0],
      pressures: [0.6, 0.6, 0.6, 0.6],
      baseWidth: 22,
      seed: 7,
    });
    const plan = planStudioOilRibbonCarrier(dabs);
    expect(plan.bristleLanes.length).toBeGreaterThanOrEqual(2);
    expect(plan.bristleLanes.length).toBeLessThanOrEqual(3);
    const opacities = plan.bristleLanes.map(({ opacity }) => opacity);
    const widths = plan.bristleLanes.map(({ lineWidth }) => lineWidth);
    // A single averaged lane made this range exactly zero, which is what a 770 px measured stroke
    // reported as a length-axis coefficient of variation of 0.002.
    expect(Math.max(...opacities) - Math.min(...opacities)).toBeGreaterThan(0.35);
    // Every load band must actually be spread over the stroke rather than one band owning everything.
    for (const lane of plan.bristleLanes) {
      expect(lane.runs.length).toBeGreaterThan(8);
    }
    // The ridge must be a material fraction of the ribbon rather than a hairline.
    const meanRadiusY = dabs.reduce((sum, dab) => sum + dab.radiusY, 0) / dabs.length;
    expect(Math.max(...widths)).toBeGreaterThan(meanRadiusY * 0.15);
    expect(Math.max(...widths)).toBeLessThan(meanRadiusY * 0.5);
  });

  it("responds monotonically to pressure in width, body load and bristle contact", () => {
    const light = planStudioOilRibbonCarrier(planOilBrushDabs({
      points: [0, 0, 180, 12, 360, -8, 540, 10],
      pressures: [0.12, 0.12, 0.12, 0.12],
      baseWidth: 24,
      seed: 19,
    }));
    const heavy = planStudioOilRibbonCarrier(planOilBrushDabs({
      points: [0, 0, 180, 12, 360, -8, 540, 10],
      pressures: [0.94, 0.94, 0.94, 0.94],
      baseWidth: 24,
      seed: 19,
    }));
    expect(light.body).not.toBeNull();
    expect(heavy.body).not.toBeNull();
    const bodyWidth = (plan: ReturnType<typeof planStudioOilRibbonCarrier>) => {
      const points = plan.body!.points;
      let maxCross = 0;
      for (let index = 0; index + 3 < points.length; index += 2) {
        maxCross = Math.max(
          maxCross,
          Math.hypot(points[index]! - points[index + 2]!, points[index + 1]! - points[index + 3]!),
        );
      }
      return maxCross;
    };
    expect(bodyWidth(heavy)).toBeGreaterThan(bodyWidth(light) * 1.18);
    expect(heavy.bodyOpacity).toBeGreaterThan(light.bodyOpacity);
    const heavyRidge = Math.max(...heavy.bristleLanes.map(({ lineWidth }) => lineWidth));
    const lightRidge = Math.max(...light.bristleLanes.map(({ lineWidth }) => lineWidth));
    expect(heavyRidge).toBeGreaterThan(lightRidge * 1.08);
    const lightRuns = light.bristleLanes.reduce((sum, lane) => sum + lane.runs.length, 0);
    const heavyRuns = heavy.bristleLanes.reduce((sum, lane) => sum + lane.runs.length, 0);
    expect(heavyRuns).toBeGreaterThanOrEqual(lightRuns);
  });

  it("emits multi-lane bristle structure rather than a soft round dab or flat ribbon only", () => {
    const dabs = planOilBrushDabs({
      points: [0, 0, 120, 20, 240, -10, 360, 16],
      pressures: [0.55, 0.7, 0.85, 0.6],
      baseWidth: 28,
      seed: 33,
    });
    expect(dabs.every((dab) => dab.bristles.length >= 5)).toBe(true);
    expect(dabs.every((dab) => dab.bristles.length <= 7)).toBe(true);
    const plan = planStudioOilRibbonCarrier(dabs);
    expect(plan.repeatedBodyStampCount).toBe(0);
    expect(plan.bristleLanes.length).toBeGreaterThanOrEqual(2);
    const offsets = new Set(
      dabs.flatMap((dab) => dab.bristles.map((bristle) => bristle.offsetRatio.toFixed(3))),
    );
    expect(offsets.size).toBeGreaterThanOrEqual(5);
  });

  it("keeps an 8k-pixel acrylic stroke dense with a bounded 4096-station ribbon", () => {
    const dabs = planOilBrushDabs({
      points: [0, 0, 2_000, 120, 4_000, -80, 6_000, 140, 8_000, 0],
      pressures: [0.45, 0.8, 0.55, 0.9, 0.62],
      baseWidth: 27,
      seed: 91,
      maxDabs: 4_096,
    });
    const plan = planStudioOilRibbonCarrier(dabs);

    expect(dabs.length).toBeGreaterThan(3_000);
    expect(dabs.length).toBeLessThanOrEqual(4_096);
    expect(plan.sourceStationCount).toBe(dabs.length);
    expect(plan.body!.points.length).toBe(dabs.length * 4 + 12);
    expect(plan.repeatedBodyStampCount).toBe(0);
    expect(Math.min(...plan.bristleLanes.map(({ lineWidth }) => lineWidth)))
      .toBeGreaterThan(0);
  });

  it("uses a directional polygon for a tap instead of falling back to a circle", () => {
    const plan = planStudioOilRibbonCarrier(planOilBrushDabs({
      points: [12, 18],
      pressures: [0.7],
      baseWidth: 27,
      seed: 13,
    }));

    expect(plan.sourceStationCount).toBe(1);
    expect(plan.body?.points).toHaveLength(16);
    expect(plan.bristleLanes).toEqual([]);
    expect(studioOilRibbonPathData(plan.body!, true)).not.toContain("A");
  });

  it("shares identical quantized path coordinates between Canvas tracing and SVG", () => {
    const plan = planStudioOilRibbonCarrier(planOilBrushDabs({
      points: [2, 3, 25, 12, 48, -4, 82, 19],
      pressures: [0.3, 0.6, 0.9, 0.5],
      baseWidth: 27,
      seed: 29,
    }));
    const canvasCoordinates: number[] = [];
    traceStudioOilRibbonPath({
      moveTo: (x, y) => canvasCoordinates.push(x, y),
      lineTo: (x, y) => canvasCoordinates.push(x, y),
      closePath: () => undefined,
    }, plan.body!, true);
    const svgCoordinates = (
      studioOilRibbonPathData(plan.body!, true)
        .match(/-?(?:\d+\.\d+|\d+)/gu)
      ?? []
    ).map(Number);

    expect(svgCoordinates).toEqual(canvasCoordinates);
    expect(studioOilRibbonPathData(plan.body!, true)).not.toContain("A");
  });
});
