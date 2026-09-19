import {
  planStudioScene3dResidency,
  type StudioScene3dResidencyCandidate,
  type StudioScene3dResidencyPlan,
} from "../scene3d/studio-scene3d-residency-policy";

import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { StudioBg3dModelRootCacheEntry } from "./studio-bg3d-model-runtime-admission";

export class StudioBg3dModelCacheResidencyError extends Error {
  constructor(
    readonly code: "invalid-metrics" | "invalid-budget",
    message: string,
  ) {
    super(message);
    this.name = "StudioBg3dModelCacheResidencyError";
  }
}

function safeBytes(entry: StudioBg3dModelRootCacheEntry): number {
  const geometry = entry.metrics.estimatedDecodedGeometryBytes;
  const textures = entry.metrics.textureBytes;
  if (
    !Number.isSafeInteger(geometry) || geometry < 0
    || !Number.isSafeInteger(textures) || textures < 0
    || geometry > Number.MAX_SAFE_INTEGER - textures
  ) {
    throw new StudioBg3dModelCacheResidencyError(
      "invalid-metrics",
      "BG3D cache entry has invalid decoded-memory metrics.",
    );
  }
  return geometry + textures;
}

export function buildStudioBg3dModelCacheResidencyCandidates(input: {
  readonly cache: ReadonlyMap<string, StudioBg3dModelRootCacheEntry>;
  readonly instances: readonly BgCustomModelInstance[];
  readonly selectedInstanceIds?: ReadonlySet<string>;
  readonly pinnedModelIds?: ReadonlySet<string>;
  readonly lastUsedOrdinalByModelId?: ReadonlyMap<string, number>;
  readonly prefetchPriorityByModelId?: ReadonlyMap<string, 0 | 1 | 2 | 3>;
}): readonly StudioScene3dResidencyCandidate[] {
  const selected = input.selectedInstanceIds ?? new Set<string>();
  const pinned = input.pinnedModelIds ?? new Set<string>();
  const visibleRefs = new Map<string, number>();
  const selectedRefs = new Map<string, number>();

  for (const instance of input.instances) {
    if (instance.visible !== false) {
      visibleRefs.set(instance.modelId, (visibleRefs.get(instance.modelId) ?? 0) + 1);
    }
    if (selected.has(instance.id)) {
      selectedRefs.set(instance.modelId, (selectedRefs.get(instance.modelId) ?? 0) + 1);
    }
  }

  return Object.freeze(
    [...input.cache.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([modelId, entry]) => Object.freeze({
        assetId: modelId,
        estimatedGpuBytes: safeBytes(entry),
        visibleRefCount: visibleRefs.get(modelId) ?? 0,
        selectedRefCount: selectedRefs.get(modelId) ?? 0,
        pinCount: pinned.has(modelId) ? 1 : 0,
        lastUsedOrdinal: input.lastUsedOrdinalByModelId?.get(modelId) ?? 0,
        ...(input.prefetchPriorityByModelId?.has(modelId)
          ? { prefetchPriority: input.prefetchPriorityByModelId.get(modelId)! }
          : {}),
      })),
  );
}

export function planStudioBg3dModelCacheResidency(input: {
  readonly budgetBytes: number;
  readonly cache: ReadonlyMap<string, StudioBg3dModelRootCacheEntry>;
  readonly instances: readonly BgCustomModelInstance[];
  readonly selectedInstanceIds?: ReadonlySet<string>;
  readonly pinnedModelIds?: ReadonlySet<string>;
  readonly lastUsedOrdinalByModelId?: ReadonlyMap<string, number>;
  readonly prefetchPriorityByModelId?: ReadonlyMap<string, 0 | 1 | 2 | 3>;
}): StudioScene3dResidencyPlan {
  if (!Number.isSafeInteger(input.budgetBytes) || input.budgetBytes < 0) {
    throw new StudioBg3dModelCacheResidencyError(
      "invalid-budget",
      "BG3D model residency budget must be a safe non-negative integer.",
    );
  }
  return planStudioScene3dResidency({
    budgetBytes: input.budgetBytes,
    candidates: buildStudioBg3dModelCacheResidencyCandidates(input),
  });
}
