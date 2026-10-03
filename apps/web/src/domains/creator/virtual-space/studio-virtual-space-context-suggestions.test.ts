import { describe, expect, it } from "vitest";
import {
  acceptStudioSuggestion,
  dismissStudioSuggestion,
  pickStudioSuggestion,
  reduceStudioSuggestion,
  studioSuggestionPlaceKind,
  EMPTY_STUDIO_SUGGESTION_STATE,
  STUDIO_SUGGESTION_COOLDOWN_MS,
  type StudioSuggestionContext,
  type StudioSuggestionPlaceKind,
  type StudioSuggestionState,
} from "./studio-virtual-space-context-suggestions";

const NOW = 1_000_000;
const IDLE: StudioSuggestionContext = { userStatus: null, focusActive: false };

const enter = (state: StudioSuggestionState, place: StudioSuggestionPlaceKind): StudioSuggestionState =>
  reduceStudioSuggestion(state, { kind: "enter-place", place });

describe("studioSuggestionPlaceKind", () => {
  it("룸 id 패턴을 장소 종류로 정규화한다", () => {
    expect(studioSuggestionPlaceKind("team-meeting")).toBe("meeting-room");
    expect(studioSuggestionPlaceKind("zone-meeting")).toBe("meeting-room");
    expect(studioSuggestionPlaceKind("focus-zone")).toBe("focus");
    expect(studioSuggestionPlaceKind("zone-cafe")).toBe("cafe");
    expect(studioSuggestionPlaceKind("library")).toBe("library");
    expect(studioSuggestionPlaceKind("personal-atelier")).toBe("other");
    expect(studioSuggestionPlaceKind(null)).toBe("other");
    expect(studioSuggestionPlaceKind(undefined)).toBe("other");
  });
});

describe("회의 제안", () => {
  it("회의실에 들어가면 회의 시작을 제안한다", () => {
    const state = enter(EMPTY_STUDIO_SUGGESTION_STATE, "meeting-room");
    const suggestion = pickStudioSuggestion(state, IDLE, NOW);
    expect(suggestion?.id).toBe("meeting-start");
    expect(suggestion?.decisions.map((d) => d.kind)).toEqual(["status", "huddle"]);
  });

  it("이미 회의 중이면 제안하지 않는다", () => {
    const state = enter(EMPTY_STUDIO_SUGGESTION_STATE, "meeting-room");
    expect(pickStudioSuggestion(state, { userStatus: "in-meeting", focusActive: false }, NOW)).toBeNull();
  });

  it("회의실을 나가면 제안이 사라진다", () => {
    const state = reduceStudioSuggestion(enter(EMPTY_STUDIO_SUGGESTION_STATE, "meeting-room"), { kind: "exit-place" });
    expect(pickStudioSuggestion(state, IDLE, NOW)).toBeNull();
  });
});

describe("집중 제안", () => {
  it("책상에 앉으면 집중 모드를 제안한다", () => {
    const state = reduceStudioSuggestion(EMPTY_STUDIO_SUGGESTION_STATE, { kind: "seated-at-desk" });
    const suggestion = pickStudioSuggestion(state, IDLE, NOW);
    expect(suggestion?.id).toBe("focus-mode");
    expect(suggestion?.decisions.map((d) => d.kind)).toEqual(["status", "focus"]);
  });

  it("집중 구역에 들어가도 제안한다", () => {
    const state = enter(EMPTY_STUDIO_SUGGESTION_STATE, "focus");
    expect(pickStudioSuggestion(state, IDLE, NOW)?.id).toBe("focus-mode");
  });

  it("이미 집중 중이거나 세션이 돌고 있으면 제안하지 않는다", () => {
    const seated = reduceStudioSuggestion(EMPTY_STUDIO_SUGGESTION_STATE, { kind: "seated-at-desk" });
    expect(pickStudioSuggestion(seated, { userStatus: "focusing", focusActive: false }, NOW)).toBeNull();
    expect(pickStudioSuggestion(seated, { userStatus: null, focusActive: true }, NOW)).toBeNull();
  });

  it("일어서면 집중 제안이 사라진다", () => {
    const seated = reduceStudioSuggestion(EMPTY_STUDIO_SUGGESTION_STATE, { kind: "seated-at-desk" });
    const stood = reduceStudioSuggestion(seated, { kind: "stood-up" });
    expect(pickStudioSuggestion(stood, IDLE, NOW)).toBeNull();
  });
});

