import { describe, expect, it } from "vitest";

import {
  STUDIO_MANNEQUIN_BODY_PRESETS,
  clampStudioMannequinBodyParams,
} from "./studio-mannequin-model";

describe("Studio mannequin optional anatomy normalization", () => {
  it("preserves omitted anatomy fields on legacy presets", () => {
    const male = STUDIO_MANNEQUIN_BODY_PRESETS.male.params;
    const normalized = clampStudioMannequinBodyParams(male);

    expect(normalized).toEqual(male);
    expect(normalized).not.toHaveProperty("torsoDepth");
    expect(normalized).not.toHaveProperty("waistWidth");
    expect(normalized).not.toHaveProperty("limbThickness");
    expect(normalized).not.toHaveProperty("handScale");
    expect(normalized).not.toHaveProperty("footScale");
    expect(normalized).not.toHaveProperty("neckThickness");
  });

  it("defaults explicit invalid anatomy values without materializing unrelated optional fields", () => {
    const male = STUDIO_MANNEQUIN_BODY_PRESETS.male.params;
    const normalized = clampStudioMannequinBodyParams({
      ...male,
      torsoDepth: Number.NaN,
    });

    expect(normalized.torsoDepth).toBe(1);
    expect(normalized).not.toHaveProperty("waistWidth");
  });

  it("recovers non-object input to the complete safe default shape", () => {
    expect(clampStudioMannequinBodyParams(null)).toMatchObject({
      torsoDepth: 1,
      waistWidth: 1,
      limbThickness: 1,
      handScale: 1,
      footScale: 1,
      neckThickness: 1,
    });
  });
});
