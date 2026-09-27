import { describe, expect, it } from "vitest";
import { STUDIO_VIRTUAL_PLACES } from "./studio-virtual-space-place-catalog";
import { studioVirtualPlaceWorldManifest } from "./studio-virtual-space-place-world";
import { StudioWorldConnectivityIndex } from "./studio-virtual-space-world-connectivity";
import { studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";
import { studioWorldCollisionRects } from "./studio-virtual-space-world-manifest";
import { studioVirtualPlaceSetDressing, studioVirtualSetDressingBounds, studioVirtualSetDressingColliders, studioVirtualWorldSetDressing } from "./studio-virtual-space-world-set-dressing";

describe("장소별 랜드마크와 바닥 충돌 계약", () => {
  it.each(STUDIO_VIRTUAL_PLACES.map((place) => place.id))("%s의 건축물·식생·업무 가구가 월드 안에 있고 렌더링과 물리가 같은 배치를 쓴다", (placeId) => {
    const world = studioVirtualPlaceWorldManifest(placeId);
    const scenery = studioVirtualWorldSetDressing(world);
    expect(scenery).toBe(studioVirtualPlaceSetDressing(placeId));
    expect(scenery.length).toBeGreaterThanOrEqual(25);
    expect(new Set(scenery.map((item) => item.id)).size).toBe(scenery.length);
    expect(scenery.filter((item) => item.id.includes("hero-"))).toHaveLength(2);
    expect(scenery.some((item) => item.atlas === "furniture")).toBe(true);
    expect(scenery.some((item) => item.frame === 12 && item.atlas === "landmarks")).toBe(true);
    for (const item of scenery) {
      expect(item.frame).toBeGreaterThanOrEqual(0);
      expect(item.frame).toBeLessThan(16);
      const bounds = studioVirtualSetDressingBounds(item);
      expect(bounds.x, item.id).toBeGreaterThanOrEqual(0);
      expect(bounds.y, item.id).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width, item.id).toBeLessThanOrEqual(world.width);
      expect(bounds.y + bounds.height, item.id).toBeLessThanOrEqual(world.height);
      for (const collider of item.colliders) {
        expect(world.colliders).toContain(collider);
        expect(collider.x, item.id).toBeGreaterThanOrEqual(bounds.x);
        expect(collider.y, item.id).toBeGreaterThanOrEqual(bounds.y);
        expect(collider.x + collider.width, item.id).toBeLessThanOrEqual(bounds.x + bounds.width);
        expect(collider.y + collider.height, item.id).toBeLessThanOrEqual(bounds.y + bounds.height);
      }
    }
    expect(world.colliders.slice(5)).toEqual(studioVirtualSetDressingColliders(placeId));
  });

  it.each(STUDIO_VIRTUAL_PLACES.map((place) => place.id))("%s에서 입장·좌석·NPC·업무 지점이 가려지지 않고 서로 연결된다", (placeId) => {
    const world = studioVirtualPlaceWorldManifest(placeId);
    const points = [
      ...world.spawns.map((spawn) => spawn.point),
      ...world.portals.map((portal) => portal.point),
      ...world.interactions.map((interaction) => interaction.point),
      ...world.npcs.flatMap((npc) => [npc.point, ...npc.patrol ?? []]),
      ...world.interactionSlots?.flatMap((slot) => [slot.approachPoint, slot.anchorPoint, slot.exitPoint]) ?? [],
      ...world.npcActivityAnchors?.flatMap((anchor) => [anchor.approachPoint, anchor.anchorPoint, anchor.exitPoint]) ?? [],
    ];
    const connectivity = new StudioWorldConnectivityIndex(world, studioWorldCollisionRects(world), 9);
    for (const point of points) {
      expect(studioWorldCanOccupy(world, point), `${placeId} ${point.x},${point.y}`).toBe(true);
      expect(connectivity.connected({ x: 480, y: 540 }, point), `${placeId} ${point.x},${point.y}`).toBe(true);
    }
  });

  it("기본 월드와 id가 같더라도 사용자 맵에는 기본 랜드마크를 주입하지 않는다", () => {
    const world = studioVirtualPlaceWorldManifest("personal-atelier");
    const customMap = JSON.parse(JSON.stringify(world));
    expect(studioVirtualWorldSetDressing(customMap)).toEqual([]);
    expect(studioVirtualPlaceSetDressing("user-workshop")).toEqual([]);
  });

  it("14개 장소의 주 건축물과 업무 도구 조합이 서로 구별된다", () => {
    const signatures = STUDIO_VIRTUAL_PLACES.map((place) => studioVirtualPlaceSetDressing(place.id)
      .filter((item) => /hero-|workstation-|purpose-center/u.test(item.id))
      .map(({ atlas, frame, width, height }) => `${atlas}:${frame}:${width}:${height}`).join("|"));
    expect(new Set(signatures).size).toBe(STUDIO_VIRTUAL_PLACES.length);
  });

  it("아치 기둥 사이와 다리 난간 사이의 보이는 통로는 열려 있다", () => {
    const world = studioVirtualPlaceWorldManifest("skyport");
    for (let y = 542; y <= 614; y += 6) expect(studioWorldCanOccupy(world, { x: 480, y })).toBe(true);
    for (let x = 40; x <= 172; x += 6) expect(studioWorldCanOccupy(world, { x, y: 320 })).toBe(true);
    const arch = studioVirtualWorldSetDressing(world).find((item) => item.id.endsWith("arrival-arch"));
    const pillar = arch?.colliders[0];
    expect(pillar).toBeDefined();
    if (pillar) expect(studioWorldCanOccupy(world, { x: pillar.x + pillar.width / 2, y: pillar.y + pillar.height / 2 })).toBe(false);
  });
});
