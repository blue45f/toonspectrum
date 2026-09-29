// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const { fakeBgm } = vi.hoisted(() => {
  const fakeBgm = {
    playing: false,
    currentVolume: 0.8,
    setVolume: vi.fn(),
  };
  fakeBgm.setVolume.mockImplementation((volume: number) => {
    fakeBgm.currentVolume = volume;
  });
  return { fakeBgm };
});

vi.mock("@/shared/bgm", () => ({
  bgmEngine: fakeBgm,
}));

interface MockSynth {
  speak: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  getVoices: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
}

function installSpeechMocks() {
  const synth: MockSynth = {
    speak: vi.fn(),
    cancel: vi.fn(),
    getVoices: vi.fn(() => []),
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

/**
 * 모듈을 한 번의 reset으로 함께 로드한다.
 * voice-guide와 voice-bgm-ducking이 같은 엔진 인스턴스를 공유해야 하므로
 * 두 import 사이에 resetModules를 호출하면 안 된다.
 */
async function loadAll() {
  vi.resetModules();
  const voice = await import("./voice-guide");
  const bridge = await import("./voice-bgm-ducking");
  return {
    voiceGuideEngine: voice.voiceGuideEngine,
    wireVoiceBgmDucking: bridge.wireVoiceBgmDucking,
    unwireVoiceBgmDucking: bridge.unwireVoiceBgmDucking,
    VOICE_BGM_DUCK_RATIO: bridge.VOICE_BGM_DUCK_RATIO,
  };
}

describe("voice-bgm-ducking", () => {
  beforeEach(() => {
    localStorage.clear();
    fakeBgm.playing = false;
    fakeBgm.currentVolume = 0.8;
    fakeBgm.setVolume.mockClear();
  });

  it("음성 안내가 시작되면 재생 중인 BGM 볼륨을 25%로 낮춘다", async () => {
    installSpeechMocks();
    const { voiceGuideEngine, wireVoiceBgmDucking, VOICE_BGM_DUCK_RATIO, unwireVoiceBgmDucking } =
      await loadAll();

    fakeBgm.playing = true;
    wireVoiceBgmDucking();

    voiceGuideEngine.speak("안녕하세요");

    expect(fakeBgm.setVolume).toHaveBeenCalledTimes(1);
    expect(fakeBgm.setVolume).toHaveBeenCalledWith(0.8 * VOICE_BGM_DUCK_RATIO);
    expect(fakeBgm.currentVolume).toBeCloseTo(0.2, 10);
    unwireVoiceBgmDucking();
  });

  it("안내가 끝나면 BGM 볼륨을 원래대로 복원한다", async () => {
    const { utterances } = installSpeechMocks();
    const { voiceGuideEngine, wireVoiceBgmDucking, unwireVoiceBgmDucking } = await loadAll();

    fakeBgm.playing = true;
    wireVoiceBgmDucking();

    voiceGuideEngine.speak("안녕하세요");
    const utterance = utterances[0] as { onend: (() => void) | null };
    utterance.onend?.();

    expect(fakeBgm.setVolume).toHaveBeenCalledTimes(2);
    expect(fakeBgm.setVolume).toHaveBeenLastCalledWith(0.8);
    expect(fakeBgm.currentVolume).toBe(0.8);
    unwireVoiceBgmDucking();
  });

  it("BGM이 재생 중이 아니면 볼륨을 건드리지 않는다", async () => {
    installSpeechMocks();
    const { voiceGuideEngine, wireVoiceBgmDucking, unwireVoiceBgmDucking } = await loadAll();

    fakeBgm.playing = false;
    wireVoiceBgmDucking();

    voiceGuideEngine.speak("안녕하세요");

    expect(fakeBgm.setVolume).not.toHaveBeenCalled();
    voiceGuideEngine.stop();
    expect(fakeBgm.setVolume).not.toHaveBeenCalled();
    unwireVoiceBgmDucking();
  });

  it("덕킹 중에 사용자가 볼륨을 바꾸면 복원하지 않는다", async () => {
    const { utterances } = installSpeechMocks();
    const { voiceGuideEngine, wireVoiceBgmDucking, unwireVoiceBgmDucking } = await loadAll();

    fakeBgm.playing = true;
    wireVoiceBgmDucking();

    voiceGuideEngine.speak("안녕하세요");
    // 사용자가 덕킹 중에 직접 볼륨을 조절했다.
    fakeBgm.currentVolume = 0.5;

    const utterance = utterances[0] as { onend: (() => void) | null };
    utterance.onend?.();

    expect(fakeBgm.setVolume).toHaveBeenCalledTimes(1);
    expect(fakeBgm.currentVolume).toBe(0.5);
    unwireVoiceBgmDucking();
  });

  it("여러 번 연결해도 한 번만 덕킹한다", async () => {
    installSpeechMocks();
    const { voiceGuideEngine, wireVoiceBgmDucking, unwireVoiceBgmDucking } = await loadAll();

    fakeBgm.playing = true;
    const unwire1 = wireVoiceBgmDucking();
    const unwire2 = wireVoiceBgmDucking();
    expect(unwire1).toBe(unwire2);

    voiceGuideEngine.speak("안녕하세요");
    expect(fakeBgm.setVolume).toHaveBeenCalledTimes(1);

    unwireVoiceBgmDucking();
    voiceGuideEngine.stop();
    // 해제 후에는 덕킹하지 않는다.
    voiceGuideEngine.speak("다시 안녕하세요");
    expect(fakeBgm.setVolume).toHaveBeenCalledTimes(1);
  });
});
