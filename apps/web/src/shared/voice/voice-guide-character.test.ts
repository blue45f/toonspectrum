// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface MockUtteranceRecord {
  text: string;
  lang: string;
  rate: number;
  pitch: number;
  voice: unknown;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

function installSpeechMocks(voices: Array<{ lang: string; name: string; default: boolean }> = []) {
  const synth = {
    speak: vi.fn(),
    cancel: vi.fn(),
    getVoices: vi.fn(() => voices),
    addEventListener: vi.fn(),
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true, writable: true });

  const utterances: MockUtteranceRecord[] = [];
  class MockUtterance {
    text: string;
    lang = "";
    rate = 1;
    pitch = 1;
    voice: unknown = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(text: string) {
      this.text = text;
      utterances.push(this as unknown as MockUtteranceRecord);
    }
  }
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    value: MockUtterance,
    configurable: true,
    writable: true,
  });
  return { synth, utterances };
}

async function loadEngine() {
  vi.resetModules();
  return import("./voice-guide");
}

/** 대기 중인 모든 타이머를 진행시켜 비동기 체인을 끝까지 실행한다. */
async function flushAll() {
  for (let i = 0; i < 20; i += 1) {
    await vi.advanceTimersByTimeAsync(5000);
  }
}

describe("VoiceGuideEngine 캐릭터 발화", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("speakWithCharacter는 감정 마크업을 세그먼트로 나눠 순차 재생한다", async () => {
    const { synth, utterances } = installSpeechMocks([
      { lang: "ko-KR", name: "Google 한국의", default: false },
    ]);
    const { voiceGuideEngine } = await loadEngine();

    const ok = voiceGuideEngine.speakWithCharacter("안녕하세요. [강조]반갑습니다.[/강조]", {
      presetId: "narrator",
    });
    expect(ok).toBe(true);

    // 첫 세그먼트 발화 시작
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(utterances[0].text).toContain("안녕하세요");

    // 첫 utterance 종료 → 두 번째 세그먼트
    utterances[0].onend?.();
    await flushAll();
    expect(utterances.length).toBe(2);
    expect(utterances[1].text).toContain("반갑습니다");
    // 강조 구간은 느리게
    expect(utterances[1].rate).toBeLessThan(utterances[0].rate);

    // 마지막 utterance 종료 → idle
    utterances[1].onend?.();
    await flushAll();
    expect(voiceGuideEngine.speaking).toBe(false);
  });

  it("세그먼트 변경 이벤트가 자막 동기화용으로 발생한다", async () => {
    installSpeechMocks([]);
    const { voiceGuideEngine } = await loadEngine();

    const events: Array<{ segmentIndex: number; totalSegments: number; text: string } | null> = [];
    voiceGuideEngine.onSegmentChange((progress) =>
      events.push(
        progress
          ? { segmentIndex: progress.segmentIndex, totalSegments: progress.totalSegments, text: progress.text }
          : null,
      ),
    );

    voiceGuideEngine.speakWithCharacter("첫 문장. 둘째 문장.", { presetId: "narrator" });
    await flushAll();
    // 최소 첫 세그먼트 이벤트는 발생해야 한다
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toMatchObject({ segmentIndex: 0 });
  });

  it("stop()은 순차 발화 체인을 중단한다", async () => {
    const { synth, utterances } = installSpeechMocks([]);
    const { voiceGuideEngine } = await loadEngine();

    voiceGuideEngine.speakWithCharacter("첫 문장. 둘째 문장. 셋째 문장.", { presetId: "narrator" });
    expect(synth.speak).toHaveBeenCalledTimes(1);

    voiceGuideEngine.stop();
    // 중단 후에는 체인이 더 진행되지 않는다
    utterances[0].onend?.();
    await flushAll();
    expect(utterances.length).toBe(1);
    expect(voiceGuideEngine.speaking).toBe(false);
  });

  it("빈 세그먼트 배열은 재생하지 않는다", async () => {
    const { synth } = installSpeechMocks([]);
    const { voiceGuideEngine } = await loadEngine();

    expect(voiceGuideEngine.speakSegments([])).toBe(false);
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("speakSegments는 프리셋 힌트로 고품질 음성을 선택한다", async () => {
    const { utterances } = installSpeechMocks([
      { lang: "ko-KR", name: "기본 한국어", default: false },
      { lang: "ko-KR", name: "Google 한국의", default: false },
    ]);
    const mod = await loadEngine();
    const { getVoiceCharacterPreset } = await import("./voice-character-presets");
    const narrator = getVoiceCharacterPreset("narrator");
    mod.voiceGuideEngine.speakSegments(
      [{ text: "안녕", rate: 1, pitch: 1, pauseBeforeMs: 0, pauseAfterMs: 0, emotion: "neutral" }],
      { preset: narrator },
    );
    await flushAll();
    expect(utterances.length).toBe(1);
    expect((utterances[0].voice as { name: string }).name).toBe("Google 한국의");
  });

  it("pickKoreanVoice는 하위 호환을 유지한다", async () => {
    const { pickKoreanVoice } = await loadEngine();
    const voices = [
      { lang: "en-US", name: "English", default: true },
      { lang: "ko-KR", name: "한국어", default: false },
    ];
    expect(pickKoreanVoice(voices)?.lang).toBe("ko-KR");
    expect(pickKoreanVoice([])).toBeNull();
    expect(pickKoreanVoice([{ lang: "en-US", name: "English", default: false }])).toBeNull();
  });
});
