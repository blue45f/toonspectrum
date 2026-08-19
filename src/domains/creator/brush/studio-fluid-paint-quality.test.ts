import { describe, expect, it } from "vitest";

import { resolveStudioBrushRenderFamily } from "../studio-brush";
import { planOilBrushDabs } from "../studio-fx-brush";

import { studioOilProgramSetForBrush } from "./studio-brush-engine-program-set";
import {
  STUDIO_FLUID_PAINT_STATION_SPACING_RATIO,
  isStudioFluidPaintBrushId,
} from "./studio-fluid-paint-reference";
import {
  planStudioOilRibbonCarrier,
  studioOilRibbonProgramsForBrush,
} from "./studio-oil-ribbon-carrier";
import { wetMixStroke } from "./studio-wet-mix";

function longStroke() {
  const points: number[] = [];
  const pressures: number[] = [];
  for (let index = 0; index < 24; index += 1) {
    points.push(20 + index * 16, 40 + Math.sin(index / 4) * 10);
    pressures.push(0.7);
  }
  return { points, pressures };
}

describe("Fluid Paint product quality", () => {
  it("routes the four Fluid Paint tools through the oil ribbon with every physical program", () => {
    for (const brush of [
      "fluid-paint",
      "fluid-paint-fine",
      "fluid-paint-load",
      "fluid-paint-rake",
    ] as const) {
      expect(isStudioFluidPaintBrushId(brush)).toBe(true);
      expect(resolveStudioBrushRenderFamily(brush)).toBe("oil");
      const programs = studioOilProgramSetForBrush(brush);
      expect(programs.bristlePhysics).toBe(true);
      expect(programs.bristleLoadDynamics).toBe(true);
      expect(programs.impastoRelief).toBe(true);
      const options = studioOilRibbonProgramsForBrush(brush, 11);
      expect(options?.bristlePhysics?.enabled).toBe(true);
      expect(options?.bristleLoadDynamics?.enabled).toBe(true);
      expect(options?.impastoRelief?.enabled).toBe(true);
    }
  });

  it("walks Fluid Paint stations at 1/8 oil pitch so the film is a capsule splat, not beads", () => {
    const { points, pressures } = longStroke();
    const oil = planOilBrushDabs({
      points,
      pressures,
      baseWidth: 28,
      seed: 7,
    });
    const fluid = planOilBrushDabs({
      points,
      pressures,
      baseWidth: 28,
      seed: 7,
      stationSpacingRatio: STUDIO_FLUID_PAINT_STATION_SPACING_RATIO,
    });
    expect(fluid.length).toBeGreaterThan(oil.length * 3);
    expect(fluid.every((dab) => dab.bristles.length >= 5)).toBe(true);
  });

  it("upgrades the core oil and acrylic brushes to bristle physics plus GGX relief", () => {
    expect(studioOilProgramSetForBrush("oil").bristlePhysics).toBe(true);
    expect(studioOilProgramSetForBrush("oil").impastoRelief).toBe(true);
    expect(studioOilProgramSetForBrush("acrylic").bristlePhysics).toBe(true);
    expect(studioOilProgramSetForBrush("acrylic").impastoRelief).toBe(true);
    const dabs = planOilBrushDabs({ ...longStroke(), baseWidth: 26, seed: 3 });
    const plan = planStudioOilRibbonCarrier(
      dabs,
      studioOilRibbonProgramsForBrush("oil", 3),
    );
    expect(plan.impastoReliefLanes?.length ?? 0).toBeGreaterThan(0);
    expect(plan.bristleLanes.length).toBeGreaterThan(0);
  });

  it("mixes Fluid Paint colors in RYB so red+yellow stays orange, not brown-mud", () => {
    const canvas = new Uint8ClampedArray(32 * 16 * 4);
    for (let index = 0; index < 32 * 16; index += 1) {
      const offset = index * 4;
      canvas[offset] = 255;
      canvas[offset + 1] = 0;
      canvas[offset + 2] = 0;
      canvas[offset + 3] = 255;
    }
    const mixed = wetMixStroke(
      canvas,
      32,
      16,
      [{ x: 16, y: 8 }],
      {
        radiusPx: 8,
        hardness: 0.4,
        strength: 1,
        wetness: 0.5,
        pickup: 1,
        paintColor: { r: 255, g: 255, b: 0 },
        mixModel: "ryb",
      },
    );
    const center = (8 * 32 + 16) * 4;
    expect(mixed[center]!).toBeGreaterThan(180);
    expect(mixed[center + 1]!).toBeGreaterThan(40);
    expect(mixed[center + 2]!).toBeLessThan(80);
  });
});
