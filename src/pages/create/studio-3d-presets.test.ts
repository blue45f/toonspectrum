import { describe, expect, it } from "vitest";

import { CHARACTER_PRESETS } from "./studio-3d-presets";

describe("3D studio character presets", () => {
  it("covers twelve anime and webtoon genre archetypes", () => {
    expect(CHARACTER_PRESETS).toHaveLength(12);
    expect(CHARACTER_PRESETS.map((preset) => preset.archetype)).toEqual([
      "knight",
      "mage",
      "wuxia",
      "student",
      "office",
      "hoodie",
      "cheer",
      "villain",
      "maid",
      "ninja",
      "princess",
      "robot",
    ]);
  });

  it("includes simple genre props where the poser can render them", () => {
    const props = new Set(CHARACTER_PRESETS.map((preset) => preset.prop));

    expect(Array.from(props)).toEqual(expect.arrayContaining(["cape", "wizardHat", "headband", "swordBack"]));
  });
});
