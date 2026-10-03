import { describe, expect, it } from "vitest";

import {
  STUDIO_DIALOGUE_TYPEWRITER_CHARS_PER_SECOND,
  studioDialogueGraphemes,
  studioDialogueTypewriterVisible,
} from "./studio-virtual-space-dialogue-typewriter";

const TEXT = "안녕하세요, 오늘 회의는 세 시예요.";

describe("studioDialogueTypewriterVisible", () => {
  it("시간이 지날수록 글자가 늘고 끝나면 전문과 done을 돌려준다", () => {
    const total = studioDialogueGraphemes(TEXT).length;
    const fullMs = (total / STUDIO_DIALOGUE_TYPEWRITER_CHARS_PER_SECOND) * 1_000;
    expect(studioDialogueTypewriterVisible(TEXT, 0, { reducedMotion: false })).toEqual({ text: "", done: false });
    const mid = studioDialogueTypewriterVisible(TEXT, fullMs / 2, { reducedMotion: false });
    expect(mid.done).toBe(false);
    expect(TEXT.startsWith(mid.text)).toBe(true);
    expect(mid.text.length).toBeGreaterThan(0);
    expect(studioDialogueTypewriterVisible(TEXT, fullMs + 500, { reducedMotion: false })).toEqual({ text: TEXT, done: true });
  });

  it("reduced-motion이면 처음부터 전문을 보여 준다", () => {
    expect(studioDialogueTypewriterVisible(TEXT, 0, { reducedMotion: true })).toEqual({ text: TEXT, done: true });
  });

  it("빈 문장과 잘못된 시간에서도 멈추지 않는다", () => {
    expect(studioDialogueTypewriterVisible("", 0, { reducedMotion: false })).toEqual({ text: "", done: true });
    expect(studioDialogueTypewriterVisible(TEXT, Number.NaN, { reducedMotion: false })).toEqual({ text: TEXT, done: true });
    expect(studioDialogueTypewriterVisible(TEXT, -100, { reducedMotion: false }).done).toBe(false);
  });
});

describe("studioDialogueGraphemes", () => {
  it("이모지와 결합 문자를 한 글자로 센다", () => {
    // 서로게이트 쌍과 ZWJ 결합 이모지가 중간에 잘리면 깨진 글자가 보인다.
    expect(studioDialogueGraphemes("a👨‍👩‍👧b")).toEqual(["a", "👨‍👩‍👧", "b"]);
    const visible = studioDialogueTypewriterVisible("a👨‍👩‍👧b", 1_000, { reducedMotion: false });
    expect(visible).toEqual({ text: "a👨‍👩‍👧b", done: true });
  });
});
