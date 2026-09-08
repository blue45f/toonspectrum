
import {
  collectStudioBg3dThreeJoints,
  collectStudioBg3dThreeMorphTargets,
  computeAutoFitScale,
  loadVerifiedStudioBg3dGlbWithThree,
  measureBg3dObjectSize,
  StudioBg3dThreeOperationError,
  type StudioBg3dThreeJointDescriptor,
  type StudioBg3dThreeLoadSuccess,
  type StudioBg3dThreeMorphDescriptor,
} from "../studio-background-3d-model";
import { inspectStudioGeneric3dRuntimeHints } from "../studio-generic-3d-runtime-hints";
import {
  attachStudioGeneric3dWorkflowMetadata,
  parseStudioGeneric3dWorkflowMetadata,
} from "../studio-generic-3d-workflow-metadata";
import {
  getStudio3dAssetQualityMode,
  resetStudio3dAssetQualityMode,
} from "../studio-3d-asset-quality-session";

import type { StudioBg3dResolvedDeviceQuality } from "./studio-bg3d-device-quality";
import { isStudioBg3dEnvironmentAssetId } from "./studio-bg3d-environment-catalog";
import {
  combineStudioBg3dAbortSignals,
  StudioBg3dStaleModalOperationError,
  studioBg3dGlobalAssetLoadGate,
} from "./studio-bg3d-modal-operation-coordinator";
import {
  admitStoredBg3dModelForRenderingV12 as admitStoredBg3dModelForRendering,
  type Bg3dVerifiedStoredRecord,
} from "./studio-bg3d-model-library-loader";
import { assertStudioBg3dModelPlacementAdmission } from "./studio-bg3d-model-placement-admission";
import { applyStudioBg3dRuntimeAssetQuality } from "./studio-bg3d-runtime-asset-quality";
import {
  classifyStudioBg3dThreeSemanticMaterials,
} from "./studio-bg3d-three-semantic-materials";
import {
  deriveStudioBg3dSessionGlbValidationPolicy as deriveStudioBg3dGlbValidationPolicy,
} from "./studio-bg3d-session-glb-policy";

