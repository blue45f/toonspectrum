import { describe, expect, it } from "vitest";
import {
  applauseWaveTargets,
  buildMeetingRoster,
  meetingBoardShortcut,
  meetingRosterSummaryText,
  meetingStatusForEvent,
  STUDIO_APPLAUSE_WAVE_RADIUS,
} from "./studio-virtual-space-meeting-flow";

const SESSION = {
  objectId: "room-a",
  members: ["self-1", "peer-2", "peer-3"],
  startedAt: 1000,
};

const MEMBERS = [
  { sessionId: "self-1", displayName: "나" },
  { sessionId: "peer-2", displayName: "철수" },
  { sessionId: "peer-3", displayName: "영희" },
];

describe("buildMeetingRoster", () => {
  it("본인이 맨 앞에 오고 이름순으로 정렬한다", () => {
    const roster = buildMeetingRoster({
      session: SESSION,
      members: MEMBERS,
      speakerLevels: [],
      selfSessionId: "self-1",
    });
    // 한국어 정렬: ㄴ(나) < ㅇ(영희) < ㅊ(철수)
    expect(roster.map((entry) => entry.sessionId)).toEqual(["self-1", "peer-3", "peer-2"]);
    expect(roster[0]!.isSelf).toBe(true);
    expect(roster[0]!.displayName).toBe("나");
  });

  it("발화 임계값을 넘으면 speaking이 true다", () => {
    const roster = buildMeetingRoster({
      session: SESSION,
      members: MEMBERS,
      speakerLevels: [{ sessionId: "peer-2", level: 0.5, at: 2000 }],
      selfSessionId: "self-1",
    });
    expect(roster.find((entry) => entry.sessionId === "peer-2")!.speaking).toBe(true);
    expect(roster.find((entry) => entry.sessionId === "peer-3")!.speaking).toBe(false);
  });

  it("이름을 모르면 sessionId 앞부분을 표시한다", () => {
    const roster = buildMeetingRoster({
      session: { ...SESSION, members: ["mystery-123456"] },
      members: [],
      speakerLevels: [],
      selfSessionId: "self-1",
    });
    expect(roster[0]!.displayName).toBe("mystery-");
  });

  it("세션에 없는 멤버는 로스터에 포함하지 않는다", () => {
    const roster = buildMeetingRoster({
      session: { ...SESSION, members: ["self-1"] },
      members: MEMBERS,
      speakerLevels: [],
      selfSessionId: "self-1",
    });
    expect(roster).toHaveLength(1);
  });
});

describe("meetingStatusForEvent", () => {
  it("입장하면 회의 중, 퇴장하면 복구 상태를 제안한다", () => {
    expect(meetingStatusForEvent({ kind: "joined", objectId: "r", sessionId: "s", at: 1 })).toBe("in-meeting");
    expect(meetingStatusForEvent({ kind: "meeting-started", objectId: "r", at: 1 })).toBe("in-meeting");
    expect(meetingStatusForEvent({ kind: "left", objectId: "r", sessionId: "s", at: 1 })).toBe("available");
    expect(meetingStatusForEvent({ kind: "meeting-ended", objectId: "r", at: 1 })).toBe("available");
  });
});

describe("meetingBoardShortcut", () => {
  it("회의 중 X키를 누르면 보드 단축키를 반환한다", () => {
    const shortcut = meetingBoardShortcut({ key: "x", session: SESSION, nearWhiteboard: false });
    expect(shortcut).toEqual({ kind: "open-meeting-board", objectId: "room-a" });
  });

  it("화이트보드 근처에서도 X키로 보드를 연다", () => {
    const shortcut = meetingBoardShortcut({ key: "X", session: null, nearWhiteboard: true });
    expect(shortcut).toEqual({ kind: "open-meeting-board", objectId: null });
  });

  it("회의도 화이트보드도 아니면 null이다", () => {
    expect(meetingBoardShortcut({ key: "x", session: null, nearWhiteboard: false })).toBeNull();
  });

  it("X가 아닌 키는 무시한다", () => {
    expect(meetingBoardShortcut({ key: "z", session: SESSION, nearWhiteboard: false })).toBeNull();
  });
});

describe("meetingRosterSummaryText", () => {
  it("인원수별 문구를 반환한다", () => {
    expect(meetingRosterSummaryText(0).ko).toContain("비어");
    expect(meetingRosterSummaryText(1).ko).toContain("혼자");
    expect(meetingRosterSummaryText(3).ko).toBe("3명이 회의 중이에요.");
  });
});

describe("applauseWaveTargets", () => {
  const points = [
    { sessionId: "self-1", point: { x: 0, y: 0 } },
    { sessionId: "near-2", point: { x: 100, y: 0 } },
    { sessionId: "far-3", point: { x: STUDIO_APPLAUSE_WAVE_RADIUS + 100, y: 0 } },
  ];

  it("반경 안의 참여자에게만 전파된다", () => {
    const { targets } = applauseWaveTargets({
      fromSessionId: "self-1",
      fromPoint: { x: 0, y: 0 },
      members: points,
    });
    expect(targets).toEqual(["near-2"]);
  });

  it("발신자 본인은 제외한다", () => {
    const { targets } = applauseWaveTargets({
      fromSessionId: "self-1",
      fromPoint: { x: 0, y: 0 },
      members: points,
    });
    expect(targets).not.toContain("self-1");
  });

  it("반경을 지정할 수 있다", () => {
    const { targets } = applauseWaveTargets({
      fromSessionId: "self-1",
      fromPoint: { x: 0, y: 0 },
      members: points,
      radius: STUDIO_APPLAUSE_WAVE_RADIUS + 200,
    });
    expect(targets).toEqual(["near-2", "far-3"]);
  });
});
