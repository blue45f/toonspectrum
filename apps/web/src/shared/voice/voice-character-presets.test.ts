// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  getVoiceCharacterPreset,
  getVoiceCharacterPreviewText,
  readVoiceCharacterPreset,
  VOICE_CHARACTER_PRESET_IDS,
  VOICE_CHARACTER_PRESETS,
  writeVoiceCharacterPreset,
  type VoiceCharacterPresetId,
} from "./voice-character-presets";

describe("voice-character-presets", () => {
  it("6개 프리셋이 모두 정의되어 있다", () => {
    expect(VOICE_CHARACTER_PRESET_IDS).toHaveLength(6);
    expect(VOICE_CHARACTER_PRESET_IDS).toContain("narrator");
    expect(VOICE_CHARACTER_PRESET_IDS).toContain("mystic");
    expect(VOICE_CHARACTER_PRESET_IDS).toContain("dramatic");
  });

  it("모든 프리셋의 rate/pitch가 유효 범위다", () => {
    for (const id of VOICE_CHARACTER_PRESET_IDS) {
      const preset = VOICE_CHARACTER_PRESETS[id];
      expect(preset.rate).toBeGreaterThanOrEqual(0.5);
      expect(preset.rate).toBeLessThanOrEqual(1.5);
      expect(preset.pitch).toBeGreaterThanOrEqual(0);
      expect(preset.pitch).toBeLessThanOrEqual(2);
      expect(preset.nameKo.length).toBeGreaterThan(0);
      expect(preset.nameEn.length).toBeGreaterThan(0);
      expect(preset.sentencePauseMs).toBeGreaterThan(0);
      expect(preset.paragraphPauseMs).toBeGreaterThanOrEqual(preset.sentencePauseMs);
    }
  });

  it("mystic 프리셋은 느리고 쉼이 길다 (운세 낭독용)", () => {
    const mystic = getVoiceCharacterPreset("mystic");
    expect(mystic.rate).toBeLessThan(getVoiceCharacterPreset("narrator").rate);
    expect(mystic.sentencePauseMs).toBeGreaterThan(
      getVoiceCharacterPreset("friendly").sentencePauseMs,
    );
  });

  it("프리셋 저장·읽기가 동작한다", () => {
    localStorage.clear();
    expect(readVoiceCharacterPreset()).toBe("narrator");
    writeVoiceCharacterPreset("mystic");
    expect(readVoiceCharacterPreset()).toBe("mystic");
  });

  it("잘못된 저장값은 기본값으로 폴백한다", () => {
    localStorage.clear();
    localStorage.setItem("ts_voice_character_preset", "invalid-id");
    expect(readVoiceCharacterPreset()).toBe("narrator");
  });

  it("프리셋별 미리 듣기 문구가 있다", () => {
    for (const id of VOICE_CHARACTER_PRESET_IDS) {
      const ko = getVoiceCharacterPreviewText(id, "ko");
      const en = getVoiceCharacterPreviewText(id as VoiceCharacterPresetId, "en");
      expect(ko.length).toBeGreaterThan(0);
      expect(en.length).toBeGreaterThan(0);
    }
  });
});
