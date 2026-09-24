import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildNaturalSpeechPlan,
  chooseNaturalKoreanVoice,
  estimateNaturalSpeechDurationMs,
  naturalKoreanVoiceScore,
  normalizeNaturalSpeechText,
  rankNaturalKoreanVoices,
  speakNaturalBrowserSpeech,
  speakNaturalBrowserSpeechSequence,
  type NaturalSpeechSegment,
  type NaturalSpeechVoice,
} from "./natural-browser-speech";

function voice(name: string, options: Partial<NaturalSpeechVoice> = {}): NaturalSpeechVoice {
  return { name, lang: "ko-KR", voiceURI: name, ...options };
}

describe("natural Korean speech preparation", () => {
  it("normalizes product and production terms without changing the source plan text", () => {
    const source = "ToonStudio AI TTS로 3D 홍보 영상을 만드세요. https://example.com 🎬";
    expect(normalizeNaturalSpeechText(source)).toBe(
      "툰 스튜디오 에이 아이 티 티 에스로 쓰리 디 홍보 영상을 만드세요. 링크"
    );

    const plan = buildNaturalSpeechPlan(source, { style: "promo-natural" });
    expect(plan[0]?.sourceText).toContain("ToonStudio");
    expect(plan[0]?.spokenText).toContain("툰 스튜디오");
  });

  it("splits long copy into breathing phrases with deterministic prosody and useful pauses", () => {
    const source = "오늘의 흐름을 천천히 살펴볼게요, 중요한 선택은 서두르지 마세요. 좋은 기회가 가까이 와 있습니다!\n\n마음을 편하게 가져보세요.";
    const first = buildNaturalSpeechPlan(source, { style: "fortune", maxSegmentChars: 36 });
    const second = buildNaturalSpeechPlan(source, { style: "fortune", maxSegmentChars: 36 });

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(2);
    expect(first.every((segment) => segment.spokenText.length <= 45)).toBe(true);
    expect(first.some((segment) => segment.pauseAfterMs >= 300)).toBe(true);
    expect(estimateNaturalSpeechDurationMs(first)).toBeGreaterThan(2_000);
  });

  it("applies distinct delivery profiles without unsafe speed or pitch values", () => {
    const copy = "당신의 이야기가, 이제 작품이 됩니다.";
    const cinematic = buildNaturalSpeechPlan(copy, { style: "promo-cinematic" });
    const energetic = buildNaturalSpeechPlan(copy, { style: "energetic" });

    expect(cinematic[0]!.rate).toBeLessThan(energetic[0]!.rate);
    expect(cinematic[0]!.pauseAfterMs).toBeGreaterThanOrEqual(energetic[0]!.pauseAfterMs);
    expect([...cinematic, ...energetic].every((segment) => segment.rate >= 0.6 && segment.rate <= 1.6)).toBe(true);
    expect([...cinematic, ...energetic].every((segment) => segment.pitch >= 0.6 && segment.pitch <= 1.45)).toBe(true);
  });
});

describe("natural Korean voice ranking", () => {
  const voices = [
    voice("기본 한국어", { localService: true }),
    voice("Microsoft SunHi Online (Natural) - Korean", { localService: false }),
    voice("Microsoft InJoon Online (Natural) - Korean", { localService: false }),
    { name: "English", lang: "en-US", voiceURI: "English", localService: true },
  ];

  it("prefers a matching natural male or female voice while ignoring non-Korean voices", () => {
    expect(chooseNaturalKoreanVoice(voices, { gender: "female", preferLocal: false })?.name).toContain("SunHi");
    expect(chooseNaturalKoreanVoice(voices, { gender: "male", preferLocal: false })?.name).toContain("InJoon");
    expect(rankNaturalKoreanVoices(voices).some((candidate) => candidate.lang === "en-US")).toBe(false);
  });

  it("can enforce confirmed device-local playback and honor an explicit choice", () => {
    expect(rankNaturalKoreanVoices(voices, { localOnly: true })).toEqual([voices[0]]);
    expect(
      chooseNaturalKoreanVoice(voices, {
        preferredVoiceURI: voices[0]!.voiceURI,
        preferLocal: false,
      })
    ).toBe(voices[0]);
  });

  it("scores neural quality hints above a plain voice when locality is not required", () => {
    expect(naturalKoreanVoiceScore(voices[1]!, { preferLocal: false })).toBeGreaterThan(
      naturalKoreanVoiceScore(voices[0]!, { preferLocal: false })
    );
  });
});


afterEach(() => {
  vi.useRealTimers();
});

