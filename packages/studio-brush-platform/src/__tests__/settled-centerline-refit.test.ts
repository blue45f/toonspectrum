import {
  brushProgramIRSchema,
  strokeIRSchema,
} from "@toonspectrum/studio-project-model";
import { describe, expect, it, vi } from "vitest";

import {
  CenterlineRefitError,
  flattenCenterline,
  refitSettledCenterline,
} from "../compile";
import { strokeOutlinePath } from "../geometry";

import type { CenterlineFitEngine, SettledCenterlineRefitOptions } from "../compile";
import type {
  BrushProgramIR,
  PathVerbIR,
  StrokeIR,
} from "@toonspectrum/studio-project-model";

/**
 * Settled-phase centerline refit contracts (V12 §12.2 "Kurbo centerline"
 * promoted to the product vector-path lane): centerline-only guard (the
 * outline polygon must never reach the fitter — measured non-termination on
 * sliver outlines), endpoint exactness, bounded deviation, determinism.
 * The fit engine is a structural fake; the real kurbo wasm lane is covered
 * by studio-engine-vello's own tests.
 */

function line(count: number, bump = 0): Array<readonly [number, number]> {
  const points: Array<readonly [number, number]> = [];
  for (let at = 0; at < count; at += 1) {
    const x = (10 * at) / (count - 1);
    points.push([x, bump * Math.sin((Math.PI * x) / 10)] as const);
  }
  return points;
}

/** Faithful fake: echoes the polyline back as an open M/L path (deviation 0). */
function identityFitEngine(): CenterlineFitEngine {
  return {
    fitPolyline(points) {
      const verbs: PathVerbIR[] = points.map(([x, y], index) =>
        index === 0 ? { v: "M", x, y } : { v: "L", x, y },
      );
      return { verbs };
    },
  };
}

/** Aggressive fake: one cubic along the endpoint chord (drops the interior). */
function chordFitEngine(): CenterlineFitEngine {
  return {
    fitPolyline(points) {
      const first = points[0]!;
      const last = points[points.length - 1]!;
      return {
        verbs: [
          { v: "M", x: first[0], y: first[1] },
          {
            v: "C",
            c1x: first[0] + (last[0] - first[0]) / 3,
            c1y: first[1] + (last[1] - first[1]) / 3,
            c2x: first[0] + (2 * (last[0] - first[0])) / 3,
            c2y: first[1] + (2 * (last[1] - first[1])) / 3,
            x: last[0],
            y: last[1],
          },
        ],
      };
    },
  };
}

