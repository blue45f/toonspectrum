import { describe, expect, it } from "vitest";

import { studioVirtualCampusManifest, STUDIO_VIRTUAL_CAMPUS_COMMONS_ID } from "./studio-virtual-space-campus-world";
import {
  buildStudioMapIllustrationPlan,
  studioMapIllustrationSeed,
  studioMapPropFootprint,
  type StudioMapIllustrationProp,
} from "./studio-virtual-space-map-illustration";
import { studioWorldSpawn } from "./studio-virtual-space-world-manifest";

const campus = studioVirtualCampusManifest(false);

describe("buildStudioMapIllustrationPlan", () => {
  it("방 기하는 매니페스트 실제 좌표를 그대로 쓴다", () => {
    const plan = buildStudioMapIllustrationPlan(campus);
    expect(plan.worldWidth).toBe(campus.width);
    expect(plan.worldHeight).toBe(campus.height);
    expect(plan.rooms).toHaveLength(campus.rooms.length);
    for (const room of campus.rooms) {
      const planned = plan.rooms.find((entry) => entry.id === room.id);
      expect(planned).toMatchObject({ x: room.x, y: room.y, width: room.width, height: room.height });
    }
  });

  it("길은 실제 스폰 좌표에서 허브 스폰으로만 잇는다", () => {
    const plan = buildStudioMapIllustrationPlan(campus);
    const hub = campus.spawns.find((spawn) => spawn.id === STUDIO_VIRTUAL_CAMPUS_COMMONS_ID) ?? campus.spawns[0]!;
    expect(plan.paths.length).toBeGreaterThan(0);
    for (const path of plan.paths) {
      expect(path.to).toEqual(hub.point);
      expect(campus.rooms.some((room) => {
        if (room.id === STUDIO_VIRTUAL_CAMPUS_COMMONS_ID) return false;
        const from = studioWorldSpawn(campus, room.id).point;
        return from.x === path.from.x && from.y === path.from.y;
      })).toBe(true);
    }
  });

  it("포털 글로우는 실제 포털 위치·반경에서 파생된다", () => {
    const plan = buildStudioMapIllustrationPlan(campus);
    expect(plan.portalGlows).toHaveLength(campus.portals.length);
    for (const portal of campus.portals) {
      expect(plan.portalGlows).toContainEqual({
        x: portal.point.x,
        y: portal.point.y,
        radius: Math.min(120, Math.max(36, portal.radius * 2.4)),
      });
    }
  });

  it("지면 질감은 방 안과 월드 가장자리에 찍지 않는다", () => {
    const plan = buildStudioMapIllustrationPlan(campus);
    expect(plan.speckles.length).toBeGreaterThan(0);
    for (const speckle of plan.speckles) {
      expect(speckle.x).toBeGreaterThanOrEqual(30);
      expect(speckle.y).toBeGreaterThanOrEqual(30);
      expect(speckle.x).toBeLessThanOrEqual(campus.width - 30);
      expect(speckle.y).toBeLessThanOrEqual(campus.height - 30);
      for (const room of plan.rooms) {
        const inside = speckle.x >= room.x - 26 && speckle.x <= room.x + room.width + 26
          && speckle.y >= room.y - 26 && speckle.y <= room.y + room.height + 26;
        expect(inside).toBe(false);
      }
    }
  });

  it("같은 매니페스트에는 항상 같은 계획을 돌려준다", () => {
    expect(buildStudioMapIllustrationPlan(campus)).toEqual(buildStudioMapIllustrationPlan(campus));
    expect(studioMapIllustrationSeed("cafe")).toBe(studioMapIllustrationSeed("cafe"));
  });

  it("프롭은 assetUrl이 있는 것만 실제 좌표로 싣는다", () => {
    const plan = buildStudioMapIllustrationPlan(campus);
    const withAssets = campus.props.filter((prop) => prop.assetUrl);
    expect(plan.props).toHaveLength(Math.min(withAssets.length, 500));
    for (const prop of plan.props) {
      const source = campus.props.find((entry) => entry.id === prop.id);
      expect(source?.assetUrl).toBe(prop.url);
      expect(prop.x).toBe(source?.x);
      expect(prop.y).toBe(source?.y);
    }
  });
});

describe("studioMapPropFootprint", () => {
  const base: StudioMapIllustrationProp = {
    id: "p", url: "/a.png", x: 100, y: 200, originX: 0.5, originY: 1, alpha: 1,
  };

  it("width/height가 있으면 원본 크기보다 우선한다", () => {
    expect(studioMapPropFootprint({ ...base, width: 40, height: 30 }, 999, 999))
      .toEqual({ x: 80, y: 170, width: 40, height: 30 });
  });

  it("없으면 scale × 원본 크기와 하단 중앙 원점을 쓴다", () => {
    expect(studioMapPropFootprint({ ...base, scale: 2 }, 10, 20))
      .toEqual({ x: 90, y: 160, width: 20, height: 40 });
  });

  it("원본 크기를 모르면 빈 사각형을 돌려준다", () => {
    expect(studioMapPropFootprint(base, 0, 0)).toEqual({ x: 100, y: 200, width: 0, height: 0 });
  });
});
