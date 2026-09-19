import type { StudioScene3dAssetReference } from "./studio-scene3d-document";

export interface StudioScene3dAssetVisualEvidence {
  readonly goldenViewIds: readonly string[];
  readonly silhouetteScore: number;
  readonly materialScore: number;
  readonly deformationScore: number;
  readonly compositionScore: number;
  readonly severeIntersectionCount: number;
  readonly thumbnailWidth: number;
  readonly thumbnailHeight: number;
}

export interface StudioScene3dAssetTechnicalEvidence {
  readonly lodCount: number;
  readonly trianglesByLod: readonly number[];
  readonly drawCalls: number;
  readonly materialCount: number;
  readonly textureCount: number;
  readonly maxTextureDimension: number;
  readonly geometryCompression: "meshopt" | "draco" | "none";
  readonly textureCompression: "ktx2" | "avif" | "webp" | "none";
  readonly gpuBytesEstimate: number;
}

export interface StudioScene3dAssetAdmissionEvidence {
  readonly visual: StudioScene3dAssetVisualEvidence;
  readonly technical: StudioScene3dAssetTechnicalEvidence;
}

export interface StudioScene3dAssetAdmissionResult {
  readonly status: "production" | "review" | "reject";
  readonly score: number;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

function finiteScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + finiteScore(value), 0) / values.length;
}

function requiresLods(asset: StudioScene3dAssetReference): boolean {
  return asset.kind === "character" || asset.kind === "mesh";
}

function finitePositiveTriangleCount(value: number | undefined): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value > 0;
}

function inspectLodEvidence(
  technical: StudioScene3dAssetTechnicalEvidence,
): {
  readonly validCount: number;
  readonly strictlyDecreasing: boolean;
  readonly reductionRatio: number | null;
} {
  const declaredCount = Number.isSafeInteger(technical.lodCount)
    ? Math.max(0, technical.lodCount)
    : 0;
  const samples = technical.trianglesByLod
    .slice(0, declaredCount)
    .filter(finitePositiveTriangleCount);
  const strictlyDecreasing = samples.length === declaredCount
    && samples.every((triangles, index) => index === 0 || triangles < samples[index - 1]!);
  const reductionRatio = samples.length >= 2 && samples[0]! > 0
    ? samples[samples.length - 1]! / samples[0]!
    : null;
  return Object.freeze({
    validCount: samples.length,
    strictlyDecreasing,
    reductionRatio,
  });
}

