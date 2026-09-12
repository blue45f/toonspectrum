import { describe, expect, it } from "vitest";
import { BRUSH_STUDIO_V6_RECIPES, createBrushStudioV6Program, type BrushStudioV6Program, type BrushStudioV6Tuning } from "./brush-studio-v6-engine";
import { brushStudioV6MaterialActiveTuningKeys, brushStudioV6MaterialMarksToSvg, createBrushStudioV6MaterialStroke } from "./brush-studio-v6-material-engine";

const ranges: Partial<Record<keyof BrushStudioV6Tuning, readonly [number | string, number | string]>> = {
  size: [12, 64], opacity: [0.1, 0.9], flow: [0.1, 0.9], spacing: [0.06, 0.4],
  primaryColor: ["#102030", "#e09030"], secondaryColor: ["#e08020", "#2050e0"],
  surfaceTooth: [0, 1], friction: [0, 1], absorbency: [0, 1], granulation: [0, 1],
  edgeDarkening: [0, 1], pickup: [0, 1], reservoir: [0, 1], wetness: [0.1, 1],
  diffusion: [0, 1], viscosity: [0, 1], plasticity: [0, 1], gravity: [-1, 1],
  bristleStrands: [8, 128], particleCount: [90, 2700], reactionRate: [0, 1],
  patternDensity: [0, 1], patternScale: [0.3, 3], patternJitter: [0, 1], relief: [0, 1],
};

function exportedAppearance(program: BrushStudioV6Program): string {
  const stroke = createBrushStudioV6MaterialStroke(program);
  const marks = Array.from({ length: 25 }, (_, index) => ({
    x: 20 + index * 5, y: 70 + Math.sin(index / 5) * 24,
    pressure: 0.3 + index / 40, tilt: 0.3, twist: index * 3,
  })).flatMap((point) => stroke.push(point));
  // SVG contains actual painted geometry/color/alpha, excluding inert solver metadata like height.
  return brushStudioV6MaterialMarksToSvg(marks);
}

describe("material controls affect actual exported appearance", () => {
  it.each(BRUSH_STUDIO_V6_RECIPES.map((recipe) => recipe.id))("%s advertises only effective controls", (id) => {
    const base = createBrushStudioV6Program(id);
    const program = { ...base, tuning: { ...base.tuning, size: 36, opacity: 0.75, flow: 0.7, primaryColor: "#243c56", secondaryColor: "#c08030" } };
    const ineffective: string[] = [];
    for (const key of brushStudioV6MaterialActiveTuningKeys(program)) {
      const range = ranges[key];
      expect(range, `${id}: add an observable control range for ${key}`).toBeDefined();
      const low = exportedAppearance({ ...program, tuning: { ...program.tuning, [key]: range![0] } });
      const high = exportedAppearance({ ...program, tuning: { ...program.tuning, [key]: range![1] } });
      if (low === high) ineffective.push(key);
    }
    expect(ineffective, `${id}: advertised controls with identical exported appearance`).toEqual([]);
  });
});
