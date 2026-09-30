// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VoiceGuideSettingsSection } from "./VoiceGuideSettingsSection";
import { VOICE_CHARACTER_PRESET_IDS, readVoiceCharacterPreset } from "./voice-character-presets";
import { isEdgeTtsAvailable, isEdgeTtsExperimentEnabled } from "./voice-edge-tts";
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

describe("VoiceGuideSettingsSection", () => {
  it("6종의 목소리 캐릭터 카드를 radiogroup으로 렌더링한다", () => {
    render(<VoiceGuideSettingsSection />);
    const group = screen.getByRole("radiogroup", { name: "목소리 캐릭터 선택" });
    expect(group).toBeDefined();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(VOICE_CHARACTER_PRESET_IDS.length);
    // 기본 프리셋(narrator) 하나만 선택 상태
    const checked = radios.filter((radio) => radio.getAttribute("aria-checked") === "true");
    expect(checked).toHaveLength(1);
  });

  it("카드 클릭 한 번으로 선택+저장+미리 듣기가 실행된다", () => {
    const speakSpy = vi.spyOn(voiceGuideEngine, "speakWithCharacter");
    render(<VoiceGuideSettingsSection />);
    const mysticCard = screen.getByRole("radio", { name: /신비로운|mystic/i });
    fireEvent.click(mysticCard);

    expect(readVoiceCharacterPreset()).toBe("mystic");
    expect(mysticCard.getAttribute("aria-checked")).toBe("true");
    expect(speakSpy).toHaveBeenCalledTimes(1);
    expect(speakSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ presetId: "mystic" }),
    );
  });

  it("음성 안내를 끄면 캐릭터 카드가 비활성화된다", () => {
    render(<VoiceGuideSettingsSection />);
    const masterSwitch = screen.getByRole("switch", { name: "음성 안내 사용" });
    fireEvent.click(masterSwitch);

    const radios = screen.getAllByRole("radio");
    for (const radio of radios) {
      expect(radio.hasAttribute("disabled")).toBe(true);
    }
  });

  it("고급 설정에 Edge TTS 실험 토글이 있고 토글하면 저장된다", () => {
    render(<VoiceGuideSettingsSection />);
    const details = screen.getByText("고급 설정").closest("details");
    expect(details).toBeDefined();

    const toggle = screen.getByRole("switch", { name: "Edge TTS 실험" });
    expect(toggle).toBeDefined();
    // 실험 플래그는 기본 off
    expect(isEdgeTtsExperimentEnabled()).toBe(false);

    if (isEdgeTtsAvailable()) {
      fireEvent.click(toggle);
      expect(isEdgeTtsExperimentEnabled()).toBe(true);
    } else {
      expect(toggle.hasAttribute("disabled")).toBe(true);
    }
  });

  it("지원되지 않는 브라우저에서는 Chrome/Edge/Safari 안내를 보여준다", () => {
    // @ts-expect-error 테스트용 정리
    delete window.speechSynthesis;
    render(<VoiceGuideSettingsSection />);
    expect(screen.getByText("이 브라우저는 음성 안내를 지원하지 않습니다.")).toBeDefined();
    expect(screen.getByText(/Chrome·Edge·Safari 최신 버전/)).toBeDefined();
  });
});
