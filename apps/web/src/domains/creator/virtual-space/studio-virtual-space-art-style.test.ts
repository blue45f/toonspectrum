import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_VIRTUAL_ART_STYLE,
  STUDIO_VIRTUAL_ART_STYLES,
  STUDIO_VIRTUAL_ART_STYLE_KEYS,
  isStudioVirtualArtStyleKey,
  studioVirtualArtAssetUrl,
  studioVirtualArtStyle,
  studioVirtualArtTextureUrl,
} from "./studio-virtual-space-art-style";

describe("Virtual Studio art direction", () => {
  it("keeps stable style keys with the supplied floating-island direction as the default", () => {
    expect(STUDIO_VIRTUAL_ART_STYLE_KEYS).toEqual(["sky-island", "webtoon", "pastel", "retro", "ink", "neon"]);
    expect(DEFAULT_STUDIO_VIRTUAL_ART_STYLE).toBe("sky-island");
    expect(isStudioVirtualArtStyleKey(DEFAULT_STUDIO_VIRTUAL_ART_STYLE)).toBe(true);
    expect(STUDIO_VIRTUAL_ART_STYLES.map((style) => style.key)).toEqual(STUDIO_VIRTUAL_ART_STYLE_KEYS);
  });

  it("provides a complete palette and distinguishes architecture and pixel rendering", () => {
    const retro = studioVirtualArtStyle("retro");
    const webtoon = studioVirtualArtStyle("webtoon");
    const sky = studioVirtualArtStyle("sky-island");
    expect(retro.pixelated).toBe(true);
    expect(webtoon.pixelated).toBe(false);
    expect(sky.architectureEn).toContain("Floating-island");
    for (const style of STUDIO_VIRTUAL_ART_STYLES) {
      expect(Object.keys(style.palette).sort()).toEqual([
        "accent", "background", "floor", "floorAlt", "furniture", "gate", "line", "path", "plant", "room", "sky", "wall", "water",
      ]);
      expect(Object.values(style.palette).every((value) => Number.isInteger(value) && value >= 0 && value <= 0xffffff)).toBe(true);
    }
  });

  it("rewrites only approved Virtual Studio art and supplies style-specific tile textures", () => {
    expect(studioVirtualArtAssetUrl("retro", "/assets/virtual-studio/drawn-characters-v1/player-pink-walk-down.png"))
      .toBe("/assets/virtual-studio/style-packs/retro/drawn-characters-v1/player-pink-walk-down.webp");
    expect(studioVirtualArtAssetUrl("webtoon", "/assets/virtual-studio/drawn-characters-v1/player-pink-walk-down.png"))
      .toBe("/assets/virtual-studio/drawn-characters-v1/player-pink-walk-down.png");
    expect(studioVirtualArtAssetUrl("retro", "https://example.invalid/user-art.png"))
      .toBe("https://example.invalid/user-art.png");
    expect(studioVirtualArtTextureUrl("sky-island", "world-base"))
      .toBe("/assets/virtual-studio/style-packs/sky-island/tiles/world-base.webp");
    expect(studioVirtualArtTextureUrl("webtoon", "floor")).toBeNull();
  });
});
