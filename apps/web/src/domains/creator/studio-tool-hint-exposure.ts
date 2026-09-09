export type StudioToolHintRevealIntent = "focus" | "hover" | "touch";

export const STUDIO_TOOL_HINT_HOVER_COOLDOWN_MS = 90_000;
export const STUDIO_TOOL_HINT_ACTIVATION_COOLDOWN_MS = 5 * 60_000;
export const STUDIO_TOOL_HINT_AUTOMATIC_RESET_MS = 15 * 60_000;
export const STUDIO_TOOL_HINT_GLOBAL_REVEAL_WINDOW_MS = 20_000;
export const STUDIO_TOOL_HINT_GLOBAL_MAX_AUTOMATIC_REVEALS = 6;
export const STUDIO_TOOL_HINT_MAX_AUTOMATIC_REVEALS = 2;

const MAX_TRACKED_HINTS = 256;

type StudioToolHintExposure = Readonly<{
  automaticRevealCount: number;
  automaticWindowStartedAt: number | null;
  lastAutomaticRevealAt: number | null;
  lastActivationAt: number | null;
}>;

export type StudioToolHintExposureManager = {
  canReveal: (hintId: string, intent: StudioToolHintRevealIntent, now?: number) => boolean;
  markRevealed: (hintId: string, intent: StudioToolHintRevealIntent, now?: number) => void;
  markActivated: (hintId: string, now?: number) => void;
};

const EMPTY_EXPOSURE: StudioToolHintExposure = {
  automaticRevealCount: 0,
  automaticWindowStartedAt: null,
  lastAutomaticRevealAt: null,
  lastActivationAt: null,
};

function resetExpiredAutomaticWindow(
  exposure: StudioToolHintExposure,
  now: number
): StudioToolHintExposure {
  if (
    exposure.automaticWindowStartedAt === null ||
    now - exposure.automaticWindowStartedAt < STUDIO_TOOL_HINT_AUTOMATIC_RESET_MS
  ) {
    return exposure;
  }
  return {
    ...exposure,
    automaticRevealCount: 0,
    automaticWindowStartedAt: null,
    lastAutomaticRevealAt: null,
  };
}

/**
 * Keeps automatic coaching useful without turning a dense editor toolbar into
 * hover noise.
 *
 * The memory is scoped to one Studio provider session. Passive hover is cooled
 * down per semantic tool, capped inside a rolling learning window, and guarded
 * by a small editor-wide burst budget. The per-tool cap resets so help never
 * becomes permanently undiscoverable in a long session. Keyboard focus and a
 * deliberate touch long-press are explicit help requests and remain available.
 */
export function createStudioToolHintExposureManager(): StudioToolHintExposureManager {
  const exposures = new Map<string, StudioToolHintExposure>();
  const recentAutomaticRevealTimes: number[] = [];

  function read(hintId: string, now: number): StudioToolHintExposure {
    return resetExpiredAutomaticWindow(exposures.get(hintId) ?? EMPTY_EXPOSURE, now);
  }

  function write(hintId: string, exposure: StudioToolHintExposure) {
    if (exposures.has(hintId)) exposures.delete(hintId);
    exposures.set(hintId, exposure);
    while (exposures.size > MAX_TRACKED_HINTS) {
      const oldestHintId = exposures.keys().next().value;
      if (typeof oldestHintId !== "string") break;
      exposures.delete(oldestHintId);
    }
  }

  function pruneGlobalWindow(now: number) {
    let expiredCount = 0;
    while (
      expiredCount < recentAutomaticRevealTimes.length &&
      now - (recentAutomaticRevealTimes[expiredCount] ?? now) >=
        STUDIO_TOOL_HINT_GLOBAL_REVEAL_WINDOW_MS
    ) {
      expiredCount += 1;
    }
    if (expiredCount > 0) recentAutomaticRevealTimes.splice(0, expiredCount);
  }

  return {
    canReveal(hintId, intent, now = Date.now()) {
      if (intent !== "hover") return true;
      const exposure = read(hintId, now);
      if (exposure.automaticRevealCount >= STUDIO_TOOL_HINT_MAX_AUTOMATIC_REVEALS) {
        return false;
      }
      if (
        exposure.lastActivationAt !== null &&
        now - exposure.lastActivationAt < STUDIO_TOOL_HINT_ACTIVATION_COOLDOWN_MS
      ) {
        return false;
      }
      if (
        exposure.lastAutomaticRevealAt !== null &&
        now - exposure.lastAutomaticRevealAt < STUDIO_TOOL_HINT_HOVER_COOLDOWN_MS
      ) {
        return false;
      }
      pruneGlobalWindow(now);
      return (
        recentAutomaticRevealTimes.length < STUDIO_TOOL_HINT_GLOBAL_MAX_AUTOMATIC_REVEALS
      );
    },
    markRevealed(hintId, intent, now = Date.now()) {
      if (intent !== "hover") return;
      const exposure = read(hintId, now);
      pruneGlobalWindow(now);
      recentAutomaticRevealTimes.push(now);
      write(hintId, {
        ...exposure,
        automaticRevealCount: exposure.automaticRevealCount + 1,
        automaticWindowStartedAt: exposure.automaticWindowStartedAt ?? now,
        lastAutomaticRevealAt: now,
      });
    },
    markActivated(hintId, now = Date.now()) {
      write(hintId, {
        ...read(hintId, now),
        lastActivationAt: now,
      });
    },
  };
}
