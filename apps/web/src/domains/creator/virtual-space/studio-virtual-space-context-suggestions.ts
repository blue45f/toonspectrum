import type { StudioUserStatus } from "./studio-virtual-space-user-status";
import { STUDIO_MATERIALS_HREF, type StudioWorkDecision } from "./studio-virtual-space-work-bridge";

/**
 * 공간 맥락 제안 엔진 (Track J)
 *
 * 걷다가 자연스럽게 업무로 이어지도록, 지금 있는 장소·자세·상태를 보고
 * "다음 행동"을 한 번에 하나만 제안하는 순수 상태 머신이다.
 *
 * 원칙:
 * - 제안은 실행이 아니다. 수락해야만 결정(상태 전이·패널·이동)이 나간다.
 * - 무시하면 제안별 쿨다운(5분) 동안 같은 제안을 다시 띄우지 않는다.
 * - 이미 그 상태면 제안하지 않는다 (회의실에 있어도 이미 "회의 중"이면 조용하다).
 * - 신호는 기존 근접 트리거/구역 진입 이벤트에서 온다 (enter/exit/seated/focus 완료).
 *
 * 우선순위: 회의 시작 > 집중 모드 > 휴식 > 자료 열기.
 */

/** 제안이 바라보는 장소 종류. 룸 id 패턴에서 정규화한다. */
export type StudioSuggestionPlaceKind = "meeting-room" | "focus" | "cafe" | "library" | "other";

export type StudioSuggestionId = "meeting-start" | "focus-mode" | "take-break" | "browse-materials";

/** 제안 무시·수락 후 같은 제안을 다시 띄우지 않는 시간 (ms). */
export const STUDIO_SUGGESTION_COOLDOWN_MS = 5 * 60_000;

const decision = <T extends StudioWorkDecision>(value: T): T => Object.freeze(value);

export interface StudioContextSuggestion {
  readonly id: StudioSuggestionId;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly bodyKo: string;
  readonly bodyEn: string;
  readonly acceptKo: string;
  readonly acceptEn: string;
  /** 수락 시 페이지가 순서대로 실행할 업무 결정. */
  readonly decisions: readonly StudioWorkDecision[];
}

/** 제안 카탈로그. 문구와 수락 시 동선의 정본. */
export const STUDIO_CONTEXT_SUGGESTIONS: Readonly<Record<StudioSuggestionId, StudioContextSuggestion>> = Object.freeze({
  "meeting-start": Object.freeze({
    id: "meeting-start",
    titleKo: "회의를 시작할까요?",
    titleEn: "Start the meeting?",
    bodyKo: "회의실에 들어왔어요. 상태를 '회의 중'으로 바꾸고 화상 회의를 열 수 있어요.",
    bodyEn: "You're in the meeting room. Set your status to 'In a meeting' and open the video huddle.",
    acceptKo: "회의 시작",
    acceptEn: "Start meeting",
    decisions: Object.freeze([
      decision({ kind: "status", userStatus: "in-meeting" }),
      decision({ kind: "huddle" }),
    ]),
  }),
  "focus-mode": Object.freeze({
    id: "focus-mode",
    titleKo: "집중 모드로 전환할까요?",
    titleEn: "Switch to focus mode?",
    bodyKo: "책상에 앉았어요. 상태를 '집중 중'으로 바꾸고 25분 집중 타이머를 시작해요.",
    bodyEn: "You're at your desk. Set your status to 'Focusing' and start a 25-minute focus timer.",
    acceptKo: "집중 시작",
    acceptEn: "Start focusing",
    decisions: Object.freeze([
      decision({ kind: "status", userStatus: "focusing", activity: "focused" }),
      decision({ kind: "focus", command: "start" }),
    ]),
  }),
  "take-break": Object.freeze({
    id: "take-break",
    titleKo: "잠깐 쉬어 갈까요?",
    titleEn: "Take a short break?",
    bodyKo: "상태를 '휴식 중'으로 바꿔 두면 팀원이 지금은 쉬는 중인지 알 수 있어요.",
    bodyEn: "Set your status to 'On a break' so teammates know you're resting.",
    acceptKo: "휴식하기",
    acceptEn: "Take a break",
    decisions: Object.freeze([
      decision({ kind: "status", userStatus: "break" }),
      decision({ kind: "emote", emoteId: "coffee" }),
    ]),
  }),
  "browse-materials": Object.freeze({
    id: "browse-materials",
    titleKo: "자료를 열어 볼까요?",
    titleEn: "Open the materials?",
    bodyKo: "자료실에 들어왔어요. 레퍼런스 자료를 바로 열 수 있어요.",
    bodyEn: "You're in the library. Open the reference materials right away.",
    acceptKo: "자료 열기",
    acceptEn: "Open materials",
    decisions: Object.freeze([
      decision({ kind: "route", href: STUDIO_MATERIALS_HREF }),
    ]),
  }),
});

/**
 * 룸 id를 제안용 장소 종류로 정규화한다. 패턴은 spatial-actions/zone-workflow와
 * 같은 관례(meeting·focus·cafe·library 부분 일치)를 따른다.
 */
