import { describe, expect, it } from "vitest";

import { BRUSH_STUDIO_V6_RECIPES, createBrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6ProductBrush, brushStudioV6ProductBrushHref } from "../brush-lab/brush-studio-v6-product-bridge";
import { normalizeBrushStudioV6MaterialConfig, createBrushStudioV6MaterialStroke, mapBrushStudioV6Pressure, mapBrushStudioV6Tilt } from "../brush-lab/brush-studio-v6-material-engine";
import { normalizeStudioBrushEngineProgramSet, studioBrushEngineProgramSetWithComposition, studioBrushEngineProgramSetWithoutComposition, studioBrushEngineProgramSetWithOil, studioBrushEngineProgramSetWithoutOil } from "./studio-brush-engine-program-set";
import { sanitizeBrushSnapshot } from "./studio-brush-library";
import { planStudioMaterialBrush, StudioMaterialBrushPlanner, studioMaterialBrushConfig, studioMaterialBrushBounds, studioMaterialBrushMarksToSvg, type StudioMaterialBrushElement } from "./studio-material-brush-runtime";

function stroke(recipe = "velvet-graphite"): StudioMaterialBrushElement {
  const brush = createBrushStudioV6ProductBrush(createBrushStudioV6Program(recipe));
  return {
    points: Array.from({ length: 30 }, (_, i) => [20 + i * 4, 40 + Math.sin(i / 4) * 15]).flat(),
    pressures: Array.from({ length: 30 }, (_, i) => 0.2 + 0.7 * Math.sin(i / 30 * Math.PI)),
    tiltXs: Array.from({ length: 30 }, () => 30),
    twists: Array.from({ length: 30 }, (_, i) => i * 2),
    stroke: brush.color,
    strokeWidth: brush.strokeWidth,
    opacity: 0.4,
    brushEnginePrograms: brush.enginePrograms!,
  };
}

