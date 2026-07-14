import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_STUDIO_BRUSH_DYNAMICS_SETTINGS,
  STUDIO_BRUSH_DYNAMICS_PRESETS,
  STUDIO_BRUSH_DYNAMICS_PROPERTY_LIMITS,
  normalizeStudioBrushDynamicsSample,
  normalizeStudioBrushDynamicsSettings,
  planStudioDynamicBrush,
  resolveStudioBrushDynamics,
  serializeStudioBrushDynamicsSettingsCanonical,
  studioBrushDynamicsSeedFromKey,
  studioBrushDynamicsPresetSettings,
  studioBrushDynamicsSettingsEqual,
  studioBrushTaperFactors,
  type StudioBrushDynamicsRecipe,
  type StudioBrushDynamicsSettings,
  type StudioDynamicBrushPlan,
} from "./studio-brush-dynamics";

function expectFiniteRecipe(recipe: StudioBrushDynamicsRecipe): void {
  for (const value of Object.values(recipe)) expect(Number.isFinite(value)).toBe(true);
  expect(recipe.size).toBeGreaterThanOrEqual(STUDIO_BRUSH_DYNAMICS_PROPERTY_LIMITS.width.min);
  expect(recipe.size).toBeLessThanOrEqual(STUDIO_BRUSH_DYNAMICS_PROPERTY_LIMITS.width.max);
  expect(recipe.opacity).toBeGreaterThanOrEqual(0);
  expect(recipe.opacity).toBeLessThanOrEqual(1);
  expect(recipe.flow).toBeGreaterThanOrEqual(0);
  expect(recipe.flow).toBeLessThanOrEqual(1);
  expect(recipe.spacing).toBeGreaterThanOrEqual(STUDIO_BRUSH_DYNAMICS_PROPERTY_LIMITS.spacing.min);
  expect(recipe.scatter).toBeGreaterThanOrEqual(0);
  expect(recipe.angle).toBeGreaterThanOrEqual(-180);
  expect(recipe.angle).toBeLessThanOrEqual(180);
  expect(recipe.roundness).toBeGreaterThanOrEqual(STUDIO_BRUSH_DYNAMICS_PROPERTY_LIMITS.roundness.min);
  expect(recipe.roundness).toBeLessThanOrEqual(1);
}

function expectFinitePlan(plan: StudioDynamicBrushPlan): void {
  expect(Number.isFinite(plan.totalLength)).toBe(true);
  for (const dab of plan.dabs) {
    for (const value of Object.values(dab)) expect(Number.isFinite(value)).toBe(true);
    expect(dab.size).toBeGreaterThan(0);
    expect(dab.opacity).toBeGreaterThanOrEqual(0);
    expect(dab.opacity).toBeLessThanOrEqual(1);
    expect(dab.flow).toBeGreaterThanOrEqual(0);
    expect(dab.flow).toBeLessThanOrEqual(1);
    expect(dab.spacing).toBeGreaterThanOrEqual(0.25);
    expect(dab.roundness).toBeGreaterThanOrEqual(0.08);
    expect(dab.roundness).toBeLessThanOrEqual(1);
  }
}

describe("studio brush dynamics input normalization", () => {
  it("normalizes PointerEvent pressure, barrel pressure, speed, tilt, twist and direction ranges", () => {
    const normalized = normalizeStudioBrushDynamicsSample(
      {
        pressure: Number.NaN,
        tangentialPressure: 4,
        speed: 99,
        tiltX: 120,
        tiltY: -140,
        twist: 720,
        direction: 630,
        stampIndex: -3,
      },
      { fallbackPressure: 0.7, maxSpeed: 2 }
    );

    expect(normalized).toMatchObject({
      pressure: 0.7,
      tangentialPressure: 1,
      tangentialPressureNormalized: 1,
      speed: 64,
      speedNormalized: 1,
      tiltX: 90,
      tiltY: -90,
      tiltMagnitude: 1,
      tiltAzimuth: -45,
      twist: 359,
      direction: -90,
      hasTilt: true,
      hasDirection: true,
      stampIndex: 0,
    });
  });

  it("separates tilt magnitude and azimuth and marks absent circular inputs inactive", () => {
    const tilted = normalizeStudioBrushDynamicsSample({ tiltX: 0, tiltY: 45 });
    expect(tilted.tiltMagnitude).toBeCloseTo(0.5, 10);
    expect(tilted.tiltAzimuth).toBe(90);
    expect(tilted.hasTilt).toBe(true);

    const neutral = normalizeStudioBrushDynamicsSample({ direction: Number.NaN, tiltX: Number.NaN });
    expect(neutral).toMatchObject({
      tiltMagnitude: 0,
      tiltAzimuth: 0,
      hasTilt: false,
      direction: 0,
      hasDirection: false,
    });
  });

  it("does not mutate the caller's sample", () => {
    const sample = { pressure: 2, tiltX: 100, direction: 400 };
    const before = { ...sample };
    normalizeStudioBrushDynamicsSample(sample);
    expect(sample).toEqual(before);
  });
});

