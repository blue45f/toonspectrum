import { describe, expect, it } from "vitest";

import {
  CompositionExecutionError,
  PATTERN_STAR_MOTIF,
  compositionLayerIRSchema,
  compositionProgramIRSchema,
  executeCompositionProgram,
} from "../brush-composition";
import {
  arcPointAt,
  buildArcTable,
  layTextOnPath,
  mulberry32,
  simulateParticleSplats,
  solveRibbonStrands,
  stampPatternAlongPath,
} from "../composition-providers";

import type {
  CompositionProgramIR,
  VelloCompositionEngine,
} from "../brush-composition";
import type {
  CompositionShapedText,
  CompositionTextEngine,
} from "../composition-providers";
import type {
  ModeledSampleIR,
  PathIR,
  SceneIR,
} from "@toonspectrum/studio-project-model";

/**
 * §12.2 row-9..12 provider contracts (장식·패턴 / 파티클 / 리본·헤어·로프 /
 * 텍스트 브러시). Pure-math level: determinism, seed sensitivity, constraint
 * satisfaction, pressure response and the executor's loud failures. Real
 * pixels + goldens are gated by tests/visual/brush-composition.test.ts.
 */

const WIDTH = 64;
const HEIGHT = 48;

/** Straight horizontal stroke, optional linear pressure ramp. */
function straightSamples(
  count = 40,
  pressureAt: (t: number) => number = () => 1,
): ModeledSampleIR[] {
  const samples: ModeledSampleIR[] = [];
  for (let index = 0; index < count; index += 1) {
    const t = count === 1 ? 0 : index / (count - 1);
    samples.push({
      x: 8 + t * 100,
      y: 24,
      tMs: index * 6,
      pressure: pressureAt(t),
      velocity: 1,
      altitudeDeg: 90,
      azimuthDeg: 0,
    });
  }
  return samples;
}

/** Vello double: plots every verb endpoint so the frame depends on the path. */
function fakeVelloPlot(): VelloCompositionEngine {
  return {
    renderScene(scene: SceneIR): Uint8Array {
      const frame = new Uint8Array(scene.width * scene.height * 4);
      for (const node of scene.nodes) {
        if (node.kind !== "fill-path") continue;
        for (const verb of node.path.verbs) {
          if (verb.v === "Z") continue;
          const x = Math.min(scene.width - 1, Math.max(0, Math.round(verb.x)));
          const y = Math.min(scene.height - 1, Math.max(0, Math.round(verb.y)));
          const base = (y * scene.width + x) * 4;
          frame[base] = 10;
          frame[base + 1] = 10;
          frame[base + 2] = 10;
          frame[base + 3] = 255;
        }
      }
      return frame;
    },
  };
}

/**
 * Glyph shaper double with the same contract as
 * studio-engine-vello's `shapeTextToGlyphPaths`: each glyph outline is already
 * offset to its layout pen position (x, y).
 */
function fakeTextEngine(advance = 10): CompositionTextEngine {
  return {
    shapeText(text: string): CompositionShapedText {
      const glyphs = [...text].map((character, index) => {
        const x = index * advance;
        // A space carries an advance but no outline — the provider must skip
        // stamping it while still consuming its arc length.
        const path: PathIR =
          character === " "
            ? { verbs: [] }
            : {
                verbs: [
                  { v: "M", x, y: 0 },
                  { v: "L", x: x + advance * 0.6, y: 0 },
                  { v: "L", x: x + advance * 0.6, y: -advance },
                  { v: "L", x, y: -advance },
                  { v: "Z" },
                ],
              };
        return { x, y: 0, path };
      });
      return {
        width: glyphs.length * advance,
        height: advance,
        lineCount: 1,
        glyphs,
      };
    },
  };
}

