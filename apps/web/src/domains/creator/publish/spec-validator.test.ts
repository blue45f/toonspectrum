import { describe, it, expect } from "vitest";

import {
  PUBLISH_SPEC_PRESETS,
  buildPublishSpecChecklist,
  findPublishSpecPreset,
  mapExportPresetToPublishSpecId,
  validatePublishSpecEpisode,
  validatePublishSpecThumbnails,
  type PublishSpecPreset,
} from "./spec-validator";

const MB = 1024 * 1024;
const canvas: PublishSpecPreset = findPublishSpecPreset("canvas");
const tapas: PublishSpecPreset = findPublishSpecPreset("tapas");
const toonstudio: PublishSpecPreset = findPublishSpecPreset("toonstudio");

describe("PUBLISH_SPEC_PRESETS", () => {
  it("Canvas/Tapas/자체 3종 프리셋이 있다", () => {
    expect(Object.keys(PUBLISH_SPEC_PRESETS).sort()).toEqual(["canvas", "tapas", "toonstudio"]);
  });

  it("Canvas 규격은 공식 값(800·1280·2MB·20MB·100장)과 같다", () => {
    expect(canvas.episodeMaxWidth).toBe(800);
    expect(canvas.episodeSliceHeight).toBe(1280);
    expect(canvas.episodeMaxFileBytes).toBe(2 * MB);
    expect(canvas.episodeMaxTotalBytes).toBe(20 * MB);
    expect(canvas.episodeMaxSlices).toBe(100);
    expect(canvas.recommendedFormat).toBe("jpg");
  });

  it("Canvas 썸네일은 3종(1080×1080·1080×1920·202×142)이다", () => {
    expect(canvas.thumbnails.map((thumbnail) => `${thumbnail.width}×${thumbnail.height}`)).toEqual([
      "1080×1080",
      "1080×1920",
      "202×142",
    ]);
    expect(canvas.thumbnails[0]?.maxBytes).toBe(500 * 1024);
    expect(canvas.thumbnails[1]?.maxBytes).toBe(700 * 1024);
    expect(canvas.thumbnails[2]?.maxBytes).toBe(500 * 1024);
  });

  it("Tapas는 세로 상한이 없어 슬라이싱을 생략한다", () => {
    expect(tapas.episodeMaxWidth).toBe(940);
    expect(tapas.episodeSliceHeight).toBeUndefined();
    expect(tapas.episodeMaxFileBytes).toBe(2 * MB);
    expect(tapas.episodeMaxTotalBytes).toBe(20 * MB);
  });

  it("자체 규격은 Canvas와 동일한 권장값을 쓴다", () => {
    expect(toonstudio.episodeMaxWidth).toBe(canvas.episodeMaxWidth);
    expect(toonstudio.episodeSliceHeight).toBe(canvas.episodeSliceHeight);
    expect(toonstudio.episodeMaxFileBytes).toBe(canvas.episodeMaxFileBytes);
    expect(toonstudio.episodeMaxTotalBytes).toBe(canvas.episodeMaxTotalBytes);
    expect(toonstudio.episodeMaxSlices).toBe(canvas.episodeMaxSlices);
    expect(toonstudio.thumbnails.length).toBe(3);
  });
});

describe("mapExportPresetToPublishSpecId", () => {
  it("webtoon-canvas만 canvas로 매핑한다", () => {
    expect(mapExportPresetToPublishSpecId("webtoon-canvas")).toBe("canvas");
    expect(mapExportPresetToPublishSpecId("naver-challenge")).toBeNull();
    expect(mapExportPresetToPublishSpecId(null)).toBeNull();
  });
});

