import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_HDRI_LIGHTING_PRESETS,
  getStudioBg3dHdriLightingPreset,
  resolveStudioBg3dHdriLightingPreset,
  type StudioBg3dHdriLightingPresetId,
} from "./studio-bg3d-hdri-lighting-presets";

describe("studio-bg3d-hdri-lighting-presets", () => {
  it("exposes 4 frozen presets with complete bilingual copy and swatch data", () => {
    expect(STUDIO_BG3D_HDRI_LIGHTING_PRESETS).toHaveLength(4);
    expect(Object.isFrozen(STUDIO_BG3D_HDRI_LIGHTING_PRESETS)).toBe(true);

    const ids = STUDIO_BG3D_HDRI_LIGHTING_PRESETS.map((preset) => preset.id);
    expect(ids).toEqual(["daylight", "twilight", "night", "studio"]);
    expect(new Set(ids).size).toBe(4);

    for (const preset of STUDIO_BG3D_HDRI_LIGHTING_PRESETS) {
      expect(Object.isFrozen(preset)).toBe(true);
      expect(Object.isFrozen(preset.lighting)).toBe(true);
      expect(Object.isFrozen(preset.swatch)).toBe(true);
      expect(preset.swatch).toHaveLength(3);
      expect(preset.labelKo.length).toBeGreaterThan(0);
      expect(preset.labelEn.length).toBeGreaterThan(0);
      expect(preset.descriptionKo.length).toBeGreaterThan(0);
      expect(preset.descriptionEn.length).toBeGreaterThan(0);
      expect(preset.tooltipKo.length).toBeGreaterThan(0);
      expect(preset.tooltipEn.length).toBeGreaterThan(0);
      expect(preset.exposure).toBeGreaterThan(0);
      expect(preset.sunTimeHours).toBeGreaterThanOrEqual(0);
      expect(preset.sunTimeHours).toBeLessThan(24);
      expect(preset.weatherPresetId.length).toBeGreaterThan(0);
    }
  });

  it("resolves a preset by id and returns undefined for unknown ids", () => {
    const daylight = getStudioBg3dHdriLightingPreset("daylight");
    expect(daylight?.id).toBe("daylight");

    expect(
      getStudioBg3dHdriLightingPreset("unknown" as StudioBg3dHdriLightingPresetId),
    ).toBeUndefined();
  });

  it("resolves the matching preset for its own lighting + exposure combo", () => {
    for (const preset of STUDIO_BG3D_HDRI_LIGHTING_PRESETS) {
      const resolved = resolveStudioBg3dHdriLightingPreset(
        preset.lighting,
        preset.exposure,
      );
      expect(resolved?.id).toBe(preset.id);
    }
  });

  it("returns null when the lighting no longer matches a preset", () => {
    const daylight = getStudioBg3dHdriLightingPreset("daylight")!;
    const resolved = resolveStudioBg3dHdriLightingPreset(
      { ...daylight.lighting, ambientIntensity: 9.99 },
      daylight.exposure,
    );
    expect(resolved).toBeNull();
  });
});
