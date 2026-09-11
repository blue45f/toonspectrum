export const STUDIO_BG3D_INSERT_MIN_HEIGHT = 2_160;
export const STUDIO_BG3D_INSERT_MAX_EDGE = 4_096;
export const STUDIO_BG3D_INSERT_MIN_EDGE = 256;
export const STUDIO_BG3D_INSERT_MIN_DIMENSION = 64;

const STUDIO_BG3D_INSERT_MAX_ASPECT_ERROR = 0.005;

export type StudioBg3dInsertQualityTier = "constrained" | "production" | "ultra";

export interface StudioBg3dInsertQualityPlanInput {
  readonly exportHeight: number;
  readonly aspectRatio: number;
  readonly deviceMaxPixels: number;
  readonly rendererMaxPixels: number;
}

export interface StudioBg3dInsertQualityPlan {
  readonly requestedHeight: number;
  readonly expectedWidth: number;
  readonly expectedHeight: number;
  readonly maxPixels: number;
  readonly qualityTier: StudioBg3dInsertQualityTier;
  /** Ratio between the ideal production frame and the budgeted render frame. */
  readonly budgetScale: number;
}

export class StudioBg3dInsertQualityPolicyError extends Error {
  constructor(
    readonly code: "INVALID_INPUT" | "PIXEL_BUDGET_TOO_SMALL",
    message: string,
  ) {
    super(message);
    this.name = "StudioBg3dInsertQualityPolicyError";
  }
}

function assertFinitePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new StudioBg3dInsertQualityPolicyError(
      "INVALID_INPUT",
      `${name} 값은 0보다 큰 유한수여야 합니다.`,
    );
  }
}

function aspectError(width: number, height: number, aspectRatio: number): number {
  return Math.abs(width / height - aspectRatio);
}

function improveRoundedAspectRatio(
  width: number,
  height: number,
  roundedWidth: number,
  roundedHeight: number,
): { readonly width: number; readonly height: number } {
  const aspectRatio = width / height;
  const initialError = aspectError(roundedWidth, roundedHeight, aspectRatio);
  if (initialError <= STUDIO_BG3D_INSERT_MAX_ASPECT_ERROR) {
    return Object.freeze({ width: roundedWidth, height: roundedHeight });
  }

  const landscape = aspectRatio >= 1;
  const initialLongestEdge = landscape ? roundedWidth : roundedHeight;
  const minimumLongestEdge = Math.max(
    STUDIO_BG3D_INSERT_MIN_DIMENSION,
    initialLongestEdge - STUDIO_BG3D_INSERT_MIN_DIMENSION,
  );

  let bestWidth = roundedWidth;
  let bestHeight = roundedHeight;
  let bestError = initialError;

  for (let longestEdge = initialLongestEdge - 1; longestEdge >= minimumLongestEdge; longestEdge -= 1) {
    const candidateWidth = landscape
      ? longestEdge
      : Math.max(STUDIO_BG3D_INSERT_MIN_DIMENSION, Math.round(longestEdge * aspectRatio));
    const candidateHeight = landscape
      ? Math.max(STUDIO_BG3D_INSERT_MIN_DIMENSION, Math.round(longestEdge / aspectRatio))
      : longestEdge;

    if (
      candidateWidth > STUDIO_BG3D_INSERT_MAX_EDGE ||
      candidateHeight > STUDIO_BG3D_INSERT_MAX_EDGE
    ) {
      continue;
    }

    const candidateError = aspectError(candidateWidth, candidateHeight, aspectRatio);
    if (candidateError < bestError) {
      bestWidth = candidateWidth;
      bestHeight = candidateHeight;
      bestError = candidateError;
      if (candidateError === 0) break;
    }
  }

  return Object.freeze({ width: bestWidth, height: bestHeight });
}

function fitInsideMaximumEdge(
  width: number,
  height: number,
): { readonly width: number; readonly height: number } {
  const scale = Math.min(1, STUDIO_BG3D_INSERT_MAX_EDGE / Math.max(width, height));
  const roundedWidth = Math.max(
    STUDIO_BG3D_INSERT_MIN_DIMENSION,
    Math.round(width * scale),
  );
  const roundedHeight = Math.max(
    STUDIO_BG3D_INSERT_MIN_DIMENSION,
    Math.round(height * scale),
  );

  return improveRoundedAspectRatio(width, height, roundedWidth, roundedHeight);
}

/**
 * Resolves the persisted output-pixel contract for a 3D scene inserted into the 2D canvas.
 *
 * Display DPR is deliberately not an input: the same scene/document must produce the same
 * pixels on 1x and retina displays. The policy preserves the document aspect ratio inside a
 * 4096px edge and scales uniformly to the strictest renderer/device pixel budget.
 */
export function resolveStudioBg3dInsertQualityPlan(
  input: StudioBg3dInsertQualityPlanInput,
): StudioBg3dInsertQualityPlan {
  assertFinitePositive("exportHeight", input.exportHeight);
  assertFinitePositive("aspectRatio", input.aspectRatio);
  assertFinitePositive("deviceMaxPixels", input.deviceMaxPixels);
  assertFinitePositive("rendererMaxPixels", input.rendererMaxPixels);

  const maxPixels = Math.floor(Math.min(input.deviceMaxPixels, input.rendererMaxPixels));
  const minimumPixels = STUDIO_BG3D_INSERT_MIN_EDGE ** 2;
  if (maxPixels < minimumPixels) {
    throw new StudioBg3dInsertQualityPolicyError(
      "PIXEL_BUDGET_TOO_SMALL",
      `3D 캡처 픽셀 예산은 최소 ${minimumPixels.toLocaleString()}px이어야 합니다.`,
    );
  }

  const idealHeight = Math.min(
    STUDIO_BG3D_INSERT_MAX_EDGE,
    Math.max(STUDIO_BG3D_INSERT_MIN_HEIGHT, Math.round(input.exportHeight)),
  );
  const ideal = fitInsideMaximumEdge(idealHeight * input.aspectRatio, idealHeight);
  const idealPixels = ideal.width * ideal.height;
  const budgetScale = Math.min(1, Math.sqrt(maxPixels / idealPixels));
  const expected = fitInsideMaximumEdge(
    ideal.width * budgetScale,
    ideal.height * budgetScale,
  );

  const longestEdge = Math.max(expected.width, expected.height);
  const qualityTier: StudioBg3dInsertQualityTier =
    budgetScale < 0.75
      ? "constrained"
      : longestEdge >= 3_840 && expected.width * expected.height >= 7_000_000
        ? "ultra"
        : "production";

  return Object.freeze({
    requestedHeight: expected.height,
    expectedWidth: expected.width,
    expectedHeight: expected.height,
    maxPixels,
    qualityTier,
    budgetScale,
  });
}
