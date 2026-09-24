import { describe, expect, it } from "vitest";

import {
  normalizeStudioPublicationCover,
  readStudioPublicationCover,
  resolveStudioPublicationCoverPageIndex,
  resolveStudioPublicationCoverCropRect,
  writeStudioPublicationCover,
} from "./studio-publication-cover";

describe("studio publication cover", () => {
  it("normalizes one stable 3:4 cover selection and clamps its focal point", () => {
    expect(normalizeStudioPublicationCover({
      version: 1,
      pageIndex: 2,
      focalX: 1.8,
      focalY: -0.3,
      aspectRatio: "legacy-value-is-ignored",
    })).toEqual({
      version: 1,
      pageIndex: 2,
      focalX: 1,
      focalY: 0,
      aspectRatio: "3:4",
    });
    expect(normalizeStudioPublicationCover({ version: 1, pageIndex: 40 })).toBeNull();
    expect(normalizeStudioPublicationCover({ version: 2, pageIndex: 0 })).toBeNull();
  });

  it("writes and reads cover metadata without replacing the rest of the publication document", () => {
    const metadata = normalizeStudioPublicationCover({
      version: 1,
      pageIndex: 1,
      focalX: 0.25,
      focalY: 0.75,
    });
    const document = writeStudioPublicationCover({ title: "작품" }, metadata);

    expect(document.title).toBe("작품");
    expect(readStudioPublicationCover(document)).toEqual(metadata);
    expect(writeStudioPublicationCover(document, null)).toEqual({ title: "작품" });
  });

  it("falls back to the first page when saved cover metadata is stale", () => {
    const metadata = normalizeStudioPublicationCover({
      version: 1,
      pageIndex: 3,
      focalX: 0.5,
      focalY: 0.5,
    });
    expect(resolveStudioPublicationCoverPageIndex(metadata, 4)).toBe(3);
    expect(resolveStudioPublicationCoverPageIndex(metadata, 2)).toBe(0);
    expect(resolveStudioPublicationCoverPageIndex(null, 2)).toBe(0);
    expect(resolveStudioPublicationCoverPageIndex(metadata, 0)).toBeNull();
  });

  it("crops wide and tall artwork around the selected focal point", () => {
    expect(resolveStudioPublicationCoverCropRect(1600, 1000, 1, 0.5)).toEqual({
      x: 850,
      y: 0,
      width: 750,
      height: 1000,
    });
    expect(resolveStudioPublicationCoverCropRect(800, 1600, 0.5, 1)).toEqual({
      x: 0,
      y: 1600 - (800 / 0.75),
      width: 800,
      height: 800 / 0.75,
    });
    expect(() => resolveStudioPublicationCoverCropRect(0, 1000, 0.5, 0.5)).toThrow(
      "표지 크롭 영역을 계산할 수 없습니다.",
    );
  });
});
