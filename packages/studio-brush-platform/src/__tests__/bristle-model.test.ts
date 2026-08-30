import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  BRISTLE_PRESETS,
  BristleModelError,
  bristleFootprint,
  bristleSamplesFromModeled,
  bristleStrokeTracks,
  createBristleBrush,
  createBristleBrushFromPreset,
  rasterizeBristleStamps,
  rasterizeBristleStroke,
  reloadBristleBrush,
  resetBristleStroke,
  resolveBristleBrushConfig,
  runBristleStroke,
  stepBristles,
} from "../bristle-model";

import type {
  BristleBrushConfig,
  BristleBrushState,
  BristlePresetId,
  BristleSample,
} from "../bristle-model";
import type { ModeledSampleIR } from "@toonspectrum/studio-project-model";

/**
 * Bristle model contracts (손맛·질감 웨이브). Physics-level invariants live
 * here; the rendered quality gates (hysteresis width, 갈필 streak counts, tilt
 * asymmetry, performance curve) live in tests/visual/bristle-quality.test.ts
 * and publish their measurements to tests/benchmarks/results/bristle-model.json.
 */

function straightStroke(
  count: number,
  options: {
    pressure?: number | ((t: number) => number);
    stepPx?: number;
    dtMs?: number;
    tiltX?: number;
    tiltY?: number;
    velocity?: number;
  } = {},
): BristleSample[] {
  const stepPx = options.stepPx ?? 2;
  const dtMs = options.dtMs ?? 8;
  const samples: BristleSample[] = [];
  for (let index = 0; index < count; index += 1) {
    const t = count === 1 ? 0 : index / (count - 1);
    const pressure =
      typeof options.pressure === "function"
        ? options.pressure(t)
        : (options.pressure ?? 0.6);
    samples.push({
      x: 20 + index * stepPx,
      y: 60,
      pressure,
      tiltX: options.tiltX ?? 0,
      tiltY: options.tiltY ?? 0,
      velocity: options.velocity ?? stepPx / dtMs,
      dtMs,
      tMs: index * dtMs,
    });
  }
  return samples;
}

function totalInk(state: BristleBrushState): number {
  let sum = 0;
  for (let index = 0; index < state.ink.length; index += 1) sum += state.ink[index];
  return sum;
}

function footprintDigest(state: BristleBrushState, samples: readonly BristleSample[]): string {
  const run = runBristleStroke(state, samples);
  const hash = createHash("sha256");
  for (const footprint of run.footprints) {
    for (const stamp of footprint.stamps) {
      hash.update(
        `${stamp.bristleIndex}:${stamp.x.toFixed(9)}:${stamp.y.toFixed(9)}:${stamp.radius.toFixed(9)}:${stamp.alpha.toFixed(9)}|`,
      );
    }
  }
  return hash.digest("hex");
}

describe("resolveBristleBrushConfig", () => {
  const base: BristleBrushConfig = {
    bristleCount: 16,
    stiffness: 0.5,
    spreadResponse: 0.9,
    inkCapacity: 1,
    seed: 7,
  };

  it("fills documented defaults without touching caller values", () => {
    const resolved = resolveBristleBrushConfig(base);
    expect(resolved.bristleCount).toBe(16);
    expect(resolved.stiffness).toBe(0.5);
    expect(resolved.baseRadiusPx).toBe(14);
    expect(resolved.tipProfile).toBe("round");
    expect(resolved.hysteresis).toBe(0.35);
    expect(resolved.capillary).toBe(0.35);
  });

  it("rejects out-of-contract values loudly instead of clamping them", () => {
    expect(() => resolveBristleBrushConfig({ ...base, bristleCount: 1 })).toThrow(
      BristleModelError,
    );
    expect(() => resolveBristleBrushConfig({ ...base, bristleCount: 16.5 })).toThrow(
      /must be an integer/,
    );
    expect(() => resolveBristleBrushConfig({ ...base, stiffness: 0 })).toThrow(
      /config.stiffness/,
    );
    expect(() =>
      resolveBristleBrushConfig({ ...base, spreadResponse: Number.NaN }),
    ).toThrow(/finite/);
    expect(() => resolveBristleBrushConfig({ ...base, hysteresis: 1 })).toThrow(
      /config.hysteresis/,
    );
    expect(() =>
      resolveBristleBrushConfig({
        ...base,
        tipProfile: "wobbly" as BristleBrushConfig["tipProfile"],
      }),
    ).toThrow(/tipProfile/);
    expect(() =>
      resolveBristleBrushConfig({ ...base, minDtMs: 20, maxDtMs: 10 }),
    ).toThrow(/minDtMs/);
    expect(() =>
      resolveBristleBrushConfig({ ...base, bristlesPerClump: 32 }),
    ).toThrow(/bristlesPerClump/);
  });
});

