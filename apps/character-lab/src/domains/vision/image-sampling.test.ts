import { describe, expect, it } from "vitest";

import { createEmptyRaster } from "../../contracts";

import { downsampleRgba, opaqueRatio, rasterToRgbaImage, validateRgbaImage } from "./image-sampling";

describe("vision/image-sampling", () => {
  it("박스 필터 축소는 블록 평균을 내고 작은 이미지는 같은 참조를 돌려준다", () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4);
    for (let p = 0; p < 16; p += 1) rgba.set([p < 8 ? 200 : 0, 100, 50, 255], p * 4);
    const image = { width: 4, height: 4, rgba };
    const small = downsampleRgba(image, 2);
    expect(small.width).toBe(2);
    expect(small.height).toBe(2);
    expect(Array.from(small.rgba.subarray(0, 4))).toEqual([200, 100, 50, 255]);
    expect(Array.from(small.rgba.subarray(8, 12))).toEqual([0, 100, 50, 255]);
    expect(downsampleRgba(image, 8)).toBe(image);
  });

  it("크기·길이 불일치는 한글 사유로 거부한다", () => {
    expect(validateRgbaImage({ width: 2, height: 2, rgba: new Uint8ClampedArray(3) })).toMatch(/RGBA 길이/u);
    expect(validateRgbaImage({ width: 0, height: 2, rgba: new Uint8ClampedArray(0) })).toMatch(/이미지 크기/u);
    expect(() => downsampleRgba({ width: 2, height: 2, rgba: new Uint8ClampedArray(3) }, 1)).toThrow(/RGBA 길이/u);
  });

  it("불투명 비율은 알파 기준으로 센다", () => {
    const raster = createEmptyRaster(2, 2);
    raster.rgba[3] = 255;
    expect(opaqueRatio(rasterToRgbaImage(raster))).toBeCloseTo(0.25, 12);
    expect(opaqueRatio({ width: 0, height: 0, rgba: new Uint8ClampedArray(0) })).toBe(0);
  });
});
