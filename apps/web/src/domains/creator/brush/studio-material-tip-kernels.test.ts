import { describe, expect, it } from "vitest";

import atlas from "./studio-material-tip-atlas.generated.json";
import {
  createStudioMaterialTipField,
  isStudioMaterialTipProgram,
  materializeStudioMaterialTipBytes,
  STUDIO_MATERIAL_TIP_PROGRAMS,
  studioMaterialIdentitySeed,
} from "./studio-material-tip-kernels";
import { decodeStudioBrushTipAlphaMapBase64 } from "./studio-brush-tip-stamp";

const maps = STUDIO_MATERIAL_TIP_PROGRAMS.map((program) => ({
  program,
  bytes: decodeStudioBrushTipAlphaMapBase64(atlas[program])!,
}));

describe("original material morphology atlas", () => {
  it("has 47 programs with exactly one independently compiled field per identity", () => {
    expect(STUDIO_MATERIAL_TIP_PROGRAMS).toHaveLength(47);
    expect(new Set(STUDIO_MATERIAL_TIP_PROGRAMS).size).toBe(47);
    expect(Object.keys(atlas)).toEqual([...STUDIO_MATERIAL_TIP_PROGRAMS]);
    expect(isStudioMaterialTipProgram("invented-morphology")).toBe(false);
    expect(isStudioMaterialTipProgram(null)).toBe(false);
  });

  it.each(STUDIO_MATERIAL_TIP_PROGRAMS)("reproduces checked-in %s R8 bytes from source without assets", (program) => {
    const seed = studioMaterialIdentitySeed(`material-${program}`);
    const bytes = materializeStudioMaterialTipBytes(program, 64, seed);
    expect(bytes).toEqual(decodeStudioBrushTipAlphaMapBase64(atlas[program]));
    expect(bytes).toHaveLength(4096);
    expect(Math.max(...bytes)).toBeGreaterThan(115);
    expect(bytes.some((value) => value === 0)).toBe(true);
    expect(new Set(bytes).size).toBeGreaterThan(20);
    bytes.fill(0);
    expect(materializeStudioMaterialTipBytes(program, 64, seed).some((value) => value > 0)).toBe(true);
    const field = createStudioMaterialTipField(program, seed);
    for (const [x, y] of [[Number.NaN, 0], [0, Number.POSITIVE_INFINITY], [10, 0], [0, -10]]) {
      expect(field(x!, y!)).toBe(0);
    }
  });

  it("rejects near-duplicate morphology after opacity normalization, not just different ids/seeds", () => {
    // Equal physical tip size and equal total alpha: changing only opacity cannot pass this gate.
    // Total variation compares coverage placement. It is not a claim about artistic preference.
    for (let i = 0; i < maps.length; i++) {
      const a = maps[i]!;
      const massA = a.bytes.reduce((sum, value) => sum + value, 0);
      for (let j = 0; j < i; j++) {
        const b = maps[j]!;
        const massB = b.bytes.reduce((sum, value) => sum + value, 0);
        let distance = 0;
        for (let pixel = 0; pixel < a.bytes.length; pixel++) {
          distance += Math.abs(a.bytes[pixel]! / massA - b.bytes[pixel]! / massB) / 2;
        }
        expect(distance, `${a.program} / ${b.program}: duplicate spatial coverage`).toBeGreaterThan(0.18);
      }
    }
  });
});