import type {
  StudioBg3dModelAttachment,
  StudioBg3dSceneBudgets,
  StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import type { StudioBg3dSemanticMaterialClassificationResult } from "./studio-bg3d-semantic-materials";
import type {
  StudioGeneric3dClassification,
  StudioGeneric3dManifestHints,
  StudioGeneric3dSourceFormat,
} from "../studio-generic-3d-model-mode";
import type { StudioBg3dKtx2Renderer } from "./studio-bg3d-ktx2-renderer-runtime";

export type StudioBg3dModelRootCacheEntry = Pick<
  StudioBg3dThreeLoadSuccess,
  "root" | "dispose" | "animations"
> & {
  readonly record: Bg3dVerifiedStoredRecord;
  readonly metrics: StudioBg3dThreeLoadSuccess["metrics"];
  readonly admittedProfiles: Set<StudioBg3dResolvedDeviceQuality["profile"]>;
  /** Lazily initialized for legacy cache fixtures; profile-only stamps are not authorization. */
  admissionPolicyKeys?: Set<string>;
  readonly joints: readonly StudioBg3dThreeJointDescriptor[];
  readonly morphTargets: readonly StudioBg3dThreeMorphDescriptor[];
  readonly semanticMaterials: StudioBg3dSemanticMaterialClassificationResult;
  readonly genericHints: StudioGeneric3dManifestHints;
};

/**
 * Uploaded props receive the long-standing 2m auto-fit normalization. First-party environments
 * are authored and audited in metres, so shrinking their 7–16m footprint to 2m would turn doors,
 * furniture, and camera paths into miniature geometry.
 */
export function resolveStudioBg3dModelNormalizationScale(
  recordId: string,
  boundingSize: readonly [number, number, number],
): number {
  return isStudioBg3dEnvironmentAssetId(recordId)
    ? 1
    : computeAutoFitScale([...boundingSize] as [number, number, number]);
}

interface ModelBindingMaps {
  readonly attachmentByStorageModelId: Map<string, StudioBg3dModelAttachment>;
  readonly storageModelIdByAttachmentId: Map<string, string>;
}

function rightsMatchRecord(
  attachment: StudioBg3dModelAttachment,
  record: Bg3dVerifiedStoredRecord,
): boolean {
  return attachment.rights.status === record.rights.status
    && attachment.rights.commercialUse === record.rights.commercialUse
    && attachment.rights.attributionRequired === record.rights.attributionRequired
    && attachment.rights.attribution === record.rights.attribution
    && attachment.rights.licenseName === record.rights.licenseName;
}

export function attachmentMatchesRecord(
  attachment: StudioBg3dModelAttachment,
  record: Bg3dVerifiedStoredRecord,
): boolean {
  return attachment.hash === record.contentHash
    && attachment.byteSize === record.byteSize
    && attachment.mime === record.mime
    && rightsMatchRecord(attachment, record);
}

export function bindModelAttachment(
  maps: ModelBindingMaps,
  record: Bg3dVerifiedStoredRecord,
  attachment: StudioBg3dModelAttachment,
): boolean {
  if (!attachmentMatchesRecord(attachment, record) || attachment.id === record.id) return false;
  const existingAttachment = maps.attachmentByStorageModelId.get(record.id);
  const existingStorageId = maps.storageModelIdByAttachmentId.get(attachment.id);
  if (
    (existingAttachment && existingAttachment.id !== attachment.id)
    || (existingStorageId && existingStorageId !== record.id)
  ) return false;
  maps.attachmentByStorageModelId.set(record.id, attachment);
  maps.storageModelIdByAttachmentId.set(attachment.id, record.id);
  return true;
}

/** Writes sanitized generic-3D workflow metadata onto a scene-local attachment (fail-closed). */
export function withStudioGeneric3dWorkflowMetadata(
  attachment: StudioBg3dModelAttachment,
  meta: {
    readonly classification?: StudioGeneric3dClassification | null;
    readonly sourceFormat?: StudioGeneric3dSourceFormat | null;
  },
): StudioBg3dModelAttachment {
  return attachStudioGeneric3dWorkflowMetadata(
    { ...attachment },
    {
      ...(meta.classification != null ? { classification: meta.classification } : {}),
      ...(meta.sourceFormat != null ? { sourceFormat: meta.sourceFormat } : {}),
    },
  );
}

export function readGenericWorkflowMapsFromAttachments(
  attachmentByStorageModelId: ReadonlyMap<string, StudioBg3dModelAttachment>,
): {
  readonly sourceFormats: Map<string, StudioGeneric3dSourceFormat>;
  readonly classifications: Map<string, StudioGeneric3dClassification>;
} {
  const sourceFormats = new Map<string, StudioGeneric3dSourceFormat>();
  const classifications = new Map<string, StudioGeneric3dClassification>();
  for (const [storageId, attachment] of attachmentByStorageModelId) {
    const workflow = parseStudioGeneric3dWorkflowMetadata(attachment);
    if (!workflow) continue;
    if (workflow.sourceFormat) sourceFormats.set(storageId, workflow.sourceFormat);
    if (workflow.classification) classifications.set(storageId, workflow.classification);
  }
  return { sourceFormats, classifications };
}

type StudioBg3dModelAdmissionArgs = {
  readonly record: Bg3dVerifiedStoredRecord;
  readonly document: StudioBg3dSceneDocument;
  readonly quality: StudioBg3dResolvedDeviceQuality;
  readonly cumulativeUsedBytes: number;
  /** Either interactive backend; used only for KTX2 format selection and the anisotropy cap. */
  readonly renderer: StudioBg3dKtx2Renderer | null;
  readonly cache: Map<string, StudioBg3dModelRootCacheEntry>;
  readonly pending: Map<string, Promise<StudioBg3dModelRootCacheEntry>>;
  readonly isActive: () => boolean;
  readonly signal?: AbortSignal;
  /** Called only by the invocation that actually installs a newly decoded cache entry. */
  readonly onCacheEntryCreated?: (
    storageId: string,
    entry: StudioBg3dModelRootCacheEntry,
  ) => void;
};

export async function admitAndCacheStudioBg3dModel(
  args: StudioBg3dModelAdmissionArgs,
): Promise<StudioBg3dModelRootCacheEntry> {
  const requestedHighQuality = getStudio3dAssetQualityMode() === "high";
  try {
    return await admitAndCacheStudioBg3dModelInternal(args);
  } catch (error) {
    const cancelled = error instanceof StudioBg3dStaleModalOperationError
      || (typeof error === "object" && error !== null && (
        ("name" in error && error.name === "AbortError")
        || ("code" in error && error.code === "aborted")
      ));
    if (
      requestedHighQuality && getStudio3dAssetQualityMode() === "high"
      && !cancelled && !args.signal?.aborted && args.isActive()
    ) {
      resetStudio3dAssetQualityMode(
        "고품질 모델을 불러오지 못해 자동 모드로 돌아왔습니다. 경량본으로 다시 가져오세요.",
      );
    }
    throw error;
  }
}

async function admitAndCacheStudioBg3dModelInternal(
  args: StudioBg3dModelAdmissionArgs,
): Promise<StudioBg3dModelRootCacheEntry> {
  if (!args.isActive() || args.signal?.aborted) {
    throw new StudioBg3dStaleModalOperationError();
  }
  const policy = deriveStudioBg3dGlbValidationPolicy(args.document, args.quality);
  const selectedBudgets: StudioBg3dSceneBudgets = policy.budgets[policy.profile];
  const policyKey = JSON.stringify([policy.profile, selectedBudgets]);
  const isPolicyCurrent = () => {
    const current = deriveStudioBg3dGlbValidationPolicy(args.document, args.quality);
    return JSON.stringify([current.profile, current.budgets[current.profile]]) === policyKey;
  };
  const cached = args.cache.get(args.record.id);
  if (cached) {
    assertStudioBg3dModelPlacementAdmission({
      record: args.record,
      cachedRecord: cached.record,
      metrics: cached.metrics,
      budgets: selectedBudgets,
      cumulativeUsedBytes: args.cumulativeUsedBytes,
      maximumCumulativeBytes: selectedBudgets.complexity.maxModelBytes,
    });
    if (!cached.admissionPolicyKeys?.has(policyKey)) {
      await admitStoredBg3dModelForRendering(args.record.id, {
        profile: policy.profile,
        budgets: policy.budgets,
        cumulativeUsedBytes: args.cumulativeUsedBytes,
        maximumCumulativeBytes: selectedBudgets.complexity.maxModelBytes,
        signal: args.signal,
      });
      if (!args.isActive() || !isPolicyCurrent()) throw new StudioBg3dStaleModalOperationError();
      cached.admissionPolicyKeys ??= new Set<string>();
      cached.admissionPolicyKeys.add(policyKey);
      cached.admittedProfiles.add(policy.profile);
    }
    if (!args.isActive() || !isPolicyCurrent()) throw new StudioBg3dStaleModalOperationError();
    return cached;
  }
  const pending = args.pending.get(args.record.id);
  if (pending) {
    await pending;
    return admitAndCacheStudioBg3dModelInternal(args);
  }

  const task = studioBg3dGlobalAssetLoadGate.run(
    async (lease): Promise<StudioBg3dModelRootCacheEntry> => {
      lease.throwIfRevoked();
      const combinedSignal = combineStudioBg3dAbortSignals(
        args.signal ? [args.signal, lease.signal] : [lease.signal],
      );
      try {
        const verification = await admitStoredBg3dModelForRendering(args.record.id, {
          profile: policy.profile,
          budgets: policy.budgets,
          cumulativeUsedBytes: args.cumulativeUsedBytes,
          maximumCumulativeBytes: selectedBudgets.complexity.maxModelBytes,
          signal: combinedSignal.signal,
        });
        lease.throwIfRevoked();
        if (!args.isActive() || !isPolicyCurrent()) throw new StudioBg3dStaleModalOperationError();
        const loaded = await loadVerifiedStudioBg3dGlbWithThree(verification, selectedBudgets, {
          renderer: args.renderer,
        });
        if (!lease.isCurrent() || !args.isActive() || !isPolicyCurrent()) {
          if (loaded.ok) loaded.dispose();
          lease.throwIfRevoked();
          throw new StudioBg3dStaleModalOperationError();
        }
        if (!loaded.ok) throw new StudioBg3dThreeOperationError(loaded.code);
        assertStudioBg3dModelPlacementAdmission({
          record: args.record,
          metrics: loaded.metrics,
          budgets: selectedBudgets,
          cumulativeUsedBytes: args.cumulativeUsedBytes,
          maximumCumulativeBytes: selectedBudgets.complexity.maxModelBytes,
        });
        applyStudioBg3dRuntimeAssetQuality(loaded.root, {
          castShadow: args.quality.shadows,
          receiveShadow: args.quality.shadows,
          renderer: args.renderer,
          qualityBudget: args.quality.textureScale,
        });
        loaded.root.scale.setScalar(resolveStudioBg3dModelNormalizationScale(
          args.record.id,
          measureBg3dObjectSize(loaded.root),
        ));
        if (!lease.isCurrent() || !args.isActive() || !isPolicyCurrent()) {
          loaded.dispose();
          lease.throwIfRevoked();
          throw new StudioBg3dStaleModalOperationError();
        }
        const joints = collectStudioBg3dThreeJoints(loaded.root);
        const entry: StudioBg3dModelRootCacheEntry = {
          root: loaded.root,
          animations: loaded.animations,
          dispose: loaded.dispose,
          record: args.record,
          metrics: loaded.metrics,
          admittedProfiles: new Set([policy.profile]),
          admissionPolicyKeys: new Set([policyKey]),
          joints,
          morphTargets: collectStudioBg3dThreeMorphTargets(loaded.root),
          semanticMaterials: classifyStudioBg3dThreeSemanticMaterials(loaded.root),
          genericHints: inspectStudioGeneric3dRuntimeHints(loaded.root, joints),
        };
        if (!lease.isCurrent() || !args.isActive() || !isPolicyCurrent()) {
          entry.dispose();
          lease.throwIfRevoked();
          throw new StudioBg3dStaleModalOperationError();
        }
        args.cache.set(args.record.id, entry);
        args.onCacheEntryCreated?.(args.record.id, entry);
        return entry;
      } finally {
        combinedSignal.dispose();
      }
    },
    { isCurrent: args.isActive },
  );
  args.pending.set(args.record.id, task);
  try {
    return await task;
  } finally {
    if (args.pending.get(args.record.id) === task) args.pending.delete(args.record.id);
  }
}

export function disposeStudioBg3dModelCache(
  cache: Map<string, StudioBg3dModelRootCacheEntry>,
): void {
  for (const entry of cache.values()) entry.dispose();
  cache.clear();
}
