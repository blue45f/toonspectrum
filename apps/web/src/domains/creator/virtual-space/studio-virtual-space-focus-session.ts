import type { StudioUserStatus } from "./studio-virtual-space-user-status";

/**
 * 집중 세션 (포모도로) 상태 머신
 *
 * 책상에 앉거나 집중 제안을 수락하면 시작하는 짧은 집중 타이머의 순수 로직.
 * - running: 집중 중. 이름표 상태는 "focusing"과 짝을 이룬다.
 * - paused: 남은 시간을 들고 멈춰 있다.
 * - break: 집중을 마치고 쉬는 구간. 상태 전환은 자동이 아니라 제안 수락으로만 일어난다
 *   (자동 실행 금지 원칙 — 세션은 시간만 재고, 상태 변경은 사용자 행동이 결정한다).
 * - done: 휴식 구간까지 끝난 상태. 다음 start로 새 세션을 시작할 수 있다.
 *
 * 렌더링·인터벌 구동은 호출 측(페이지)이 담당한다. 이 모듈은 전이와 시간 계산만 책임진다.
 */

/** 기본 집중 시간 (25분). */
export const STUDIO_FOCUS_DEFAULT_MS = 25 * 60_000;
/** 집중 후 휴식 시간 (5분). */
export const STUDIO_FOCUS_BREAK_MS = 5 * 60_000;

export type StudioFocusPhase = "idle" | "running" | "paused" | "break" | "done";

export interface StudioFocusSession {
  readonly phase: StudioFocusPhase;
  /** 집중 구간 길이 (ms). */
  readonly durationMs: number;
  /** 현재 구간 시작 시각 (running/break에서만). */
  readonly startedAt: number | null;
  /** 현재 구간 종료 예정 시각 (running/break에서만). */
  readonly endsAt: number | null;
  /** paused에서 들고 있는 남은 시간 (ms). 그 외 구간에서는 0. */
  readonly pausedRemainingMs: number;
  /** 지금까지 마친 집중 구간 수. */
  readonly completedCount: number;
}

function cleanDuration(durationMs: number | undefined, fallback: number): number {
  return durationMs !== undefined && Number.isFinite(durationMs) && durationMs > 0
    ? Math.floor(durationMs)
    : fallback;
}

function cleanNow(now: number): number {
  return Number.isFinite(now) ? now : 0;
}

/** 빈 세션을 만든다. */
export function createStudioFocusSession(durationMs?: number): StudioFocusSession {
  return Object.freeze({
    phase: "idle",
    durationMs: cleanDuration(durationMs, STUDIO_FOCUS_DEFAULT_MS),
    startedAt: null,
    endsAt: null,
    pausedRemainingMs: 0,
    completedCount: 0,
  });
}

/** 세션이 진행 중(집중·일시정지·휴식)인지. 제안 억제 판정에 쓴다. */
export function studioFocusSessionActive(session: StudioFocusSession): boolean {
  return session.phase === "running" || session.phase === "paused" || session.phase === "break";
}

/**
 * 집중을 시작한다. idle/done에서만 새 세션이 열리고, paused면 재개와 같다.
 * 이미 running/break면 그대로 돌려준다 (멱등).
 */
export function startStudioFocusSession(
  session: StudioFocusSession,
  now: number,
  durationMs?: number,
): StudioFocusSession {
  const at = cleanNow(now);
  if (session.phase === "paused") return resumeStudioFocusSession(session, at);
  if (session.phase !== "idle" && session.phase !== "done") return session;
  const duration = cleanDuration(durationMs, session.durationMs);
  return Object.freeze({
    phase: "running",
    durationMs: duration,
    startedAt: at,
    endsAt: at + duration,
    pausedRemainingMs: 0,
    completedCount: session.completedCount,
  });
}

/** 집중을 일시정지한다. running에서만 전이한다. */
export function pauseStudioFocusSession(session: StudioFocusSession, now: number): StudioFocusSession {
  if (session.phase !== "running" || session.endsAt === null) return session;
  const remaining = Math.max(0, session.endsAt - cleanNow(now));
  return Object.freeze({ ...session, phase: "paused", endsAt: null, pausedRemainingMs: remaining });
}

/** 일시정지한 집중을 재개한다. */
export function resumeStudioFocusSession(session: StudioFocusSession, now: number): StudioFocusSession {
  if (session.phase !== "paused") return session;
  const at = cleanNow(now);
  return Object.freeze({
    ...session,
    phase: "running",
    startedAt: at,
    endsAt: at + session.pausedRemainingMs,
    pausedRemainingMs: 0,
  });
}

/** 세션을 중단하고 idle로 되돌린다. 마친 횟수는 유지한다. */
export function stopStudioFocusSession(session: StudioFocusSession): StudioFocusSession {
  if (session.phase === "idle") return session;
  return Object.freeze({ ...createStudioFocusSession(session.durationMs), completedCount: session.completedCount });
}

export type StudioFocusTickEvent = "focus-completed" | "break-completed";

/**
 * 시간을 흘려보낸다. 구간 경계를 넘으면 다음 구간으로 전이하고 이벤트를 돌려준다.
 * - running 종료 → break 구간 시작 + "focus-completed"
 * - break 종료 → done + "break-completed"
 */
export function tickStudioFocusSession(
  session: StudioFocusSession,
  now: number,
): { readonly session: StudioFocusSession; readonly event: StudioFocusTickEvent | null } {
  const at = cleanNow(now);
  if ((session.phase === "running" || session.phase === "break")
    && session.endsAt !== null && at >= session.endsAt) {
    if (session.phase === "running") {
      const breakEndsAt = session.endsAt + STUDIO_FOCUS_BREAK_MS;
      return {
        session: Object.freeze({
          ...session,
          phase: "break",
          startedAt: session.endsAt,
          endsAt: breakEndsAt,
          completedCount: session.completedCount + 1,
        }),
        event: "focus-completed",
      };
    }
    return {
      session: Object.freeze({ ...session, phase: "done", startedAt: null, endsAt: null }),
      event: "break-completed",
    };
  }
  return { session, event: null };
}

/** 현재 구간의 남은 시간 (ms). */
export function studioFocusRemainingMs(session: StudioFocusSession, now: number): number {
  switch (session.phase) {
    case "running":
    case "break":
      return session.endsAt === null ? 0 : Math.max(0, session.endsAt - cleanNow(now));
    case "paused":
      return session.pausedRemainingMs;
    case "idle":
      return session.durationMs;
    case "done":
      return 0;
  }
}

/** 집중 구간 진행률 (0~1). idle은 0, break/done은 1로 본다. */
export function studioFocusProgress(session: StudioFocusSession, now: number): number {
  if (session.phase === "idle") return 0;
  if (session.phase === "break" || session.phase === "done") return 1;
  if (session.durationMs <= 0) return 0;
  const remaining = studioFocusRemainingMs(session, now);
  return Math.min(1, Math.max(0, 1 - remaining / session.durationMs));
}

/**
 * 구간별 권장 이름표 상태. idle/done은 null — 호출 측이 기존 상태를 유지하거나
 * "작업 중"으로 되돌릴지 정한다.
 */
export function studioFocusStatusForPhase(phase: StudioFocusPhase): StudioUserStatus | null {
  switch (phase) {
    case "running":
    case "paused":
      return "focusing";
    case "break":
      return "break";
    case "idle":
    case "done":
      return null;
  }
}

/** 남은 시간을 "mm:ss"로 표시한다. 초는 올림이라 0:00은 실제 종료 후에만 보인다. */
export function formatStudioFocusClock(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
