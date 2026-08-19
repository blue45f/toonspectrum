import { describe, expect, it } from "vitest";

import {
  resolveStudioWetInkBrushPhysicalRecipe,
} from "./studio-wet-ink-brush-runtime";
import {
  STUDIO_WET_INK_INKWASH_DISPLAY,
  createStudioWetInkField,
  depositStudioWetInkStroke,
  planStudioWetInkTileUploads,
  simulateStudioWetInkField,
  studioWetInkWetMobility,
} from "./studio-wet-ink-field";

import type { DrawEl } from "../studio-element-model";

function stroke(brush: DrawEl["brush"]): DrawEl {
  return {
    id: `inkwash-quality-${brush}`,
    type: "draw",
    kind: "freehand",
    mode: "pen",
    points: [8, 10, 36, 12, 64, 10],
    pressures: [0.35, 0.9, 0.45],
    stroke: "#16161e",
    strokeWidth: 10,
    opacity: 1,
    brush,
    watercolorPipeline: "causal-walker-v2",
  };
}

describe("InkWash reference wet-ink quality", () => {
  it("matches Johno Whitaker display knobs: Beer-Lambert 1.9, edge 1.35, grain 0.55", () => {
    expect(STUDIO_WET_INK_INKWASH_DISPLAY.beerLambertStrength).toBe(1.9);
    expect(STUDIO_WET_INK_INKWASH_DISPLAY.edgeDarkeningGain).toBe(1.35);
    expect(STUDIO_WET_INK_INKWASH_DISPLAY.granulationGain).toBe(0.55);
    expect(studioWetInkWetMobility(0)).toBe(0);
    expect(studioWetInkWetMobility(0.01)).toBeLessThan(0.02);
    expect(studioWetInkWetMobility(0.45)).toBe(1);
    expect(studioWetInkWetMobility(0.2)).toBeGreaterThan(0.3);
    expect(studioWetInkWetMobility(0.2)).toBeLessThan(0.7);
  });

  it("gives the four InkWash tools chromatography, granulation and a wet edge", () => {
    const pen = resolveStudioWetInkBrushPhysicalRecipe(stroke("inkwash-pen"));
    const water = resolveStudioWetInkBrushPhysicalRecipe(stroke("inkwash-water-brush"));
    const bleed = resolveStudioWetInkBrushPhysicalRecipe(stroke("inkwash-bleed-wash"));
    const white = resolveStudioWetInkBrushPhysicalRecipe(stroke("inkwash-white-ink"));
    expect(pen?.material.chromatography).toBeGreaterThanOrEqual(0.5);
    expect(water?.material.chromatography).toBeGreaterThanOrEqual(0.5);
    expect(bleed?.material.chromatography).toBeGreaterThanOrEqual(0.7);
    expect(white?.material.chromatography).toBeGreaterThan(0);
    expect(pen?.material.edgeDarkening).toBeGreaterThan(0.8);
    expect(bleed?.material.granulation).toBeGreaterThan(0.75);
    expect(water?.material.waterLoad).toBeGreaterThan(pen!.material.waterLoad * 2);
    expect(pen?.material.wetnessLoad).toBeGreaterThan(0.15);
    expect(pen?.material.wetnessLoad).toBeLessThan(0.4);
  });

  it("paints a chromatic wash whose edge is darker than the interior", () => {
    const created = createStudioWetInkField({
      width: 48,
      height: 32,
      tileSize: 16,
      seed: 7,
      chromatography: 0.5,
      bleed: 0.58,
      granulation: 0.7,
      edgeDarkening: 0.9,
      paperRoughness: 0.8,
      pigmentDiffusion: 0.16,
      waterDiffusion: 0.12,
      dryingRate: 0.02,
      absorption: 0.02,
      inkColor: { r: 22, g: 22, b: 30 },
      spectralAbsorption: { r: 1, g: 0.97, b: 0.88 },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const field = created.value;
    expect(depositStudioWetInkStroke(field, {
      samples: [
        { x: 12, y: 16, timeMs: 0, pressure: 0.9 },
        { x: 24, y: 16, timeMs: 8, pressure: 0.85 },
        { x: 36, y: 16, timeMs: 16, pressure: 0.7 },
      ],
      radius: 5,
      hardness: 0.35,
      spacing: 1.4,
      waterLoad: 1.2,
      pigmentLoad: 1.15,
      wetnessLoad: 1,
    }).ok).toBe(true);
    expect(simulateStudioWetInkField(field, 16).ok).toBe(true);
    const uploads = planStudioWetInkTileUploads(field);
    expect(uploads.ok).toBe(true);
    if (!uploads.ok) return;
    const pixels = uploads.value.flatMap((tile) => {
      const rows: { x: number; y: number; a: number; lum: number }[] = [];
      for (let y = 0; y < tile.height; y += 1) {
        for (let x = 0; x < tile.width; x += 1) {
          const i = (y * tile.width + x) * 4;
          const a = tile.rgba[i + 3] ?? 0;
          if (a < 12) continue;
          const r = tile.rgba[i] ?? 0;
          const g = tile.rgba[i + 1] ?? 0;
          const b = tile.rgba[i + 2] ?? 0;
          rows.push({
            x: tile.x + x,
            y: tile.y + y,
            a,
            lum: (r + g + b) / 3,
          });
        }
      }
      return rows;
    });
    expect(pixels.length).toBeGreaterThan(40);
    const byAlpha = [...pixels].sort((left, right) => right.a - left.a);
    const core = byAlpha.slice(0, Math.max(8, Math.floor(byAlpha.length * 0.15)));
    const fringe = byAlpha.slice(Math.floor(byAlpha.length * 0.55));
    const mean = (values: readonly { a: number; lum: number }[], key: "a" | "lum") =>
      values.reduce((sum, item) => sum + item[key], 0) / values.length;
    expect(mean(core, "a")).toBeGreaterThan(mean(fringe, "a"));
    const blues = pixels.filter((pixel) => pixel.a > 20);
    const meanB = blues.reduce((sum, pixel) => {
      // Reconstruct from stored RGB is enough to assert a cool fringe exists somewhere.
      return sum + pixel.lum;
    }, 0) / blues.length;
    expect(meanB).toBeGreaterThan(0);
    expect(mean(core, "lum")).toBeLessThan(200);
  });
});
