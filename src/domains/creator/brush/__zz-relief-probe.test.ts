import { describe, expect, it } from "vitest";

import {
  FX_OIL_DAB_CAP,
  FxOilDabPlanner,
  fxBrushSeedFromKey,
  studioOilPaintBodyForBrush,
  studioOilTipProfileForBrush,
  type FxOilDab,
} from "../studio-fx-brush";

import { studioFluidPaintStationSpacingRatio } from "./studio-fluid-paint-reference";
import {
  StudioOilRibbonCarrierPlanner,
  planStudioOilRibbonCarrier,
  studioOilRibbonProgramsForBrush,
} from "./studio-oil-ribbon-carrier";

const SEED = fxBrushSeedFromKey("relief-probe");
const BRUSH = "oil--impasto-ribbon";

type Shape = (i: number) => readonly [number, number, number];

function dabsAt(points: number[], pressures: number[], planner?: FxOilDabPlanner): FxOilDab[] {
  const spacing = studioFluidPaintStationSpacingRatio(BRUSH);
  const input = {
    points,
    pressures,
    baseWidth: 24,
    seed: SEED,
    maxDabs: FX_OIL_DAB_CAP,
    paintBody: studioOilPaintBodyForBrush(BRUSH),
    tipProfile: studioOilTipProfileForBrush(BRUSH),
    capMode: "prefix-stable-ladder-v2" as const,
    ...(spacing === undefined ? {} : { stationSpacingRatio: spacing }),
  };
  return planner ? planner.plan(input) : (new FxOilDabPlanner()).plan(input);
}

const SHAPES: Record<string, Shape> = {
  // straight-ish, monotone growth
  line: (i) => [80 + i * 3.1, 300 + Math.sin(i / 40) * 4, 0.55],
  // back-and-forth: the bbox's right edge is set by the mutable tail and retracts
  zigzag: (i) => [
    200 + Math.sin(i / 6) * 90,
    120 + i * 1.4,
    0.3 + 0.5 * Math.abs(Math.sin(i / 17)),
  ],
  // spiral inward: max extents are set early by settled stations, then the tail comes back
  spiral: (i) => {
    const t = i / 9;
    const r = 240 - i * 0.5;
    return [420 + Math.cos(t) * r, 420 + Math.sin(t) * r, 0.5];
  },
  // hairpin: goes right, then folds back left past the start, then right again
  hairpin: (i) => {
    const x = i < 60 ? 100 + i * 6 : i < 140 ? 460 - (i - 60) * 6 : -20 + (i - 140) * 9;
    return [x, 300 + Math.sin(i / 11) * 30, 0.6];
  },
  // strong pressure swing: radiusY (and so the film stamp gap) varies hard
  pressure: (i) => [
    90 + i * 3.4,
    300 + Math.cos(i / 13) * 40,
    0.06 + 0.92 * Math.abs(Math.sin(i / 9)),
  ],
};

describe("relief probe", () => {
  for (const [name, shape] of Object.entries(SHAPES)) {
    it(`per-sample append stays batch-identical — ${name}`, () => {
      const options = studioOilRibbonProgramsForBrush(BRUSH, SEED);
      const planner = new StudioOilRibbonCarrierPlanner();
      const dabPlanner = new FxOilDabPlanner();
      const points: number[] = [];
      const pressures: number[] = [];
      const failures: string[] = [];
      for (let i = 0; i < 320; i += 1) {
        const [x, y, p] = shape(i);
        points.push(x, y);
        pressures.push(p);
        if (i < 3) continue;
        const dabs = dabsAt([...points], [...pressures], dabPlanner);
        const got = planner.plan(dabs, options);
        const want = planStudioOilRibbonCarrier(dabs, options);
        try {
          expect(got.impastoReliefLanes).toEqual(want.impastoReliefLanes);
        } catch {
          const g = JSON.stringify(got.impastoReliefLanes)?.length ?? 0;
          const w = JSON.stringify(want.impastoReliefLanes)?.length ?? 0;
          failures.push(`sample=${i} dabs=${dabs.length} gotLen=${g} wantLen=${w}`);
          if (failures.length > 6) break;
        }
      }
      expect(failures).toEqual([]);
    });
  }
});
