import { isStudioPixelPencilRenderMode } from "./studio-pixel-pencil";
import {
  promoteFreehandQuickShapeOnRelease,
  trimQuickShapeDwellTail,
  QUICKSHAPE_LOCK_HOLD_MS,
} from "./studio-quickshape";
import {
  applyStudioSmartShapeBrushEffect,
  stripStudioSmartShapeBrushEffect,
  type StudioSmartShapeBrushEffectFallbackReason,
} from "./studio-smart-shape-brush-effect";
import { DEFAULT_SHAPE_PARAMS } from "./studio-stroke-shapes";

import type { DrawEl } from "./studio-element-model";
import type { QuickShapeKind } from "./studio-quickshape";

export type StudioQuickShapeBrushEffectMode = "plain" | "selected-brush";

export interface StudioQuickShapeReleaseSnapshot {
  readonly active: boolean;
  readonly anchor: Readonly<{ x: number; y: number }> | null;
  readonly sourcePoints: readonly number[];
  readonly stableSourceLength: number;
  readonly elapsed: number;
  readonly locked: boolean;
  readonly converted: boolean;
  /** Defaults to `plain`, preserving existing documents and gestures. */
  readonly brushEffectMode?: StudioQuickShapeBrushEffectMode;
  /** Required after the live hold path has already replaced the draft's brush fields. */
  readonly brushEffectSource?: DrawEl | null;
}

export type StudioQuickShapeReleaseTransition = "none" | "promoted" | "already-converted";
export type StudioQuickShapeBrushEffectStatus = "not-requested" | "not-applicable" | "applied" | "fallback";

export interface StudioQuickShapeReleaseResult {
  readonly stroke: DrawEl;
  readonly transition: StudioQuickShapeReleaseTransition;
  readonly announcementKind: QuickShapeKind | null;
  readonly brushEffectStatus: StudioQuickShapeBrushEffectStatus;
  readonly brushEffectFallbackReason: StudioSmartShapeBrushEffectFallbackReason | null;
}

function legacyPlainPromotion(
  stroke: DrawEl,
  promoted: NonNullable<ReturnType<typeof promoteFreehandQuickShapeOnRelease>>,
): DrawEl {
  return {
    ...stroke,
    kind: promoted.kind,
    brush: undefined,
    pressures: undefined,
    materialPressureModel: undefined,
    materialMinimumDiameterRatio: undefined,
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
}

function noChange(
  stroke: DrawEl,
  requested: boolean,
): StudioQuickShapeReleaseResult {
  return {
    stroke,
    transition: "none",
    announcementKind: null,
    brushEffectStatus: requested ? "not-applicable" : "not-requested",
    brushEffectFallbackReason: null,
  };
}

function withRequestedEffect(
  geometricStroke: DrawEl,
  sourceStroke: DrawEl | null | undefined,
) {
  const effect = applyStudioSmartShapeBrushEffect(geometricStroke, sourceStroke);
  return {
    stroke: effect.stroke,
    brushEffectStatus: effect.status,
    brushEffectFallbackReason: effect.status === "fallback" ? effect.reason : null,
  } as const;
}

/** Pure recognition/promotion boundary shared by live-converted and release-recognized shapes. */
export function planStudioQuickShapeRelease(
  stroke: DrawEl,
  snapshot: StudioQuickShapeReleaseSnapshot,
): StudioQuickShapeReleaseResult {
  const effectRequested = snapshot.brushEffectMode === "selected-brush";
  if (
    snapshot.active
    && stroke.mode !== "eraser"
    && !isStudioPixelPencilRenderMode(stroke.brush)
    && (stroke.kind ?? "freehand") === "freehand"
  ) {
    const heldPoints = snapshot.elapsed > 0
      ? trimQuickShapeDwellTail(snapshot.sourcePoints, snapshot.stableSourceLength)
      : snapshot.sourcePoints;
    const promoted = promoteFreehandQuickShapeOnRelease(
      heldPoints.length >= 8 ? heldPoints : stroke.points,
      {
        anchor: snapshot.anchor,
        lockAspect: snapshot.locked || snapshot.elapsed >= QUICKSHAPE_LOCK_HOLD_MS,
      },
    );
    if (!promoted) return noChange(stroke, effectRequested);

    const geometric = legacyPlainPromotion(stroke, promoted);
    const effect = effectRequested
      ? withRequestedEffect(geometric, snapshot.brushEffectSource ?? stroke)
      : {
          stroke: geometric,
          brushEffectStatus: "not-requested" as const,
          brushEffectFallbackReason: null,
        };
    return {
      ...effect,
      transition: "promoted",
      announcementKind: promoted.kind,
    };
  }

  if (
    snapshot.active
    && stroke.mode !== "eraser"
    && stroke.kind
    && stroke.kind !== "freehand"
    && snapshot.converted
  ) {
    const effect = effectRequested
      ? withRequestedEffect(stroke, snapshot.brushEffectSource)
      : {
          stroke,
          brushEffectStatus: "not-requested" as const,
          brushEffectFallbackReason: null,
        };
    return {
      ...effect,
      transition: "already-converted",
      announcementKind: stroke.kind as QuickShapeKind,
    };
  }

  // A malformed future converted shape should not retain effect metadata after an explicit request.
  if (effectRequested && snapshot.converted) {
    return {
      stroke: stripStudioSmartShapeBrushEffect(stroke),
      transition: "none",
      announcementKind: null,
      brushEffectStatus: "fallback",
      brushEffectFallbackReason: "invalid-geometry",
    };
  }
  return noChange(stroke, effectRequested);
}
