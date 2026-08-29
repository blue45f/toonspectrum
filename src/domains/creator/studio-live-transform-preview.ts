/**
 * Engine-agnostic live preview math for the selected-stroke free transform.
 *
 * Dragging a resize/rotate handle must show the ink moving *during* the gesture (PPT/Figma
 * behavior), not only at pointer-up. Re-baking `points` per pointer frame would re-run the full
 * stroke planner (perfect-freehand outline, dynamic-brush coverage, watercolor physics) every
 * frame, so the live preview instead expresses the gesture as one affine on the stroke's
 * already-planned scene node:
 *
 *   translate(target.x, target.y) ∘ rotate(θ) ∘ scale(sx, sy) ∘ translate(−source.x, −source.y)
 *
 * which maps a document point (px, py) to
 *
 *   u = (px − source.x)·sx,  v = (py − source.y)·sy
 *   p′ = (target.x + u·cosθ − v·sinθ,  target.y + u·sinθ + v·cosθ)
 *
 * — exactly `planStudioDrawObjectTransform`'s point mapping, so the preview lands on the same
 * pixels the commit bakes into `points` at transformend. Two knowingly approximate spots, both
 * inherent to previewing a bake: node scale previews stroke width anisotropically where the
 * planner's geometric-mean width rule keeps a round nib (identical under a uniform gesture), and
 * a mirror-symmetric stroke under rotation re-renders about its unrotated model axis at commit.
 *
 * This module is deliberately renderer-free: the attrs are plain numbers in the decomposition
 * every scene graph understands — Konva node attrs today, and the same gesture frame projects to
 * a stable-IR `Mat2d` (see `studioLiveTransformPreviewMat2d`) that `transformSceneNodes` in the
 * WebGPU/Vello document lane consumes unchanged, so the preview follows the ink when draw
 * elements graduate off `studioDocumentAllowsKonvaHide`'s denylist. Renderer-specific application
 * lives in `studio-live-transform-preview-konva.ts`, so swapping the canvas engine replaces that
 * adapter, not this contract.
 */
import {
  composeMat2d,
  rotateMat2d,
  scaleMat2d,
  translateMat2d,
} from "@toonspectrum/studio-project-model";

import { studioDrawObjectTransformScale } from "./brush/studio-draw-object-transform";

import type { StudioDrawObjectTransformBounds } from "./brush/studio-draw-object-transform";
import type { Mat2d } from "@toonspectrum/studio-project-model";

export interface StudioLiveTransformPreviewFrame {
  /** The gesture's captured source box — same value the commit planner will consume. */
  readonly sourceBounds: StudioDrawObjectTransformBounds;
  /** Live target box *before* rotation — width/height are the scaled extents, as Konva reports. */
  readonly targetBounds: StudioDrawObjectTransformBounds;
  /** Clockwise rotation in degrees about the target box origin. Konva's `rotation()` convention. */
  readonly rotationDeg: number;
}

/**
 * One gesture frame decomposed into the position/rotation/scale/offset attrs shared by retained
 * scene graphs. Rotation stays in degrees — the unit both Konva and the commit planner speak.
 */
