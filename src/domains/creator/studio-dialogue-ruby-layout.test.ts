import { describe, expect, it } from "vitest";

import {
  estimateDialogueGlyphWidth,
  estimateDialogueTextAdvanceWidth,
  planDialogueRubyOverlayPlacements,
  planDialogueRubyRuns,
  readDialogueRubySpans,
} from "./studio-dialogue-ruby-layout";

describe("planDialogueRubyRuns", () => {
  it("returns a single base-only run when spans are absent or empty", () => {
    expect(planDialogueRubyRuns("hello", undefined)).toEqual([
      { base: "hello", start: 0, end: 5 },
    ]);
    expect(planDialogueRubyRuns("hello", [])).toEqual([
      { base: "hello", start: 0, end: 5 },
    ]);
    expect(planDialogueRubyRuns("", undefined)).toEqual([]);
    expect(planDialogueRubyRuns("", [])).toEqual([]);
  });

  it("interleaves base-only gaps with ruby runs and freezes the plan", () => {
    const runs = planDialogueRubyRuns("漢字テスト", [
      { start: 0, end: 2, ruby: "かんじ" },
    ]);
    expect(runs).toEqual([
      { base: "漢字", ruby: "かんじ", start: 0, end: 2 },
      { base: "テスト", start: 2, end: 5 },
    ]);
    expect(Object.isFrozen(runs)).toBe(true);
    expect(Object.isFrozen(runs[0])).toBe(true);
  });

  it("sorts spans by start and fills uncovered heads and tails", () => {
    const runs = planDialogueRubyRuns("AB漢字CD", [
      { start: 4, end: 6, ruby: "씨디" },
      { start: 2, end: 4, ruby: "かんじ" },
    ]);
    expect(runs).toEqual([
      { base: "AB", start: 0, end: 2 },
      { base: "漢字", ruby: "かんじ", start: 2, end: 4 },
      { base: "CD", ruby: "씨디", start: 4, end: 6 },
    ]);
  });

  it("drops overlapping later spans (first wins after sort) without mutating inputs", () => {
    const spans = Object.freeze([
      Object.freeze({ start: 0, end: 2, ruby: "first" }),
      Object.freeze({ start: 1, end: 3, ruby: "overlap" }),
      Object.freeze({ start: 3, end: 5, ruby: "tail" }),
    ]);
    const snapshot = structuredClone(spans);
    const runs = planDialogueRubyRuns("一二三四五", spans);
    expect(runs).toEqual([
      { base: "一二", ruby: "first", start: 0, end: 2 },
      { base: "三", start: 2, end: 3 },
      { base: "四五", ruby: "tail", start: 3, end: 5 },
    ]);
    expect(spans).toEqual(snapshot);
  });

  it("clamps out-of-range offsets and skips inverted, empty, or empty-ruby spans", () => {
    const runs = planDialogueRubyRuns("abcd", [
      { start: -2, end: 2, ruby: "head" },
      { start: 2, end: 2, ruby: "empty" },
      { start: 3, end: 1, ruby: "invert" },
      { start: 2, end: 4, ruby: "" },
      { start: 2, end: 99, ruby: "tail" },
    ]);
    // -2..2 clamps to 0..2 with ruby; 2..99 clamps to 2..4 with ruby after empty reading skipped.
    expect(runs).toEqual([
      { base: "ab", ruby: "head", start: 0, end: 2 },
      { base: "cd", ruby: "tail", start: 2, end: 4 },
    ]);
  });

  it("preserves UTF-16 code unit offsets for surrogate pairs", () => {
    // "𠮷野" — U+20BB7 is a surrogate pair (2 code units) + 野 (1) = 3 code units.
    const text = "𠮷野家";
    expect(text.length).toBe(4);
    const runs = planDialogueRubyRuns(text, [
      { start: 0, end: 2, ruby: "よし" },
      { start: 2, end: 3, ruby: "の" },
    ]);
    expect(runs).toEqual([
      { base: "𠮷", ruby: "よし", start: 0, end: 2 },
      { base: "野", ruby: "の", start: 2, end: 3 },
      { base: "家", start: 3, end: 4 },
    ]);
  });

  it("treats non-string text as empty and ignores non-array spans", () => {
    expect(planDialogueRubyRuns(null as never, undefined)).toEqual([]);
    expect(planDialogueRubyRuns("x", null as never)).toEqual([
      { base: "x", start: 0, end: 1 },
    ]);
  });
});