describe("createBristleBrush", () => {
  it("lays out N hairs across the cross-section with seeded variation", () => {
    const brush = createBristleBrushFromPreset("round");
    expect(brush.layout).toHaveLength(brush.config.bristleCount);
    const offsets = brush.layout.map((entry) => entry.restOffset);
    expect(Math.min(...offsets)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...offsets)).toBeLessThanOrEqual(1);
    expect(offsets[0]).toBeLessThan(offsets[offsets.length - 1]);
    for (const entry of brush.layout) {
      expect(entry.stiffness).toBeGreaterThan(0);
      expect(entry.radiusScale).toBeGreaterThan(0);
      expect(entry.capacity).toBeGreaterThan(0);
      expect(entry.profile).toBeGreaterThan(0);
      expect(entry.profile).toBeLessThanOrEqual(1);
      expect(entry.liftBias).toBeGreaterThanOrEqual(0);
      expect(entry.liftBias).toBeLessThan(1);
      expect(entry.clump).toBeGreaterThanOrEqual(0);
      expect(entry.clump).toBeLessThan(brush.clumpDirection.length);
    }
  });

  it("starts fully loaded and is deterministic per seed", () => {
    const a = createBristleBrushFromPreset("round");
    const b = createBristleBrushFromPreset("round");
    const c = createBristleBrushFromPreset("round", { seed: 99 });
    expect([...a.ink]).toEqual(a.layout.map((entry) => entry.capacity));
    expect([...a.ink]).toEqual([...b.ink]);
    expect([...a.ink]).not.toEqual([...c.ink]);
    expect(a.layout.map((e) => e.restOffset)).toEqual(b.layout.map((e) => e.restOffset));
    expect(a.layout.map((e) => e.restOffset)).not.toEqual(
      c.layout.map((e) => e.restOffset),
    );
  });

  it("ships three physically distinct presets", () => {
    const ids: BristlePresetId[] = ["round", "flat", "rough"];
    expect(Object.keys(BRISTLE_PRESETS).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      expect(() => createBristleBrushFromPreset(id)).not.toThrow();
    }
    const round = createBristleBrushFromPreset("round").config;
    const flat = createBristleBrushFromPreset("flat").config;
    const rough = createBristleBrushFromPreset("rough").config;
    // The blade is wider and stiffer, the 갈필 tuft splays hardest and dries first.
    expect(flat.baseRadiusPx).toBeGreaterThan(round.baseRadiusPx);
    expect(flat.spreadResponse).toBeLessThan(round.spreadResponse);
    expect(rough.spreadResponse).toBeGreaterThan(round.spreadResponse);
    expect(rough.layoutJitter).toBeGreaterThan(round.layoutJitter);
    expect(rough.inkCapacity).toBeLessThan(round.inkCapacity);
    expect(rough.splitThreshold).toBeLessThan(round.splitThreshold);
  });

  it("rejects an unknown preset", () => {
    expect(() =>
      createBristleBrushFromPreset("fan" as BristlePresetId),
    ).toThrow(BristleModelError);
  });
});

