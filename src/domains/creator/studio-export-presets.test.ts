import { describe, it, expect } from "vitest";

import {
  EXPORT_PRESETS,
  findExportPreset,
  planStripSlices,
  recommendScale,
  validateExport,
  type ExportPreset,
} from "./studio-export-presets";

const naver = findExportPreset("naver-challenge") as ExportPreset;
const canvas = findExportPreset("webtoon-canvas") as ExportPreset;
const original = findExportPreset("original") as ExportPreset;

describe("EXPORT_PRESETS 데이터", () => {
  it("프리셋 id는 유일하다", () => {
    const ids = EXPORT_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("권장 포맷은 허용 포맷에 포함된다", () => {
    for (const p of EXPORT_PRESETS) {
      expect(p.allowedFormats).toContain(p.recommendedFormat);
      expect(p.allowedFormats.length).toBeGreaterThan(0);
    }
  });

  it("네이버 도전만화는 JPG 전용·690폭·5MB 제한", () => {
    expect(naver.width).toBe(690);
    expect(naver.allowedFormats).toEqual(["jpg"]);
    expect(naver.maxFileBytes).toBe(5 * 1024 * 1024);
    expect(naver.maxImageHeight).toBe(1280);
  });

  it("원본 고해상도는 폭 0(원본 유지)·모든 포맷 허용", () => {
    expect(original.width).toBe(0);
    expect(original.allowedFormats).toEqual(["png", "jpg", "webp"]);
  });

  it("findExportPreset은 없는 id에 undefined", () => {
    expect(findExportPreset("nope")).toBeUndefined();
  });
});

describe("planStripSlices", () => {
  it("균등 분할", () => {
    expect(planStripSlices(2560, 1280)).toEqual([
      { index: 0, y: 0, height: 1280 },
      { index: 1, y: 1280, height: 1280 },
    ]);
  });

  it("나머지가 있으면 마지막 칸이 더 짧다", () => {
    const slices = planStripSlices(3000, 1280);
    expect(slices).toHaveLength(3);
    expect(slices[2]).toEqual({ index: 2, y: 2560, height: 440 });
    // 슬라이스 높이 합 = 전체 높이
    expect(slices.reduce((s, x) => s + x.height, 0)).toBe(3000);
  });

  it("한 장에 들어가면 슬라이스 1개", () => {
    expect(planStripSlices(800, 1280)).toEqual([{ index: 0, y: 0, height: 800 }]);
  });

  it("0/음수 입력은 []", () => {
    expect(planStripSlices(0, 1280)).toEqual([]);
    expect(planStripSlices(2000, 0)).toEqual([]);
    expect(planStripSlices(-100, 1280)).toEqual([]);
    expect(planStripSlices(2000, -5)).toEqual([]);
  });
});

describe("recommendScale", () => {
  it("폭 변환 없음(원본) 또는 잘못된 캔버스폭은 1", () => {
    expect(recommendScale(720, original)).toBe(1);
    expect(recommendScale(0, naver)).toBe(1);
    expect(recommendScale(-10, naver)).toBe(1);
  });

  it("캔버스 720 → 네이버 690 ≈ 0.96", () => {
    expect(recommendScale(720, naver)).toBeCloseTo(0.96, 2);
  });

  it("캔버스 720 → 웹툰 캔버스 800 ≈ 1.11", () => {
    expect(recommendScale(720, canvas)).toBeCloseTo(1.11, 2);
  });

  it("아주 작은 캔버스폭은 상한 4로 클램프", () => {
    expect(recommendScale(10, canvas)).toBe(4);
  });

  it("아주 큰 캔버스폭은 하한 0.25로 클램프", () => {
    expect(recommendScale(10000, naver)).toBe(0.25);
  });
});

describe("validateExport", () => {
  it("규격을 모두 만족하면 ok:true·경고 없음", () => {
    const r = validateExport({ width: 690, height: 1280, format: "jpg", bytes: 1_000_000 }, naver);
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it("허용되지 않은 포맷은 format 경고(PNG→네이버)", () => {
    const r = validateExport({ width: 690, height: 1000, format: "png" }, naver);
    expect(r.ok).toBe(false);
    expect(r.warnings.map((w) => w.code)).toContain("format");
  });

  it("최대 높이 초과는 height 경고", () => {
    const r = validateExport({ width: 690, height: 4000, format: "jpg" }, naver);
    expect(r.warnings.map((w) => w.code)).toContain("height");
  });

  it("최대 용량 초과는 filesize 경고", () => {
    const r = validateExport(
      { width: 690, height: 1000, format: "jpg", bytes: 6 * 1024 * 1024 },
      naver
    );
    expect(r.warnings.map((w) => w.code)).toContain("filesize");
  });

  it("폭이 권장 폭과 다르면 width 경고", () => {
    const r = validateExport({ width: 720, height: 1000, format: "jpg" }, naver);
    expect(r.warnings.map((w) => w.code)).toContain("width");
  });

  it("폭 0(원본)은 width 경고를 내지 않는다", () => {
    const r = validateExport({ width: 1234, height: 500, format: "png" }, original);
    expect(r.warnings.map((w) => w.code)).not.toContain("width");
  });

  it("용량 정보가 없으면 filesize 경고는 건너뛴다", () => {
    const r = validateExport({ width: 690, height: 1000, format: "jpg" }, naver);
    expect(r.warnings.map((w) => w.code)).not.toContain("filesize");
  });
});
