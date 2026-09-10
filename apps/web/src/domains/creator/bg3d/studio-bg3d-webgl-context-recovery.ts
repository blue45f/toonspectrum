export type StudioBg3dWebglRecoveryPhase =
  | "healthy"
  | "lost"
  | "restored"
  | "degraded";

export interface StudioBg3dWebglRecoverySnapshot {
  readonly degraded: boolean;
  readonly lossCount: number;
  readonly phase: StudioBg3dWebglRecoveryPhase;
  readonly timestamp: number;
}

export interface StudioBg3dWebglRecoveryOptions {
  readonly cancelFrame?: (frameId: number) => void;
  readonly degradationThreshold?: number;
  readonly invalidate: () => void;
  readonly now?: () => number;
  readonly onStateChange?: (
    snapshot: StudioBg3dWebglRecoverySnapshot,
  ) => void;
  readonly recoveryWindowMs?: number;
  readonly resetRenderer: () => void;
  readonly scheduleFrame?: (callback: FrameRequestCallback) => number;
}

export interface StudioBg3dWebglRecoveryController {
  readonly dispose: () => void;
  readonly snapshot: () => StudioBg3dWebglRecoverySnapshot;
}

export const STUDIO_BG3D_WEBGL_RECOVERY_EVENT =
  "toonstudio:bg3d-webgl-recovery" as const;

const DEFAULT_RECOVERY_WINDOW_MS = 30_000;
const DEFAULT_DEGRADATION_THRESHOLD = 3;

function browserScheduleFrame(callback: FrameRequestCallback): number {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(callback);
  }
  return globalThis.setTimeout(
    () => callback(globalThis.performance?.now?.() ?? Date.now()),
    0,
  ) as unknown as number;
}

function browserCancelFrame(frameId: number): void {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(frameId);
    return;
  }
  globalThis.clearTimeout(frameId);
}

/**
 * Owns the unplanned WebGL context lifecycle for the primary BG3D canvas.
 * Calling preventDefault on context loss keeps browser-managed restoration
 * available; restoration then rebuilds renderer caches and invalidates twice
 * so asynchronously restored programs and textures receive a follow-up frame.
 */
export function installStudioBg3dWebglContextRecovery(
  canvas: HTMLCanvasElement,
  options: StudioBg3dWebglRecoveryOptions,
): StudioBg3dWebglRecoveryController {
  const now = options.now ?? Date.now;
  const scheduleFrame = options.scheduleFrame ?? browserScheduleFrame;
  const cancelFrame = options.cancelFrame ?? browserCancelFrame;
  const recoveryWindowMs = Math.max(
    1_000,
    options.recoveryWindowMs ?? DEFAULT_RECOVERY_WINDOW_MS,
  );
  const degradationThreshold = Math.max(
    2,
    Math.round(
      options.degradationThreshold ?? DEFAULT_DEGRADATION_THRESHOLD,
    ),
  );

  let disposed = false;
  let scheduledFrame: number | null = null;
  let restorationEpoch = 0;
  let lossTimes: number[] = [];
  let current: StudioBg3dWebglRecoverySnapshot = Object.freeze({
    degraded: false,
    lossCount: 0,
    phase: "healthy",
    timestamp: now(),
  });

  const publish = (
    phase: StudioBg3dWebglRecoveryPhase,
    timestamp: number,
  ): void => {
    const degraded = lossTimes.length >= degradationThreshold;
    current = Object.freeze({
      degraded,
      lossCount: lossTimes.length,
      phase: degraded && phase === "lost" ? "degraded" : phase,
      timestamp,
    });
    options.onStateChange?.(current);
  };

  const cancelScheduledFrame = (): void => {
    if (scheduledFrame === null) return;
    cancelFrame(scheduledFrame);
    scheduledFrame = null;
  };

  const handleContextLost = (event: Event): void => {
    if (disposed) return;
    event.preventDefault();
    restorationEpoch += 1;
    cancelScheduledFrame();
    const timestamp = now();
    lossTimes = lossTimes
      .filter((lossAt) => timestamp - lossAt <= recoveryWindowMs)
      .concat(timestamp);
    publish("lost", timestamp);
  };

  const handleContextRestored = (): void => {
    if (disposed) return;
    const timestamp = now();
    const epoch = restorationEpoch + 1;
    restorationEpoch = epoch;
    cancelScheduledFrame();

    try {
      options.resetRenderer();
    } finally {
      queueMicrotask(() => {
        if (!disposed && restorationEpoch === epoch) {
          options.invalidate();
        }
      });
      scheduledFrame = scheduleFrame(() => {
        scheduledFrame = null;
        if (!disposed && restorationEpoch === epoch) {
          options.invalidate();
        }
      });
      publish("restored", timestamp);
    }
  };

  canvas.addEventListener("webglcontextlost", handleContextLost, false);
  canvas.addEventListener(
    "webglcontextrestored",
    handleContextRestored,
    false,
  );

  return Object.freeze({
    dispose: () => {
      if (disposed) return;
      disposed = true;
      restorationEpoch += 1;
      canvas.removeEventListener(
        "webglcontextlost",
        handleContextLost,
        false,
      );
      canvas.removeEventListener(
        "webglcontextrestored",
        handleContextRestored,
        false,
      );
      cancelScheduledFrame();
    },
    snapshot: () => current,
  });
}