describe("validatePublishSpecEpisode", () => {
  it("규격을 모두 지키면 ok", () => {
    const result = validatePublishSpecEpisode(
      [{ width: 800, height: 1280, bytes: Math.round(1.5 * MB), format: "jpg" }],
      canvas
    );
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("가로 초과는 width 오류(슬라이스 인덱스 포함)", () => {
    const result = validatePublishSpecEpisode([{ width: 900, height: 1280 }], canvas);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === "width" && issue.sliceIndex === 0)).toBe(true);
  });

  it("세로 초과는 slice-height 오류", () => {
    const result = validatePublishSpecEpisode([{ width: 800, height: 2000 }], canvas);
    expect(result.issues.some((issue) => issue.code === "slice-height")).toBe(true);
  });

  it("장당 용량 초과는 file-size 오류", () => {
    const result = validatePublishSpecEpisode(
      [{ width: 800, height: 1280, bytes: Math.round(2.5 * MB) }],
      canvas
    );
    expect(result.issues.some((issue) => issue.code === "file-size")).toBe(true);
  });

  it("장당 한도는 지켜도 회차 합계 초과는 episode-size 오류", () => {
    const slices = Array.from({ length: 12 }, () => ({
      width: 800,
      height: 1280,
      bytes: Math.round(1.9 * MB),
      format: "jpg" as const,
    }));
    const result = validatePublishSpecEpisode(slices, canvas);
    expect(result.issues.some((issue) => issue.code === "file-size")).toBe(false);
    expect(result.issues.some((issue) => issue.code === "episode-size")).toBe(true);
  });

  it("장수 한도 초과는 slice-count 오류", () => {
    const slices = Array.from({ length: 101 }, () => ({ width: 800, height: 1280 }));
    const result = validatePublishSpecEpisode(slices, canvas);
    expect(result.issues.some((issue) => issue.code === "slice-count")).toBe(true);
  });

  it("지원하지 않는 포맷은 format 오류", () => {
    const result = validatePublishSpecEpisode(
      [{ width: 800, height: 1280, format: "webp" }],
      canvas
    );
    expect(result.issues.some((issue) => issue.code === "format")).toBe(true);
  });

  it("용량을 모르면 용량 검사는 건너뛴다", () => {
    const result = validatePublishSpecEpisode([{ width: 800, height: 1280 }], canvas);
    expect(result.ok).toBe(true);
  });

  it("Tapas는 세로 상한이 없어 긴 스트립도 통과한다", () => {
    const result = validatePublishSpecEpisode([{ width: 940, height: 10000 }], tapas);
    expect(result.ok).toBe(true);
  });
});

describe("validatePublishSpecThumbnails", () => {
  it("3종 규격을 모두 지키면 ok", () => {
    const result = validatePublishSpecThumbnails(
      [
        { kind: "series-square", width: 1080, height: 1080, bytes: 400 * 1024 },
        { kind: "series-portrait", width: 1080, height: 1920, bytes: 600 * 1024 },
        { kind: "episode", width: 202, height: 142, bytes: 100 * 1024 },
      ],
      canvas
    );
    expect(result.ok).toBe(true);
  });

  it("없는 슬롯은 thumbnail-missing 경고", () => {
    const result = validatePublishSpecThumbnails([], canvas);
    expect(result.ok).toBe(false);
    expect(
      result.issues.filter((issue) => issue.code === "thumbnail-missing").length
    ).toBe(3);
    expect(result.issues.every((issue) => issue.severity === "warning")).toBe(true);
  });

  it("크기가 다르면 thumbnail-size 오류", () => {
    const result = validatePublishSpecThumbnails(
      [{ kind: "episode", width: 300, height: 300 }],
      canvas
    );
    expect(result.issues.some((issue) => issue.code === "thumbnail-size")).toBe(true);
  });

  it("용량 한도는 '미만'이라 경계값도 오류, 바로 아래는 통과", () => {
    const atLimit = validatePublishSpecThumbnails(
      [{ kind: "series-square", width: 1080, height: 1080, bytes: 500 * 1024 }],
      canvas
    );
    // "500KB 미만"이라 정확히 500KB도 size 오류 — 다른 2종 없다는 warning과 함께다
    expect(atLimit.issues.some((issue) => issue.code === "thumbnail-size")).toBe(true);
    const under = validatePublishSpecThumbnails(
      [{ kind: "series-square", width: 1080, height: 1080, bytes: 500 * 1024 - 1 }],
      canvas
    );
    // 회차 썸네일 2종이 없다는 warning만 있고 size 오류는 없다
    expect(under.issues.some((issue) => issue.code === "thumbnail-size")).toBe(false);
  });
});

