import type { StudioAutosavePayload } from "./studio-autosave";

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function hasSameUniqueIds(left: readonly string[], right: readonly string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size !== left.length || rightSet.size !== right.length) return false;
  if (leftSet.size !== rightSet.size) return false;
  return [...leftSet].every((id) => rightSet.has(id));
}

export function isStudioPendingStrokeEmergencyRecoveryPayload(
  payload: StudioAutosavePayload,
): boolean {
  const pending = payload.pendingStrokeDurability;
  const lifecycle = payload.lifecycleDurability;
  if (!pending || !lifecycle) return false;
  if (pending.kind !== "pending-strokes" || lifecycle.kind !== "lifecycle-snapshot") {
    return false;
  }
  if (pending.strokeIds.length === 0) return false;
  if (pending.savedAt !== payload.savedAt || lifecycle.savedAt !== payload.savedAt) {
    return false;
  }
  if (pending.reason !== lifecycle.reason) return false;
  if (pending.pageId !== lifecycle.pendingStrokePageId) return false;
  if (pending.pageId !== payload.activePageId) return false;
  if (!hasSameUniqueIds(pending.strokeIds, lifecycle.pendingStrokeIds ?? [])) {
    return false;
  }

  const page = payload.pagesList.find((candidate) => candidate.id === pending.pageId);
  if (!page) return false;
  const elementIds = new Set(page.elements.map((element) => element.id));
  return pending.strokeIds.every((strokeId) => elementIds.has(strokeId));
}

export function shouldPreferStudioPendingStrokeEmergencyRecovery(
  durablePayload: StudioAutosavePayload,
  compatibilityPayload: StudioAutosavePayload,
): boolean {
  if (!isStudioPendingStrokeEmergencyRecoveryPayload(compatibilityPayload)) {
    return false;
  }
  if (timestamp(compatibilityPayload.savedAt) < timestamp(durablePayload.savedAt)) {
    return false;
  }

  const receipt = compatibilityPayload.pendingStrokeDurability;
  if (!receipt) return false;
  const durablePage = durablePayload.pagesList.find((page) => page.id === receipt.pageId);
  const durableElementIds = new Set(
    durablePage?.elements.map((element) => element.id) ?? [],
  );
  return receipt.strokeIds.some((strokeId) => !durableElementIds.has(strokeId));
}
