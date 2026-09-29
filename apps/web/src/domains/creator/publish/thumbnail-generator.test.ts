import { describe, expect, it } from "vitest";

import {
  computeThumbnailCoverCrop,
  publishThumbnailFileName,
} from "./thumbnail-generator";

describe("computeThumbnailCoverCrop", () => {
  it("원본이 더 넓으면 가로를 잘라낸다", () => {
    const crop = computeThumbnailCoverCrop(1600, 900, 800, 800);
    expect(crop).not.toBeNull();
    // 목표 1:1 → 원본 16:9에서 세로 기준 900x900 중앙 크롭
    expect(crop?.sw).toBeCloseTo(900, 6);
    expect(crop?.sh).toBeCloseTo(900, 6);
    expect(crop?.sx).toBeCloseTo(350, 6);
    expect(crop?.sy).toBeCloseTo(0, 6);
  });

  it("원본이 더 좁으면 세로를 잘라낸다", () => {
    const crop = computeThumbnailCoverCrop(800, 1600, 800, 800);
    expect(crop).not.toBeNull();
    expect(crop?.sw).toBeCloseTo(800, 6);
    expect(crop?.sh).toBeCloseTo(800, 6);
    expect(crop?.sx).toBeCloseTo(0, 6);
    expect(crop?.sy).toBeCloseTo(400, 6);
  });

  it("비율이 같으면 전체 영역을 유지한다", () => {
    const crop = computeThumbnailCoverCrop(800, 600, 400, 300);
    expect(crop).not.toBeNull();
    expect(crop?.sx).toBeCloseTo(0, 6);
    expect(crop?.sy).toBeCloseTo(0, 6);
    expect(crop?.sw).toBeCloseTo(800, 6);
    expect(crop?.sh).toBeCloseTo(600, 6);
  });

  it("목표 비율을 결과 크롭이 정확히 따른다", () => {
    const crop = computeThumbnailCoverCrop(1920, 1080, 720, 720);
    expect(crop).not.toBeNull();
    expect((crop?.sw ?? 0) / (crop?.sh ?? 1)).toBeCloseTo(1, 6);
  });

  it("0 이하 크기는 null을 반환한다", () => {
    expect(computeThumbnailCoverCrop(0, 100, 50, 50)).toBeNull();
    expect(computeThumbnailCoverCrop(100, -1, 50, 50)).toBeNull();
    expect(computeThumbnailCoverCrop(100, 100, 0, 50)).toBeNull();
  });
});

describe("publishThumbnailFileName", () => {
  it("제목·프리셋·종류·확장자를 조합한다", () => {
    expect(
      publishThumbnailFileName("나의 웹툰", "canvas", "series-square", "jpg"),
    ).toBe("나의 웹툰-canvas-thumb-series-square.jpg");
  });

  it("파일명에 쓸 수 없는 문자를 제거한다", () => {
    expect(
      publishThumbnailFileName('제목: "특수" <문자> /?.*|', "tapas", "episode", "webp"),
    ).not.toMatch(/[\\/:*?"<>|]/);
  });

  it("빈 제목이면 기본 파일명을 쓴다", () => {
    expect(publishThumbnailFileName("   ", "toonstudio", "episode", "jpg")).toBe(
      "toonstudio-episode-toonstudio-thumb-episode.jpg",
    );
  });

  it("긴 제목은 120자로 자른다", () => {
    const name = publishThumbnailFileName("가".repeat(200), "canvas", "episode", "jpg");
    expect(name.length).toBeLessThanOrEqual(
      120 + "-canvas-thumb-episode.jpg".length,
    );
  });
});
