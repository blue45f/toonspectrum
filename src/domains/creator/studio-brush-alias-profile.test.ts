import { describe, expect, it } from "vitest";

import {
  STUDIO_BRUSH_ALIAS_PROFILES,
  STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
  applyStudioBrushAliasWatercolorMaterial,
  isStudioBrushAliasId,
  mapStudioBrushAliasPressure,
  mapStudioBrushAliasPressureSamples,
  resolveStudioBrushAliasPencilPasses,
  resolveStudioBrushAliasProfile,
  resolveStudioBrushAliasWatercolorPlanSettings,
  studioBrushAliasEffectiveDiameter,
  type StudioBrushAliasId,
} from "./studio-brush-alias-profile";

const ALIAS_IDS = [
  "pen",
  "fineliner",
  "ballpoint",
  "gel-pen",
  "glass-pen",
  "ruling-pen",
  "technical-pen",
  "marker",
  "felt-tip",
  "marker-bold",
  "alcohol-marker",
  "gpen",
  "school-pen",
  "maru-pen",
  "mapping-pen",
  "kaburapen",
  "liner",
  "calligraphy",
  "fountain-pen",
  "parallel-pen",
  "brush-pen",
  "kneaded-eraser",
  "highlighter",
  "chisel-highlighter",
  "pastel-highlighter",
  "glitter",
  "sparkle-star",
  "brush",
  "flat-brush",
  "watercolor",
  "ink-wash",
  "inkwash-pen",
  "inkwash-water-brush",
  "inkwash-bleed-wash",
  "inkwash-white-ink",
  "gouache",
  "oil",
  "acrylic",
  "airbrush",
  "splatter",
  "pencil",
  "pencil-2b",
  "pencil-6b",
  "soft-pencil",
  "colored-pencil",
  "pastel",
  "oil-pastel",
  "screentone",
  "crosshatch",
] as const satisfies readonly StudioBrushAliasId[];

