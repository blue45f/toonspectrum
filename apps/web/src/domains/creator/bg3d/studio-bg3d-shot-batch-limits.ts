/** Lightweight editor-visible limits. Heavy archive and verification code must not live here. */
export const STUDIO_BG3D_SHOT_BATCH_MAX_DIMENSION = 4_096;

/** Shared fail-closed number policy; never coerce strings or unsafe persisted integers. */
export function isStudioBg3dShotBatchIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    value >= minimum && value <= maximum;
}

/** Finite fractional capture parameters use the same inclusive, non-coercing bounds. */
export function isStudioBg3dShotBatchNumberInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return typeof value === "number" && Number.isFinite(value) &&
    value >= minimum && value <= maximum;
}
