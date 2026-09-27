import { describe, expect, it } from "vitest";
import { studioVirtualDecorationPreset, type StudioVirtualDecorationState, type StudioVirtualDecorPlacement } from "./studio-virtual-space-customization";
import { addStudioVirtualDecorationSafely, editStudioVirtualDecoration, studioVirtualDecorBounds, studioVirtualDecorCollider,
  studioVirtualDecorationNavigationWorld, studioVirtualDecorationPresetForWorld, studioVirtualDecorationStateForWorld } from "./studio-virtual-space-decoration-layout";
import { studioVirtualPlaceWorldManifest } from "./studio-virtual-space-place-world";
import { STUDIO_VIRTUAL_PLACES } from "./studio-virtual-space-place-catalog";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import { findStudioWorldPath, studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";

function world(): StudioVirtualSpaceWorldManifest {
  return { ...studioVirtualPlaceWorldManifest("skyport", true), tilemap: undefined, props: [], colliders: [], portals: [], interactions: [],
    spawns: [{ id: "entry", point: { x: 80, y: 320 } }], npcs: [], interactionSlots: [], npcActivityAnchors: [], acousticZones: [] };
}
const bench: StudioVirtualDecorPlacement = { id: "bench-a", type: "bench", x: 400, y: 320, rotation: 0, scale: 1 };
function state(placements: readonly StudioVirtualDecorPlacement[] = []): StudioVirtualDecorationState {
  return { ...studioVirtualDecorationPreset("minimal"), placements, layoutWidth: 960, layoutHeight: 640 };
}

describe("가구 배치와 이동 동선 계약", () => {
  it("이전 1280×960 프리셋을 작은 장소 안으로 투영하고 다시 축소하지 않는다", () => {
    const place = studioVirtualPlaceWorldManifest("skyport", true);
    const projected = studioVirtualDecorationStateForWorld(studioVirtualDecorationPreset("creator-garden"), place);
    expect(projected.placements).toHaveLength(7);
    expect(projected).toMatchObject({ layoutWidth: 960, layoutHeight: 640 });
    for (const item of projected.placements) {
      const bounds = studioVirtualDecorBounds(item);
      expect(bounds.x).toBeGreaterThanOrEqual(-.01);
      expect(bounds.y).toBeGreaterThanOrEqual(-.01);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(960.01);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(640.01);
    }
    expect(studioVirtualDecorationStateForWorld(projected, place)).toBe(projected);
  });

  it("솔리드 가구의 회전·크기와 경로 탐색이 같은 충돌 영역을 쓴다", () => {
    const base = studioVirtualDecorCollider(bench);
    const rotated = studioVirtualDecorCollider({ ...bench, rotation: 90, scale: 1.2 });
    expect(base).not.toBeNull();
    expect(rotated?.width).toBeCloseTo((base?.height ?? 0) * 1.2);
    expect(rotated?.height).toBeCloseTo((base?.width ?? 0) * 1.2);
    expect(studioVirtualDecorCollider({ ...bench, type: "rug" })).toBeNull();
    const navigation = studioVirtualDecorationNavigationWorld(world(), state([bench]));
    expect(studioWorldCanOccupy(navigation, { x: 400, y: 310 })).toBe(false);
    const path = findStudioWorldPath(navigation, { x: 300, y: 310 }, { x: 500, y: 310 });
    expect(path.length).toBeGreaterThan(1);
  });

  it("가구·플레이어·좌석·출입점과 월드 경계를 보호하고 실패 시 입력을 보존한다", () => {
    const place = { ...world(), colliders: [{ x: 500, y: 250, width: 100, height: 80 }] };
    const current = state([bench]);
    expect(editStudioVirtualDecoration(current, bench.id, { x: 550, y: 290 }, place)).toMatchObject({ ok: false, reason: "occupied" });
    expect(editStudioVirtualDecoration(current, bench.id, { x: 80, y: 320 }, place)).toMatchObject({ ok: false, reason: "access" });
    expect(editStudioVirtualDecoration(current, bench.id, { x: 700, y: 320 }, place, { x: 700, y: 310 })).toMatchObject({ ok: false, reason: "access" });
    expect(editStudioVirtualDecoration(current, bench.id, { x: 12 }, place)).toMatchObject({ ok: false, reason: "bounds" });
    expect(editStudioVirtualDecoration(current, bench.id, { scale: Number.NaN }, place)).toMatchObject({ ok: false, reason: "invalid" });
    expect(current.placements).toEqual([bench]);
  });

  it("접근점을 덮지 않더라도 통로를 끊는 배치를 거부한다", () => {
    const place = { ...world(), width: 320, height: 320,
      colliders: [{ x: 150, y: 0, width: 20, height: 120 }, { x: 150, y: 186, width: 20, height: 134 }],
      spawns: [{ id: "west", point: { x: 60, y: 153 } }, { id: "east", point: { x: 260, y: 153 } }] };
    const current = { ...state([{ ...bench, x: 70, y: 250 }]), layoutWidth: 320, layoutHeight: 320 };
    expect(editStudioVirtualDecoration(current, bench.id, { x: 145, y: 153, rotation: 90 }, place)).toEqual({ ok: false, reason: "access" });
  });

  it("주변 빈 바닥에 겹치지 않게 추가하고 회전·크기 편집을 검증한다", () => {
    const place = world(), point = { x: 420, y: 420 };
    const first = addStudioVirtualDecorationSafely(state(), "drawing-desk", point, place);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = addStudioVirtualDecorationSafely(first.state, "bookshelf", point, place);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const [left, right] = second.state.placements;
    expect(left).toBeDefined(); expect(right).toBeDefined();
    expect(left?.x === right?.x && left?.y === right?.y).toBe(false);
    expect(editStudioVirtualDecoration(state([bench]), bench.id, { rotation: 90, scale: 1.2 }, place)).toMatchObject({ ok: true });
  });

  it.each(STUDIO_VIRTUAL_PLACES.flatMap((place) => (["creator-garden", "festival", "night-market"] as const).map((preset) => [place.id, preset] as const)))("%s의 %s 프리셋은 가구 수와 접근 가능성을 보존한다", (id, preset) => {
    const place = studioVirtualPlaceWorldManifest(id, false);
    const result = studioVirtualDecorationPresetForWorld(preset, place);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.placements).toHaveLength(7);
    const navigation = studioVirtualDecorationNavigationWorld(place, result.state);
    for (const spawn of place.spawns) expect(studioWorldCanOccupy(navigation, spawn.point)).toBe(true);
    for (const npc of place.npcs) expect(studioWorldCanOccupy(navigation, npc.point)).toBe(true);
  });
});