function providerProgram(
  geometry: Record<string, unknown>,
): CompositionProgramIR {
  return compositionProgramIRSchema.parse({
    id: "unit-provider",
    name: "unit-provider",
    lane: "stable",
    input: { backend: "ema", strength: 0, predictionMs: 0 },
    layers: [
      {
        id: "provider",
        geometry,
        engine: {
          engine: "vector-fill",
          color: { r: 0, g: 0, b: 0, a: 1 },
          baseSizePx: 4,
        },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Shared arc-length machinery
// ---------------------------------------------------------------------------

describe("arc-length walker", () => {
  it("resolves position, unit tangent and pressure by arc length", () => {
    const table = buildArcTable(straightSamples(11, (t) => t));
    expect(table.totalLength).toBeCloseTo(100, 6);
    const mid = arcPointAt(table, 50);
    expect(mid.x).toBeCloseTo(58, 6);
    expect(mid.y).toBeCloseTo(24, 6);
    expect(Math.hypot(mid.tx, mid.ty)).toBeCloseTo(1, 12);
    expect(mid.tx).toBeCloseTo(1, 12);
    expect(mid.pressure).toBeCloseTo(0.5, 6);
  });

  it("clamps out-of-range arc lengths instead of extrapolating", () => {
    const table = buildArcTable(straightSamples(5));
    expect(arcPointAt(table, -20).x).toBeCloseTo(8, 6);
    expect(arcPointAt(table, 1e6).x).toBeCloseTo(108, 6);
  });

  it("keeps a defined tangent on a fully degenerate polyline", () => {
    const stalled: ModeledSampleIR[] = Array.from({ length: 4 }, (_, index) => ({
      x: 10,
      y: 10,
      tMs: index * 6,
      pressure: 0.5,
      velocity: 0,
      altitudeDeg: 90,
      azimuthDeg: 0,
    }));
    const point = arcPointAt(buildArcTable(stalled), 0);
    expect([point.tx, point.ty]).toEqual([1, 0]);
  });
});

describe("mulberry32", () => {
  it("is a pure function of its seed (no Math.random anywhere)", () => {
    const a = Array.from({ length: 8 }, mulberry32(1234));
    const b = Array.from({ length: 8 }, mulberry32(1234));
    const c = Array.from({ length: 8 }, mulberry32(1235));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a.every((value) => value >= 0 && value < 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 장식·패턴
// ---------------------------------------------------------------------------

describe("stampPatternAlongPath (장식·패턴)", () => {
  const params = {
    motif: PATTERN_STAR_MOTIF,
    spacingPx: 10,
    sizePx: 8,
    sizePressure: 0,
    alignToTangent: true,
    phase: 0,
  };

  it("places one instance per arc-length site", () => {
    const result = stampPatternAlongPath(straightSamples(), params);
    // 100 px of arc at 10 px spacing → sites at 0..100 inclusive.
    expect(result.instances).toBe(11);
    expect(result.path.verbs).toHaveLength(
      11 * PATTERN_STAR_MOTIF.verbs.length,
    );
  });

  it("is deterministic and honours the spacing knob", () => {
    const once = stampPatternAlongPath(straightSamples(), params);
    const twice = stampPatternAlongPath(straightSamples(), params);
    expect(twice).toEqual(once);
    const denser = stampPatternAlongPath(straightSamples(), {
      ...params,
      spacingPx: 5,
    });
    expect(denser.instances).toBe(21);
  });

  it("normalizes the motif so sizePx is its bounding-box extent", () => {
    const result = stampPatternAlongPath(straightSamples(2), {
      ...params,
      spacingPx: 1000,
    });
    expect(result.instances).toBe(1);
    const xs = result.path.verbs.flatMap((verb) =>
      verb.v === "Z" ? [] : [verb.x],
    );
    const ys = result.path.verbs.flatMap((verb) =>
      verb.v === "Z" ? [] : [verb.y],
    );
    // The star spans 1.90212 × 1.80902 units; the longer axis becomes sizePx
    // and the shorter one keeps the motif's aspect ratio.
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(8, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(
      (8 * 1.80902) / 1.90212,
      4,
    );
  });

  it("scales each instance by the pressure at its own site", () => {
    const ramp = stampPatternAlongPath(
      straightSamples(41, (t) => 0.1 + 0.9 * t),
      { ...params, sizePressure: 1, spacingPx: 50 },
    );
    expect(ramp.instances).toBe(3);
    const extents = [0, 1, 2].map((index) => {
      const slice = ramp.path.verbs.slice(
        index * PATTERN_STAR_MOTIF.verbs.length,
        (index + 1) * PATTERN_STAR_MOTIF.verbs.length,
      );
      const xs = slice.flatMap((verb) => (verb.v === "Z" ? [] : [verb.x]));
      return Math.max(...xs) - Math.min(...xs);
    });
    expect(extents[1]).toBeGreaterThan((extents[0] ?? 0) * 1.5);
    expect(extents[2]).toBeGreaterThan((extents[1] ?? 0) * 1.5);
  });

  it("rotates instances onto the tangent only when asked", () => {
    const diagonal: ModeledSampleIR[] = [0, 1].map((index) => ({
      x: 10 + index * 40,
      y: 10 + index * 40,
      tMs: index * 6,
      pressure: 1,
      velocity: 1,
      altitudeDeg: 90,
      azimuthDeg: 0,
    }));
    const aligned = stampPatternAlongPath(diagonal, {
      ...params,
      spacingPx: 1000,
    });
    const upright = stampPatternAlongPath(diagonal, {
      ...params,
      spacingPx: 1000,
      alignToTangent: false,
    });
    expect(aligned.path.verbs).not.toEqual(upright.path.verbs);
    // The unrotated star's first verb is its tip, directly above the centre.
    const tip = upright.path.verbs[0];
    expect(tip?.v === "M" ? tip.x : NaN).toBeCloseTo(10, 6);
  });
});

// ---------------------------------------------------------------------------
// 파티클
// ---------------------------------------------------------------------------

describe("simulateParticleSplats (파티클)", () => {
  const params = {
    emissionSpacingPx: 5,
    particlesPerSite: 2,
    lifetimeMs: 80,
    stepMs: 8,
    gravityPxPerMs2: 0.001,
    drag: 0.02,
    speedPxPerMs: 0.2,
    speedPressure: 0,
    radiusPx: 1.5,
    radiusPressure: 0,
    seed: 7,
  };

  it("emits particlesPerSite splats at every arc-length site", () => {
    const result = simulateParticleSplats(straightSamples(), params);
    expect(result.instances).toBe(21 * 2);
    // Each splat is an 8-gon: 8 line verbs + Z.
    expect(result.path.verbs).toHaveLength(result.instances * 9);
  });

  it("is bit-deterministic for a seed and diverges across seeds", () => {
    const a = simulateParticleSplats(straightSamples(), params);
    const b = simulateParticleSplats(straightSamples(), params);
    const c = simulateParticleSplats(straightSamples(), { ...params, seed: 8 });
    expect(b).toEqual(a);
    expect(c.instances).toBe(a.instances);
    expect(c.path.verbs).not.toEqual(a.path.verbs);
  });

  it("integrates gravity: heavier gravity moves the splats further down", () => {
    const meanY = (params2: typeof params): number => {
      const result = simulateParticleSplats(straightSamples(), params2);
      const ys = result.path.verbs.flatMap((verb) =>
        verb.v === "Z" ? [] : [verb.y],
      );
      return ys.reduce((a, b) => a + b, 0) / ys.length;
    };
    expect(meanY({ ...params, gravityPxPerMs2: 0.01 })).toBeGreaterThan(
      meanY(params) + 1,
    );
  });

  it("grows the splat radius with pressure", () => {
    const spread = (pressure: number): number => {
      const result = simulateParticleSplats(
        straightSamples(40, () => pressure),
        { ...params, radiusPressure: 1, speedPxPerMs: 0 },
      );
      const xs = result.path.verbs.slice(0, 8).flatMap((verb) =>
        verb.v === "Z" ? [] : [verb.x],
      );
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(spread(1)).toBeGreaterThan(spread(0.25) * 2);
  });
});

// ---------------------------------------------------------------------------
// 리본·헤어·로프
// ---------------------------------------------------------------------------

describe("solveRibbonStrands (리본·헤어·로프)", () => {
  const params = {
    strands: 5,
    restLengthPx: 4,
    iterations: 12,
    compliance: 0,
    gravityPxPerMs2: 0.02,
    damping: 0.08,
    widthPx: 4,
    widthPressure: 0,
    taper: 0,
    substepMs: 6,
  };

  it("paints one ribbon per chain node and is deterministic", () => {
    const a = solveRibbonStrands(straightSamples(), params);
    const b = solveRibbonStrands(straightSamples(), params);
    expect(a.instances).toBe(params.strands);
    expect(b).toEqual(a);
  });

  it("satisfies the distance constraint, and tighter with more iterations", () => {
    /** Worst relative distance-constraint residual of the final chain pose. */
    const worstResidual = (iterations: number): number => {
      const result = solveRibbonStrands(straightSamples(60), {
        ...params,
        iterations,
        widthPx: 0.2,
      });
      const verbsPerStrand = result.path.verbs.length / params.strands;
      const centres: Array<[number, number]> = [];
      for (let strand = 0; strand < params.strands; strand += 1) {
        // Ribbon layout: left[0..n-1] then right[n-1..0] then Z, so the last
        // left point and the first right point straddle the same centre.
        const points = result.path.verbs
          .slice(strand * verbsPerStrand, (strand + 1) * verbsPerStrand)
          .filter((verb) => verb.v !== "Z");
        const forward = points[points.length / 2 - 1];
        const backward = points[points.length / 2];
        if (forward === undefined || backward === undefined) continue;
        centres.push([
          (forward.x + backward.x) / 2,
          (forward.y + backward.y) / 2,
        ]);
      }
      expect(centres).toHaveLength(params.strands);
      let worst = 0;
      for (let index = 1; index < centres.length; index += 1) {
        const from = centres[index - 1] ?? [0, 0];
        const to = centres[index] ?? [0, 0];
        const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
        worst = Math.max(
          worst,
          Math.abs(distance - params.restLengthPx) / params.restLengthPx,
        );
      }
      return worst;
    };
    const coarse = worstResidual(4);
    const fine = worstResidual(24);
    expect(coarse, `4 iterations residual ${coarse.toFixed(4)}`).toBeLessThan(0.1);
    expect(fine, `24 iterations residual ${fine.toFixed(4)}`).toBeLessThan(0.01);
    expect(fine).toBeLessThan(coarse);
  });

  it("relaxes the constraint when compliance is raised", () => {
    const rigid = solveRibbonStrands(straightSamples(), params);
    const soft = solveRibbonStrands(straightSamples(), {
      ...params,
      compliance: 5,
    });
    expect(soft.path.verbs).not.toEqual(rigid.path.verbs);
  });

  it("widens the ribbon with pressure", () => {
    const height = (pressure: number): number => {
      const result = solveRibbonStrands(
        straightSamples(40, () => pressure),
        { ...params, widthPressure: 1, strands: 2 },
      );
      const ys = result.path.verbs.flatMap((verb) =>
        verb.v === "Z" ? [] : [verb.y],
      );
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(height(1)).toBeGreaterThan(height(0.25));
  });
});

// ---------------------------------------------------------------------------
// 텍스트 브러시
// ---------------------------------------------------------------------------

describe("layTextOnPath (텍스트 브러시)", () => {
  const params = {
    text: "AB",
    fontSizePx: 10,
    letterSpacingPx: 0,
    repeat: false,
    alignToTangent: true,
    sizePressure: 0,
    baselineOffsetPx: 0,
  };

  it("stamps one instance per outlined glyph and skips blanks", () => {
    const engine = fakeTextEngine();
    const laid = layTextOnPath(straightSamples(), engine, params);
    expect(laid.runGlyphs).toBe(2);
    expect(laid.instances).toBe(2);
    expect(laid.lineCount).toBe(1);
    const spaced = layTextOnPath(straightSamples(), engine, {
      ...params,
      text: "A B",
    });
    expect(spaced.runGlyphs).toBe(3);
    expect(spaced.instances).toBe(2);
  });

  it("uses the shaper's advances as arc offsets", () => {
    const laid = layTextOnPath(straightSamples(), fakeTextEngine(), params);
    // Glyph 0 sits at arc 0 (x = 8), glyph 1 at arc 10 (x = 18).
    const first = laid.path.verbs[0];
    const second = laid.path.verbs[5];
    expect(first?.v === "M" ? first.x : NaN).toBeCloseTo(8, 6);
    expect(second?.v === "M" ? second.x : NaN).toBeCloseTo(18, 6);
  });

  it("repeats the run until the path is covered", () => {
    const once = layTextOnPath(straightSamples(), fakeTextEngine(), params);
    const repeated = layTextOnPath(straightSamples(), fakeTextEngine(), {
      ...params,
      repeat: true,
    });
    expect(repeated.instances).toBeGreaterThan(once.instances);
    expect(repeated.instances).toBe(10);
  });

  it("scales glyphs with pressure and is deterministic", () => {
    const glyphWidth = (pressure: number): number => {
      const laid = layTextOnPath(
        straightSamples(40, () => pressure),
        fakeTextEngine(),
        { ...params, sizePressure: 1 },
      );
      const xs = laid.path.verbs.slice(0, 4).flatMap((verb) =>
        verb.v === "Z" ? [] : [verb.x],
      );
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(glyphWidth(1)).toBeGreaterThan(glyphWidth(0.25) * 3);
    const a = layTextOnPath(straightSamples(), fakeTextEngine(), params);
    const b = layTextOnPath(straightSamples(), fakeTextEngine(), params);
    expect(b).toEqual(a);
  });
});

// ---------------------------------------------------------------------------
// Executor wiring
// ---------------------------------------------------------------------------

describe("executor wiring for the row-9..12 providers", () => {
  const samples = straightSamples(40, (t) => 0.2 + 0.8 * t);

  it("accepts every path geometry with vector-fill and rejects raster engines", () => {
    for (const geometry of [
      { kind: "pattern-stamp", motif: PATTERN_STAR_MOTIF },
      { kind: "particle-splat" },
      { kind: "ribbon-xpbd" },
      { kind: "text-on-path", text: "A" },
    ]) {
      expect(
        compositionLayerIRSchema.safeParse({
          id: "ok",
          geometry,
          engine: { engine: "vector-fill" },
        }).success,
        `${geometry.kind} ↔ vector-fill`,
      ).toBe(true);
      expect(
        compositionLayerIRSchema.safeParse({
          id: "bad",
          geometry,
          engine: { engine: "libmypaint", settings: {} },
        }).success,
        `${geometry.kind} ↔ libmypaint must be rejected`,
      ).toBe(false);
    }
  });

  it("reports the provider's instance count on the layer report", () => {
    const result = executeCompositionProgram(
      providerProgram({
        kind: "pattern-stamp",
        motif: PATTERN_STAR_MOTIF,
        spacingPx: 10,
      }),
      samples,
      { vello: fakeVelloPlot() },
      { width: WIDTH, height: HEIGHT },
    );
    expect(result.layers[0]?.geometry).toBe("pattern-stamp");
    expect(result.layers[0]?.instances).toBe(11);
    expect(result.layers[0]?.geometrySamples).toBe(samples.length);
  });

  it("names the missing glyph shaper instead of skipping the text layer", () => {
    expect(() =>
      executeCompositionProgram(
        providerProgram({ kind: "text-on-path", text: "A" }),
        samples,
        { vello: fakeVelloPlot() },
        { width: WIDTH, height: HEIGHT },
      ),
    ).toThrow(CompositionExecutionError);
    expect(() =>
      executeCompositionProgram(
        providerProgram({ kind: "text-on-path", text: "A" }),
        samples,
        { vello: fakeVelloPlot() },
        { width: WIDTH, height: HEIGHT },
      ),
    ).toThrow(/layer\[provider\]\.geometry\[text-on-path\].*engines\.text/s);
  });

  it("fails loudly when a provider emits nothing (no silent empty layer)", () => {
    const stalled: ModeledSampleIR[] = Array.from({ length: 8 }, (_, index) => ({
      x: 12,
      y: 12,
      tMs: index * 6,
      pressure: 1,
      velocity: 0,
      altitudeDeg: 90,
      azimuthDeg: 0,
    }));
    expect(() =>
      executeCompositionProgram(
        providerProgram({ kind: "particle-splat" }),
        stalled,
        { vello: fakeVelloPlot() },
        { width: WIDTH, height: HEIGHT },
      ),
    ).toThrow(/provider produced 0 instances/);
  });

  it("keeps the whole program deterministic through the seeded provider", () => {
    const program = providerProgram({ kind: "particle-splat" });
    const engines = { vello: fakeVelloPlot() };
    const first = executeCompositionProgram(program, samples, engines, {
      width: WIDTH,
      height: HEIGHT,
      seed: 3,
    });
    const second = executeCompositionProgram(program, samples, engines, {
      width: WIDTH,
      height: HEIGHT,
      seed: 3,
    });
    const other = executeCompositionProgram(program, samples, engines, {
      width: WIDTH,
      height: HEIGHT,
      seed: 4,
    });
    expect(second.pixels).toEqual(first.pixels);
    expect(other.pixels).not.toEqual(first.pixels);
  });

  it("reports an injected 3D surface provider as the no-op it currently is", () => {
    const program = providerProgram({ kind: "particle-splat" });
    const quiet = executeCompositionProgram(
      program,
      samples,
      { vello: fakeVelloPlot() },
      { width: WIDTH, height: HEIGHT },
    );
    expect(quiet.warnings).toEqual([]);
    const injected = executeCompositionProgram(
      program,
      samples,
      {
        vello: fakeVelloPlot(),
        surface: {
          projectSample: () => ({ u: 0.5, v: 0.5, texelDensity: 1 }),
          textureSize: () => ({ width: 64, height: 64 }),
        },
      },
      { width: WIDTH, height: HEIGHT },
    );
    expect(injected.warnings[0]).toMatch(/engines\.surface.*no-op/s);
    // A no-op must also be pixel-neutral — no hidden half-implementation.
    expect(injected.pixels).toEqual(quiet.pixels);
  });

  it("decorrelates two particle layers through seedSalt", () => {
    const engines = { vello: fakeVelloPlot() };
    const base = executeCompositionProgram(
      providerProgram({ kind: "particle-splat", seedSalt: 0 }),
      samples,
      engines,
      { width: WIDTH, height: HEIGHT },
    );
    const salted = executeCompositionProgram(
      providerProgram({ kind: "particle-splat", seedSalt: 17 }),
      samples,
      engines,
      { width: WIDTH, height: HEIGHT },
    );
    expect(salted.pixels).not.toEqual(base.pixels);
  });
});
