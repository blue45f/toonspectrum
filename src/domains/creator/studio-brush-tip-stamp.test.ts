import { describe, expect, it } from "vitest";

import {
  planStudioDynamicBrush,
  normalizeStudioBrushDynamicsSettings,
} from "./studio-brush-dynamics";
import {
  buildStudioBrushTipAlphaMap,
  STUDIO_BRUSH_TIP_ALPHA_MAP_CACHE_LIMIT,
  decodeStudioBrushTipAlphaMapBase64,
  encodeStudioBrushTipAlphaMapBase64,
  normalizeStudioBrushTipSettings,
  planStudioBrushTipStamp,
  planStudioBrushTipStampWorldSamples,
  sampleStudioBrushTipProceduralAlpha,
  studioBrushTipAlphaMapToBase64,
  studioBrushTipUsesSolidEllipse,
} from "./studio-brush-tip-stamp";

describe("studio brush tip alpha maps", () => {
  it("normalizes unknown tip payloads to safe round defaults", () => {
    const tip = normalizeStudioBrushTipSettings({
      shape: "not-a-shape",
      softness: 9,
      alphaMapSize: 2,
      alphaMapBase64: "%%%",
    });
    expect(tip).toEqual({
      shape: "round",
      softness: 1,
      alphaMapSize: 8,
      alphaMapBase64: null,
    });
    expect(studioBrushTipUsesSolidEllipse(tip)).toBe(true);
  });

  it("round-trips a custom PNG-alpha payload as base64 bytes", () => {
    const size = 12;
    const bytes = new Uint8Array(size * size);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 17) % 256;
    const encoded = encodeStudioBrushTipAlphaMapBase64(bytes);
    const decoded = decodeStudioBrushTipAlphaMapBase64(encoded);
    expect(decoded).not.toBeNull();
    expect(Array.from(decoded!)).toEqual(Array.from(bytes));

    const tip = normalizeStudioBrushTipSettings({
      shape: "grain",
      softness: 0,
      alphaMapBase64: encoded,
      alphaMapSize: size,
    });
    expect(tip.alphaMapBase64).toBe(encoded);
    expect(studioBrushTipUsesSolidEllipse(tip)).toBe(false);

    const map = buildStudioBrushTipAlphaMap(tip);
    expect(map.custom).toBe(true);
    expect(map.size).toBe(size);
    expect(map.alphas[0]).toBeCloseTo(bytes[0]! / 255, 5);
    expect(map.alphas[bytes.length - 1]).toBeCloseTo(bytes[bytes.length - 1]! / 255, 5);
  });

  it("reuses decoded and softened alpha maps with a bounded LRU", () => {
    const size = 8;
    const firstBytes = new Uint8Array(size * size);
    firstBytes[7] = 255;
    const firstTip = {
      shape: "grain" as const,
      softness: 0.314159,
      alphaMapSize: size,
      alphaMapBase64: encodeStudioBrushTipAlphaMapBase64(firstBytes),
    };
    const first = buildStudioBrushTipAlphaMap(firstTip);
    expect(buildStudioBrushTipAlphaMap({ ...firstTip })).toBe(first);

    for (let index = 0; index < STUDIO_BRUSH_TIP_ALPHA_MAP_CACHE_LIMIT; index++) {
      const bytes = new Uint8Array(size * size);
      bytes[index % bytes.length] = 192;
      bytes[(index * 7 + 3) % bytes.length] = index + 1;
      buildStudioBrushTipAlphaMap({
        shape: "hard",
        softness: index / STUDIO_BRUSH_TIP_ALPHA_MAP_CACHE_LIMIT,
        alphaMapSize: size,
        alphaMapBase64: encodeStudioBrushTipAlphaMapBase64(bytes),
      });
    }

    const rebuilt = buildStudioBrushTipAlphaMap(firstTip);
    expect(rebuilt).not.toBe(first);
    expect(Array.from(rebuilt.alphas)).toEqual(Array.from(first.alphas));
  });

  it("applies the edge-softness control to imported PNG alpha without mutating its payload", () => {
    const size = 8;
    const bytes = new Uint8Array(size * size);
    bytes[3 * size + 3] = 255;
    bytes[3 * size + 4] = 255;
    bytes[4 * size + 3] = 255;
    bytes[4 * size + 4] = 255;
    const alphaMapBase64 = encodeStudioBrushTipAlphaMapBase64(bytes);
    const sharp = buildStudioBrushTipAlphaMap({ alphaMapBase64, alphaMapSize: size, softness: 0 });
    const soft = buildStudioBrushTipAlphaMap({ alphaMapBase64, alphaMapSize: size, softness: 1 });

    expect(sharp.alphas[3 * size + 2]).toBe(0);
    expect(soft.alphas[3 * size + 2]).toBeGreaterThan(0);
    expect(soft.alphas[3 * size + 3]).toBeLessThan(sharp.alphas[3 * size + 3]!);
    expect(normalizeStudioBrushTipSettings({ alphaMapBase64, alphaMapSize: size, softness: 1 }).alphaMapBase64)
      .toBe(alphaMapBase64);
  });

  it("builds distinct procedural alpha shapes with zero outside the tip", () => {
    const shapes = [
      "round",
      "soft",
      "hard",
      "flake",
      "grain",
      "bristle",
      "sponge",
      "sumi",
      "halftone",
      "star",
    ] as const;
    for (const shape of shapes) {
      expect(sampleStudioBrushTipProceduralAlpha(shape, 2, 0, 0.3)).toBe(0);
      expect(sampleStudioBrushTipProceduralAlpha(shape, 0, 0, 0.3)).toBeGreaterThan(0.2);
    }
    expect(sampleStudioBrushTipProceduralAlpha("hard", 0, 0, 0)).toBe(1);
    expect(sampleStudioBrushTipProceduralAlpha("soft", 0.2, 0, 0.9))
      .toBeLessThan(sampleStudioBrushTipProceduralAlpha("hard", 0.2, 0, 0));
  });

  it("ships visually distinct texture signatures for every bundled tip", () => {
    const signatures = new Set(
      ["round", "soft", "hard", "flake", "grain", "bristle", "sponge", "sumi", "halftone", "star"]
        .map((shape) => [
          [0, 0],
          [0.18, 0.11],
          [0.42, -0.27],
          [-0.58, 0.21],
          [0.73, -0.08],
        ].map(([x, y]) => Math.round(sampleStudioBrushTipProceduralAlpha(
          shape as Parameters<typeof sampleStudioBrushTipProceduralAlpha>[0],
          x!,
          y!,
          0.32
        ) * 255)).join(","))
    );

    expect(signatures.size).toBe(10);
  });
});

