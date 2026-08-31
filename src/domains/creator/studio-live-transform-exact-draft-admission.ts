/**
 * Main-thread work admission for exact, model-backed transform frames.
 *
 * A latest-frame rAF mailbox limits frequency, not the cost of one frame. Studio documents admit
 * up to 100k stroke samples, while exact presentation currently transforms all points, resolves a
 * panel clip, replans one renderer and rasterizes it on the UI thread. Letting an unbounded stroke
 * enter that path turns a transform handle into a long task. This policy is deliberately
 * conservative and renderer-aware: a rejected frame keeps the authoritative source visible and
 * still commits once at release; it never falls back to a visually different affine preview.
 *
 * These are admission ceilings, not document limits. They leave headroom inside an 8ms CPU target
 * before React/Konva paint. The long-term lane is a worker/GPU ephemeral surface and, ultimately,
 * a durable first-class object matrix; raising these constants requires measured p95 evidence.
 */

import { studioDrawObjectTransformScale } from "./brush/studio-draw-object-transform";

import type { StudioDrawObjectTransformBounds } from "./brush/studio-draw-object-transform";

export const STUDIO_LIVE_TRANSFORM_EXACT_MAX_CAUSAL_DABS = 2_048;
export const STUDIO_LIVE_TRANSFORM_EXACT_MAX_CAUSAL_SAMPLES = 2_048;
export const STUDIO_LIVE_TRANSFORM_EXACT_MAX_CAUSAL_DAB_AREA = 4_000_000;
export const STUDIO_LIVE_TRANSFORM_EXACT_MAX_STROKE_WIDTH = 512;
/** Shared UI-thread path-operation ceiling; one causal dab is the established work primitive. */
export const STUDIO_LIVE_TRANSFORM_EXACT_MAX_RENDERER_PATH_COMMANDS =
  STUDIO_LIVE_TRANSFORM_EXACT_MAX_CAUSAL_DABS;
/** A quadratic path command serializes at most four numeric coordinate fields. */
export const STUDIO_LIVE_TRANSFORM_EXACT_MAX_RENDERER_SCALAR_WORK =
  STUDIO_LIVE_TRANSFORM_EXACT_MAX_RENDERER_PATH_COMMANDS * 4 + 2;
/** Reuse the established 4M backing-pixel paint ceiling rather than introducing a new tuning cap. */
export const STUDIO_LIVE_TRANSFORM_EXACT_MAX_BACKING_PIXELS =
  STUDIO_LIVE_TRANSFORM_EXACT_MAX_CAUSAL_DAB_AREA;
export const STUDIO_LIVE_TRANSFORM_EXACT_MAX_CALLIGRAPHY_SAMPLES = 256;
export const STUDIO_LIVE_TRANSFORM_EXACT_MAX_PERFECT_SAMPLES = 2_048;
export const STUDIO_LIVE_TRANSFORM_EXACT_MAX_GENERIC_SAMPLES = 1_024;
export const STUDIO_LIVE_TRANSFORM_EXACT_MAX_GENERIC_PATH_LENGTH = 4_096;
export const STUDIO_LIVE_TRANSFORM_EXACT_MAX_SCENE_ELEMENTS = 2_048;

export interface StudioLiveTransformExactDraftComplexity {
  readonly rendererEngine?: string;
  readonly sampleCount: number;
  readonly pathLength: number;
  readonly strokeWidth: number;
  /** Exact causal engine radius at pressure=1 after alias diameter mapping, in document pixels. */
  readonly causalMaxDabRadius?: number;
  /** Renderer-expanded coordinate production/serialization, compiled once at gesture begin. */
  readonly rendererExpandedScalarWork?: number;
  /** Upper bound on emitted Canvas/SVG path operations, compiled from renderer structure. */
  readonly rendererPathCommandUpperBound?: number;
  /** Maximum renderer paint radius around the source centre line, in document pixels. */
  readonly rendererMaxPaintRadius?: number;
}

