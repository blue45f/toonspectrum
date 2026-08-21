/**
 * Identity guard for the growing-stroke oil dab planner.
 *
 * `FxOilDabPlanner` exists so a live oil stroke stops rebuilding its whole bed on every pointer
 * move. It is only allowed to exist if the bed it returns is the one a full replan returns —
 * ADR-0010 puts texture and pen-feel above performance, so "close" is a regression.
 *
 * The interesting boundary is the dab cap. Below it `sampleStations` walks a prefix-stable arc
 * lattice; at `naturalStationCount > stationLimit` it refits across the WHOLE arc and every station
 * moves, so a cache that assumed stability would silently diverge exactly where strokes get long.
 * The three cap rows below pin cap-1 / cap / cap+1 natural stations.
 */
import { describe, expect, it } from "vitest";

import {
  FX_OIL_DAB_CAP,
  FxOilDabPlanner,
  planOilBrushDabs,
  type FxOilDab,
  type FxOilPlanInput,
} from "../studio-fx-brush";

import { planStudioOilRibbonCarrier, studioOilRibbonProgramsForBrush } from "./studio-oil-ribbon-carrier";

const SEED = 20_997;
const BASE_WIDTH = 22;

function makeStroke(n: number, step = 3): { points: number[]; pressures: number[] } {
  const points: number[] = [];
  const pressures: number[] = [];
  let x = 40;
  let y = 300;
  let heading = 0;
  for (let index = 0; index < n; index += 1) {
    heading += 0.012 + Math.sin(index * 0.03) * 0.004;
    x += Math.cos(heading) * step + Math.sin(index * 0.37) * 0.04 * step;
    y += Math.sin(heading) * step + Math.cos(index * 0.51) * 0.04 * step;
    points.push(x, y);
    pressures.push(0.25 + 0.7 * Math.abs(Math.sin(index * 0.004)));
  }
  return { points, pressures };
}

function planInputFor(n: number, stroke: { points: number[]; pressures: number[] }): FxOilPlanInput {
  return {
    points: stroke.points.slice(0, n * 2),
    pressures: stroke.pressures.slice(0, n),
    baseWidth: BASE_WIDTH,
    seed: SEED,
    maxDabs: FX_OIL_DAB_CAP,
    paintBody: "oil",
    tipProfile: "bristle",
  };
}

/** Exact identity, field by field — `toEqual` would accept a `+0`/`-0` swap, this does not. */
function expectByteEqualDabs(actual: readonly FxOilDab[], expected: readonly FxOilDab[]): void {
  expect(actual.length).toBe(expected.length);
  for (let index = 0; index < expected.length; index += 1) {
    const left = actual[index]!;
    const right = expected[index]!;
    for (const key of ["x", "y", "radiusX", "radiusY", "angleRad", "opacity"] as const) {
      if (!Object.is(left[key], right[key])) {
        throw new Error(`dab[${index}].${key}: ${String(left[key])} !== ${String(right[key])}`);
      }
    }
    if (left.bristles.length !== right.bristles.length) {
      throw new Error(
        `dab[${index}].bristles.length: ${left.bristles.length} !== ${right.bristles.length}`,
      );
    }
    for (let hair = 0; hair < right.bristles.length; hair += 1) {
      const a = left.bristles[hair]!;
      const b = right.bristles[hair]!;
      for (const key of ["offsetRatio", "radiusXRatio", "radiusYRatio", "opacity"] as const) {
        if (!Object.is(a[key], b[key])) {
          throw new Error(
            `dab[${index}].bristles[${hair}].${key}: ${String(a[key])} !== ${String(b[key])}`,
          );
        }
      }
    }
  }
}

/**
 * Smallest source-point count whose natural station lattice reaches the cap. Below it the dab
 * count equals the natural station count; at and above it the count saturates, which is what makes
 * this a usable probe for the refit boundary.
 */
