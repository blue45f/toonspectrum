import type { StudioScene3dDocumentV1 } from "./studio-scene3d-document";
import type {
  StudioScene3dRuntimePlan,
  StudioScene3dSoftwareCapabilities,
} from "./studio-scene3d-runtime-policy";

export type StudioScene3dEvolutionCandidateId =
  | "tsl-npr-render-graph"
  | "asset-release-pipeline"
  | "webgpu-render-bundles"
  | "bvh-webgpu-compute"
  | "gpu-xpbd"
  | "three-native-gsplat"
  | "closed-chain-ik"
  | "three-bvh-csg-preview"
  | "tiles3d-streaming"
  | "spark-gsplat"
  | "playcanvas-supersplat"
  | "recast-navigation"
  | "libigl-deformation"
  | "opensubdiv"
  | "pathtraced-still";

export type StudioScene3dEvolutionMaturity =
  | "next"
  | "evaluate"
  | "research";

export type StudioScene3dEvolutionHost =
  | "three-primary"
  | "worker-kernel"
  | "specialist-renderer"
  | "offline-toolchain"
  | "solver";

export type StudioScene3dPromotionGate =
  | "renderer-neutral-authority"
  | "golden-visual-parity"
  | "capture-contract"
  | "webgpu-webgl-compatibility"
  | "mobile-browser"
  | "input-p95-100ms"
  | "frame-budget"
  | "bundle-budget"
  | "memory-stability"
  | "resource-disposal"
  | "30-minute-soak"
  | "device-loss-recovery"
  | "asset-round-trip"
  | "license-review";

export interface StudioScene3dEvolutionCandidate {
  readonly id: StudioScene3dEvolutionCandidateId;
  readonly label: string;
  readonly maturity: StudioScene3dEvolutionMaturity;
  readonly host: StudioScene3dEvolutionHost;
  readonly packageCandidates: readonly string[];
  readonly authorityPolicy: string;
  readonly goal: string;
  readonly gates: readonly StudioScene3dPromotionGate[];
}

export interface StudioScene3dEvolutionCandidateState
  extends StudioScene3dEvolutionCandidate {
  readonly applicable: boolean;
  readonly admitted: boolean;
  readonly reason: string;
}

export interface StudioScene3dEvolutionPlan {
  readonly version: 1;
  readonly candidates: readonly StudioScene3dEvolutionCandidateState[];
  readonly next: readonly StudioScene3dEvolutionCandidateState[];
  readonly evaluate: readonly StudioScene3dEvolutionCandidateState[];
  readonly research: readonly StudioScene3dEvolutionCandidateState[];
}

const BASE_GATES = Object.freeze([
  "renderer-neutral-authority",
  "golden-visual-parity",
  "capture-contract",
  "memory-stability",
  "resource-disposal",
  "30-minute-soak",
] as const satisfies readonly StudioScene3dPromotionGate[]);

function gates(
  ...extra: readonly StudioScene3dPromotionGate[]
): readonly StudioScene3dPromotionGate[] {
  return Object.freeze([...BASE_GATES, ...extra]);
}

/**
 * Long-term Scene3D technology ledger.
 *
 * This is deliberately not an import registry. A package listed here is not product support.
 * Product code may only import a candidate after its own gated provider/runtime is implemented and
 * the corresponding software capability is explicitly admitted.
 */
