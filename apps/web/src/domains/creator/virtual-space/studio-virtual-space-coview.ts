/**
 * 가상 스튜디오 "함께 보기" 세션 로직.
 *
 * "함께 보기 시작" → 리더의 화면/포커스가 팔로워에게 공유되고,
 * 참가·탈퇴·리더 변경을 순수 리듀서로 관리한다. 실제 포커스 동기화(카메라 이동,
 * 대형 스크린 하이라이트)는 호출 측에서 `focus` 값을 구독해 수행한다.
 *
 * 순수 로직 모듈: 네트워크·RTC 전송은 포함하지 않는다.
 */

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";

/** 리더가 공유하는 포커스: 대형 스크린 또는 월드 좌표. */
export type StudioCoviewFocus =
  | { readonly kind: "screen"; readonly screenId: string }
  | { readonly kind: "point"; readonly x: number; readonly y: number };

export interface StudioCoviewMember {
  readonly sessionId: string;
  readonly displayName: string;
  readonly joinedAt: number;
}

export type StudioCoviewStatus = "idle" | "active";

export interface StudioCoviewState {
  readonly status: StudioCoviewStatus;
  /** 함께 보기 세션 id. idle이면 null. */
  readonly sessionId: string | null;
  readonly leaderSessionId: string | null;
  readonly leaderDisplayName: string | null;
  /** 리더를 포함한 전체 참가자 (joinedAt 오름차순). */
  readonly members: readonly StudioCoviewMember[];
  /** 리더가 마지막으로 공유한 포커스. */
  readonly focus: StudioCoviewFocus | null;
  readonly startedAt: number | null;
}

export const IDLE_STUDIO_COVIEW_STATE: StudioCoviewState = Object.freeze({
  status: "idle",
  sessionId: null,
  leaderSessionId: null,
  leaderDisplayName: null,
  members: Object.freeze([]),
  focus: null,
  startedAt: null,
});

export type StudioCoviewEvent =
  | {
    readonly type: "start";
    readonly sessionId: string;
    readonly leaderSessionId: string;
    readonly leaderDisplayName: string;
    readonly startedAt: number;
  }
  | { readonly type: "join"; readonly sessionId: string; readonly displayName: string; readonly joinedAt: number }
  | { readonly type: "leave"; readonly sessionId: string }
  | { readonly type: "set-focus"; readonly bySessionId: string; readonly focus: StudioCoviewFocus }
  | { readonly type: "change-leader"; readonly newLeaderSessionId: string; readonly newLeaderDisplayName: string }
  | { readonly type: "end" };

const ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,127}$/iu;

function cleanId(value: string): string | null {
  return typeof value === "string" && ID_PATTERN.test(value) ? value : null;
}

function cleanDisplayName(value: string): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 64);
  return trimmed.length > 0 ? trimmed : null;
}

function cleanFocus(focus: StudioCoviewFocus): StudioCoviewFocus | null {
  if (!focus || typeof focus !== "object") return null;
  if (focus.kind === "screen") {
    const screenId = cleanId(focus.screenId);
    return screenId ? Object.freeze({ kind: "screen", screenId }) : null;
  }
  if (focus.kind === "point") {
    if (!Number.isFinite(focus.x) || !Number.isFinite(focus.y)) return null;
    if (Math.abs(focus.x) > 100_000 || Math.abs(focus.y) > 100_000) return null;
    return Object.freeze({ kind: "point", x: focus.x, y: focus.y });
  }
  return null;
}

function withMembers(
  state: StudioCoviewState,
  members: readonly StudioCoviewMember[],
): StudioCoviewState {
  const sorted = [...members].sort((left, right) => left.joinedAt - right.joinedAt);
  return Object.freeze({ ...state, members: Object.freeze(sorted) });
}

/**
 * 순수 리듀서. 허용되지 않은 전이는 현재 상태를 그대로 반환한다.
 * - `start`: idle에서만 시작. 리더가 첫 참가자가 된다.
 * - `join`: active에서만 참가. 중복 참가는 무시.
 * - `leave`: active에서만 탈퇴. 리더가 나가면 가장 먼저 참가한 멤버가 승격되고,
 *   아무도 남지 않으면 세션이 종료된다.
 * - `set-focus`: 리더만 포커스를 공유할 수 있다.
 * - `change-leader`: 참가자 중에서만 리더를 변경할 수 있다.
 * - `end`: 세션을 종료하고 idle로 되돌린다.
 */
