import { describe, expect, it } from "vitest";

import { productTourVoiceGuideText } from "./use-product-tour-voice-guide";

describe("product tour voice guide copy", () => {
  it("reads the active Korean chapter title and summary", () => {
    const text = productTourVoiceGuideText("ko", 1);
    expect(text).toContain("아이디어와 기획");
    expect(text).toContain("세계관");
  });

  it("falls back to the first chapter for an invalid index", () => {
    expect(productTourVoiceGuideText("en", 999)).toContain("What ToonStudio is");
  });
});
