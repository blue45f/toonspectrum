// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  EDGE_TTS_ENGLISH_VOICES,
  EDGE_TTS_KOREAN_VOICES,
  isEdgeTtsAvailable,
  isEdgeTtsExperimentEnabled,
  setEdgeTtsExperimentEnabled,
} from "./voice-edge-tts";

describe("voice-edge-tts", () => {
  it("한국어 신경망 음성 목록이 있다", () => {
    expect(EDGE_TTS_KOREAN_VOICES.length).toBeGreaterThan(0);
    expect(EDGE_TTS_KOREAN_VOICES[0].locale).toBe("ko-KR");
    expect(EDGE_TTS_KOREAN_VOICES.some((v) => v.shortName === "ko-KR-SunHiNeural")).toBe(true);
  });

  it("영어 폴백 음성 목록이 있다", () => {
    expect(EDGE_TTS_ENGLISH_VOICES.length).toBeGreaterThan(0);
  });

  it("WebSocket 환경에서 사용 가능하다", () => {
    expect(isEdgeTtsAvailable()).toBe(true);
  });

  it("실험 플래그는 기본 off이며 명시적으로 켤 수 있다", () => {
    localStorage.clear();
    expect(isEdgeTtsExperimentEnabled()).toBe(false);
    setEdgeTtsExperimentEnabled(true);
    expect(isEdgeTtsExperimentEnabled()).toBe(true);
    setEdgeTtsExperimentEnabled(false);
    expect(isEdgeTtsExperimentEnabled()).toBe(false);
  });
});