describe("buildPublishSpecChecklist", () => {
  it("규격 안이면 위반 없이 행을 만든다", () => {
    const rows = buildPublishSpecChecklist(
      { plannedWidth: 800, plannedHeight: 5000, pageCount: 3, format: "jpg" },
      canvas
    );
    expect(rows.map((row) => row.id)).toEqual([
      "width",
      "slice",
      "file-size",
      "episode-size",
      "format",
      "thumbnails",
    ]);
    expect(rows.find((row) => row.id === "width")?.status).toBe("pass");
    // 3페이지 × ceil(5000/1280)=4 → 12장, 한도 100장 안
    expect(rows.find((row) => row.id === "slice")?.detail).toContain("12장");
    expect(rows.find((row) => row.id === "slice")?.status).toBe("pass");
    expect(rows.find((row) => row.id === "format")?.status).toBe("pass");
  });

  it("인코딩 전 용량 항목은 unknown이다", () => {
    const rows = buildPublishSpecChecklist(
      { plannedWidth: 800, plannedHeight: 1280, pageCount: 1, format: "jpg" },
      canvas
    );
    expect(rows.find((row) => row.id === "file-size")?.status).toBe("unknown");
    expect(rows.find((row) => row.id === "episode-size")?.status).toBe("unknown");
    expect(rows.find((row) => row.id === "thumbnails")?.status).toBe("unknown");
  });

  it("가로 초과·장수 초과·미지원 포맷은 fail", () => {
    const rows = buildPublishSpecChecklist(
      { plannedWidth: 1600, plannedHeight: 40000, pageCount: 4, format: "webp" },
      canvas
    );
    expect(rows.find((row) => row.id === "width")?.status).toBe("fail");
    // 4페이지 × ceil(40000/1280)=32 → 128장 > 100장
    expect(rows.find((row) => row.id === "slice")?.status).toBe("fail");
    expect(rows.find((row) => row.id === "format")?.status).toBe("fail");
  });

  it("예상 용량을 알면 장당·합계도 판정한다", () => {
    const okRows = buildPublishSpecChecklist(
      {
        plannedWidth: 800,
        plannedHeight: 1280,
        pageCount: 2,
        format: "jpg",
        estimatedBytesPerSlice: Math.round(1.5 * MB),
      },
      canvas
    );
    expect(okRows.find((row) => row.id === "file-size")?.status).toBe("pass");
    expect(okRows.find((row) => row.id === "episode-size")?.status).toBe("pass");

    const overRows = buildPublishSpecChecklist(
      {
        plannedWidth: 800,
        plannedHeight: 1280,
        pageCount: 20,
        format: "jpg",
        estimatedBytesPerSlice: Math.round(1.5 * MB),
      },
      canvas
    );
    // 20장 × 1.5MB = 30MB > 20MB
    expect(overRows.find((row) => row.id === "episode-size")?.status).toBe("fail");
  });

  it("Tapas는 세로 슬라이싱 행이 상한 없음으로 나온다", () => {
    const rows = buildPublishSpecChecklist(
      { plannedWidth: 940, plannedHeight: 10000, pageCount: 2, format: "jpg" },
      tapas
    );
    expect(rows.find((row) => row.id === "slice")?.status).toBe("pass");
    expect(rows.find((row) => row.id === "slice")?.detail).toContain("상한이 없어요");
  });
});
