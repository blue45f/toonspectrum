import { describe, expect, it } from "vitest";
import {
  DEFAULT_STUDIO_FOLLOW_CONFIG,
  STUDIO_FOLLOW_DISTANCE_TILES,
  STUDIO_FOLLOW_TILE_PX,
  findStudioFollowPoint,
  resolveStudioFollowStandOffPx,
  studioFollowModeCopy,
  type StudioFollowConfig,
} from "./studio-virtual-space-follow";
import { studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";

const openWorld = { ...DEFAULT_STUDIO_WORLD_MANIFEST, width: 600, height: 600, props: [], colliders: [] };
const bt = (ko: string, en: string) => `${ko}|${en}`;

describe("resolveStudioFollowStandOffPx", () => {
  it("기본값은 1.5타일 × 32px = 48px이다", () => {
    expect(resolveStudioFollowStandOffPx(DEFAULT_STUDIO_FOLLOW_CONFIG)).toBe(
      STUDIO_FOLLOW_DISTANCE_TILES * STUDIO_FOLLOW_TILE_PX,
    );
    expect(resolveStudioFollowStandOffPx(DEFAULT_STUDIO_FOLLOW_CONFIG)).toBe(48);
  });

  it("깨진 설정값은 기본값으로 되돌린다", () => {
    const broken: StudioFollowConfig = { mode: "standard", ignoreCollisions: false, distanceTiles: 0, tilePx: -1 };
    expect(resolveStudioFollowStandOffPx(broken)).toBe(48);
  });
});

describe("findStudioFollowPoint", () => {
  it("대상 둘레에서 현재 위치와 가장 가까운 링 지점을 고른다", () => {
    const point = findStudioFollowPoint(openWorld, { x: 100, y: 300 }, { x: 300, y: 300 }, 48, false);
    expect(point).not.toBeNull();
    // 대상 왼쪽(현재 위치 방향)에 붙는다
    expect(point!.x).toBeLessThan(300);
    expect(Math.hypot(point!.x - 300, point!.y - 300)).toBeCloseTo(48, 0);
  });

  it("주변이 전부 막히면 충돌 무시 없이는 null이다", () => {
    const boxed = {
      ...openWorld,
      colliders: [{ x: 240, y: 240, width: 120, height: 120 }],
    };
    // 대상이 상자 안, 링 지점도 전부 상자 안 → 점유 불가
    expect(findStudioFollowPoint(boxed, { x: 100, y: 100 }, { x: 300, y: 300 }, 20, false)).toBeNull();
    // 충돌을 무시하면 링 지점을 그대로 돌려준다
    const ghost = findStudioFollowPoint(boxed, { x: 100, y: 100 }, { x: 300, y: 300 }, 20, true);
    expect(ghost).not.toBeNull();
    expect(studioWorldCanOccupy(boxed, ghost!)).toBe(false);
  });

  it("잘못된 스탠드오프에는 null이다", () => {
    expect(findStudioFollowPoint(openWorld, { x: 0, y: 0 }, { x: 10, y: 10 }, 0, false)).toBeNull();
    expect(findStudioFollowPoint(openWorld, { x: 0, y: 0 }, { x: 10, y: 10 }, Number.NaN, false)).toBeNull();
  });
});

describe("studioFollowModeCopy", () => {
  it("모드별 양언 문구를 만든다", () => {
    expect(studioFollowModeCopy(bt, "docent")).toContain("도슨트");
    expect(studioFollowModeCopy(bt, "standard")).toBe("일반 따라가기|Standard follow");
  });
});
