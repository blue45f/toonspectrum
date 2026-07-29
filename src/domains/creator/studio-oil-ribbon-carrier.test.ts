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
    expect(plan.bristleLanes).toHaveLength(5);
    expect(plan.bristleLanes.every((lane) => lane.points.length === dabs.length * 2))
      .toBe(true);
    expect(plan.bodyOpacity).toBeGreaterThan(
      dabs.reduce((sum, dab) => sum + dab.opacity, 0) / dabs.length,
    );
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