describe("estimateDialogueTextAdvanceWidth / glyph width", () => {
  it("treats CJK as ~1em and basic Latin as ~0.55em", () => {
    expect(estimateDialogueGlyphWidth("漢", 20)).toBe(20);
    expect(estimateDialogueGlyphWidth("A", 20)).toBeCloseTo(11);
    expect(estimateDialogueTextAdvanceWidth("漢字", 20)).toBe(40);
    expect(estimateDialogueTextAdvanceWidth("AB", 20)).toBeCloseTo(22);
    expect(estimateDialogueTextAdvanceWidth("A漢", 20)).toBeCloseTo(31);
  });

  it("applies letterSpacing between code points and handles surrogates as one glyph", () => {
    const text = "𠮷野";
    expect(text.length).toBe(3);
    expect(estimateDialogueTextAdvanceWidth(text, 10, 2)).toBe(10 + 2 + 10);
    expect(estimateDialogueTextAdvanceWidth("", 10)).toBe(0);
    expect(estimateDialogueTextAdvanceWidth("x", 0)).toBe(0);
  });
});

describe("readDialogueRubySpans", () => {
  it("returns undefined for absent or empty arrays and passes through non-empty", () => {
    expect(readDialogueRubySpans(undefined)).toBeUndefined();
    expect(readDialogueRubySpans([])).toBeUndefined();
    expect(readDialogueRubySpans("nope")).toBeUndefined();
    const spans = [{ start: 0, end: 1, ruby: "a" }];
    expect(readDialogueRubySpans(spans)).toBe(spans);
  });
});

describe("planDialogueRubyOverlayPlacements", () => {
  it("returns empty when there is no ruby reading to paint", () => {
    expect(
      planDialogueRubyOverlayPlacements("hello", undefined, { fontSize: 20 }),
    ).toEqual([]);
    expect(
      planDialogueRubyOverlayPlacements("", [{ start: 0, end: 1, ruby: "x" }], {
        fontSize: 20,
      }),
    ).toEqual([]);
    expect(
      planDialogueRubyOverlayPlacements("漢字", [{ start: 0, end: 2, ruby: "かんじ" }], {
        fontSize: 0,
      }),
    ).toEqual([]);
  });

  it("places a ruby overlay above the base segment with estimated advance", () => {
    const placements = planDialogueRubyOverlayPlacements(
      "AB漢字CD",
      [{ start: 2, end: 4, ruby: "かんじ" }],
      { fontSize: 20, letterSpacing: 0, align: "left" },
    );
    expect(placements).toHaveLength(1);
    const placement = placements[0]!;
    expect(placement).toMatchObject({
      base: "漢字",
      ruby: "かんじ",
      start: 2,
      end: 4,
      rubyFontSize: 9, // 20 * 0.45
    });
    // "AB" ≈ 0.55em * 2 * 20 = 22
    expect(placement.x).toBeCloseTo(22);
    expect(placement.baseWidth).toBe(40);
    expect(placement.y).toBeCloseTo(-9 * 0.9);
    expect(Object.isFrozen(placements)).toBe(true);
    expect(Object.isFrozen(placement)).toBe(true);
  });

  it("shifts origin for center/right align within the text box", () => {
    const text = "漢字";
    const total = estimateDialogueTextAdvanceWidth(text, 20);
    const centered = planDialogueRubyOverlayPlacements(
      text,
      [{ start: 0, end: 2, ruby: "かんじ" }],
      { fontSize: 20, textWidth: 100, align: "center" },
    );
    expect(centered[0]!.x).toBeCloseTo((100 - total) / 2);

    const right = planDialogueRubyOverlayPlacements(
      text,
      [{ start: 0, end: 2, ruby: "かんじ" }],
      { fontSize: 20, textWidth: 100, align: "right" },
    );
    expect(right[0]!.x).toBeCloseTo(100 - total);
  });

  it("honors custom rubySizeRatio and rubyY", () => {
    const placements = planDialogueRubyOverlayPlacements(
      "漢",
      [{ start: 0, end: 1, ruby: "かん" }],
      { fontSize: 40, rubySizeRatio: 0.5, rubyY: -12 },
    );
    expect(placements[0]).toMatchObject({
      rubyFontSize: 20,
      y: -12,
      x: 0,
      baseWidth: 40,
    });
  });
});
