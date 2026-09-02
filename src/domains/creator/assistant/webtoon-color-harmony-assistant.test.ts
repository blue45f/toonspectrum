import { describe, expect, it } from "vitest";

import {
  WebtoonColorHarmonyAssistant,
  WEBTOON_SKIN_PALETTES,
  SCENE_MOOD_PALETTES,
} from "./webtoon-color-harmony-assistant";

describe("WebtoonColorHarmonyAssistant", () => {
  const assistant = new WebtoonColorHarmonyAssistant();

  it("contains 5 distinct character skin tone palettes", () => {
    expect(Object.keys(WEBTOON_SKIN_PALETTES).length).toBe(5);

    const warmFair = assistant.getSkinPalette("warm-fair");
    expect(warmFair.base).toBe("#ffedd5");
    expect(warmFair.shadow1).toBe("#fbcfe8");
    expect(warmFair.blushTint).toBe("#fb7185");

    const coolPale = assistant.getSkinPalette("cool-pale");
    expect(coolPale.base).toBe("#f1f5f9");
    expect(coolPale.shadow2).toBe("#94a3b8");
  });

  it("provides 4 lighting scene mood presets", () => {
    expect(SCENE_MOOD_PALETTES.length).toBe(4);
    const ids = SCENE_MOOD_PALETTES.map((s) => s.id);
    expect(ids).toContain("romance-golden-sunset");
    expect(ids).toContain("fresh-academy-sky");
    expect(ids).toContain("dark-fantasy-noir");
    expect(ids).toContain("cyberpunk-neon-night");
  });

  it("generates natural hue-shifted shadows without crashing", () => {
    // Test with typical skin base color #fde047 or #ffedd5
    const shadows = assistant.generateHueShiftShadow("#ffedd5");

    expect(shadows.shadow1).toMatch(/^#[0-9a-f]{6}$/i);
    expect(shadows.shadow2).toMatch(/^#[0-9a-f]{6}$/i);
    expect(shadows.highlight).toMatch(/^#[0-9a-f]{6}$/i);

    // Shadows must not be equal to base color
    expect(shadows.shadow1.toLowerCase()).not.toBe("#ffedd5");
    expect(shadows.shadow2.toLowerCase()).not.toBe("#ffedd5");
  });
});
