// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

interface MockSynth {
  speak: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  getVoices: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
}

function installSpeechMocks(voices: Array<{ lang: string; name: string; default: boolean }> = []) {
  const synth: MockSynth = {
    speak: vi.fn(),
    cancel: vi.fn(),
    getVoices: vi.fn(() => voices),
    addEventListener: vi.fn(),
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true, writable: true });

  const utterances: Array<Record<string, unknown>> = [];
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
      utterances.push(this as unknown as Record<string, unknown>);
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

describe("VoiceGuideEngine", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("speak()은 한국어 음성을 선택해 재생한다", async () => {
    const { synth, utterances } = installSpeechMocks([
      { lang: "en-US", name: "Google US English", default: true },
      { lang: "ko-KR", name: "Google 한국의", default: false },
    ]);
    const { voiceGuideEngine } = await loadEngine();

    const ok = voiceGuideEngine.speak("안녕하세요");
    expect(ok).toBe(true);
    expect(synth.speak).toHaveBeenCalledTimes(1);
    const utterance = utterances[0] as { lang: string; rate: number; pitch: number; voice: { lang: string } };
    expect(utterance.lang).toBe("ko-KR");
    expect(utterance.rate).toBeCloseTo(0.95, 5);
    expect(utterance.pitch).toBe(1);
    expect(utterance.voice.lang).toBe("ko-KR");
    expect(voiceGuideEngine.speaking).toBe(true);
  });

  it("같은 텍스트가 재생 중이면 중복 재생하지 않는다", async () => {
    const { synth } = installSpeechMocks([]);
    const { voiceGuideEngine } = await loadEngine();

    voiceGuideEngine.speak("안녕하세요");
    voiceGuideEngine.speak("안녕하세요");
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });

  it("stop()은 재생을 중단한다", async () => {
    const { synth } = installSpeechMocks([]);
    const { voiceGuideEngine } = await loadEngine();

    voiceGuideEngine.speak("안녕하세요");
    expect(voiceGuideEngine.speaking).toBe(true);
    voiceGuideEngine.stop();
    expect(synth.cancel).toHaveBeenCalled();
    expect(voiceGuideEngine.speaking).toBe(false);
  });

  it("마스터 off면 재생하지 않는다", async () => {
    const { synth } = installSpeechMocks([]);
    const mod = await loadEngine();
    mod.writeVoiceGuideEnabled(false);

    const ok = mod.voiceGuideEngine.speak("안녕하세요");
    expect(ok).toBe(false);
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("빈 텍스트는 재생하지 않는다", async () => {
    const { synth } = installSpeechMocks([]);
    const { voiceGuideEngine } = await loadEngine();

    expect(voiceGuideEngine.speak("   ")).toBe(false);
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("onend에서 idle로 돌아간다", async () => {
    const { utterances } = installSpeechMocks([]);
    const { voiceGuideEngine } = await loadEngine();

    voiceGuideEngine.speak("안녕하세요");
    const utterance = utterances[0] as { onend: (() => void) | null };
    utterance.onend?.();
    expect(voiceGuideEngine.speaking).toBe(false);
  });

  it("상태 변경을 구독할 수 있다", async () => {
    installSpeechMocks([]);
    const { voiceGuideEngine } = await loadEngine();

    const states: string[] = [];
    const unsubscribe = voiceGuideEngine.onStateChange((state) => states.push(state));
    voiceGuideEngine.speak("안녕하세요");
    voiceGuideEngine.stop();
    unsubscribe();
    expect(states).toEqual(["speaking", "idle"]);
  });
});
