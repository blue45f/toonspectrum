import type { StudioScene3dDocumentV1 } from "./studio-scene3d-document";

export type StudioScene3dPrimaryRenderer = "three-webgpu" | "three-webgl2";
export type StudioScene3dSpecialistRenderer =
  | "babylon"
  | "spark-gsplat"
  | "playcanvas-gsplat";
export type StudioScene3dWorkload =
  | "character-detail"
  | "environment-compose"
  | "mixed-scene"
  | "webtoon-output";

export type StudioScene3dGaussianSplatBackend =
  | "three-native"
  | "spark-specialist"
  | "playcanvas-specialist"
  | "unavailable";

export interface StudioScene3dSoftwareCapabilities {
  readonly tslNprRenderGraph: boolean;
  readonly csmShadows: boolean;
  readonly taau: boolean;
  readonly ssgi: boolean;
  readonly sss: boolean;
  readonly assetReleasePipeline: boolean;
  readonly renderBundles: boolean;
  readonly threeNativeGaussianSplat: boolean;
  readonly sparkGaussianSplat: boolean;
  readonly playcanvasGaussianSplat: boolean;
  readonly bvhWebGpuCompute: boolean;
  readonly gpuXpbd: boolean;
  readonly closedChainIk: boolean;
  readonly interactiveBvhCsg: boolean;
  readonly tiles3dStreaming: boolean;
  readonly recastNavigation: boolean;
  readonly libiglDeformation: boolean;
  readonly openSubdiv: boolean;
  readonly pathTracer: boolean;
}

/**
 * What the checked-in product can actually execute today.
 *
 * Candidate libraries never become product capability by merely appearing in architecture docs.
 * Flip a bit only in the same change that lands a gated runtime/provider and its verification.
 */
export const STUDIO_SCENE3D_CURRENT_SOFTWARE_CAPABILITIES:
  StudioScene3dSoftwareCapabilities = Object.freeze({
    tslNprRenderGraph: false,
    csmShadows: false,
    taau: false,
    ssgi: false,
    sss: false,
    assetReleasePipeline: false,
    renderBundles: false,
    threeNativeGaussianSplat: false,
    sparkGaussianSplat: false,
    playcanvasGaussianSplat: false,
    bvhWebGpuCompute: false,
    gpuXpbd: false,
    closedChainIk: false,
    interactiveBvhCsg: false,
    tiles3dStreaming: false,
    recastNavigation: false,
    libiglDeformation: false,
    openSubdiv: false,
    pathTracer: false,
  });

export interface StudioScene3dDeviceCapabilities {
  readonly webgpu: boolean;
  readonly webgl2: boolean;
  readonly computeShaders: boolean;
  readonly timestampQueries: boolean;
  readonly float16Shaders: boolean;
  readonly compressedTextureAstc: boolean;
  readonly compressedTextureBc: boolean;
  readonly compressedTextureEtc2: boolean;
  readonly maxTextureDimension2d: number;
  readonly deviceMemoryGiB: number | null;
}

export interface StudioScene3dRuntimeNeeds {
  readonly gaussianSplats: boolean;
  readonly specialistCadOrBim: boolean;
  readonly liveClothOrHair: boolean;
  readonly highQualityStill: boolean;
  /** 작업 목적에 따라 같은 GPU에서도 서로 다른 품질/성능 예산을 선택한다. */
  readonly workload?: StudioScene3dWorkload;
}

export interface StudioScene3dRuntimePlan {
  readonly primaryRenderer: StudioScene3dPrimaryRenderer;
  readonly specialists: readonly StudioScene3dSpecialistRenderer[];
  readonly workload: StudioScene3dWorkload;
  readonly budget: {
    readonly maxPixelRatio: number;
    readonly shadowMapSize: 512 | 1024 | 2048 | 4096;
    readonly maxVisibleDrawCalls: number;
    readonly textureBudgetMiB: number;
    /** 음수는 고품질 LOD를 오래 유지, 양수는 배경 규모를 위해 빠르게 낮은 LOD로 전환. */
    readonly lodBias: number;
    readonly secondaryMotionHz: 24 | 30 | 45 | 60;
  };
  readonly features: {
    readonly tsl: boolean;
    readonly mrt: boolean;
    readonly gpuCompute: boolean;
    readonly csm: boolean;
    readonly taau: boolean;
    readonly ssgi: boolean;
    readonly sss: boolean;
    readonly xpbd: "gpu" | "cpu" | "disabled";
    readonly ktx2: boolean;
    readonly meshopt: boolean;
    readonly gaussianSplatBackend: StudioScene3dGaussianSplatBackend;
    readonly gaussianSplatGpuSort: boolean;
    readonly renderBundles: boolean;
    readonly bvhQueries: "cpu" | "webgpu-compute";
    readonly advancedIk: "builtin" | "closed-chain";
    readonly interactiveCsg: "manifold-commit" | "bvh-preview-manifold-commit";
    readonly environmentStreaming: "none" | "3d-tiles";
    readonly navigation: "none" | "recast";
    readonly deformation: "builtin" | "libigl";
    readonly subdivision: "builtin" | "opensubdiv";
    readonly progressiveStill: "raster-ssaa" | "pathtracer-experimental";
  };
  readonly qualityTier: "ultra" | "high" | "balanced" | "compatibility";
  readonly reasons: readonly string[];
}

