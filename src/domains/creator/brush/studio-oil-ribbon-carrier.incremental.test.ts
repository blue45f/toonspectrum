/**
 * Append-identity contract for `StudioOilRibbonCarrierPlanner`.
 *
 * The live oil overlay replans the carrier on every pointer frame, and the batch planner rebuilds
 * the smoothed geometry, the stations and every bristle run each time — ~17 ms at a 2906-dab bed
 * on this tree, past a 60 Hz frame before a pixel is painted. The incremental planner keeps the
 * prefix an append cannot have changed.
 *
 * The whole value of that is that it changes NOTHING. So the contract asserted here is equality
 * with the batch plan, structurally, at every step of a growing stroke:
 *
 *  1. every intermediate plan deep-equals `planStudioOilRibbonCarrier` on the same dabs;
 *  2. it holds for the plain carrier and for each shipped program combination (load dynamics,
 *     bristle physics, impasto relief, body-only, and the opt-in fixed-anchor banding), because
 *     the settled-prefix argument is only valid for the stages that read a bounded window;
 *  3. it holds through the dab cap, where `FxOilDabPlanner` refits the whole lattice and no prefix
 *     survives — the planner must notice and rebuild rather than reuse;
 *  4. it holds when the option object changes mid-stroke, and when the stroke is replaced by an
 *     unrelated one on the same planner instance;
 *  5. reuse actually happens on an ordinary append (otherwise 1–4 pass trivially).
 */
import { describe, expect, it } from "vitest";

import {
  FX_OIL_DAB_CAP,
  FxOilDabPlanner,
  fxBrushSeedFromKey,
  planOilBrushDabs,
  studioOilPaintBodyForBrush,
  studioOilTipProfileForBrush,
  type FxOilDab,
} from "../studio-fx-brush";

import { studioFluidPaintStationSpacingRatio } from "./studio-fluid-paint-reference";
import {
  StudioOilRibbonCarrierPlanner,
  planStudioOilRibbonCarrier,
  studioOilRibbonProgramsForBrush,
  type StudioOilRibbonCarrierOptions,
} from "./studio-oil-ribbon-carrier";

const SEED = fxBrushSeedFromKey("oil-incremental-contract");

function strokePoints(count: number): number[] {
  const points: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const t = index / 37;
    points.push(
      140 + index * 2.6 + Math.sin(t) * 26,
      320 + Math.cos(t * 0.63) * 88 + Math.sin(t * 2.1) * 9,
    );
  }
  return points;
}

function strokePressures(count: number): number[] {
  return Array.from(
    { length: count },
    (_, index) => 0.22 + 0.6 * Math.abs(Math.sin(index / 71)),
  );
}

function dabsAt(brushId: string, sampleCount: number, planner?: FxOilDabPlanner): FxOilDab[] {
  const spacing = studioFluidPaintStationSpacingRatio(brushId);
  const input = {
    points: strokePoints(sampleCount),
    pressures: strokePressures(sampleCount),
    baseWidth: 24,
    seed: SEED,
    maxDabs: FX_OIL_DAB_CAP,
    paintBody: studioOilPaintBodyForBrush(brushId),
    tipProfile: studioOilTipProfileForBrush(brushId),
    ...(spacing === undefined ? {} : { stationSpacingRatio: spacing }),
  };
  return planner ? planner.plan(input) : planOilBrushDabs(input);
}

/** Programs whose plans must all survive the settled-prefix argument, not only the plain one. */
const PROGRAMS: readonly {
  readonly id: string;
  readonly brushId: string;
  readonly options: StudioOilRibbonCarrierOptions | undefined;
}[] = [
  { id: "plain", brushId: "brush--oil-lanes", options: undefined },
  {
    id: "flat-ribbon",
    brushId: "oil--flat-ribbon",
    options: studioOilRibbonProgramsForBrush("oil--flat-ribbon", SEED),
  },
  {
    id: "filbert (bristle physics)",
    brushId: "oil--filbert-ribbon",
    options: studioOilRibbonProgramsForBrush("oil--filbert-ribbon", SEED),
  },
  {
    id: "impasto (physics + relief)",
    brushId: "oil--impasto-ribbon",
    options: studioOilRibbonProgramsForBrush("oil--impasto-ribbon", SEED),
  },
  {
    id: "load dynamics",
    brushId: "brush--oil-lanes",
    options: { bristleLoadDynamics: { enabled: true, seed: SEED } },
  },
  { id: "body only", brushId: "oil--flat-ribbon", options: { bodyOnly: true } },
  {
    id: "fixed-anchor-v2 banding",
    brushId: "oil--flat-ribbon",
    options: { bristleBanding: "fixed-anchor-v2" },
  },
];