function firstCappedPointCount(stroke: { points: number[]; pressures: number[] }): number {
  let low = 2;
  let high = stroke.pressures.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    const dabs = planOilBrushDabs(planInputFor(mid, stroke));
    if (dabs.length >= FX_OIL_DAB_CAP) high = mid;
    else low = mid + 1;
  }
  return low;
}

describe("FxOilDabPlanner", () => {
  it("matches a full replan at every single-point append on a short stroke", () => {
    const stroke = makeStroke(60);
    const planner = new FxOilDabPlanner();
    for (let n = 1; n <= 60; n += 1) {
      const input = planInputFor(n, stroke);
      expectByteEqualDabs(planner.plan(input), planOilBrushDabs(input));
    }
  });

  it("matches a full replan while growing to n=50/400/3200", () => {
    const stroke = makeStroke(3200);
    const planner = new FxOilDabPlanner();
    const checkpoints = new Set([50, 400, 3200]);
    let reuseBelowCap = 0;
    // Eight points per replan, i.e. roughly two rAFs of pointer samples.
    for (let n = 1; n <= 3200; n += 1) {
      if (n % 8 !== 0 && !checkpoints.has(n)) continue;
      const input = planInputFor(n, stroke);
      const incremental = planner.plan(input);
      if (incremental.length < FX_OIL_DAB_CAP) {
        reuseBelowCap = Math.max(reuseBelowCap, planner.reusedDabs);
      }
      if (!checkpoints.has(n)) continue;
      expectByteEqualDabs(incremental, planOilBrushDabs(input));
    }
    // Reuse actually happened below the cap — otherwise this passes on a planner that never caches.
    expect(reuseBelowCap).toBeGreaterThan(0);
  });

  it("stays byte-identical across the dab-cap refit boundary", () => {
    // 0.8 px between samples, so the station count rises by at most one per appended point and
    // cap-1 / cap / cap+1 natural stations are all individually reachable.
    const stroke = makeStroke(9000, 0.8);
    const capped = firstCappedPointCount(stroke);
    expect(capped).toBeLessThan(9000);
    expect(planOilBrushDabs(planInputFor(capped - 1, stroke)).length).toBe(FX_OIL_DAB_CAP - 1);
    expect(planOilBrushDabs(planInputFor(capped, stroke)).length).toBe(FX_OIL_DAB_CAP);
    expect(planOilBrushDabs(planInputFor(capped + 1, stroke)).length).toBe(FX_OIL_DAB_CAP);

    const planner = new FxOilDabPlanner();
    for (let n = 1; n <= capped + 2; n += 1) {
      if (n % 8 !== 0 && n < capped - 1) continue;
      const input = planInputFor(n, stroke);
      const incremental = planner.plan(input);
      if (n < capped - 1) continue;
      expectByteEqualDabs(incremental, planOilBrushDabs(input));
    }
    // Past the boundary `sampleStations` refits the whole arc and every station moves, so the
    // verifier must find nothing reusable rather than trusting a prefix that no longer holds.
    expect(planner.reusedDabs).toBe(0);
  });

  it("keeps the ribbon carrier plan identical, including the impasto relief lanes", () => {
    const stroke = makeStroke(900);
    const planner = new FxOilDabPlanner();
    const programs = studioOilRibbonProgramsForBrush("oil", SEED);
    for (let n = 1; n <= 900; n += 1) planner.plan(planInputFor(n, stroke));
    const input = planInputFor(900, stroke);
    expect(planStudioOilRibbonCarrier(planner.plan(input), programs))
      .toEqual(planStudioOilRibbonCarrier(planOilBrushDabs(input), programs));
  });

  it("voids the cache when a settings input changes mid-stroke", () => {
    const stroke = makeStroke(200);
    const planner = new FxOilDabPlanner();
    planner.plan(planInputFor(200, stroke));
    const widened = { ...planInputFor(200, stroke), baseWidth: BASE_WIDTH * 2 };
    expectByteEqualDabs(planner.plan(widened), planOilBrushDabs(widened));
    expect(planner.reusedDabs).toBe(0);
  });
});