describe("studio brush tip stamp planner", () => {
  it("honors dab size, angle, roundness and produces deterministic samples", () => {
    const dab = {
      x: 40,
      y: 20,
      size: 16,
      angle: 90,
      roundness: 0.5,
      opacity: 1,
      flow: 1,
    };
    const tip = { shape: "flake" as const, softness: 0.3 };
    const first = planStudioBrushTipStamp(dab, tip, { grid: 7 });
    const second = planStudioBrushTipStamp(dab, tip, { grid: 7 });
    expect(first).toEqual(second);
    expect(first.samples.length).toBeGreaterThan(4);
    for (const sample of first.samples) {
      expect(sample.alpha).toBeGreaterThan(0);
      expect(sample.alpha).toBeLessThanOrEqual(1);
      expect(Number.isFinite(sample.dx)).toBe(true);
      expect(Number.isFinite(sample.dy)).toBe(true);
    }
    // 90° rotation + roundness 0.5 should stretch along Y in world space more than X.
    const maxAbsDx = Math.max(...first.samples.map((sample) => Math.abs(sample.dx)));
    const maxAbsDy = Math.max(...first.samples.map((sample) => Math.abs(sample.dy)));
    expect(maxAbsDy).toBeGreaterThan(maxAbsDx);
  });

  it("places stamps on dynamics spacing stations and respects scatter seed", () => {
    const settings = normalizeStudioBrushDynamicsSettings({
      seed: 42,
      spacing: { base: 10, mappings: [] },
      scatter: { base: 6, mappings: [] },
      width: { base: 8, mappings: [] },
      taper: { enabled: false },
      tip: { shape: "grain", softness: 0.4 },
    });
    const plan = planStudioDynamicBrush({
      points: [0, 0, 40, 0],
      pressures: [0.7, 0.7],
      baseWidth: 8,
      baseOpacity: 1,
      settings,
      seed: 42,
    });
    expect(plan.dabs.length).toBeGreaterThan(2);
    // Constant spacing stations along the path (before scatter).
    expect(plan.dabs[0]!.sourceX).toBe(0);
    expect(plan.dabs[1]!.sourceX).toBe(10);
    // Scatter moves rendered positions off the path for at least one dab.
    const scattered = plan.dabs.some(
      (dab) => Math.hypot(dab.x - dab.sourceX, dab.y - dab.sourceY) > 0.5
    );
    expect(scattered).toBe(true);

    const alphaMap = buildStudioBrushTipAlphaMap(settings.tip);
    const worldA = plan.dabs.flatMap((dab) =>
      planStudioBrushTipStampWorldSamples(dab, settings.tip, { alphaMap, grid: 5 })
    );
    const worldB = plan.dabs.flatMap((dab) =>
      planStudioBrushTipStampWorldSamples(dab, settings.tip, { alphaMap, grid: 5 })
    );
    expect(worldA).toEqual(worldB);
    expect(worldA.length).toBeGreaterThan(plan.dabs.length);
  });

  it("custom alpha payload from procedural hard tip survives export helper", () => {
    const payload = studioBrushTipAlphaMapToBase64("hard", 0.15, 16);
    const map = buildStudioBrushTipAlphaMap({
      shape: "soft",
      alphaMapBase64: payload.alphaMapBase64,
      alphaMapSize: payload.alphaMapSize,
    });
    expect(map.custom).toBe(true);
    // Centre of a hard tip is fully opaque.
    const centre = map.alphas[Math.floor(map.size / 2) * map.size + Math.floor(map.size / 2)]!;
    expect(centre).toBeGreaterThan(0.95);
  });
});
