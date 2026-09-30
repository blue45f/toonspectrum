import type { StudioCharacterMotionState } from "./studio-virtual-space-character-skins";
import { studioSpaceEmoteById, type StudioSpaceEmoteExpression } from "./studio-virtual-space-emote-catalog";
import type { StudioVirtualSpaceFacing } from "./studio-virtual-space-model";
import type { StudioVirtualSpaceReaction } from "./studio-virtual-space-presence";

export type StudioCatExpression = "idle" | "happy" | "curious" | "snooze";
export interface StudioCatExpressionState {
  readonly expression: StudioCatExpression;
  readonly startedAt: number;
  readonly lastTime: number;
  readonly near: boolean;
}

function identityPhase(identity: string): number {
  let hash = 0;
  for (const character of identity) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  return hash % 4_000;
}

function safeTime(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** 자리와 충돌을 바꾸지 않는 고양이 반응. 거리 경계의 떨림은 진입·이탈 간격으로 억제한다. */
export function stepStudioCatExpression(previous: StudioCatExpressionState | null, input: {
  readonly time: number;
  readonly distance: number;
  readonly playerSpeed: number;
  readonly reducedMotion: boolean;
  readonly identity: string;
}): { readonly state: StudioCatExpressionState; readonly frame: number } {
  const time = safeTime(input.time);
  const current = previous && time >= previous.lastTime ? previous : null;
  const distance = Number.isFinite(input.distance) ? Math.max(0, input.distance) : Infinity;
  const speed = Number.isFinite(input.playerSpeed) ? Math.max(0, input.playerSpeed) : 0;
  const near = distance < (current?.near ? 144 : 110);
  if (input.reducedMotion) return { state: { expression: "idle", startedAt: time, lastTime: time, near }, frame: 0 };
  const phase = identityPhase(input.identity);
  let expression = current?.expression ?? "idle";
  let startedAt = current?.startedAt ?? time;
  const elapsed = time - startedAt;
  const select = (next: StudioCatExpression) => { expression = next; startedAt = time; };
  if (near && !current?.near) select(speed >= 25 ? "curious" : "happy");
  else if (near) {
    if (expression === "snooze") select("curious");
    else if (expression !== "curious" && speed >= 90 && elapsed >= 900) select("curious");
    else if (expression === "curious" && elapsed >= 1_800 && speed < 25) select("happy");
    else if ((expression === "happy" && elapsed >= 2_400) || (expression === "curious" && elapsed >= 2_200)) select("idle");
    else if (expression === "idle" && elapsed >= 6_000 && speed < 25) select("happy");
  } else if (current?.near) select("idle");
  else if ((expression === "happy" || expression === "curious") && elapsed >= 1_400) select("idle");
  else if (expression === "idle" && elapsed >= 7_000 + phase) select("snooze");
  else if (expression === "snooze" && elapsed >= 6_000 + phase * .5) select("idle");

  const age = time - startedAt;
  const blink = (age + phase) % 5_200;
  const frame = expression === "idle" ? blink < 4_400 ? 0 : blink < 4_600 ? 1 : blink < 4_760 ? 2 : blink < 4_920 ? 3 : 0
    : expression === "happy" ? 4 + Math.floor(age / 260) % 4
      : expression === "curious" ? 8 + Math.floor(age / 340) % 4
        : 12 + Math.floor(age / 1_000) % 4;
  return { state: { expression, startedAt, lastTime: time, near }, frame };
}

/** 표정 시트(actor-emotions) 열: 0 눈 감음(평온) · 1 활짝 웃음 · 2 손 인사 · 3 놀람. */
export type StudioCharacterExpression = StudioSpaceEmoteExpression;
const CHARACTER_ROWS = new Map<string, number>([["pink", 0], ["silver", 1], ["dark", 2], ["purple", 3]]);
const EXPRESSION_COLUMNS: Readonly<Record<StudioCharacterExpression, number>> = Object.freeze({
  calm: 0, happy: 1, wave: 2, surprised: 3,
});

/** 이모트(리액션) id의 표정. 표정이 없는 이모트(춤)는 null이다. */
export function studioReactionExpression(reaction: StudioVirtualSpaceReaction | null | undefined): StudioCharacterExpression | null {
  if (!reaction) return null;
  return studioSpaceEmoteById(reaction)?.expression ?? null;
}

/**
 * 정면 정지 표정만 선택한다. 걷기·작업·좌석과 지원하지 않는 스킨(pink·silver·dark·purple 외)의
 * 기존 자세는 유지한다(null).
 */
export function studioCharacterExpressionFrame(input: {
  readonly skinKey: string;
  readonly time: number;
  readonly idleForMs: number;
  readonly moving: boolean;
  readonly facing: StudioVirtualSpaceFacing;
  readonly reducedMotion: boolean;
  readonly reaction?: StudioVirtualSpaceReaction | null;
  readonly expression?: StudioCharacterExpression | null;
  readonly motionState?: StudioCharacterMotionState;
  readonly identity?: string;
}): number | null {
  const row = CHARACTER_ROWS.get(input.skinKey);
  if (row === undefined || input.moving || input.facing !== "down"
    || (input.motionState && input.motionState !== "idle" && input.motionState !== "wave")) return null;
  const expression = input.expression ?? studioReactionExpression(input.reaction)
    ?? (input.motionState === "wave" ? "wave" : null);
  if (expression) return row * 4 + EXPRESSION_COLUMNS[expression];
  if (input.reducedMotion || !Number.isFinite(input.idleForMs) || input.idleForMs < 1_000) return null;
  const blink = (safeTime(input.time) + identityPhase(input.identity ?? input.skinKey)) % 6_800;
  return blink >= 6_560 && blink < 6_740 ? row * 4 : null;
}
