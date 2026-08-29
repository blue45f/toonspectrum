/**
 * Konva binding for the live transform preview — the only renderer-aware piece.
 *
 * Applies the engine-agnostic attrs from `studio-live-transform-preview.ts` onto the stroke's
 * draggable wrapper node imperatively: zero React commits per pointer frame, the same hot-path
 * discipline the drag mirrors in `studio-selection-chrome-mirror.ts` follow. A future non-Konva
 * scene backend replaces this file and keeps the math module untouched.
 */
import { STUDIO_LIVE_TRANSFORM_PREVIEW_NEUTRAL_ATTRS } from "./studio-live-transform-preview";

import type { StudioLiveTransformPreviewNodeAttrs } from "./studio-live-transform-preview";
import type Konva from "konva";

export function applyStudioLiveTransformPreviewNodeAttrs(
  node: Konva.Node,
  attrs: StudioLiveTransformPreviewNodeAttrs
): void {
  node.position({ x: attrs.x, y: attrs.y });
  node.rotation(attrs.rotationDeg);
  node.scale({ x: attrs.scaleX, y: attrs.scaleY });
  node.offset({ x: attrs.offsetX, y: attrs.offsetY });
}

export function resetStudioLiveTransformPreviewNodeAttrs(node: Konva.Node): void {
  applyStudioLiveTransformPreviewNodeAttrs(
    node,
    STUDIO_LIVE_TRANSFORM_PREVIEW_NEUTRAL_ATTRS
  );
}

/**
 * A preview target under a cached ancestor (BlendIsolationGroup / ClipMaskGroup flatten their
 * subtree to a bitmap) must fall back to commit-at-release: mutating attrs below a cache never
 * repaints, so the gesture would look dead while actually rearming a stale raster.
 */
export function studioLiveTransformPreviewEligible(node: Konva.Node): boolean {
  let current: Konva.Node | null = node;
  while (current) {
    if (current.isCached()) return false;
    current = current.getParent();
  }
  return true;
}
