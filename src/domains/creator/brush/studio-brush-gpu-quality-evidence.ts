import {
  STUDIO_BRUSH_GPU_QUALITY_EVIDENCE,
  STUDIO_BRUSH_GPU_QUALITY_EVIDENCE_SCHEMA_VERSION,
} from "./studio-brush-gpu-quality-evidence.generated";

export { STUDIO_BRUSH_GPU_QUALITY_EVIDENCE };

const approved = new Set(STUDIO_BRUSH_GPU_QUALITY_EVIDENCE.approvedBrushIds);

/** Automatic GPU rollout is fail-closed and brush-specific. */
export function studioBrushGpuQualityEvidenceAllows(
  brushCatalogId: unknown,
): boolean {
  return STUDIO_BRUSH_GPU_QUALITY_EVIDENCE.schemaVersion
      === STUDIO_BRUSH_GPU_QUALITY_EVIDENCE_SCHEMA_VERSION
    && typeof STUDIO_BRUSH_GPU_QUALITY_EVIDENCE.generatedAt === "string"
    && typeof STUDIO_BRUSH_GPU_QUALITY_EVIDENCE.sourceCommit === "string"
    && typeof STUDIO_BRUSH_GPU_QUALITY_EVIDENCE.benchmarkDigest === "string"
    && typeof brushCatalogId === "string"
    && brushCatalogId.length > 0
    && approved.has(brushCatalogId);
}