function memoryTier(capabilities: StudioScene3dDeviceCapabilities): "high" | "medium" | "low" {
  const memory = capabilities.deviceMemoryGiB;
  if (memory === null) return capabilities.maxTextureDimension2d >= 8192 ? "medium" : "low";
  if (memory >= 8) return "high";
  if (memory >= 4) return "medium";
  return "low";
}

export function inferStudioScene3dRuntimeNeeds(document: StudioScene3dDocumentV1): StudioScene3dRuntimeNeeds {
  const characterCount = document.entities.filter((entity) => entity.kind === "character").length;
  const environmentCount = document.entities.filter((entity) => entity.kind !== "character").length;
  const highQualityStill = document.output.width >= 2048 || document.output.height >= 2048;
  const lineOutput = document.output.semanticPasses.includes("line")
    && ["webtoon", "anime", "sketch"].includes(document.render.profile);
  const workload: StudioScene3dWorkload = highQualityStill && lineOutput
    ? "webtoon-output"
    : characterCount > 0 && environmentCount <= 2
      ? "character-detail"
      : characterCount === 0 && environmentCount > 0
        ? "environment-compose"
        : "mixed-scene";
  return Object.freeze({
    gaussianSplats: document.assets.some((asset) => asset.kind === "gaussian-splat"),
    specialistCadOrBim: false,
    liveClothOrHair: characterCount > 0,
    highQualityStill,
    workload,
  });
}

function resolveWorkloadBudget(
  workload: StudioScene3dWorkload,
  qualityTier: StudioScene3dRuntimePlan["qualityTier"],
): StudioScene3dRuntimePlan["budget"] {
  const compatibility = qualityTier === "compatibility";
  const balanced = qualityTier === "balanced";
  const ultra = qualityTier === "ultra";

  const workloadBudget = workload === "character-detail"
    ? { pixelRatio: 1.75, drawCalls: 450, textureMiB: 640, lodBias: -0.35, motionHz: 60 as const }
    : workload === "environment-compose"
      ? { pixelRatio: 1.25, drawCalls: 1200, textureMiB: 768, lodBias: 0.35, motionHz: 24 as const }
      : workload === "webtoon-output"
        ? { pixelRatio: 2, drawCalls: 900, textureMiB: 1024, lodBias: -0.5, motionHz: 60 as const }
        : { pixelRatio: 1.5, drawCalls: 800, textureMiB: 704, lodBias: 0, motionHz: 45 as const };

  const maxPixelRatio = compatibility
    ? 1
    : balanced
      ? Math.min(1.15, workloadBudget.pixelRatio)
      : ultra
        ? workloadBudget.pixelRatio
        : Math.min(1.5, workloadBudget.pixelRatio);
  const textureBudgetMiB = compatibility
    ? 192
    : balanced
      ? Math.min(320, workloadBudget.textureMiB)
      : ultra
        ? workloadBudget.textureMiB
        : Math.min(512, workloadBudget.textureMiB);
  const shadowMapSize: 512 | 1024 | 2048 | 4096 = compatibility
    ? 1024
    : workload === "webtoon-output" && ultra
      ? 4096
      : balanced
        ? 1024
        : 2048;
  const secondaryMotionHz: 24 | 30 | 45 | 60 = compatibility
    ? 30
    : balanced && workloadBudget.motionHz > 45
      ? 45
      : workloadBudget.motionHz;

  return Object.freeze({
    maxPixelRatio,
    shadowMapSize,
    maxVisibleDrawCalls: compatibility
      ? Math.min(500, workloadBudget.drawCalls)
      : balanced
        ? Math.min(650, workloadBudget.drawCalls)
        : workloadBudget.drawCalls,
    textureBudgetMiB,
    lodBias: compatibility
      ? Math.max(0.25, workloadBudget.lodBias)
      : balanced
        ? Math.max(0.1, workloadBudget.lodBias)
        : workloadBudget.lodBias,
    secondaryMotionHz,
  });
}

function resolveGaussianSplatBackend(input: {
  readonly needsSplat: boolean;
  readonly capabilities: StudioScene3dDeviceCapabilities;
  readonly software: StudioScene3dSoftwareCapabilities;
  readonly specialists: StudioScene3dSpecialistRenderer[];
  readonly reasons: string[];
}): StudioScene3dGaussianSplatBackend {
  if (!input.needsSplat) return "unavailable";

  if (input.capabilities.webgpu && input.software.threeNativeGaussianSplat) {
    input.reasons.push(
      "Gaussian Splat은 Three primary 안의 승인된 native path를 사용해 장면 authority를 분리하지 않습니다.",
    );
    return "three-native";
  }
  if (input.software.sparkGaussianSplat) {
    input.specialists.push("spark-gsplat");
    input.reasons.push(
      "Gaussian Splat은 승인된 Spark specialist를 명시적으로 사용하며 Scene3D authority는 Three에 유지합니다.",
    );
    return "spark-specialist";
  }
  if (input.software.playcanvasGaussianSplat) {
    input.specialists.push("playcanvas-gsplat");
    input.reasons.push(
      "Gaussian Splat은 승인된 PlayCanvas specialist를 명시적으로 사용하며 Scene3D authority는 Three에 유지합니다.",
    );
    return "playcanvas-specialist";
  }

  input.reasons.push(
    "Gaussian Splat 자산이 있지만 현재 제품에 admission을 통과한 실행 backend가 없어 출력 준비를 차단합니다.",
  );
  return "unavailable";
}

