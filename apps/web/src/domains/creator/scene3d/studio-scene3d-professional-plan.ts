import {
  evaluateStudioScene3dAssetAdmission,
  type StudioScene3dAssetAdmissionEvidence,
  type StudioScene3dAssetAdmissionResult,
} from "./studio-scene3d-asset-admission";
import type { StudioScene3dAuthoritySnapshot } from "./studio-scene3d-authority";
import {
  planStudioScene3dCharacterPerformance,
  type StudioScene3dCharacterPerformancePlan,
} from "./studio-scene3d-character-performance";
import {
  buildStudioScene3dNprRenderGraph,
  type StudioScene3dNprFxRequest,
  type StudioScene3dNprPassId,
  type StudioScene3dNprRenderGraph,
} from "./studio-scene3d-npr-render-graph";
import type { StudioScene3dDeviceCapabilities } from "./studio-scene3d-runtime-policy";

import type { StudioBg3dSharedCharacterGroundingReceipt } from "../bg3d/studio-bg3d-shared-character-grounding";

export interface StudioScene3dProfessionalAssetReadiness {
  readonly assetId: string;
  readonly label: string;
  readonly result: StudioScene3dAssetAdmissionResult | null;
  readonly status: "production" | "review" | "reject" | "missing-evidence";
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

export interface StudioScene3dProfessionalPlan {
  readonly version: 1;
  readonly authorityId: string;
  readonly sourceHash: `sha256:${string}`;
  readonly documentRevision: number;
  readonly assets: readonly StudioScene3dProfessionalAssetReadiness[];
  readonly renderGraph: StudioScene3dNprRenderGraph;
  readonly characters: StudioScene3dCharacterPerformancePlan;
  readonly productionReady: boolean;
  readonly editorReady: boolean;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}
function assetReadiness(
  authority: StudioScene3dAuthoritySnapshot,
  evidenceByAssetId: ReadonlyMap<string, StudioScene3dAssetAdmissionEvidence>,
): readonly StudioScene3dProfessionalAssetReadiness[] {
  return Object.freeze(authority.document.assets.map((asset) => {
    const evidence = evidenceByAssetId.get(asset.id);
    if (!evidence) {
      return Object.freeze({
        assetId: asset.id,
        label: asset.uri,
        result: null,
        status: "missing-evidence" as const,
        blockers: Object.freeze([
          "실제 렌더 golden view·LOD·압축·GPU 예산 admission receipt가 없습니다.",
        ]),
        warnings: Object.freeze([]),
      });
    }
    const result = evaluateStudioScene3dAssetAdmission(asset, evidence);
    return Object.freeze({
      assetId: asset.id,
      label: asset.uri,
      result,
      status: result.status,
      blockers: result.blockers,
      warnings: result.warnings,
    });
  }));
}

export function buildStudioScene3dProfessionalPlan(input: {
  readonly authority: StudioScene3dAuthoritySnapshot;
  readonly capabilities: StudioScene3dDeviceCapabilities;
  readonly evidenceByAssetId?: ReadonlyMap<string, StudioScene3dAssetAdmissionEvidence>;
  readonly requestedPasses?: readonly StudioScene3dNprPassId[];
  readonly fx?: StudioScene3dNprFxRequest;
  readonly babylonSpecialistAvailable?: boolean;
  readonly groundingReceipts?: ReadonlyMap<string, StudioBg3dSharedCharacterGroundingReceipt>;
  readonly propContactElementIds?: ReadonlySet<string>;
  readonly linkedLayerRoundTripReady?: boolean;
}): StudioScene3dProfessionalPlan {
  const assets = assetReadiness(
    input.authority,
    input.evidenceByAssetId ?? new Map(),
  );
  const renderGraph = buildStudioScene3dNprRenderGraph({
    document: input.authority.document,
    capabilities: input.capabilities,
    requestedPasses: input.requestedPasses,
    fx: input.fx,
    babylonSpecialistAvailable: input.babylonSpecialistAvailable,
  });
  const characters = planStudioScene3dCharacterPerformance({
    authority: input.authority,
    groundingReceipts: input.groundingReceipts,
    propContactElementIds: input.propContactElementIds,
    requireGrounding: input.authority.characters.length > 0,
    requireContact: input.authority.characters.length > 0,
  });
  const blockers = assets.flatMap(({ blockers }) => blockers);
  if (characters.blockedCount > 0) {
    blockers.push(...characters.entries.flatMap(({ warnings }) => warnings));
  }
  if (
    input.authority.document.activeCameraId === "" ||
    !input.authority.document.cameras.some(
      ({ id }) => id === input.authority.document.activeCameraId,
    )
  ) {
    blockers.push("활성 카메라가 SceneDocument에 없습니다.");
  }
  if (
    input.linkedLayerRoundTripReady === false &&
    input.authority.bg3d.activeShotId !== null
  ) {
    blockers.push("현재 Shot의 Linked 3D Layer round-trip receipt가 준비되지 않았습니다.");
  }
  const warnings = [
    ...assets.flatMap(({ warnings: assetWarnings }) => assetWarnings),
    ...renderGraph.warnings,
    ...characters.warnings,
  ];
  const editorReady = renderGraph.runtimePlan.primaryRenderer === "three-webgpu"
    || renderGraph.runtimePlan.primaryRenderer === "three-webgl2";
  return Object.freeze({
    version: 1 as const,
    authorityId: input.authority.authorityId,
    sourceHash: input.authority.sourceHash,
    documentRevision: input.authority.document.revision,
    assets,
    renderGraph,
    characters,
    productionReady: editorReady && blockers.length === 0,
    editorReady,
    blockers: Object.freeze([...new Set(blockers)]),
    warnings: Object.freeze([...new Set(warnings)]),
  });
}
