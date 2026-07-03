import { describe, expect, it } from "vitest";

import { BG_SKY_PRESETS, DEFAULT_SKY_PRESET_ID, getSkyPreset } from "./studio-background-3d-sky";

describe("studio-background-3d-sky", () => {
  it("has at least one preset with unique ids", () => {
    expect(BG_SKY_PRESETS.length).toBeGreaterThan(0);
    const ids = new Set(BG_SKY_PRESETS.map((p) => p.id));
    expect(ids.size).toBe(BG_SKY_PRESETS.length);
  });

  it("DEFAULT_SKY_PRESET_ID resolves to a real entry", () => {
    const preset = getSkyPreset(DEFAULT_SKY_PRESET_ID);
    expect(preset.id).toBe(DEFAULT_SKY_PRESET_ID);
    expect(BG_SKY_PRESETS.some((p) => p.id === DEFAULT_SKY_PRESET_ID)).toBe(true);
  });

  it("getSkyPreset falls back to BG_SKY_PRESETS[0] for an unknown id", () => {
    expect(getSkyPreset("bogus")).toBe(BG_SKY_PRESETS[0]);
  });
});
