import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_VIRTUAL_ART_STYLE,
  STUDIO_VIRTUAL_ART_STYLES,
  STUDIO_VIRTUAL_ART_STYLE_KEYS,
  isStudioVirtualArtStyleKey,
  studioVirtualArtStyle,
} from "./studio-virtual-space-art-style";

describe("Virtual Studio art direction", () => {
  it("keeps stable style keys with a valid default", () => {
    expect(STUDIO_VIRTUAL_ART_STYLE_KEYS).toEqual(["webtoon", "retro", "pastel", "ink", "neon"]);
    expect(isStudioVirtualArtStyleKey(DEFAULT_STUDIO_VIRTUAL_ART_STYLE)).toBe(true);
    expect(STUDIO_VIRTUAL_ART_STYLES.map((style) => style.key)).toEqual(STUDIO_VIRTUAL_ART_STYLE_KEYS);
  });

  it("provides a complete palette and distinguishes pixel rendering", () => {
    const retro = studioVirtualArtStyle("retro");
    const webtoon = studioVirtualArtStyle("webtoon");
    expect(retro.pixelated).toBe(true);
    expect(webtoon.pixelated).toBe(false);
    for (const style of STUDIO_VIRTUAL_ART_STYLES) {
      expect(Object.keys(style.palette).sort()).toEqual([
        "accent", "background", "floor", "floorAlt", "furniture", "gate", "line", "path", "plant", "room", "wall",
      ]);
      expect(Object.values(style.palette).every((value) => Number.isInteger(value) && value >= 0 && value <= 0xffffff)).toBe(true);
    }
  });
});