export function resolveStudioScene3dRuntimePlan(
  capabilities: StudioScene3dDeviceCapabilities,
  needs: StudioScene3dRuntimeNeeds,
  software: StudioScene3dSoftwareCapabilities =
    STUDIO_SCENE3D_CURRENT_SOFTWARE_CAPABILITIES,
): StudioScene3dRuntimePlan {
  if (!capabilities.webgpu && !capabilities.webgl2) {
    throw new Error("Studio 3D requires WebGPU or WebGL2.");
  }

  const primaryRenderer: StudioScene3dPrimaryRenderer = capabilities.webgpu
    ? "three-webgpu"
    : "three-webgl2";
  const webgpuCompute = capabilities.webgpu && capabilities.computeShaders;
  const memory = memoryTier(capabilities);
  const workload = needs.workload ?? "mixed-scene";
  const specialists: StudioScene3dSpecialistRenderer[] = [];
  const reasons: string[] = [];

  const gaussianSplatBackend = resolveGaussianSplatBackend({
    needsSplat: needs.gaussianSplats,
    capabilities,
    software,
    specialists,
    reasons,
  });

  if (needs.specialistCadOrBim) {
    specialists.push("babylon");
    reasons.push("CAD/BIM 전문 경로는 기존 Babylon specialist boundary를 사용합니다.");
  }
  if (!capabilities.webgpu) {
    reasons.push("WebGPU를 사용할 수 없어 Three WebGL2 compatibility renderer를 사용합니다.");
  }
  if (!webgpuCompute && needs.liveClothOrHair) {
    reasons.push("GPU compute가 없어 실시간 cloth/hair는 CPU 저비용 solver 또는 정적 결과로 강등합니다.");
  }

  const qualityTier = !capabilities.webgpu
    ? "compatibility"
    : memory === "high"
      ? "ultra"
      : memory === "medium"
        ? "high"
        : "balanced";
  const budget = resolveWorkloadBudget(workload, qualityTier);

  if (workload === "character-detail") {
    reasons.push("캐릭터 디테일 작업은 높은 근거리 LOD와 60Hz secondary motion을 우선합니다.");
  } else if (workload === "environment-compose") {
    reasons.push("대규모 배경 구성은 draw-call 수용량과 빠른 원거리 LOD 전환을 우선합니다.");
  } else if (workload === "webtoon-output") {
    reasons.push("웹툰 출력은 고정 해상도·고품질 그림자·근거리 LOD를 우선합니다.");
  }

  return Object.freeze({
    primaryRenderer,
    specialists: Object.freeze(specialists),
    workload,
    budget,
    features: Object.freeze({
      tsl: capabilities.webgpu,
      mrt: capabilities.webgpu && software.tslNprRenderGraph,
      gpuCompute: webgpuCompute,
      csm: software.csmShadows,
      taau: capabilities.webgpu && software.taau,
      ssgi: capabilities.webgpu && memory !== "low" && software.ssgi,
      sss: capabilities.webgpu && memory !== "low" && software.sss,
      xpbd: needs.liveClothOrHair
        ? webgpuCompute && software.gpuXpbd
          ? "gpu"
          : memory === "low"
            ? "disabled"
            : "cpu"
        : "disabled",
      ktx2: capabilities.compressedTextureAstc || capabilities.compressedTextureBc || capabilities.compressedTextureEtc2,
      meshopt: true,
      gaussianSplatBackend,
      gaussianSplatGpuSort: needs.gaussianSplats
        && webgpuCompute
        && gaussianSplatBackend !== "unavailable",
      renderBundles: capabilities.webgpu && software.renderBundles,
      bvhQueries: webgpuCompute && software.bvhWebGpuCompute
        ? "webgpu-compute"
        : "cpu",
      advancedIk: software.closedChainIk ? "closed-chain" : "builtin",
      interactiveCsg: software.interactiveBvhCsg
        ? "bvh-preview-manifold-commit"
        : "manifold-commit",
      environmentStreaming: software.tiles3dStreaming ? "3d-tiles" : "none",
      navigation: software.recastNavigation ? "recast" : "none",
      deformation: software.libiglDeformation ? "libigl" : "builtin",
      subdivision: software.openSubdiv ? "opensubdiv" : "builtin",
      progressiveStill: software.pathTracer && needs.highQualityStill && capabilities.webgpu
        ? "pathtracer-experimental"
        : "raster-ssaa",
    }),
    qualityTier,
    reasons: Object.freeze(reasons),
  });
}
