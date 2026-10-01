import { describe, expect, it } from "vitest";

import {
  buildMovePathDisplay,
  movePathMarkerPulse,
  simplifyMovePath,
  STUDIO_MOVE_PATH_ARRIVAL_DISTANCE,
} from "./studio-virtual-space-move-path-display";

describe("simplifyMovePath", () => {
  it("짧은 경로는 그대로 둔다", () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
    expect(simplifyMovePath(points, 32)).toEqual(points);
  });

  it("긴 경로는 시작·끝점을 유지하며 솎아낸다", () => {
    const points = Array.from({ length: 101 }, (_, i) => ({ x: i * 10, y: 0 }));
    const simplified = simplifyMovePath(points, 11);
    expect(simplified).toHaveLength(11);
    expect(simplified[0]).toEqual({ x: 0, y: 0 });
    expect(simplified[10]).toEqual({ x: 1000, y: 0 });
  });
});

describe("movePathMarkerPulse", () => {
  it("사인파 펄스로 0~1 사이", () => {
    const pulse = movePathMarkerPulse(300, 0, false);
    expect(pulse).toBeGreaterThanOrEqual(0);
    expect(pulse).toBeLessThanOrEqual(1);
    expect(movePathMarkerPulse(0, 0, false)).toBeCloseTo(0.5, 5);
  });

  it("reducedMotion이면 고정값", () => {
    expect(movePathMarkerPulse(123456, 0, true)).toBe(0.5);
  });
});

describe("buildMovePathDisplay", () => {
  it("이동 중이면 폴리라인과 마커를 만든다", () => {
    const display = buildMovePathDisplay({
      current: { x: 0, y: 0 },
      path: [{ x: 50, y: 0 }, { x: 100, y: 0 }],
      destination: { x: 100, y: 0 },
      moving: true,
      now: 1000,
      markerStartedAt: 800,
      reducedMotion: false,
    });
    expect(display.visible).toBe(true);
    expect(display.polyline[0]).toEqual({ x: 0, y: 0 });
    expect(display.marker?.point).toEqual({ x: 100, y: 0 });
    expect(display.remainingDistance).toBeCloseTo(100, 1);
  });

  it("목적지가 없으면 숨긴다", () => {
    const display = buildMovePathDisplay({
      current: { x: 0, y: 0 }, path: [], destination: null, moving: false,
      now: 1000, markerStartedAt: 800, reducedMotion: false,
    });
    expect(display.visible).toBe(false);
  });

  it("도착(근접 + 정지)하면 숨긴다", () => {
    const display = buildMovePathDisplay({
      current: { x: 100 + STUDIO_MOVE_PATH_ARRIVAL_DISTANCE / 2, y: 0 },
      path: [],
      destination: { x: 100, y: 0 },
      moving: false,
      now: 1000, markerStartedAt: 800, reducedMotion: false,
    });
    expect(display.visible).toBe(false);
  });

  it("경로 끝이 목적지와 다르면 목적지를 이어 붙인다", () => {
    const display = buildMovePathDisplay({
      current: { x: 0, y: 0 },
      path: [{ x: 50, y: 0 }],
      destination: { x: 90, y: 20 },
      moving: true,
      now: 1000, markerStartedAt: 800, reducedMotion: false,
    });
    const last = display.polyline[display.polyline.length - 1]!;
    expect(last).toEqual({ x: 90, y: 20 });
  });
});
