import { describe, expect, it } from "vitest";

import {
  buildPublishPackageManifest,
  executePreflightCheck,
  type ManuscriptSliceInput,
} from "./studio-preflight-publisher";

describe("Studio Preflight Verification & Platform Publish Engine", () => {
  function makeSlice(index: number, partial: Partial<ManuscriptSliceInput> = {}): ManuscriptSliceInput {
    return {
      sliceIndex: index,
      widthPx: 690, // Naver default
      heightPx: 3000,
      sizeKb: 500,
      format: "jpg",
      colorSpace: "sRGB",
      dpi: 72,
      minFontSizeInSlice: 16,
      ...partial,
    };
  }

  it("passes preflight for compliant Naver Webtoon slices", () => {
    const slices = [makeSlice(1), makeSlice(2), makeSlice(3)];
    const report = executePreflightCheck(slices, "naver-webtoon", { ageRating: "all-ages" });

    expect(report.passed).toBe(true);
    expect(report.errorsCount).toBe(0);
    expect(report.totalSlices).toBe(3);
    expect(report.totalPayloadMb).toBeCloseTo(1.46, 1);
  });

  it("catches width mismatch and excessive file size errors", () => {
    const slices = [
      makeSlice(1, { widthPx: 720 }), // Wrong width for Naver (requires 690)
      makeSlice(2, { sizeKb: 3000 }), // Exceeds 2048KB limit
    ];
    const report = executePreflightCheck(slices, "naver-webtoon", { ageRating: "all-ages" });

    expect(report.passed).toBe(false);
    expect(report.errorsCount).toBe(2);
    expect(report.diagnostics.some((d) => d.code === "INVALID_WIDTH")).toBe(true);
    expect(report.diagnostics.some((d) => d.code === "SLICE_SIZE_EXCEEDED")).toBe(true);
  });

  it("warns about low font size on mobile and missing age rating", () => {
    const slices = [makeSlice(1, { minFontSizeInSlice: 9 })]; // <12px
    const report = executePreflightCheck(slices, "naver-webtoon"); // no ageRating

    expect(report.warningsCount).toBe(2);
    expect(report.diagnostics.some((d) => d.code === "TEXT_TOO_SMALL")).toBe(true);
    expect(report.diagnostics.some((d) => d.code === "AGE_RATING_MISSING")).toBe(true);
  });

  it("builds complete publish package manifest with metadata", () => {
    const slices = [makeSlice(1)];
    const manifest = buildPublishPackageManifest({
      episodeId: "ep_101",
      episodeTitle: "101화 - 새로운 시작",
      targetPlatform: "naver-webtoon",
      ageRating: "age-15",
      contentWarnings: ["violence"],
      coverImageRef: "cover_101.jpg",
      slices,
      nowMs: 1_700_000_000_000,
    });

    expect(manifest.episodeTitle).toBe("101화 - 새로운 시작");
    expect(manifest.ageRating).toBe("age-15");
    expect(manifest.contentWarnings).toEqual(["violence"]);
    expect(manifest.preflight.passed).toBe(true);
  });
});