export type StudioLiveTransformExactDraftAdmission =
  | {
      readonly admitted: true;
      readonly lane: "causal-dabs" | "calligraphy-ribbon" | "perfect-outline" | "generic";
      readonly estimatedWork: number;
    }
  | {
      readonly admitted: false;
      readonly reason: "invalid" | "scene-budget" | "renderer-budget";
      readonly estimatedWork: number;
    };

export interface StudioLiveTransformExactDraftAdmissionInput {
  readonly complexity: StudioLiveTransformExactDraftComplexity;
  readonly sourceBounds: StudioDrawObjectTransformBounds;
  readonly targetBounds: StudioDrawObjectTransformBounds;
  readonly sceneElementCount: number;
  /** Document pixel to backing-store pixel scale, including Stage zoom and canvas DPR. */
  readonly rasterScale: number;
  /** Full current Layer SceneCanvas backing store cleared by one synchronous `drawScene()`. */
  readonly sceneCanvasBackingPixels: number;
}

function rejected(
  reason: Extract<StudioLiveTransformExactDraftAdmission, { admitted: false }>["reason"],
  estimatedWork = Number.POSITIVE_INFINITY,
): StudioLiveTransformExactDraftAdmission {
  return { admitted: false, reason, estimatedWork };
}

/**
 * A pre-rotation target rectangle always fits inside a square whose side is its diagonal. Expanding
 * that square by the renderer's maximum radius on both sides therefore bounds every rotated fill
 * AABB without reading points in the frame loop. `rasterScale` converts the result to the actual
 * zoom×DPR backing store that Canvas must shade.
 */
function rendererBackingPixelFootprint(
  targetBounds: StudioDrawObjectTransformBounds,
  rendererRadius: number,
  rasterScale: number,
): number {
  const centerlineSide = Math.hypot(targetBounds.width, targetBounds.height);
  const backingSide = (centerlineSide + rendererRadius * 2) * rasterScale;
  return backingSide * backingSide;
}

