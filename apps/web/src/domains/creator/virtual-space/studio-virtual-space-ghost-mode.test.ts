import { describe, expect, it } from "vitest";

import {
  studioGhostCollisionOverrides,
  studioGhostSeekInput,
  STUDIO_GHOST_SPRITE_ALPHA,
  toggleStudioGhostMode,
} from "./studio-virtual-space-ghost-mode";

describe("toggleStudioGhostMode", () => {
  it("토글할 때마다 반전된다", () => {
    expect(toggleStudioGhostMode({ enabled: false }).enabled).toBe(true);
    expect(toggleStudioGhostMode({ enabled: true }).enabled).toBe(false);
  });

  it("반투명 값은 트랙1과 공유하는 계약 상수", () => {
    expect(STUDIO_GHOST_SPRITE_ALPHA).toBeGreaterThan(0);
    expect(STUDIO_GHOST_SPRITE_ALPHA).toBeLessThan(1);
  });
});

describe("studioGhostSeekInput", () => {
  it("목적지 방향 단위 벡터를 반환한다", () => {
    const input = studioGhostSeekInput({ x: 0, y: 0 }, { x: 30, y: 40 });
    expect(input).not.toBeNull();
    expect(Math.hypot(input!.x, input!.y)).toBeCloseTo(1, 8);
  });

  it("목적지가 없거나 도착했으면 null", () => {
    expect(studioGhostSeekInput({ x: 0, y: 0 }, null)).toBeNull();
    expect(studioGhostSeekInput({ x: 10, y: 10 }, { x: 10.5, y: 10 })).toBeNull();
  });
});

describe("studioGhostCollisionOverrides", () => {
  it("고스트 on: 충돌기·점유 보정·게이팅 모두 off, 월드 경계는 유지", () => {
    const overrides = studioGhostCollisionOverrides(true);
    expect(overrides.collidersActive).toBe(false);
    expect(overrides.skipOccupancyCorrection).toBe(true);
    expect(overrides.skipNavigationGating).toBe(true);
    expect(overrides.keepWorldBounds).toBe(true);
  });

  it("고스트 off: 전부 정상 판정", () => {
    const overrides = studioGhostCollisionOverrides(false);
    expect(overrides.collidersActive).toBe(true);
    expect(overrides.skipOccupancyCorrection).toBe(false);
    expect(overrides.skipNavigationGating).toBe(false);
  });
});
