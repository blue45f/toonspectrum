/**
 * Which draw elements the live transform preview must refuse.
 *
 * A retained fast path can apply one affine to an already-rendered subtree only after separate
 * renderer-owned equivalence proof. The currently admitted engines instead use the exact fallback,
 * which replans one isolated model draft. This vertical slice deliberately retains the proven
 * exact-draft allowlist below: unaudited families can start background jobs, mutate
 * committed caches, depend on a backdrop, or derive texture from world-fixed quantities. Where a
 * faithful isolated presentation is not yet proven, the gesture keeps commit-at-release. Correct,
 * just not live.
 *
 * This is the same fail-closed discipline the drag lift already applies to cached ancestors,
 * layer-sensitive composites and stacking-sensitive siblings. Each entry below was reported
 * against a specific render path and verified in that path before being added; the rule is
 * deliberately one list rather than scattered checks, because every one of these was found the
 * same way and the next one will be too.
 */
import { resolveStudioBrushRuntimeContract } from "./brush/studio-brush-runtime-contract";
import { studioSketchStyleOfElement } from "./studio-rough-shape";

import type { DrawEl, El } from "./studio-element-model";

/**
 * Renderers proven safe to execute as isolated `renderPurpose="transform-draft"` copies.
 *
 * This started as a denylist of renderers that resample, and that shape was wrong: it fails OPEN.
 * Six review rounds each found one more renderer that had to be added -- dry media, then
 * watercolor, then screentone and glitter, then pencil, then one web kit, then two more -- and the
 * seventh would have found stamp presets and the pixel-pencil grid. Every miss shipped a visible
 * snap. Inverted, the same mistake costs a renderer its live preview and nothing else: the commit
 * is untouched and correct, so an un-listed brush simply keeps today's commit-at-release
 * behaviour. That asymmetry is the whole reason this file exists, and the list should have obeyed
 * it from the start.
 *
 * An engine earns a place here only when model replanning is deterministic, transform-purpose
 * rendering starts no document-owned async/cache/diagnostic work, and the commit planner carries
 * every renderer-significant input. That does NOT certify affine equivalence: causal dab spacing,
 * calligraphy quantization and perfect-outline topology all contain absolute-pixel rules, so the
 * draw compiler currently marks all three admitted engines `model-draft-only`.
 *
 * Everything else stands down until someone audits its planner and adds it here with the same
 * evidence -- including engines that may well be safe (`neon-halo`, `glow-halo`, `angled-ribbon`),
 * which are omitted because they have not been checked, not because they are known bad. Some are
 * known bad: `stamp-dabs` drains charge by `stampIndex` and offers a world-`fixed` tip rotation
 * plus a `random-jitter` one; `oil-ribbon`, `pencil-path`, `watercolor-dabs`, `particle-scatter`
 * and `screentone-dots` were each confirmed in review.
 *
 * `capsule-outline` and `highlighter-path` WERE listed here and have been removed. Review found
 * absolute-pixel state in both that this file cannot model: the croquis capsule reruns a
 * pulled-string follower against a persisted `pulledStringLengthPx` clamped to 1-512px and
 * compared against transformed point distances, so a scale changes the follower's trajectory
 * rather than scaling its result; and `planStudioHighlighterWashRibbon` picks its subdivision
 * count from an absolute 0.1-0.55px flattening tolerance and then derives rim and fibre detail
 * from the resulting section indices. Neither reduces to a threshold the route check can compare
 * before and after, so they are out until someone models them properly. Removing them is cheap --
 * those strokes keep commit-at-release -- and that is the point of the asymmetry.
 */
const STUDIO_EXACT_DRAFT_SAFE_ENGINES: ReadonlySet<string> = new Set([
  "causal-ink",
  "calligraphy-segments",
  "perfect-outline",
]);

/**
 * True only when the renderer is known safe from EVERY id the element carries.
 *
 * `brush` (the runtime brush id) decides the texture path and so must resolve to a safe engine on
 * its own -- an unresolvable one is not a licence, it is an unknown. `brushCatalogId` is checked
 * too rather than used as a fallback: the two are stored independently and often disagree (pack
 * presets persist `runtimeBrushId: "dry-media"` beside an unrelated catalogue name), so a
 * catalogue id that resolves to an unsafe engine stands the stroke down even when the runtime id
 * looks fine. Fail closed on disagreement; there is no reading of a contradictory pair that is
 * worth a preview.
 */
function studioBrushEngineIsExactDraftSafe(brushId: unknown, catalogId: unknown): boolean {
  const runtimeEngine = resolveStudioBrushRuntimeContract(brushId)?.engine;
  if (runtimeEngine === undefined || !STUDIO_EXACT_DRAFT_SAFE_ENGINES.has(runtimeEngine)) {
    return false;
  }
  const catalogEngine = resolveStudioBrushRuntimeContract(catalogId)?.engine;
  return catalogEngine === undefined || STUDIO_EXACT_DRAFT_SAFE_ENGINES.has(catalogEngine);
}

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
  // Per-sample calligraphy orientation is checked by the gesture adapter only AFTER its O(1)
  // compiler budget admits at most 256 samples. Scanning tilt/twist here would make every ordinary
  // Stage React render O(total calligraphy samples), even when nothing is selected or transforming.
  // Hand-drawn (Rough.js) shapes. `StudioDrawNode` builds the sketch plan with
  // `buildStudioRoughShapeRenderPlan(generator, { points, strokeWidth, … })` on every render, and
  // rough.js derives its perturbations from that geometry — so the commit's replan wobbles
  // differently from the previewed path even though `roughness`, `bowing` and the id-derived seed
  // are untouched, and the wobble amplitude is in absolute units, so a scale changes how rough the
  // line reads. Bound-derived shapes already stood down above; this is what catches sketch-styled
  // lines and arrows, whose points survive an affine and so reach the preview.
  if ((draw.kind ?? "freehand") !== "freehand" && studioSketchStyleOfElement(draw)?.enabled === true) {
    return true;
  }
  // THE ALLOWLIST. Everything above is a property of the ELEMENT that disqualifies it whatever it
  // is drawn with; this is the renderer itself, and it must be positively known safe. A brush with
  // no runtime contract at all -- an unknown id, a persisted render mode like `pixel-grid-v1` that
  // is not an engine, a preset from a pack this build does not know -- resolves to undefined and
  // stands down here, which is the behaviour the denylist could never give.
  if (!studioBrushEngineIsExactDraftSafe(draw.brush, draw.brushCatalogId)) {
    return true;
  }
  // Legacy strokes with no `sampleSpacing`. `resolveStudioFreehandRenderPath` reprocesses those
  // points against a FIXED 3px legacy distance, so enlarging a densely sampled stroke keeps points
  // the source render discarded and the committed centerline is not the previewed one scaled. A
  // stored `sampleSpacing` scales with the transform (the commit planner multiplies it by the same
  // width factor), which is what makes the resampling agree.
  if (draw.sampleSpacing === undefined) return true;
  return false;
}
