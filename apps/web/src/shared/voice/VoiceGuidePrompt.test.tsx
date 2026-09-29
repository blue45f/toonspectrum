// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VoiceGuidePrompt } from "./VoiceGuidePrompt";
import { hasSeenVoiceGuidePrompt, voiceGuideEngine } from "./voice-guide";

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
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // @ts-expect-error 테스트용 정리
  delete window.speechSynthesis;
  // @ts-expect-error 테스트용 정리
  delete window.SpeechSynthesisUtterance;
});

describe("VoiceGuidePrompt", () => {
  it("첫 방문자에게 음성 안내를 제안한다", () => {
    render(<VoiceGuidePrompt scriptId="home" />);
    expect(screen.getByRole("dialog", { name: "음성 안내 제안" })).toBeDefined();
    expect(screen.getByText("음성으로 안내 듣기")).toBeDefined();
  });

  it("닫기를 누르면 다시 표시하지 않는다", () => {
    render(<VoiceGuidePrompt scriptId="home" />);
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(hasSeenVoiceGuidePrompt()).toBe(true);
    expect(screen.queryByRole("dialog", { name: "음성 안내 제안" })).toBeNull();
  });

  it("이미 본 방문자에게는 표시하지 않는다", () => {
    localStorage.setItem("ts_voice_guide_prompt_seen", "1");
    render(<VoiceGuidePrompt scriptId="home" />);
    expect(screen.queryByRole("dialog", { name: "음성 안내 제안" })).toBeNull();
  });

  it("안내 듣기를 누르면 재생하고 프롬프트를 닫는다", () => {
    const synth = window.speechSynthesis as unknown as { speak: ReturnType<typeof vi.fn> };
    render(<VoiceGuidePrompt scriptId="home" />);
    fireEvent.click(screen.getByRole("button", { name: "안내 듣기" }));
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "음성 안내 제안" })).toBeNull();
  });

  it("미지원 브라우저에서는 표시하지 않는다", () => {
    // @ts-expect-error 테스트용 정리
    delete window.speechSynthesis;
    render(<VoiceGuidePrompt scriptId="home" />);
    expect(screen.queryByRole("dialog", { name: "음성 안내 제안" })).toBeNull();
  });
});
