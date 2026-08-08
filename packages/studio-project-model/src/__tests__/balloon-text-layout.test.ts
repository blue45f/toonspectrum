import { describe, expect, it } from "vitest";

import {
  LINE_END_PROHIBITED,
  LINE_START_PROHIBITED,
  ellipseChordWidth,
  fitBalloonText,
  layoutBalloonLines,
  segmentForWrapping,
  wrapBalloonText,
} from "../ir/balloon-text-layout";

/** Measurement stub: every grapheme (code point) is 10px wide. */
const px = (text: string): number => [...text].length * 10;

describe("segmentForWrapping", () => {
  it("keeps Hangul eojeol whole, splits Han/kana per character, round-trips losslessly", () => {
    const text = "감사 합니다\n春眠 ありがとう";
    const units = segmentForWrapping(text);
    expect(units.map((unit) => unit.text).join("")).toBe(text);
    expect(units[0]).toEqual({ text: "감사", kind: "word" });
    expect(units[1]).toEqual({ text: " ", kind: "space" });
    expect(units[2]).toEqual({ text: "합니다", kind: "word" });
    expect(units[3]).toEqual({ text: "\n", kind: "newline" });
    // Han and kana runs become per-character break candidates.
    expect(units[4]).toEqual({ text: "春", kind: "cjk" });
    expect(units[5]).toEqual({ text: "眠", kind: "cjk" });
    const kana = units.filter((unit) => unit.kind === "cjk").map((u) => u.text);
    expect(kana).toEqual(["春", "眠", "あ", "り", "が", "と", "う"]);
  });

  it("returns an empty unit list for the empty string", () => {
    expect(segmentForWrapping("")).toEqual([]);
  });

  it("declares the spec-mandated kinsoku characters", () => {
    for (const ch of "」』）？！、。") {
      expect(LINE_START_PROHIBITED.has(ch)).toBe(true);
    }
    for (const ch of "「『（") {
      expect(LINE_END_PROHIBITED.has(ch)).toBe(true);
    }
  });
});

describe("wrapBalloonText", () => {
  it("wraps Korean at eojeol boundaries (char-count measure stub)", () => {
    const result = wrapBalloonText("안녕하세요 좋은 아침", {
      maxWidthPx: 50,
      measure: px,
    });
    expect(result.lines).toEqual(["안녕하세요", "좋은 아침"]);
    expect(result.overflow).toBe("");
  });

  it("never splits an eojeol that fits its line", () => {
    const result = wrapBalloonText("감사 합니다", {
      maxWidthPx: 30,
      measure: px,
    });
    expect(result.lines).toEqual(["감사", "합니다"]);
    expect(result.overflow).toBe("");
  });

  it("wraps Han text at character boundaries", () => {
    const result = wrapBalloonText("春眠不覚暁処処聞啼鳥", {
      maxWidthPx: 40,
      measure: px,
      locale: "ja",
    });
    expect(result.lines).toEqual(["春眠不覚", "暁処処聞", "啼鳥"]);
    expect(result.overflow).toBe("");
  });

  it("wraps kana at character boundaries", () => {
    const result = wrapBalloonText("ありがとうございます", {
      maxWidthPx: 40,
      measure: px,
      locale: "ja",
    });
    expect(result.lines).toEqual(["ありがと", "うござい", "ます"]);
    expect(result.overflow).toBe("");
  });

  it("pulls line-start-prohibited punctuation onto the previous line (hanging)", () => {
    // "!" alone would head line 2 — pulled up even though the line overflows.
    expect(
      wrapBalloonText("고마워요!", { maxWidthPx: 40, measure: px }).lines,
    ).toEqual(["고마워요!"]);
    expect(
      wrapBalloonText("こんにちは、みなさん。", {
        maxWidthPx: 50,
        measure: px,
        locale: "ja",
      }).lines,
    ).toEqual(["こんにちは、", "みなさん。"]);
  });

  it("pushes line-end-prohibited opening brackets down to the next line", () => {
    const result = wrapBalloonText("다음은（인용）입니다", {
      maxWidthPx: 40,
      measure: px,
    });
    expect(result.lines).toEqual(["다음은", "（인용）", "입니다"]);
    expect(result.overflow).toBe("");
  });

  it("honors hard newlines and skips kinsoku across them", () => {
    const result = wrapBalloonText("안녕\n！제목", {
      maxWidthPx: 990,
      measure: px,
    });
    // Author's break wins: "！" stays at the head of the authored line.
    expect(result.lines).toEqual(["안녕", "！제목"]);
  });

  it("force-splits a single eojeol wider than the line at grapheme boundaries", () => {
    const result = wrapBalloonText("가나다라마바사", {
      maxWidthPx: 30,
      measure: px,
    });
    expect(result.lines).toEqual(["가나다", "라마바", "사"]);
    expect(result.overflow).toBe("");
  });

  it("caps at maxLines and returns the exact remainder as overflow by default", () => {
    const result = wrapBalloonText("안녕하세요 반갑습니다 잘부탁해요", {
      maxWidthPx: 50,
      measure: px,
      maxLines: 1,
    });
    expect(result.lines).toEqual(["안녕하세요"]);
    expect(result.overflow).toBe("반갑습니다 잘부탁해요");
  });

  it("applies the explicit ellipsis option without quiet loss", () => {
    const result = wrapBalloonText("안녕하세요 반갑습니다 잘부탁해요", {
      maxWidthPx: 50,
      measure: px,
      maxLines: 2,
      ellipsis: "…",
    });
    expect(result.lines).toEqual(["안녕하세요", "반갑습니…"]);
    // Trimmed "다" is prepended to the overflow — nothing disappears.
    expect(result.overflow).toBe("다잘부탁해요");
    expect(px(result.lines[1])).toBeLessThanOrEqual(50);
  });

  it("returns no lines and no overflow for the empty string", () => {
    expect(wrapBalloonText("", { maxWidthPx: 100, measure: px })).toEqual({
      lines: [],
      overflow: "",
    });
  });

  it("is deterministic across repeated calls", () => {
    const options = { maxWidthPx: 40, measure: px } as const;
    const text = "다음은（인용）입니다 고마워요!";
    expect(wrapBalloonText(text, options)).toEqual(
      wrapBalloonText(text, options),
    );
  });
});