export const STUDIO_SCENE3D_EVOLUTION_CANDIDATES:
  readonly StudioScene3dEvolutionCandidate[] = Object.freeze([
    Object.freeze({
      id: "tsl-npr-render-graph",
      label: "Three WebGPU / TSL NPR RenderGraph",
      maturity: "next",
      host: "three-primary",
      packageCandidates: Object.freeze(["three"]),
      authorityPolicy: "Three keeps scene ownership; render passes consume immutable Scene3D state.",
      goal: "MRT beauty/depth/normal/ID/velocity 기반 CSM·line·tone·SSGI·SSS·TAAU를 실제 pixel pipeline으로 승격",
      gates: gates("webgpu-webgl-compatibility", "frame-budget", "device-loss-recovery"),
    }),
    Object.freeze({
      id: "asset-release-pipeline",
      label: "LOD + Meshopt + KTX2 production asset pipeline",
      maturity: "next",
      host: "offline-toolchain",
      packageCandidates: Object.freeze([
        "@gltf-transform/core",
        "@gltf-transform/functions",
        "meshoptimizer/gltfpack",
      ]),
      authorityPolicy: "Source assets remain canonical; optimized derivatives are content-addressed runtime artifacts.",
      goal: "모든 production mesh에 LOD·geometry compression·KTX2·GPU budget receipt를 기본 강제",
      gates: gates("asset-round-trip", "mobile-browser"),
    }),
    Object.freeze({
      id: "webgpu-render-bundles",
      label: "WebGPU static render bundles",
      maturity: "next",
      host: "three-primary",
      packageCandidates: Object.freeze(["three"]),
      authorityPolicy: "Bundle residency is transient; Scene3D entities and transforms remain canonical.",
      goal: "정적 배경 subtree의 draw submission을 WebGPU render bundle로 묶어 대형 장면 CPU 비용을 줄임",
      gates: gates("frame-budget", "bundle-budget", "device-loss-recovery"),
    }),
    Object.freeze({
      id: "bvh-webgpu-compute",
      label: "WebGPU BVH batch queries",
      maturity: "next",
      host: "worker-kernel",
      packageCandidates: Object.freeze(["three-mesh-bvh"]),
      authorityPolicy: "BVH remains an acceleration derivative; selections and Surface Ink anchors stay canonical.",
      goal: "surface paint/contact/lasso/placement의 대량 공간 질의를 WebGPU batch compute로 가속",
      gates: gates("webgpu-webgl-compatibility", "input-p95-100ms", "frame-budget"),
    }),
    Object.freeze({
      id: "gpu-xpbd",
      label: "WebGPU XPBD hair / cloth",
      maturity: "next",
      host: "worker-kernel",
      packageCandidates: Object.freeze(["three", "WebGPU compute"]),
      authorityPolicy: "Documents persist XPBD parameters and attachments, never GPU buffers.",
      goal: "현재 CPU XPBD와 같은 constraint 계약을 GPU compute로 실행해 헤어·의상 secondary motion 고도화",
      gates: gates("webgpu-webgl-compatibility", "frame-budget", "device-loss-recovery"),
    }),
    Object.freeze({
      id: "three-native-gsplat",
      label: "Three native Gaussian Splat",
      maturity: "next",
      host: "three-primary",
      packageCandidates: Object.freeze(["three"]),
      authorityPolicy: "Splat is a Scene3D entity rendered by Three; no second persistent scene authority.",
      goal: "Three 업그레이드 후 native/KHR gaussian splat path를 우선 검증해 specialist renderer 필요성을 최소화",
      gates: gates("webgpu-webgl-compatibility", "frame-budget", "bundle-budget"),
    }),
    Object.freeze({
      id: "closed-chain-ik",
      label: "Generalized closed-chain IK",
      maturity: "next",
      host: "solver",
      packageCandidates: Object.freeze(["closed-chain-ik-js"]),
      authorityPolicy: "Solver outputs bounded pose commands; CharacterDocument remains pose authority.",
      goal: "양손 소품·발 고정·골반·손바닥 접촉을 동시에 푸는 generalized IK를 golden pose corpus로 검증",
      gates: gates("input-p95-100ms", "asset-round-trip"),
    }),
    Object.freeze({
      id: "three-bvh-csg-preview",
      label: "Interactive BVH CSG preview",
      maturity: "evaluate",
      host: "solver",
      packageCandidates: Object.freeze(["three-bvh-csg", "manifold-3d"]),
      authorityPolicy: "BVH CSG is preview-only; Manifold remains robust canonical boolean commit.",
      goal: "drag 중 Boolean preview 지연을 줄이고 pointer-up에서 Manifold 결과로 확정",
      gates: gates("input-p95-100ms", "asset-round-trip"),
    }),
    Object.freeze({
      id: "tiles3d-streaming",
      label: "3D Tiles environment streaming",
      maturity: "evaluate",
      host: "three-primary",
      packageCandidates: Object.freeze(["3d-tiles-renderer"]),
      authorityPolicy: "Tile residency is transient; Scene3D stores a stable environment asset reference.",
      goal: "도시·대형 건축 배경을 screen-space-error 기반으로 스트리밍하고 메모리 residency를 제한",
      gates: gates("mobile-browser", "frame-budget", "bundle-budget"),
    }),
    Object.freeze({
      id: "spark-gsplat",
      label: "Spark Gaussian Splat specialist",
      maturity: "evaluate",
      host: "specialist-renderer",
      packageCandidates: Object.freeze(["@sparkjsdev/spark"]),
      authorityPolicy: "Specialist receives immutable splat assets and camera state; Three retains scene authority.",
      goal: "대형 splat progressive streaming/LOD가 native Three보다 유의미하게 나을 때만 승격",
      gates: gates("frame-budget", "bundle-budget", "license-review"),
    }),
    Object.freeze({
      id: "playcanvas-supersplat",
      label: "PlayCanvas / SuperSplat specialist",
      maturity: "evaluate",
      host: "specialist-renderer",
      packageCandidates: Object.freeze(["playcanvas", "SuperSplat"]),
      authorityPolicy: "Never owns React state or Scene3D persistence; isolated splat render/capture only.",
      goal: "GPU sort·projection·culling·compaction이 대형 캡처 배경에서 측정 우위를 보일 때 제한 도입",
      gates: gates("frame-budget", "bundle-budget", "license-review"),
    }),
    Object.freeze({
      id: "recast-navigation",
      label: "Recast / Detour navigation",
      maturity: "evaluate",
      host: "worker-kernel",
      packageCandidates: Object.freeze(["recast-navigation-js"]),
      authorityPolicy: "Navigation mesh is a derivative; multiplayer position authority remains outside the renderer.",
      goal: "향후 3D Virtual Studio의 navmesh·pathfinding·crowd를 Three/Rapier와 분리",
      gates: gates("input-p95-100ms", "mobile-browser", "bundle-budget"),
    }),
    Object.freeze({
      id: "libigl-deformation",
      label: "libigl deformation specialist",
      maturity: "evaluate",
      host: "worker-kernel",
      packageCandidates: Object.freeze(["libigl WASM"]),
      authorityPolicy: "ARAP/biharmonic results become bounded mesh/morph commands; native handles never persist.",
      goal: "얼굴·체형·의상 fit의 단순 scale 변형을 ARAP/biharmonic 정밀 변형으로 보강",
      gates: gates("asset-round-trip", "license-review"),
    }),
    Object.freeze({
      id: "opensubdiv",
      label: "OpenSubdiv specialist",
      maturity: "evaluate",
      host: "worker-kernel",
      packageCandidates: Object.freeze(["OpenSubdiv WASM"]),
      authorityPolicy: "Subdivision surfaces are generated derivatives; control topology stays canonical.",
      goal: "얼굴·바디·의상 authoring과 고품질 preview의 subdivision 품질을 단계적으로 승격",
      gates: gates("asset-round-trip", "frame-budget", "license-review"),
    }),
    Object.freeze({
      id: "pathtraced-still",
      label: "Experimental WebGPU path-traced still",
      maturity: "research",
      host: "specialist-renderer",
      packageCandidates: Object.freeze(["three-gpu-pathtracer"]),
      authorityPolicy: "Never replaces the interactive renderer; output is an explicit opt-in still-render job.",
      goal: "안정 릴리스와 material corpus가 준비된 뒤 최종 고품질 참고 렌더/조명 검증에 한정",
      gates: gates("golden-visual-parity", "bundle-budget", "license-review"),
    }),
  ]);

