import { describe, expect, it } from "vitest";
import { StudioNpcDirector, type StudioNpcView } from "./studio-virtual-space-npc-director";
import { DEFAULT_STUDIO_WORLD_MANIFEST, type StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import { studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";
import { studioVirtualDecorationPreset } from "./studio-virtual-space-customization";
import { studioVirtualDecorationNavigationWorld } from "./studio-virtual-space-decoration-layout";

const world: StudioVirtualSpaceWorldManifest = {
  ...DEFAULT_STUDIO_WORLD_MANIFEST,
  width: 400,
  height: 300,
  colliders: [],
  props: [],
  interactions: [],
  portals: [],
  occlusionLayers: [],
  rooms: [{ id: "writers", labelKo: "작가실", labelEn: "Writers", x: 0, y: 0, width: 400, height: 300 }],
  spawns: [{ id: "main", point: { x: 40, y: 200 } }],
  npcs: [{
    id: "locomotion-writer", skinKey: "npc-editor", roomId: "writers", point: { x: 50, y: 100 },
    facing: "right", speed: 62, behavior: "patrol", patrol: [{ x: 330, y: 100 }],
  }],
};
const environment = { people: [], atmosphere: "balanced" as const };

function first(views: readonly StudioNpcView[]): StudioNpcView {
  const view = views[0];
  if (!view) throw new Error("이동 회귀에 사용할 NPC가 없습니다.");
  return view;
}

describe("NPC 이동 좌표와 발걸음 위상", () => {
  it.each([60, 120, 144])("%i Hz에서 실제 그려진 거리만큼만 걷기 위상을 진행한다", (hz) => {
    const director = new StudioNpcDirector(world);
    let previous = first(director.views);
    let renderedDistance = 0;
    let sawMoving = false;
    let sawArrival = false;

    for (let index = 0; index < hz * 35; index += 1) {
      const view = first(director.advance(1 / hz, environment));
      const traveled = Math.hypot(view.point.x - previous.point.x, view.point.y - previous.point.y);
      renderedDistance += traveled;
      expect(view.distance - previous.distance).toBeCloseTo(traveled, 8);
      expect(view.distance).toBeCloseTo(renderedDistance, 8);
      expect(studioWorldCanOccupy(world, view.point)).toBe(true);
      if (view.moving) sawMoving = true;
      if (sawMoving && !view.moving) sawArrival = true;
      previous = view;
    }

    expect(sawMoving).toBe(true);
    expect(sawArrival).toBe(true);
    expect(renderedDistance).toBeGreaterThan(270);
  });

  it("집중 모드로 멈춘 뒤에는 숨은 이동이나 걷기 위상을 누적하지 않는다", () => {
    const director = new StudioNpcDirector(world);
    let view = first(director.views);
    for (let index = 0; index < 30 * 120 && view.distance < 30; index += 1) {
      view = first(director.advance(1 / 120, environment));
    }
    expect(view.moving).toBe(true);
    const quiet = { ...environment, reducedMotion: true };
    const settled = first(director.advance(1 / 60, quiet));
    for (let index = 0; index < 120; index += 1) {
      const paused = first(director.advance(1 / 120, quiet));
      expect(paused.point).toEqual(settled.point);
      expect(paused.distance).toBe(settled.distance);
      expect(paused.moving).toBe(false);
    }
  });

  it("이동 도중 놓은 가구를 우회하면서 같은 NPC와 걸음 기록을 유지한다", () => {
    const director = new StudioNpcDirector(world);
    let view = first(director.views);
    for (let index = 0; index < 30 * 60 && view.distance < 20; index += 1) {
      view = first(director.advance(1 / 60, environment));
    }
    expect(view.moving).toBe(true);
    const distanceBefore = view.distance;
    const furnished = { ...world, colliders: [{ x: 145, y: 60, width: 60, height: 80 }] };
    director.updateNavigationWorld(furnished);
    expect(first(director.views).id).toBe(view.id);
    expect(first(director.views).distance).toBeGreaterThanOrEqual(distanceBefore);
    let passedFurniture = false;
    let reached = false;
    for (let index = 0; index < 12 * 60; index += 1) {
      view = first(director.advance(1 / 60, environment));
      expect(studioWorldCanOccupy(furnished, view.point)).toBe(true);
      if (view.point.x > 145 && view.point.x < 205 && (view.point.y < 51 || view.point.y > 149)) passedFurniture = true;
      if (Math.hypot(view.point.x - 330, view.point.y - 100) < 4) reached = true;
    }
    expect(passedFurniture).toBe(true);
    expect(reached).toBe(true);
  });

  it("현재 NPC 위치에 가구가 들어오면 바닥 위로 복구하고 보간으로 가구를 통과하지 않는다", () => {
    const director = new StudioNpcDirector(world);
    const furnished = { ...world, colliders: [{ x: 40, y: 85, width: 30, height: 30 }] };
    director.updateNavigationWorld(furnished);
    const view = first(director.views);
    expect(view.id).toBe(world.npcs[0]!.id);
    expect(studioWorldCanOccupy(furnished, view.point)).toBe(true);
    expect(view.distance).toBe(0);
    expect(view.moving).toBe(false);
  });

  it.each(["minimal", "creator-garden", "festival", "night-market"] as const)("저장된 %s 장식이 NPC 시작 위치와 겹쳐도 등장인물을 잃지 않는다", (preset) => {
    const manifest = DEFAULT_STUDIO_WORLD_MANIFEST;
    const furnished = studioVirtualDecorationNavigationWorld(manifest, studioVirtualDecorationPreset(preset));
    const director = new StudioNpcDirector(manifest);
    director.updateNavigationWorld(furnished);
    expect(director.views.map((view) => view.id)).toEqual(manifest.npcs.map((npc) => npc.id));
    for (const view of director.views) {
      expect(studioWorldCanOccupy(furnished, view.point)).toBe(true);
      expect(view.distance).toBe(0);
    }
  });
});
