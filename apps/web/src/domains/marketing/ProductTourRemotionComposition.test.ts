import { describe, expect, it } from "vitest";

import {
  productTourBgmGainAtFrame,
  productTourCaptionAtFrame,
} from "./product-tour-remotion-timeline";

const fps = 30;

describe("ProductTourRemotionComposition", () => {
  it("ducks the score during narration and restores it after release", () => {
    expect(productTourBgmGainAtFrame(0, fps)).toBe(1);
    expect(productTourBgmGainAtFrame(Math.round(1 * fps), fps)).toBeCloseTo(0.24, 4);
    expect(productTourBgmGainAtFrame(Math.round(5.3 * fps), fps)).toBeGreaterThan(0.24);
    expect(productTourBgmGainAtFrame(Math.round(7 * fps), fps)).toBe(1);
  });

  it("selects localized captions from the same narration cue source", () => {
    expect(productTourCaptionAtFrame(Math.round(1 * fps), fps, "ko")).toContain("툰스튜디오");
    expect(productTourCaptionAtFrame(Math.round(1 * fps), fps, "en")).toContain("ToonStudio");
    expect(productTourCaptionAtFrame(Math.round(8 * fps), fps, "ko")).toBeNull();
  });
});
