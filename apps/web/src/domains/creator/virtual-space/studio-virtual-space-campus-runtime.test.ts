import { describe, expect, it } from "vitest";

import { CAMPUS_OBJECTS, CAMPUS_ZONES } from "./studio-virtual-space-campus-blueprint";
import { studioCampusObjectDepth, studioCampusSignDepth, studioCampusWallDepth } from "./studio-virtual-space-campus-runtime";
import { campusHex, campusShade, campusStyleColor } from "./studio-virtual-space-campus-textures";
import { studioCampusSigns, studioCampusWallSegments } from "./studio-virtual-space-campus-world";

/** 배우의 깊이 규칙(Canvas): 발밑 y + 1001. */
const actorDepth = (y: number) => Math.round(y) + 1_001;

describe("캠퍼스 런타임 깊이 규칙", () => {
  const lobby = CAMPUS_ZONES.find((zone) => zone.roomId === "skyport")!;
  const walls = studioCampusWallSegments(lobby);

  it("남쪽 낮은 벽은 방 안 사람보다 앞, 대로 위 사람보다 뒤에 그린다", () => {
    const south = walls.find((wall) => wall.side === "south")!;
    const depth = studioCampusWallDepth(south);
    expect(depth).toBeGreaterThan(actorDepth(south.rect.y - 1));
    expect(depth).toBeLessThan(actorDepth(south.rect.y + south.rect.height + 9));
  });

  it("북쪽 벽은 방 안 사람보다 뒤, 옆벽 윗면은 바닥 높이 띠라서 모든 배우 뒤다", () => {
    const north = walls.find((wall) => wall.side === "north")!;
    expect(studioCampusWallDepth(north)).toBeLessThan(actorDepth(north.rect.y + north.rect.height + 9));
    const west = walls.find((wall) => wall.side === "west")!;
    expect(studioCampusWallDepth(west)).toBeLessThan(actorDepth(64));
  });

  it("벽걸이 무대 스크린은 북쪽 벽 바로 앞, 무대보다 뒤다", () => {
    const screen = CAMPUS_OBJECTS.find((item) => item.id === "event-screen")!;
    const stage = CAMPUS_OBJECTS.find((item) => item.id === "event-stage")!;
    const event = CAMPUS_ZONES.find((zone) => zone.roomId === "event-stage")!;
    const eventNorth = studioCampusWallSegments(event).find((wall) => wall.side === "north")!;
    expect(studioCampusObjectDepth(screen)).toBe(studioCampusWallDepth(eventNorth) + 1);
    expect(studioCampusObjectDepth(stage)).toBeGreaterThan(studioCampusObjectDepth(screen));
  });

  it("벽 위 간판은 벽보다 앞이고 문을 지나는 사람 머리 위에 보인다", () => {
    const talk = studioCampusSigns().find((sign) => sign.zoneId === "team-meeting")!;
    const zone = CAMPUS_ZONES.find((item) => item.roomId === "team-meeting")!;
    const north = studioCampusWallSegments(zone).find((wall) => wall.side === "north")!;
    expect(studioCampusSignDepth(talk)).toBeGreaterThan(studioCampusWallDepth(north));
    // 문 틈(북쪽 벽 띠 안)에 선 사람보다 앞이다.
    expect(studioCampusSignDepth(talk)).toBeGreaterThan(actorDepth(north.rect.y + north.rect.height - 1));
  });
});

describe("캠퍼스 텍스처 색 도우미", () => {
  it("스타일별 색 변환은 흑백 원고를 무채색으로, 네온을 어둡게 만든다", () => {
    const gray = campusStyleColor(0x8f6f58, "ink");
    expect((gray >> 16) & 255).toBe((gray >> 8) & 255);
    expect((gray >> 8) & 255).toBe(gray & 255);
    expect(campusStyleColor(0x8f6f58, "neon")).toBeLessThan(0x8f6f58);
    expect(campusStyleColor(0x8f6f58, "sky-island")).toBe(0x8f6f58);
    expect(campusShade(0x808080, 1)).toBe((255 << 16) | (255 << 8) | 255);
    expect(campusHex(0x0a0b0c)).toBe("#0a0b0c");
  });
});