describe("StudioOilRibbonCarrierPlanner", () => {
  for (const program of PROGRAMS) {
    it(`plans a growing stroke exactly like the batch carrier — ${program.id}`, () => {
      const planner = new StudioOilRibbonCarrierPlanner();
      const dabPlanner = new FxOilDabPlanner();
      for (const sampleCount of [1, 2, 3, 9, 10, 40, 200, 203, 640, 1300]) {
        const dabs = dabsAt(program.brushId, sampleCount, dabPlanner);
        expect(planner.plan(dabs, program.options)).toEqual(
          planStudioOilRibbonCarrier(dabs, program.options),
        );
      }
    });
  }

  it("reuses the settled prefix on an ordinary append", () => {
    const planner = new StudioOilRibbonCarrierPlanner();
    const dabPlanner = new FxOilDabPlanner();
    planner.plan(dabsAt("oil--flat-ribbon", 900, dabPlanner), undefined);
    const grown = dabsAt("oil--flat-ribbon", 904, dabPlanner);
    const plan = planner.plan(grown, undefined);

    // The dab bed itself must be prefix-stable for any of this to be reachable.
    expect(dabPlanner.reusedDabs).toBeGreaterThan(grown.length * 0.9);
    expect(planner.settledStations).toBeGreaterThan(grown.length * 0.9);
    expect(planner.reusedRuns).toBeGreaterThan(0);
    expect(plan).toEqual(planStudioOilRibbonCarrier(grown, undefined));
  });

  it("rebuilds instead of reusing when the lattice refits at the dab cap", () => {
    const planner = new StudioOilRibbonCarrierPlanner();
    const dabPlanner = new FxOilDabPlanner();
    // Spacing here puts ~1.8 dabs on every source sample, so this pair straddles the cap.
    const before = dabsAt("oil--flat-ribbon", 2100, dabPlanner);
    planner.plan(before, undefined);
    const after = dabsAt("oil--flat-ribbon", 3000, dabPlanner);
    expect(after).toHaveLength(FX_OIL_DAB_CAP);
    expect(planner.plan(after, undefined)).toEqual(
      planStudioOilRibbonCarrier(after, undefined),
    );
  });

  it("rebuilds when the program options change mid-stroke", () => {
    const planner = new StudioOilRibbonCarrierPlanner();
    const dabPlanner = new FxOilDabPlanner();
    const first = dabsAt("oil--flat-ribbon", 300, dabPlanner);
    planner.plan(first, undefined);
    const grown = dabsAt("oil--flat-ribbon", 340, dabPlanner);
    const switched: StudioOilRibbonCarrierOptions = { impastoRelief: { enabled: true } };
    expect(planner.plan(grown, switched)).toEqual(
      planStudioOilRibbonCarrier(grown, switched),
    );
    expect(planner.reusedRuns).toBe(0);
    // …and switching back is just as exact.
    expect(planner.plan(grown, undefined)).toEqual(
      planStudioOilRibbonCarrier(grown, undefined),
    );
  });

  it("rebuilds when an unrelated stroke reuses the same planner", () => {
    const planner = new StudioOilRibbonCarrierPlanner();
    planner.plan(dabsAt("oil--flat-ribbon", 400), undefined);
    const unrelated = planOilBrushDabs({
      points: [40, 40, 260, 90, 300, 340, 90, 300],
      pressures: [0.9, 0.4, 0.75, 0.2],
      baseWidth: 31,
      seed: fxBrushSeedFromKey("a different stroke"),
      maxDabs: FX_OIL_DAB_CAP,
      paintBody: studioOilPaintBodyForBrush("oil--flat-ribbon"),
      tipProfile: studioOilTipProfileForBrush("oil--flat-ribbon"),
    });
    expect(planner.plan(unrelated, undefined)).toEqual(
      planStudioOilRibbonCarrier(unrelated, undefined),
    );
  });

  it("returns the batch plan for a shrinking stroke (undo mid-drag)", () => {
    const planner = new StudioOilRibbonCarrierPlanner();
    planner.plan(dabsAt("oil--flat-ribbon", 500), undefined);
    for (const sampleCount of [420, 90, 2, 0]) {
      const dabs = dabsAt("oil--flat-ribbon", sampleCount);
      expect(planner.plan(dabs, undefined)).toEqual(
        planStudioOilRibbonCarrier(dabs, undefined),
      );
    }
  });

  it("reset() drops the retained bed", () => {
    const planner = new StudioOilRibbonCarrierPlanner();
    const dabPlanner = new FxOilDabPlanner();
    planner.plan(dabsAt("oil--flat-ribbon", 600, dabPlanner), undefined);
    planner.reset();
    const grown = dabsAt("oil--flat-ribbon", 610, dabPlanner);
    expect(planner.plan(grown, undefined)).toEqual(
      planStudioOilRibbonCarrier(grown, undefined),
    );
    expect(planner.reusedRuns).toBe(0);
  });
});
