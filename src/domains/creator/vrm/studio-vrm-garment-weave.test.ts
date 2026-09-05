import { describe, expect, it } from "vitest";

import { buildStudioVrmGarmentWeaveTile, sampleStudioVrmGarmentWeave, STUDIO_VRM_GARMENT_WEAVE_SIZE, studioVrmGarmentWeaveReliefM } from "./studio-vrm-garment-weave";
import { WARDROBE_FABRICS } from "./studio-vrm-wardrobe";

const fabrics = WARDROBE_FABRICS.filter((fabric) => fabric.weaveStrength > 0);

describe("close-up garment weave", () => {
  it.each(fabrics)("keeps value and slope continuous at repeat seams: $id", ({ id }) => {
    const sample = (u: number, v: number) => sampleStudioVrmGarmentWeave(id, u, v);
    const epsilon = 1e-5;
    for (const t of [0, 0.13, 0.5, 0.89, 1]) {
      expect(sample(0, t)).toBeCloseTo(sample(1, t), 10);
      expect(sample(t, 0)).toBeCloseTo(sample(t, 1), 10);
      const du = (u: number) => (sample(u + epsilon, t) - sample(u - epsilon, t)) / (2 * epsilon);
      const dv = (v: number) => (sample(t, v + epsilon) - sample(t, v - epsilon)) / (2 * epsilon);
      expect(du(0)).toBeCloseTo(du(1), 7);
      expect(dv(0)).toBeCloseTo(dv(1), 7);
    }
  });
  it.each(fabrics)("uses submillimetre relief and enough samples per cycle: $id", ({ id, weaveFrequency }) => {
    expect(studioVrmGarmentWeaveReliefM(id)).toBeGreaterThan(0);
    expect(studioVrmGarmentWeaveReliefM(id)).toBeLessThanOrEqual(0.0005);
    expect(STUDIO_VRM_GARMENT_WEAVE_SIZE / weaveFrequency).toBeGreaterThanOrEqual(12);
    const tile = buildStudioVrmGarmentWeaveTile(id)!;
    expect(tile.length).toBe(STUDIO_VRM_GARMENT_WEAVE_SIZE ** 2);
    expect(new Set(tile).size).toBeGreaterThan(50);
    expect(buildStudioVrmGarmentWeaveTile(id)).toEqual(tile);
  });
  it("does not allocate or add bump relief for metal", () => {
    expect(buildStudioVrmGarmentWeaveTile("steel")).toBeNull();
    expect(studioVrmGarmentWeaveReliefM("steel")).toBe(0);
  });
  it("guards invalid coordinates", () => {
    expect(sampleStudioVrmGarmentWeave("cotton", NaN, 0)).toBe(0.5);
    expect(sampleStudioVrmGarmentWeave("cotton", 0, Infinity)).toBe(0.5);
  });
});