describe("stepBristles", () => {
  it("validates the sample contract", () => {
    const brush = createBristleBrushFromPreset("round");
    expect(() => stepBristles(brush, { x: 0, y: 0, pressure: 1.5 })).toThrow(
      /pressure/,
    );
    expect(() =>
      stepBristles(brush, { x: Number.NaN, y: 0, pressure: 0.5 }),
    ).toThrow(/finite/);
    expect(() =>
      stepBristles(brush, { x: 0, y: 0, pressure: 0.5, velocity: -1 }),
    ).toThrow(/velocity/);
    expect(() =>
      stepBristles(brush, { x: 0, y: 0, pressure: 0.5, tiltX: Number.NaN }),
    ).toThrow(/tilt/);
  });

  it("opens the fan monotonically under a rising pressure ramp", () => {
    const brush = createBristleBrushFromPreset("round", { inkCapacity: 8 });
    const spreads: number[] = [];
    for (const sample of straightStroke(80, { pressure: (t) => t, stepPx: 0.5 })) {
      spreads.push(stepBristles(brush, sample).spread);
    }
    for (let index = 1; index < spreads.length; index += 1) {
      expect(spreads[index]).toBeGreaterThanOrEqual(spreads[index - 1]);
    }
    expect(spreads[spreads.length - 1]).toBeGreaterThan(0.5);
  });

  it("springs back toward rest when the pen is lifted", () => {
    const brush = createBristleBrushFromPreset("round", { inkCapacity: 8 });
    for (const sample of straightStroke(60, { pressure: 1, stepPx: 0.5 })) {
      stepBristles(brush, sample);
    }
    const loaded = brush.spread;
    expect(loaded).toBeGreaterThan(0.5);
    for (const sample of straightStroke(120, { pressure: 0, stepPx: 0, velocity: 0 })) {
      stepBristles(brush, sample);
    }
    expect(brush.spread).toBeLessThan(loaded * 0.1);
  });

  it("keeps the fan open on the way down (hysteresis = 손맛)", () => {
    const brush = createBristleBrushFromPreset("round", { inkCapacity: 8 });
    const up: number[] = [];
    const down: number[] = [];
    const steps = 60;
    for (let index = 0; index < steps; index += 1) {
      const pressure = index / (steps - 1);
      up.push(
        stepBristles(brush, {
          x: 20,
          y: 20 + index * 0.5,
          pressure,
          velocity: 0.05,
          dtMs: 8,
        }).spread,
      );
    }
    for (let index = 0; index < steps; index += 1) {
      const pressure = 1 - index / (steps - 1);
      down.push(
        stepBristles(brush, {
          x: 20,
          y: 50 + index * 0.5,
          pressure,
          velocity: 0.05,
          dtMs: 8,
        }).spread,
      );
    }
    // Matched pressure, opposite direction: unloading lags, so the tuft is wider.
    for (let index = 10; index < steps - 10; index += 1) {
      const pressure = index / (steps - 1);
      const mirrored = steps - 1 - index;
      expect(down[mirrored]).toBeGreaterThan(up[index]);
      expect(pressure).toBeGreaterThan(0);
    }
  });

  it("carries no hysteresis when the asymmetry is switched off", () => {
    const brush = createBristleBrushFromPreset("round", {
      hysteresis: 0,
      inkCapacity: 8,
      springRateHz: 400,
    });
    const steps = 40;
    const up: number[] = [];
    const down: number[] = [];
    for (let index = 0; index < steps; index += 1) {
      up.push(
        stepBristles(brush, { x: 20, y: 20 + index, pressure: index / (steps - 1), dtMs: 16, velocity: 0 })
          .spread,
      );
    }
    for (let index = 0; index < steps; index += 1) {
      down.push(
        stepBristles(brush, { x: 20, y: 60 + index, pressure: 1 - index / (steps - 1), dtMs: 16, velocity: 0 })
          .spread,
      );
    }
    const loop = up.map((value, index) => Math.abs(down[steps - 1 - index] - value));
    const maxLoop = Math.max(...loop);
    expect(maxLoop).toBeLessThan(0.05);
  });
});

