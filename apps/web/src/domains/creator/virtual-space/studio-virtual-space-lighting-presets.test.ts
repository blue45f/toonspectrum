/**
 * 조명 프리셋 테스트 (Track 4 · 꾸미기)
 */
import { describe, expect, it } from "vitest";

import {
  createStudioLightFixturesForPreset,
  STUDIO_LIGHTING_PRESET_KEYS,
  STUDIO_LIGHTING_PRESETS,
  studioLightingPresetKinds,
} from "./studio-virtual-space-lighting-presets";

describe("조명 프리셋", () => {
  it("프리셋 4종이 모두 정의되어 있다", () => {
    expect(STUDIO_LIGHTING_PRESET_KEYS).toHaveLength(4);
    for (const key of STUDIO_LIGHTING_PRESET_KEYS) {
      const preset = STUDIO_LIGHTING_PRESETS[key];
      expect(preset.labelKo.trim().length).toBeGreaterThan(0);
      expect(preset.labelEn.trim().length).toBeGreaterThan(0);
      expect(preset.descriptionKo.trim().length).toBeGreaterThan(0);
      expect(preset.fixtures.length).toBeGreaterThan(0);
    }
  });

  it("프리셋에서 픽스처를 만든다", () => {
    const fixtures = createStudioLightFixturesForPreset("cozy-evening");
    expect(fixtures).toHaveLength(3);
    expect(fixtures.every((fixture) => fixture.on)).toBe(true);
    expect(fixtures[0].kind).toBe("floor-lamp");
    expect(fixtures.map((fixture) => fixture.id)).toEqual([
      "preset-cozy-evening-0",
      "preset-cozy-evening-1",
      "preset-cozy-evening-2",
    ]);
  });

  it("파티 프리셋에 네온사인이 포함된다", () => {
    const kinds = studioLightingPresetKinds("event-party");
    expect(kinds).toContain("neon-sign");
    expect(kinds).toContain("spotlight");
  });

  it("아침 프리셋은 차갑고, 저녁 프리셋은 따뜻하다", () => {
    const morning = createStudioLightFixturesForPreset("morning-fresh");
    expect(morning.every((fixture) => fixture.warm === false)).toBe(true);
    const evening = createStudioLightFixturesForPreset("cozy-evening");
    expect(evening.some((fixture) => fixture.warm === true)).toBe(true);
  });

  it("알 수 없는 키는 예외를 던진다", () => {
    expect(() => createStudioLightFixturesForPreset("midnight" as never)).toThrow();
    expect(() => studioLightingPresetKinds("midnight" as never)).toThrow();
  });
});
