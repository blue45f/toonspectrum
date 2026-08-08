import { describe, expect, it } from "vitest";

import { STUDIO_LIVING_INK_FLUID_DEFAULTS } from "./studio-living-ink-execution-protocol";
import {
  listStudioLivingInkWgslPassSources,
  studioLivingInkWgslPassIsCoarse,
  studioLivingInkWgslSourceForPass,
  STUDIO_LIVING_INK_WGSL_COARSE_PASSES,
  STUDIO_LIVING_INK_WGSL_LEGACY_PASS_ORDER,
  STUDIO_LIVING_INK_WGSL_PASS_ORDER,
  STUDIO_LIVING_INK_WGSL_SHADER_REVISION,
  STUDIO_LIVING_INK_WGSL_UNIFORM_WORDS,
  writeStudioLivingInkFieldUniforms,
} from "./studio-living-ink-wgsl-shaders";

describe("studio-living-ink-wgsl-shaders", () => {
  it("ships a complete pure WGSL field pass set", () => {
    expect(STUDIO_LIVING_INK_WGSL_SHADER_REVISION).toContain("wgsl");
    // v1 contract, preserved: the original six passes are all still shipped, in the same relative
    // order. v2 interleaves the fluid passes between them rather than replacing any of them.
    expect(
      STUDIO_LIVING_INK_WGSL_PASS_ORDER.filter((pass) =>
        (STUDIO_LIVING_INK_WGSL_LEGACY_PASS_ORDER as readonly string[]).includes(pass),
      ),
    ).toEqual([...STUDIO_LIVING_INK_WGSL_LEGACY_PASS_ORDER]);
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

  it("ships the incompressibility chain: divergence, Jacobi, gradient subtract", () => {
    for (const pass of ["divergence", "jacobi", "gradient"] as const) {
      expect(STUDIO_LIVING_INK_WGSL_PASS_ORDER).toContain(pass);
    }
    // Divergence must be the certified central difference and must land in the pressure cell's
    // source slot, otherwise the Jacobi sweep below relaxes against garbage.
    expect(studioLivingInkWgslSourceForPass("divergence"))
      .toContain("0.5 * (right - left + upper - lower)");
    // Poisson relaxation subtracts the source term; `+ c.y` here would grow divergence instead.
    expect(studioLivingInkWgslSourceForPass("jacobi"))
      .toContain("(l + r + d + uup - c.y) * 0.25");
    expect(studioLivingInkWgslSourceForPass("gradient"))
      .toContain("velocity[i].xy - 0.5 * vec2f(right - left, upper - lower)");
  });

  it("ships curl and vorticity confinement so washes keep their eddies", () => {
    const curl = studioLivingInkWgslSourceForPass("curl");
    expect(curl).toContain("0.5 * ((rightY - leftY) - (upperX - lowerX))");
    const vorticity = studioLivingInkWgslSourceForPass("vorticity");
    expect(vorticity).toContain("vec2f(upper - lower, right - left)");
    expect(vorticity).toContain("vec2f(ridge.x, -ridge.y) * centerCurl * u.vorticityStrength");
  });

  it("gates velocity and pigment mobility on wetness with smoothstep, not raw wetness", () => {
    expect(studioLivingInkWgslSourceForPass("advect-velocity"))
      .toContain("smoothstep(u.velocityWetGateMin, u.velocityWetGateMax, wetness)");
    for (const pass of ["pigment", "advect-pigment"] as const) {
      expect(studioLivingInkWgslSourceForPass(pass))
        .toContain("smoothstep(u.pigmentWetGateMin, u.pigmentWetGateMax,");
    }
  });

  it("runs velocity, pressure and curl on the coarse grid and pigment at full resolution", () => {
    for (const pass of STUDIO_LIVING_INK_WGSL_COARSE_PASSES) {
      expect(studioLivingInkWgslPassIsCoarse(pass)).toBe(true);
      expect(studioLivingInkWgslSourceForPass(pass)).toContain("u.coarseWidth");
    }
    for (const pass of ["splat", "wet", "advect-pigment", "pigment", "fix", "display"] as const) {
      expect(studioLivingInkWgslPassIsCoarse(pass)).toBe(false);
    }
    expect(listStudioLivingInkWgslPassSources().filter((pass) => pass.grid === "coarse"))
      .toHaveLength(STUDIO_LIVING_INK_WGSL_COARSE_PASSES.length);
  });

  it("emits WGSL float literals rather than bare integers for interpolated constants", () => {
    // `3` is an AbstractInt in WGSL and `3.0.0` is a syntax error; both are compile failures the
    // Node suite cannot see, because it never runs a WGSL compiler.
    for (const pass of listStudioLivingInkWgslPassSources()) {
      expect(pass.source).not.toMatch(/\d+\.\d+\.\d/);
    }
    expect(studioLivingInkWgslSourceForPass("wet")).toContain("u.capillaryCreep * 3.0");
  });

  it("packs field uniforms in the slot order the WGSL struct declares", () => {
    const uniforms = writeStudioLivingInkFieldUniforms({
      width: 512,
      height: 256,
      coarseWidth: 128,
      coarseHeight: 64,
      dt: 1 / 60,
      bleed: 0.5,
      dryRate: 0.25,
      chroma: [1.4, 1.1, 0.6],
      chromaticSeparation: 0.5,
      beerDensity: 0.8,
      fixTransfer: 0.18,
      flow: 0.7,
      vorticity: 0.2,
      capillaryCreep: 0.3,
      fixing: false,
    });
    expect(uniforms).toHaveLength(STUDIO_LIVING_INK_WGSL_UNIFORM_WORDS);
    const words = new Uint32Array(uniforms.buffer);
    expect(words[0]).toBe(512);
    expect(words[1]).toBe(256);
    expect(words[10]).toBe(128);
    expect(words[11]).toBe(64);
    expect(uniforms[14]).toBeCloseTo(STUDIO_LIVING_INK_FLUID_DEFAULTS.velocityWetGate.minimum, 6);
    expect(uniforms[17]).toBeCloseTo(STUDIO_LIVING_INK_FLUID_DEFAULTS.pigmentWetGate.maximum, 6);
    expect(uniforms[20]).toBeCloseTo(STUDIO_LIVING_INK_FLUID_DEFAULTS.velocityClamp, 6);
    // A fixation pass must damp the wash harder than a live stroke.
    const fixing = writeStudioLivingInkFieldUniforms({
      width: 512,
      height: 256,
      coarseWidth: 128,
      coarseHeight: 64,
      dt: 1 / 60,
      bleed: 0.5,
      dryRate: 0.25,
      chroma: [1.4, 1.1, 0.6],
      chromaticSeparation: 0.5,
      beerDensity: 0.8,
      fixTransfer: 0.18,
      flow: 0.7,
      vorticity: 0.2,
      capillaryCreep: 0.3,
      fixing: true,
    });
    expect(fixing[12]).toBeLessThan(uniforms[12]!);
    expect(fixing[18]).toBeLessThan(uniforms[18]!);
  });

  it("declares every uniform slot the kernels read", () => {
    const common = studioLivingInkWgslSourceForPass("advect-pigment");
    for (const field of [
      "coarseWidth",
      "coarseHeight",
      "velocityDamping",
      "vorticityStrength",
      "velocityWetGateMin",
      "pigmentWetGateMax",
      "evaporation",
      "capillaryCreep",
      "velocityClamp",
      "chromaticSeparation",
    ]) expect(common).toContain(`${field}:`);
  });
});