describe("saved material brush rendering", () => {
  it("persists every editing recipe in the real brush library without dropping the material program", () => {
    for (const recipe of BRUSH_STUDIO_V6_RECIPES) {
      const saved = createBrushStudioV6ProductBrush(recipe.create());
      const reloaded = sanitizeBrushSnapshot(JSON.parse(JSON.stringify(saved))).snapshot;
      expect(reloaded.enginePrograms?.material, recipe.id).toEqual(saved.enginePrograms?.material);
      expect(planStudioMaterialBrush(stroke(recipe.id)).length, recipe.id).toBeGreaterThan(0);
    }
  });

  it("produces the identical contacts for incrementally accepted and reopened strokes", () => {
    for (const recipe of ["velvet-graphite", "oil-hair-mixer", "mineral-bloom", "document-halftone", "kaleido-swarm"]) {
      const source = stroke(recipe);
      const planner = new StudioMaterialBrushPlanner();
      const actual = [];
      for (let count = 1; count <= 30; count += 1) {
        actual.push(...planner.append({ ...source, points: source.points.slice(0, count * 2), pressures: source.pressures?.slice(0, count) }).marks);
      }
      expect(actual, recipe).toEqual(planStudioMaterialBrush(JSON.parse(JSON.stringify(source))));
      expect(planner.append(source, true)).toEqual({ reset: false, marks: [] });
    }
  });

  it("rebuilds corrected or retracted authoritative samples, including an interior-only change", () => {
    const source = stroke("oil-hair-mixer");
    const planner = new StudioMaterialBrushPlanner();
    planner.append(source);
    const points = [...source.points];
    points[8] = points[8]! + 20;
    const corrected = { ...source, points };
    const rebuilt = planner.append(corrected, true);
    expect(rebuilt.reset).toBe(true);
    expect(rebuilt.marks).toEqual(planStudioMaterialBrush(corrected));
    const shortened = { ...source, points: source.points.slice(0, 12) };
    expect(planner.append(shortened).marks).toEqual(planStudioMaterialBrush(shortened));
  });

  it("honors stroke color, size and opacity without mutating saved defaults", () => {
    const source = stroke("clean-ink");
    const saved = JSON.stringify(source.brushEnginePrograms);
    const base = planStudioMaterialBrush(source);
    const changed = planStudioMaterialBrush({ ...source, stroke: "#ff3322", strokeWidth: source.strokeWidth * 2, opacity: 0 });
    expect(changed.every((mark) => mark.opacity === 0)).toBe(true);
    expect(base.some((mark) => mark.opacity > 0)).toBe(true);
    expect(JSON.stringify(source.brushEnginePrograms)).toBe(saved);
  });

  it("rebuilds retained contacts after opacity or symmetry edits", () => {
    const source = stroke("clean-ink");
    const planner = new StudioMaterialBrushPlanner();
    planner.append(source);
    const faded = { ...source, opacity: 0.1 };
    const result = planner.append(faded);
    expect(result.reset).toBe(true);
    expect(result.marks).toEqual(planStudioMaterialBrush(faded));
    const reflected = { ...faded, symmetry: { type: "vertical" as const, centerX: 100, centerY: 0 } };
    expect(planner.append(reflected).reset).toBe(true);
  });

  it("uses the same pressure and tilt deadzone mapping as the editing pad", () => {
    const source = stroke("clean-ink");
    const one = { ...source, points: [20, 30], pressures: [0.45], tiltXs: [1], tiltYs: [1], twists: [12] };
    const config = studioMaterialBrushConfig(one)!;
    const reference = createBrushStudioV6MaterialStroke(config).push({ x: 20, y: 30, pressure: mapBrushStudioV6Pressure(0.45, config.input), tilt: mapBrushStudioV6Tilt(Math.sqrt(2), config.input), twist: 12 });
    expect(planStudioMaterialBrush(one)).toEqual(reference);
    expect(mapBrushStudioV6Tilt(Math.sqrt(2), config.input)).toBe(0);
  });

  it("mirrors the complete chisel contact rather than redrawing an unmirrored nib", () => {
    const source = { ...stroke("natural-calligraphy"), points: [20, 30], pressures: [0.7], twists: [0] };
    const symmetry = { type: "vertical" as const, centerX: 100, centerY: 0 };
    const marks = planStudioMaterialBrush(source);
    const svg = studioMaterialBrushMarksToSvg(marks, symmetry);
    expect(svg).toContain('matrix(-1 0 0 1 200 0)');
    expect(svg.match(/rotate\(45\)/gu)).toHaveLength(2);
    const baseBounds = studioMaterialBrushBounds(source)!;
    const mirroredBounds = studioMaterialBrushBounds({ ...source, symmetry })!;
    expect(mirroredBounds.x).toBeCloseTo(baseBounds.x, 8);
    expect(mirroredBounds.x + mirroredBounds.width).toBeCloseTo(200 - baseBounds.x, 8);
  });

  it("retains particle and wet fringe extents outside the nominal nib crop", () => {
    const source = { ...stroke("kaleido-swarm"), points: [200, 200], pressures: [1], tiltXs: [0], tiltYs: [0] };
    const bounds = studioMaterialBrushBounds(source)!;
    expect(bounds.width).toBeGreaterThan(source.strokeWidth);
    for (const mark of planStudioMaterialBrush(source)) {
      expect(mark.x).toBeGreaterThanOrEqual(bounds.x);
      expect(mark.x).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(mark.y).toBeGreaterThanOrEqual(bounds.y);
      expect(mark.y).toBeLessThanOrEqual(bounds.y + bounds.height);
    }
  });

  it("preserves material settings when legacy composition controls are changed or reset", () => {
    const original = stroke().brushEnginePrograms!;
    const composed = studioBrushEngineProgramSetWithComposition(original, { physics: "bristle-webgpu" });
    const oil = studioBrushEngineProgramSetWithOil(composed, { bristlePhysics: true, bristleLoadDynamics: true, impastoRelief: false });
    const result = studioBrushEngineProgramSetWithoutComposition(studioBrushEngineProgramSetWithoutOil(oil));
    expect(result).toEqual(original);
    expect(normalizeStudioBrushEngineProgramSet(JSON.parse(JSON.stringify(result)))).toEqual(original);
  });

  it("rejects malformed material payloads and keeps target manuscript context", () => {
    expect(normalizeBrushStudioV6MaterialConfig({ seed: 12, tuning: {}, slots: {}, input: {} })).toBeNull();
    expect(normalizeBrushStudioV6MaterialConfig({ ...stroke().brushEnginePrograms!.material, seed: Infinity })).toBeNull();
    expect(brushStudioV6ProductBrushHref("a&b", "work:my work")).toBe("/studio/work/my%20work/canvas?materialBrush=a%26b");
  });
});
