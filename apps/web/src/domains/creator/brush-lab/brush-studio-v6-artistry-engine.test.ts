import { describe, expect, it } from "vitest";
import { BRUSH_STUDIO_V6_ARTISTRY_TOPOLOGIES } from "./brush-studio-v6-artistry-catalog";
import { createBrushStudioV6Program } from "./brush-studio-v6-engine";
import { createBrushStudioV6MaterialStroke } from "./brush-studio-v6-material-engine";
import { createBrushStudioV6TopologyStroke, type BrushTopologyPrimitive } from "./brush-studio-v6-topology-engine";
import { brushStudioV6TopologyStep } from "./brush-studio-v6-topology-material";

const recipes = BRUSH_STUDIO_V6_ARTISTRY_TOPOLOGIES.map((entry) => entry.recipeId);
describe("artistry geometry budgets", () => {
  it.each(recipes)("%s never exceeds its declared primitive budget at extreme controls", (id) => {
    const base = createBrushStudioV6Program(id);
    for (const scale of [0.1, 4]) {
      const program = { ...base, tuning: { ...base.tuning, size: 240, patternScale: scale,
        particleCount: 4096, bristleStrands: 128, patternDensity: 1, patternJitter: 1, relief: 1 } };
      const stroke = createBrushStudioV6TopologyStroke(program, brushStudioV6TopologyStep(program, 1))!;
      expect(stroke.retainedStateBytes).toBeLessThanOrEqual(1024);
      for (let index = 0; index < 140; index++) {
        const marks: BrushTopologyPrimitive[] = [];
        stroke.deposit({ x: index * 3, y: Math.sin(index / 8) * 20, radius: 120,
          pressure: 0.9, direction: index / 30, index, directional: index > 0, discontinuity: false }, (mark) => marks.push(mark));
        expect(marks.length).toBeLessThanOrEqual(stroke.maxPrimitivesPerDab);
        expect(marks.every((mark) => [mark.x, mark.y, mark.radiusX, mark.radiusY, mark.angle, mark.opacity].every(Number.isFinite))).toBe(true);
      }
    }
  });
  it.each(recipes)("%s does not classify normal coalesced input as a sparse teleport", (id) => {
    const base = createBrushStudioV6Program(id);
    const program = { ...base, slots: { ...base.slots, deposition: "deposit-wet", finish: ["finish-neon"] } };
    const stroke = createBrushStudioV6MaterialStroke(program);
    for (let i = 0; i <= 120; i++) stroke.push({ x: i * 15, y: 50 + Math.sin(i / 8) * 15, pressure: 0.65 });
    expect(stroke.statistics().clippedDabs).toBe(0);
    expect(stroke.statistics().emittedMarks).toBeGreaterThan(0);
  });
  it("streams long scale strokes without growing the per-input allocation", () => {
    const stroke = createBrushStudioV6MaterialStroke(createBrushStudioV6Program("scalloped-scales"));
    let maximum = 0;
    for (let i = 0; i < 10000; i++) {
      const marks = stroke.push({ x: i * 2, y: 60 + Math.sin(i / 10) * 10, pressure: 0.7 });
      maximum = Math.max(maximum, marks.length);
    }
    expect(stroke.statistics().clippedDabs).toBe(0);
    expect(maximum).toBeLessThanOrEqual(120);
    expect(stroke.statistics().emittedMarks).toBeGreaterThan(10000);
  });
});
