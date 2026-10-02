import { describe, expect, it } from "vitest";

import { encodeIdPixel } from "../contracts";
import { depthStepFixture, fillRaster, idPassRaster } from "../testing/raster-fixtures";

import { decodeDepth, decodeIdPass, decodeMaterialIdPass, fromTopDownStraight, premultiply, toTopDownStraight, unpremultiply } from "./raster-convert";

describe("toTopDownStraight", () => {
  it("bottom-up·premultiplied 입력을 top-down·straight로 바꾸고 원본은 유지한다", () => {
    // 2×2, bottom-up: 첫 행이 화면 아래. premultiplied: (128,0,0,128) = straight (255,0,0,128)
    const input = new Uint8Array([128, 0, 0, 128, 0, 0, 0, 0, 0, 255, 0, 255, 64, 64, 64, 128]);
    const copy = new Uint8Array(input);
    const out = toTopDownStraight(input, 2, 2, { flipY: true, premultiplied: true });
    expect(Array.from(input)).toEqual(Array.from(copy));
    expect(Array.from(out)).toEqual([0, 255, 0, 255, 128, 128, 128, 128, 255, 0, 0, 128, 0, 0, 0, 0]);
  });

  it("flipY·premultiplied가 false면 복사만 한다", () => {
    const input = new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]);
    const out = toTopDownStraight(input, 2, 1, { flipY: false, premultiplied: false });
    expect(Array.from(out)).toEqual(Array.from(input));
    expect(out).not.toBe(input);
  });

  it("길이가 맞지 않으면 throw한다", () => {
    expect(() => toTopDownStraight(new Uint8Array(7), 2, 1, { flipY: false, premultiplied: false })).toThrow(/길이/u);
  });

  it("premultiply ↔ unpremultiply 왕복은 알파 극단(0·1·255)에서 손실이 없다", () => {
    const raster = fillRaster(16, 4, (x, y) => [255 - x * 15, x * 15, 128, y === 0 ? 0 : y === 1 ? 1 : y === 2 ? 255 : 200]);
    const roundTrip = toTopDownStraight(fromTopDownStraight(raster, { flipY: true, premultiplied: true }), 16, 4, { flipY: true, premultiplied: true });
    for (let i = 0; i < raster.rgba.length; i += 4) {
      const alpha = raster.rgba[i + 3] ?? 0;
      expect(roundTrip[i + 3]).toBe(alpha);
      if (alpha === 0) {
        expect([roundTrip[i], roundTrip[i + 1], roundTrip[i + 2]]).toEqual([0, 0, 0]);
      } else if (alpha === 255) {
        expect([roundTrip[i], roundTrip[i + 1], roundTrip[i + 2]]).toEqual([raster.rgba[i], raster.rgba[i + 1], raster.rgba[i + 2]]);
      } else {
        // 8bit 양자화 오차 상한: 255/alpha
        const bound = Math.ceil(255 / alpha);
        expect(Math.abs((roundTrip[i] ?? 0) - (raster.rgba[i] ?? 0))).toBeLessThanOrEqual(bound);
      }
    }
    const buffer = new Uint8ClampedArray([255, 255, 255, 0]);
    expect(Array.from(unpremultiply(premultiply(buffer)))).toEqual([0, 0, 0, 0]);
  });
});

describe("decodeIdPass / decodeDepth", () => {
  it("ID 패스를 partId·materialId로 디코드하고 투명 픽셀은 0이다", () => {
    const raster = idPassRaster(3, 1, (x) => (x === 0 ? 0 : x === 1 ? 1 : 300), 7);
    expect(Array.from(decodeIdPass(raster.rgba, 3, 1))).toEqual([0, 1, 300]);
    expect(Array.from(decodeMaterialIdPass(raster.rgba))).toEqual([0, 7, 7]);
    expect(encodeIdPixel(300, 7)).toEqual([44, 1, 7, 255]);
    expect(() => decodeIdPass(new Uint8Array(5))).toThrow(/4의 배수/u);
  });

  it("f32 깊이는 클램프·flip하고 RGBA8은 r8/packed로 디코드한다", () => {
    const step = depthStepFixture(4, 2);
    const flipped = decodeDepth(new Float32Array([0, 0.5, 1, 2, -1, Number.NaN, 0.25, 0.75]), 4, 2, { near: 0.1, far: 10, flipY: true });
    expect(Array.from(flipped.depth)).toEqual([0, 1, 0.25, 0.75, 0, 0.5, 1, 1]);
    expect(flipped.near).toBe(0.1);
    const r8 = decodeDepth(new Uint8ClampedArray([0, 0, 0, 255, 255, 0, 0, 255]), 2, 1, { near: 0, far: 1, flipY: false, encoding: "r8" });
    expect(Array.from(r8.depth)).toEqual([0, 1]);
    const packed = decodeDepth(new Uint8ClampedArray([128, 0, 0, 0, 0, 128, 0, 0]), 2, 1, { near: 0, far: 1, flipY: false, encoding: "rgba-packed" });
    expect(packed.depth[0]).toBeCloseTo(128 / 255, 6);
    expect(packed.depth[1]).toBeCloseTo(128 / 65280, 9);
    expect(step.depth[0]).toBeCloseTo(0.2, 6);
    expect(() => decodeDepth(new Uint8ClampedArray(8), 2, 1, { near: 0, far: 1, flipY: false, encoding: "f32" })).toThrow(/f32/u);
    expect(() => decodeDepth(new Float32Array(3), 2, 1, { near: 0, far: 1, flipY: false })).toThrow(/길이/u);
  });
});
