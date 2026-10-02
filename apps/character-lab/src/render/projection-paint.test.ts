import { describe, expect, it } from "vitest";

import { PROJECTION_MAX_SIZE_M, PROJECTION_MIN_SIZE_M, hasProjectionPaint, metersPerTexel, overlayHasPaint, premultipliedPixel, projectionSizeM, readProjectionPaint, unpremultiplyPixel } from "./projection-paint";

import type { ProjectionPaintPort } from "./projection-paint";

describe("projection-paint 순수 수학", () => {
  it("metersPerTexel: 1 m 정사각형이 UV 전체(1024 텍셀)를 덮으면 1/1024 m", () => {
    const m = metersPerTexel([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0], [1, 0], [0, 1], 1024, 1024);
    expect(m).toBeCloseTo(1 / 1024, 12);
  });

  it("UV가 늘어난 곳은 텍셀당 길이가 작고 레이어가 직사각형이어도 면적으로 계산한다", () => {
    const wide = metersPerTexel([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0], [1, 0], [0, 1], 2048, 512);
    expect(wide).toBeCloseTo(1 / Math.sqrt(2048 * 512), 12);
    const stretched = metersPerTexel([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0], [0.5, 0], [0, 0.5], 1024, 1024);
    expect(stretched).toBeCloseTo(1 / 512, 12);
  });

  it("퇴화 삼각형(월드 또는 UV 넓이 0)은 null", () => {
    expect(metersPerTexel([0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 0], [1, 0], [0, 1], 1024, 1024)).toBeNull();
    expect(metersPerTexel([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0], [0.5, 0.5], [1, 1], 1024, 1024)).toBeNull();
  });

  it("projectionSizeM: 지름 = 2 × 반지름 × m/텍셀이고 상·하한이 있다", () => {
    expect(projectionSizeM(10, 0.001)).toBeCloseTo(0.02, 12);
    // 반지름 하한 0.5 px → 지름 1 텍셀 = 0.001 m → 하한 0.002 m로 올린다.
    expect(projectionSizeM(0, 0.001)).toBe(PROJECTION_MIN_SIZE_M);
    expect(projectionSizeM(10_000, 0.01)).toBe(PROJECTION_MAX_SIZE_M);
  });

  it("overlayHasPaint: 알파가 하나라도 0보다 크면 참", () => {
    expect(overlayHasPaint({ rgba: new Uint8Array(16) })).toBe(false);
    const painted = new Uint8Array(16);
    painted[11] = 1;
    expect(overlayHasPaint({ rgba: painted })).toBe(true);
  });

  it("premultiply ↔ unpremultiply가 왕복한다(알파 0은 null)", () => {
    expect(unpremultiplyPixel(0, 0, 0, 0)).toBeNull();
    const px = premultipliedPixel([200, 100, 50], 1, 0.5);
    expect(px).toEqual([100, 50, 25, 128]);
    const back = unpremultiplyPixel(px[0], px[1], px[2], px[3]);
    expect(back?.alpha).toBeCloseTo(128 / 255, 12);
    expect(back?.rgb[0]).toBeCloseTo(100 * (255 / 128), 9);
  });

  it("premultipliedPixel: 마스크·강도는 [0, 1]로 자른다", () => {
    expect(premultipliedPixel([255, 255, 255], 2, 2)).toEqual([255, 255, 255, 255]);
    expect(premultipliedPixel([255, 255, 255], -1, 1)).toEqual([0, 0, 0, 0]);
  });

  it("포트 판별은 projectionPaint 메서드가 있는 객체에서만 포트를 읽는다", () => {
    expect(hasProjectionPaint({})).toBe(false);
    expect(readProjectionPaint(null)).toBeNull();
    const port = { begin: () => true } as unknown as ProjectionPaintPort;
    expect(readProjectionPaint({ projectionPaint: () => port })).toBe(port);
    expect(readProjectionPaint({ projectionPaint: () => null })).toBeNull();
  });
});
