import { describe, expect, it } from "vitest";

import { faceSdfThreshold, faceSdfUniforms, faceShadowAt, generateFaceSdf, sampleFaceSdf } from "./face-sdf";

describe("face-sdf", () => {
  it("임계값은 [0,1] 범위이고 u에 대해 단조 증가한다", () => {
    const map = generateFaceSdf(64);
    expect(map.data.length).toBe(64 * 64);
    let min = 1;
    let max = 0;
    for (const value of map.data) {
      min = Math.min(min, value / 255);
      max = Math.max(max, value / 255);
    }
    expect(min).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(1);
    for (let y = 0; y < 64; y += 8) {
      let previous = -1;
      for (let x = 0; x < 64; x += 1) {
        const value = map.data[y * 64 + x] ?? 0;
        expect(value).toBeGreaterThanOrEqual(previous);
        previous = value;
      }
    }
  });

  it("상하 변조는 코 높이(v≈0.45)에서 임계가 가장 높다", () => {
    const u = 0.6;
    expect(faceSdfThreshold(u, 0.45)).toBeGreaterThan(faceSdfThreshold(u, 0.05));
    expect(faceSdfThreshold(u, 0.45)).toBeGreaterThan(faceSdfThreshold(u, 0.95));
    expect(faceSdfThreshold(u, 0.2, { verticalModulation: 0 })).toBeCloseTo(faceSdfThreshold(u, 0.8, { verticalModulation: 0 }), 6);
  });

  it("같은 입력은 같은 바이트(결정성)", () => {
    const a = generateFaceSdf(32);
    const b = generateFaceSdf(32);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
    expect(() => generateFaceSdf(1)).toThrow();
  });

  it("정면광은 그늘 0, 역광은 전체 그늘, 측광은 좌우 대칭", () => {
    const map = generateFaceSdf(32);
    const forward: readonly [number, number, number] = [0, 0, 1];
    const right: readonly [number, number, number] = [1, 0, 0];
    const front = faceSdfUniforms(forward, right, [0, 0.5, 1]);
    expect(front.fdotl).toBeCloseTo(1, 6);
    let shadowed = 0;
    for (let i = 0; i < 32; i += 1) shadowed += faceShadowAt(map, (i + 0.5) / 32, 0.5, front);
    expect(shadowed).toBe(0);

    const back = faceSdfUniforms(forward, right, [0, 0, -1]);
    expect(back.threshold).toBeCloseTo(1, 6);
    shadowed = 0;
    for (let i = 0; i < 32; i += 1) shadowed += faceShadowAt(map, (i + 0.5) / 32, 0.5, back);
    expect(shadowed).toBe(32);

    const fromRight = faceSdfUniforms(forward, right, [1, 0, 0]);
    const fromLeft = faceSdfUniforms(forward, right, [-1, 0, 0]);
    expect(fromRight.flipU).toBe(1);
    expect(fromLeft.flipU).toBe(0);
    for (let i = 0; i < 32; i += 1) {
      const u = (i + 0.5) / 32;
      expect(faceShadowAt(map, u, 0.5, fromRight)).toBe(faceShadowAt(map, 1 - u, 0.5, fromLeft));
    }
    // 측광이면 광원 반대편 절반 근처만 그늘이다.
    const half = Array.from({ length: 32 }, (_, i) => faceShadowAt(map, (i + 0.5) / 32, 0.5, fromLeft));
    const count = half.reduce((sum, value) => sum + value, 0);
    expect(count).toBeGreaterThan(8);
    expect(count).toBeLessThan(24);
  });

  it("sampleFaceSdf는 범위를 클램프한다", () => {
    const map = generateFaceSdf(16);
    expect(sampleFaceSdf(map, -1, 2)).toBe((map.data[15 * 16] ?? 0) / 255);
    expect(sampleFaceSdf(map, 2, -1)).toBe((map.data[15] ?? 0) / 255);
  });
});
