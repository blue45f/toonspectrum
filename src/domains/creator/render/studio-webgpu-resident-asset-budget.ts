export interface StudioWebGpuResidentAssetBudgetEntry {
  readonly key: string;
  readonly byteLength: number;
  readonly lastUsed: number;
}

export interface StudioWebGpuResidentAssetBudgetRequirement {
  readonly key: string;
  readonly byteLength: number;
}

export interface StudioWebGpuResidentAssetBudgetInput {
  readonly maximumResidentBytes: number;
  readonly entries: readonly StudioWebGpuResidentAssetBudgetEntry[];
  readonly requirements: readonly StudioWebGpuResidentAssetBudgetRequirement[];
}

export type StudioWebGpuResidentAssetBudgetRejectionReason =
  | "duplicate-entry"
  | "entry-requirement-size-mismatch"
  | "invalid-entry"
  | "invalid-maximum"
  | "invalid-requirement"
  | "requirement-size-conflict"
  | "requirement-too-large";

export type StudioWebGpuResidentAssetBudgetPlan =
  | Readonly<{
      status: "ready";
      evictKeys: readonly string[];
      residentBytesBefore: number;
      residentBytesAfterEviction: number;
      residentBytesAfterPlan: number;
      cacheHitBytes: number;
      uploadBytes: number;
    }>
  | Readonly<{
      status: "rejected";
      reason: StudioWebGpuResidentAssetBudgetRejectionReason;
    }>;

function validKey(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function nonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function safeAdd(left: number, right: number): number | null {
  if (left > Number.MAX_SAFE_INTEGER - right) return null;
  return left + right;
}

function rejected(
  reason: StudioWebGpuResidentAssetBudgetRejectionReason,
): StudioWebGpuResidentAssetBudgetPlan {
  return Object.freeze({ status: "rejected", reason });
}

/**
 * Plans a pin-safe deterministic LRU transition for device-local brush assets.
 *
 * Every required key is pinned for the upcoming submission. Only cold entries outside that set
 * may be evicted, ordered by last-use tick and then key so replay and tests make the same choice.
 * The planner is pure: callers perform texture destruction and uploads after queue ownership is
 * serialized.
 */
export function planStudioWebGpuResidentAssetBudget(
  input: StudioWebGpuResidentAssetBudgetInput,
): StudioWebGpuResidentAssetBudgetPlan {
  if (!nonNegativeSafeInteger(input?.maximumResidentBytes)) {
    return rejected("invalid-maximum");
  }
  if (!Array.isArray(input.entries) || !Array.isArray(input.requirements)) {
    return rejected("invalid-entry");
  }

  const entriesByKey = new Map<string, StudioWebGpuResidentAssetBudgetEntry>();
  let residentBytesBefore = 0;
  for (const entry of input.entries) {
    if (
      !entry
      || !validKey(entry.key)
      || !positiveSafeInteger(entry.byteLength)
      || !nonNegativeSafeInteger(entry.lastUsed)
    ) {
      return rejected("invalid-entry");
    }
    if (entriesByKey.has(entry.key)) return rejected("duplicate-entry");
    const nextResidentBytes = safeAdd(residentBytesBefore, entry.byteLength);
    if (nextResidentBytes === null) return rejected("invalid-entry");
    entriesByKey.set(entry.key, entry);
    residentBytesBefore = nextResidentBytes;
  }

  const requirementsByKey = new Map<
    string,
    StudioWebGpuResidentAssetBudgetRequirement
  >();
  for (const requirement of input.requirements) {
    if (
      !requirement
      || !validKey(requirement.key)
      || !positiveSafeInteger(requirement.byteLength)
    ) {
      return rejected("invalid-requirement");
    }
    const existingRequirement = requirementsByKey.get(requirement.key);
    if (existingRequirement) {
      if (existingRequirement.byteLength !== requirement.byteLength) {
        return rejected("requirement-size-conflict");
      }
      continue;
    }
    requirementsByKey.set(requirement.key, requirement);
  }

  let cacheHitBytes = 0;
  let uploadBytes = 0;
  let requiredBytes = 0;
  for (const requirement of requirementsByKey.values()) {
    const nextRequiredBytes = safeAdd(requiredBytes, requirement.byteLength);
    if (nextRequiredBytes === null) return rejected("requirement-too-large");
    requiredBytes = nextRequiredBytes;
    const resident = entriesByKey.get(requirement.key);
    if (resident) {
      if (resident.byteLength !== requirement.byteLength) {
        return rejected("entry-requirement-size-mismatch");
      }
      cacheHitBytes += requirement.byteLength;
    } else {
      uploadBytes += requirement.byteLength;
    }
  }
  if (requiredBytes > input.maximumResidentBytes) {
    return rejected("requirement-too-large");
  }

  const pinnedKeys = new Set(requirementsByKey.keys());
  const evictable = [...entriesByKey.values()]
    .filter((entry) => !pinnedKeys.has(entry.key))
    .sort((left, right) => left.lastUsed - right.lastUsed || left.key.localeCompare(right.key));
  const evictKeys: string[] = [];
  let residentBytesAfterEviction = residentBytesBefore;
  for (const entry of evictable) {
    if (residentBytesAfterEviction + uploadBytes <= input.maximumResidentBytes) break;
    residentBytesAfterEviction -= entry.byteLength;
    evictKeys.push(entry.key);
  }
  const residentBytesAfterPlan = residentBytesAfterEviction + uploadBytes;
  if (residentBytesAfterPlan > input.maximumResidentBytes) {
    return rejected("requirement-too-large");
  }

  return Object.freeze({
    status: "ready",
    evictKeys: Object.freeze(evictKeys),
    residentBytesBefore,
    residentBytesAfterEviction,
    residentBytesAfterPlan,
    cacheHitBytes,
    uploadBytes,
  });
}
