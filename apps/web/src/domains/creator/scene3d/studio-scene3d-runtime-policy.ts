import type { StudioScene3dDocumentV1 } from "./studio-scene3d-document";

export type StudioScene3dPrimaryRenderer = "three-webgpu" | "three-webgl2";
export type StudioScene3dSpecialistRenderer = "babylon" | "playcanvas-gsplat";

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
}

export interface StudioScene3dRuntimePlan {
  readonly primaryRenderer: StudioScene3dPrimaryRenderer;
  readonly specialists: readonly StudioScene3dSpecialistRenderer[];
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
  return Object.freeze({
    gaussianSplats: document.assets.some((asset) => asset.kind === "gaussian-splat"),
    specialistCadOrBim: false,
    liveClothOrHair: document.entities.some((entity) => entity.kind === "character"),
    highQualityStill: document.output.width >= 2048 || document.output.height >= 2048,
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

  return Object.freeze({
    primaryRenderer,
    specialists: Object.freeze(specialists),
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
