import { describe, expect, it } from "vitest";

import { CHARACTER_PSD_GROUP_NAMES } from "./character-shaper-psd-assembly";
import { createShaperCharacter, captureShaperCharacter } from "./character-shaper-grade";
import { captureShaperCharacterFromProduction } from "./character-shaper-grade-production-capture";

describe("character-shaper-grade-production-capture", () => {
  it("falls back to synthetic capture without a production raster", () => {
    const character = createShaperCharacter({});
    const synthetic = captureShaperCharacter(character, 48, 64);
    const fromMissing = captureShaperCharacterFromProduction(character, 48, 64, null);
    expect(fromMissing.width).toBe(synthetic.width);
    expect(fromMissing.height).toBe(synthetic.height);
    expect(fromMissing.beauty.length).toBe(synthetic.beauty.length);
  });

  it("packs a VRM beauty raster into semantic PSD layers with honest omissions", () => {
    const character = createShaperCharacter({});
    const width = 24;
    const height = 32;
    const beauty = new Uint8ClampedArray(width * height * 4);
    for (let y = 4; y < height - 4; y += 1) {
      for (let x = 6; x < width - 6; x += 1) {
        const i = (y * width + x) * 4;
        beauty[i] = 210;
        beauty[i + 1] = 170;
        beauty[i + 2] = 150;
        beauty[i + 3] = 255;
      }
    }
    const exported = captureShaperCharacterFromProduction(character, width, height, {
      width,
      height,
      beautyRgba: beauty,
    });
    expect(exported.beauty).toBe(beauty);
    expect(exported.layers.some((layer) => layer.name === "밑색-얼굴")).toBe(true);
    expect(exported.layers.some((layer) => layer.name === CHARACTER_PSD_GROUP_NAMES.line)).toBe(true);
    expect(exported.omissions.map((entry) => entry.name)).toEqual(
      expect.arrayContaining([
        CHARACTER_PSD_GROUP_NAMES.shadow,
        CHARACTER_PSD_GROUP_NAMES.highlight,
      ]),
    );
  });

  it("rejects mismatched raster dimensions and keeps synthetic output", () => {
    const character = createShaperCharacter({});
    const synthetic = captureShaperCharacter(character, 40, 50);
    const bad = captureShaperCharacterFromProduction(character, 40, 50, {
      width: 10,
      height: 10,
      beautyRgba: new Uint8ClampedArray(10 * 10 * 4),
    });
    expect(bad.beauty).toEqual(synthetic.beauty);
  });
});
