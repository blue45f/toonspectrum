import { describe, expect, it } from "vitest";
import spectral from "spectral.js";
import colorMix from "colormix/dist/index.mjs";

import {
  createExternalPigmentPalette, EXTERNAL_PIGMENT_PROVIDERS,
  prepareExternalPigmentPair, simulatePigmentLayer,
} from "./external-pigments";
import { createBrushStudioV6PigmentPalette, mixBrushStudioV6PigmentColors } from "../brush-studio-v6-pigment-provider";

const a = "#002185", b = "#fcd200";

describe("pinned real external pigment providers", () => {
  it("executes Spectral.js 3.0's effective-concentration model, not legacy WGM", () => {
    const expected = spectral.mix([new spectral.Color(a), 0.5], [new spectral.Color(b), 0.5]).toString().toLowerCase();
    const actual = prepareExternalPigmentPair(a, b, "spectral-js-v3")(0.5);
    expect(actual).toBe(expected);
    expect(actual).toBe("#3d933e");
    expect(actual).not.toBe(mixBrushStudioV6PigmentColors(a, b, 0.5, "spectral-wgm-v1"));
  });
  it("uses actual ColorMix Lab interpolation without mutating its global gradient", () => {
    const expected = colorMix.mix([new colorMix.Color(a), new colorMix.Color(b)], [50, 50]).toString("hex").toLowerCase();
    expect(prepareExternalPigmentPair(a, b, "colormix-lab-v3")(0.5)).toBe(expected);
    const mix = prepareExternalPigmentPair(a, b, "colormix-lab-v3");
    for (let i = 0; i < 1000; i += 1) expect(mix(i / 999)).toMatch(/^#[0-9a-f]{6}$/u);
  });
  it("matches independently calculated open-km opaque K/S mixing on reconstructed spectra", () => {
    const left = new spectral.Color(a).KS, right = new spectral.Color(b).KS;
    const r = left.map((k, i) => {
      const ratio = 0.75 * k + 0.25 * right[i]!;
      return 1 + ratio - Math.sqrt(ratio * ratio + 2 * ratio);
    });
    const expected = new spectral.Color(r).toString({ method: "map" }).toLowerCase();
    expect(prepareExternalPigmentPair(a, b, "open-km-spectral-v1")(0.25)).toBe(expected);
    expect(prepareExternalPigmentPair(a, b, "open-km-spectral-v1")(0.5))
      .not.toBe(prepareExternalPigmentPair(a, b, "spectral-js-v3")(0.5));
  });
  for (const provider of EXTERNAL_PIGMENT_PROVIDERS) {
    it(`${provider.id}: preserves endpoints, determinism and immutable palette identity`, () => {
      const palette = createBrushStudioV6PigmentPalette(a, b, provider.id);
      expect(palette).toHaveLength(33);
      expect(palette[0]).toBe(a);
      expect(palette.at(-1)).toBe(b);
      expect(Object.isFrozen(palette)).toBe(true);
      expect(palette.every((hex) => /^#[0-9a-f]{6}$/u.test(hex))).toBe(true);
      expect(createExternalPigmentPalette(a, b, provider.id)).toEqual(palette);
      expect(createExternalPigmentPalette(a, a, provider.id)).toEqual(Array(33).fill(a));
      expect(() => createExternalPigmentPalette(a, b, provider.id, NaN)).toThrow();
      expect(() => prepareExternalPigmentPair(a, b, provider.id)(NaN)).toThrow();
    });
  }
  it("preserves saved legacy WGM ids and fails closed even at unknown-provider endpoints", () => {
    expect(createBrushStudioV6PigmentPalette(a, b, "ks-reference-wgm-v1"))
      .toEqual(createBrushStudioV6PigmentPalette(a, b, "spectral-wgm-v1"));
    for (const t of [0, 1]) expect(() => mixBrushStudioV6PigmentColors(a, b, t, "unknown" as never)).toThrow();
  });
  it("exposes finite-thickness/substrate optics without claiming physical pigment calibration", () => {
    expect(simulatePigmentLayer(a, "#faf3e0", 0)).toBe("#faf3e0");
    expect(simulatePigmentLayer(a, "#ffffff", 0.25)).not.toBe(simulatePigmentLayer(a, "#000000", 0.25));
    expect(simulatePigmentLayer(a, "#ffffff", 1e12)).toBe(simulatePigmentLayer(a, "#000000", 1e12));
    expect(() => simulatePigmentLayer(a, b, -1)).toThrow();
    expect(() => simulatePigmentLayer(a, b, 1, 0)).toThrow();
  });
});
