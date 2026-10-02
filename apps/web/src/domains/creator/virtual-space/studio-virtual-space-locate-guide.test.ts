import { describe, expect, it } from "vitest";

import {
  buildStudioLocateGuide,
  studioLocateDistanceLabel,
} from "./studio-virtual-space-locate-guide";

const BASE = {
  self: { x: 0, y: 0 },
  cameraCenter: { x: 0, y: 0 },
  viewWidth: 800,
  viewHeight: 600,
};

describe("buildStudioLocateGuide", () => {
  it("타깃이 없으면 숨긴다", () => {
    expect(buildStudioLocateGuide({ ...BASE, target: null }).visible).toBe(false);
  });

  it("화면 안 타깃은 그 위치에 마커", () => {
    const guide = buildStudioLocateGuide({ ...BASE, target: { x: 100, y: 50 } });
    expect(guide.visible).toBe(true);
    expect(guide.onScreen).toBe(true);
    expect(guide.markerPoint).toEqual({ x: 100, y: 50 });
    expect(guide.distance).toBeCloseTo(Math.hypot(100, 50), 6);
  });

  it("화면 밖 타깃은 가장자리에 마커 + 방향각", () => {
    const guide = buildStudioLocateGuide({ ...BASE, target: { x: 2000, y: 0 }, margin: 48 });
    expect(guide.visible).toBe(true);
    expect(guide.onScreen).toBe(false);
    expect(guide.markerPoint.x).toBe(400 - 48); // right - margin
    expect(guide.markerPoint.y).toBe(0);
    expect(guide.angle).toBeCloseTo(0, 8); // 오른쪽 방향
  });

  it("대각선 밖 타깃도 가장자리 안에 클램프된다", () => {
    const guide = buildStudioLocateGuide({ ...BASE, target: { x: -2000, y: -2000 }, margin: 48 });
    expect(guide.onScreen).toBe(false);
    expect(guide.markerPoint.x).toBe(-(400 - 48));
    expect(guide.markerPoint.y).toBe(-(300 - 48));
    expect(guide.angle).toBeCloseTo(-Math.PI * 0.75, 8);
  });

  it("자기 자신과 겹치면 숨긴다", () => {
    const guide = buildStudioLocateGuide({ ...BASE, target: { x: 0.5, y: 0 } });
    expect(guide.visible).toBe(false);
  });
});

describe("studioLocateDistanceLabel", () => {
  it("거리를 짧게 표기한다", () => {
    expect(studioLocateDistanceLabel(250.4)).toBe("250");
    expect(studioLocateDistanceLabel(1500)).toBe("1.5k");
  });
});
