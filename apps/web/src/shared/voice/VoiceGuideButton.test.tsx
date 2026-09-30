// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VoiceGuideButton } from "./VoiceGuideButton";
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
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // @ts-expect-error 테스트용 정리
  delete window.speechSynthesis;
  // @ts-expect-error 테스트용 정리
  delete window.SpeechSynthesisUtterance;
});

describe("VoiceGuideButton", () => {
  it("지원 브라우저에서 안내 듣기 버튼을 렌더링한다", () => {
    render(<VoiceGuideButton scriptId="home" />);
    expect(screen.getByRole("button", { name: "음성 안내 듣기" })).toBeDefined();
  });

  it("클릭하면 안내를 재생하고 다시 클릭하면 중지한다", () => {
    render(<VoiceGuideButton scriptId="home" />);
    const button = screen.getByRole("button", { name: "음성 안내 듣기" });

    fireEvent.click(button);
    expect(voiceGuideEngine.speaking).toBe(true);
    expect(screen.getByRole("button", { name: "음성 안내 중지" })).toBeDefined();
    expect(screen.getByText("듣는 중")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "음성 안내 중지" }));
    expect(voiceGuideEngine.speaking).toBe(false);
  });

  it("자막 토글로 안내 문구를 표시한다", () => {
    render(<VoiceGuideButton scriptId="home" />);
    fireEvent.click(screen.getByRole("button", { name: "자막 보기" }));
    const caption = screen.getByRole("status");
    expect(caption.textContent).toContain("툰스튜디오에 오신 것을 환영합니다");
    fireEvent.click(screen.getByRole("button", { name: "자막 숨기기" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("fixed 변형은 우상단 고정 클래스를 가진다", () => {
    const { container } = render(<VoiceGuideButton scriptId="home" variant="fixed" />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain("fixed");
    expect(wrapper?.className).toContain("right-4");
  });

  it("미지원 브라우저에서는 렌더링하지 않는다", () => {
    // @ts-expect-error 테스트용 정리
    delete window.speechSynthesis;
    render(<VoiceGuideButton scriptId="home" />);
    expect(screen.queryByRole("button", { name: "음성 안내 듣기" })).toBeNull();
  });
});
