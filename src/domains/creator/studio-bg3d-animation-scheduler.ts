export type StudioBg3dAnimationScheduleReason =
  | "capture"
  | "selected"
  | "near"
  | "far"
  | "very-far"
  | "hidden"
  | "offscreen";

export interface StudioBg3dAnimationScheduleInput {
  readonly visibleInHierarchy: boolean;
  readonly inCameraFrustum: boolean;
  readonly capturing: boolean;
  readonly selected: boolean;
  readonly targetFps: number;
  /** Positive values make CPU animation LOD engage sooner; negative values preserve full rate. */
  readonly lodBias?: number;
  readonly distanceToCamera: number;
  readonly boundingRadius: number;
}

export interface StudioBg3dAnimationSchedule {
  readonly suspended: boolean;
  readonly minimumIntervalSeconds: number;
  readonly reason: StudioBg3dAnimationScheduleReason;
}

/**
 * CPU scheduler for mixer/skin/morph sampling. Rendering remains controlled by Three/R3F; skipped
 * animations are sampled from absolute Studio time when they become visible again, so no drift is
 * accumulated and captures/selected editing always receive a fresh pose.
 */
export function resolveStudioBg3dAnimationSchedule(
  input: StudioBg3dAnimationScheduleInput,
): StudioBg3dAnimationSchedule {
  if (!input.visibleInHierarchy) {
    return { suspended: true, minimumIntervalSeconds: Number.POSITIVE_INFINITY, reason: "hidden" };
  }
  if (input.capturing) return { suspended: false, minimumIntervalSeconds: 0, reason: "capture" };
  if (input.selected) return { suspended: false, minimumIntervalSeconds: 0, reason: "selected" };
  if (!input.inCameraFrustum) {
    return { suspended: true, minimumIntervalSeconds: Number.POSITIVE_INFINITY, reason: "offscreen" };
  }
  const targetFps = Number.isFinite(input.targetFps)
    ? Math.min(60, Math.max(10, Math.floor(input.targetFps)))
    : 30;
  const radius = Number.isFinite(input.boundingRadius) && input.boundingRadius > 1e-6
    ? input.boundingRadius
    : 1;
  const distance = Number.isFinite(input.distanceToCamera)
    ? Math.max(0, input.distanceToCamera)
    : Number.POSITIVE_INFINITY;
  const distanceInRadii = distance / radius;
  const lodBias = Number.isFinite(input.lodBias)
    ? Math.min(4, Math.max(-2, input.lodBias ?? 0))
    : 0;
  const lodDistanceFactor = 2 ** lodBias;
  if (distanceInRadii >= 80 / lodDistanceFactor) {
    return {
      suspended: false,
      minimumIntervalSeconds: 1 / Math.min(targetFps, 10),
      reason: "very-far",
    };
  }
  if (distanceInRadii >= 30 / lodDistanceFactor) {
    return {
      suspended: false,
      minimumIntervalSeconds: 1 / Math.min(targetFps, 20),
      reason: "far",
    };
  }
  return { suspended: false, minimumIntervalSeconds: 1 / targetFps, reason: "near" };
}