export function studioSuggestionPlaceKind(roomId: string | null | undefined): StudioSuggestionPlaceKind {
  if (!roomId) return "other";
  const id = roomId.toLowerCase();
  if (/meeting|conference|huddle/.test(id)) return "meeting-room";
  if (/focus|silent|quiet/.test(id)) return "focus";
  if (/cafe|cafeteria|kitchen/.test(id)) return "cafe";
  if (/library|archive|reference/.test(id)) return "library";
  return "other";
}

export type StudioSuggestionSignal =
  | { readonly kind: "enter-place"; readonly place: StudioSuggestionPlaceKind }
  | { readonly kind: "exit-place" }
  | { readonly kind: "seated-at-desk" }
  | { readonly kind: "stood-up" }
  | { readonly kind: "focus-completed" };

export interface StudioSuggestionState {
  readonly place: StudioSuggestionPlaceKind | null;
  readonly seatedAtDesk: boolean;
  /** 집중 세션을 마친 직후라 휴식 제안 자격이 있는 상태. 앉으면 사라진다. */
  readonly breakPending: boolean;
  readonly cooldownUntil: Readonly<Partial<Record<StudioSuggestionId, number>>>;
}

export const EMPTY_STUDIO_SUGGESTION_STATE: StudioSuggestionState = Object.freeze({
  place: null,
  seatedAtDesk: false,
  breakPending: false,
  cooldownUntil: Object.freeze({}),
});

export interface StudioSuggestionContext {
  /** 현재 이름표 상태. null이면 명시 상태 없음(기본). */
  readonly userStatus: StudioUserStatus | null;
  /** 집중 세션이 진행 중이면 집중 제안을 억제한다. */
  readonly focusActive: boolean;
}

/** 신호를 적용한다. 같은 값이면 같은 상태를 돌려준다. */
export function reduceStudioSuggestion(
  state: StudioSuggestionState,
  signal: StudioSuggestionSignal,
): StudioSuggestionState {
  switch (signal.kind) {
    case "enter-place":
      return state.place === signal.place ? state : Object.freeze({ ...state, place: signal.place });
    case "exit-place":
      return state.place === null ? state : Object.freeze({ ...state, place: null });
    case "seated-at-desk":
      return state.seatedAtDesk && !state.breakPending
        ? state
        : Object.freeze({ ...state, seatedAtDesk: true, breakPending: false });
    case "stood-up":
      return state.seatedAtDesk ? Object.freeze({ ...state, seatedAtDesk: false }) : state;
    case "focus-completed":
      return state.breakPending ? state : Object.freeze({ ...state, breakPending: true });
  }
}

function candidateIds(state: StudioSuggestionState, context: StudioSuggestionContext): readonly StudioSuggestionId[] {
  const ids: StudioSuggestionId[] = [];
  if (state.place === "meeting-room" && context.userStatus !== "in-meeting") ids.push("meeting-start");
  if ((state.seatedAtDesk || state.place === "focus")
    && context.userStatus !== "focusing" && !context.focusActive) ids.push("focus-mode");
  if ((state.breakPending || state.place === "cafe") && context.userStatus !== "break") ids.push("take-break");
  if (state.place === "library") ids.push("browse-materials");
  return Object.freeze(ids);
}

/**
 * 지금 띄울 제안을 고른다. 우선순위가 높은 후보부터 보되, 쿨다운 중인 후보는 건너뛴다.
 * 후보가 없으면 null — 아무것도 띄우지 않는다.
 */
export function pickStudioSuggestion(
  state: StudioSuggestionState,
  context: StudioSuggestionContext,
  now: number,
): StudioContextSuggestion | null {
  const at = Number.isFinite(now) ? now : 0;
  for (const id of candidateIds(state, context)) {
    const until = state.cooldownUntil[id] ?? 0;
    if (at >= until) return STUDIO_CONTEXT_SUGGESTIONS[id];
  }
  return null;
}

function withCooldown(
  state: StudioSuggestionState,
  id: StudioSuggestionId,
  now: number,
): StudioSuggestionState {
  const at = Number.isFinite(now) ? now : 0;
  return Object.freeze({
    ...state,
    cooldownUntil: Object.freeze({ ...state.cooldownUntil, [id]: at + STUDIO_SUGGESTION_COOLDOWN_MS }),
  });
}

/** 제안을 무시한다. 쿨다운 동안 같은 제안을 다시 띄우지 않는다. */
export function dismissStudioSuggestion(
  state: StudioSuggestionState,
  id: StudioSuggestionId,
  now: number,
): StudioSuggestionState {
  return withCooldown(state, id, now);
}

/**
 * 제안을 수락한다. 실행할 결정 목록과, 재제안을 막는 쿨다운이 적용된 상태를 돌려준다.
 * 휴식 제안을 수락하면 breakPending 자격도 소진한다.
 */
export function acceptStudioSuggestion(
  state: StudioSuggestionState,
  id: StudioSuggestionId,
  now: number,
): { readonly state: StudioSuggestionState; readonly decisions: readonly StudioWorkDecision[] } {
  const cooled = withCooldown(state, id, now);
  const next = id === "take-break" && cooled.breakPending
    ? Object.freeze({ ...cooled, breakPending: false })
    : cooled;
  return { state: next, decisions: STUDIO_CONTEXT_SUGGESTIONS[id].decisions };
}
