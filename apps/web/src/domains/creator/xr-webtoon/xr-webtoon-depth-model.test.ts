import { describe, expect, it } from "vitest";

import {
  XR_DEPTH_FRONT_SCALE,
  XR_DEPTH_PARALLAX_RANGE_PX,
  xrDepthCutCenteredness,
  xrDepthCutProgress,
  xrDepthFadeForCenteredness,
  xrDepthIntensityFactor,
  xrDepthLayerTransform,
} from "./xr-webtoon-depth-model";

describe("xrDepthIntensityFactor", () => {
  it("강도별 계수를 반환한다", () => {
    expect(xrDepthIntensityFactor("off")).toBe(0);
    expect(xrDepthIntensityFactor("subtle")).toBeGreaterThan(0);
    expect(xrDepthIntensityFactor("subtle")).toBeLessThan(xrDepthIntensityFactor("vivid"));
    expect(xrDepthIntensityFactor("vivid")).toBe(1);
  });
});

describe("xrDepthLayerTransform", () => {
  it("중앙에서는 이동이 없고 앞 레이어만 살짝 확대된다", () => {
    const back = xrDepthLayerTransform({
      scrollProgress: 0.5,
      layerDepth: 0,
      intensity: "vivid",
      reducedMotion: false,
    });
    expect(back.translateYPx).toBe(0);
    expect(back.scale).toBe(1);

    const front = xrDepthLayerTransform({
      scrollProgress: 0.5,
      layerDepth: 1,
      intensity: "vivid",
      reducedMotion: false,
    });
    expect(front.translateYPx).toBe(0);
    expect(front.scale).toBeCloseTo(1 + XR_DEPTH_FRONT_SCALE, 6);
  });

  it("앞 레이어가 뒤 레이어보다 크게 움직인다", () => {
    const at = (depth: number) =>
      xrDepthLayerTransform({
        scrollProgress: 0.1,
        layerDepth: depth,
        intensity: "vivid",
        reducedMotion: false,
      }).translateYPx;
    expect(Math.abs(at(1))).toBeGreaterThan(Math.abs(at(0.5)));
    expect(Math.abs(at(0.5))).toBeGreaterThan(Math.abs(at(0)));
    expect(at(0)).toBe(0);
  });

  it("스크롤 방향에 따라 이동 방향이 반전된다", () => {
    const up = xrDepthLayerTransform({
      scrollProgress: 0.2,
      layerDepth: 1,
      intensity: "vivid",
      reducedMotion: false,
    }).translateYPx;
    const down = xrDepthLayerTransform({
      scrollProgress: 0.8,
      layerDepth: 1,
      intensity: "vivid",
      reducedMotion: false,
    }).translateYPx;
    expect(up).toBeGreaterThan(0);
    expect(down).toBeLessThan(0);
    expect(Math.abs(up)).toBeCloseTo(Math.abs(down), 6);
  });

  it("최대 이동폭을 넘지 않는다", () => {
    const t = xrDepthLayerTransform({
      scrollProgress: 0,
      layerDepth: 1,
      intensity: "vivid",
      reducedMotion: false,
    });
    expect(Math.abs(t.translateYPx)).toBeLessThanOrEqual(
      (XR_DEPTH_PARALLAX_RANGE_PX / 2) * 1.001,
    );
  });

  it("reducedMotion 또는 off에서는 항등 변환이다", () => {
    for (const intensity of ["subtle", "vivid"] as const) {
      const t = xrDepthLayerTransform({
        scrollProgress: 0.1,
        layerDepth: 1,
        intensity,
        reducedMotion: true,
      });
      expect(t).toEqual({ translateYPx: 0, scale: 1, opacity: 1 });
    }
    const off = xrDepthLayerTransform({
      scrollProgress: 0.1,
      layerDepth: 1,
      intensity: "off",
      reducedMotion: false,
    });
    expect(off).toEqual({ translateYPx: 0, scale: 1, opacity: 1 });
  });

  it("범위 밖 입력도 안전하게 클램프한다", () => {
    const t = xrDepthLayerTransform({
      scrollProgress: 99,
      layerDepth: -5,
      intensity: "vivid",
      reducedMotion: false,
    });
    expect(Number.isFinite(t.translateYPx)).toBe(true);
    expect(t.scale).toBe(1);
  });
});

describe("xrDepthCutCenteredness", () => {
  it("중앙에 있으면 1, 화면 밖이면 0이다", () => {
    const centered = xrDepthCutCenteredness({
      scrollTop: 500,
      cutOffsetTop: 500,
      cutHeight: 1000,
      viewportHeight: 1000,
    });
    expect(centered).toBeCloseTo(1, 6);

    const far = xrDepthCutCenteredness({
      scrollTop: 5000,
      cutOffsetTop: 500,
      cutHeight: 1000,
      viewportHeight: 1000,
    });
    expect(far).toBe(0);
  });

  it("0 이하 크기는 0을 반환한다", () => {
    expect(
      xrDepthCutCenteredness({
        scrollTop: 0,
        cutOffsetTop: 0,
        cutHeight: 0,
        viewportHeight: 800,
      }),
    ).toBe(0);
  });
});

describe("xrDepthCutProgress", () => {
  it("진입 시 0, 이탈 시 1에 수렴한다", () => {
    const entering = xrDepthCutProgress({
      scrollTop: 0,
      cutOffsetTop: 800,
      cutHeight: 1000,
      viewportHeight: 800,
    });
    expect(entering).toBe(0);

    const leaving = xrDepthCutProgress({
      scrollTop: 1800,
      cutOffsetTop: 0,
      cutHeight: 1000,
      viewportHeight: 800,
    });
    expect(leaving).toBe(1);
  });
});

describe("xrDepthFadeForCenteredness", () => {
  it("중앙은 불투명, 가장자리는 페이드된다", () => {
    expect(xrDepthFadeForCenteredness(1)).toBe(1);
    expect(xrDepthFadeForCenteredness(0.5)).toBe(1);
    expect(xrDepthFadeForCenteredness(0)).toBe(0);
    const mid = xrDepthFadeForCenteredness(0.2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});
