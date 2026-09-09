import { describe, expect, it } from "vitest";

import {
  applyStudioSoftProof,
  convertStudioRgbProfile,
  generateStudioPaletteHarmony,
  mergeStudioRecentColors,
  studioCmykToRgb,
  studioHslToRgb,
  studioRgbToCmyk,
  studioRgbToHsl,
  toneMapStudioHdr,
} from "./studio-soft-proofing";

describe("studio professional color management", () => {
  it("round-trips HSL and device CMYK controls", () => {
    const rgb = { r: 0.2, g: 0.55, b: 0.8 };
    const hslRoundTrip = studioHslToRgb(studioRgbToHsl(rgb));
    const cmykRoundTrip = studioCmykToRgb(studioRgbToCmyk(rgb));
    expect(hslRoundTrip.r).toBeCloseTo(rgb.r, 8);
    expect(hslRoundTrip.g).toBeCloseTo(rgb.g, 8);
    expect(hslRoundTrip.b).toBeCloseTo(rgb.b, 8);
    expect(cmykRoundTrip.r).toBeCloseTo(rgb.r, 8);
    expect(cmykRoundTrip.g).toBeCloseTo(rgb.g, 8);
    expect(cmykRoundTrip.b).toBeCloseTo(rgb.b, 8);
  });

  it("detects wide-gamut colors that cannot be represented in sRGB", () => {
    const result = convertStudioRgbProfile(
      { r: 0, g: 1, b: 0 },
      "display-p3",
      "srgb",
    );
    expect(result.outOfGamut).toBe(true);
    expect(result.rgb.g).toBeLessThanOrEqual(1);
  });

  it("preserves alpha, clears hidden RGB and marks gamut warnings", () => {
    const input = new Uint8ClampedArray([
      0, 255, 0, 255,
      255, 0, 0, 0,
    ]);
    const receipt = applyStudioSoftProof(input, {
      sourceProfile: "display-p3",
      targetProfile: "srgb",
      intent: "relative-colorimetric",
      showGamutWarning: true,
      gamutWarningRgb: { r: 1, g: 0, b: 1 },
      hdrToneMap: "clip",
    });
    expect(receipt.gamutWarningPixels).toBe(1);
    expect([...receipt.pixels.slice(0, 4)]).toEqual([255, 0, 255, 255]);
    expect([...receipt.pixels.slice(4, 8)]).toEqual([0, 0, 0, 0]);
  });

  it("provides bounded HDR mappings and deterministic harmonies", () => {
    expect(toneMapStudioHdr(4, "clip")).toBe(1);
    expect(toneMapStudioHdr(4, "reinhard")).toBe(0.8);
    expect(toneMapStudioHdr(4, "aces")).toBeGreaterThan(0.9);
    expect(generateStudioPaletteHarmony({ r: 1, g: 0, b: 0 }, "triadic")).toHaveLength(3);
  });

  it("merges persisted recent colors without reopening-state loss", () => {
    const merged = mergeStudioRecentColors(
      [{ hex: "#FF0000", usedAtMs: 10, profile: "srgb" }],
      [
        { hex: "#ff0000", usedAtMs: 30, profile: "srgb" },
        { hex: "#00ff00", usedAtMs: 20, profile: "display-p3" },
      ],
    );
    expect(merged).toEqual([
      { hex: "#ff0000", usedAtMs: 30, profile: "srgb" },
      { hex: "#00ff00", usedAtMs: 20, profile: "display-p3" },
    ]);
  });
});
