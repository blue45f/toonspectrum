import { describe, expect, it, vi } from "vitest";

import {
  speakDialogueLine,
  stopDialogue,
  DialogueSpeakHandle,
  type DialogueSpeakerDeps,
  type SpeechSynthesisUtteranceLike,
  type SpeechSynthPort,
} from "./motion-webtoon-dialogue-speaker";

function makeUtterance(text: string): SpeechSynthesisUtteranceLike {
  return {
    text,
    lang: "",
    rate: 1,
    pitch: 1,
    voice: null,
    onend: null,
    onerror: null,
  };
}

function makeDeps(spoken: SpeechSynthesisUtteranceLike[]): { deps: DialogueSpeakerDeps; synth: SpeechSynthPort } {
  const synth: SpeechSynthPort = {
    speak: (utterance) => {
      spoken.push(utterance);
      // 즉시 종료 콜백 — 다음 tick에 실행해 순차 발화를 시뮬레이션.
      setTimeout(() => utterance.onend?.(), 0);
    },
    cancel: () => {},
    getVoices: () => [],
  };
  const deps: DialogueSpeakerDeps = {
    synth,
    createUtterance: makeUtterance,
    delay: () => Promise.resolve(),
  };
  return { deps, synth };
}

describe("speakDialogueLine", () => {
  it("대사를 발화하고 완료된다", async () => {
    const spoken: SpeechSynthesisUtteranceLike[] = [];
    const { deps } = makeDeps(spoken);
    const handle = speakDialogueLine({ text: "안녕하세요", presetId: "narrator" }, deps);
    await handle.finished;
    expect(spoken.length).toBeGreaterThan(0);
    expect(spoken[0]?.text).toContain("안녕하세요");
    expect(spoken[0]?.lang).toBe("ko-KR");
  });

  it("감정 마크업이 있으면 세그먼트별로 발화한다", async () => {
    const spoken: SpeechSynthesisUtteranceLike[] = [];
    const { deps } = makeDeps(spoken);
    const handle = speakDialogueLine(
      { text: "[강조]조심해[/강조] 그리고 [기쁨]반가워[/기쁨]", presetId: "narrator" },
      deps,
    );
    await handle.finished;
    const texts = spoken.map((u) => u.text).join("|");
    expect(texts).toContain("조심해");
    expect(texts).toContain("반가워");
    // 강조 세그먼트는 느리게, 기쁨 세그먼트는 빠르게
    const emphasis = spoken.find((u) => u.text.includes("조심해"));
    const joy = spoken.find((u) => u.text.includes("반가워"));
    expect(emphasis!.rate).toBeLessThan(joy!.rate);
  });

  it("synth가 없으면 즉시 완료된다", async () => {
    const deps: DialogueSpeakerDeps = {
      synth: null,
      createUtterance: makeUtterance,
      delay: () => Promise.resolve(),
    };
    const handle = speakDialogueLine({ text: "안녕", presetId: "narrator" }, deps);
    await handle.finished;
    expect(handle.isCancelled).toBe(false);
  });

  it("취소하면 발화를 중단한다", async () => {
    const spoken: SpeechSynthesisUtteranceLike[] = [];
    const { deps, synth } = makeDeps(spoken);
    const cancelSpy = vi.spyOn(synth, "cancel");
    const handle = new DialogueSpeakHandle();
    handle.cancel();
    speakDialogueLine({ text: "안녕하세요", presetId: "narrator" }, deps, handle);
    await handle.finished;
    expect(spoken).toHaveLength(0);
    expect(cancelSpy).toHaveBeenCalled();
  });
});

describe("stopDialogue", () => {
  it("synth.cancel()을 호출한다", () => {
    const spoken: SpeechSynthesisUtteranceLike[] = [];
    const { deps, synth } = makeDeps(spoken);
    const cancelSpy = vi.spyOn(synth, "cancel");
    stopDialogue(deps);
    expect(cancelSpy).toHaveBeenCalled();
  });

  it("deps가 null이어도 예외가 없다", () => {
    expect(() => stopDialogue(null)).not.toThrow();
  });
});
