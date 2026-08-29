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
import { resolveStudioBrushRuntimeContract } from "./brush/studio-brush-runtime-contract";
import { studioSketchStyleOfElement } from "./studio-rough-shape";

import type { DrawEl, El } from "./studio-element-model";

/**
 * Renderers PROVEN to draw a pure function of the stroke's transformable state, and therefore the
 * only ones that may preview.
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
 * An engine earns a place here only by reading as a pure function of points, width and pressure --
 * no world-fixed constant, no index- or arc-length-derived noise, no snapping to a document grid.
 * Each entry below was checked against its planner for those tells:
 *
 *   - `causal-ink` and `calligraphy-segments` build a ribbon from the path itself
 *     (`studio-causal-ink.ts`, `studio-calligraphy-ribbon.ts`: no hash, no station index, no
 *     world-space rounding). The nib angle IS orientation-dependent, and the commit path rotates
 *     it explicitly -- see `studio-draw-object-transform`, which also refuses that rotation when
 *     per-sample stylus channels are present, in which case the guard below stands the stroke down.
 *   - `perfect-outline` and `capsule-outline` are outline geometry over the points
 *     (`studio-perfect-freehand.ts`, `studio-outline-stroke-contract.ts`: same, no tells).
 *   - `highlighter-path` is a plain path; its multiply composite is a separate concern already
 *     handled by the drag lift's subtree composite guard.
 *
 * Everything else stands down until someone audits its planner and adds it here with the same
 * evidence -- including engines that may well be safe (`neon-halo`, `glow-halo`, `angled-ribbon`),
 * which are omitted because they have not been checked, not because they are known bad. Some are
 * known bad: `stamp-dabs` drains charge by `stampIndex` and offers a world-`fixed` tip rotation
 * plus a `random-jitter` one; `oil-ribbon`, `pencil-path`, `watercolor-dabs`, `particle-scatter`
 * and `screentone-dots` were each confirmed in review.
 */
const STUDIO_TRANSFORM_SAFE_ENGINES: ReadonlySet<string> = new Set([
  "causal-ink",
  "calligraphy-segments",
  "perfect-outline",
  "capsule-outline",
  "highlighter-path",
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
function studioBrushEngineIsTransformSafe(brushId: unknown, catalogId: unknown): boolean {
  const runtimeEngine = resolveStudioBrushRuntimeContract(brushId)?.engine;
  if (runtimeEngine === undefined || !STUDIO_TRANSFORM_SAFE_ENGINES.has(runtimeEngine)) {
    return false;
  }
  const catalogEngine = resolveStudioBrushRuntimeContract(catalogId)?.engine;
  return catalogEngine === undefined || STUDIO_TRANSFORM_SAFE_ENGINES.has(catalogEngine);
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
  if (!studioBrushEngineIsTransformSafe(draw.brush, draw.brushCatalogId)) {
    return true;
  }
  return false;
}
