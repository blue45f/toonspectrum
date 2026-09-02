import { describe, expect, it } from "vitest";

import {
  WebtoonPlatformSpecValidator,
  WEBTOON_PLATFORM_SPECS,
} from "./webtoon-platform-spec-validator";

describe("WebtoonPlatformSpecValidator", () => {
  const validator = new WebtoonPlatformSpecValidator();

  it("includes all 6 major domestic and global platforms with accurate specs", () => {
    expect(WEBTOON_PLATFORM_SPECS["naver-webtoon"].recommendedWidthPx).toBe(690);
    expect(WEBTOON_PLATFORM_SPECS["kakao-page"].recommendedWidthPx).toBe(720);
    expect(WEBTOON_PLATFORM_SPECS["webtoon-canvas"].maxSliceHeightPx).toBe(1280);
    expect(WEBTOON_PLATFORM_SPECS["lezhin-comics"].maxFileSizeBytes).toBe(10 * 1024 * 1024);
    expect(WEBTOON_PLATFORM_SPECS.toptoon.recommendedWidthPx).toBe(800);
    expect(WEBTOON_PLATFORM_SPECS.postype.recommendedWidthPx).toBe(1600);
  });

  it("passes compliant Naver Webtoon canvas specifications", () => {
    const result = validator.audit("naver-webtoon", {
      width: 690,
      height: 15000,
      estimatedSizeBytes: 3 * 1024 * 1024,
      format: "jpg",
      panelGuttersPx: [250, 300, 400],
    });

    expect(result.overallGrade).toBe("pass");
    expect(result.isCompliant).toBe(true);
    expect(result.issues.length).toBe(0);
    expect(result.recommendedSliceCount).toBe(2);
  });

  it("flags non-compliant width and oversized file for Webtoon Canvas", () => {
    const result = validator.audit("webtoon-canvas", {
      width: 690, // Canvas requires 800
      height: 4000,
      estimatedSizeBytes: 3.5 * 1024 * 1024, // Exceeds 2MB
      format: "png", // Canvas requires jpg
    });

    expect(result.overallGrade).toBe("fail");
    expect(result.isCompliant).toBe(false);
    expect(result.issues.some((i) => i.field === "width")).toBe(true);
    expect(result.issues.some((i) => i.field === "size")).toBe(true);
    expect(result.issues.some((i) => i.field === "format")).toBe(true);
  });

  it("warns when panel gutters are too narrow or too wide", () => {
    const result = validator.audit("kakao-page", {
      width: 720,
      height: 8000,
      panelGuttersPx: [50, 1200], // 50 is too narrow (<120), 1200 is too wide (>900)
    });

    expect(result.overallGrade).toBe("warn");
    expect(result.issues.some((i) => i.field === "gutter")).toBe(true);
  });

  it("plans vertical auto slices avoiding protected panels/characters", () => {
    // 10,000px strip with slice target 3,000px
    // An element sits right across 3,000px (2,900px ~ 3,200px)
    const protectedElements = [
      { top: 2900, bottom: 3200, label: "Character Face Panel" },
      { top: 6100, bottom: 6500, label: "Action Cut" },
    ];

    const plan = validator.planAutoSlices(10000, 3000, protectedElements);

    expect(plan.sliceCount).toBeGreaterThanOrEqual(3);
    // Cut 1 should be shifted before 2900 (e.g. ~2880) so character is not cut
    expect(plan.slices[0].bottomY).toBeLessThanOrEqual(2900);
    expect(plan.safeSplitSuccessRate).toBeGreaterThan(70);
  });
});
