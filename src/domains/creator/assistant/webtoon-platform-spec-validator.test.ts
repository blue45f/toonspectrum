import { describe, expect, it } from "vitest";

import {
  WebtoonPlatformSpecValidator,
  WEBTOON_PLATFORM_SPECS,
} from "./webtoon-platform-spec-validator";

describe("WebtoonPlatformSpecValidator", () => {
  const validator = new WebtoonPlatformSpecValidator();

  it("keeps all six platform profiles while exposing evidence authority", () => {
    expect(Object.keys(WEBTOON_PLATFORM_SPECS)).toHaveLength(6);
    expect(WEBTOON_PLATFORM_SPECS["naver-webtoon"].recommendedWidthPx).toBe(690);
    expect(WEBTOON_PLATFORM_SPECS["naver-webtoon"].specAuthority).toBe("official");
    expect(WEBTOON_PLATFORM_SPECS["naver-webtoon"].verifiedFields).toEqual([
      "width",
      "size",
      "total-size",
      "format",
    ]);
    expect(WEBTOON_PLATFORM_SPECS["webtoon-canvas"].maxSliceHeightPx).toBe(1280);
    expect(WEBTOON_PLATFORM_SPECS["webtoon-canvas"].supportsAutomaticLongImageSlicing).toBe(true);
    expect(WEBTOON_PLATFORM_SPECS["kakao-page"].specAuthority).toBe("advisory");
  });

  it("passes the official Naver width, GIF, file-size, and total-size constraints", () => {
    const result = validator.audit("naver-webtoon", {
      width: 690,
      height: 15000,
      estimatedSizeBytes: 3 * 1024 * 1024,
      estimatedTotalSizeBytes: 49 * 1024 * 1024,
      format: "gif",
      panelGuttersPx: [250, 300, 400],
    });

    expect(result.overallGrade).toBe("pass");
    expect(result.isCompliant).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.recommendedSliceCount).toBe(2);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.issues)).toBe(true);
  });

  it("rejects PNG for Naver challenge comics and reports the official 50MB episode limit", () => {
    const result = validator.audit("naver-webtoon", {
      width: 690,
      height: 15000,
      estimatedTotalSizeBytes: 51 * 1024 * 1024,
      format: "png",
    });

    expect(result.overallGrade).toBe("fail");
    expect(result.issues.some((issue) => issue.field === "format")).toBe(true);
    expect(result.issues.some((issue) => issue.field === "total-size")).toBe(true);
  });

  it("flags non-compliant width and oversized working-profile file for Webtoon Canvas", () => {
    const result = validator.audit("webtoon-canvas", {
      width: 690,
      height: 4000,
      estimatedSizeBytes: 3.5 * 1024 * 1024,
      format: "png",
    });

    expect(result.overallGrade).toBe("fail");
    expect(result.isCompliant).toBe(false);
    expect(result.issues.some((issue) => issue.field === "width")).toBe(true);
    expect(result.issues.some((issue) => issue.field === "height")).toBe(true);
    expect(result.issues.some((issue) => issue.field === "size")).toBe(true);
    expect(result.issues.some((issue) => issue.field === "format")).toBe(true);
    expect(result.issues.find((issue) => issue.field === "height")?.message).toContain(
      "자동 분할",
    );
  });

  it("fails invalid canvas dimensions instead of producing NaN audit data", () => {
    const result = validator.audit("naver-webtoon", {
      width: Number.NaN,
      height: 0,
      format: "jpg",
    });

    expect(result.overallGrade).toBe("fail");
    expect(result.recommendedSliceCount).toBe(1);
    expect(result.issues.some((issue) => issue.field === "width")).toBe(true);
    expect(result.issues.some((issue) => issue.field === "height")).toBe(true);
  });

  it("warns for invalid, narrow, and overly wide panel gutters", () => {
    const result = validator.audit("kakao-page", {
      width: 720,
      height: 8000,
      panelGuttersPx: [Number.NaN, -1, 50, 1200],
    });

    expect(result.overallGrade).toBe("warn");
    expect(result.issues.filter((issue) => issue.field === "gutter")).toHaveLength(3);
  });

  it("plans vertical slices without crossing protected panels or characters", () => {
    const protectedElements = [
      { top: 2900, bottom: 3200, label: "Character Face Panel" },
      { top: 6100, bottom: 6500, label: "Action Cut" },
    ];

    const plan = validator.planAutoSlices(10000, 3000, protectedElements);

    expect(plan.sliceCount).toBe(4);
    expect(plan.cutCount).toBe(plan.sliceCount - 1);
    expect(plan.slices[0]?.bottomY).toBe(2880);
    expect(plan.safeCutCount).toBe(3);
    expect(plan.unsafeCutCount).toBe(0);
    expect(plan.safeSplitSuccessRate).toBe(100);
    expect(Object.isFrozen(plan.slices)).toBe(true);
  });

  it("merges overlapping and reversed protected bounds before choosing a cut", () => {
    const plan = validator.planAutoSlices(7000, 3000, [
      { top: 3100, bottom: 2800 },
      { top: 3000, bottom: 3400 },
      { top: Number.NaN, bottom: 5000 },
    ]);

    expect(plan.slices[0]?.bottomY).toBe(2780);
    expect(plan.unsafeCutCount).toBe(0);
  });

  it("calculates safety rate from actual cuts and excludes the terminal slice", () => {
    const plan = validator.planAutoSlices(5000, 2000, [
      { top: 1, bottom: 2500, label: "Unavoidable opening panel" },
    ]);

    expect(plan.sliceCount).toBe(3);
    expect(plan.cutCount).toBe(2);
    expect(plan.safeCutCount).toBe(1);
    expect(plan.unsafeCutCount).toBe(1);
    expect(plan.safeSplitSuccessRate).toBe(50);
  });

  it("returns 100 percent when a short page needs no split", () => {
    const plan = validator.planAutoSlices(1000, 2000);
    expect(plan.sliceCount).toBe(1);
    expect(plan.cutCount).toBe(0);
    expect(plan.safeSplitSuccessRate).toBe(100);
  });

  it("rejects non-positive slice inputs instead of entering a zero-progress loop", () => {
    expect(() => validator.planAutoSlices(0, 1000)).toThrow(RangeError);
    expect(() => validator.planAutoSlices(1000, 0)).toThrow(RangeError);
    expect(() => validator.planAutoSlices(Number.POSITIVE_INFINITY, 1000)).toThrow(RangeError);
  });
});
