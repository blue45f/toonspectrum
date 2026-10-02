import { describe, expect, it } from "vitest";

import { fillRaster, pixelAt } from "../testing/raster-fixtures";

import { multiplyByte, opaqueMae, recompose, screenByte, splitTones } from "./tone-split";

describe("splitTones", () => {
  it("어두운 픽셀은 multiply 음영, 밝은 픽셀은 screen 하이라이트로 가고 재합성 MAE ≤ 2/255", () => {
    const flat = fillRaster(32, 32, (x, y) => (x === 0 ? [0, 0, 0, 0] : [200, 150, 120, y === 31 ? 128 : 255]));
    const lit = fillRaster(32, 32, (x, y) => {
      if (x === 0) return [0, 0, 0, 0];
      if (y < 16) return [100, 75, 60, y === 31 ? 128 : 255];
      return [240, 220, 200, y === 31 ? 128 : 255];
    });
    const { shade, highlight } = splitTones(flat, lit);
    expect(pixelAt(shade, 5, 5)).toEqual([128, 128, 128, 255]);
    expect(pixelAt(highlight, 5, 5)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(shade, 5, 20)).toEqual([255, 255, 255, 255]);
    const [hr, hg, hb, ha] = pixelAt(highlight, 5, 20);
    expect(ha).toBe(255);
    expect(hr).toBe(Math.round(((240 - 200) * 255) / 55));
    expect(hg).toBe(Math.round(((220 - 150) * 255) / 105));
    expect(hb).toBe(Math.round(((200 - 120) * 255) / 135));
    expect(pixelAt(shade, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(highlight, 0, 0)).toEqual([0, 0, 0, 0]);

    const rebuilt = recompose(flat, shade, highlight);
    expect(opaqueMae(rebuilt, lit)).toBeLessThanOrEqual(2);
    expect(pixelAt(rebuilt, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(rebuilt, 5, 31)[3]).toBe(128);
  });

  it("극단값(밑색 0·255, 조명 0·255)도 정확히 재합성한다", () => {
    const flat = fillRaster(4, 1, (x) => (x < 2 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    const lit = fillRaster(4, 1, (x) => (x % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    const { shade, highlight } = splitTones(flat, lit);
    expect(pixelAt(highlight, 1, 0)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(shade, 2, 0)).toEqual([0, 0, 0, 255]);
    const rebuilt = recompose(flat, shade, highlight);
    expect(opaqueMae(rebuilt, lit)).toBe(0);
  });

  it("랜덤 패턴에서도 불투명 MAE ≤ 2/255를 지킨다", () => {
    let seed = 7;
    const next = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed >>> 24;
    };
    const flat = fillRaster(48, 48, () => [next(), next(), next(), 255]);
    const lit = fillRaster(48, 48, () => [next(), next(), next(), 255]);
    const { shade, highlight } = splitTones(flat, lit);
    expect(opaqueMae(recompose(flat, shade, highlight), lit)).toBeLessThanOrEqual(2);
  });

  it("블렌드 바이트 수식과 크기 불일치 오류", () => {
    expect(multiplyByte(255, 128)).toBe(128);
    expect(screenByte(0, 128)).toBe(128);
    expect(screenByte(200, 255)).toBe(255);
    const a = fillRaster(2, 2, () => [0, 0, 0, 255]);
    const b = fillRaster(2, 1, () => [0, 0, 0, 255]);
    expect(() => splitTones(a, b)).toThrow(/크기/u);
  });
});
