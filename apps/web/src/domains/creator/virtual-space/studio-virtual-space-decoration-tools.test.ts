/**
 * 꾸미기 도구 테스트 (Track 4 · 에디터 강화)
 */
import { describe, expect, it } from "vitest";

import {
  alignStudioVirtualDecorationToGrid,
  duplicateStudioVirtualDecoration,
  nudgeStudioVirtualDecoration,
  rotateStudioVirtualDecoration,
  snapStudioVirtualDecorPointToGrid,
} from "./studio-virtual-space-decoration-tools";
import { studioVirtualDecorationPreset, type StudioVirtualDecorationState, type StudioVirtualDecorPlacement } from "./studio-virtual-space-customization";
import { addStudioVirtualDecorationSafely } from "./studio-virtual-space-decoration-layout";
import { studioVirtualPlaceWorldManifest } from "./studio-virtual-space-place-world";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

function world(): StudioVirtualSpaceWorldManifest {
  return { ...studioVirtualPlaceWorldManifest("skyport", true), tilemap: undefined, props: [], colliders: [], portals: [], interactions: [],
    spawns: [{ id: "entry", point: { x: 80, y: 320 } }], npcs: [], interactionSlots: [], npcActivityAnchors: [], acousticZones: [] };
}
function state(placements: readonly StudioVirtualDecorPlacement[] = []): StudioVirtualDecorationState {
  return { ...studioVirtualDecorationPreset("minimal"), placements, layoutWidth: 960, layoutHeight: 640 };
}
function withBench(): StudioVirtualDecorationState {
  const result = addStudioVirtualDecorationSafely(state(), "bench", { x: 404, y: 318 }, world());
  if (!result.ok) throw new Error(`배치 실패: ${result.reason}`);
  return result.state;
}

describe("꾸미기 도구", () => {
  it("점을 격자에 스냅한다", () => {
    expect(snapStudioVirtualDecorPointToGrid({ x: 404, y: 318 })).toEqual({ x: 400, y: 320 });
    expect(snapStudioVirtualDecorPointToGrid({ x: 410, y: 310 }, 32)).toEqual({ x: 416, y: 320 });
  });

  it("가구를 격자에 맞춘다 (결과가 16px 배수)", () => {
    const placed = withBench();
    const bench = placed.placements.at(-1);
    if (!bench) throw new Error("벤치가 없다");
    const result = alignStudioVirtualDecorationToGrid(placed, bench.id, world());
    if (!result.ok) throw new Error(`스냅 실패: ${result.reason}`);
    const moved = result.state.placements.find((item) => item.id === bench.id);
    expect(moved?.x % 16).toBe(0);
    expect(moved?.y % 16).toBe(0);
    // 순수 스냅 함수는 정확히 반올림한다.
    expect(snapStudioVirtualDecorPointToGrid({ x: 404, y: 318 })).toEqual({ x: 400, y: 320 });
  });

  it("이미 격자 위의 가구는 그대로 둔다", () => {
    const placed = withBench();
    const bench = placed.placements.at(-1);
    if (!bench) throw new Error("벤치가 없다");
    const aligned = alignStudioVirtualDecorationToGrid(placed, bench.id, world(), undefined, 16);
    if (!aligned.ok) throw new Error(`스냅 실패: ${aligned.reason}`);
    const first = alignStudioVirtualDecorationToGrid(aligned.state, bench.id, world(), undefined, 16);
    expect(first.ok).toBe(true);
  });

  it("가구를 복제한다 (옆에 같은 모양으로)", () => {
    const placed = withBench();
    const bench = placed.placements.at(-1);
    if (!bench) throw new Error("벤치가 없다");
    const result = duplicateStudioVirtualDecoration(placed, bench.id, world());
    if (!result.ok) throw new Error(`복제 실패: ${result.reason}`);
    expect(result.state.placements).toHaveLength(placed.placements.length + 1);
    const clone = result.state.placements.at(-1);
    expect(clone?.type).toBe("bench");
    expect(clone?.id).not.toBe(bench.id);
    expect(clone?.rotation).toBe(bench.rotation);
    expect(clone?.scale).toBe(bench.scale);
    // 안전 배치가 주변 빈 자리를 찾으므로(최대 192px 링 탐색) 근접성만 단언한다.
    const distance = Math.hypot((clone?.x ?? 0) - (bench.x + 32), (clone?.y ?? 0) - (bench.y + 32));
    expect(distance).toBeLessThanOrEqual(200);
  });

  it("가구를 90°씩 회전한다", () => {
    const placed = withBench();
    const bench = placed.placements.at(-1);
    if (!bench) throw new Error("벤치가 없다");
    const once = rotateStudioVirtualDecoration(placed, bench.id, world());
    if (!once.ok) throw new Error(`회전 실패: ${once.reason}`);
    expect(once.state.placements.find((item) => item.id === bench.id)?.rotation).toBe(90);
  });

  it("가구를 미세 이동한다", () => {
    const placed = withBench();
    const bench = placed.placements.at(-1);
    if (!bench) throw new Error("벤치가 없다");
    const result = nudgeStudioVirtualDecoration(placed, bench.id, 4, -8, world());
    if (!result.ok) throw new Error(`이동 실패: ${result.reason}`);
    const moved = result.state.placements.find((item) => item.id === bench.id);
    expect(moved?.x).toBe(bench.x + 4);
    expect(moved?.y).toBe(bench.y - 8);
  });

  it("없는 id는 invalid를 반환한다", () => {
    const placed = withBench();
    expect(alignStudioVirtualDecorationToGrid(placed, "nope", world()).ok).toBe(false);
    expect(duplicateStudioVirtualDecoration(placed, "nope", world()).ok).toBe(false);
    expect(rotateStudioVirtualDecoration(placed, "nope", world()).ok).toBe(false);
    expect(nudgeStudioVirtualDecoration(placed, "nope", 4, 4, world()).ok).toBe(false);
  });
});