export function reduceStudioCoview(
  state: StudioCoviewState,
  event: StudioCoviewEvent,
): StudioCoviewState {
  if (event.type === "start") {
    if (state.status !== "idle") return state;
    const sessionId = cleanId(event.sessionId);
    const leaderSessionId = cleanId(event.leaderSessionId);
    const leaderDisplayName = cleanDisplayName(event.leaderDisplayName);
    if (!sessionId || !leaderSessionId || !leaderDisplayName || !Number.isFinite(event.startedAt)) {
      return state;
    }
    return Object.freeze({
      status: "active",
      sessionId,
      leaderSessionId,
      leaderDisplayName,
      members: Object.freeze([
        Object.freeze({ sessionId: leaderSessionId, displayName: leaderDisplayName, joinedAt: event.startedAt }),
      ]),
      focus: null,
      startedAt: event.startedAt,
    });
  }

  if (state.status !== "active") return state;

  if (event.type === "join") {
    const sessionId = cleanId(event.sessionId);
    const displayName = cleanDisplayName(event.displayName);
    if (!sessionId || !displayName || !Number.isFinite(event.joinedAt)) return state;
    if (state.members.some((member) => member.sessionId === sessionId)) return state;
    return withMembers(
      state,
      [...state.members, { sessionId, displayName, joinedAt: event.joinedAt }],
    );
  }

  if (event.type === "leave") {
    const sessionId = cleanId(event.sessionId);
    if (!sessionId) return state;
    if (!state.members.some((member) => member.sessionId === sessionId)) return state;
    const remaining = state.members.filter((member) => member.sessionId !== sessionId);
    if (remaining.length === 0) return IDLE_STUDIO_COVIEW_STATE;
    if (sessionId === state.leaderSessionId) {
      const nextLeader = [...remaining].sort((left, right) => left.joinedAt - right.joinedAt)[0];
      if (!nextLeader) return IDLE_STUDIO_COVIEW_STATE;
      return Object.freeze({
        ...withMembers(state, remaining),
        leaderSessionId: nextLeader.sessionId,
        leaderDisplayName: nextLeader.displayName,
      });
    }
    return withMembers(state, remaining);
  }

  if (event.type === "set-focus") {
    if (event.bySessionId !== state.leaderSessionId) return state;
    const focus = cleanFocus(event.focus);
    if (!focus) return state;
    return Object.freeze({ ...state, focus });
  }

  if (event.type === "change-leader") {
    const newLeaderSessionId = cleanId(event.newLeaderSessionId);
    const newLeaderDisplayName = cleanDisplayName(event.newLeaderDisplayName);
    if (!newLeaderSessionId || !newLeaderDisplayName) return state;
    if (!state.members.some((member) => member.sessionId === newLeaderSessionId)) return state;
    if (newLeaderSessionId === state.leaderSessionId) return state;
    return Object.freeze({
      ...state,
      leaderSessionId: newLeaderSessionId,
      leaderDisplayName: newLeaderDisplayName,
    });
  }

  if (event.type === "end") {
    return IDLE_STUDIO_COVIEW_STATE;
  }

  return state;
}

/** 해당 세션이 함께 보기의 리더인지 확인한다. */
export function isStudioCoviewLeader(state: StudioCoviewState, sessionId: string): boolean {
  return state.status === "active" && state.leaderSessionId === sessionId;
}

/** 함께 보기 참가자 수 (리더 포함). */
export function studioCoviewMemberCount(state: StudioCoviewState): number {
  return state.status === "active" ? state.members.length : 0;
}

/** 포커스를 사람이 읽기 좋은 좌표 문자열로 바꾼다 (디버그·로그용). */
export function describeStudioCoviewFocus(focus: StudioCoviewFocus | null): string {
  if (!focus) return "none";
  if (focus.kind === "screen") return `screen:${focus.screenId}`;
  const point: StudioVirtualSpacePoint = { x: focus.x, y: focus.y };
  return `point:${Math.round(point.x)},${Math.round(point.y)}`;
}