describe("ink reservoir", () => {
  it("drains monotonically along the stroke and never goes negative", () => {
    const brush = createBristleBrushFromPreset("round");
    let previous = totalInk(brush);
    for (const sample of straightStroke(120)) {
      stepBristles(brush, sample);
      const now = totalInk(brush);
      expect(now).toBeLessThanOrEqual(previous + 1e-12);
      previous = now;
    }
    for (let index = 0; index < brush.ink.length; index += 1) {
      expect(brush.ink[index]).toBeGreaterThanOrEqual(0);
    }
    expect(previous).toBeLessThan(totalInk(createBristleBrushFromPreset("round")));
  });

  it("conserves ink under pure capillary redistribution", () => {
    const brush = createBristleBrushFromPreset("round", {
      flowRate: 0,
      idleFlowPx: 0,
      capillary: 8,
    });
    // Starve one hair so the diffusion has something to move.
    brush.ink[0] = 0;
    const before = totalInk(brush);
    const spreadBefore = Math.max(...brush.ink) - Math.min(...brush.ink);
    for (const sample of straightStroke(60)) stepBristles(brush, sample);
    expect(totalInk(brush)).toBeCloseTo(before, 9);
    expect(Math.max(...brush.ink) - Math.min(...brush.ink)).toBeLessThan(spreadBefore);
  });

  it("reloads and resets without losing the tuft layout", () => {
    const brush = createBristleBrushFromPreset("round");
    for (const sample of straightStroke(200)) stepBristles(brush, sample);
    expect(totalInk(brush)).toBeLessThan(0.5 * brush.config.inkCapacity * brush.layout.length);
    reloadBristleBrush(brush, 0.5);
    expect(totalInk(brush)).toBeCloseTo(
      0.5 * brush.layout.reduce((sum, entry) => sum + entry.capacity, 0),
      9,
    );
    reloadBristleBrush(brush);
    expect([...brush.ink]).toEqual(brush.layout.map((entry) => entry.capacity));
    resetBristleStroke(brush);
    expect(brush.spread).toBe(0);
    expect(brush.stepCount).toBe(0);
    expect(bristleFootprint(brush).contactCount).toBe(0);
    expect(() => reloadBristleBrush(brush, 2)).toThrow(BristleModelError);
  });
});

describe("splitting (갈필)", () => {
  it("stays intact while loaded and slow, then splits as it dries", () => {
    const brush = createBristleBrushFromPreset("round");
    const first = stepBristles(brush, {
      x: 20,
      y: 60,
      pressure: 0.5,
      velocity: 0.05,
      dtMs: 8,
    });
    expect(first.splitDrive).toBe(0);
    expect(first.liftedCount).toBe(0);

    let last = first;
    for (const sample of straightStroke(240)) last = stepBristles(brush, sample);
    expect(last.splitDrive).toBeGreaterThan(0.2);
    expect(last.liftedCount).toBeGreaterThan(0);
    expect(last.contactCount).toBeLessThan(brush.config.bristleCount);
  });

  it("splits on speed alone even when fully loaded", () => {
    // velocitySpread off, so any width change comes from clump separation
    // rather than from the fan opening.
    const brush = createBristleBrushFromPreset("round", {
      inkCapacity: 500,
      velocitySpread: 0,
    });
    const slow = stepBristles(brush, { x: 20, y: 60, pressure: 0.6, velocity: 0.05, dtMs: 8 });
    const slowWidth = bristleFootprint(brush).contactWidthPx;
    const fast = stepBristles(brush, { x: 40, y: 60, pressure: 0.6, velocity: 4, dtMs: 8 });
    const fastWidth = bristleFootprint(brush).contactWidthPx;
    expect(slow.splitDrive).toBe(0);
    // Speed alone saturates at (splitSpeedWeight − splitThreshold)/driveSpan:
    // a wet brush frays a little when whipped, not as much as a dry one.
    expect(fast.splitDrive).toBeGreaterThan(0.1);
    expect(fast.splitDrive).toBeLessThan(0.5);
    expect(fastWidth).toBeGreaterThan(slowWidth);
  });
});