describe("휴식·자료 제안", () => {
  it("집중을 마치면 휴식을 제안하고, 수락하면 자격이 소진된다", () => {
    const state = reduceStudioSuggestion(EMPTY_STUDIO_SUGGESTION_STATE, { kind: "focus-completed" });
    expect(pickStudioSuggestion(state, IDLE, NOW)?.id).toBe("take-break");
    const accepted = acceptStudioSuggestion(state, "take-break", NOW);
    expect(accepted.decisions.map((d) => d.kind)).toEqual(["status", "emote"]);
    // 수락 후에는 쿨다운이라 다시 뜨지 않는다
    expect(pickStudioSuggestion(accepted.state, { userStatus: "break", focusActive: false }, NOW)).toBeNull();
  });

  it("다시 앉으면 휴식 제안 자격이 사라진다", () => {
    const done = reduceStudioSuggestion(EMPTY_STUDIO_SUGGESTION_STATE, { kind: "focus-completed" });
    const seated = reduceStudioSuggestion(done, { kind: "seated-at-desk" });
    expect(pickStudioSuggestion(seated, IDLE, NOW)?.id).toBe("focus-mode");
  });

  it("카페에 들어가면 휴식을, 자료실에 들어가면 자료 열기를 제안한다", () => {
    expect(pickStudioSuggestion(enter(EMPTY_STUDIO_SUGGESTION_STATE, "cafe"), IDLE, NOW)?.id).toBe("take-break");
    expect(pickStudioSuggestion(enter(EMPTY_STUDIO_SUGGESTION_STATE, "library"), IDLE, NOW)?.id).toBe("browse-materials");
  });

  it("이미 휴식 중이면 카페에서도 제안하지 않는다", () => {
    const state = enter(EMPTY_STUDIO_SUGGESTION_STATE, "cafe");
    expect(pickStudioSuggestion(state, { userStatus: "break", focusActive: false }, NOW)).toBeNull();
  });
});

describe("우선순위와 쿨다운", () => {
  it("회의실에서는 휴식 자격보다 회의 제안이 먼저다", () => {
    const done = reduceStudioSuggestion(EMPTY_STUDIO_SUGGESTION_STATE, { kind: "focus-completed" });
    const state = enter(done, "meeting-room");
    expect(pickStudioSuggestion(state, IDLE, NOW)?.id).toBe("meeting-start");
  });

  it("무시하면 쿨다운 동안 다시 뜨지 않고, 지나면 다시 뜬다", () => {
    const state = enter(EMPTY_STUDIO_SUGGESTION_STATE, "meeting-room");
    const dismissed = dismissStudioSuggestion(state, "meeting-start", NOW);
    expect(pickStudioSuggestion(dismissed, IDLE, NOW + 1000)).toBeNull();
    expect(pickStudioSuggestion(dismissed, IDLE, NOW + STUDIO_SUGGESTION_COOLDOWN_MS - 1)).toBeNull();
    expect(pickStudioSuggestion(dismissed, IDLE, NOW + STUDIO_SUGGESTION_COOLDOWN_MS)?.id).toBe("meeting-start");
  });

  it("수락해도 쿨다운이 걸려 같은 장소에서 반복 제안하지 않는다", () => {
    const state = enter(EMPTY_STUDIO_SUGGESTION_STATE, "library");
    const accepted = acceptStudioSuggestion(state, "browse-materials", NOW);
    expect(accepted.decisions).toEqual([{ kind: "route", href: "/research/material-assets" }]);
    expect(pickStudioSuggestion(accepted.state, IDLE, NOW + 1000)).toBeNull();
  });

  it("신호가 값을 바꾸지 않으면 같은 상태를 돌려준다", () => {
    const state = enter(EMPTY_STUDIO_SUGGESTION_STATE, "cafe");
    expect(reduceStudioSuggestion(state, { kind: "enter-place", place: "cafe" })).toBe(state);
    expect(reduceStudioSuggestion(EMPTY_STUDIO_SUGGESTION_STATE, { kind: "exit-place" })).toBe(EMPTY_STUDIO_SUGGESTION_STATE);
  });
});
