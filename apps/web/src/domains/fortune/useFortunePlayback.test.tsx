// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useFortunePlayback } from "./useFortunePlayback";

import type { FortunePanel } from "./fortune-types";

class FakeUtterance {
  lang = "";
  rate = 1;
  pitch = 1;
  volume = 1;
  voice: SpeechSynthesisVoice | null = null;
  onboundary: ((event: SpeechSynthesisEvent) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;
  constructor(readonly text: string) {}
}

const maleVoice = {
  name: "Microsoft InJoon Online (Natural) - Korean",
  voiceURI: "ko-male-natural",
  lang: "ko-KR",
  localService: false,
  default: false,
} as SpeechSynthesisVoice;
const femaleVoice = {
  name: "Microsoft SunHi Online (Natural) - Korean",
  voiceURI: "ko-female-natural",
  lang: "ko-KR",
  localService: false,
  default: false,
} as SpeechSynthesisVoice;

let spoken: FakeUtterance[];
let synthesis: SpeechSynthesis;

function Harness({ panels }: { panels: FortunePanel[] }) {
  const playback = useFortunePlayback(panels);
  return <button type="button" onClick={playback.play}>운세 재생</button>;
}

beforeEach(() => {
  vi.useFakeTimers();
  spoken = [];
  synthesis = {
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    speak: vi.fn((utterance: SpeechSynthesisUtterance) => {
      spoken.push(utterance as unknown as FakeUtterance);
    }),
    getVoices: () => [femaleVoice, maleVoice],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as SpeechSynthesis;
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synthesis });
  Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: FakeUtterance });
  Object.defineProperty(globalThis, "SpeechSynthesisUtterance", { configurable: true, value: FakeUtterance });
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fortune natural playback", () => {
  it("voices male characters instead of silently typing and selects the matching Korean voice", () => {
    const panels: FortunePanel[] = [{
      scene: "별빛 아래에서 조언하는 장면",
      lines: [{
        speaker: "단우",
        characterId: "danwoo",
        text: "오늘은 중요한 선택을 앞두고 있으니, 서두르지 말고 차분하게 결정하세요.",
      }],
    }];

    render(<Harness panels={panels} />);
    fireEvent.click(screen.getByRole("button", { name: "운세 재생" }));

    expect(spoken).toHaveLength(1);
    expect(spoken[0]?.voice?.voiceURI).toBe(maleVoice.voiceURI);
    expect(spoken[0]?.pitch).toBeLessThan(1);
    expect(spoken[0]?.text.length).toBeLessThan(panels[0]!.lines[0]!.text.length);

    act(() => {
      spoken[0]?.onend?.();
      vi.runOnlyPendingTimers();
    });
    expect(spoken.length).toBeGreaterThan(1);
  });

  it("uses the same cancellable system speech path for narration", () => {
    const panels: FortunePanel[] = [{
      scene: null,
      lines: [{ speaker: "", characterId: null, text: "오늘의 흐름을 천천히 살펴볼게요." }],
    }];

    const view = render(<Harness panels={panels} />);
    fireEvent.click(screen.getByRole("button", { name: "운세 재생" }));
    expect(spoken).toHaveLength(1);
    expect(spoken[0]?.lang).toBe("ko-KR");

    view.unmount();
    expect(synthesis.cancel).toHaveBeenCalled();
  });
});
