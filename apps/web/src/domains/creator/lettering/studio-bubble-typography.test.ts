import { describe, it, expect } from "vitest";

import {
  detectEmphasisSpans,
  buildTypographySpans,
  emotionFontScale,
  letterSpacingForKind,
} from "./studio-bubble-typography";

describe("detectEmphasisSpans", () => {
  it("빈 텍스트는 빈 배열을 반환한다", () => {
    expect(detectEmphasisSpans("")).toEqual([]);
  });

  it("*강조* 마크다운을 탐지한다", () => {
    const spans = detectEmphasisSpans("나는 *정말* 화가 나");
    expect(spans).toHaveLength(1);
    expect(spans[0].kind).toBe("emphasis");
    expect(spans[0].bold).toBe(true);
    // 마크다운 기호(*)는 제외하고 안쪽만.
    expect("나는 *정말* 화가 나".slice(spans[0].start, spans[0].end)).toBe(
      "정말"
    );
  });

  it("!!! 문장을 shout으로 판정한다", () => {
    const spans = detectEmphasisSpans("그만해!!!");
    expect(spans.some((s) => s.kind === "shout")).toBe(true);
    const shout = spans.find((s) => s.kind === "shout")!;
    expect(shout.fontScale).toBeGreaterThan(1.1);
    expect(shout.bold).toBe(true);
  });

  it("~로 끝나는 문장을 whisper로 판정한다", () => {
    const spans = detectEmphasisSpans("조용히 말해줘~");
    expect(spans.some((s) => s.kind === "whisper")).toBe(true);
    const whisper = spans.find((s) => s.kind === "whisper")!;
    expect(whisper.fontScale).toBeLessThan(1);
    expect(whisper.bold).toBe(false);
  });

  it("?!를 question으로 판정한다", () => {
    const spans = detectEmphasisSpans("정말?!");
    expect(spans.some((s) => s.kind === "question")).toBe(true);
  });

  it("! 하나는 emphasis로 판정한다", () => {
    const spans = detectEmphasisSpans("대단해!");
    expect(spans.some((s) => s.kind === "emphasis")).toBe(true);
  });

  it("전체 대문자를 shout으로 판정한다", () => {
    const spans = detectEmphasisSpans("STOP IT");
    expect(spans.some((s) => s.kind === "shout")).toBe(true);
  });

  it("평범한 문장은 강조가 없다", () => {
    expect(detectEmphasisSpans("오늘 날씨가 좋네요")).toEqual([]);
  });

  it("시작 인덱스 순으로 정렬된다", () => {
    const spans = detectEmphasisSpans("*처음* 이야. 그리고 끝!!!");
    const starts = spans.map((s) => s.start);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });
});

describe("buildTypographySpans", () => {
  it("전체 텍스트를 plain+강조로 커버한다", () => {
    const text = "안녕 *친구*야!!!";
    const spans = buildTypographySpans(text);
    // 커버리지: 처음부터 끝까지 빈틈없이.
    expect(spans[0].start).toBe(0);
    expect(spans[spans.length - 1].end).toBe(text.length);
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i].start).toBeLessThanOrEqual(spans[i - 1].end);
    }
  });

  it("빈 텍스트는 plain 하나를 반환한다", () => {
    const spans = buildTypographySpans("");
    expect(spans).toHaveLength(1);
    expect(spans[0].kind).toBe("plain");
  });

  it("강조가 없으면 plain 하나로 전체를 커버한다", () => {
    const spans = buildTypographySpans("평범한 대사");
    expect(spans).toHaveLength(1);
    expect(spans[0].kind).toBe("plain");
    expect(spans[0].end).toBe("평범한 대사".length);
  });
});

describe("emotionFontScale", () => {
  it("분노는 강도가 높을수록 글자가 커진다", () => {
    expect(emotionFontScale("rage", 0)).toBe(1);
    expect(emotionFontScale("rage", 1)).toBeGreaterThan(
      emotionFontScale("rage", 0.5)
    );
  });

  it("속삭임은 강도가 높을수록 글자가 작아진다", () => {
    expect(emotionFontScale("whisper", 1)).toBeLessThan(1);
    expect(emotionFontScale("whisper", 1)).toBeLessThan(
      emotionFontScale("whisper", 0.5)
    );
  });

  it("중립은 항상 1이다", () => {
    expect(emotionFontScale("neutral", 0.7)).toBe(1);
  });

  it("강도가 범위를 벗어나면 클램프된다", () => {
    expect(emotionFontScale("rage", 2)).toBe(emotionFontScale("rage", 1));
    expect(emotionFontScale("rage", -1)).toBe(1);
  });
});

describe("letterSpacingForKind", () => {
  it("shout의 자간이 가장 넓다", () => {
    const shout = letterSpacingForKind("shout");
    expect(shout).toBeGreaterThan(letterSpacingForKind("emphasis"));
    expect(shout).toBeGreaterThan(letterSpacingForKind("plain"));
  });

  it("plain의 자간은 0이다", () => {
    expect(letterSpacingForKind("plain")).toBe(0);
  });
});
