import { describe, expect, it } from "vitest";

import { getVoiceCharacterPreset } from "./voice-character-presets";
import {
  hasEmotionMarkup,
  parseEmotionMarkup,
  stripEmotionMarkup,
} from "./voice-emotion-markup";

const narrator = getVoiceCharacterPreset("narrator");

describe("voice-emotion-markup", () => {
  it("마크업 없는 텍스트는 neutral 세그먼트로 분리된다", () => {
    const segments = parseEmotionMarkup("안녕하세요. 반갑습니다.", narrator);
    expect(segments.length).toBeGreaterThanOrEqual(2);
    expect(segments.every((s) => s.emotion === "neutral")).toBe(true);
    expect(segments[0].text).toContain("안녕하세요");
  });

  it("[강조] 구간은 느리고 낮게 조정된다", () => {
    const segments = parseEmotionMarkup("일반 [강조]강조[/강조] 일반", narrator);
    const emphasized = segments.find((s) => s.emotion === "emphasis");
    expect(emphasized).toBeDefined();
    const neutral = segments.find((s) => s.emotion === "neutral");
    expect(emphasized!.rate).toBeLessThan(neutral!.rate);
    expect(emphasized!.pitch).toBeLessThan(neutral!.pitch);
  });

  it("[신비] 구간은 더 느리고 낮다", () => {
    const segments = parseEmotionMarkup("[신비]별이 속삭인다[/신비]", narrator);
    expect(segments[0].emotion).toBe("mystic");
    expect(segments[0].rate).toBeLessThan(narrator.rate);
  });

  it("[쉼]은 쉼 시간을 만든다", () => {
    const segments = parseEmotionMarkup("앞[쉼]뒤", narrator);
    const after = segments.find((s) => s.text.includes("뒤"));
    expect(after).toBeDefined();
    expect(after!.pauseBeforeMs).toBeGreaterThan(0);
  });

  it("알 수 없는 태그는 무시되고 텍스트에서 제거된다", () => {
    const stripped = stripEmotionMarkup("안녕[알수없음]하세요");
    expect(stripped).toBe("안녕하세요");
    expect(stripped).not.toContain("[");
  });

  it("stripEmotionMarkup은 자막용 순수 텍스트를 반환한다", () => {
    const stripped = stripEmotionMarkup("[신비]별들이 속삭이는[/신비] 운세[쉼]를 전해드립니다.");
    expect(stripped).toBe("별들이 속삭이는 운세를 전해드립니다.");
  });

  it("hasEmotionMarkup이 마크업 존재를 감지한다", () => {
    expect(hasEmotionMarkup("일반 텍스트")).toBe(false);
    expect(hasEmotionMarkup("[강조]텍스트")).toBe(true);
  });

  it("문장 사이에는 sentencePauseMs가 적용된다", () => {
    const segments = parseEmotionMarkup("첫 문장. 둘째 문장.", narrator);
    expect(segments[0].pauseAfterMs).toBe(narrator.sentencePauseMs);
  });

  it("단락 사이에는 paragraphPauseMs가 적용된다", () => {
    const segments = parseEmotionMarkup("첫 단락.\n\n둘째 단락.", narrator);
    const second = segments.find((s) => s.text.includes("둘째"));
    expect(second).toBeDefined();
    expect(second!.pauseBeforeMs).toBe(narrator.paragraphPauseMs);
  });

  it("마지막 세그먼트의 후행 쉼은 제거된다", () => {
    const segments = parseEmotionMarkup("한 문장입니다.", narrator);
    expect(segments[segments.length - 1].pauseAfterMs).toBe(0);
  });

  it("빈 입력은 빈 배열을 반환한다", () => {
    expect(parseEmotionMarkup("", narrator)).toEqual([]);
    expect(parseEmotionMarkup("   ", narrator)).toEqual([]);
  });
});
