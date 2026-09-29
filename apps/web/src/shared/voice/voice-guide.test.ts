// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clampVoiceGuideRate,
  hasSeenVoiceGuidePrompt,
  isVoiceGuideSupported,
  markVoiceGuidePromptSeen,
  pickKoreanVoice,
  readVoiceGuidePreferences,
  VOICE_GUIDE_DEFAULT_RATE,
  VOICE_GUIDE_MAX_RATE,
  VOICE_GUIDE_MIN_RATE,
  writeVoiceGuideAutoGuide,
  writeVoiceGuideEnabled,
  writeVoiceGuideRate,
} from "./voice-guide";

function mockVoice(lang: string, name: string, isDefault = false) {
  return { lang, name, default: isDefault };
}

describe("clampVoiceGuideRate", () => {
  it("기본값을 범위로 제한한다", () => {
    expect(clampVoiceGuideRate(0.1)).toBe(VOICE_GUIDE_MIN_RATE);
    expect(clampVoiceGuideRate(3)).toBe(VOICE_GUIDE_MAX_RATE);
    expect(clampVoiceGuideRate(1)).toBe(1);
  });

  it("숫자가 아니면 기본 속도를 반환한다", () => {
    expect(clampVoiceGuideRate(Number.NaN)).toBe(VOICE_GUIDE_DEFAULT_RATE);
    expect(clampVoiceGuideRate(Number.POSITIVE_INFINITY)).toBe(VOICE_GUIDE_DEFAULT_RATE);
  });
});

describe("pickKoreanVoice", () => {
  it("ko-KR 정확 일치를 최우선으로 선택한다", () => {
    const voices = [
      mockVoice("en-US", "Google US English", true),
      mockVoice("ko", "한국어 음성"),
      mockVoice("ko-KR", "Google 한국의"),
    ];
    expect(pickKoreanVoice(voices)?.lang).toBe("ko-KR");
  });

  it("ko 접두사 음성을 선택한다", () => {
    const voices = [mockVoice("en-US", "Google US English", true), mockVoice("ko", "Yuna")];
    expect(pickKoreanVoice(voices)?.lang).toBe("ko");
  });

  it("이름에 한국어 표기가 있으면 선택한다", () => {
    const voices = [mockVoice("en-US", "Korean Voice", true)];
    expect(pickKoreanVoice(voices)?.name).toBe("Korean Voice");
  });

  it("한국어 흔적이 없으면 null을 반환한다", () => {
    const voices = [mockVoice("en-US", "Google US English")];
    expect(pickKoreanVoice(voices)).toBeNull();
  });

  it("빈 목록이면 null을 반환한다", () => {
    expect(pickKoreanVoice([])).toBeNull();
  });
});

describe("음성 안내 설정 저장", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("기본값: 켜짐, 자동 안내 off, 속도 0.95", () => {
    const prefs = readVoiceGuidePreferences();
    expect(prefs.enabled).toBe(true);
    expect(prefs.autoGuide).toBe(false);
    expect(prefs.rate).toBe(VOICE_GUIDE_DEFAULT_RATE);
  });

  it("설정을 저장하고 다시 읽는다", () => {
    writeVoiceGuideEnabled(false);
    writeVoiceGuideAutoGuide(true);
    writeVoiceGuideRate(1.25);
    const prefs = readVoiceGuidePreferences();
    expect(prefs.enabled).toBe(false);
    expect(prefs.autoGuide).toBe(true);
    expect(prefs.rate).toBe(1.25);
  });

  it("속도는 범위를 벗어나면 잘린다", () => {
    writeVoiceGuideRate(9);
    expect(readVoiceGuidePreferences().rate).toBe(VOICE_GUIDE_MAX_RATE);
  });

  it("첫 방문 프롬프트 표시 여부를 기록한다", () => {
    expect(hasSeenVoiceGuidePrompt()).toBe(false);
    markVoiceGuidePromptSeen();
    expect(hasSeenVoiceGuidePrompt()).toBe(true);
  });
});

describe("isVoiceGuideSupported", () => {
  it("speechSynthesis가 없으면 false", () => {
    expect(isVoiceGuideSupported()).toBe(false);
  });
});
