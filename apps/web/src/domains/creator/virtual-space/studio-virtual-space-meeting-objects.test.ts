import { describe, expect, it } from "vitest";
import {
  diffMeetingMembership,
  joinMeetingSession,
  leaveMeetingSession,
  meetingNoticeText,
  resolveMeetingObject,
  type StudioMeetingObject,
} from "./studio-virtual-space-meeting-objects";

const room = (
  id: string,
  x: number,
  y: number,
  radius = 60,
  capacity = 4,
): StudioMeetingObject => ({
  id,
  kind: "meeting-room",
  position: { x, y },
  radius,
  capacity,
  labelKo: id,
  labelEn: id,
});

describe("resolveMeetingObject", () => {
  it("반경 안에 없으면 null", () => {
    expect(resolveMeetingObject([room("r1", 500, 500)], { x: 0, y: 0 })).toBeNull();
  });

  it("입장 판정: 반경 안이면 오브젝트 반환", () => {
    const found = resolveMeetingObject([room("r1", 30, 0)], { x: 0, y: 0 });
    expect(found?.id).toBe("r1");
  });

  it("겹치면 가장 가까운 하나만", () => {
    const found = resolveMeetingObject(
      [room("far", 50, 0), room("near", 20, 0)],
      { x: 0, y: 0 },
    );
    expect(found?.id).toBe("near");
  });
});

describe("diffMeetingMembership", () => {
  it("null → 방: joined", () => {
    const events = diffMeetingMembership(null, room("r1", 0, 0), "me", 0, 100);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "joined", objectId: "r1", sessionId: "me" });
  });

  it("방 → null: left (+ 마지막이면 meeting-ended)", () => {
    const events = diffMeetingMembership(room("r1", 0, 0), null, "me", 1, 100);
    expect(events.map((e) => e.kind)).toEqual(["left", "meeting-ended"]);
  });

  it("방 → null: 다른 멤버가 있으면 ended 없음", () => {
    const events = diffMeetingMembership(room("r1", 0, 0), null, "me", 3, 100);
    expect(events.map((e) => e.kind)).toEqual(["left"]);
  });

  it("같은 방이면 이벤트 없음", () => {
    const r = room("r1", 0, 0);
    expect(diffMeetingMembership(r, r, "me", 2, 100)).toHaveLength(0);
  });
});

describe("joinMeetingSession / leaveMeetingSession", () => {
  it("첫 참여 시 세션 생성 + started=true", () => {
    const result = joinMeetingSession(null, room("r1", 0, 0), "me", 100);
    expect(result?.started).toBe(true);
    expect(result?.session.members).toEqual(["me"]);
  });

  it("정원 초과 시 null", () => {
    const r = room("r1", 0, 0, 60, 1);
    const first = joinMeetingSession(null, r, "a", 100);
    expect(joinMeetingSession(first!.session, r, "b", 101)).toBeNull();
  });

  it("중복 참여는 무시", () => {
    const first = joinMeetingSession(null, room("r1", 0, 0), "me", 100);
    const second = joinMeetingSession(first!.session, room("r1", 0, 0), "me", 101);
    expect(second?.session.members).toEqual(["me"]);
    expect(second?.started).toBe(false);
  });

  it("마지막 멤버가 나가면 ended=true", () => {
    const joined = joinMeetingSession(null, room("r1", 0, 0), "me", 100);
    const { session, ended } = leaveMeetingSession(joined!.session, "me");
    expect(session).toBeNull();
    expect(ended).toBe(true);
  });

  it("멤버가 남아있으면 ended=false", () => {
    const s1 = joinMeetingSession(null, room("r1", 0, 0), "a", 100);
    const s2 = joinMeetingSession(s1!.session, room("r1", 0, 0), "b", 101);
    const { session, ended } = leaveMeetingSession(s2!.session, "a");
    expect(session?.members).toEqual(["b"]);
    expect(ended).toBe(false);
  });
});

describe("meetingNoticeText", () => {
  it("joined 문구", () => {
    const text = meetingNoticeText(
      { kind: "joined", objectId: "r1", sessionId: "me", at: 100 },
      "팀 회의실",
      "Team Room",
    );
    expect(text?.ko).toContain("자동 참여");
    expect(text?.en).toContain("automatically joined");
  });
});
