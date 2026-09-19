export const STUDIO_SCENE3D_RESIDENCY_POLICY_VERSION = 1 as const;

export interface StudioScene3dResidencyCandidate {
  readonly assetId: string;
  /** Runtime-owned decoded geometry + resident texture estimate. */
  readonly estimatedGpuBytes: number;
  /** Any visible entity using the asset makes it non-evictable for this planning epoch. */
  readonly visibleRefCount: number;
  /** Selected/edit-target references are stronger than prefetch residency. */
  readonly selectedRefCount: number;
  /** Capture/export/operation fences can pin a resource without making an entity visible. */
  readonly pinCount: number;
  /** Monotonic caller-owned recency ordinal. Larger means more recently used. */
  readonly lastUsedOrdinal: number;
  /** Optional speculative value; larger keeps an unused candidate warm longer. */
  readonly prefetchPriority?: 0 | 1 | 2 | 3;
}

export interface StudioScene3dResidencyDecision {
  readonly assetId: string;
  readonly estimatedGpuBytes: number;
  readonly action: "keep-required" | "keep-warm" | "evict";
  readonly reason:
    | "visible"
    | "selected"
    | "pinned"
    | "within-budget"
    | "budget-pressure";
}

export interface StudioScene3dResidencyPlan {
  readonly version: typeof STUDIO_SCENE3D_RESIDENCY_POLICY_VERSION;
  readonly budgetBytes: number;
  readonly requiredBytes: number;
  readonly plannedResidentBytes: number;
  readonly overBudgetBytes: number;
  readonly decisions: readonly StudioScene3dResidencyDecision[];
  readonly residentAssetIds: readonly string[];
  readonly evictAssetIds: readonly string[];
}

export class StudioScene3dResidencyPolicyError extends Error {
  constructor(
    readonly code:
      | "invalid-budget"
      | "invalid-candidate"
      | "duplicate-asset",
    message: string,
  ) {
    super(message);
    this.name = "StudioScene3dResidencyPolicyError";
  }
}

function safeNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function assertCandidate(candidate: StudioScene3dResidencyCandidate): void {
  if (
    !candidate
    || typeof candidate.assetId !== "string"
    || candidate.assetId.length === 0
    || candidate.assetId.length > 240
    || !safeNonNegativeInteger(candidate.estimatedGpuBytes)
    || !safeNonNegativeInteger(candidate.visibleRefCount)
    || !safeNonNegativeInteger(candidate.selectedRefCount)
    || !safeNonNegativeInteger(candidate.pinCount)
    || !safeNonNegativeInteger(candidate.lastUsedOrdinal)
    || (
      candidate.prefetchPriority !== undefined
      && ![0, 1, 2, 3].includes(candidate.prefetchPriority)
    )
  ) {
    throw new StudioScene3dResidencyPolicyError(
      "invalid-candidate",
      "Scene3D residency candidate is outside the bounded contract.",
    );
  }
}

function requiredReason(
  candidate: StudioScene3dResidencyCandidate,
): StudioScene3dResidencyDecision["reason"] | null {
  if (candidate.pinCount > 0) return "pinned";
  if (candidate.selectedRefCount > 0) return "selected";
  if (candidate.visibleRefCount > 0) return "visible";
  return null;
}

function safeAdd(left: number, right: number): number {
  if (
    !safeNonNegativeInteger(left)
    || !safeNonNegativeInteger(right)
    || left > Number.MAX_SAFE_INTEGER - right
  ) {
    throw new StudioScene3dResidencyPolicyError(
      "invalid-candidate",
      "Scene3D residency byte accounting overflowed.",
    );
  }
  return left + right;
}

/**
 * Plans a bounded, deterministic residency epoch without touching renderer resources.
 *
 * Required resources are never evicted, even if they exceed the budget. In that case the
 * over-budget receipt makes pressure visible to the caller, which can lower quality or ask the
 * user to close assets. Optional resources are admitted by prefetch priority, then recency, then
 * stable asset id so identical inputs always produce the same plan.
 */
export function planStudioScene3dResidency(input: {
  readonly budgetBytes: number;
  readonly candidates: readonly StudioScene3dResidencyCandidate[];
}): StudioScene3dResidencyPlan {
  if (!safeNonNegativeInteger(input.budgetBytes)) {
    throw new StudioScene3dResidencyPolicyError(
      "invalid-budget",
      "Scene3D residency budget must be a safe non-negative integer.",
    );
  }

  const seen = new Set<string>();
  for (const candidate of input.candidates) {
    assertCandidate(candidate);
    if (seen.has(candidate.assetId)) {
      throw new StudioScene3dResidencyPolicyError(
        "duplicate-asset",
        "Duplicate Scene3D residency asset: " + candidate.assetId,
      );
    }
    seen.add(candidate.assetId);
  }

  const required = input.candidates
    .filter((candidate) => requiredReason(candidate) !== null)
    .sort((a, b) => a.assetId.localeCompare(b.assetId));
  const optional = input.candidates
    .filter((candidate) => requiredReason(candidate) === null)
    .sort((a, b) =>
      (b.prefetchPriority ?? 0) - (a.prefetchPriority ?? 0)
      || b.lastUsedOrdinal - a.lastUsedOrdinal
      || a.assetId.localeCompare(b.assetId)
    );

  let requiredBytes = 0;
  const decisions: StudioScene3dResidencyDecision[] = [];
  const residentAssetIds: string[] = [];
  const evictAssetIds: string[] = [];

  for (const candidate of required) {
    requiredBytes = safeAdd(requiredBytes, candidate.estimatedGpuBytes);
    residentAssetIds.push(candidate.assetId);
    decisions.push(Object.freeze({
      assetId: candidate.assetId,
      estimatedGpuBytes: candidate.estimatedGpuBytes,
      action: "keep-required" as const,
      reason: requiredReason(candidate)!,
    }));
  }

  let plannedResidentBytes = requiredBytes;
  for (const candidate of optional) {
    const nextBytes = safeAdd(plannedResidentBytes, candidate.estimatedGpuBytes);
    if (nextBytes <= input.budgetBytes) {
      plannedResidentBytes = nextBytes;
      residentAssetIds.push(candidate.assetId);
      decisions.push(Object.freeze({
        assetId: candidate.assetId,
        estimatedGpuBytes: candidate.estimatedGpuBytes,
        action: "keep-warm" as const,
        reason: "within-budget" as const,
      }));
    } else {
      evictAssetIds.push(candidate.assetId);
      decisions.push(Object.freeze({
        assetId: candidate.assetId,
        estimatedGpuBytes: candidate.estimatedGpuBytes,
        action: "evict" as const,
        reason: "budget-pressure" as const,
      }));
    }
  }

  return Object.freeze({
    version: STUDIO_SCENE3D_RESIDENCY_POLICY_VERSION,
    budgetBytes: input.budgetBytes,
    requiredBytes,
    plannedResidentBytes,
    overBudgetBytes: Math.max(0, requiredBytes - input.budgetBytes),
    decisions: Object.freeze(decisions),
    residentAssetIds: Object.freeze(residentAssetIds),
    evictAssetIds: Object.freeze(evictAssetIds),
  });
}