describe("bristleFootprint", () => {
  it("is a pure projection of the current contact state", () => {
    const brush = createBristleBrushFromPreset("round");
    for (const sample of straightStroke(30)) stepBristles(brush, sample);
    const a = bristleFootprint(brush);
    const b = bristleFootprint(brush);
    expect(a.stamps).toEqual(b.stamps);
    expect(a.contactCount).toBeGreaterThan(0);
    expect(a.contactWidthPx).toBeGreaterThan(0);
    for (const stamp of a.stamps) {
      expect(stamp.alpha).toBeGreaterThan(0);
      expect(stamp.alpha).toBeLessThanOrEqual(1);
      expect(stamp.radius).toBeGreaterThan(0);
      expect(Number.isFinite(stamp.x)).toBe(true);
      expect(Number.isFinite(stamp.y)).toBe(true);
      expect(stamp.ink).toBeGreaterThanOrEqual(0);
    }
  });

  it("shifts the contact centroid toward the tilt direction", () => {
    // Stroke runs along +x, so tiltY leans across the cross-section: the whole
    // fan translates AND the hairs on the leaning side press harder.
    const shiftFor = (tiltY: number): number => {
      const brush = createBristleBrushFromPreset("round");
      let footprint = bristleFootprint(brush);
      for (const sample of straightStroke(30, { tiltY })) {
        stepBristles(brush, sample);
        footprint = bristleFootprint(brush);
      }
      return footprint.centroidY - 60;
    };
    const none = shiftFor(0);
    const half = shiftFor(0.5);
    const full = shiftFor(1);
    expect(Math.abs(none)).toBeLessThan(0.5);
    expect(half).toBeGreaterThan(none + 1);
    expect(full).toBeGreaterThan(half + 1);
  });

  it("shifts along the lean even when the pen tilts down the stroke axis", () => {
    const brush = createBristleBrushFromPreset("round");
    let footprint = bristleFootprint(brush);
    for (const sample of straightStroke(30, { tiltX: 1 })) {
      stepBristles(brush, sample);
      footprint = bristleFootprint(brush);
    }
    // Tilt is a canvas-space lean, so an along-stroke tilt drags the contact
    // forward instead of widening it.
    expect(footprint.centroidX - brush.x).toBeGreaterThan(1);
    expect(Math.abs(footprint.centroidY - 60)).toBeLessThan(0.5);
  });

  it("widens the contact under pressure", () => {
    const widthAt = (pressure: number): number => {
      const brush = createBristleBrushFromPreset("round", { inkCapacity: 20 });
      for (const sample of straightStroke(80, { pressure })) stepBristles(brush, sample);
      return bristleFootprint(brush).contactWidthPx;
    };
    expect(widthAt(0.8)).toBeGreaterThan(widthAt(0.4));
    expect(widthAt(0.4)).toBeGreaterThan(widthAt(0.15));
  });
});

describe("stamp-path join", () => {
  it("emits RasterStrokeSample-shaped tracks, one per hair", () => {
    const brush = createBristleBrushFromPreset("round");
    const run = runBristleStroke(brush, straightStroke(60));
    const tracks = bristleStrokeTracks(run.footprints, { stepMs: 8 });
    expect(tracks.length).toBeGreaterThan(0);
    expect(tracks.length).toBeLessThanOrEqual(brush.config.bristleCount);
    expect(tracks.map((track) => track.bristleIndex)).toEqual(
      [...tracks.map((track) => track.bristleIndex)].sort((a, b) => a - b),
    );
    for (const track of tracks) {
      expect(track.samples.length).toBeGreaterThan(0);
      expect(track.meanRadiusPx).toBeGreaterThan(0);
      expect(track.maxRadiusPx).toBeGreaterThanOrEqual(track.meanRadiusPx);
      expect(track.radiusModulation).toBeGreaterThanOrEqual(1);
      expect(2 ** track.radiusLog2).toBeCloseTo(track.meanRadiusPx, 6);
      for (const sample of track.samples) {
        expect(sample.pressure).toBeGreaterThan(0);
        expect(sample.pressure).toBeLessThanOrEqual(1);
        expect(Number.isFinite(sample.x)).toBe(true);
        expect(Number.isFinite(sample.y)).toBe(true);
        expect(Number.isFinite(sample.tMs)).toBe(true);
      }
    }
    expect(() => bristleStrokeTracks(run.footprints, { stepMs: 0 })).toThrow(
      BristleModelError,
    );
  });

  it("lifts ModeledSampleIR onto the same tilt plane the raster lane uses", () => {
    const modeled: ModeledSampleIR[] = [
      { x: 0, y: 0, tMs: 0, pressure: 0.5, velocity: 0, altitudeDeg: 90, azimuthDeg: 0 },
      { x: 3, y: 4, tMs: 8, pressure: 0.5, velocity: 0.625, altitudeDeg: 0, azimuthDeg: 90 },
    ];
    const samples = bristleSamplesFromModeled(modeled);
    expect(samples).toHaveLength(2);
    expect(samples[0]?.tiltX).toBeCloseTo(0, 12);
    expect(samples[0]?.tiltY).toBeCloseTo(0, 12);
    expect(samples[1]?.tiltX).toBeCloseTo(0, 12);
    expect(samples[1]?.tiltY).toBeCloseTo(1, 12);
    expect(samples[1]?.dtMs).toBe(8);
  });
});