export interface StudioLiveTransformPreviewNodeAttrs {
  readonly x: number;
  readonly y: number;
  readonly rotationDeg: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/** The identity projection — what a preview node must return to once the gesture resolves. */
export const STUDIO_LIVE_TRANSFORM_PREVIEW_NEUTRAL_ATTRS: StudioLiveTransformPreviewNodeAttrs = {
  x: 0,
  y: 0,
  rotationDeg: 0,
  scaleX: 1,
  scaleY: 1,
  offsetX: 0,
  offsetY: 0,
};

/**
 * Projects one gesture frame to node attrs, or `null` for a degenerate frame (non-finite or
 * non-positive boxes, non-finite rotation). Callers keep the last valid projection on `null`
 * rather than snapping the ink anywhere — transformend still decides commit vs cancel from its
 * own reading, so a rejected preview frame can never corrupt the document.
 */
/**
 * Why a frame produced no projection — the two cases need OPPOSITE handling at the call site.
 *
 * `invalid` is a degenerate or non-finite box, typically a transient mid-gesture reading. Holding
 * the last good projection is right there: the next frame recovers and nothing visibly stalls.
 *
 * `unsupported-non-uniform` is a perfectly valid frame this projection cannot represent. Holding
 * the last projection would freeze the ink at its last uniform pose while the handles keep moving,
 * then jump at release — worse than not previewing at all, which is why the caller neutralizes
 * instead and lets the stroke sit at its document position for the rest of the gesture.
 */
export type StudioLiveTransformPreviewRejection =
  | "invalid"
  | "unsupported-non-uniform";

export type StudioLiveTransformPreviewProjection =
  | { readonly ok: true; readonly attrs: StudioLiveTransformPreviewNodeAttrs }
  | { readonly ok: false; readonly reason: StudioLiveTransformPreviewRejection };

/** The projection with its rejection reason, for callers that must tell the two apart. */
export function classifyStudioLiveTransformPreviewFrame(
  frame: StudioLiveTransformPreviewFrame
): StudioLiveTransformPreviewProjection {
  const attrs = planStudioLiveTransformPreviewAttrs(frame);
  if (attrs) return { ok: true, attrs };
  const scale = studioDrawObjectTransformScale(frame.sourceBounds, frame.targetBounds);
  const reason: StudioLiveTransformPreviewRejection =
    scale && Number.isFinite(frame.rotationDeg) && !scale.uniform
      ? "unsupported-non-uniform"
      : "invalid";
  return { ok: false, reason };
}

export function planStudioLiveTransformPreviewAttrs(
  frame: StudioLiveTransformPreviewFrame
): StudioLiveTransformPreviewNodeAttrs | null {
  if (!Number.isFinite(frame.rotationDeg)) return null;
  const scale = studioDrawObjectTransformScale(frame.sourceBounds, frame.targetBounds);
  if (!scale) return null;
  // A non-uniform frame is rejected, because this projection cannot show what the commit will do.
  //
  // Scaling the wrapper scales the rendered stroke ANISOTROPICALLY -- round caps become elliptical
  // and thickness varies with direction -- while `planStudioDrawObjectTransform` applies its
  // geometric mean `sqrt(scaleX * scaleY)` to a single strokeWidth and replans with round caps. A
  // 2x horizontal-only resize previews unchanged vertical thickness and commits about 1.41x
  // thickness everywhere, so the ink visibly snaps at release.
  //
  // Uniform frames are exact and stay live: sqrt(s * s) === s is precisely what scaling the node
  // does, which is why this rejects only the anisotropic case rather than scaling generally. The
  // `uniform` flag comes from the commit planner's own scale helper, so the two cannot disagree
  // about where the boundary is.
  if (!scale.uniform) return null;
  return {
    x: frame.targetBounds.x,
    y: frame.targetBounds.y,
    rotationDeg: frame.rotationDeg,
    scaleX: scale.scaleX,
    scaleY: scale.scaleY,
    offsetX: frame.sourceBounds.x,
    offsetY: frame.sourceBounds.y,
  };
}

/**
 * The same gesture frame as one stable-IR affine (CSS `matrix(a,b,c,d,e,f)` convention), for
 * render backends that take a matrix instead of attrs — `transformSceneNodes` applies it to the
 * scoped scene nodes directly. Identical rejection rules as the attrs projection.
 */
export function studioLiveTransformPreviewMat2d(
  frame: StudioLiveTransformPreviewFrame
): Mat2d | null {
  const attrs = planStudioLiveTransformPreviewAttrs(frame);
  if (!attrs) return null;
  return composeMat2d(
    translateMat2d(attrs.x, attrs.y),
    composeMat2d(
      rotateMat2d(attrs.rotationDeg),
      composeMat2d(
        scaleMat2d(attrs.scaleX, attrs.scaleY),
        translateMat2d(-attrs.offsetX, -attrs.offsetY)
      )
    )
  );
}
