import { describe, expect, it } from "vitest";

import {
  XR_VR_COMFORT_DISTANCES_M,
  xrVrGalleryLayout,
  xrVrPanelReveals,
  xrVrReadingAdvance,
  xrVrReadingBack,
  xrVrReadingJump,
  xrVrReadingProgress,
  xrVrReadingStart,
} from "./xr-webtoon-vr-theater";

describe("xrVrGalleryLayout", () => {
  it("0개면 빈 배열이다", () => {
    expect(xrVrGalleryLayout({ panelCount: 0 })).toEqual([]);
    expect(xrVrGalleryLayout({ panelCount: -3 })).toEqual([]);
  });

  it("1개면 정면에 배치된다", () => {
    const [pose] = xrVrGalleryLayout({ panelCount: 1, radiusM: 3, eyeHeightM: 1.6 });
    expect(pose.position[0]).toBeCloseTo(0, 6);
    expect(pose.position[1]).toBeCloseTo(1.6, 6);
    expect(pose.position[2]).toBeCloseTo(-3, 6);
    expect(pose.rotationYRad).toBeCloseTo(0, 6);
  });

  it("여러 개면 호 형태로 좌우 대칭 배치된다", () => {
    const poses = xrVrGalleryLayout({ panelCount: 5, radiusM: 3, arcDeg: 120 });
    expect(poses).toHaveLength(5);
    // 첫 패널과 마지막 패널이 좌우 대칭
    expect(poses[0].position[0]).toBeCloseTo(-poses[4].position[0], 6);
    expect(poses[0].position[2]).toBeCloseTo(poses[4].position[2], 6);
    // 모든 패널이 같은 반경 위에 있다
    for (const pose of poses) {
      const r = Math.hypot(pose.position[0], pose.position[2]);
      expect(r).toBeCloseTo(3, 6);
    }
  });

  it("arcDeg 상한(300도)을 넘지 않는다", () => {
    const poses = xrVrGalleryLayout({ panelCount: 3, arcDeg: 720 });
    expect(poses).toHaveLength(3);
    for (const pose of poses) {
      expect(Math.abs(pose.rotationYRad)).toBeLessThanOrEqual((150 * Math.PI) / 180 + 1e-9);
    }
  });
});

describe("XR_VR_COMFORT_DISTANCES_M", () => {
  it("near < standard < far 순서다", () => {
    expect(XR_VR_COMFORT_DISTANCES_M.near).toBeLessThan(XR_VR_COMFORT_DISTANCES_M.standard);
    expect(XR_VR_COMFORT_DISTANCES_M.standard).toBeLessThan(XR_VR_COMFORT_DISTANCES_M.far);
  });
});

describe("읽기 진행 상태 기계", () => {
  it("시작하면 0번 컷이 current, 나머지는 locked", () => {
    const state = xrVrReadingStart(3);
    expect(xrVrPanelReveals(state)).toEqual(["current", "locked", "locked"]);
  });

  it("advance하면 이전 컷이 read가 된다", () => {
    const s1 = xrVrReadingAdvance(xrVrReadingStart(3));
    expect(xrVrPanelReveals(s1)).toEqual(["read", "current", "locked"]);
    const s2 = xrVrReadingAdvance(s1);
    expect(xrVrPanelReveals(s2)).toEqual(["read", "read", "current"]);
    // 마지막에서 더 가도 그대로
    expect(xrVrReadingAdvance(s2)).toEqual(s2);
  });

  it("back하면 이전 컷으로 돌아간다", () => {
    const s = xrVrReadingBack(xrVrReadingAdvance(xrVrReadingStart(3)));
    expect(s.currentIndex).toBe(0);
  });

  it("jump는 범위를 클램프한다", () => {
    const state = xrVrReadingStart(4);
    expect(xrVrReadingJump(state, 99).currentIndex).toBe(3);
    expect(xrVrReadingJump(state, -5).currentIndex).toBe(0);
    expect(xrVrReadingJump(state, 2).currentIndex).toBe(2);
  });

  it("진행률은 0..1이다", () => {
    expect(xrVrReadingProgress(xrVrReadingStart(0))).toBe(0);
    expect(xrVrReadingProgress(xrVrReadingStart(1))).toBe(1);
    const mid = xrVrReadingJump(xrVrReadingStart(5), 2);
    expect(xrVrReadingProgress(mid)).toBeCloseTo(0.5, 6);
    expect(xrVrReadingProgress(xrVrReadingJump(xrVrReadingStart(5), 4))).toBe(1);
  });
});
