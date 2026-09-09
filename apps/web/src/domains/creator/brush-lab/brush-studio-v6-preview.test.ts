import { describe, expect, it } from "vitest";

import { mixPreviewPigments } from "./brush-studio-v6-preview";

describe("Brush Studio V6 pigment preview", () => {
  it("keeps the subtractive preview deterministic", () => {
    expect(mixPreviewPigments("#1d4ed8", "#eab308", 0.5)).toBe(mixPreviewPigments("#1d4ed8", "#eab308", 0.5));
  });

  it("does not collapse a mixed pigment to either endpoint", () => {
    const mixed = mixPreviewPigments("#1d4ed8", "#eab308", 0.5);
    expect(mixed).not.toBe("rgba(29,78,216,1)");
    expect(mixed).not.toBe("rgba(234,179,8,1)");
  });
});
