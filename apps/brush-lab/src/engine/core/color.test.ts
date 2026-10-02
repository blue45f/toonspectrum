import { describe, expect, it } from "vitest";

import {
  deltaE76,
  encodeLabImage,
  linearToLab,
  linearToSrgb,
  premultiply,
  srgbStraightToLinearPremul,
  srgbToLinear,
  unpremultiply,
} from "./color";

describe("색 공간 변환", () => {
  it("sRGB ↔ linear 왕복 오차 < 1e-6(256단계)", () => {
    for (let i = 0; i <= 255; i += 1) {
      const c = i / 255;
      const back = linearToSrgb(srgbToLinear(c));
      expect(Math.abs(back - c)).toBeLessThan(1e-6);
    }
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBe(1);
    expect(linearToSrgb(0)).toBe(0);
    expect(linearToSrgb(1)).toBe(1);
    // 범위 밖은 clamp
    expect(srgbToLinear(-1)).toBe(0);
    expect(linearToSrgb(2)).toBe(1);
  });

  it("전달 함수는 단조 증가이며 f32 값이다", () => {
    let prev = -1;
    for (let i = 0; i <= 1000; i += 1) {
      const v = srgbToLinear(i / 1000);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBe(Math.fround(v));
      prev = v;
    }
  });

  it("premultiply 왕복", () => {
    const straight = [0.25, 0.5, 0.75, 0.4] as const;
    const pm = premultiply(straight);
    expect(pm[0]).toBeCloseTo(0.1, 6);
    expect(pm[3]).toBe(0.4);
    const back = unpremultiply(pm);
    for (let i = 0; i < 4; i += 1) expect(Math.abs((back[i] ?? 0) - (straight[i] ?? 0))).toBeLessThan(1e-6);
    expect(unpremultiply([0.1, 0.2, 0.3, 0])).toEqual([0, 0, 0, 0]);
  });

  it("encodeLabImage 알려진 값", () => {
    // sRGB 128/255 회색의 선형값(≈ 0.2159). 0.5(=127.5)는 반올림 경계라 쓰지 않는다.
    const gray = srgbToLinear(128 / 255);
    const linear = new Float32Array([
      1, 0, 0, 1, // 불투명 빨강
      0.25, 0, 0, 0.5, // 알파 0.5, 선형 0.5 빨강 → sRGB 188
      0, 0, 0, 0, // 투명
      gray, gray, gray, 1, // sRGB 128 회색
    ]);
    const img = encodeLabImage(linear, 2, 2);
    expect(img.width).toBe(2);
    expect(img.height).toBe(2);
    expect(Array.from(img.data.subarray(0, 4))).toEqual([255, 0, 0, 255]);
    expect(Array.from(img.data.subarray(4, 8))).toEqual([188, 0, 0, 128]);
    expect(Array.from(img.data.subarray(8, 12))).toEqual([0, 0, 0, 0]);
    expect(Array.from(img.data.subarray(12, 16))).toEqual([128, 128, 128, 255]);
    expect(() => encodeLabImage(new Float32Array(3), 1, 1)).toThrow(RangeError);
  });

  it("srgbStraightToLinearPremul은 dab 색 규약(선형 premultiplied)을 만든다", () => {
    const out = srgbStraightToLinearPremul([0.5, 0.5, 0.5, 0.5]);
    expect(out[3]).toBe(0.5);
    expect(out[0]).toBeCloseTo(0.2140411 * 0.5, 5);
  });

  it("Lab: 흰색 L≈100·a,b≈0, 검정 L=0, ΔE 대칭", () => {
    const white = linearToLab(1, 1, 1);
    expect(white[0]).toBeCloseTo(100, 2);
    expect(Math.abs(white[1])).toBeLessThan(0.01);
    expect(Math.abs(white[2])).toBeLessThan(0.01);
    const black = linearToLab(0, 0, 0);
    expect(black[0]).toBeCloseTo(0, 6);
    const red = linearToLab(1, 0, 0);
    expect(red[1]).toBeGreaterThan(50);
    expect(deltaE76(white, white)).toBe(0);
    expect(deltaE76(white, black)).toBeCloseTo(deltaE76(black, white), 10);
    expect(deltaE76(white, black)).toBeCloseTo(100, 1);
  });
});
