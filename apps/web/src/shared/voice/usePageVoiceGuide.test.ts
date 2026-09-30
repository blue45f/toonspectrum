// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePageVoiceGuide } from "./usePageVoiceGuide";
import { voiceGuideEngine } from "./voice-guide";

import { useI18n } from "@/shared/lib/i18n";

function installSpeechMocks() {
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
    }
  }
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    value: MockUtterance,
    configurable: true,
    writable: true,
  });
  return synth;
}

beforeEach(() => {
  localStorage.clear();
  useI18n.getState().setLang("ko");
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

describe("usePageVoiceGuide", () => {
  it("기본값에서는 페이지 진입 시 자동 재생하지 않는다", () => {
    const synth = window.speechSynthesis as unknown as { speak: ReturnType<typeof vi.fn> };
    renderHook(() => usePageVoiceGuide("home"));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("자동 안내 설정이 켜져 있으면 진입 시 재생한다", () => {
    const synth = window.speechSynthesis as unknown as { speak: ReturnType<typeof vi.fn> };
    localStorage.setItem("ts_voice_guide_auto", "1");
    renderHook(() => usePageVoiceGuide("pricing"));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });

  it("speak/stop으로 직접 제어할 수 있다", () => {
    const { result } = renderHook(() => usePageVoiceGuide("studio"));
    expect(result.current.supported).toBe(true);
    expect(result.current.script).toContain("크리에이터 스튜디오");

    act(() => {
      result.current.speak();
    });
    expect(result.current.speaking).toBe(true);

    act(() => {
      result.current.stop();
    });
    expect(result.current.speaking).toBe(false);
  });

  it("언마운트 시 재생을 중단한다", () => {
    const { result, unmount } = renderHook(() => usePageVoiceGuide("home"));
    act(() => {
      result.current.speak();
    });
    expect(voiceGuideEngine.speaking).toBe(true);
    unmount();
    expect(voiceGuideEngine.speaking).toBe(false);
  });
});