describe("refitSettledCenterline — centerline-only guard", () => {
  it("rejects a closed ring (outline polygon signature) before calling the engine", () => {
    const fitPolyline = vi.fn();
    const ring: Array<readonly [number, number]> = [
      [0, 0],
      [12, 0],
      [12, 8],
      [0, 8],
      [0, 0],
    ];
    expect(() => refitSettledCenterline(ring, { fitPolyline })).toThrowError(
      CenterlineRefitError,
    );
    try {
      refitSettledCenterline(ring, { fitPolyline });
    } catch (error) {
      expect(error).toBeInstanceOf(CenterlineRefitError);
      expect((error as CenterlineRefitError).reason).toBe("outline-input");
    }
    expect(fitPolyline).not.toHaveBeenCalled();
  });

  it("rejects a real stroke OUTLINE polygon produced by strokeOutlinePath", () => {
    const program: BrushProgramIR = brushProgramIRSchema.parse({
      id: "refit-guard",
      name: "refit guard",
      stabilizer: { kind: "none", strength: 0, predictionMs: 0 },
      geometry: { kind: "perfect-freehand" },
    });
    const stroke: StrokeIR = strokeIRSchema.parse({
      id: "refit-guard:stroke",
      brushPresetId: "refit-guard",
      seed: 7,
      baseSizePx: 8,
      samples: Array.from({ length: 12 }, (_, index) => ({
        x: index * 4,
        y: Math.sin(index / 3) * 5,
        tMs: index * 8,
        pressure: Math.min(1, 0.1 + index * 0.08),
        velocity: 0.5,
      })),
    });
    const outline = strokeOutlinePath(program, stroke);
    const flattenedOutline = flattenCenterline(outline);
    // The outline PathIR closes with Z; restore the ring closure the fitter
    // would actually receive if the polygon were (wrongly) handed over.
    const outlineRing = [...flattenedOutline, flattenedOutline[0]!];
    const fitPolyline = vi.fn();
    expect(outlineRing.length).toBeGreaterThan(3);
    try {
      refitSettledCenterline(outlineRing, { fitPolyline });
      expect.unreachable("outline polygon must be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(CenterlineRefitError);
      expect((error as CenterlineRefitError).reason).toBe("outline-input");
    }
    expect(fitPolyline).not.toHaveBeenCalled();
  });

  it("rejects a smuggled closed:true option without calling the engine", () => {
    const fitPolyline = vi.fn();
    const smuggled = { closed: true } as unknown as SettledCenterlineRefitOptions;
    try {
      refitSettledCenterline(line(8), { fitPolyline }, smuggled);
      expect.unreachable("closed request must be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(CenterlineRefitError);
      expect((error as CenterlineRefitError).reason).toBe("outline-input");
    }
    expect(fitPolyline).not.toHaveBeenCalled();
  });
});

describe("refitSettledCenterline — editable-path invariants", () => {
  it("keeps endpoints exact and reports zero deviation for a faithful fit", () => {
    const source = line(24, 1.5);
    const result = refitSettledCenterline(source, identityFitEngine(), {
      accuracy: 0.35,
    });
    expect(result.path.verbs[0]).toEqual({ v: "M", x: 0, y: source[0]![1] });
    const lastVerb = result.path.verbs[result.path.verbs.length - 1]!;
    expect(lastVerb.v).toBe("L");
    if (lastVerb.v === "L") {
      expect(lastVerb.x).toBe(source[source.length - 1]![0]);
      expect(lastVerb.y).toBe(source[source.length - 1]![1]);
    }
    expect(result.measuredDeviationPx).toBeLessThanOrEqual(1e-9);
    expect(result.inputPoints).toBe(24);
    expect(result.verbs).toBe(24);
  });

  it("passes the fit through the engine as an open polyline with the accuracy", () => {
    const engine = identityFitEngine();
    const spy = vi.spyOn(engine, "fitPolyline");
    refitSettledCenterline(line(6), engine, { accuracy: 0.5 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(expect.any(Array), {
      closed: false,
      accuracy: 0.5,
    });
  });

  it("measures deviation numerically and accepts a fit inside the tolerance", () => {
    // Shallow 0.2px arc, chord fit: measured deviation ≈ the bump height.
    const result = refitSettledCenterline(line(48, 0.2), chordFitEngine(), {
      accuracy: 0.25,
    });
    expect(result.maxDeviationTolerancePx).toBeCloseTo(0.5, 12);
    expect(result.measuredDeviationPx).toBeGreaterThan(0.15);
    expect(result.measuredDeviationPx).toBeLessThanOrEqual(0.25);
  });

  it("fails closed when the fit deviates beyond the tolerance", () => {
    try {
      refitSettledCenterline(line(48, 2), chordFitEngine(), { accuracy: 0.25 });
      expect.unreachable("gross deviation must be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(CenterlineRefitError);
      expect((error as CenterlineRefitError).reason).toBe("deviation-exceeded");
    }
  });

  it("fails closed when the engine drifts an endpoint", () => {
    const drifting: CenterlineFitEngine = {
      fitPolyline(points) {
        const verbs: PathVerbIR[] = points.map(([x, y], index) =>
          index === 0 ? { v: "M", x, y } : { v: "L", x, y },
        );
        const last = verbs[verbs.length - 1]!;
        if (last.v === "L") last.x += 0.01;
        return { verbs };
      },
    };
    try {
      refitSettledCenterline(line(8), drifting);
      expect.unreachable("endpoint drift must be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(CenterlineRefitError);
      expect((error as CenterlineRefitError).reason).toBe("endpoint-drift");
    }
  });

  it.each([
    [
      "collapsed to a single verb",
      (): CenterlineFitEngine => ({
        fitPolyline: (points) => ({
          verbs: [{ v: "M", x: points[0]![0], y: points[0]![1] }],
        }),
      }),
    ],
    [
      "closed with a Z verb",
      (): CenterlineFitEngine => ({
        fitPolyline: (points) => ({
          verbs: [
            { v: "M", x: points[0]![0], y: points[0]![1] },
            {
              v: "L",
              x: points[points.length - 1]![0],
              y: points[points.length - 1]![1],
            },
            { v: "Z" },
          ],
        }),
      }),
    ],
    [
      "split into a second subpath",
      (): CenterlineFitEngine => ({
        fitPolyline: (points) => ({
          verbs: [
            { v: "M", x: points[0]![0], y: points[0]![1] },
            { v: "L", x: 1, y: 1 },
            { v: "M", x: 2, y: 2 },
            {
              v: "L",
              x: points[points.length - 1]![0],
              y: points[points.length - 1]![1],
            },
          ],
        }),
      }),
    ],
  ])("fails closed on a degenerate fit (%s)", (_label, makeEngine) => {
    try {
      refitSettledCenterline(line(8), makeEngine());
      expect.unreachable("degenerate fit must be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(CenterlineRefitError);
      expect((error as CenterlineRefitError).reason).toBe("fit-degenerate");
    }
  });

  it("is deterministic: identical input + engine + options → identical result", () => {
    const run = (): string =>
      JSON.stringify(
        refitSettledCenterline(line(48, 0.2), chordFitEngine(), {
          accuracy: 0.25,
          maxDeviationPx: 0.5,
        }),
      );
    expect(run()).toBe(run());
  });

  it("rejects non-finite points, degenerate input, and invalid options", () => {
    const reasons: string[] = [];
    const capture = (fn: () => void): void => {
      try {
        fn();
      } catch (error) {
        expect(error).toBeInstanceOf(CenterlineRefitError);
        reasons.push((error as CenterlineRefitError).reason);
      }
    };
    capture(() => refitSettledCenterline([[0, 0], [Number.NaN, 1]], identityFitEngine()));
    capture(() => refitSettledCenterline([[3, 3]], identityFitEngine()));
    // Pen dwell: consecutive duplicates collapse to a single point.
    capture(() => refitSettledCenterline([[1, 1], [1, 1], [1, 1]], identityFitEngine()));
    capture(() => refitSettledCenterline(line(8), identityFitEngine(), { accuracy: 5 }));
    capture(() =>
      refitSettledCenterline(line(8), identityFitEngine(), { maxDeviationPx: 0 }),
    );
    expect(reasons).toEqual([
      "invalid-input",
      "invalid-input",
      "invalid-input",
      "invalid-input",
      "invalid-input",
    ]);
  });
});