describe("studio brush dynamics mapping", () => {
  it("preserves existing G-pen width behavior and follows a supplied travel direction by default", () => {
    const result = resolveStudioBrushDynamics({ pressure: 0.5, direction: 90 });
    expect(result).toMatchObject({
      size: 6,
      width: 6,
      opacity: 1,
      flow: 1,
      spacing: 2.04,
      scatter: 0,
      angle: 90,
      roundness: 1,
    });
    expect(result.scatterOffsetX).toBe(0);
    expect(result.scatterOffsetY).toBe(0);
    expectFiniteRecipe(result);
  });

  it("maps low and high pressure to the compatible 0.3x and 1.7x width endpoints", () => {
    expect(resolveStudioBrushDynamics({ pressure: 0 }).size).toBeCloseTo(1.8, 10);
    expect(resolveStudioBrushDynamics({ pressure: 1 }).size).toBeCloseTo(10.2, 10);
  });

  it("combines pressure, velocity, tangential pressure, tilt and twist in serialized order", () => {
    const settings: StudioBrushDynamicsSettings = {
      maxSpeed: 2,
      width: {
        base: 10,
        min: 0.05,
        max: 100,
        mappings: [
          { source: "pressure", mode: "multiply", from: 0.5, to: 1.5 },
          { source: "speed", mode: "multiply", from: 1, to: 0.5 },
          { source: "tilt-magnitude", mode: "add", from: 0, to: 4 },
          { source: "tangential-pressure", mode: "add", from: -2, to: 2 },
          { source: "twist", mode: "add", from: 0, to: 4 },
        ],
      },
    };

    const result = resolveStudioBrushDynamics(
      { pressure: 0.75, speed: 2, tiltX: 45, tiltY: 0, tangentialPressure: 0.5, twist: 180 },
      settings
    );
    // 10 * 1.25 * .5 + 2 + 1 + 2
    expect(result.size).toBeCloseTo(11.25, 10);
  });

  it("combines travel direction, tilt azimuth and barrel twist as circular angle sources", () => {
    const settings: StudioBrushDynamicsSettings = {
      angle: {
        base: 0,
        mappings: [
          { source: "direction", mode: "add", from: 0, to: 360 },
          { source: "tilt-azimuth", mode: "add", from: 0, to: 360 },
          { source: "twist", mode: "add", from: 0, to: 360 },
        ],
      },
    };
    expect(resolveStudioBrushDynamics({ direction: 0, tiltX: 0, tiltY: 45, twist: 45 }, settings).angle).toBe(135);
    // An absent tilt direction is skipped instead of applying an arbitrary azimuth.
    expect(resolveStudioBrushDynamics({ direction: 30, twist: 30 }, settings).angle).toBe(60);
  });

  it("supports inverse response curves, opacity, flow, spacing and tilt roundness recipes", () => {
    const settings: StudioBrushDynamicsSettings = {
      maxSpeed: 2,
      opacity: { base: 1, mappings: [{ source: "speed", from: 0.2, to: 1, invert: true, curve: 2 }] },
      flow: { base: 1, mappings: [{ source: "pressure", from: 0.25, to: 1 }] },
      spacing: { base: 4, mappings: [{ source: "speed", from: 0.5, to: 2 }] },
      roundness: { base: 1, mappings: [{ source: "tilt", from: 1, to: 0.2 }] },
    };

    const slow = resolveStudioBrushDynamics({ speed: 0, pressure: 0, tiltX: 0 }, settings);
    const fastTilted = resolveStudioBrushDynamics({ speed: 2, pressure: 1, tiltX: 90 }, settings);
    expect(slow.opacity).toBe(1);
    expect(fastTilted.opacity).toBeCloseTo(0.2, 10);
    expect(slow.flow).toBeCloseTo(0.25, 10);
    expect(fastTilted.flow).toBe(1);
    expect(slow.spacing).toBe(2);
    expect(fastTilted.spacing).toBe(8);
    expect(slow.roundness).toBe(1);
    expect(fastTilted.roundness).toBeCloseTo(0.2, 10);
  });

  it("uses a stable seed and dab index for jitter and uniform-disk scatter", () => {
    const settings: StudioBrushDynamicsSettings = {
      seed: 42,
      width: { base: 10, mappings: [], jitter: { mode: "multiply", amount: 0.4 } },
      scatter: { base: 12, mappings: [] },
    };
    const first = resolveStudioBrushDynamics({ stampIndex: 7 }, settings);
    const replay = resolveStudioBrushDynamics({ stampIndex: 7 }, JSON.parse(JSON.stringify(settings)));
    const next = resolveStudioBrushDynamics({ stampIndex: 8 }, settings);

    expect(replay).toEqual(first);
    expect(next).not.toEqual(first);
    expect(Math.hypot(first.scatterOffsetX, first.scatterOffsetY)).toBeLessThanOrEqual(first.scatter);
    expect(first.size).toBeGreaterThanOrEqual(6);
    expect(first.size).toBeLessThanOrEqual(14);
  });

  it("never consults ambient Math.random", () => {
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("ambient randomness must not be used");
    });
    expect(() => resolveStudioBrushDynamics(
      { pressure: 0.7, stampIndex: 9 },
      { seed: 81, scatter: { base: 20 }, angle: { base: 30, jitter: { mode: "add", amount: 15 } } }
    )).not.toThrow();
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });
});

