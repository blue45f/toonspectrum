/**
 * Which draw elements the live transform preview must refuse.
 *
 * The preview is one affine applied to the already-rendered subtree; the commit re-derives the
 * element from document state and lets the renderer replan it. Those agree only when the render is
 * a pure function of state the commit can transform. Where it is not, the gesture would show
 * artwork the commit will never produce and snap at release — so the preview stands down and the
 * stroke keeps today's commit-at-release behaviour. Correct, just not live.
 *
 * This is the same fail-closed discipline the drag lift already applies to cached ancestors,
 * layer-sensitive composites and stacking-sensitive siblings. Each entry below was reported
 * against a specific render path and verified in that path before being added; the rule is
 * deliberately one list rather than scattered checks, because every one of these was found the
 * same way and the next one will be too.
 */
import type { DrawEl, El } from "./studio-element-model";

/**
 * Dry media replans its tooth and patch noise from DAB-RELATIVE coordinates
 * (`studio-dry-media-kernel-tip.ts`), so scaling or rotating resamples those fields and the
 * committed texture is not the previewed texture affinely transformed — it is a different
 * texture. Nothing in the document can carry the old sampling forward, so these routes stand down.
 */
const STUDIO_COORDINATE_RESAMPLED_BRUSH_IDS: ReadonlySet<string> = new Set([
  // The RENDERER id, which is what actually decides the texture path and is therefore the entry
  // that matters most. Many pack descriptors persist `runtimeBrushId: "dry-media"` alongside an
  // unrelated catalogue id (the sketch pencils in `studio-brush-pack-index`), and
  // `applyStudioBrushCatalogSelection` stores the two separately -- so enumerating catalogue names
  // alone let every one of those strokes through. Classify by renderer first.
  "dry-media",
  // The core presets, which carry their own name as the brush id rather than the renderer's.
  "crayon",
  "chalk",
  "charcoal",
  "pastel",
  "oil-pastel",
]);

/**
 * @param isBoundDerivedShape the caller's own closed-shape verdict. Rect, ellipse, star, triangle
 *   and polygon are rebuilt by `StudioDrawNode` from `drawBounds(points)` as AXIS-ALIGNED
 *   primitives, so a rotation survives in the preview and is thrown away by the commit, which
 *   reconstructs the shape from the rotated points' bounding box. Passed in rather than recomputed
 *   so the two cannot drift apart.
 */
export function studioLiveTransformPreviewBlockedForElement(
  element: El,
  isBoundDerivedShape: boolean,
): boolean {
  if (element.type !== "draw") return false;
  if (isBoundDerivedShape) return true;
  const draw = element as DrawEl & El;
  // Symmetry generates copies about WORLD axes and the model stores no axis angle, so the
  // preview's `A ∘ S` and the commit's `S ∘ A` diverge whenever the two do not commute.
  if (draw.symmetry !== undefined && draw.symmetry.type !== "none") return true;
  // Per-sample stylus orientation. `calligraphySegmentStep` composes the nib angle as
  // `atan2(tiltY, tiltX) + twist`, and only on the branch where the sample has tilt, so no
  // transform of these channels is correct without replicating renderer-internal branching --
  // three attempts proved it, two of them emitting values the CRDT payload validator rejects.
  // The commit therefore replays them exactly as authored, which the affine preview cannot show.
  if (
    (draw.tiltXs !== undefined && draw.tiltXs.length > 0)
    || (draw.tiltYs !== undefined && draw.tiltYs.length > 0)
    || (draw.twists !== undefined && draw.twists.length > 0)
  ) {
    return true;
  }
  const brushId = draw.brush;
  const catalogId = draw.brushCatalogId;
  if (typeof brushId === "string" && STUDIO_COORDINATE_RESAMPLED_BRUSH_IDS.has(brushId)) {
    return true;
  }
  if (typeof catalogId === "string" && STUDIO_COORDINATE_RESAMPLED_BRUSH_IDS.has(catalogId)) {
    return true;
  }
  return false;
}
