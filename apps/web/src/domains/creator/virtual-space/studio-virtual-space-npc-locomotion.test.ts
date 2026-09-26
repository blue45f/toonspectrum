import { describe, expect, it } from "vitest";
import { StudioNpcDirector, type StudioNpcView } from "./studio-virtual-space-npc-director";
import { DEFAULT_STUDIO_WORLD_MANIFEST, type StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import { studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";

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
});
