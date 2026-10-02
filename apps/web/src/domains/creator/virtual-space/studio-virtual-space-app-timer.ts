/**
 * 내장 예시 앱 "집중 타이머" — 순수 상태 머신.
 *
 * 인월드 앱 임베드(T4-lite)의 1차 예시 앱이다. 실제 카운트다운은 패널 컴포넌트가
 * interval로 tick을 호출해 굴리고, 여기서는 시작·일시정지·리셋·완료 판정만 다룬다.
 */

export interface StudioAppTimerState {
  /** 전체 길이(ms). */
  readonly durationMs: number;
  /** 남은 시간(ms). */
  readonly remainingMs: number;
  readonly running: boolean;
  readonly finished: boolean;
  /** 마지막 tick 기준 시각(ms epoch). 정지 중이면 null. */
  readonly lastTickAt: number | null;
}

/** 프리셋 (분 → ms). */
export const STUDIO_APP_TIMER_PRESET_MINUTES: readonly number[] = [5, 10, 25, 50];
export const DEFAULT_STUDIO_APP_TIMER_MINUTES = 25;

export function createStudioAppTimer(durationMinutes: number): StudioAppTimerState {
  const minutes = Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : DEFAULT_STUDIO_APP_TIMER_MINUTES;
  const durationMs = Math.round(minutes * 60_000);
  return { durationMs, remainingMs: durationMs, running: false, finished: false, lastTickAt: null };
}

export function startStudioAppTimer(state: StudioAppTimerState, now: number): StudioAppTimerState {
  if (state.running || state.finished) return state;
  return { ...state, running: true, lastTickAt: now };
}

export function pauseStudioAppTimer(state: StudioAppTimerState, now: number): StudioAppTimerState {
  if (!state.running) return state;
  const ticked = tickStudioAppTimer(state, now);
  return { ...ticked, running: false, lastTickAt: null };
}

export function resetStudioAppTimer(state: StudioAppTimerState): StudioAppTimerState {
  return { ...state, remainingMs: state.durationMs, running: false, finished: false, lastTickAt: null };
}

/** now까지 경과한 시간을 차감한다. 0에 닿으면 finished가 된다. */
export function tickStudioAppTimer(state: StudioAppTimerState, now: number): StudioAppTimerState {
  if (!state.running || state.lastTickAt === null || state.finished) return state;
  const elapsed = now - state.lastTickAt;
  if (!Number.isFinite(elapsed) || elapsed <= 0) return { ...state, lastTickAt: now };
  const remainingMs = Math.max(0, state.remainingMs - elapsed);
  return {
    ...state,
    remainingMs,
    lastTickAt: now,
    finished: remainingMs <= 0,
    running: remainingMs > 0,
  };
}

/** 진행률 0~1. */
export function studioAppTimerProgress(state: StudioAppTimerState): number {
  if (state.durationMs <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - state.remainingMs / state.durationMs));
}

/** MM:SS 표시. */
export function formatStudioAppTimerClock(remainingMs: number): string {
  const safe = Number.isFinite(remainingMs) ? Math.max(0, remainingMs) : 0;
  const totalSeconds = Math.ceil(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
