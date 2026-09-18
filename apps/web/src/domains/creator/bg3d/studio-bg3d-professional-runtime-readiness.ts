import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { StudioShared3dSceneSession } from "../studio-shared-3d-scene-bridge";
import type { StudioBg3dSharedCharacterGroundingReceipt } from "./studio-bg3d-shared-character-grounding";
import type { StudioBg3dDeviceSignals } from "./studio-bg3d-device-quality";
import type {
  StudioBg3dEngineSelectionPlan,
} from "./studio-bg3d-engine-selection";
import type { StudioBg3dWebGpuProbeResult } from "./studio-bg3d-webgpu-capability";
import type {
  StudioBg3dModelAttachment,
  StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import { tryAdaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";
import {
  createStudioScene3dAuthority,
  type StudioScene3dAuthoritySnapshot,
} from "../scene3d/studio-scene3d-authority";
import {
  buildStudioScene3dProfessionalPlan,
  type StudioScene3dProfessionalPlan,
} from "../scene3d/studio-scene3d-professional-plan";
import type {
  StudioScene3dAssetAdmissionEvidence,
} from "../scene3d/studio-scene3d-asset-admission";
import type {
  StudioScene3dDeviceCapabilities,
} from "../scene3d/studio-scene3d-runtime-policy";
import {
  planStudioScene3dRuntimeRecovery,
  type StudioScene3dRuntimeFailureKind,
  type StudioScene3dRuntimeRecoveryPlan,
} from "../scene3d/studio-scene3d-runtime-recovery";

export type StudioBg3dProfessionalRuntimeStatus = "ready" | "review" | "blocked";

export type StudioBg3dProfessionalRuntimeFailureCode =
  | "scene-adaptation-failed"
  | "scene-authority-failed"
  | "renderer-unavailable"
  | "professional-plan-failed";

export interface StudioBg3dProfessionalRuntimeSummary {
  readonly authorityId: string | null;
  readonly sourceHash: `sha256:${string}` | null;
  readonly documentRevision: number;
  readonly entityCount: number;
  readonly assetCount: number;
  readonly characterCount: number;
  readonly enabledPassCount: number;
  readonly specialistPassCount: number;
  readonly primaryRenderer: "three-webgpu" | "three-webgl2" | null;
  readonly qualityTier: "ultra" | "high" | "balanced" | "compatibility" | null;
}

export interface StudioBg3dProfessionalRuntimeReadiness {
  readonly status: StudioBg3dProfessionalRuntimeStatus;
  readonly failureCode: StudioBg3dProfessionalRuntimeFailureCode | null;
  readonly authority: StudioScene3dAuthoritySnapshot | null;
  readonly plan: StudioScene3dProfessionalPlan | null;
  readonly recovery: StudioScene3dRuntimeRecoveryPlan | null;
  readonly editorReady: boolean;
  readonly productionReady: boolean;
  readonly message: string;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly summary: StudioBg3dProfessionalRuntimeSummary;
}

export interface StudioBg3dProfessionalRuntimeFailureSignal {
  readonly kind: StudioScene3dRuntimeFailureKind;
  readonly attempt?: number;
  readonly recoverable?: boolean;
  readonly contextRestored?: boolean;
}

function positiveFinite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

export function deriveStudioBg3dProfessionalDeviceCapabilities(input: {
  readonly enginePlan: StudioBg3dEngineSelectionPlan;
  readonly webGpuProbe: StudioBg3dWebGpuProbeResult;
  readonly deviceSignals: StudioBg3dDeviceSignals;
  readonly maxTextureDimension2d?: number;
  readonly compressedTextureAstc?: boolean;
  readonly compressedTextureBc?: boolean;
  readonly compressedTextureEtc2?: boolean;
  readonly float16Shaders?: boolean;
}): StudioScene3dDeviceCapabilities {
  const available = input.enginePlan.status === "available";
  const webgpu = available
    && input.enginePlan.backend === "webgpu"
    && input.webGpuProbe.supported;
  const webgl2 = available && input.enginePlan.backend === "webgl2";
  return Object.freeze({
    webgpu,
    webgl2,
    computeShaders: webgpu && input.webGpuProbe.computeSupported,
    timestampQueries: webgpu && input.webGpuProbe.timestampQuerySupported,
    float16Shaders: webgpu && input.float16Shaders === true,
    compressedTextureAstc: input.compressedTextureAstc === true,
    compressedTextureBc: input.compressedTextureBc === true,
    compressedTextureEtc2: input.compressedTextureEtc2 === true,
    maxTextureDimension2d: positiveFinite(input.maxTextureDimension2d, 4096),
    deviceMemoryGiB: typeof input.deviceSignals.deviceMemoryGb === "number"
      && Number.isFinite(input.deviceSignals.deviceMemoryGb)
      && input.deviceSignals.deviceMemoryGb > 0
      ? input.deviceSignals.deviceMemoryGb
      : null,
  });
}

function summary(
  authority: StudioScene3dAuthoritySnapshot | null,
  plan: StudioScene3dProfessionalPlan | null,
  revision: number,
): StudioBg3dProfessionalRuntimeSummary {
  return Object.freeze({
    authorityId: authority?.authorityId ?? null,
    sourceHash: authority?.sourceHash ?? null,
    documentRevision: authority?.document.revision ?? revision,
    entityCount: authority?.document.entities.length ?? 0,
    assetCount: authority?.document.assets.length ?? 0,
    characterCount: authority?.characters.length ?? 0,
    enabledPassCount: plan?.renderGraph.passes.filter(({ enabled }) => enabled).length ?? 0,
    specialistPassCount: plan?.renderGraph.passes.filter(
      ({ enabled, executor }) => enabled && executor === "babylon-specialist",
    ).length ?? 0,
    primaryRenderer: plan?.renderGraph.runtimePlan.primaryRenderer ?? null,
    qualityTier: plan?.renderGraph.runtimePlan.qualityTier ?? null,
  });
}

function blocked(input: {
  readonly code: StudioBg3dProfessionalRuntimeFailureCode;
  readonly message: string;
  readonly revision: number;
  readonly authority?: StudioScene3dAuthoritySnapshot | null;
  readonly recovery?: StudioScene3dRuntimeRecoveryPlan | null;
  readonly blockers?: readonly string[];
  readonly warnings?: readonly string[];
}): StudioBg3dProfessionalRuntimeReadiness {
  const authority = input.authority ?? null;
  const blockers = input.blockers ?? Object.freeze([input.message]);
  return Object.freeze({
    status: "blocked" as const,
    failureCode: input.code,
    authority,
    plan: null,
    recovery: input.recovery ?? null,
    editorReady: false,
    productionReady: false,
    message: input.message,
    blockers: Object.freeze([...new Set(blockers)]),
    warnings: Object.freeze([...new Set(input.warnings ?? [])]),
    summary: summary(authority, null, input.revision),
  });
}

function recoveryFor(input: {
  readonly authority: StudioScene3dAuthoritySnapshot;
  readonly capabilities: StudioScene3dDeviceCapabilities;
  readonly failure: StudioBg3dProfessionalRuntimeFailureSignal | undefined;
}): StudioScene3dRuntimeRecoveryPlan | null {
  if (!input.failure) return null;
  return planStudioScene3dRuntimeRecovery({
    kind: input.failure.kind,
    selectedRuntime: input.capabilities.webgpu ? "three-webgpu" : "three-webgl2",
    attempt: Math.max(0, Math.floor(input.failure.attempt ?? 0)),
    documentId: input.authority.document.documentId,
    documentRevision: input.authority.document.revision,
    documentSourceHash: input.authority.sourceHash,
    recoverable: input.failure.recoverable ?? true,
    ...(input.failure.contextRestored === undefined
      ? {}
      : { contextRestored: input.failure.contextRestored }),
  });
}

export function resolveStudioBg3dProfessionalRuntimeReadiness(input: {
  readonly authorityId: string;
  readonly primitives: readonly BgPrimitive[];
  readonly customModels: readonly BgCustomModelInstance[];
  readonly attachmentByStorageModelId: ReadonlyMap<string, StudioBg3dModelAttachment>;
  readonly baseDocument: StudioBg3dSceneDocument;
  readonly sharedSceneSession?: StudioShared3dSceneSession | null;
  readonly viewportAspectRatio?: number;
  readonly revision: number;
  readonly capabilities: StudioScene3dDeviceCapabilities;
  readonly assetEvidenceById?: ReadonlyMap<string, StudioScene3dAssetAdmissionEvidence>;
  readonly groundingReceipts?: ReadonlyMap<string, StudioBg3dSharedCharacterGroundingReceipt>;
  readonly propContactElementIds?: ReadonlySet<string>;
  readonly linkedLayerRoundTripReady?: boolean;
  readonly babylonSpecialistAvailable?: boolean;
  readonly runtimeFailure?: StudioBg3dProfessionalRuntimeFailureSignal;
}): StudioBg3dProfessionalRuntimeReadiness {
  const adapted = tryAdaptStudioBg3dRuntimeToDocument({
    primitives: input.primitives,
    customModels: input.customModels,
    attachmentByStorageModelId: input.attachmentByStorageModelId,
    baseDocument: input.baseDocument,
  });
  if (!adapted.ok) {
    return blocked({
      code: "scene-adaptation-failed",
      message: "현재 BG3D 런타임을 손실 없는 canonical SceneDocument로 투영하지 못했습니다.",
      revision: input.revision,
    });
  }

  let authority: StudioScene3dAuthoritySnapshot;
  try {
    authority = createStudioScene3dAuthority({
      authorityId: input.authorityId,
      bg3d: adapted.value.document,
      sharedSceneSession: input.sharedSceneSession,
      viewportAspectRatio: input.viewportAspectRatio,
      revision: input.revision,
    });
  } catch {
    return blocked({
      code: "scene-authority-failed",
      message: "BG3D·DCC·VRM을 하나의 SceneDocument authority로 검증하지 못했습니다.",
      revision: input.revision,
    });
  }

  const recovery = recoveryFor({
    authority,
    capabilities: input.capabilities,
    failure: input.runtimeFailure,
  });
  if (!input.capabilities.webgpu && !input.capabilities.webgl2) {
    return blocked({
      code: "renderer-unavailable",
      message: "선택한 Three 렌더러가 준비되지 않아 전문 3D 편집을 시작하지 않았습니다.",
      revision: input.revision,
      authority,
      recovery,
      blockers: Object.freeze([
        "선택한 렌더러를 다시 시작하거나 명시적으로 다른 렌더러를 선택해야 합니다.",
      ]),
    });
  }

  let plan: StudioScene3dProfessionalPlan;
  try {
    plan = buildStudioScene3dProfessionalPlan({
      authority,
      capabilities: input.capabilities,
      evidenceByAssetId: input.assetEvidenceById,
      groundingReceipts: input.groundingReceipts,
      propContactElementIds: input.propContactElementIds,
      linkedLayerRoundTripReady: input.linkedLayerRoundTripReady,
      babylonSpecialistAvailable: input.babylonSpecialistAvailable,
    });
  } catch {
    return blocked({
      code: "professional-plan-failed",
      message: "전문 렌더·자산·캐릭터 제작 계획을 생성하지 못했습니다.",
      revision: input.revision,
      authority,
      recovery,
    });
  }

  const status: StudioBg3dProfessionalRuntimeStatus = plan.productionReady
    ? "ready"
    : plan.editorReady
      ? "review"
      : "blocked";
  const message = plan.productionReady
    ? "편집·자산·캐릭터·NPR 출력 계약이 모두 준비되었습니다."
    : plan.editorReady
      ? "편집기는 준비됐지만 출력 전 검토 항목이 남아 있습니다."
      : "선택한 런타임에서 전문 3D 편집을 시작할 수 없습니다.";
  return Object.freeze({
    status,
    failureCode: null,
    authority,
    plan,
    recovery,
    editorReady: plan.editorReady,
    productionReady: plan.productionReady,
    message,
    blockers: plan.blockers,
    warnings: plan.warnings,
    summary: summary(authority, plan, input.revision),
  });
}
