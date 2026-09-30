import { describe, expect, it } from "vitest";

import {
  XR_AR_REFERENCE_DISTANCE_M,
  XR_AR_SCALE_MAX,
  XR_AR_SCALE_MIN,
  xrArDistanceM,
  xrArFacingRotationYRad,
  xrArMiniatureSpec,
  xrArNormalizeAngleRad,
  xrArPlacementFromHit,
  xrArScaleForDistance,
} from "./xr-webtoon-ar-placement";

describe("xrArNormalizeAngleRad", () => {
  it("-PI..PI 범위로 정규화한다", () => {
    // 3π는 π와 -π 모두 동등각이다. 절댓값으로 판정한다.
    expect(Math.abs(xrArNormalizeAngleRad(Math.PI * 3))).toBeCloseTo(Math.PI, 6);
    expect(Math.abs(xrArNormalizeAngleRad(-Math.PI * 3))).toBeCloseTo(Math.PI, 6);
    expect(xrArNormalizeAngleRad(0)).toBe(0);
    expect(xrArNormalizeAngleRad(Number.NaN)).toBe(0);
    // 범위를 벗어나지 않는다
    for (const v of [10, -10, 100, -100]) {
      const r = xrArNormalizeAngleRad(v);
      expect(r).toBeGreaterThanOrEqual(-Math.PI);
      expect(r).toBeLessThanOrEqual(Math.PI);
    }
  });
});

describe("xrArFacingRotationYRad", () => {
  it("카메라 반대편을 향한다", () => {
    expect(xrArFacingRotationYRad(0)).toBeCloseTo(Math.PI, 6);
    expect(xrArFacingRotationYRad(Math.PI)).toBeCloseTo(0, 6);
  });
});

describe("xrArScaleForDistance", () => {
  it("기준 거리에서는 baseScale 그대로다", () => {
    expect(xrArScaleForDistance(XR_AR_REFERENCE_DISTANCE_M, 1)).toBeCloseTo(1, 6);
  });

  it("멀수록 커지고 min/max로 클램프된다", () => {
    expect(xrArScaleForDistance(3, 1)).toBeGreaterThan(1);
    expect(xrArScaleForDistance(0.2, 1)).toBeLessThan(1);
    expect(xrArScaleForDistance(100, 1)).toBe(XR_AR_SCALE_MAX);
    expect(xrArScaleForDistance(0.01, 0.01)).toBe(XR_AR_SCALE_MIN);
  });
});

describe("xrArPlacementFromHit", () => {
  it("히트 지점에 카메라를 바라보는 배치를 만든다", () => {
    const placement = xrArPlacementFromHit({
      hit: { position: [0.5, 0, -1] },
      cameraYawRad: 0.5,
      cameraDistanceM: 1.5,
      baseScale: 1,
    });
    expect(placement.position).toEqual([0.5, 0, -1]);
    expect(placement.rotationYRad).toBeCloseTo(xrArFacingRotationYRad(0.5), 6);
    expect(placement.scale).toBeCloseTo(1, 6);
  });

  it("baseScale이 범위를 벗어나면 클램프한다", () => {
    const placement = xrArPlacementFromHit({
      hit: { position: [0, 0, 0] },
      cameraYawRad: 0,
      cameraDistanceM: 1.5,
      baseScale: 99,
    });
    expect(placement.scale).toBeLessThanOrEqual(XR_AR_SCALE_MAX);
  });
});

describe("xrArDistanceM", () => {
  it("유클리드 거리를 반환한다", () => {
    expect(xrArDistanceM([0, 0, 0], [3, 4, 0])).toBe(5);
  });
});

describe("xrArMiniatureSpec", () => {
  it("세로 화면에서는 카메라를 더 멀리 둔다", () => {
    const landscape = xrArMiniatureSpec({ width: 1200, height: 800 });
    const portrait = xrArMiniatureSpec({ width: 390, height: 844 });
    expect(portrait.cameraDistance).toBeGreaterThan(landscape.cameraDistance);
    expect(landscape.worldScale).toBeGreaterThan(0);
    expect(landscape.tableRadius).toBeGreaterThan(0);
  });

  it("0 크기 입력에도 안전하다", () => {
    const spec = xrArMiniatureSpec({ width: 0, height: 0 });
    expect(Number.isFinite(spec.cameraDistance)).toBe(true);
  });
});
