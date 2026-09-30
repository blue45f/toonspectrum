// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useVoiceSegmentProgress } from "./useVoiceSegmentProgress";
import { voiceGuideEngine } from "./voice-guide";

interface MockUtteranceRecord {
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

let utterances: MockUtteranceRecord[];

function installSpeechMocks() {
  utterances = [];
  const synth = {
    speak: vi.fn(),
    cancel: vi.fn(),
    getVoices: vi.fn(() => []),
    addEventListener: vi.fn(),
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true, writable: true });
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
      utterances.push(this);
    }
  }
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    value: MockUtterance,
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  localStorage.clear();
  installSpeechMocks();
  voiceGuideEngine.stop();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  // @ts-expect-error 테스트용 정리
  delete window.speechSynthesis;
  // @ts-expect-error 테스트용 정리
  delete window.SpeechSynthesisUtterance;
});

describe("useVoiceSegmentProgress", () => {
  it("발화 시작 시 첫 세그먼트 진행 상황을 반환한다", () => {
    const { result } = renderHook(() => useVoiceSegmentProgress());
    expect(result.current).toBeNull();

    act(() => {
      voiceGuideEngine.speakWithCharacter("첫 문장. 둘째 문장.", { presetId: "narrator" });
    });

    expect(result.current).toMatchObject({ segmentIndex: 0, totalSegments: 2 });
    expect(result.current?.text).toContain("첫 문장");
  });

  it("세그먼트가 바뀌면 진행 상황이 갱신된다", async () => {
    const { result } = renderHook(() => useVoiceSegmentProgress());

    act(() => {
      voiceGuideEngine.speakWithCharacter("첫 문장. 둘째 문장.", { presetId: "narrator" });
    });
    expect(result.current?.segmentIndex).toBe(0);

    // 첫 utterance 종료 → 문장 사이 쉼 후 다음 세그먼트
    act(() => {
      utterances[0].onend?.();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(utterances.length).toBe(2);
    expect(result.current).toMatchObject({ segmentIndex: 1, totalSegments: 2 });
    expect(result.current?.text).toContain("둘째 문장");
  });

  it("중단하면 null로 돌아간다", () => {
    const { result } = renderHook(() => useVoiceSegmentProgress());

    act(() => {
      voiceGuideEngine.speakWithCharacter("첫 문장. 둘째 문장.", { presetId: "narrator" });
    });
    expect(result.current).not.toBeNull();

    act(() => {
      voiceGuideEngine.stop();
    });
    expect(result.current).toBeNull();
  });
});
