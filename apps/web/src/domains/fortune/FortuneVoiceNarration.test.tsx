// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FortuneVoiceNarration } from "./FortuneVoiceNarration";
import { speakNaturalBrowserSpeech } from "@/shared/lib/natural-browser-speech";

vi.mock("@/shared/lib/natural-browser-speech", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/shared/lib/natural-browser-speech")>();
  return {
    ...original,
    speakNaturalBrowserSpeech: vi.fn(),
    isNaturalBrowserSpeechSupported: () => true,
    chooseNaturalKoreanVoice: () => null,
  };
});

const mockSpeak = vi.mocked(speakNaturalBrowserSpeech);

describe("FortuneVoiceNarration", () => {
  beforeEach(() => {
    mockSpeak.mockReset();
    mockSpeak.mockReturnValue({ cancel: vi.fn() } as unknown as ReturnType<typeof speakNaturalBrowserSpeech>);
    // 컴포넌트의 voices 로딩 effect용 최소 목
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => [],
        cancel: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    cleanup();
    // @ts-expect-error - 테스트 정리용
    delete window.speechSynthesis;
  });

  it("재생 버튼을 누르면 텍스트를 낭독한다", () => {
    render(<FortuneVoiceNarration text="오늘의 운세입니다" />);
    fireEvent.click(screen.getByRole("button", { name: /음성으로 듣기/ }));
    expect(mockSpeak).toHaveBeenCalledTimes(1);
    expect(mockSpeak.mock.calls[0]?.[0]).toMatchObject({ text: "오늘의 운세입니다" });
  });

  it("캐릭터별 성우 톤을 전달한다", () => {
    render(<FortuneVoiceNarration text="운세" characterId="ara" />);
    fireEvent.click(screen.getByRole("button", { name: /음성으로 듣기/ }));
    const opts = mockSpeak.mock.calls[0]?.[0] as { pitch?: number };
    // ara는 여성 캐릭터 — 피치가 1보다 높게 설정됨
    expect(opts.pitch).toBeGreaterThan(1);
  });

  it("빈 텍스트는 낭독하지 않는다", () => {
    render(<FortuneVoiceNarration text="   " />);
    fireEvent.click(screen.getByRole("button", { name: /음성으로 듣기/ }));
    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it("언마운트 시 세션을 취소한다", () => {
    const cancel = vi.fn();
    mockSpeak.mockReturnValue({ cancel } as unknown as ReturnType<typeof speakNaturalBrowserSpeech>);
    const { unmount } = render(<FortuneVoiceNarration text="운세" />);
    fireEvent.click(screen.getByRole("button", { name: /음성으로 듣기/ }));
    unmount();
    expect(cancel).toHaveBeenCalled();
  });
});