export function evaluateStudioScene3dAssetAdmission(
  asset: StudioScene3dAssetReference,
  evidence: StudioScene3dAssetAdmissionEvidence,
): StudioScene3dAssetAdmissionResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const visual = evidence.visual;
  const technical = evidence.technical;
  const lodEvidence = inspectLodEvidence(technical);

  if (!asset.quality.accepted || asset.quality.score < 95) {
    blockers.push("production 품질 승인이 95점 이상이 아닙니다.");
  }
  if (!asset.rights.commercialUse || !asset.rights.redistribution || !asset.rights.derivativeUse) {
    blockers.push("상업 이용·재배포·파생 제작 권리가 모두 확인되지 않았습니다.");
  }
  if (visual.goldenViewIds.length < 6) {
    blockers.push("실제 렌더 golden view가 6개 미만입니다.");
  }
  if (visual.severeIntersectionCount > 0) {
    blockers.push("캐릭터/의상/헤어/소품의 심각한 관통이 남아 있습니다.");
  }
  if (finiteScore(visual.silhouetteScore) < 95) {
    blockers.push("실루엣 품질 점수가 95 미만입니다.");
  }
  if (finiteScore(visual.materialScore) < 92) {
    blockers.push("머티리얼/텍스처 품질 점수가 92 미만입니다.");
  }
  if (finiteScore(visual.deformationScore) < 92) {
    blockers.push("포즈/변형 품질 점수가 92 미만입니다.");
  }
  if (Math.max(visual.thumbnailWidth, visual.thumbnailHeight) < 512) {
    blockers.push("실제 렌더 썸네일의 긴 변이 512px 미만입니다.");
  }

  const hasValidLodCount = Number.isSafeInteger(technical.lodCount) && technical.lodCount >= 0;
  if (!hasValidLodCount) {
    blockers.push("LOD 단계 수 측정값이 유효하지 않습니다.");
  }
  if (requiresLods(asset) && (!hasValidLodCount || technical.lodCount < 3)) {
    blockers.push("근·중·원거리 3단계 LOD가 없습니다.");
  }
  if (
    requiresLods(asset)
    && hasValidLodCount
    && lodEvidence.validCount < Math.max(3, technical.lodCount)
  ) {
    blockers.push("LOD 선언과 실제 삼각형 증거가 일치하지 않습니다.");
  }
  if (requiresLods(asset) && technical.lodCount >= 3 && !lodEvidence.strictlyDecreasing) {
    blockers.push("LOD별 삼각형 수가 근거리에서 원거리로 엄격히 감소하지 않습니다.");
  }
  if (
    requiresLods(asset)
    && lodEvidence.reductionRatio !== null
    && lodEvidence.reductionRatio > 0.5
  ) {
    warnings.push("최원거리 LOD가 LOD0의 50%를 초과해 실제 스트리밍/렌더 절감 효과가 작습니다.");
  }
  if (!Number.isFinite(technical.gpuBytesEstimate) || technical.gpuBytesEstimate <= 0) {
    blockers.push("GPU 메모리 추정치가 유효한 양수로 측정되지 않았습니다.");
  }
  if (!Number.isSafeInteger(technical.drawCalls) || technical.drawCalls < 0) {
    blockers.push("draw call 측정값이 유효하지 않습니다.");
  }
  if (!Number.isSafeInteger(technical.materialCount) || technical.materialCount < 0) {
    blockers.push("머티리얼 수 측정값이 유효하지 않습니다.");
  }
  if (!Number.isSafeInteger(technical.textureCount) || technical.textureCount < 0) {
    blockers.push("텍스처 수 측정값이 유효하지 않습니다.");
  }
  if (!Number.isSafeInteger(technical.maxTextureDimension) || technical.maxTextureDimension < 0) {
    blockers.push("최대 텍스처 크기 측정값이 유효하지 않습니다.");
  }
  if (technical.textureCount > 0 && technical.textureCompression !== "ktx2") {
    blockers.push("GPU texture가 KTX2/Basis production 경로를 사용하지 않습니다.");
  }
  if (asset.kind !== "gaussian-splat" && technical.geometryCompression === "none") {
    blockers.push("meshoptimizer/Draco geometry compression receipt가 없습니다.");
  }
  if (technical.maxTextureDimension > 4096) {
    warnings.push("4K를 넘는 텍스처는 mobile/중간 품질 derivative가 필요합니다.");
  }
  if (technical.drawCalls > 120) {
    warnings.push("단일 asset draw call이 120을 초과합니다.");
  }

  const visualScore = average([
    visual.silhouetteScore,
    visual.materialScore,
    visual.deformationScore,
    visual.compositionScore,
  ]);
  const technicalScore = average([
    !requiresLods(asset)
      ? 100
      : lodEvidence.validCount >= 3 && lodEvidence.strictlyDecreasing
        ? 100
        : Math.min(90, lodEvidence.validCount * 30),
    technical.geometryCompression !== "none" || asset.kind === "gaussian-splat" ? 100 : 75,
    technical.textureCount === 0 || technical.textureCompression === "ktx2" ? 100 : 80,
    technical.drawCalls <= 80 ? 100 : technical.drawCalls <= 120 ? 90 : 70,
    technical.maxTextureDimension <= 4096 ? 100 : 85,
  ]);
  const score = Math.round(visualScore * 0.72 + technicalScore * 0.18 + finiteScore(asset.quality.score) * 0.1);

  return Object.freeze({
    status: blockers.length > 0 ? "reject" : warnings.length > 0 || score < 95 ? "review" : "production",
    score,
    blockers: Object.freeze(blockers),
    warnings: Object.freeze(warnings),
  });
}