function unreachableCandidate(value: never): never {
  throw new Error(`Unhandled Scene3D evolution candidate: ${String(value)}`);
}

function admitted(
  id: StudioScene3dEvolutionCandidateId,
  software: StudioScene3dSoftwareCapabilities,
): boolean {
  switch (id) {
    case "tsl-npr-render-graph":
      return software.tslNprRenderGraph;
    case "asset-release-pipeline":
      return software.assetReleasePipeline;
    case "webgpu-render-bundles":
      return software.renderBundles;
    case "bvh-webgpu-compute":
      return software.bvhWebGpuCompute;
    case "gpu-xpbd":
      return software.gpuXpbd;
    case "three-native-gsplat":
      return software.threeNativeGaussianSplat;
    case "closed-chain-ik":
      return software.closedChainIk;
    case "three-bvh-csg-preview":
      return software.interactiveBvhCsg;
    case "tiles3d-streaming":
      return software.tiles3dStreaming;
    case "spark-gsplat":
      return software.sparkGaussianSplat;
    case "playcanvas-supersplat":
      return software.playcanvasGaussianSplat;
    case "recast-navigation":
      return software.recastNavigation;
    case "libigl-deformation":
      return software.libiglDeformation;
    case "opensubdiv":
      return software.openSubdiv;
    case "pathtraced-still":
      return software.pathTracer;
    default:
      return unreachableCandidate(id);
  }
}

