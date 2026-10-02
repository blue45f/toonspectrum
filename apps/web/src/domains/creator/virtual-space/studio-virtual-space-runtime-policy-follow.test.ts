import { describe, expect, it } from "vitest";
import {
  EMPTY_STUDIO_WORLD_WALK_OVER,
  stepStudioWorldWalkOver,
} from "./studio-virtual-space-runtime-policy";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";

const openWorld = { ...DEFAULT_STUDIO_WORLD_MANIFEST, width: 600, height: 600, props: [], colliders: [] };
const target = { id: "peer-1", point: { x: 400, y: 300 } };

describe("stepStudioWorldWalkOver 따라가기 확장 옵션 (T8)", () => {
  it("옵션이 없으면 기존 32px 옆자리 동작을 유지한다", () => {
    const result = stepStudioWorldWalkOver(openWorld, EMPTY_STUDIO_WORLD_WALK_OVER, { x: 100, y: 300 }, { followTarget: target });
    expect(result.follow).toBe(true);
    expect(result.routeTarget).not.toBeNull();
    expect(Math.hypot(result.routeTarget!.x - 400, result.routeTarget!.y - 300)).toBeCloseTo(32, 0);
  });

  it("standOffPx를 주면 그 거리(1.5타일=48px) 링으로 붙는다", () => {
    const result = stepStudioWorldWalkOver(openWorld, EMPTY_STUDIO_WORLD_WALK_OVER, { x: 100, y: 300 }, {
      followTarget: target, standOffPx: 48,
    });
    expect(result.routeTarget).not.toBeNull();
    expect(Math.hypot(result.routeTarget!.x - 400, result.routeTarget!.y - 300)).toBeCloseTo(48, 0);
  });

  it("스탠드오프+여유 안에 있으면 도착으로 보고 경로를 만들지 않는다", () => {
    // 거리 50 < 48 + 8(slack)
    const result = stepStudioWorldWalkOver(openWorld, EMPTY_STUDIO_WORLD_WALK_OVER, { x: 350, y: 300 }, {
      followTarget: target, standOffPx: 48,
    });
    expect(result.follow).toBe(true);
    expect(result.routeTarget).toBeNull();
  });

  it("holdSlackPx(도슨트 대기 밴드) 안에서는 붙으러 가지 않는다", () => {
    // 거리 100: 기본 밴드(56) 밖이지만 도슨트 밴드(48+8+48=104) 안
    const holding = stepStudioWorldWalkOver(openWorld, EMPTY_STUDIO_WORLD_WALK_OVER, { x: 300, y: 300 }, {
      followTarget: target, standOffPx: 48, holdSlackPx: 48,
    });
    expect(holding.follow).toBe(true);
    expect(holding.routeTarget).toBeNull();
    const pursuing = stepStudioWorldWalkOver(openWorld, EMPTY_STUDIO_WORLD_WALK_OVER, { x: 300, y: 300 }, {
      followTarget: target, standOffPx: 48,
    });
    expect(pursuing.routeTarget).not.toBeNull();
  });

  it("주변이 막혀 있으면 따라가기가 풀리지만, 충돌 무시면 링 지점을 그대로 쓴다", () => {
    const boxed = { ...openWorld, colliders: [{ x: 340, y: 240, width: 120, height: 120 }] };
    const blocked = stepStudioWorldWalkOver(boxed, EMPTY_STUDIO_WORLD_WALK_OVER, { x: 100, y: 300 }, {
      followTarget: target, standOffPx: 20,
    });
    expect(blocked.follow).toBe(false);
    expect(blocked.routeTarget).toBeNull();
    const ghost = stepStudioWorldWalkOver(boxed, EMPTY_STUDIO_WORLD_WALK_OVER, { x: 100, y: 300 }, {
      followTarget: target, standOffPx: 20, ignoreCollisions: true,
    });
    expect(ghost.follow).toBe(true);
    expect(ghost.routeTarget).not.toBeNull();
    expect(Math.hypot(ghost.routeTarget!.x - 400, ghost.routeTarget!.y - 300)).toBeCloseTo(20, 0);
  });

  it("직접 조종 입력(direct)이면 즉시 해제된다", () => {
    const result = stepStudioWorldWalkOver(openWorld, EMPTY_STUDIO_WORLD_WALK_OVER, { x: 100, y: 300 }, {
      followTarget: target, direct: true,
    });
    expect(result.follow).toBe(false);
    expect(result.routeTarget).toBeNull();
  });
});

describe("따라가기 대상 전환 (회귀)", () => {
  it("버튼으로 시작한 따라가기(followTarget만 지정)도 즉시 물린다", () => {
    // 예전에는 choice(아바타 클릭)로만 물려서 스트립·메뉴로 시작하면 움직이지 않았다.
    const result = stepStudioWorldWalkOver(openWorld, EMPTY_STUDIO_WORLD_WALK_OVER, { x: 100, y: 300 }, { followTarget: target });
    expect(result.follow).toBe(true);
    expect(result.state.targetId).toBe("peer-1");
  });

  it("따라가는 중 대상을 바꾸면 새 대상으로 전환한다", () => {
    const engaged = { follow: true, targetId: "peer-1", routeTarget: null };
    const switched = stepStudioWorldWalkOver(openWorld, engaged, { x: 100, y: 300 }, {
      followTarget: { id: "peer-2", point: { x: 500, y: 100 } },
    });
    expect(switched.follow).toBe(true);
    expect(switched.state.targetId).toBe("peer-2");
    expect(switched.routeTarget).not.toBeNull();
  });
});