describe("layoutBalloonLines", () => {
  it("places rect lines vertically centered with left/center/right alignment", () => {
    const lines = ["가나", "가나다라"];
    const base = {
      shape: "rect",
      width: 100,
      height: 100,
      lineHeightPx: 20,
      measure: px,
    } as const;
    const left = layoutBalloonLines(lines, { ...base, align: "left" });
    expect(left.map((line) => line.y)).toEqual([30, 50]);
    expect(left.map((line) => line.availableWidth)).toEqual([100, 100]);
    expect(left.map((line) => line.x)).toEqual([0, 0]);
    const center = layoutBalloonLines(lines, { ...base, align: "center" });
    expect(center.map((line) => line.x)).toEqual([40, 30]);
    const right = layoutBalloonLines(lines, { ...base, align: "right" });
    expect(right.map((line) => line.x)).toEqual([80, 60]);
  });

  it("gives ellipse lines the chord width of their band (center wider than top)", () => {
    // 200×120 ellipse (a = 60, b = 100), three 30px lines centered: block top
    // 15. Outer lines' far edge is 45 from center, middle line's is 15:
    //   outer  = 2·100·√(1 − (45/60)²) = 200·√0.4375 ≈ 132.2876
    //   middle = 2·100·√(1 − (15/60)²) = 200·√0.9375 ≈ 193.6492
    const placed = layoutBalloonLines(["가", "나", "다"], {
      shape: "ellipse",
      width: 200,
      height: 120,
      lineHeightPx: 30,
      align: "center",
      measure: px,
    });
    expect(placed.map((line) => line.y)).toEqual([15, 45, 75]);
    expect(placed[0].availableWidth).toBeCloseTo(132.2876, 3);
    expect(placed[1].availableWidth).toBeCloseTo(193.6492, 3);
    expect(placed[2].availableWidth).toBeCloseTo(132.2876, 3);
    expect(placed[1].availableWidth).toBeGreaterThan(placed[0].availableWidth);
  });

  it("computes the ellipse chord 2·b·√(1 − (y/a)²) exactly", () => {
    expect(ellipseChordWidth(0, 45, 100)).toBeCloseTo(200, 10);
    expect(ellipseChordWidth(22.5, 45, 100)).toBeCloseTo(
      200 * Math.sqrt(0.75),
      10,
    );
    expect(ellipseChordWidth(45, 45, 100)).toBe(0);
    expect(ellipseChordWidth(60, 45, 100)).toBe(0); // outside — no NaN
  });
});

