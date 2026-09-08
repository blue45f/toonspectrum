import {
  clearStudioReliabilityChannel,
  getStudioReliabilityStatusSnapshot,
  reportStudioReliabilitySignal,
} from "./studio-reliability-status-store";

import type { StudioReliabilitySignal } from "./studio-reliability-status-store";

export const STUDIO_AUTOSAVE_BUSY_RETRY_BASE_MS = 1_000;
export const STUDIO_AUTOSAVE_BUSY_RETRY_MAX_MS = 8_000;
export const STUDIO_AUTOSAVE_BUSY_RETRY_RESET_AFTER_MS = 30_000;

type StudioAutosaveBusyRetryBackoff = {
  attempt: number;
  lastScheduledAt: number | null;
};

/**
 * One editor document is active per tab. Keeping contention state at module scope lets the
 * backoff survive the React effect replacement triggered by `requestRetry`.
 */
const sharedBackoff: StudioAutosaveBusyRetryBackoff = {
  attempt: 0,
  lastScheduledAt: null,
};

function resetBackoff(): void {
  sharedBackoff.attempt = 0;
  sharedBackoff.lastScheduledAt = null;
}

export function resetStudioAutosaveBusyRetryBackoff(): void {
  resetBackoff();
}

export function studioAutosaveBusyRetryDelay(attempt: number): number {
  const normalizedAttempt = Number.isFinite(attempt)
    ? Math.max(0, Math.floor(attempt))
    : 0;
  return Math.min(
    STUDIO_AUTOSAVE_BUSY_RETRY_BASE_MS * (2 ** normalizedAttempt),
    STUDIO_AUTOSAVE_BUSY_RETRY_MAX_MS,
  );
}

function claimRetryDelay(now: number): number {
  const previous = sharedBackoff.lastScheduledAt;
  if (
    previous === null
    || now < previous
    || now - previous >= STUDIO_AUTOSAVE_BUSY_RETRY_RESET_AFTER_MS
  ) {
    resetBackoff();
  }
  const delay = studioAutosaveBusyRetryDelay(sharedBackoff.attempt);
  sharedBackoff.attempt += 1;
  sharedBackoff.lastScheduledAt = now;
  return delay;
}

function signalsEqual(
  current: StudioReliabilitySignal | null,
  expected: StudioReliabilitySignal,
): boolean {
  return current !== null
    && current.channel === expected.channel
    && current.level === expected.level
    && current.title === expected.title
    && current.detail === expected.detail
    && current.at === expected.at;
}

/**
 * Re-arms the current autosave effect after a temporary writer conflict.
 *
 * Repeated autonomous conflicts back off (1s → 2s → 4s → 8s cap) so an old OPFS/SQLite
 * writer cannot create a tight effect loop. A fresh edit cancels the pending controller and
 * resets the sequence to 1s, keeping user work responsive. The reliability rail owns the
 * visible "waiting for save lock" notice and the successful durable write clears it.
 */
export function createStudioAutosaveBusyRetry(options: {
  readonly isCurrent: () => boolean;
  readonly requestRetry: () => void;
  readonly now?: () => number;
}) {
  let disposed = false;
  let retryWasDispatched = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let ownedSignal: StudioReliabilitySignal | null = null;

  const clearOwnedSignal = () => {
    if (!ownedSignal) return;
    if (signalsEqual(getStudioReliabilityStatusSnapshot().save, ownedSignal)) {
      clearStudioReliabilityChannel("save");
    }
    ownedSignal = null;
  };

  return {
    schedule(): void {
      if (disposed || timer !== null) return;
      if (!options.isCurrent()) {
        clearOwnedSignal();
        resetBackoff();
        return;
      }

      const now = (options.now ?? Date.now)();
      const delay = claimRetryDelay(now);
      ownedSignal = Object.freeze({
        channel: "save",
        level: "degraded",
        title: "임시저장 잠금을 기다리고 있습니다",
        detail: `다른 저장 작업이 끝나면 ${Math.ceil(delay / 1_000)}초 후 자동으로 다시 시도합니다. 현재 편집 내용은 유지됩니다.`,
        at: now,
      });
      reportStudioReliabilitySignal(ownedSignal);

      timer = setTimeout(() => {
        timer = null;
        if (disposed) return;
        if (!options.isCurrent()) {
          clearOwnedSignal();
          resetBackoff();
          return;
        }
        retryWasDispatched = true;
        options.requestRetry();
      }, delay);
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;

      // A controller disposed before dispatch represents a fresh edit/effect replacement.
      // Leadership loss and unmount also start the next document from the fast path.
      if (!retryWasDispatched || !options.isCurrent()) {
        clearOwnedSignal();
        resetBackoff();
      }
    },
  };
}
