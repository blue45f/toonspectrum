// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION,
  addStudioVirtualDecoration,
  parseStudioVirtualCharacterCustomization,
  parseStudioVirtualDecorationState,
  readStudioVirtualCharacterCustomization,
  readStudioVirtualDecorationState,
  removeStudioVirtualDecoration,
  studioVirtualDecorationPreset,
  writeStudioVirtualCharacterCustomization,
  writeStudioVirtualDecorationState,
} from "./studio-virtual-space-customization";

const CHARACTER_STORAGE_KEY = "toonspectrum:virtual-space-character-customization:v1";
const DECOR_STORAGE_KEY = "toonspectrum:virtual-space-decoration:v1";

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

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

  it("persists only validated customization under exact reviewed keys", () => {
    const character = {
      ...DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION,
      accessoryKey: "beret" as const,
      auraKey: "sparkle" as const,
      trailKey: "pixel" as const,
      nameplateKey: "sky" as const,
    };
    expect(writeStudioVirtualCharacterCustomization(character)).toBe(true);
    expect(JSON.parse(localStorage.getItem(CHARACTER_STORAGE_KEY)!)).toEqual(character);
    expect(readStudioVirtualCharacterCustomization()).toEqual(character);

    const decorations = studioVirtualDecorationPreset("festival");
    expect(writeStudioVirtualDecorationState(decorations)).toBe(true);
    expect(JSON.parse(localStorage.getItem(DECOR_STORAGE_KEY)!)).toEqual(decorations);
    expect(readStudioVirtualDecorationState()).toEqual(decorations);
  });

  it("rejects invalid writes and falls back from corrupt browser data", () => {
    const decorations = studioVirtualDecorationPreset("creator-garden");
    expect(writeStudioVirtualDecorationState(decorations)).toBe(true);
    const storedDecorations = localStorage.getItem(DECOR_STORAGE_KEY);
    const invalidDecorations = {
      ...decorations,
      placements: [{ ...decorations.placements[0], x: -1 }],
    } as unknown as Parameters<typeof writeStudioVirtualDecorationState>[0];
    expect(writeStudioVirtualDecorationState(invalidDecorations)).toBe(false);
    expect(localStorage.getItem(DECOR_STORAGE_KEY)).toBe(storedDecorations);

    localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify({
      ...DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION,
      accessoryKey: "javascript:",
    }));
    expect(readStudioVirtualCharacterCustomization()).toEqual(
      DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION,
    );

    localStorage.setItem(DECOR_STORAGE_KEY, "{");
    const fallback = readStudioVirtualDecorationState();
    expect(fallback.presetKey).toBe("creator-garden");
    expect(parseStudioVirtualDecorationState(fallback)).toEqual(fallback);
  });

  it("adds and removes a nearby decoration while preserving the bounded contract", () => {
    const base = studioVirtualDecorationPreset("minimal");
    const added = addStudioVirtualDecoration(base, "flower-bed", { x: 780, y: 700 });
    expect(added.placements).toHaveLength(1);
    expect(parseStudioVirtualDecorationState(added)).toEqual(added);
    expect(removeStudioVirtualDecoration(added, added.placements[0]!.id).placements).toEqual([]);
  });
});
