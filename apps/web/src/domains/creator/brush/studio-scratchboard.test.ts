import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_SCRATCHBOARD_OPTIONS,
  normalizeStudioScratchboardOptions,
  studioScratchboardDabReveal,
  studioScratchboardGrainBreakup,
  studioScratchboardHash,
  studioScratchboardRevealAlpha,
  studioScratchboardWidth,
} from "./studio-scratchboard";

describe("studio-scratchboard", () => {
  it("필압이 셀수록 긁기 너비가 넓어진다", () => {
    const light = studioScratchboardWidth(20, 0.2);
    const firm = studioScratchboardWidth(20, 1);
    expect(light).toBeGreaterThan(0);
    expect(firm).toBeGreaterThan(light);
    expect(firm).toBeLessThanOrEqual(20);
    expect(studioScratchboardWidth(0, 1)).toBe(0);
    expect(studioScratchboardWidth(-5, 1)).toBe(0);
  });

  it("중심은 완전히 드러나고 가장자리는 페이드된다", () => {
    const center = studioScratchboardRevealAlpha(0, 1, 0);
    const edge = studioScratchboardRevealAlpha(1, 1, 0);
    expect(center).toBeCloseTo(1, 5);
    expect(edge).toBeLessThan(0.05);
    const mid = studioScratchboardRevealAlpha(0.5, 1, 0);
    expect(mid).toBeGreaterThan(edge);
  });

  it("약한 필압은 얇은 잉크층도 완전히 드러내지 못한다", () => {
    const thin = studioScratchboardRevealAlpha(0, 0.3, 0, {
      ...DEFAULT_STUDIO_SCRATCHBOARD_OPTIONS,
      inkThickness: 0.9,
    });
    expect(thin).toBeLessThan(1);
    const thick = studioScratchboardRevealAlpha(0, 1, 0, {
      ...DEFAULT_STUDIO_SCRATCHBOARD_OPTIONS,
      inkThickness: 0.9,
    });
    expect(thick).toBeCloseTo(1, 5);
  });

  it("종이결이 강하면 노출이 감소한다", () => {
    const smooth = studioScratchboardRevealAlpha(0.3, 0.8, 0.9, {
      ...DEFAULT_STUDIO_SCRATCHBOARD_OPTIONS,
      grainStrength: 0,
    });
    const grained = studioScratchboardRevealAlpha(0.3, 0.8, 0.9, {
      ...DEFAULT_STUDIO_SCRATCHBOARD_OPTIONS,
      grainStrength: 1,
    });
    expect(grained).toBeLessThan(smooth);
  });

  it("grain breakup은 결정적이고 [0,1] 범위다", () => {
    for (let i = 0; i < 50; i += 1) {
      const value = studioScratchboardGrainBreakup(i, i * 3.7, i * 1.3, 0.55);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      expect(studioScratchboardGrainBreakup(i, i * 3.7, i * 1.3, 0.55)).toBe(value);
    }
    expect(studioScratchboardGrainBreakup(0, 0, 0, 0)).toBe(1);
  });

  it("dab reveal은 결정적이다", () => {
    const left = studioScratchboardDabReveal(7, 100, 200, 0.2, 0.8);
    const right = studioScratchboardDabReveal(7, 100, 200, 0.2, 0.8);
    expect(left).toBe(right);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(left).toBeLessThanOrEqual(1);
  });

  it("해시는 [0,1) 결정적 값이다", () => {
    expect(studioScratchboardHash(1, 2)).toBe(studioScratchboardHash(1, 2));
    expect(studioScratchboardHash(1, 2)).not.toBe(studioScratchboardHash(1, 3));
  });

  it("옵션 정규화는 범위를 강제한다", () => {
    const options = normalizeStudioScratchboardOptions({
      underlayerBrightness: 2,
      grainStrength: -1,
      inkThickness: Number.NaN,
    });
    expect(options.underlayerBrightness).toBe(1);
    expect(options.grainStrength).toBe(0);
    expect(options.inkThickness).toBe(0);
    expect(Object.isFrozen(options)).toBe(true);
  });
});
