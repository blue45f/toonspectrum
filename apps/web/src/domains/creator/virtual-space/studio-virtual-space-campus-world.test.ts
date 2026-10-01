import { describe, expect, it } from "vitest";

import {
  CAMPUS_DOOR_WIDTH,
  CAMPUS_HEIGHT,
  CAMPUS_WIDTH,
  CAMPUS_ZONES,
} from "./studio-virtual-space-campus-blueprint";
import {
  STUDIO_VIRTUAL_CAMPUS_COMMONS_ID,
  STUDIO_VIRTUAL_CAMPUS_FLOOR_ATLAS_URL,
  STUDIO_VIRTUAL_CAMPUS_POSITION_ID,
  STUDIO_VIRTUAL_CAMPUS_SATELLITES,
  isStudioVirtualCampusRoom,
  resolveStudioVirtualBuiltinWorld,
  studioCampusDoorways,
  studioCampusSigns,
  studioCampusWallSegments,
  studioVirtualCampusManifest,
  studioVirtualCampusScene,
  studioVirtualCampusZoneMeta,
} from "./studio-virtual-space-campus-world";
import { StudioZoneChangeTracker } from "./studio-virtual-space-engine-events";
import { studioNpcInteraction, studioNpcLabel, studioNpcRole } from "./studio-virtual-space-npc-director";
import { resolveStudioWorldZonePresence, StudioWorldZoneTracker } from "./studio-virtual-space-runtime-policy";
import { studioVirtualWorldPresentation, studioVirtualWorldKind } from "./studio-virtual-space-world-presentation";
import { studioVirtualWorldSetDressing } from "./studio-virtual-space-world-set-dressing";
import {
  studioWorldCollisionRects,
  studioWorldInteractions,
  studioWorldPortals,
  studioWorldRoomAt,
  studioWorldSpawn,
  validateStudioWorldManifest,
} from "./studio-virtual-space-world-manifest";
import { findStudioWorldPath, studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";

const personal = studioVirtualCampusManifest(true);
const project = studioVirtualCampusManifest(false);

function reaches(manifest: typeof personal, from: StudioVirtualSpacePoint, to: StudioVirtualSpacePoint, tolerance: number): boolean {
  const end = findStudioWorldPath(manifest, from, to).at(-1);
  return Boolean(end && Math.hypot(end.x - to.x, end.y - to.y) <= tolerance);
}

describe("가상 스튜디오 공중섬 캠퍼스", () => {
  it("개인·프로젝트 캠퍼스 manifest는 validateStudioWorldManifest 오류가 0개다", () => {
    expect(validateStudioWorldManifest(personal)).toEqual([]);
    expect(validateStudioWorldManifest(project)).toEqual([]);
    expect(personal.width).toBe(3072);
    expect(personal.height).toBe(1920);
    expect(CAMPUS_WIDTH).toBe(48 * 64);
    expect(CAMPUS_HEIGHT).toBe(30 * 64);
  });

  it("10개 구역 방과 campus-commons(마지막)가 있고 방 id마다 스폰이 있다", () => {
    const ids = project.rooms.map((room) => room.id);
    expect(ids).toEqual([
      "skyport", "personal-atelier", "story-lab", "creator-cafe", "team-meeting",
      "creator-plaza", "event-stage", "arcade", "beach", "review-gallery", STUDIO_VIRTUAL_CAMPUS_COMMONS_ID,
    ]);
    for (const id of ids.slice(0, -1)) {
      expect(project.spawns.some((spawn) => spawn.id === id), id).toBe(true);
      expect(studioWorldRoomAt(project, studioWorldSpawn(project, id).point), id).toBe(id);
      expect(isStudioVirtualCampusRoom(id)).toBe(true);
    }
    expect(studioWorldRoomAt(project, studioWorldSpawn(project, "main").point)).toBe("skyport");
    expect(isStudioVirtualCampusRoom("garden")).toBe(false);
    expect(isStudioVirtualCampusRoom(STUDIO_VIRTUAL_CAMPUS_COMMONS_ID)).toBe(false);
  });

  it("main 스폰에서 모든 방 스폰·상호작용 반경·포털·좌석 접근점까지 경로가 있다", () => {
    for (const manifest of [personal, project]) {
      const main = studioWorldSpawn(manifest, "main").point;
      for (const spawn of manifest.spawns) expect(reaches(manifest, main, spawn.point, 2), spawn.id).toBe(true);
      for (const interaction of studioWorldInteractions(manifest)) {
        const end = findStudioWorldPath(manifest, main, interaction.point).at(-1);
        expect(end, interaction.id).toBeDefined();
        expect(Math.hypot(end!.x - interaction.point.x, end!.y - interaction.point.y), interaction.id).toBeLessThanOrEqual(interaction.radius);
      }
      for (const portal of studioWorldPortals(manifest)) expect(reaches(manifest, main, portal.point, portal.radius), portal.id).toBe(true);
      for (const slot of manifest.interactionSlots ?? []) expect(reaches(manifest, main, slot.approachPoint, 2), slot.id).toBe(true);
    }
  });

  it("8개 action 상호작용이 모두 있고 HUD 계약 id를 지킨다", () => {
    const interactions = studioWorldInteractions(project);
    expect(new Set(interactions.map((item) => item.action))).toEqual(new Set(["assistant", "assets", "canvas", "community", "comic", "live", "review", "story"]));
    const ids = interactions.map((item) => item.id);
    for (const expected of ["campus-creator-fountain", "campus-event-stage-screen", "campus-story-lab-whiteboard",
      "campus-skyport-concierge-desk", "campus-team-meeting-table", "campus-arcade-cabinet-1"]) expect(ids).toContain(expected);
    expect(ids.some((id) => /^campus-[a-z-]+-cat$/u.test(id))).toBe(true);
    expect(ids.some((id) => /^environment-campus-(north|south|east|west)-falls$/u.test(id))).toBe(true);
  });

  it("개인 모드에는 production-control 게이트가 없고 team-meeting은 개인 public·프로젝트 private이다", () => {
    const hrefs = (manifest: typeof personal) => manifest.portals.map((portal) => portal.href);
    expect(hrefs(personal).some((href) => href?.includes("production-control"))).toBe(false);
    expect(hrefs(project).some((href) => href?.includes("production-control"))).toBe(true);
    for (const satellite of ["tree-library", "garden", "observatory"]) {
      expect(hrefs(personal).some((href) => href?.includes(`place=${satellite}`)), satellite).toBe(true);
    }
    const meeting = (manifest: typeof personal) => manifest.acousticZones?.find((zone) => zone.roomId === "team-meeting");
    expect(meeting(personal)?.policy).toBe("public");
    expect(meeting(project)?.policy).toBe("private");
    expect(meeting(project)?.doorId).toBe("team-meeting-door");
    expect(STUDIO_VIRTUAL_CAMPUS_SATELLITES.map((item) => item.placeId).sort()).toEqual(["garden", "observatory", "production-control", "tree-library"]);
  });

  it("캠퍼스 tileset은 스타일 토큰 URL·512×512·128px 셀이고 표현 힌트는 추종 카메라다", () => {
    const tileset = project.tilemap?.tilesets[0];
    expect(tileset).toMatchObject({ imageUrl: STUDIO_VIRTUAL_CAMPUS_FLOOR_ATLAS_URL, imageWidth: 512, imageHeight: 512, tileWidth: 128, tileHeight: 128, columns: 4 });
    expect(STUDIO_VIRTUAL_CAMPUS_FLOOR_ATLAS_URL).toContain("{style}");
    expect(project.tilemap?.width).toBe(48);
    expect(project.tilemap?.height).toBe(30);
    expect(studioVirtualWorldKind(project)).toBe("campus");
    expect(studioVirtualWorldPresentation(project)).toMatchObject({ camera: "follow", actorScale: 0.65 });
    expect(studioVirtualWorldPresentation(project)?.ambient?.waterfalls.length).toBeGreaterThan(0);
    expect(studioVirtualWorldSetDressing(project).length).toBeGreaterThan(20);
    // 파일에서 불러온 같은 내용의 월드에는 힌트를 주입하지 않는다.
    expect(studioVirtualWorldKind({ ...project })).toBe("custom");
    expect(studioVirtualCampusScene({ ...project })).toBeNull();
  });

  it("벽 시각 구간과 콜라이더가 문 틈(128px)까지 일치한다", () => {
    const colliders = studioWorldCollisionRects(project);
    for (const zone of CAMPUS_ZONES) {
      const walls = studioCampusWallSegments(zone);
      for (const wall of walls) {
        expect(colliders.some((rect) => rect.x === wall.rect.x && rect.y === wall.rect.y
          && rect.width === wall.rect.width && rect.height === wall.rect.height), `${zone.roomId}:${wall.side}`).toBe(true);
      }
      for (const doorway of studioCampusDoorways(zone)) {
        const length = doorway.side === "north" || doorway.side === "south" ? doorway.rect.width : doorway.rect.height;
        expect(length).toBe(CAMPUS_DOOR_WIDTH);
        const center = { x: doorway.rect.x + doorway.rect.width / 2, y: doorway.rect.y + doorway.rect.height / 2 };
        expect(walls.some((wall) => center.x >= wall.rect.x && center.x <= wall.rect.x + wall.rect.width
          && center.y >= wall.rect.y && center.y <= wall.rect.y + wall.rect.height), `${zone.roomId} door`).toBe(false);
        expect(studioWorldCanOccupy(project, center), `${zone.roomId} door walkable`).toBe(true);
      }
    }
  });

  it("벽이 있는 모든 실내 구역에 표지판 1개가 북쪽 벽 위(북쪽 문이 있으면 그 문 위)에 있다", () => {
    const signs = studioCampusSigns();
    expect(signs).toHaveLength(10);
    for (const zone of CAMPUS_ZONES.filter((item) => item.walls.includes("north"))) {
      const zoneSigns = signs.filter((sign) => sign.zoneId === zone.roomId);
      expect(zoneSigns).toHaveLength(1);
      const sign = zoneSigns[0]!;
      const north = studioCampusWallSegments(zone).filter((wall) => wall.side === "north");
      const northDoor = studioCampusDoorways(zone).find((door) => door.side === "north");
      expect(sign.mount).toBe("wall");
      expect(sign.y).toBeGreaterThanOrEqual(zone.tiles.row * 64);
      expect(sign.y).toBeLessThanOrEqual(zone.tiles.row * 64 + 16);
      if (northDoor) expect(sign.x).toBe(northDoor.rect.x + northDoor.rect.width / 2);
      else expect(north.some((wall) => sign.x - sign.width / 2 >= wall.rect.x && sign.x + sign.width / 2 <= wall.rect.x + wall.rect.width)).toBe(true);
      expect(sign.signEn).toMatch(/^[A-Z-]+$/u);
    }
  });

  it("구역 메타는 영문 표지판·장소 카탈로그 이름·아이콘·재질을 준다", () => {
    expect(studioVirtualCampusZoneMeta("skyport")).toMatchObject({ signEn: "LOBBY", labelKo: "스카이 포트", icon: "lobby", tone: "marble" });
    expect(studioVirtualCampusZoneMeta("personal-atelier")?.signEn).toBe("STUDIO");
    expect(studioVirtualCampusZoneMeta("story-lab")?.signEn).toBe("CO-WORK");
    expect(studioVirtualCampusZoneMeta("team-meeting")?.signEn).toBe("TALK");
    expect(studioVirtualCampusZoneMeta("beach")?.signEn).toBe("TERRACE");
    expect(studioVirtualCampusZoneMeta(STUDIO_VIRTUAL_CAMPUS_COMMONS_ID)).toMatchObject({ labelKo: "캠퍼스 산책로", icon: "commons" });
    expect(studioVirtualCampusZoneMeta("garden")).toBeNull();
  });

  it("NPC 주민 8명은 모두 NPC로 표기되고 역할 도구와 연결된다", () => {
    expect(project.npcs).toHaveLength(8);
    for (const npc of project.npcs) {
      expect(studioNpcLabel(npc).ko.startsWith("NPC · ")).toBe(true);
      expect(studioNpcLabel(npc).en.startsWith("NPC · ")).toBe(true);
    }
    const archivist = project.npcs.find((npc) => npc.id === "campus-archivist");
    expect(archivist && studioNpcRole(archivist)).toBe("librarian");
    expect(archivist && studioNpcInteraction(project, archivist)?.action).toBe("assets");
    const guide = project.npcs.find((npc) => npc.id === "campus-guide");
    expect(guide && studioNpcInteraction(project, guide)?.id).toBe("campus-skyport-concierge-desk");
  });
});

describe("캠퍼스 구역 이벤트와 veil", () => {
  it("구역을 넘을 때 onZoneChange가 1회(enter)만 발행된다", () => {
    const tracker = new StudioZoneChangeTracker(project);
    const walk = [
      { x: 448, y: 540 }, { x: 448, y: 560 }, // 로비 안(첫 값만 initial)
      { x: 448, y: 760 }, { x: 460, y: 770 }, // 대로(산책로)
      { x: 1300, y: 1000 }, { x: 1310, y: 1010 }, // 광장
    ];
    const events = walk.map((point) => tracker.next(point)).filter((event) => event !== null);
    expect(events.map((event) => [event.roomId, event.reason])).toEqual([
      ["skyport", "initial"], [STUDIO_VIRTUAL_CAMPUS_COMMONS_ID, "enter"], ["creator-plaza", "enter"],
    ]);
    expect(events[2]).toMatchObject({ labelKo: "창작자 광장", labelEn: "Creator Plaza", privateZone: false });
  });

  it("프로젝트 TALK(프라이빗) 안에서만 veil이 켜지고 공개 구역·산책로에서는 꺼진다", () => {
    const zones = new StudioWorldZoneTracker();
    expect(resolveStudioWorldZonePresence(zones, project, { x: 1300, y: 1000 }).separated).toBe(false);
    expect(resolveStudioWorldZonePresence(zones, project, { x: 448, y: 760 }).separated).toBe(false);
    const talk = resolveStudioWorldZonePresence(zones, project, { x: 448, y: 1000 });
    expect(talk.separated).toBe(true);
    expect(talk.zoneId).toBe("team-meeting-audio");
    expect(resolveStudioWorldZonePresence(new StudioWorldZoneTracker(), personal, { x: 448, y: 1000 }).separated).toBe(false);
    const tracker = new StudioZoneChangeTracker(project);
    tracker.next({ x: 448, y: 760 });
    expect(tracker.next({ x: 448, y: 1000 })).toMatchObject({ roomId: "team-meeting", privateZone: true, reason: "enter" });
  });
});

describe("기본 제공 월드 해석기", () => {
  it("캠퍼스 방은 같은 캠퍼스 manifest identity로, 하위 맵은 장소 월드로 해석한다", () => {
    const cafe = resolveStudioVirtualBuiltinWorld("creator-cafe", true);
    const lobby = resolveStudioVirtualBuiltinWorld("skyport", true);
    expect(cafe.kind).toBe("campus");
    expect(cafe.key).toBe("campus:personal");
    expect(cafe.manifest).toBe(lobby.manifest);
    expect(cafe.spawnId).toBe("creator-cafe");
    expect(lobby.spawnId).toBe("main");
    expect(cafe.positionPlaceId).toBe(STUDIO_VIRTUAL_CAMPUS_POSITION_ID);
    expect(cafe.worldScope).toMatch(/^[0-9a-f]{64}$/u);
    expect(resolveStudioVirtualBuiltinWorld("creator-cafe", false).key).toBe("campus:project");
    const garden = resolveStudioVirtualBuiltinWorld("garden", true);
    expect(garden).toMatchObject({ kind: "place", key: "place:garden", placeId: "garden", positionPlaceId: "garden", spawnId: "main" });
    expect(garden.worldScope).not.toBe(cafe.worldScope);
  });

  it("하위 맵에서 돌아오면 그 게이트 스폰에 도착한다", () => {
    const back = resolveStudioVirtualBuiltinWorld("skyport", true, { arrivalFrom: "garden" });
    expect(back.spawnId).toBe("gate-garden");
    expect(back.manifest.spawns.some((spawn) => spawn.id === "gate-garden")).toBe(true);
    expect(resolveStudioVirtualBuiltinWorld("skyport", true, { arrivalFrom: "production-control" }).spawnId).toBe("main");
    expect(resolveStudioVirtualBuiltinWorld("skyport", false, { arrivalFrom: "production-control" }).spawnId).toBe("gate-production-control");
    expect(resolveStudioVirtualBuiltinWorld("skyport", true, { arrivalFrom: "unknown" }).spawnId).toBe("main");
  });

  it("개인 모드의 프로젝트 전용 장소는 로비로 정규화된다", () => {
    expect(resolveStudioVirtualBuiltinWorld("production-control", true)).toMatchObject({ kind: "campus", placeId: "skyport", spawnId: "main" });
    expect(resolveStudioVirtualBuiltinWorld("production-control", false)).toMatchObject({ kind: "place", placeId: "production-control" });
  });
});
