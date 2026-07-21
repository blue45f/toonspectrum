/**
 * Pure completed-stroke release planning.
 *
 * The Page remains responsible for reading the final hardware coordinate, draining stabilizers,
 * publishing CRDT samples, owning live surfaces, committing history, and cleaning pointer state.
 * This leaf starts only after those release samples are authoritative and decides the immutable
 * geometry stored by the commit path plus whether that path may use the deferred batch.
 */

import { smoothStrokePoints } from "./studio-brush";
import { isStudioImmediateFreehandCommit } from "./studio-draw-completion";
import { isStudioPixelPencilRenderMode } from "./studio-pixel-pencil";
import {
  promoteFreehandQuickShapeOnRelease,
  trimQuickShapeDwellTail,
  QUICKSHAPE_LOCK_HOLD_MS,
} from "./studio-quickshape";
import { DEFAULT_SHAPE_PARAMS } from "./studio-stroke-shapes";

import type { DrawEl } from "./studio-element-model";

export type StudioDrawReleaseShapeKind = Exclude<
  NonNullable<DrawEl["kind"]>,
  "freehand"
>;

export interface StudioDrawReleaseQuickShapeSnapshot {
  readonly active: boolean;
  readonly anchor: Readonly<{ x: number; y: number }> | null;
  readonly sourcePoints: readonly number[];
  readonly stableSourceLength: number;
  readonly elapsed: number;
  readonly locked: boolean;
  readonly converted: boolean;
}

export interface StudioDrawPointerReleasePlanInput {
  /** A complete stroke whose release coordinate and stabilizer drain are already authoritative. */
  readonly stroke: DrawEl;
  readonly quickShape: StudioDrawReleaseQuickShapeSnapshot;
  readonly postCorrection: Readonly<{
    strength: number;
    preserveCorners: boolean;
    causalStateSealed: boolean;
  }>;
  readonly commit: Readonly<{
    masterEditMode: boolean;
    directLiveDraft: boolean;
    /** Whether Canvas/WebGPU can keep an opaque direct draft visible until the deferred commit. */
    directInkSurfaceAvailable: boolean;
  }>;
}

export type StudioDrawReleaseQuickShapeTransition =
  | "none"
  | "promoted"
  | "already-converted";

export interface StudioDrawPointerReleasePlan {
  readonly stroke: DrawEl;
  readonly quickShapeTransition: StudioDrawReleaseQuickShapeTransition;
  readonly quickShapeAnnouncementKind: StudioDrawReleaseShapeKind | null;
  readonly postCorrectionApplied: boolean;
  readonly commitMode: "immediate" | "deferred";
}

/**
 * Finalizes geometry and classifies commit latency without reading refs or touching render state.
 * The caller must still execute and recover the selected commit path.
 */
export function planStudioDrawPointerRelease(
  input: StudioDrawPointerReleasePlanInput
): StudioDrawPointerReleasePlan {
  let stroke = input.stroke;
  let quickShapeTransition: StudioDrawReleaseQuickShapeTransition = "none";
  let quickShapeAnnouncementKind: StudioDrawReleaseShapeKind | null = null;

  if (
    input.quickShape.active
    && stroke.mode !== "eraser"
    && !isStudioPixelPencilRenderMode(stroke.brush)
    && (stroke.kind ?? "freehand") === "freehand"
  ) {
    const heldRecognitionPoints = input.quickShape.elapsed > 0
      ? trimQuickShapeDwellTail(
          input.quickShape.sourcePoints,
          input.quickShape.stableSourceLength
        )
      : input.quickShape.sourcePoints;
    const promotionPoints = heldRecognitionPoints.length >= 8
      ? heldRecognitionPoints
      : stroke.points;
    const promoted = promoteFreehandQuickShapeOnRelease(promotionPoints, {
      anchor: input.quickShape.anchor,
      lockAspect:
        input.quickShape.locked
        || input.quickShape.elapsed >= QUICKSHAPE_LOCK_HOLD_MS,
    });
    if (promoted) {
      stroke = {
        ...stroke,
        kind: promoted.kind,
        brush: undefined,
        pressures: undefined,
        tiltXs: undefined,
        tiltYs: undefined,
        twists: undefined,
        brushTip: undefined,
        stamp: undefined,
        stampPipeline: undefined,
        watercolorPipeline: undefined,
        paintModel: undefined,
        fill: undefined,
        points: promoted.points,
        shapeParams: promoted.polygonSides === undefined
          ? undefined
          : { ...DEFAULT_SHAPE_PARAMS, polygonSides: promoted.polygonSides },
      };
      quickShapeTransition = "promoted";
      quickShapeAnnouncementKind = promoted.kind;
    }
  } else if (
    input.quickShape.active
    && stroke.mode !== "eraser"
    && stroke.kind
    && stroke.kind !== "freehand"
    && input.quickShape.converted
  ) {
    quickShapeTransition = "already-converted";
    quickShapeAnnouncementKind = stroke.kind;
  }

  let postCorrectionApplied = false;
  if (
    (stroke.kind ?? "freehand") === "freehand"
    && !isStudioPixelPencilRenderMode(stroke.brush)
    && input.postCorrection.strength > 0
    && stroke.stampPipeline !== "causal-walker-v2"
    && stroke.watercolorPipeline !== "causal-walker-v2"
    && !input.postCorrection.causalStateSealed
  ) {
    stroke = {
      ...stroke,
      points: smoothStrokePoints(stroke.points, input.postCorrection.strength, {
        preserveCorners: input.postCorrection.preserveCorners,
      }),
    };
    postCorrectionApplied = true;
  }

  const canKeepDeferredInkVisible = input.commit.directLiveDraft
    ? input.commit.directInkSurfaceAvailable
    : true;
  const deferred =
    !input.commit.masterEditMode
    && stroke.mode !== "eraser"
    // Taps and short flicks must become undo/autosave-authoritative in the pointerup task.
    && !isStudioImmediateFreehandCommit(stroke)
    // A translucent settled preview overlapping its committed node would briefly double-darken.
    && (stroke.opacity ?? 1) === 1
    // Direct drafts may defer only while their Canvas/WebGPU pixels can survive the handoff.
    && canKeepDeferredInkVisible;

  return {
    stroke,
    quickShapeTransition,
    quickShapeAnnouncementKind,
    postCorrectionApplied,
    commitMode: deferred ? "deferred" : "immediate",
  };
}
