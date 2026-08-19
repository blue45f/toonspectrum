import { describe, expect, it } from "vitest";

import {
  planStudioWetInkBrushReplay,
  resolveStudioWetInkBrushPhysicalRecipe,
} from "./studio-wet-ink-brush-runtime";
import {
  createStudioWetInkField,
  depositStudioWetInkStroke,
  planStudioWetInkTileUploads,
  readStudioWetInkCell,
  simulateStudioWetInkField,
} from "./studio-wet-ink-field";

import type { DrawEl } from "./studio-element-model";

function inkWashStroke(overrides: Partial<DrawEl> = {}): DrawEl {
  return {
    id: "ink-wash-feel-stroke",
    type: "draw",
    kind: "freehand",
    mode: "pen",
    points: [6, 8, 28, 9, 48, 8],
    pressures: [0.7, 0.85, 0.6],
    stroke: "#1a1a1a",
    strokeWidth: 8,
    opacity: 1,
    brush: "ink-wash",
    watercolorPipeline: "causal-walker-v2",
    ...overrides,
  };
}

function inkWashField() {
  const recipe = resolveStudioWetInkBrushPhysicalRecipe(inkWashStroke());
  if (!recipe) throw new Error("ink-wash recipe missing");
  const created = createStudioWetInkField({
    width: 32,
    height: 20,
    tileSize: 16,
    absorption: recipe.material.absorption,
    bleed: recipe.material.bleed,
    chromatography: recipe.material.chromatography,
    dryingRate: 0,
    evaporation: 0,
    fixationRate: 0,
    granulation: 0,
    paperRoughness: 0,
    edgeDarkening: 0,
    pigmentDiffusion: 0.2,
    waterDiffusion: 0,
    inkColor: recipe.inkColor,
    spectralAbsorption: recipe.material.spectralAbsorption,
  });
  if (!created.ok) throw new Error(created.reason);
  return created.value;
}

describe("ink-wash feel on the shipped Studio wet-ink path", () => {
  it("does not advect or bleed pigment on dry paper", () => {
    const field = inkWashField();
    const deposited = depositStudioWetInkStroke(field, {
      samples: [{ x: 8, y: 10, timeMs: 0, pressure: 1 }],
      radius: 2,
      hardness: 1,
      spacing: 1,
      waterLoad: 0,
      pigmentLoad: 1,
      wetnessLoad: 0,
    });
    expect(deposited.ok).toBe(true);
    const beforeFar = readStudioWetInkCell(field, 20, 10);
    expect(beforeFar?.pigment ?? 0).toBe(0);
    expect(simulateStudioWetInkField(field, 12).ok).toBe(true);
    const afterFar = readStudioWetInkCell(field, 20, 10);
    expect(afterFar?.pigment ?? 0).toBe(0);
    expect(afterFar?.pigmentOpticalDensity[0] ?? 0).toBe(0);
    expect(afterFar?.pigmentOpticalDensity[2] ?? 0).toBe(0);
  });

  it("moves pigment when the paper is wet", () => {
    const field = inkWashField();
    const deposited = depositStudioWetInkStroke(field, {
      samples: [{ x: 8, y: 10, timeMs: 0, pressure: 1 }],
      radius: 2,
      hardness: 1,
      spacing: 1,
      waterLoad: 1.2,
      pigmentLoad: 1,
      wetnessLoad: 1,
    });
    expect(deposited.ok).toBe(true);
    const originBefore = readStudioWetInkCell(field, 8, 10)!;
    expect(simulateStudioWetInkField(field, 10).ok).toBe(true);
    const originAfter = readStudioWetInkCell(field, 8, 10)!;
    const neighbor = readStudioWetInkCell(field, 11, 10)!;
    expect(neighbor.pigment + neighbor.stain).toBeGreaterThan(0);
    expect(originAfter.pigment).toBeLessThan(originBefore.pigment);
  });

  it("deepens overlapping wet deposits as optical density, not gray-mud alpha-over", () => {
    const field = inkWashField();
    const dab = {
      samples: [{ x: 10, y: 10, timeMs: 0, pressure: 1 }],
      radius: 3,
      hardness: 1,
      spacing: 1,
      waterLoad: 0.8,
      pigmentLoad: 0.9,
      wetnessLoad: 0.9,
    };
    expect(depositStudioWetInkStroke(field, dab).ok).toBe(true);
    const once = readStudioWetInkCell(field, 10, 10)!;
    expect(depositStudioWetInkStroke(field, dab).ok).toBe(true);
    const twice = readStudioWetInkCell(field, 10, 10)!;
    expect(twice.pigmentOpticalDensity[0]).toBeGreaterThan(once.pigmentOpticalDensity[0] * 1.6);
    const reflectanceOnce = Math.exp(-once.pigmentOpticalDensity[0]);
    const reflectanceTwice = Math.exp(-twice.pigmentOpticalDensity[0]);
    expect(reflectanceTwice).toBeLessThan(reflectanceOnce);
    expect(reflectanceTwice).toBeLessThan(0.5);
  });

  it("lets red-absorbing dye outrun blue-absorbing dye on wet ink-wash paper", () => {
    const field = inkWashField();
    expect(depositStudioWetInkStroke(field, {
      samples: [{ x: 8, y: 10, timeMs: 0, pressure: 1 }],
      radius: 2.2,
      hardness: 1,
      spacing: 1,
      waterLoad: 1.3,
      pigmentLoad: 1.2,
      wetnessLoad: 1,
    }).ok).toBe(true);
    expect(simulateStudioWetInkField(field, 12).ok).toBe(true);
    const neighbor = readStudioWetInkCell(field, 12, 10)!;
    expect(neighbor.pigmentOpticalDensity[0]).toBeGreaterThan(neighbor.pigmentOpticalDensity[2]);
    const uploads = planStudioWetInkTileUploads(field);
    expect(uploads.ok).toBe(true);
    if (!uploads.ok) return;
    expect(uploads.value.some((tile) => tile.rgba.some((byte) => byte > 0))).toBe(true);
  });

  it("replays the Studio ink-wash planner twice with identical bytes", () => {
    const element = inkWashStroke();
    const first = planStudioWetInkBrushReplay(element, { phase: "committed" });
    const second = planStudioWetInkBrushReplay(element, { phase: "committed" });
    if (!first.ok || !second.ok) throw new Error("ink-wash planner rejected");
    expect(second.value.fieldDigest).toBe(first.value.fieldDigest);
    expect(second.value.uploads.length).toBe(first.value.uploads.length);
    for (let index = 0; index < first.value.uploads.length; index += 1) {
      expect(Array.from(second.value.uploads[index]!.rgba)).toEqual(
        Array.from(first.value.uploads[index]!.rgba),
      );
    }
    expect(first.value.brushId).toBe("ink-wash");
    expect(first.value.simulationSteps).toBeGreaterThan(0);
  });
});
