import { describe, expect, it } from "vitest";

import {
  listStudioLivingInkWgslPassSources,
  studioLivingInkWgslSourceForPass,
  STUDIO_LIVING_INK_WGSL_PASS_ORDER,
  STUDIO_LIVING_INK_WGSL_SHADER_REVISION,
} from "./studio-living-ink-wgsl-shaders";

describe("studio-living-ink-wgsl-shaders", () => {
  it("ships a complete pure WGSL field pass set", () => {
    expect(STUDIO_LIVING_INK_WGSL_SHADER_REVISION).toContain("wgsl");
    expect(STUDIO_LIVING_INK_WGSL_PASS_ORDER).toEqual([
      "clear",
      "splat",
      "jacobi",
      "pigment",
      "fix",
      "display",
    ]);
    for (const pass of listStudioLivingInkWgslPassSources()) {
      expect(pass.source).toContain("@compute");
      expect(pass.source).toContain("fn main");
      expect(pass.entryPoint).toBe("main");
      expect(studioLivingInkWgslSourceForPass(pass.id).length).toBeGreaterThan(80);
    }
  });

  it("embeds chromatography and beer-lambert knobs in field uniforms", () => {
    const pigment = studioLivingInkWgslSourceForPass("pigment");
    expect(pigment).toContain("chromaR");
    expect(pigment).toContain("bleed");
    const display = studioLivingInkWgslSourceForPass("display");
    expect(display).toContain("beerDensity");
    expect(display).toContain("exp(-od");
  });
});
