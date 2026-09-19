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
import {
  buildStudioScene3dEvolutionPlan,
  type StudioScene3dEvolutionPlan,
} from "./studio-scene3d-platform-evolution";
import {
  STUDIO_SCENE3D_CURRENT_SOFTWARE_CAPABILITIES,
  type StudioScene3dDeviceCapabilities,
  type StudioScene3dSoftwareCapabilities,
} from "./studio-scene3d-runtime-policy";

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
  readonly evolution: StudioScene3dEvolutionPlan;
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
  readonly software?: StudioScene3dSoftwareCapabilities;
  readonly evidenceByAssetId?: ReadonlyMap<string, StudioScene3dAssetAdmissionEvidence>;
  readonly requestedPasses?: readonly StudioScene3dNprPassId[];
  readonly fx?: StudioScene3dNprFxRequest;
  readonly babylonSpecialistAvailable?: boolean;
  readonly groundingReceipts?: ReadonlyMap<string, StudioBg3dSharedCharacterGroundingReceipt>;
  readonly propContactElementIds?: ReadonlySet<string>;
  readonly linkedLayerRoundTripReady?: boolean;
}): StudioScene3dProfessionalPlan {
  const software = input.software ?? STUDIO_SCENE3D_CURRENT_SOFTWARE_CAPABILITIES;
  const assets = assetReadiness(
    input.authority,
    input.evidenceByAssetId ?? new Map(),
  );
  const renderGraph = buildStudioScene3dNprRenderGraph({
    document: input.authority.document,
    capabilities: input.capabilities,
    software,
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
  const evolution = buildStudioScene3dEvolutionPlan({
    document: input.authority.document,
    runtimePlan: renderGraph.runtimePlan,
    software,
  });

  const blockers = assets.flatMap(({ blockers }) => blockers);
  for (const asset of assets) {
    if (asset.status === "review") {
      blockers.push(`자산 ${asset.label}은 production 승격 전 품질·성능 검토가 필요합니다.`);
    }
  }
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
  if (
    input.authority.document.assets.some(({ kind }) => kind === "gaussian-splat")
    && renderGraph.runtimePlan.features.gaussianSplatBackend === "unavailable"
  ) {
    blockers.push(
      "Gaussian Splat 자산이 있지만 검증·승격된 runtime provider가 없어 전문 출력을 만들 수 없습니다.",
    );
  }

  const requestedRender = input.authority.document.render;
  const admittedRender = renderGraph.runtimePlan.features;
  if (requestedRender.antialiasing === "taa" && !admittedRender.taa) {
    blockers.push("이 장면은 TAA를 요청하지만 제품에 승격된 TAA runtime이 없습니다.");
  }
  if (requestedRender.antialiasing === "taau" && !admittedRender.taau) {
    blockers.push("이 장면은 TAAU를 요청하지만 제품에 승격된 TAAU runtime이 없습니다.");
  }
  if (
    requestedRender.shadows.enabled
    && requestedRender.shadows.mode === "vsm"
    && !admittedRender.vsm
  ) {
    blockers.push("이 장면은 VSM 그림자를 요청하지만 제품에 승격된 VSM runtime이 없습니다.");
  }
  if (
    requestedRender.shadows.enabled
    && requestedRender.shadows.mode === "csm"
    && !admittedRender.csm
  ) {
    blockers.push("이 장면은 CSM 그림자를 요청하지만 제품에 승격된 CSM runtime이 없습니다.");
  }
  if (requestedRender.effects.ssgi && !admittedRender.ssgi) {
    blockers.push("이 장면은 SSGI를 요청하지만 제품에 승격된 SSGI runtime이 없습니다.");
  }
  if (requestedRender.effects.sss && !admittedRender.sss) {
    blockers.push("이 장면은 SSS를 요청하지만 제품에 승격된 SSS runtime이 없습니다.");
  }
  if (requestedRender.effects.bloom && !admittedRender.bloom) {
    blockers.push("이 장면은 Bloom을 요청하지만 제품에 승격된 Bloom runtime이 없습니다.");
  }
  if (requestedRender.effects.depthOfField && !admittedRender.depthOfField) {
    blockers.push("이 장면은 DoF를 요청하지만 제품에 승격된 DoF runtime이 없습니다.");
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
    evolution,
    productionReady: editorReady && blockers.length === 0,
    editorReady,
    blockers: Object.freeze([...new Set(blockers)]),
    warnings: Object.freeze([...new Set(warnings)]),
  });
}
