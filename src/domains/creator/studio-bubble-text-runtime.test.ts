import { describe, expect, it } from "vitest";

import {
  BUBBLE_AUTO_SHRINK_MIN_FONT_DEFAULT,
  fitBubbleFontSize,
} from "./studio-bubble-text-fit";
import {
  BUBBLE_TEXT_MEASURER,
  bubbleAutoShrinkPreview,
  formatVerticalText,
} from "./studio-bubble-text-runtime";

import type { BubbleEl } from "./studio-element-model";

function bubble(overrides: Partial<BubbleEl> = {}): BubbleEl {
  return {
    id: "bubble-1",
    type: "bubble",
    variant: "speech",
    text: "첫 번째 대사\n두 번째 대사",
    x: 0,
    y: 0,
    width: 180,
    height: 100,
    fill: "#ffffff",
    textFill: "#111111",
    rotation: 0,
    autoShrinkText: true,
    ...overrides,
  };
}

describe("formatVerticalText", () => {
  it("stacks a horizontal line into one character per row", () => {
    expect(formatVerticalText("가나다")).toBe("가\n나\n다");
    expect(formatVerticalText("")).toBe("");
  });

  it("orders multiline columns from right to left and pads shorter columns", () => {
    expect(formatVerticalText("가나\nABC")).toBe("A  가\nB  나\nC  　");
  });
});

describe("bubbleAutoShrinkPreview", () => {
  it("skips measurement when fixed-size auto shrink is disabled", () => {
    expect(bubbleAutoShrinkPreview(bubble({ autoShrinkText: false }), 1.35)).toBeNull();
    expect(bubbleAutoShrinkPreview(bubble({ autoShrinkText: undefined }), 1.35)).toBeNull();
  });

  it("keeps horizontal preview inputs in parity with the shared fit engine", () => {
    const el = bubble({
      text: "가로쓰기 말풍선의 긴 대사를 자동으로 축소하는 미리보기",
      fontSize: 26,
      autoShrinkMinFontSize: 12,
      font: "Nanum Gothic, sans-serif",
      fontStyle: "italic",
    });
    const lineHeight = 1.35;

    expect(bubbleAutoShrinkPreview(el, lineHeight)).toEqual(
      fitBubbleFontSize(
        {
          text: el.text,
          boxWidth: el.width,
          boxHeight: el.height,
          maxFontSize: 26,
          minFontSize: 12,
          fontFamily: "Nanum Gothic, sans-serif",
          fontStyle: "italic",
          lineHeight,
        },
        BUBBLE_TEXT_MEASURER
      )
    );
  });

  it("uses the same vertical formatting and legacy defaults as the render path", () => {
    const el = bubble({
      text: "가나다라마바사",
      width: 100,
      height: 150,
      vertical: true,
      fontSize: undefined,
      autoShrinkMinFontSize: undefined,
    });
    const lineHeight = 1.4;
    const expected = fitBubbleFontSize(
      {
        text: formatVerticalText(el.text),
        boxWidth: el.width,
        boxHeight: el.height,
        maxFontSize: 24,
        minFontSize: BUBBLE_AUTO_SHRINK_MIN_FONT_DEFAULT,
        fontFamily: "Pretendard, sans-serif",
        fontStyle: "bold",
        lineHeight,
      },
      BUBBLE_TEXT_MEASURER
    );
    const unformatted = fitBubbleFontSize(
      {
        text: el.text,
        boxWidth: el.width,
        boxHeight: el.height,
        maxFontSize: 24,
        minFontSize: BUBBLE_AUTO_SHRINK_MIN_FONT_DEFAULT,
        fontFamily: "Pretendard, sans-serif",
        fontStyle: "bold",
        lineHeight,
      },
      BUBBLE_TEXT_MEASURER
    );

    expect(bubbleAutoShrinkPreview(el, lineHeight)).toEqual(expected);
    expect(expected.fontSize).toBeLessThan(unformatted.fontSize);
  });
});
