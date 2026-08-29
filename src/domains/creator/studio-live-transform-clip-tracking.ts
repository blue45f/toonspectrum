/**
 * Which panel clip a stroke will render under AFTER the gesture commits — computed per frame.
 *
 * A stroke that belongs to a panel renders inside a clipping `Group` whose rect comes from
 * `containingPanel`. That verdict is GEOMETRY-derived (centre inside the frame, plus a 1.4x size
 * cutoff), so a scale or rotation can move a stroke out of its panel, or pull an unclipped stroke
 * into one. The live preview transforms the already-rendered subtree, which carries whatever clip
 * the stroke had when the gesture began, while the commit re-derives the verdict from the new
 * geometry — so the clip popped at release.
 *
 * The fix is not a scene-graph reparent. Konva expresses a clip as ATTRS on the group
 * (`clipX/clipY/clipWidth/clipHeight`), so the clip a stroke renders under can be re-pointed by
 * writing four numbers, imperatively, on one node per frame — the same discipline the chrome
 * mirror already uses, with no React commit and no change of parentage. That last part matters:
 * `restoreStudioSingleDrawTransformLayer` skips nodes an external owner has reparented, and the
 * parked-chrome bookkeeping keys off the wrapper's parent, so both stay untouched.
 *
 * This module is the renderer-free half: it answers "what rect, if any" from the gesture's target
 * bounds. Applying it to a Konva node lives in `studio-live-transform-clip-tracking-konva.ts`.
 */
import { panelContainingBounds } from "./studio-element-geometry";

import type { StudioDrawObjectTransformBounds } from "./brush/studio-draw-object-transform";
import type { El } from "./studio-element-model";

/** The clip rect Konva wants, in the same shape `StudioCanvasViewportDocumentLayer` builds. */
export interface StudioLiveTransformClipRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The axis-aligned bounds a gesture frame will commit, from the same decomposition the preview
 * projects and the commit planner bakes.
 *
 * Rotation is deliberately folded into the AABB rather than ignored: `containingPanel` reads
 * `elBounds`, which is axis-aligned, so a rotated stroke's panel verdict is decided by the box
 * around the rotated ink — exactly what this returns. A 45-degree turn genuinely can push a stroke
 * past the 1.4x cutoff, and pretending otherwise would put the preview back out of step with the
 * commit for the one case this module exists to fix.
 */
export function studioLiveTransformTargetBounds(
  targetBounds: StudioDrawObjectTransformBounds,
  rotationDeg: number,
): { readonly x: number; readonly y: number; readonly w: number; readonly h: number } | null {
  const { x, y, width, height } = targetBounds;
  if (![x, y, width, height, rotationDeg].every((value) => Number.isFinite(value))) return null;
  if (width <= 0 || height <= 0) return null;
  const radians = (rotationDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  // The AABB of a rotated rectangle, about the box's own centre — which is where the preview's
  // decomposition rotates it (translate(target) ∘ rotate ∘ scale ∘ translate(−source)).
  const rotatedW = width * cos + height * sin;
  const rotatedH = width * sin + height * cos;
  const cx = x + width / 2;
  const cy = y + height / 2;
  return { x: cx - rotatedW / 2, y: cy - rotatedH / 2, w: rotatedW, h: rotatedH };
}

/**
 * The clip the COMMIT will give this stroke for the supplied gesture frame, or `null` for none.
 *
 * @param noClip the element's own `noClip` flag — the document layer honours it before consulting
 *   `containingPanel`, so this must too or the preview would clip a stroke the commit leaves free.
 */
export function studioLiveTransformCommittedClip(input: {
  readonly targetBounds: StudioDrawObjectTransformBounds;
  readonly rotationDeg: number;
  readonly elements: readonly El[];
  readonly noClip?: boolean;
}): StudioLiveTransformClipRect | null {
  if (input.noClip === true) return null;
  const bounds = studioLiveTransformTargetBounds(input.targetBounds, input.rotationDeg);
  if (!bounds) return null;
  const panel = panelContainingBounds(bounds, input.elements);
  return panel
    ? { x: panel.x, y: panel.y, width: panel.width, height: panel.height }
    : null;
}

/** True when two clip verdicts differ — the only frames that need a scene-graph write. */
export function studioLiveTransformClipChanged(
  a: StudioLiveTransformClipRect | null,
  b: StudioLiveTransformClipRect | null,
): boolean {
  if (a === null || b === null) return a !== b;
  return a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height;
}
