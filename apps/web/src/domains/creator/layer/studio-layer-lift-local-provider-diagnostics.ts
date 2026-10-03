/**
 * Foreground confidence and diagnostics analysis for the local Scene Layer
 * Lift provider. Extracted from `studio-layer-lift-local-provider` without
 * behavior change: these are pure functions over the prepared mask, the
 * request, and the normalized mask options.
 */
import type {
  StudioSceneLayerLiftConfidence,
  StudioSceneLayerLiftDiagnostic,
  StudioSceneLayerLiftRequest,
} from "./studio-layer-lift-contract";
import type { StudioLayerLiftPreparedMask } from "./studio-layer-lift-mask";

/** Structural subset of the provider's normalized analyze options. */
export interface StudioLayerLiftForegroundAnalysisOptions {
  readonly threshold: number;
  readonly feather: number;
}

/** Structural subset of the provider's subject profile used for messages. */
export interface StudioLayerLiftForegroundDiagnosticMessages {
  readonly fallbackDiagnosticMessage: string;
  readonly lowConfidenceDiagnosticMessage: string;
}

function confidenceBand(score: number): StudioSceneLayerLiftConfidence["band"] {
  if (score < 0.5) return "low";
  if (score < 0.8) return "medium";
  return "high";
}

export function foregroundConfidence(
  prepared: StudioLayerLiftPreparedMask,
): StudioSceneLayerLiftConfidence {
  let weightedConfidence = 0;
  let matteWeight = 0;
  for (let index = 0; index < prepared.matte.alpha.length; index += 1) {
    const weight = prepared.matte.alpha[index]!;
    weightedConfidence += prepared.confidence.confidence[index]! * weight;
    matteWeight += weight;
  }
  const rawScore = matteWeight > 0 ? weightedConfidence / matteWeight : 0;
  const score = Number(Math.max(0, Math.min(1, rawScore)).toFixed(6));
  return Object.freeze({ score, band: confidenceBand(score) });
}

function boundaryTouchesCanvas(prepared: StudioLayerLiftPreparedMask): boolean {
  const { width, height, alpha } = prepared.matte;
  for (let x = 0; x < width; x += 1) {
    if (alpha[x]! > 0 || alpha[(height - 1) * width + x]! > 0) return true;
  }
  for (let y = 1; y < height - 1; y += 1) {
    if (alpha[y * width]! > 0 || alpha[y * width + width - 1]! > 0) {
      return true;
    }
  }
  return false;
}

function ambiguityCoverage(
  prepared: StudioLayerLiftPreparedMask,
  options: StudioLayerLiftForegroundAnalysisOptions,
): number {
  const radius = Math.max(0.05, options.feather / 2);
  let visiblePixels = 0;
  let ambiguousPixels = 0;
  for (let index = 0; index < prepared.confidence.confidence.length; index += 1) {
    if (prepared.foregroundAlpha.alpha[index] === 0) continue;
    visiblePixels += 1;
    if (
      Math.abs(
        prepared.confidence.confidence[index]! - options.threshold,
      ) <= radius
    ) {
      ambiguousPixels += 1;
    }
  }
  return visiblePixels > 0 ? ambiguousPixels / visiblePixels : 0;
}

export function buildStudioLayerLiftForegroundDiagnostics(
  request: StudioSceneLayerLiftRequest,
  layerId: string,
  confidence: StudioSceneLayerLiftConfidence,
  prepared: StudioLayerLiftPreparedMask,
  options: StudioLayerLiftForegroundAnalysisOptions,
  profile: StudioLayerLiftForegroundDiagnosticMessages,
): readonly StudioSceneLayerLiftDiagnostic[] {
  const result: StudioSceneLayerLiftDiagnostic[] = [];
  if (
    request.requestedRoles.some(
      (role) => role !== "character" && role !== "foreground",
    )
  ) {
    result.push(Object.freeze({
      code: "PROVIDER_FALLBACK",
      severity: "warning",
      layerId,
      message: profile.fallbackDiagnosticMessage,
    }));
  }
  if (confidence.band === "low") {
    result.push(Object.freeze({
      code: "LOW_CONFIDENCE",
      severity: "warning",
      layerId,
      message: profile.lowConfidenceDiagnosticMessage,
    }));
  }
  if (ambiguityCoverage(prepared, options) >= 0.02) {
    result.push(Object.freeze({
      code: "AMBIGUOUS_REGION",
      severity: "warning",
      layerId,
      message: "전경 경계에 신뢰도가 비슷한 영역이 있어 검수가 필요합니다.",
    }));
  }
  if (boundaryTouchesCanvas(prepared)) {
    result.push(Object.freeze({
      code: "PARTIAL_BOUNDARY",
      severity: "warning",
      layerId,
      message: "전경이 원본 가장자리에 닿아 일부 경계가 잘렸을 수 있습니다.",
    }));
  }
  return Object.freeze(result);
}