describe("natural browser speech session", () => {
  it("plays phrase plans sequentially and keeps pause/resume inside one cancellable session", () => {
    vi.useFakeTimers();
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
    const spoken: FakeUtterance[] = [];
    const synthesis = {
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      speak: vi.fn((utterance: FakeUtterance) => spoken.push(utterance)),
      getVoices: () => [],
    } as unknown as SpeechSynthesis;
    const scope = {
      speechSynthesis: synthesis,
      SpeechSynthesisUtterance: FakeUtterance as unknown as typeof SpeechSynthesisUtterance,
      requestAnimationFrame: vi.fn(() => 1),
      cancelAnimationFrame: vi.fn(),
      performance: { now: () => 0 },
    };
    const plan: NaturalSpeechSegment[] = [
      { sourceText: "첫 문장.", spokenText: "첫 문장.", sourceStart: 0, sourceEnd: 5, rate: 0.9, pitch: 1, volume: 1, pauseAfterMs: 120, estimatedSpeechMs: 600 },
      { sourceText: "둘째 문장.", spokenText: "둘째 문장.", sourceStart: 6, sourceEnd: 12, rate: 0.92, pitch: 0.99, volume: 1, pauseAfterMs: 0, estimatedSpeechMs: 700 },
    ];
    const onEnd = vi.fn();
    const session = speakNaturalBrowserSpeech(
      { text: "첫 문장. 둘째 문장.", plan, onEnd },
      scope,
    );

    expect(session).not.toBeNull();
    expect(synthesis.cancel).toHaveBeenCalledOnce();
    expect(spoken.map((item) => item.text)).toEqual(["첫 문장."]);
    expect(spoken[0]?.rate).toBe(0.9);
    expect(session?.pause()).toBe(true);
    expect(synthesis.pause).toHaveBeenCalledOnce();
    expect(session?.resume()).toBe(true);
    expect(synthesis.resume).toHaveBeenCalledOnce();

    spoken[0]?.onend?.();
    vi.advanceTimersByTime(119);
    expect(spoken).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(spoken.map((item) => item.text)).toEqual(["첫 문장.", "둘째 문장."]);
    spoken[1]?.onend?.();
    vi.runAllTimers();
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("cancels stale browser speech without reporting completion", () => {
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
    const spoken: FakeUtterance[] = [];
    const synthesis = {
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      speak: (utterance: FakeUtterance) => { spoken.push(utterance); },
      getVoices: () => [],
    } as unknown as SpeechSynthesis;
    const onEnd = vi.fn();
    const session = speakNaturalBrowserSpeech(
      { text: "취소할 문장입니다.", onEnd },
      {
        speechSynthesis: synthesis,
        SpeechSynthesisUtterance: FakeUtterance as unknown as typeof SpeechSynthesisUtterance,
        requestAnimationFrame: () => 1,
        cancelAnimationFrame: vi.fn(),
        performance: { now: () => 0 },
      },
    );

    session?.cancel();
    spoken[0]?.onend?.();
    expect(synthesis.cancel).toHaveBeenCalledTimes(2);
    expect(onEnd).not.toHaveBeenCalled();
  });
});


describe("natural browser speech timeline", () => {
  it("starts clips at scheduled offsets and completes them in order", () => {
    vi.useFakeTimers();
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
    const spoken: FakeUtterance[] = [];
    const synthesis = {
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      speak: vi.fn((utterance: FakeUtterance) => spoken.push(utterance)),
      getVoices: () => [],
    } as unknown as SpeechSynthesis;
    const scope = {
      speechSynthesis: synthesis,
      SpeechSynthesisUtterance: FakeUtterance as unknown as typeof SpeechSynthesisUtterance,
      requestAnimationFrame: vi.fn(() => 1),
      cancelAnimationFrame: vi.fn(),
      performance: { now: () => Date.now() },
    };
    const onItemStart = vi.fn();
    const onEnd = vi.fn();
    const session = speakNaturalBrowserSpeechSequence({
      items: [
        { id: "intro", startMs: 100, text: "첫 대사" },
        { id: "hero", startMs: 300, text: "두 번째 대사" },
      ],
      onItemStart,
      onEnd,
    }, scope);

    expect(session).not.toBeNull();
    vi.advanceTimersByTime(99);
    expect(spoken).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(spoken.map((item) => item.text)).toEqual(["첫 대사"]);
    expect(onItemStart).toHaveBeenCalledWith("intro", 0);
    spoken[0]?.onend?.();
    vi.advanceTimersByTime(199);
    expect(spoken).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(spoken.map((item) => item.text)).toEqual(["첫 대사", "두 번째 대사"]);
    expect(onItemStart).toHaveBeenLastCalledWith("hero", 1);
    spoken[1]?.onend?.();
    vi.runAllTimers();
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("cancels pending clips without starting a stale utterance", () => {
    vi.useFakeTimers();
    const synthesis = {
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      speak: vi.fn(),
      getVoices: () => [],
    } as unknown as SpeechSynthesis;
    const session = speakNaturalBrowserSpeechSequence({
      items: [{ id: "later", startMs: 500, text: "나중 대사" }],
    }, {
      speechSynthesis: synthesis,
      SpeechSynthesisUtterance: class {} as unknown as typeof SpeechSynthesisUtterance,
      requestAnimationFrame: vi.fn(() => 1),
      cancelAnimationFrame: vi.fn(),
      performance: { now: () => Date.now() },
    });
    session?.cancel();
    vi.advanceTimersByTime(1_000);
    expect(synthesis.speak).not.toHaveBeenCalled();
  });
});
