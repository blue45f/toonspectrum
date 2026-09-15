import { describe, expect, it } from "vitest";

import {
  BRUSH_STUDIO_V6_PIGMENT_PROVIDERS,
  BrushStudioV6PigmentProviderUnavailableError,
  brushStudioV6PigmentProviderForNode,
  createBrushStudioV6PigmentPalette,
  mixBrushStudioV6PigmentColors,
} from "./brush-studio-v6-pigment-provider";

describe("V6 pigment providers", () => {
  it("runs Mixbox 2 latent pigment mixing instead of RGB or spectral substitution", () => {
    const first = "#ffe000";
    const second = "#0050dc";
    const mixbox = mixBrushStudioV6PigmentColors(first, second, 0.5, "mixbox-js-v2");
    const rgb = mixBrushStudioV6PigmentColors(first, second, 0.5, "rgb-linear-v1");
    const spectral = mixBrushStudioV6PigmentColors(first, second, 0.5, "spectral-wgm-v1");
    expect(mixbox).not.toBe(rgb);
    expect(mixbox).not.toBe(spectral);
    const value = Number.parseInt(mixbox.slice(1), 16);
    const red = value >>> 16;
    const green = value >>> 8 & 0xff;
    const blue = value & 0xff;
    expect(green).toBeGreaterThan(red);
    expect(green).toBeGreaterThan(blue);
  });

  it("preserves exact endpoints and creates deterministic immutable latent palettes", () => {
    const palette = createBrushStudioV6PigmentPalette(
      "#f4d03f",
      "#2455d6",
      "mixbox-js-v2",
    );
    expect(palette).toHaveLength(33);
    expect(palette[0]).toBe("#f4d03f");
    expect(palette.at(-1)).toBe("#2455d6");
    expect(Object.isFrozen(palette)).toBe(true);
    expect(createBrushStudioV6PigmentPalette(
      "#f4d03f",
      "#2455d6",
      "mixbox-js-v2",
    )).toEqual(palette);
  });

  it("keeps provider identities explicit and fails closed for unknown pigment nodes", () => {
    expect(new Set(BRUSH_STUDIO_V6_PIGMENT_PROVIDERS.map((entry) => entry.id)).size)
      .toBe(BRUSH_STUDIO_V6_PIGMENT_PROVIDERS.length);
    expect(brushStudioV6PigmentProviderForNode("pigment-mixbox")).toMatchObject({
      id: "mixbox-js-v2",
      version: "2.0.0",
      rights: "noncommercial",
      execution: "native",
    });
    expect(brushStudioV6PigmentProviderForNode("pigment-unknown")).toBeNull();
    expect(() => createBrushStudioV6PigmentPalette(
      "#000000",
      "#ffffff",
      "unknown-provider" as never,
    )).toThrow(BrushStudioV6PigmentProviderUnavailableError);
  });
});
