import { describe, expect, it } from "vitest";

import {
  describeStudioCoviewFocus,
  IDLE_STUDIO_COVIEW_STATE,
  isStudioCoviewLeader,
  reduceStudioCoview,
  studioCoviewMemberCount,
  type StudioCoviewState,
} from "./studio-virtual-space-coview";

function activeState(): StudioCoviewState {
  return reduceStudioCoview(IDLE_STUDIO_COVIEW_STATE, {
    type: "start",
    sessionId: "coview:1",
    leaderSessionId: "peer:leader",
    leaderDisplayName: "리더",
    startedAt: 1_000,
  });
}

describe("reduceStudioCoview", () => {
  it("idle에서 함께 보기를 시작하면 리더가 첫 참가자가 된다", () => {
    const state = activeState();
    expect(state.status).toBe("active");
    expect(state.leaderSessionId).toBe("peer:leader");
    expect(state.members).toHaveLength(1);
    expect(studioCoviewMemberCount(state)).toBe(1);
    expect(isStudioCoviewLeader(state, "peer:leader")).toBe(true);
  });

  it("잘못된 id로는 시작하지 않는다", () => {
    const state = reduceStudioCoview(IDLE_STUDIO_COVIEW_STATE, {
      type: "start",
      sessionId: "coview:1",
      leaderSessionId: "!!!",
      leaderDisplayName: "리더",
      startedAt: 1_000,
    });
    expect(state).toBe(IDLE_STUDIO_COVIEW_STATE);
  });

  it("이미 active면 start를 무시한다", () => {
    const state = activeState();
    expect(reduceStudioCoview(state, {
      type: "start",
      sessionId: "coview:2",
      leaderSessionId: "peer:other",
      leaderDisplayName: "다른이",
      startedAt: 2_000,
    })).toBe(state);
  });

  it("참가자를 추가하고 중복 참가는 무시한다", () => {
    let state = activeState();
    state = reduceStudioCoview(state, { type: "join", sessionId: "peer:kim", displayName: "김 작가", joinedAt: 1_100 });
    expect(studioCoviewMemberCount(state)).toBe(2);
    const again = reduceStudioCoview(state, { type: "join", sessionId: "peer:kim", displayName: "김 작가", joinedAt: 1_200 });
    expect(again).toBe(state);
  });

  it("리더가 나가면 가장 먼저 참가한 멤버가 리더가 된다", () => {
    let state = activeState();
    state = reduceStudioCoview(state, { type: "join", sessionId: "peer:kim", displayName: "김", joinedAt: 1_100 });
    state = reduceStudioCoview(state, { type: "join", sessionId: "peer:mia", displayName: "미아", joinedAt: 1_200 });
    state = reduceStudioCoview(state, { type: "leave", sessionId: "peer:leader" });
    expect(state.leaderSessionId).toBe("peer:kim");
    expect(state.leaderDisplayName).toBe("김");
    expect(studioCoviewMemberCount(state)).toBe(2);
  });

  it("마지막 참가자가 나가면 세션이 종료된다", () => {
    const state = reduceStudioCoview(activeState(), { type: "leave", sessionId: "peer:leader" });
    expect(state).toBe(IDLE_STUDIO_COVIEW_STATE);
  });

  it("리더만 포커스를 공유할 수 있다", () => {
    let state = activeState();
    state = reduceStudioCoview(state, { type: "join", sessionId: "peer:kim", displayName: "김", joinedAt: 1_100 });
    const followerAttempt = reduceStudioCoview(state, {
      type: "set-focus", bySessionId: "peer:kim", focus: { kind: "point", x: 10, y: 20 },
    });
    expect(followerAttempt).toBe(state);
    const leaderSet = reduceStudioCoview(state, {
      type: "set-focus", bySessionId: "peer:leader", focus: { kind: "screen", screenId: "screen:hall" },
    });
    expect(leaderSet.focus).toEqual({ kind: "screen", screenId: "screen:hall" });
    const pointSet = reduceStudioCoview(leaderSet, {
      type: "set-focus", bySessionId: "peer:leader", focus: { kind: "point", x: 10.4, y: 20.6 },
    });
    expect(pointSet.focus).toEqual({ kind: "point", x: 10.4, y: 20.6 });
  });

  it("잘못된 포커스는 무시한다", () => {
    const state = activeState();
    expect(reduceStudioCoview(state, {
      type: "set-focus", bySessionId: "peer:leader", focus: { kind: "screen", screenId: "!!!" },
    })).toBe(state);
  });

  it("참가자 중에서만 리더를 변경할 수 있다", () => {
    let state = activeState();
    state = reduceStudioCoview(state, { type: "join", sessionId: "peer:kim", displayName: "김", joinedAt: 1_100 });
    const changed = reduceStudioCoview(state, {
      type: "change-leader", newLeaderSessionId: "peer:kim", newLeaderDisplayName: "김",
    });
    expect(changed.leaderSessionId).toBe("peer:kim");
    expect(isStudioCoviewLeader(changed, "peer:kim")).toBe(true);
    expect(reduceStudioCoview(state, {
      type: "change-leader", newLeaderSessionId: "peer:ghost", newLeaderDisplayName: "유령",
    })).toBe(state);
  });

  it("end로 세션을 종료한다", () => {
    const state = reduceStudioCoview(activeState(), { type: "end" });
    expect(state).toBe(IDLE_STUDIO_COVIEW_STATE);
  });

  it("idle 상태에서는 join/leave/set-focus를 무시한다", () => {
    expect(reduceStudioCoview(IDLE_STUDIO_COVIEW_STATE, {
      type: "join", sessionId: "peer:kim", displayName: "김", joinedAt: 1_100,
    })).toBe(IDLE_STUDIO_COVIEW_STATE);
    expect(reduceStudioCoview(IDLE_STUDIO_COVIEW_STATE, { type: "end" })).toBe(IDLE_STUDIO_COVIEW_STATE);
  });
});

describe("describeStudioCoviewFocus", () => {
  it("포커스를 읽기 좋은 문자열로 바꾼다", () => {
    expect(describeStudioCoviewFocus(null)).toBe("none");
    expect(describeStudioCoviewFocus({ kind: "screen", screenId: "screen:hall" })).toBe("screen:screen:hall");
    expect(describeStudioCoviewFocus({ kind: "point", x: 10.6, y: 20.2 })).toBe("point:11,20");
  });
});