describe("studio brush dynamics settings safety", () => {
  it("sanitizes corrupt values, reversed ranges and hostile mapping magnitudes", () => {
    const raw = {
      seed: -9,
      fallbackPressure: Number.NaN,
      maxSpeed: 0,
      width: {
        base: Number.POSITIVE_INFINITY,
        min: 999,
        max: -999,
        mappings: [
          null,
          { source: "unknown" },
          { source: "pressure", from: -99, to: 99, amount: 9, curve: 0, invert: "yes" },
        ],
        jitter: { mode: "multiply", amount: 9 },
      },
      opacity: { base: -10, min: 7, max: -7 },
      angle: { base: 9999, min: 30, max: -30 },
      roundness: { base: Number.NaN, mappings: "broken" },
    };
    const normalized = normalizeStudioBrushDynamicsSettings(raw);

    expect(normalized.seed).toBe(0);
    expect(normalized.fallbackPressure).toBe(0.5);
    expect(normalized.maxSpeed).toBe(0.01);
    expect(normalized.width).toMatchObject({ base: 6, min: 0.05, max: 999 });
    expect(normalized.width.mappings).toEqual([
      { source: "pressure", mode: "multiply", from: 0, to: 8, amount: 1, curve: 0.05, invert: false },
    ]);
    expect(normalized.width.jitter).toEqual({ mode: "multiply", amount: 1 });
    expect(normalized.opacity).toMatchObject({ base: 0, min: 0, max: 1 });
    expect(normalized.angle).toMatchObject({ base: 30, min: -30, max: 30 });
    expectFiniteRecipe(resolveStudioBrushDynamics(
      { pressure: Number.NaN },
      raw as unknown as StudioBrushDynamicsSettings
    ));
  });

  it("accepts size as a persisted alias while giving width precedence", () => {
    expect(resolveStudioBrushDynamics({ pressure: 0.5 }, { size: { base: 20, mappings: [] } }).size).toBe(20);
    expect(resolveStudioBrushDynamics(
      { pressure: 0.5 },
      { size: { base: 20, mappings: [] }, width: { base: 12, mappings: [] } }
    ).size).toBe(12);
  });

  it("caps mapping count, emits a canonical version and round-trips through JSON", () => {
    const settings: StudioBrushDynamicsSettings = {
      seed: 987,
      width: {
        base: 17,
        mappings: Array.from({ length: 40 }, () => ({ source: "pressure" as const, from: 0.9, to: 1.1 })),
      },
    };
    const normalized = normalizeStudioBrushDynamicsSettings(settings);
    expect(normalized.version).toBe(1);
    expect(normalized.width.mappings).toHaveLength(24);
    expect(JSON.parse(JSON.stringify(normalized))).toEqual(normalized);
    expect(resolveStudioBrushDynamics({ pressure: 0.7, stampIndex: 5 }, normalized)).toEqual(
      resolveStudioBrushDynamics({ pressure: 0.7, stampIndex: 5 }, JSON.parse(JSON.stringify(normalized)))
    );
  });

  it("canonicalizes equivalent partial settings and detects meaningful recipe differences", () => {
    const partial = { width: { base: 6 } };
    const normalized = normalizeStudioBrushDynamicsSettings(partial);
    expect(studioBrushDynamicsSettingsEqual(partial, normalized)).toBe(true);
    expect(studioBrushDynamicsSettingsEqual(partial, { width: { base: 7 } })).toBe(false);
    expect(serializeStudioBrushDynamicsSettingsCanonical(partial)).toBe(JSON.stringify(normalized));
  });

  it("provides detached, serializable ink, airbrush and dry-media presets", () => {
    expect(STUDIO_BRUSH_DYNAMICS_PRESETS.map((preset) => preset.id)).toEqual([
      "ink-particle",
      "airbrush",
      "dry-media",
    ]);
    const recipes = STUDIO_BRUSH_DYNAMICS_PRESETS.map((preset) =>
      resolveStudioBrushDynamics({ pressure: 0.7, speed: 1, direction: 30, tiltX: 35, twist: 25 }, preset.settings)
    );
    expect(new Set(recipes.map((recipe) => JSON.stringify(recipe))).size).toBe(3);
    for (const preset of STUDIO_BRUSH_DYNAMICS_PRESETS) {
      expect(JSON.parse(JSON.stringify(preset.settings))).toEqual(preset.settings);
      expectFiniteRecipe(resolveStudioBrushDynamics({}, studioBrushDynamicsPresetSettings(preset.id)));
    }
    const first = studioBrushDynamicsPresetSettings("ink-particle");
    first.width.base = 99;
    expect(studioBrushDynamicsPresetSettings("ink-particle").width.base).toBe(8);
  });

  it("keeps exported defaults detached from runtime normalization", () => {
    const originalBase = DEFAULT_STUDIO_BRUSH_DYNAMICS_SETTINGS.width.base;
    (DEFAULT_STUDIO_BRUSH_DYNAMICS_SETTINGS.width as { base: number }).base = 123;
    expect(normalizeStudioBrushDynamicsSettings().width.base).toBe(6);
    (DEFAULT_STUDIO_BRUSH_DYNAMICS_SETTINGS.width as { base: number }).base = originalBase;
  });

  it("derives stable unsigned seeds from stroke keys", () => {
    expect(studioBrushDynamicsSeedFromKey("stroke-42")).toBe(studioBrushDynamicsSeedFromKey("stroke-42"));
    expect(studioBrushDynamicsSeedFromKey("stroke-42")).not.toBe(studioBrushDynamicsSeedFromKey("stroke-43"));
    expect(studioBrushDynamicsSeedFromKey(null)).toBe(1);
    expect(studioBrushDynamicsSeedFromKey("")).toBe(1);
  });
});

