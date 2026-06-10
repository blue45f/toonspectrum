import { describe, expect, it } from "vitest";

import {
  MAX_CANVAS_DIM,
  exportMimeType,
  maxFittingScale,
  pageExportFileName,
  splitPagesForExport,
  stripExportFileName,
  stripTotalHeight,
} from "./studio-export";

describe("exportMimeType", () => {
  it("maps formats to canvas mime types", () => {
    expect(exportMimeType("png")).toBe("image/png");
    expect(exportMimeType("jpg")).toBe("image/jpeg");
  });
});

describe("pageExportFileName", () => {
  it("keeps the legacy naming rule including the transparent suffix", () => {
    expect(pageExportFileName("내 컷툰", "png", false)).toBe("내 컷툰.png");
    expect(pageExportFileName("내 컷툰", "png", true)).toBe("내 컷툰-transparent.png");
    expect(pageExportFileName("  ", "jpg", false)).toBe("toonspectrum-comic.jpg");
  });
});

describe("stripExportFileName", () => {
  it("keeps the legacy strip name for a single file", () => {
    expect(stripExportFileName("내 웹툰", "png")).toBe("내 웹툰-strip.png");
    expect(stripExportFileName("", "png", { index: 0, total: 1 })).toBe("toonspectrum-webtoon-strip.png");
  });

  it("appends a part suffix when split into multiple files", () => {
    expect(stripExportFileName("내 웹툰", "jpg", { index: 0, total: 3 })).toBe("내 웹툰-strip-1of3.jpg");
    expect(stripExportFileName("내 웹툰", "png", { index: 2, total: 3 })).toBe("내 웹툰-strip-3of3.png");
  });
});

describe("stripTotalHeight", () => {
  it("sums page heights with spacing between pages only", () => {
    expect(stripTotalHeight([1080, 1080, 1080], 24)).toBe(1080 * 3 + 24 * 2);
    expect(stripTotalHeight([1080], 24)).toBe(1080);
    expect(stripTotalHeight([], 24)).toBe(0);
  });

  it("scales the whole strip including spacing", () => {
    expect(stripTotalHeight([1080, 1080], 24, 2)).toBe((1080 * 2 + 24) * 2);
  });
});

describe("maxFittingScale", () => {
  it("returns the requested scale when it already fits", () => {
    expect(maxFittingScale([1080, 1080, 1080], 24, 2)).toBe(2);
  });

  it("downgrades to the largest fitting scale", () => {
    // 5페이지 × 2880px ≈ 14,496px → 2×(28,992)는 한계 초과, 1×는 통과.
    const heights = Array.from({ length: 5 }, () => 2880);
    expect(stripTotalHeight(heights, 24, 2)).toBeGreaterThan(MAX_CANVAS_DIM);
    expect(maxFittingScale(heights, 24, 2)).toBe(1);
  });

  it("returns null when even 1x exceeds the limit", () => {
    const heights = Array.from({ length: 12 }, () => 2880);
    expect(maxFittingScale(heights, 24, 3)).toBeNull();
  });
});

describe("splitPagesForExport", () => {
  it("keeps everything in one chunk when it fits", () => {
    expect(splitPagesForExport([1080, 1080, 1080], 24, 2)).toEqual([[0, 1, 2]]);
  });

  it("splits consecutive pages so each file stays under the limit", () => {
    // 2880px × 2배율 = 5760px/페이지 → 파일당 2장(11,568px)까지, 3장(17,376px)은 초과.
    const heights = Array.from({ length: 6 }, () => 2880);
    expect(splitPagesForExport(heights, 24, 2)).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
  });

  it("keeps an oversized single page as its own chunk", () => {
    expect(splitPagesForExport([20000, 1080], 24, 1)).toEqual([[0], [1]]);
  });

  it("covers every page exactly once in order", () => {
    const heights = [1080, 2880, 6000, 480, 2880, 1080];
    const chunks = splitPagesForExport(heights, 24, 3);
    expect(chunks.flat()).toEqual([0, 1, 2, 3, 4, 5]);
    for (const chunk of chunks) {
      const chunkHeights = chunk.map((i) => heights[i]);
      // 한 묶음짜리 초대형 페이지를 빼면 모든 파일이 한계 안이어야 한다.
      if (chunk.length > 1) {
        expect(stripTotalHeight(chunkHeights, 24, 3)).toBeLessThanOrEqual(MAX_CANVAS_DIM);
      }
    }
  });
});