function applicability(
  candidate: StudioScene3dEvolutionCandidate,
  document: StudioScene3dDocumentV1,
  runtimePlan: StudioScene3dRuntimePlan,
): { readonly applicable: boolean; readonly reason: string } {
  const hasCharacter = document.entities.some(({ kind }) => kind === "character");
  const hasSplat = document.entities.some(({ kind }) => kind === "gaussian-splat")
    || document.assets.some(({ kind }) => kind === "gaussian-splat");
  const environmentEntities = document.entities.filter(({ kind }) =>
    kind === "model" || kind === "primitive" || kind === "gaussian-splat"
  ).length;
  const highQualityStill = document.output.width >= 2048 || document.output.height >= 2048;

  switch (candidate.id) {
    case "tsl-npr-render-graph":
      return {
        applicable: runtimePlan.primaryRenderer === "three-webgpu",
        reason: runtimePlan.primaryRenderer === "three-webgpu"
          ? "현재 WebGPU primary에서 계획된 NPR pass를 실제 GPU graph로 내릴 수 있습니다."
          : "WebGL2 compatibility 세션에서는 TSL/WebGPU 승격을 적용하지 않습니다.",
      };
    case "asset-release-pipeline":
      return {
        applicable: document.assets.some(({ kind }) => kind !== "gaussian-splat"),
        reason: "Production mesh/character asset은 LOD·압축·GPU budget derivative가 필요합니다.",
      };
    case "webgpu-render-bundles":
      return {
        applicable: runtimePlan.primaryRenderer === "three-webgpu"
          && environmentEntities > 0,
        reason: runtimePlan.primaryRenderer === "three-webgpu" && environmentEntities > 0
          ? "정적 배경 subtree의 CPU draw submission을 줄일 수 있습니다."
          : "WebGPU 배경 장면이 아니면 render bundle 이득이 없습니다.",
      };
    case "bvh-webgpu-compute":
      return {
        applicable: runtimePlan.features.gpuCompute && document.entities.length > 0,
        reason: "대량 surface/contact/selection query가 있는 WebGPU 장면에서 후보입니다.",
      };
    case "gpu-xpbd":
    case "closed-chain-ik":
    case "libigl-deformation":
    case "opensubdiv":
      return {
        applicable: hasCharacter,
        reason: hasCharacter
          ? "캐릭터 pose/deformation/secondary-motion 품질을 높이는 후보입니다."
          : "캐릭터가 없는 장면에서는 우선순위가 낮습니다.",
      };
    case "three-native-gsplat":
    case "spark-gsplat":
    case "playcanvas-supersplat":
      return {
        applicable: hasSplat,
        reason: hasSplat
          ? "Gaussian Splat entity가 있어 backend 품질·성능 비교가 필요합니다."
          : "Splat 자산이 없는 장면에서는 로드하지 않습니다.",
      };
    case "three-bvh-csg-preview":
      return {
        applicable: document.entities.some(({ kind }) => kind === "model" || kind === "primitive"),
        reason: "Interactive modeling/Boolean preview가 필요한 mesh 장면에서 후보입니다.",
      };
    case "tiles3d-streaming":
      return {
        applicable: environmentEntities >= 32 || runtimePlan.workload === "environment-compose",
        reason: "대형 구조화 배경에서 resident geometry를 제한하기 위한 후보입니다.",
      };
    case "recast-navigation":
      return {
        applicable: environmentEntities > 0,
        reason: "3D Virtual Studio/agent 이동을 장면 렌더러와 분리할 때 사용합니다.",
      };
    case "pathtraced-still":
      return {
        applicable: highQualityStill,
        reason: highQualityStill
          ? "2K 이상 명시 출력에서만 실험적인 still renderer를 비교합니다."
          : "일반 preview에는 path tracing을 사용하지 않습니다.",
      };
    default:
      return unreachableCandidate(candidate.id);
  }
}

export function buildStudioScene3dEvolutionPlan(input: {
  readonly document: StudioScene3dDocumentV1;
  readonly runtimePlan: StudioScene3dRuntimePlan;
  readonly software: StudioScene3dSoftwareCapabilities;
}): StudioScene3dEvolutionPlan {
  const candidates = STUDIO_SCENE3D_EVOLUTION_CANDIDATES.map((candidate) => {
    const match = applicability(candidate, input.document, input.runtimePlan);
    return Object.freeze({
      ...candidate,
      applicable: match.applicable,
      admitted: admitted(candidate.id, input.software),
      reason: match.reason,
    });
  });
  const applicable = (maturity: StudioScene3dEvolutionMaturity) =>
    Object.freeze(candidates.filter((candidate) =>
      candidate.maturity === maturity && candidate.applicable
    ));
  return Object.freeze({
    version: 1 as const,
    candidates: Object.freeze(candidates),
    next: applicable("next"),
    evaluate: applicable("evaluate"),
    research: applicable("research"),
  });
}