describe("rasterizeBristleStamps", () => {
  it("produces bounded, deterministic coverage", () => {
    const brush = createBristleBrushFromPreset("round");
    const run = runBristleStroke(brush, straightStroke(40));
    const target = { width: 160, height: 120 };
    const a = rasterizeBristleStroke(run.footprints, target);
    const b = rasterizeBristleStroke(run.footprints, target);
    expect([...a]).toEqual([...b]);
    let inked = 0;
    for (const value of a) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      if (value > 0) inked += 1;
    }
    expect(inked).toBeGreaterThan(200);
  });

  it("rejects an inconsistent target", () => {
    expect(() => rasterizeBristleStamps([], { width: 0, height: 4 })).toThrow(
      BristleModelError,
    );
    expect(() =>
      rasterizeBristleStamps([], { width: 4, height: 4 }, new Float32Array(9)),
    ).toThrow(/does not match/);
  });
});

describe("determinism", () => {
  it("reproduces a stroke byte-for-byte from the same seed and input", () => {
    const samples = straightStroke(120, { pressure: (t) => 0.2 + 0.7 * t, tiltX: 0.3 });
    const first = footprintDigest(createBristleBrushFromPreset("round"), samples);
    const second = footprintDigest(createBristleBrushFromPreset("round"), samples);
    const other = footprintDigest(
      createBristleBrushFromPreset("round", { seed: 4242 }),
      samples,
    );
    expect(first).toBe(second);
    expect(first).not.toBe(other);
  });

  it("never consults Math.random", () => {
    const source = createBristleBrush.toString() + stepBristles.toString();
    expect(source).not.toContain("Math.random");
  });

  it("refuses an empty stroke instead of returning an empty run", () => {
    expect(() => runBristleStroke(createBristleBrushFromPreset("round"), [])).toThrow(
      BristleModelError,
    );
  });
});

/**
 * The two per-step values `stepBristles` stopped recomputing.
 *
 * A planned oil stroke steps this model once per station — 4096 times per pointer move, paid again
 * on the next move — so re-summing a constant and allocating a scratch array inside the step were
 * both pure waste. Neither may change a number the model reports, and these pin that: the capacity
 * total must stay the layout's own sum in layout order, and the capillary scratch must behave
 * exactly like the fresh array it replaced (i.e. carry nothing between steps).
 */
describe("stepBristles per-step invariants", () => {
  it("keeps capacityTotal equal to the layout sum, and constant across a stroke", () => {
    const state = createBristleBrush({ ...BRISTLE_PRESETS.flat, bristleCount: 24, seed: 4242 });
    const layoutSum = state.layout.reduce((total, entry) => total + entry.capacity, 0);
    expect(state.capacityTotal).toBe(layoutSum);

    for (let step = 0; step < 40; step += 1) {
      stepBristles(state, { x: step * 3, y: 12 + Math.sin(step / 4) * 5, pressure: 0.6, dtMs: 8 });
    }
    // Ink drains; capacity does not.
    expect(state.capacityTotal).toBe(layoutSum);
  });

  it("reports the same stream as a model whose scratch is never reused", () => {
    // Two brushes with identical config and seed must agree step for step. A scratch that leaked
    // state between steps would make the longer-lived one diverge from a freshly built brush
    // replayed to the same point.
    const config = { ...BRISTLE_PRESETS.flat, bristleCount: 19, seed: 90210 };
    const marched = createBristleBrush(config);
    const samples = Array.from({ length: 24 }, (_, step) => ({
      x: step * 2.5,
      y: 40 + Math.cos(step / 3) * 7,
      pressure: 0.3 + 0.4 * Math.abs(Math.sin(step / 5)),
      dtMs: 8,
    }));

    for (const [index, sample] of samples.entries()) {
      const report = stepBristles(marched, sample);
      const replay = createBristleBrush(config);
      for (const earlier of samples.slice(0, index)) stepBristles(replay, earlier);
      const replayed = stepBristles(replay, sample);
      expect(report).toEqual(replayed);
      expect([...marched.ink]).toEqual([...replay.ink]);
    }
  });
});
