import { describe, expect, it } from "vitest";

import {
  CAMPUS_DRESSING,
  CAMPUS_HEIGHT,
  CAMPUS_INTERACTIONS,
  CAMPUS_OBJECTS,
  CAMPUS_WIDTH,
  CAMPUS_ZONES,
  type StudioCampusObject,
} from "./studio-virtual-space-campus-blueprint";
import { officePropKindForCampusObject } from "./studio-virtual-space-office-props";
import { studioCampusSigns } from "./studio-virtual-space-campus-world";

const NEW_OBJECT_IDS = [
  "lobby-wall-clock", "lobby-poster-west", "lobby-poster-east",
  "lobby-phone-booth-west", "lobby-phone-booth-east", "lobby-water-cooler",
  "studio-monitor-desk", "studio-poster-west", "studio-poster-east",
  "cowork-focus-desk-west", "cowork-focus-desk-east", "cowork-focus-sign",
  "cafe-vending-machine", "cafe-water-cooler", "cafe-neon-sign", "cafe-lounge-sign",
  "talk-wall-clock", "game-neon-sign", "gallery-archive-sign",
] as const;

const NEW_INTERACTION_IDS = [
  "campus-skyport-phone-booth",
  "campus-personal-atelier-monitor-desk",
  "campus-story-lab-focus-desk",
  "campus-creator-cafe-vending",
] as const;

function objectById(id: string): StudioCampusObject {
  const found = CAMPUS_OBJECTS.find((object) => object.id === id);
  if (!found) throw new Error(`missing campus object: ${id}`);
  return found;
}

function pointInRect(x: number, y: number, rect: { x: number; y: number; width: number; height: number }): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

describe("캠퍼스 사무실 확장 오브젝트 (트랙 G)", () => {
  it("신규 오브젝트 19종이 모두 배치돼 있다", () => {
    for (const id of NEW_OBJECT_IDS) expect(() => objectById(id), id).not.toThrow();
    const ids = CAMPUS_OBJECTS.map((object) => object.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("모든 신규 오브젝트가 월드 안에 있다", () => {
    for (const id of NEW_OBJECT_IDS) {
      const object = objectById(id);
      expect(object.x - object.width / 2, id).toBeGreaterThanOrEqual(0);
      expect(object.x + object.width / 2, id).toBeLessThanOrEqual(CAMPUS_WIDTH);
      expect(object.y - object.height, id).toBeGreaterThanOrEqual(0);
      expect(object.y, id).toBeLessThanOrEqual(CAMPUS_HEIGHT);
    }
  });

  it("바닥 가구는 콜라이더가 있고 벽걸이·간판은 통과형이다", () => {
    for (const id of ["lobby-phone-booth-west", "lobby-phone-booth-east", "lobby-water-cooler", "studio-monitor-desk",
      "cowork-focus-desk-west", "cowork-focus-desk-east", "cafe-vending-machine", "cafe-water-cooler"]) {
      expect(objectById(id).collider, id).toBeDefined();
    }
    for (const id of ["lobby-wall-clock", "talk-wall-clock", "lobby-poster-west", "studio-poster-east", "game-neon-sign"]) {
      expect(objectById(id).wallMounted, id).toBe(true);
      expect(objectById(id).collider, id).toBeUndefined();
    }
  });

  it("신규 콜라이더가 어떤 구역 스폰도 덮지 않는다", () => {
    for (const id of NEW_OBJECT_IDS) {
      const object = objectById(id);
      if (!object.collider) continue;
      for (const zone of CAMPUS_ZONES) {
        expect(pointInRect(zone.spawn.x, zone.spawn.y, object.collider), `${id} covers spawn of ${zone.roomId}`).toBe(false);
      }
    }
  });

  it("간판·네온 오브젝트는 실제 구역명 라벨(한/영)을 갖는다", () => {
    const expectations: Readonly<Record<string, readonly [string, string]>> = {
      "cowork-focus-sign": ["집중석", "FOCUS DESKS"],
      "cafe-lounge-sign": ["라운지", "LOUNGE"],
      "gallery-archive-sign": ["자료실", "ARCHIVE"],
      "cafe-neon-sign": ["카페", "CAFE"],
      "game-neon-sign": ["아케이드", "ARCADE"],
    };
    for (const [id, [ko, en]] of Object.entries(expectations)) {
      expect(objectById(id).labelKo, id).toBe(ko);
      expect(objectById(id).labelEn, id).toBe(en);
    }
  });

  it("구역 간판은 여전히 존당 1개씩 10개다 (서브 간판은 오브젝트로 분리)", () => {
    expect(studioCampusSigns()).toHaveLength(10);
  });

  it("살아있는 소품 종류가 런타임 매핑과 연결된다", () => {
    expect(officePropKindForCampusObject(objectById("studio-monitor-desk").kind)).toBe("monitor-glow");
    expect(officePropKindForCampusObject(objectById("lobby-wall-clock").kind)).toBe("wall-clock");
    expect(officePropKindForCampusObject(objectById("cafe-neon-sign").kind)).toBe("neon-flicker");
    expect(officePropKindForCampusObject(objectById("cafe-vending-machine").kind)).toBeNull();
  });
});

describe("캠퍼스 사무실 확장 드레싱 (트랙 G)", () => {
  it("카페 라운지 세트와 갤러리 자료실 책장이 배치돼 있다", () => {
    const ids = CAMPUS_DRESSING.map((item) => item.id);
    for (const id of ["cafe-lounge-rug", "cafe-lounge-sofa", "gallery-archive-shelf-west", "gallery-archive-shelf-east"]) {
      expect(ids, id).toContain(id);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("캠퍼스 사무실 확장 상호작용 (트랙 G)", () => {
  it("신규 상호작용 4종이 있다", () => {
    const ids = CAMPUS_INTERACTIONS.map((item) => item.id);
    for (const id of NEW_INTERACTION_IDS) expect(ids, id).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("상호작용 지점이 자기 구역 안에 있고 신규 콜라이더와 겹치지 않는다", () => {
    for (const id of NEW_INTERACTION_IDS) {
      const interaction = CAMPUS_INTERACTIONS.find((item) => item.id === id)!;
      const zone = CAMPUS_ZONES.find((candidate) => candidate.roomId === interaction.zoneId)!;
      const rect = {
        x: zone.tiles.column * 64, y: zone.tiles.row * 64,
        width: zone.tiles.width * 64, height: zone.tiles.height * 64,
      };
      expect(pointInRect(interaction.point.x, interaction.point.y, rect), id).toBe(true);
      for (const objectId of NEW_OBJECT_IDS) {
        const collider = objectById(objectId).collider;
        if (!collider) continue;
        expect(pointInRect(interaction.point.x, interaction.point.y, collider), `${id} inside ${objectId}`).toBe(false);
      }
    }
  });

  it("신규 상호작용은 기존 8종 액션만 쓴다", () => {
    const allowed = new Set(["assistant", "assets", "canvas", "community", "comic", "live", "review", "story"]);
    for (const id of NEW_INTERACTION_IDS) {
      const interaction = CAMPUS_INTERACTIONS.find((item) => item.id === id)!;
      expect(allowed.has(interaction.action), id).toBe(true);
      expect(interaction.radius, id).toBeGreaterThan(0);
    }
  });
});
