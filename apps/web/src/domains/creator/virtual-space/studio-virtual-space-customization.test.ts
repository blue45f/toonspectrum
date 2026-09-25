import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION,
  addStudioVirtualDecoration,
  parseStudioVirtualCharacterCustomization,
  parseStudioVirtualDecorationState,
  removeStudioVirtualDecoration,
  studioVirtualDecorationPreset,
} from "./studio-virtual-space-customization";

describe("Virtual Studio safe customization", () => {
  it("accepts only allowlisted cosmetic tokens", () => {
    expect(parseStudioVirtualCharacterCustomization(DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION))
      .toEqual(DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION);
    expect(parseStudioVirtualCharacterCustomization({ ...DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION, accessoryKey: "javascript:" }))
      .toBeNull();
  });

  it("creates bounded built-in decor presets without arbitrary assets", () => {
    for (const key of ["minimal", "creator-garden", "festival", "night-market"] as const) {
      const preset = studioVirtualDecorationPreset(key);
      expect(parseStudioVirtualDecorationState(preset)).toEqual(preset);
      expect(preset.placements.length).toBeLessThanOrEqual(36);
      expect(preset.placements.every((item) => item.x >= 16 && item.x <= 1264 && item.y >= 16 && item.y <= 944)).toBe(true);
    }
  });

  it("adds and removes a nearby decoration while preserving the bounded contract", () => {
    const base = studioVirtualDecorationPreset("minimal");
    const added = addStudioVirtualDecoration(base, "flower-bed", { x: 780, y: 700 });
    expect(added.placements).toHaveLength(1);
    expect(parseStudioVirtualDecorationState(added)).toEqual(added);
    expect(removeStudioVirtualDecoration(added, added.placements[0]!.id).placements).toEqual([]);
  });
});
