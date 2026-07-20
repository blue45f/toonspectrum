import { describe, expect, it } from "vitest";

import {
  collapseStudioMobileSheetSnap,
  expandStudioMobileSheetSnap,
  nextStudioMobileSheetSnap,
  studioMobileSheetSizeStyle,
  studioMobileSheetSnapLabel,
  studioMobileSheetSnapValue,
} from "./studio-mobile-sheet-snap";

describe("studio mobile sheet snap", () => {
  it("expands and collapses exactly one level, dismissing only below compact", () => {
    expect(expandStudioMobileSheetSnap("compact")).toBe("medium");
    expect(expandStudioMobileSheetSnap("medium")).toBe("full");
    expect(expandStudioMobileSheetSnap("full")).toBe("full");

    expect(collapseStudioMobileSheetSnap("full")).toBe("medium");
    expect(collapseStudioMobileSheetSnap("medium")).toBe("compact");
    expect(collapseStudioMobileSheetSnap("compact")).toBeNull();
  });

  it("cycles handle taps without conflating resize with close", () => {
    expect(nextStudioMobileSheetSnap("compact")).toBe("medium");
    expect(nextStudioMobileSheetSnap("medium")).toBe("full");
    expect(nextStudioMobileSheetSnap("full")).toBe("compact");
  });

  it("describes each snap in Korean and clamps unsafe keyboard insets", () => {
    expect(studioMobileSheetSnapLabel("compact")).toBe("작게");
    expect(studioMobileSheetSnapLabel("medium")).toBe("중간");
    expect(studioMobileSheetSnapLabel("full")).toBe("크게");
    expect(studioMobileSheetSnapValue("compact")).toBe(0);
    expect(studioMobileSheetSnapValue("medium")).toBe(1);
    expect(studioMobileSheetSnapValue("full")).toBe(2);

    expect(studioMobileSheetSizeStyle("medium", 181.6)).toEqual({
      height: "min(58dvh, calc(100dvh - env(safe-area-inset-top) - 0.75rem - 182px))",
      maxHeight: "min(58dvh, calc(100dvh - env(safe-area-inset-top) - 0.75rem - 182px))",
    });
    expect(studioMobileSheetSizeStyle("compact", -20).height).toContain("- 0px)");
    expect(studioMobileSheetSizeStyle("full", Number.NaN).height).toContain("88dvh");
  });
});
