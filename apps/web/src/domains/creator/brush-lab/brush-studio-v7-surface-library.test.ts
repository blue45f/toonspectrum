import { describe, expect, it } from "vitest";
import { BRUSH_STUDIO_V6_RECIPES, createBrushStudioV6Program } from "./brush-studio-v6-engine";
import { brushStudioV6MaterialNodeExecution, createBrushStudioV6MaterialStroke, sampleBrushStudioV6PaperContact } from "./brush-studio-v6-material-engine";
import { BRUSH_STUDIO_V7_ADVANCED_SURFACES, sampleBrushStudioV7SurfaceContact } from "./brush-studio-v7-surface-library";

const LEGACY_SURFACES = ["surface-smooth", "surface-kent", "surface-coldpress", "surface-printmaking", "surface-linen", "surface-porous"] as const;
function legacyNoise(x: number, y: number, seed: number): number {
  let value = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}
function legacyField(x: number, y: number, seed: number, scaleX: number, scaleY: number, salt: number): number {
  const px = x / scaleX, py = y / scaleY, ix = Math.floor(px), iy = Math.floor(py);
  const tx = px - ix, ty = py - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const top = legacyNoise(ix, iy, seed ^ salt) * (1 - sx) + legacyNoise(ix + 1, iy, seed ^ salt) * sx;
  const bottom = legacyNoise(ix, iy + 1, seed ^ salt) * (1 - sx) + legacyNoise(ix + 1, iy + 1, seed ^ salt) * sx;
  return top * (1 - sy) + bottom * sy;
}
const unit = (value: number): number => Math.max(0, Math.min(1, value));
function legacyPaper(surface: string, x: number, y: number, seed: number): number {
  const field = (sx: number, sy: number, salt: number) => legacyField(x, y, seed, sx, sy, salt);
  if (surface === "surface-smooth") return 0.08;
  if (surface === "surface-linen") {
    const warp = Math.pow(0.5 + Math.sin(x * Math.PI * 2 / 7) * 0.5, 4);
    const weft = Math.pow(0.5 + Math.sin(y * Math.PI * 2 / 6) * 0.5, 4);
    return unit(0.1 + Math.max(warp, weft) * 0.7 + field(1, 1, 13) * 0.2);
  }
  if (surface === "surface-coldpress") return unit(field(9, 9, 17) * 0.75 + field(1.3, 1.3, 29) * 0.25);
  if (surface === "surface-porous") return unit(field(14, 1.4, 37) * 0.8 + field(2, 2, 41) * 0.2);
  if (surface === "surface-printmaking") return unit(field(3, 5, 43) * 0.55 + field(0.65, 0.65, 47) * 0.45);
  return unit(0.15 + field(1.4, 1.4, 53) * 0.6 + field(11, 0.8, 59) * 0.2);
}

function renderSurface(surface: string, wet: boolean): string {
  const base = createBrushStudioV6Program(wet ? "v7-rough-mineral-watercolor" : "v7-sanded-soft-pastel");
  const program = { ...base, slots: { ...base.slots, surface } };
  const stroke = createBrushStudioV6MaterialStroke(program);
  const marks = Array.from({ length: 32 }, (_, index) => ({
    x: index * 5, y: 30 + Math.sin(index / 4) * 8, pressure: 0.72, tilt: 0.35, twist: 16,
  })).flatMap((point) => stroke.push(point));
  return marks.slice(0, 180).map((mark) => [mark.kind, mark.shape,
    mark.radiusX.toFixed(3), mark.radiusY.toFixed(3), mark.angle.toFixed(3), mark.opacity.toFixed(4)].join(":" )).join("|");
}
describe("Brush Studio V7 material surfaces", () => {
  it("registers twelve native, uniquely named surface materials and twenty-four signature recipes", () => {
    expect(BRUSH_STUDIO_V7_ADVANCED_SURFACES).toHaveLength(12);
    expect(new Set(BRUSH_STUDIO_V7_ADVANCED_SURFACES.map((entry) => entry.id)).size).toBe(12);
    expect(BRUSH_STUDIO_V7_ADVANCED_SURFACES.every((entry) => brushStudioV6MaterialNodeExecution(entry.id) === "native")).toBe(true);
    expect(BRUSH_STUDIO_V6_RECIPES.filter((entry) => entry.id.startsWith("v7-"))).toHaveLength(24);
  });

  it("preserves the scalar tooth field of every legacy surface", () => {
    for (const surface of LEGACY_SURFACES) {
      for (let index = 0; index < 40; index++) {
        const x = index * 3.17 - 27.4, y = Math.sin(index * 0.37) * 51.2;
        expect(sampleBrushStudioV6PaperContact(surface, x, y, 20260918), `${surface}@${index}`)
          .toBeCloseTo(legacyPaper(surface, x, y, 20260918), 14);
      }
    }
  });

  it("keeps every V7 material channel deterministic, finite and bounded", () => {
    for (const surface of BRUSH_STUDIO_V7_ADVANCED_SURFACES) {
      for (let index = 0; index < 50; index++) {
        const sample = sampleBrushStudioV7SurfaceContact(surface.id, index * 2.3, index * -1.7, 73421);
        expect(sample).toEqual(sampleBrushStudioV7SurfaceContact(surface.id, index * 2.3, index * -1.7, 73421));
        expect([sample.tooth, sample.localAbsorbency, sample.anisotropy].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
        expect(Number.isFinite(sample.fiberAngle)).toBe(true);
      }
    }
  });
  it("gives all twelve surfaces distinct spatial material signatures", () => {
    const signatures = BRUSH_STUDIO_V7_ADVANCED_SURFACES.map((surface) =>
      Array.from({ length: 36 }, (_, index) => {
        const value = sampleBrushStudioV7SurfaceContact(surface.id, index * 4.1, (index % 7) * 8.7, 99173);
        return [value.tooth, value.localAbsorbency, value.fiberAngle, value.anisotropy]
          .map((entry) => entry.toFixed(5)).join(",");
      }).join("|"));
    expect(new Set(signatures).size).toBe(BRUSH_STUDIO_V7_ADVANCED_SURFACES.length);
  });

  it("changes actual dry and wet contact geometry across V7 materials", () => {
    const dry = BRUSH_STUDIO_V7_ADVANCED_SURFACES.map((surface) => renderSurface(surface.id, false));
    const wet = BRUSH_STUDIO_V7_ADVANCED_SURFACES.map((surface) => renderSurface(surface.id, true));
    expect(new Set(dry).size).toBeGreaterThanOrEqual(10);
    expect(new Set(wet).size).toBe(BRUSH_STUDIO_V7_ADVANCED_SURFACES.length);
  });
});