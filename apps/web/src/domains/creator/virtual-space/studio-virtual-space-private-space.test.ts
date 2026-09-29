import { describe, expect, it } from "vitest";

import type { StudioWorldAcousticZoneDefinition } from "./studio-virtual-space-acoustics";
import {
  addPrivateSpaceMember,
  diffPrivateSpaceMembership,
  privateSpaceAudioGain,
  privateSpaceNoticeText,
  removePrivateSpaceMember,
  resolvePrivateSpace,
} from "./studio-virtual-space-private-space";

const PRIVATE_ZONE: StudioWorldAcousticZoneDefinition = Object.freeze({
  id: "conti-table",
  roomId: "review",
  x: 700, y: 320, width: 200, height: 160,
  policy: "private",
});

const PUBLIC_ZONE: StudioWorldAcousticZoneDefinition = Object.freeze({
  id: "open-lounge",
  roomId: "lounge",
  x: 370, y: 590, width: 240, height: 180,
  policy: "public",
});

describe("resolvePrivateSpace", () => {
  it("private 구역 안의 좌표를 찾는다", () => {
    expect(resolvePrivateSpace([PRIVATE_ZONE], { x: 750, y: 350 })?.id).toBe("conti-table");
  });

  it("public 구역은 무시한다", () => {
    expect(resolvePrivateSpace([PUBLIC_ZONE], { x: 400, y: 600 })).toBeNull();
  });

  it("구역 밖은 null", () => {
    expect(resolvePrivateSpace([PRIVATE_ZONE], { x: 10, y: 10 })).toBeNull();
  });
});

describe("diffPrivateSpaceMembership", () => {
  it("입장 시 entered 이벤트", () => {
    const events = diffPrivateSpaceMembership(null, PRIVATE_ZONE, "me", 1000);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "entered", zoneId: "conti-table", sessionId: "me" });
  });

  it("퇴장 시 exited 이벤트", () => {
    const events = diffPrivateSpaceMembership(PRIVATE_ZONE, null, "me", 1000);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "exited", zoneId: "conti-table" });
  });

  it("구역 이동 시 exited + entered", () => {
    const other: StudioWorldAcousticZoneDefinition = { ...PRIVATE_ZONE, id: "booth" };
    const events = diffPrivateSpaceMembership(PRIVATE_ZONE, other, "me", 1000);
    expect(events.map((event) => event.kind)).toEqual(["exited", "entered"]);
  });

  it("같은 구역에 머무르면 이벤트 없음", () => {
    expect(diffPrivateSpaceMembership(PRIVATE_ZONE, PRIVATE_ZONE, "me", 1000)).toHaveLength(0);
  });
});

describe("privateSpaceAudioGain", () => {
  it("같은 프라이빗 스페이스면 거리 무관 풀 볼륨", () => {
    expect(privateSpaceAudioGain(true)).toBe(1);
    expect(privateSpaceAudioGain(false)).toBe(0);
  });
});

describe("privateSpaceNoticeText", () => {
  it("입장/퇴장 문구를 한·영으로 제공한다", () => {
    const entered = privateSpaceNoticeText(
      { kind: "entered", zoneId: "conti-table", sessionId: "me", at: 0 },
      "콘티 테이블", "Conti Table",
    );
    expect(entered.ko).toContain("콘티 테이블");
    expect(entered.en).toContain("Conti Table");

    const exited = privateSpaceNoticeText(
      { kind: "exited", zoneId: "conti-table", sessionId: "me", at: 0 },
      "콘티 테이블", "Conti Table",
    );
    expect(exited.ko).toContain("나왔어요");
  });
});

describe("addPrivateSpaceMember / removePrivateSpaceMember", () => {
  it("멤버를 추가하고 중복을 무시한다", () => {
    const first = addPrivateSpaceMember(null, "conti-table", "a", 100);
    expect(first.members).toHaveLength(1);
    const dup = addPrivateSpaceMember(first, "conti-table", "a", 200);
    expect(dup.members).toHaveLength(1);
    const second = addPrivateSpaceMember(dup, "conti-table", "b", 300);
    expect(second.members).toHaveLength(2);
  });

  it("다른 구역으로 스냅샷이 바뀌면 멤버가 리셋된다", () => {
    const first = addPrivateSpaceMember(null, "conti-table", "a", 100);
    const moved = addPrivateSpaceMember(first, "booth", "a", 200);
    expect(moved.zoneId).toBe("booth");
    expect(moved.members).toHaveLength(1);
  });

  it("마지막 멤버가 나가면 스냅샷이 null이 된다", () => {
    const snapshot = addPrivateSpaceMember(null, "conti-table", "a", 100);
    expect(removePrivateSpaceMember(snapshot, "a")).toBeNull();
  });

  it("없는 멤버 제거는 스냅샷을 그대로 둔다", () => {
    const snapshot = addPrivateSpaceMember(null, "conti-table", "a", 100);
    expect(removePrivateSpaceMember(snapshot, "ghost")).toBe(snapshot);
  });
});