/** O(1) frame decision over complexity facts compiled once at gesture begin. */
export function admitStudioLiveTransformExactDraft(
  input: StudioLiveTransformExactDraftAdmissionInput,
): StudioLiveTransformExactDraftAdmission {
  const {
    rendererEngine,
    sampleCount,
    pathLength,
    strokeWidth,
    causalMaxDabRadius,
    rendererExpandedScalarWork,
    rendererPathCommandUpperBound,
    rendererMaxPaintRadius,
  } = input.complexity;
  const expandedVectorRenderer = rendererEngine === "calligraphy-segments"
    || rendererEngine === "perfect-outline";
  if (
    !Number.isSafeInteger(sampleCount)
    || sampleCount < 0
    || !Number.isFinite(pathLength)
    || pathLength < 0
    || !Number.isFinite(strokeWidth)
    || strokeWidth < 0
    || !Number.isSafeInteger(input.sceneElementCount)
    || input.sceneElementCount < 0
    || !Number.isFinite(input.rasterScale)
    || input.rasterScale <= 0
    || !Number.isFinite(input.sceneCanvasBackingPixels)
    || input.sceneCanvasBackingPixels < 0
    || (
      rendererEngine === "causal-ink"
      && (
        causalMaxDabRadius === undefined
        || !Number.isFinite(causalMaxDabRadius)
        || causalMaxDabRadius < 0
      )
    )
    || (
      expandedVectorRenderer
      && (
        rendererExpandedScalarWork === undefined
        || !Number.isSafeInteger(rendererExpandedScalarWork)
        || rendererExpandedScalarWork < 0
        || rendererPathCommandUpperBound === undefined
        || !Number.isSafeInteger(rendererPathCommandUpperBound)
        || rendererPathCommandUpperBound < 0
        || rendererMaxPaintRadius === undefined
        || !Number.isFinite(rendererMaxPaintRadius)
        || rendererMaxPaintRadius < 0
      )
    )
  ) {
    return rejected("invalid");
  }
  if (input.sceneElementCount > STUDIO_LIVE_TRANSFORM_EXACT_MAX_SCENE_ELEMENTS) {
    return rejected("scene-budget", input.sceneElementCount);
  }
  // Every admitted retained or exact model frame ends in Layer.drawScene(). Konva's default
  // clearBeforeDraw clears the full SceneCanvas before object-local rasterization, so a tiny AABB
  // on a large Retina canvas is still a large frame. getWidth/getHeight are backing dimensions;
  // this comparison is O(1), includes DPR, and fails closed before renderer-specific work.
  if (input.sceneCanvasBackingPixels > STUDIO_LIVE_TRANSFORM_EXACT_MAX_BACKING_PIXELS) {
    return rejected("renderer-budget", input.sceneCanvasBackingPixels);
  }
  const scale = studioDrawObjectTransformScale(input.sourceBounds, input.targetBounds);
  if (!scale) return rejected("invalid");
  const transformedPathLength = pathLength * Math.max(scale.scaleX, scale.scaleY);
  if (!Number.isFinite(transformedPathLength)) return rejected("invalid");
  const transformedStrokeWidth = strokeWidth * scale.uniformEquivalent;
  if (
    !Number.isFinite(transformedStrokeWidth)
    || transformedStrokeWidth > STUDIO_LIVE_TRANSFORM_EXACT_MAX_STROKE_WIDTH
  ) {
    return rejected("renderer-budget", transformedStrokeWidth);
  }

  if (rendererEngine === "causal-ink") {
    // Every non-empty causal segment emits AT LEAST one dab, even when it is shorter than 0.5px.
    // Summing only totalLength / 0.5 under-counts a highly subdivided path. For each segment,
    // ceil(distance / spacing) <= 1 + distance / 0.5, so samples + ceil(totalLength / 0.5) is a
    // conservative O(1) upper bound for legacy and residual planners alike.
    const upperDabs = sampleCount === 0
      ? 0
      : sampleCount + Math.ceil(transformedPathLength / 0.5);
    // Path length alone is not a bound on planner work: an imported/adversarial stroke may carry
    // 100k duplicate or sub-pixel samples while spanning almost no distance. The transform and
    // causal planner still visit every sample, so both independent dimensions must fit.
    const estimatedWork = Math.max(sampleCount, upperDabs);
    const radius = causalMaxDabRadius! * scale.uniformEquivalent;
    const backingRadius = radius * input.rasterScale;
    const estimatedDabArea = upperDabs * Math.PI * backingRadius * backingRadius;
    const transformedFootprintDiameter = radius * 2;
    return sampleCount <= STUDIO_LIVE_TRANSFORM_EXACT_MAX_CAUSAL_SAMPLES
      && upperDabs <= STUDIO_LIVE_TRANSFORM_EXACT_MAX_CAUSAL_DABS
      && transformedFootprintDiameter <= STUDIO_LIVE_TRANSFORM_EXACT_MAX_STROKE_WIDTH
      && estimatedDabArea <= STUDIO_LIVE_TRANSFORM_EXACT_MAX_CAUSAL_DAB_AREA
      ? { admitted: true, lane: "causal-dabs", estimatedWork }
      : rejected("renderer-budget", Math.max(estimatedWork, estimatedDabArea));
  }

  if (rendererEngine === "calligraphy-segments") {
    // Brush-width floors do not shrink below their source value, so retaining the source radius
    // for downscales is conservative; upscales still follow the transform's geometric mean.
    const transformedRadius = rendererMaxPaintRadius!
      * Math.max(1, scale.uniformEquivalent);
    const backingPixels = rendererBackingPixelFootprint(
      input.targetBounds,
      transformedRadius,
      input.rasterScale,
    );
    const estimatedWork = Math.max(
      sampleCount,
      rendererExpandedScalarWork!,
      rendererPathCommandUpperBound!,
    );
    return sampleCount <= STUDIO_LIVE_TRANSFORM_EXACT_MAX_CALLIGRAPHY_SAMPLES
      && rendererExpandedScalarWork! <= STUDIO_LIVE_TRANSFORM_EXACT_MAX_RENDERER_SCALAR_WORK
      && rendererPathCommandUpperBound!
        <= STUDIO_LIVE_TRANSFORM_EXACT_MAX_RENDERER_PATH_COMMANDS
      && transformedRadius * 2 <= STUDIO_LIVE_TRANSFORM_EXACT_MAX_STROKE_WIDTH
      && backingPixels <= STUDIO_LIVE_TRANSFORM_EXACT_MAX_BACKING_PIXELS
      ? { admitted: true, lane: "calligraphy-ribbon", estimatedWork }
      : rejected("renderer-budget", Math.max(estimatedWork, backingPixels));
  }

  if (rendererEngine === "perfect-outline") {
    const transformedRadius = rendererMaxPaintRadius!
      * Math.max(1, scale.uniformEquivalent);
    const backingPixels = rendererBackingPixelFootprint(
      input.targetBounds,
      transformedRadius,
      input.rasterScale,
    );
    const estimatedWork = Math.max(
      sampleCount,
      rendererExpandedScalarWork!,
      rendererPathCommandUpperBound!,
    );
    return sampleCount <= STUDIO_LIVE_TRANSFORM_EXACT_MAX_PERFECT_SAMPLES
      && rendererExpandedScalarWork! <= STUDIO_LIVE_TRANSFORM_EXACT_MAX_RENDERER_SCALAR_WORK
      && rendererPathCommandUpperBound!
        <= STUDIO_LIVE_TRANSFORM_EXACT_MAX_RENDERER_PATH_COMMANDS
      && transformedRadius * 2 <= STUDIO_LIVE_TRANSFORM_EXACT_MAX_STROKE_WIDTH
      && backingPixels <= STUDIO_LIVE_TRANSFORM_EXACT_MAX_BACKING_PIXELS
      ? { admitted: true, lane: "perfect-outline", estimatedWork }
      : rejected("renderer-budget", Math.max(estimatedWork, backingPixels));
  }

  // Direct adapter tests and future positively certified renderers can still use the exact seam,
  // but unknown work never receives a renderer-specific generous limit.
  const admitted = sampleCount <= STUDIO_LIVE_TRANSFORM_EXACT_MAX_GENERIC_SAMPLES
    && transformedPathLength <= STUDIO_LIVE_TRANSFORM_EXACT_MAX_GENERIC_PATH_LENGTH;
  const estimatedWork = Math.max(sampleCount, transformedPathLength);
  // Unknown adapters have no certified radius helper. Charge a full (not half) clamped renderer
  // width on each side, then also charge the backing-pixel path sweep. This preserves the generic
  // low-DPR seam while preventing its 1,024-sample / 4,096px caps from bypassing zoom and DPR.
  const genericPaintWidth = Math.max(1, strokeWidth, transformedStrokeWidth);
  const backingPixels = rendererBackingPixelFootprint(
    input.targetBounds,
    genericPaintWidth,
    input.rasterScale,
  );
  const backingSweepPixels = transformedPathLength
    * genericPaintWidth
    * input.rasterScale
    * input.rasterScale;
  return admitted
    && backingPixels <= STUDIO_LIVE_TRANSFORM_EXACT_MAX_BACKING_PIXELS
    && backingSweepPixels <= STUDIO_LIVE_TRANSFORM_EXACT_MAX_BACKING_PIXELS
    ? { admitted: true, lane: "generic", estimatedWork }
    : rejected(
        "renderer-budget",
        Math.max(estimatedWork, backingPixels, backingSweepPixels),
      );
}