describe("studio brush alias profiles", () => {
  it("publishes an exact versioned profile for every audited alias and fails closed for unknown ids", () => {
    expect(Object.keys(STUDIO_BRUSH_ALIAS_PROFILES).sort()).toEqual([...ALIAS_IDS].sort());
    for (const id of ALIAS_IDS) {
      expect(isStudioBrushAliasId(id)).toBe(true);
      expect(resolveStudioBrushAliasProfile(id)).toMatchObject({
        version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
        id,
      });
    }

    for (const value of ["", "future-brush", null, 7, {}, []]) {
      expect(isStudioBrushAliasId(value)).toBe(false);
      expect(resolveStudioBrushAliasProfile(value)).toBeNull();
    }
  });

  it("keeps every pen/marker alias visually distinct at equal selected size and source pressure", () => {
    const ids = [
      "pen",
      "fineliner",
      "ballpoint",
      "marker",
      "felt-tip",
      "marker-bold",
    ] as const;
    const signatures = ids.map((id) => [
      studioBrushAliasEffectiveDiameter(id, 10),
      mapStudioBrushAliasPressure(id, 0),
      mapStudioBrushAliasPressure(id, 0.5),
      mapStudioBrushAliasPressure(id, 1),
    ].map((value) => value.toFixed(6)).join(":"));

    expect(new Set(signatures).size).toBe(ids.length);
    expect(studioBrushAliasEffectiveDiameter("fineliner", 10)).toBe(4.8);
    expect(studioBrushAliasEffectiveDiameter("marker-bold", 10)).toBe(15);
    expect(mapStudioBrushAliasPressure("ballpoint", 1)).toBeCloseTo(0.9);
    expect(mapStudioBrushAliasPressure("marker-bold", 0)).toBe(0.92);
  });

  it("makes liner narrower and less pressure-elastic than G-pen", () => {
    expect(studioBrushAliasEffectiveDiameter("gpen", 12)).toBe(12);
    expect(studioBrushAliasEffectiveDiameter("liner", 12)).toBeCloseTo(9.36);
    expect(mapStudioBrushAliasPressure("gpen", 0.1)).toBeCloseTo(0.1);
    expect(mapStudioBrushAliasPressure("gpen", 0.9)).toBeCloseTo(0.9);
    expect(mapStudioBrushAliasPressure("liner", 0.1)).toBeGreaterThan(0.7);
    expect(mapStudioBrushAliasPressure("liner", 0.9)).toBeLessThan(0.91);
  });

  it("maps complete pressure arrays without mutating input and supplies omitted-sample fallback", () => {
    const source = [0, 0.5];
    const mapped = mapStudioBrushAliasPressureSamples("fineliner", source, 4, 1);

    expect(source).toEqual([0, 0.5]);
    expect(mapped).toHaveLength(4);
    expect(mapped[0]).toBe(0.8);
    expect(mapped[1]).toBeGreaterThan(0.8);
    expect(mapped[2]).toBe(1);
    expect(mapped[3]).toBe(1);
    expect(mapStudioBrushAliasPressureSamples("pen", source, -1)).toEqual([]);
    expect(mapStudioBrushAliasPressureSamples("pen", source, 1_000_001)).toEqual([]);
  });

  it("clamps malformed diameter and pressure values to finite renderer-safe output", () => {
    expect(studioBrushAliasEffectiveDiameter("pen", Number.NaN)).toBe(1);
    expect(studioBrushAliasEffectiveDiameter("marker-bold", -10)).toBe(0.015);
    expect(studioBrushAliasEffectiveDiameter("marker-bold", Number.POSITIVE_INFINITY)).toBe(1.5);
    expect(studioBrushAliasEffectiveDiameter("marker-bold", 100_000)).toBe(8_192);
    expect(mapStudioBrushAliasPressure("pen", Number.NaN, 0.25)).toBe(0.25);
    expect(mapStudioBrushAliasPressure("pen", -20)).toBe(0);
    expect(mapStudioBrushAliasPressure("pen", 20)).toBe(1);
  });

  it("gives ink wash a denser plan, compact dark core and broad pale diffuse bleed", () => {
    const watercolor = resolveStudioBrushAliasWatercolorPlanSettings("watercolor", 20);
    expect(watercolor?.baseWidth).toBe(20);
    expect(watercolor?.spacing).toBeCloseTo(6.8);
    const inkWash = resolveStudioBrushAliasWatercolorPlanSettings("ink-wash", 20);
    // Sumi is slightly narrower than toolbar size, denser stations, stronger core vs pale wash.
    expect(inkWash?.baseWidth).toBeCloseTo(18.4);
    expect(inkWash?.spacing).toBeCloseTo(3.312);
    expect(resolveStudioBrushAliasWatercolorPlanSettings("pen", 20)).toBeNull();

    const source = [
      { x: 1, y: 2, radius: 10, opacity: 0.6, role: "core" as const },
      { x: 3, y: 4, radius: 12, opacity: 0.2, role: "diffuse" as const },
    ];
    const wash = applyStudioBrushAliasWatercolorMaterial("ink-wash", source);

    expect(source[0]).toEqual({ x: 1, y: 2, radius: 10, opacity: 0.6, role: "core" });
    expect(wash).toHaveLength(2);
    expect(wash[0]).toMatchObject({ x: 1, y: 2, role: "core" });
    expect(wash[0]?.radius).toBeCloseTo(7.2);
    expect(wash[0]?.opacity).toBeCloseTo(1);
    expect(wash[1]).toMatchObject({ x: 3, y: 4, role: "diffuse" });
    expect(wash[1]?.radius).toBeCloseTo(20.64);
    expect(wash[1]?.opacity).toBeCloseTo(0.104);
    expect(applyStudioBrushAliasWatercolorMaterial("pen", source)).toBe(source);

    // Pressure hand-feel is not identity: light samples stay thinner than full pressure.
    const light = mapStudioBrushAliasPressure("ink-wash", 0.1);
    const heavy = mapStudioBrushAliasPressure("ink-wash", 0.95);
    expect(heavy).toBeGreaterThan(light * 1.5);
  });

  it("keeps standard pencil one-pass while soft pencil plans a pale skirt and rough core", () => {
    expect(resolveStudioBrushAliasPencilPasses("pencil")).toEqual([
      { role: "core", widthScale: 1, opacityScale: 1, jitterRadius: 0.75 },
    ]);
    expect(resolveStudioBrushAliasPencilPasses("soft-pencil")).toEqual([
      { role: "soft-edge", widthScale: 1.9, opacityScale: 0.18, jitterRadius: 0.3 },
      { role: "core", widthScale: 1, opacityScale: 0.72, jitterRadius: 1.2 },
    ]);
    expect(studioBrushAliasEffectiveDiameter("soft-pencil", 5)).toBe(6.4);
    expect(resolveStudioBrushAliasPencilPasses("marker")).toEqual([]);
  });
});
