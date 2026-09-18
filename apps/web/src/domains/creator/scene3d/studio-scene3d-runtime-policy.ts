import type { StudioScene3dDocumentV1 } from "./studio-scene3d-document";

export type StudioScene3dPrimaryRenderer = "three-webgpu" | "three-webgl2";
export type StudioScene3dSpecialistRenderer = "babylon" | "playcanvas-gsplat";
export type StudioScene3dWorkload =
  | "character-detail"
  | "environment-compose"
  | "mixed-scene"
  | "webtoon-output";

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
    readonly gaussianSplatGpuSort: boolean;
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

export function resolveStudioScene3dRuntimePlan(
  capabilities: StudioScene3dDeviceCapabilities,
  needs: StudioScene3dRuntimeNeeds,
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

  if (needs.gaussianSplats) {
    specialists.push("playcanvas-gsplat");
    reasons.push("Gaussian Splat 장면은 PlayCanvas specialist renderer를 lazy-load합니다.");
  }
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
      mrt: capabilities.webgpu,
      gpuCompute: webgpuCompute,
      csm: true,
      taau: capabilities.webgpu,
      ssgi: capabilities.webgpu && memory !== "low",
      sss: capabilities.webgpu && memory !== "low",
      xpbd: needs.liveClothOrHair
        ? webgpuCompute
          ? "gpu"
          : memory === "low"
            ? "disabled"
            : "cpu"
        : "disabled",
      ktx2: capabilities.compressedTextureAstc || capabilities.compressedTextureBc || capabilities.compressedTextureEtc2,
      meshopt: true,
      gaussianSplatGpuSort: needs.gaussianSplats && webgpuCompute,
      // Upstream Three path-tracing is transitioning to WebGPU in 2026. Do not make an unstable
      // renderer the product authority; high-quality stills use deterministic raster SSAA until
      // the WebGPU path tracer has a stable release and our visual corpus passes it.
      progressiveStill: "raster-ssaa",
    }),
    qualityTier,
    reasons: Object.freeze(reasons),
  });
}
