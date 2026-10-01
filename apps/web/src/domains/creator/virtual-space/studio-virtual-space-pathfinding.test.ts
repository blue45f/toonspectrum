import { describe, expect, it } from "vitest";
import { studioWorldSoftArrivalInput } from "./studio-virtual-space-path-steering";
import {
  findStudioWorldPath,
  resolveStudioWorldArrivalPoint,
  shouldReplanStudioWorldPath,
  studioWorldCanOccupy,
  STUDIO_WORLD_REPLAN_INTERVAL_MS,
} from "./studio-virtual-space-world-pathfinding";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";

const openWorld = { ...DEFAULT_STUDIO_WORLD_MANIFEST, width: 600, height: 600, props: [], colliders: [] };

describe("대체 도착점", () => {
  it("점유 가능한 목표는 그대로 반환한다", () => {
    const point = resolveStudioWorldArrivalPoint(openWorld, { x: 300, y: 300 });
    expect(point).toEqual({ x: 300, y: 300 });
  });

  it("가구 안을 찍으면 가구 앞 대체 지점을 찾는다", () => {
    const world = { ...openWorld, colliders: [{ x: 280, y: 280, width: 60, height: 60 }] };
    const point = resolveStudioWorldArrivalPoint(world, { x: 310, y: 310 });
    expect(point).not.toBeNull();
    // 실제 점유 판정 기준으로 가구 밖이어야 한다
    expect(studioWorldCanOccupy(world, point!)).toBe(true);
    // 원래 목표 근처에 멈춘다
    expect(Math.hypot(point!.x - 310, point!.y - 310)).toBeLessThan(120);
  });

  it("잘못된 입력에는 null을 반환한다", () => {
    expect(resolveStudioWorldArrivalPoint(openWorld, { x: Number.NaN, y: 10 })).toBeNull();
  });

  it("막힌 목적지로도 경로를 찾으면 대체 지점에서 끝난다", () => {
    const world = { ...openWorld, colliders: [{ x: 280, y: 280, width: 60, height: 60 }] };
    const path = findStudioWorldPath(world, { x: 100, y: 100 }, { x: 310, y: 310 });
    expect(path.length).toBeGreaterThan(0);
    const last = path.at(-1)!;
    expect(studioWorldCanOccupy(world, last)).toBe(true);
  });
});

describe("코너 커팅 방지", () => {
  it("대각선으로 모서리를 스치는 경로는 우회한다", () => {
    // ㄴ자 장애물: 대각선 지름길이 모서리를 스친다
    const world = {
      ...openWorld,
      colliders: [
        { x: 200, y: 200, width: 100, height: 12 },
        { x: 200, y: 200, width: 12, height: 100 },
      ],
    };
    const path = findStudioWorldPath(world, { x: 150, y: 150 }, { x: 350, y: 350 });
    expect(path.length).toBeGreaterThan(0);
    // 경로상의 모든 점이 점유 가능해야 한다 (모서리 침범 없음)
    for (const point of path) {
      expect(studioWorldCanOccupy(world, point)).toBe(true);
    }
  });
});

describe("경로 재계산 스로틀", () => {
  it("목적지가 바뀌면 즉시 재계산한다", () => {
    expect(shouldReplanStudioWorldPath({
      lastPlanAt: 1000, now: 1100, targetChanged: true, targetMovedPx: 0,
    })).toBe(true);
  });

  it("간격이 지나지 않았으면 재계산하지 않는다", () => {
    expect(shouldReplanStudioWorldPath({
      lastPlanAt: 1000, now: 1000 + STUDIO_WORLD_REPLAN_INTERVAL_MS - 1, targetChanged: false, targetMovedPx: 0,
    })).toBe(false);
  });

  it("간격이 지나면 재계산한다", () => {
    expect(shouldReplanStudioWorldPath({
      lastPlanAt: 1000, now: 1000 + STUDIO_WORLD_REPLAN_INTERVAL_MS, targetChanged: false, targetMovedPx: 0,
    })).toBe(true);
  });

  it("목적지가 크게 움직이면(따라가기) 간격과 무관하게 재계산한다", () => {
    expect(shouldReplanStudioWorldPath({
      lastPlanAt: 1000, now: 1010, targetChanged: false, targetMovedPx: 25,
    })).toBe(true);
  });
});

describe("부드러운 도착 감속", () => {
  it("정지 거리 안에서는 0을 반환한다", () => {
    expect(studioWorldSoftArrivalInput({ x: 0, y: 0 }, { x: 1, y: 0 }, 210, 2200)).toEqual({ x: 0, y: 0 });
  });

  it("멀리서는 기본 제동 곡선과 같다", () => {
    const soft = studioWorldSoftArrivalInput({ x: 0, y: 0 }, { x: 100, y: 0 }, 210, 2200);
    // soft zone(12px) 밖이므로 ease-out이 곱해지지 않는다
    expect(Math.hypot(soft.x, soft.y)).toBeGreaterThan(0);
    expect(Math.hypot(soft.x, soft.y)).toBeLessThanOrEqual(1);
  });

  it("목적지 근처에서는 기본 곡선보다 더 부드럽다 (오버슈트 방지)", () => {
    const soft = studioWorldSoftArrivalInput({ x: 0, y: 0 }, { x: 6, y: 0 }, 210, 2200);
    const magnitude = Math.hypot(soft.x, soft.y);
    expect(magnitude).toBeGreaterThan(0);
    // 기본 제동 곡선만으로는 √(2*2200*4)/210 ≈ 0.63 수준이지만 ease-out이 추가로 눌러준다
    expect(magnitude).toBeLessThan(0.63);
  });

  it("방향은 목표를 향한다", () => {
    const input = studioWorldSoftArrivalInput({ x: 0, y: 0 }, { x: 30, y: 40 }, 210, 2200);
    expect(input.x).toBeGreaterThan(0);
    expect(input.y).toBeGreaterThan(0);
    expect(input.x / input.y).toBeCloseTo(30 / 40, 5);
  });
});
