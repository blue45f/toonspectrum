import { describe, expect, it } from "vitest";

import { evaluateStudioLocalizationLayout } from "./studio-localization-layout";

const BASE = Object.freeze({
  id: "balloon-1",
  locale: "ko",
  text: "오늘도 좋은 하루예요.",
  boxWidthPx: 280,
  boxHeightPx: 120,
  paddingPx: 16,
  fontSizePx: 22,
  minimumFontSizePx: 16,
  lineHeight: 1.4,
  verticalWriting: false,
  unsupportedCharacters: [],
});

describe("Studio localization layout", () => {
  it("keeps text that already fits", () => {
    expect(evaluateStudioLocalizationLayout(BASE)).toMatchObject({
      status: "fit",
      recommendedFontSizePx: 22,
      issues: [],
    });
  });

  it("reduces font size only within the approved minimum", () => {
    const result = evaluateStudioLocalizationLayout({
      ...BASE,
      text: "This translated line is longer than the original but should still fit after a careful size adjustment.",
      locale: "en",
      boxHeightPx: 150,
    });
    expect(["adjust", "overflow"]).toContain(result.status);
    expect(result.recommendedFontSizePx).toBeGreaterThanOrEqual(16);
  });

  it("reports overflow instead of silently clipping or truncating", () => {
    const result = evaluateStudioLocalizationLayout({
      ...BASE,
      text: "아주 긴 번역문 ".repeat(30),
      boxWidthPx: 120,
      boxHeightPx: 80,
    });
    expect(result).toMatchObject({
      status: "overflow",
      recommendedFontSizePx: 16,
      issues: ["balloon-overflow", "resize-or-reletter"],
    });
  });

  it("supports vertical writing and blocks missing glyph coverage", () => {
    expect(evaluateStudioLocalizationLayout({
      ...BASE,
      verticalWriting: true,
      boxWidthPx: 120,
      boxHeightPx: 300,
    }).estimatedColumns).toBeGreaterThanOrEqual(1);
    expect(evaluateStudioLocalizationLayout({
      ...BASE,
      unsupportedCharacters: ["𠮷"],
    })).toMatchObject({ status: "blocked", issues: ["unsupported-glyphs"] });
  });
});