describe("fitBalloonText", () => {
  const han40 = "山川草木風花雪月".repeat(5); // 40 chars, 400px at the stub

  it("converges inside an ellipse by escalating line count (bounded iterations)", () => {
    const result = fitBalloonText(han40, {
      shape: "ellipse",
      width: 200,
      height: 120,
      lineHeightPx: 30,
      align: "center",
      measure: px,
      locale: "ja",
    });
    expect(result.fitted).toBe(true);
    expect(result.overflow).toBe("");
    // n=1 (19 chars max) and n=2 (17+17) overflow; n=3 (13+19+13 capacity) fits.
    expect(result.iterations).toBe(3);
    expect(result.lines.map((line) => [...line.text].length)).toEqual([
      13, 19, 8,
    ]);
    for (const line of result.lines) {
      expect(px(line.text)).toBeLessThanOrEqual(line.availableWidth + 1e-6);
    }
    expect(result.lines.map((line) => line.y)).toEqual([15, 45, 75]);
  });

  it("fits rect lanes in a single pass", () => {
    const result = fitBalloonText("안녕하세요 반가워요", {
      shape: "rect",
      width: 50,
      height: 70,
      lineHeightPx: 30,
      align: "left",
      measure: px,
    });
    expect(result.fitted).toBe(true);
    expect(result.iterations).toBe(1);
    expect(result.lines.map((line) => line.text)).toEqual([
      "안녕하세요",
      "반가워요",
    ]);
    expect(result.lines.map((line) => line.y)).toEqual([5, 35]);
    expect(result.lines.map((line) => line.x)).toEqual([0, 0]);
  });

  it("returns honest overflow when the balloon cannot hold the text", () => {
    const text = "가나다라마바사아자차";
    const result = fitBalloonText(text, {
      shape: "ellipse",
      width: 60,
      height: 40,
      lineHeightPx: 30,
      align: "center",
      measure: px,
    });
    expect(result.fitted).toBe(false);
    expect(result.lines.map((line) => line.text)).toEqual(["가나다"]);
    expect(result.overflow).toBe("라마바사아자차");
    // No quiet loss: placed text + overflow reconstructs the source.
    expect(result.lines.map((line) => line.text).join("") + result.overflow).toBe(
      text,
    );
    expect(result.lines[0].availableWidth).toBeCloseTo(
      60 * Math.sqrt(0.4375),
      3,
    );
  });

  it("applies the ellipsis option on overflow, keeping trimmings in overflow", () => {
    const result = fitBalloonText("가나다라마바사아자차", {
      shape: "ellipse",
      width: 60,
      height: 40,
      lineHeightPx: 30,
      align: "center",
      measure: px,
      ellipsis: "…",
    });
    expect(result.fitted).toBe(false);
    expect(result.lines.map((line) => line.text)).toEqual(["가나…"]);
    expect(result.overflow).toBe("다라마바사아자차");
  });

  it("handles the empty string and a balloon shorter than one line honestly", () => {
    expect(
      fitBalloonText("", {
        shape: "ellipse",
        width: 100,
        height: 50,
        lineHeightPx: 20,
        align: "center",
        measure: px,
      }),
    ).toEqual({ lines: [], overflow: "", iterations: 0, fitted: true });
    const tooShort = fitBalloonText("안녕", {
      shape: "rect",
      width: 100,
      height: 10,
      lineHeightPx: 20,
      align: "center",
      measure: px,
    });
    expect(tooShort.lines).toEqual([]);
    expect(tooShort.overflow).toBe("안녕");
    expect(tooShort.fitted).toBe(false);
  });

  it("is deterministic across repeated calls", () => {
    const options = {
      shape: "ellipse",
      width: 200,
      height: 120,
      lineHeightPx: 30,
      align: "center",
      measure: px,
      locale: "ja",
    } as const;
    expect(fitBalloonText(han40, options)).toEqual(
      fitBalloonText(han40, options),
    );
  });
});
