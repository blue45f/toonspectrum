import { describe, expect, it } from "vitest";

import {
  FX_BRUSH_SEED_RANGE,
  fxBrushSeedFromKey,
  planGlitterBrushParticles,
  planGlowBrushPasses,
  planOilBrushDabs,
  planPastelBrushDabs,
} from "./studio-fx-brush";

describe("fxBrushSeedFromKey", () => {
  it("is stable for the same key and differs across ids", () => {
    expect(fxBrushSeedFromKey("draw-glow-1")).toBe(fxBrushSeedFromKey("draw-glow-1"));
    expect(fxBrushSeedFromKey("draw-glow-1")).not.toBe(fxBrushSeedFromKey("draw-glow-2"));
  });
});

describe("planGlowBrushPasses", () => {
  it("returns outer-to-core passes with decreasing width for hard glow", () => {
    const passes = planGlowBrushPasses(16, false);
    expect(passes.length).toBeGreaterThanOrEqual(2);
    expect(passes[0]!.widthScale).toBeGreaterThan(passes.at(-1)!.widthScale);
    expect(passes.at(-1)!.opacity).toBeGreaterThan(0.8);
  });

  it("soft glow uses a wider halo stack", () => {
    const soft = planGlowBrushPasses(16, true);
    const hard = planGlowBrushPasses(16, false);
    expect(soft[0]!.widthScale).toBeGreaterThan(hard[0]!.widthScale);
  });
});

describe("planGlitterBrushParticles", () => {
  it("is deterministic and keeps particles near the stroke", () => {
    const points = [0, 0, 40, 0, 80, 10];
    const a = planGlitterBrushParticles({
      points,
      baseWidth: 20,
      seed: 42,
      mode: "glitter",
    });
    const b = planGlitterBrushParticles({
      points,
      baseWidth: 20,
      seed: 42,
      mode: "glitter",
    });
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(4);
    for (const p of a) {
      expect(p.y).toBeGreaterThan(-40);
      expect(p.y).toBeLessThan(50);
      expect(p.radius).toBeGreaterThan(0);
    }
  });

  it("star-dust produces fewer larger sparks than glitter on the same path", () => {
    const points = [0, 0, 100, 0];
    const glitter = planGlitterBrushParticles({
      points,
      baseWidth: 24,
      seed: 7,
      mode: "glitter",
    });
    const dust = planGlitterBrushParticles({
      points,
      baseWidth: 24,
      seed: 7,
      mode: "star-dust",
    });
    expect(dust.length).toBeLessThan(glitter.length);
  });

  it.each(["glitter", "star-dust"] as const)(
    "guarantees a deterministic visible %s particle for every supported seed on a point tap",
    (mode) => {
      const missingSeeds: number[] = [];
      let minimumRadius = Number.POSITIVE_INFINITY;
      let minimumOpacity = Number.POSITIVE_INFINITY;

      for (let seed = FX_BRUSH_SEED_RANGE.min; seed <= FX_BRUSH_SEED_RANGE.max; seed++) {
        const input = {
          points: [12, 34],
          pressures: [0.5],
          baseWidth: 18,
          seed,
          mode,
        } as const;
        const particles = planGlitterBrushParticles(input);
        if (particles.length === 0) {
          missingSeeds.push(seed);
          continue;
        }
        minimumRadius = Math.min(minimumRadius, ...particles.map((particle) => particle.radius));
        minimumOpacity = Math.min(minimumOpacity, ...particles.map((particle) => particle.opacity));
        expect(planGlitterBrushParticles(input)).toEqual(particles);
      }

      expect(missingSeeds).toEqual([]);
      expect(minimumRadius).toBeGreaterThanOrEqual(0.35);
      expect(minimumOpacity).toBeGreaterThanOrEqual(0.35);
    }
  );
});

describe("planOilBrushDabs", () => {
  it("emits elliptical dabs with finite geometry", () => {
    const dabs = planOilBrushDabs({
      points: [10, 10, 50, 30, 90, 20],
      pressures: [0.4, 0.8, 0.5],
      baseWidth: 22,
      seed: 3,
    });
    expect(dabs.length).toBeGreaterThan(2);
    for (const d of dabs) {
      expect(d.radiusX).toBeGreaterThan(0);
      expect(d.radiusY).toBeGreaterThan(0);
      expect(d.opacity).toBeGreaterThan(0);
      expect(Number.isFinite(d.angleRad)).toBe(true);
    }
  });
});

describe("planPastelBrushDabs", () => {
  it("builds soft low-opacity build-up dabs", () => {
    const dabs = planPastelBrushDabs({
      points: [0, 0, 60, 0],
      baseWidth: 18,
      seed: 11,
    });
    expect(dabs.length).toBeGreaterThan(2);
    expect(dabs.every((d) => d.opacity <= 0.5)).toBe(true);
  });
});