describe("studio dynamic brush arc-length dab planner", () => {
  it("lets plan-level baseWidth and baseOpacity override persisted property bases", () => {
    const plan = planStudioDynamicBrush({
      points: [0, 0],
      pressures: [0.5],
      baseWidth: 12,
      baseOpacity: 0.7,
      settings: {
        width: { base: 99, mappings: [] },
        opacity: { base: 0.1, mappings: [] },
        scatter: { base: 0 },
      },
    });
    expect(plan.settings.width.base).toBe(12);
    expect(plan.settings.opacity.base).toBe(0.7);
    expect(plan.settings.spacing.base).toBeCloseTo(12 * 0.34, 10);
    expect(plan.dabs[0]).toMatchObject({ size: 12, opacity: 0.7 });
  });

  it("stores spacing and scatter as tip-width ratios that scale with plan baseWidth", () => {
    const common = {
      points: [0, 0] as const,
      baseOpacity: 1,
      settings: {
        spacingRatio: 0.25,
        scatterRatio: 0.5,
        spacing: { mappings: [] },
        scatter: { mappings: [] },
      },
    };
    const small = planStudioDynamicBrush({ ...common, baseWidth: 20 });
    const large = planStudioDynamicBrush({ ...common, baseWidth: 40 });

    expect(small.settings).toMatchObject({ spacingRatio: 0.25, scatterRatio: 0.5 });
    expect(small.dabs[0]).toMatchObject({ spacing: 5, scatter: 10 });
    expect(large.dabs[0]).toMatchObject({ spacing: 10, scatter: 20 });
  });

  it("applies ratios to each pressure-adjusted dab size, not only the nominal toolbar width", () => {
    const plan = planStudioDynamicBrush({
      points: [0, 0],
      pressures: [1],
      baseWidth: 20,
      baseOpacity: 1,
      settings: { spacingRatio: 0.25, scatterRatio: 0.5 },
    });
    // Default pressure response at p=1 is 1.7x: 20px -> 34px tip.
    expect(plan.dabs[0]).toMatchObject({ size: 34, spacing: 8.5, scatter: 17 });
  });

  it("preserves legacy absolute spacing and scatter when explicit bases opt out of ratios", () => {
    const make = (baseWidth: number) => planStudioDynamicBrush({
      points: [0, 0],
      baseWidth,
      baseOpacity: 1,
      settings: {
        spacing: { base: 3, mappings: [] },
        scatter: { base: 2, mappings: [] },
      },
    });
    for (const plan of [make(10), make(40)]) {
      expect(plan.settings).toMatchObject({ spacingRatio: null, scatterRatio: null });
      expect(plan.dabs[0]).toMatchObject({ spacing: 3, scatter: 2 });
    }
  });

  it("places constant-spacing dabs by arc length and preserves exact endpoints", () => {
    const plan = planStudioDynamicBrush({
      points: [0, 0, 10, 0],
      baseWidth: 10,
      baseOpacity: 0.8,
      settings: { spacing: { base: 3, mappings: [] }, scatter: { base: 0 } },
    });

    expect(plan.dabs.map((dab) => dab.sourceX)).toEqual([0, 3, 6, 9, 10]);
    expect(plan.dabs.every((dab) => dab.sourceY === 0)).toBe(true);
    expect(plan.dabs.map((dab) => dab.x)).toEqual([0, 3, 6, 9, 10]);
    expect(plan.dabs[0]).toMatchObject({ progress: 0, angle: 0, opacity: 0.8 });
    expect(plan.dabs.at(-1)).toMatchObject({ progress: 1, sourceX: 10, x: 10 });
    expect(plan.totalLength).toBe(10);
    expect(plan.capped).toBe(false);
  });

  it("follows corners by cumulative arc length rather than endpoint interpolation", () => {
    const plan = planStudioDynamicBrush({
      points: [0, 0, 3, 0, 3, 4],
      baseWidth: 6,
      baseOpacity: 1,
      settings: { spacing: { base: 2, mappings: [] }, scatter: { base: 0 } },
    });
    expect(plan.totalLength).toBe(7);
    expect(plan.dabs.map((dab) => [dab.sourceX, dab.sourceY])).toEqual([
      [0, 0],
      [2, 0],
      [3, 1],
      [3, 3],
      [3, 4],
    ]);
    expect(plan.dabs[2]!.angle).toBe(90);
  });

  it("maps pressure to size, opacity and flow, and tilt/twist to tip geometry", () => {
    const input = {
      points: [0, 0, 10, 0],
      pressures: [0, 1],
      tiltXs: [0, 90],
      tiltYs: [0, 0],
      twists: [0, 90],
      baseWidth: 10,
      baseOpacity: 0.8,
      seed: 123,
      settings: {
        spacing: { base: 2, mappings: [] },
        scatter: { base: 2, mappings: [] },
        opacity: { mappings: [{ source: "pressure" as const, from: 0.2, to: 1 }] },
        flow: { mappings: [{ source: "pressure" as const, from: 0.3, to: 1 }] },
        angle: { mappings: [{ source: "twist" as const, mode: "add" as const, from: 0, to: 360 }] },
        roundness: { mappings: [{ source: "tilt-magnitude" as const, from: 1, to: 0.2 }] },
      },
    };
    const plan = planStudioDynamicBrush(input);
    const replay = planStudioDynamicBrush(JSON.parse(JSON.stringify(input)));
    const first = plan.dabs[0]!;
    const last = plan.dabs.at(-1)!;

    expect(replay).toEqual(plan);
    expect(first.size).toBeCloseTo(3, 10);
    expect(last.size).toBeCloseTo(17, 10);
    expect(first.opacity).toBeCloseTo(0.16, 10);
    expect(last.opacity).toBeCloseTo(0.8, 10);
    expect(first.flow).toBeCloseTo(0.3, 10);
    expect(last.flow).toBe(1);
    expect(first.roundness).toBe(1);
    expect(last.roundness).toBeCloseTo(0.2, 10);
    expect(first.angle).toBe(0);
    expect(last.angle).toBe(90);
    for (const dab of plan.dabs) {
      expect(Math.hypot(dab.x - dab.sourceX, dab.y - dab.sourceY)).toBeLessThanOrEqual(2);
    }
  });

  it("interpolates twist across the 359/0 seam via the shortest circular route", () => {
    const plan = planStudioDynamicBrush({
      points: [0, 0, 10, 0],
      twists: [350, 10],
      baseWidth: 6,
      baseOpacity: 1,
      settings: {
        spacing: { base: 5, mappings: [] },
        angle: { mappings: [{ source: "twist", mode: "add", from: 0, to: 360 }] },
      },
    });
    expect(plan.dabs).toHaveLength(3);
    expect(plan.dabs[0]!.angle).toBe(-10);
    expect(plan.dabs[1]!.angle).toBe(0);
    expect(plan.dabs[2]!.angle).toBe(10);
  });

  it("keeps first and last source stations when the hard dab cap is reached", () => {
    const plan = planStudioDynamicBrush({
      points: [0, 0, 100, 0],
      baseWidth: 5,
      baseOpacity: 1,
      maxDabs: 3,
      settings: { spacing: { base: 0.25, mappings: [] }, scatter: { base: 0 } },
    });
    expect(plan.capped).toBe(true);
    expect(plan.dabs).toHaveLength(3);
    expect(plan.dabs[0]).toMatchObject({ sourceX: 0, sourceY: 0, progress: 0 });
    expect(plan.dabs.at(-1)).toMatchObject({ sourceX: 100, sourceY: 0, progress: 1 });
    expect(plan.dabs.map((dab) => dab.sourceX)).toEqual([0, 50, 100]);
  });

  it.each(["ink-particle", "airbrush", "dry-media"] as const)(
    "redistributes a capped 10,000px %s stroke across the whole path without a final hole",
    (presetId) => {
      const settings = studioBrushDynamicsPresetSettings(presetId);
      const input = {
        points: [0, 0, 10_000, 0],
        pressures: [0.5, 0.5],
        speeds: [0, 0],
        baseWidth: settings.width.base,
        baseOpacity: settings.opacity.base,
        settings,
        seed: 0x1234_abcd,
        maxDabs: 1024,
      };
      const plan = planStudioDynamicBrush(input);
      const replay = planStudioDynamicBrush(JSON.parse(JSON.stringify(input)));
      const gaps = plan.dabs.slice(1).map((dab, index) => (
        dab.sourceX - plan.dabs[index]!.sourceX
      ));
      const averageGap = plan.totalLength / (plan.dabs.length - 1);

      expect(replay).toEqual(plan);
      expect(plan).toMatchObject({ capped: true, totalLength: 10_000 });
      expect(plan.dabs).toHaveLength(1024);
      expect(plan.dabs[0]).toMatchObject({ sourceX: 0, sourceY: 0, progress: 0 });
      expect(plan.dabs.at(-1)).toMatchObject({ sourceX: 10_000, sourceY: 0, progress: 1 });
      expect(Math.max(...gaps)).toBeLessThanOrEqual(averageGap * 1.01);
      expect(Math.min(...gaps)).toBeGreaterThan(0);
    }
  );

  it("retains wider speed-driven intervals while fitting a variable-spacing stroke to the cap", () => {
    const plan = planStudioDynamicBrush({
      points: [0, 0, 1000, 0],
      speeds: [0, 1],
      baseWidth: 10,
      baseOpacity: 1,
      maxDabs: 10,
      settings: {
        maxSpeed: 1,
        spacing: {
          base: 1,
          mappings: [{ source: "speed", mode: "add", from: 0, to: 400 }],
        },
        scatter: { base: 0 },
      },
    });
    const gaps = plan.dabs.slice(1).map((dab, index) => (
      dab.sourceX - plan.dabs[index]!.sourceX
    ));

    expect(plan.capped).toBe(true);
    expect(plan.dabs.length).toBeLessThanOrEqual(10);
    expect(plan.dabs[0]!.sourceX).toBe(0);
    expect(plan.dabs.at(-1)!.sourceX).toBe(1000);
    // The budget floor fills the early low-speed region, while the requested large high-speed
    // spacing is still allowed to widen later intervals instead of flattening everything uniformly.
    expect(Math.max(...gaps)).toBeGreaterThan(Math.min(...gaps) * 2);
    expect(gaps.every((gap) => gap > 0)).toBe(true);
  });

  it("keeps capped redistribution finite and evenly bounded for malformed extreme input", () => {
    const plan = planStudioDynamicBrush({
      points: [-1_000_000, 0, Number.NaN, 9, 1_000_000, 0],
      pressures: [Number.NaN, Number.POSITIVE_INFINITY, -99],
      tangentialPressures: [Number.NEGATIVE_INFINITY, 99],
      speeds: [Number.NaN, Number.POSITIVE_INFINITY],
      tiltXs: [Number.NaN, -999, 999],
      tiltYs: [Number.POSITIVE_INFINITY],
      twists: [Number.NaN, 999],
      baseWidth: Number.NaN,
      baseOpacity: Number.POSITIVE_INFINITY,
      maxDabs: 4096,
      settings: {
        spacing: { base: -999, mappings: [{ source: "speed", from: -99, to: 99 }] },
        scatter: { base: Number.POSITIVE_INFINITY },
      },
    });
    const gaps = plan.dabs.slice(1).map((dab, index) => (
      dab.sourceX - plan.dabs[index]!.sourceX
    ));
    const averageGap = plan.totalLength / (plan.dabs.length - 1);

    expectFinitePlan(plan);
    expect(plan).toMatchObject({ capped: true, sourcePointCount: 2, totalLength: 2_000_000 });
    expect(plan.dabs).toHaveLength(4096);
    expect(plan.dabs[0]).toMatchObject({ sourceX: -1_000_000, sourceY: 0, progress: 0 });
    expect(plan.dabs.at(-1)).toMatchObject({ sourceX: 1_000_000, sourceY: 0, progress: 1 });
    expect(Math.max(...gaps)).toBeLessThanOrEqual(averageGap * 1.01);
    expect(Math.min(...gaps)).toBeGreaterThan(0);
  });

  it("handles a single point as one stable pressure-aware dab", () => {
    const plan = planStudioDynamicBrush({
      points: [3, 4],
      pressures: [1],
      baseWidth: 10,
      baseOpacity: 0.75,
      maxDabs: 99,
      settings: { scatter: { base: 0 } },
    });
    expect(plan).toMatchObject({ sourcePointCount: 1, totalLength: 0, capped: false });
    expect(plan.dabs).toHaveLength(1);
    expect(plan.dabs[0]).toMatchObject({ sourceX: 3, sourceY: 4, x: 3, y: 4, size: 17, opacity: 0.75 });
  });

  it("drops invalid coordinate pairs, collapses duplicates and makes every malformed channel finite", () => {
    const points = [Number.NaN, 0, 1, 2, Number.POSITIVE_INFINITY, 3, 4, 5, 4, 5];
    const pressures = [Number.NaN, -10, Number.POSITIVE_INFINITY, 10];
    const pointsBefore = points.slice();
    const pressuresBefore = pressures.slice();
    const plan = planStudioDynamicBrush({
      points,
      pressures,
      tangentialPressures: [Number.NaN, -99, 99],
      speeds: [Number.NaN, -5, Number.POSITIVE_INFINITY],
      tiltXs: [Number.NaN, -999, 999],
      tiltYs: [Number.POSITIVE_INFINITY],
      twists: [Number.NaN, 999],
      directions: [Number.NaN, 999],
      baseWidth: Number.NaN,
      baseOpacity: Number.POSITIVE_INFINITY,
      maxDabs: 8,
      settings: {
        spacing: { base: Number.NaN, mappings: [{ source: "speed", from: -99, to: 99 }] },
        scatter: { base: 99999 },
      },
    });

    expect(plan.sourcePointCount).toBe(2);
    expect(plan.dabs.length).toBeLessThanOrEqual(8);
    expectFinitePlan(plan);
    expect(points).toEqual(pointsBefore);
    expect(pressures).toEqual(pressuresBefore);
  });

  it("returns an empty finite plan when no coordinate pair is usable", () => {
    const plan = planStudioDynamicBrush({
      points: [Number.NaN, 0, 1, Number.POSITIVE_INFINITY, 7],
      baseWidth: 6,
      baseOpacity: 1,
    });
    expect(plan.dabs).toEqual([]);
    expect(plan).toMatchObject({ sourcePointCount: 0, totalLength: 0, capped: false });
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });

  it("honors a one-dab cap without unbounded work on a huge stroke", () => {
    const plan = planStudioDynamicBrush({
      points: [-1_000_000, 0, 1_000_000, 0],
      baseWidth: 1,
      baseOpacity: 1,
      maxDabs: 0,
      settings: { spacing: { base: 0.25, mappings: [] } },
    });
    expect(plan.dabs).toHaveLength(1);
    expect(plan.dabs[0]!.sourceX).toBe(-1_000_000);
    expect(plan.capped).toBe(true);
  });

  it("applies shared start/end taper so both ends are thinner than the mid-stroke", () => {
    const settings = normalizeStudioBrushDynamicsSettings({
      width: { base: 10, mappings: [] },
      opacity: { base: 1, mappings: [] },
      spacing: { base: 5, mappings: [] },
      scatter: { base: 0 },
      taper: {
        enabled: true,
        startLength: 0.25,
        endLength: 0.25,
        minSizeRatio: 0.2,
        minOpacityRatio: 0.5,
        curve: 1,
      },
      tip: { shape: "round" },
    });
    const plan = planStudioDynamicBrush({
      points: [0, 0, 100, 0],
      pressures: Array(21).fill(0.7),
      baseWidth: 10,
      baseOpacity: 1,
      settings,
      seed: 7,
    });
    const mid = plan.dabs.find((dab) => dab.progress > 0.45 && dab.progress < 0.55)
      ?? plan.dabs[Math.floor(plan.dabs.length / 2)]!;
    const first = plan.dabs[0]!;
    const last = plan.dabs.at(-1)!;
    expect(first.size).toBeLessThan(mid.size);
    expect(last.size).toBeLessThan(mid.size);
    expect(first.opacity).toBeLessThan(mid.opacity);
    expect(last.opacity).toBeLessThan(mid.opacity);
    expect(first.progress).toBe(0);
    expect(last.progress).toBe(1);

    const replay = planStudioDynamicBrush({
      points: [0, 0, 100, 0],
      pressures: Array(21).fill(0.7),
      baseWidth: 10,
      baseOpacity: 1,
      settings,
      seed: 7,
    });
    expect(replay).toEqual(plan);
  });

  it("skips taper on zero-length point taps so a single dab keeps full size", () => {
    const plan = planStudioDynamicBrush({
      points: [5, 5],
      pressures: [0.5],
      baseWidth: 12,
      baseOpacity: 0.9,
      settings: {
        width: { mappings: [] },
        opacity: { mappings: [] },
        taper: {
          enabled: true,
          startLength: 0.4,
          endLength: 0.4,
          minSizeRatio: 0.1,
          minOpacityRatio: 0.1,
        },
      },
    });
    expect(plan.dabs).toHaveLength(1);
    expect(plan.dabs[0]!.size).toBe(12);
    expect(plan.dabs[0]!.opacity).toBe(0.9);
  });

  it("normalizes taper + tip and keeps them in the canonical serialization", () => {
    const normalized = normalizeStudioBrushDynamicsSettings({
      taper: { enabled: true, startLength: 0.9, minSizeRatio: -1, curve: 99 },
      tip: { shape: "grain", softness: 2, alphaMapSize: 3 },
    });
    expect(normalized.taper).toMatchObject({
      enabled: true,
      startLength: 0.5,
      minSizeRatio: 0,
      curve: 8,
    });
    expect(normalized.tip).toMatchObject({ shape: "grain", softness: 1, alphaMapSize: 8 });
    expect(JSON.parse(serializeStudioBrushDynamicsSettingsCanonical(normalized))).toMatchObject({
      taper: normalized.taper,
      tip: normalized.tip,
    });
    expect(studioBrushTaperFactors(0, normalized.taper).size).toBe(0);
    expect(studioBrushTaperFactors(0.5, normalized.taper).size).toBe(1);
  });

  it("ships commercial presets with taper and textured tip stamp settings", () => {
    for (const id of ["ink-particle", "airbrush", "dry-media"] as const) {
      const preset = studioBrushDynamicsPresetSettings(id);
      expect(preset.taper.enabled).toBe(true);
      expect(preset.tip.shape).not.toBe("round");
      const plan = planStudioDynamicBrush({
        points: [0, 0, 60, 0],
        pressures: [0.5, 0.5],
        baseWidth: preset.width.base,
        baseOpacity: preset.opacity.base,
        settings: preset,
      });
      expect(plan.dabs.length).toBeGreaterThan(1);
      expect(plan.settings.tip.shape).toBe(preset.tip.shape);
    }
  });
});
