import type { StudioAdjustmentStack } from "./studio-adjustment-stack";

/** Used by every mutation, including duplicate and recipe append, not just catalog insertion. */
export function studioSmartFilterMutationError(
  next: StudioAdjustmentStack,
  maxEntries?: number,
  validateStack?: (next: StudioAdjustmentStack) => string | null,
): string | null {
  if (maxEntries !== undefined && next.entries.length > maxEntries) {
    return `이 레이어에는 필터를 최대 ${maxEntries}개까지 저장할 수 있어요.`;
  }
  return validateStack?.(next) ?? null;
}
