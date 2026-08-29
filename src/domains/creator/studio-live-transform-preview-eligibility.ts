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
 * Renderers whose per-dab geometry is replanned from the stroke's own arc length and index, so a
 * scale or rotation re-seeds the whole texture rather than moving it.
 *
 * `watercolor-dabs` fails BOTH ways at once, verified in `studio-watercolor-brush.ts`:
 * `idealStationCount = ceil(totalLength / spacing) + 1`, so any scale changes the station count and
 * with it every `hash2(stationIndex, …)` draw; and `createDiffuseDab` places its halo at
 * `hash2(stationIndex, 31, seed) * TAU`, an angle with no dependence on the stroke's orientation —
 * so even a pure rotation, which leaves the station count alone, leaves every halo pointing the
 * old way while the preview swings all of them round.
 *
 * `screentone-dots` is the starkest case: `screentoneDotsForStroke` places every dot on a GLOBAL
 * lattice (`ix * pitch`, `iy * pitch`, with the half-pitch honeycomb offset on odd rows), in world
 * coordinates that owe nothing to the stroke. That is the point of the design -- overlapping passes
 * fill the same halftone grid -- and it is exactly why a rotation cannot be previewed: the commit
 * re-lays the dots on the unrotated lattice while the preview swung them.
 *
 * `particle-scatter` fails the same way watercolor's halo does: `planGlitterBrushParticles` takes
 * each spark's angle from `hash2(si, …) * TAU`, a station-index draw with no dependence on the
 * stroke's orientation, so a rotation leaves the whole scatter field pointing where it was.
 *
 * `pencil-path` is the smallest divergence in this set and still a real one: `processPencilPoints`
 * offsets every sample by a fixed +/-0.75px drawn from its INDEX, in world axes, so the committed
 * grain neither scales nor turns while the preview scales and turns the grain already drawn. At
 * gentle transforms the difference is sub-pixel; at a large scale-up it is not (an 8x scale
 * previews +/-6px of jitter against a committed +/-0.75px), and the gate cannot know in advance
 * which gesture it is looking at.
 *
 * Classified by RENDERER engine rather than by brush id: the watercolor engine backs `watercolor`,
 * `ink-wash`, its `inkwash-*` profiles and `gouache`, plus every `engine-variant` lane in
 * `studio-brush-engine-lane-catalog` that resolves to them, and an id list would silently miss the
 * next one added.
 */
const STUDIO_COORDINATE_RESAMPLED_ENGINES: ReadonlySet<string> = new Set([
  "watercolor-dabs",
  "screentone-dots",
  "particle-scatter",
  "pencil-path",
]);

function studioBrushEngineResamplesCoordinates(brushId: unknown): boolean {
  const engine = resolveStudioBrushRuntimeContract(brushId)?.engine;
  return engine !== undefined && STUDIO_COORDINATE_RESAMPLED_ENGINES.has(engine);
}

/**
 * The web drawing-assist kit, blocked as a FAMILY rather than one member at a time.
 *
 * Every one of these generates its marks from parameters fixed in WORLD space, not from the stroke
 * alone, so the commit replans them on axes the gesture never turned. Sampled across the kit:
 * `planStudioWebGridInkSamples` rounds each sample to `Math.round(x / cell) * cell` on an unrotated
 * grid (and dedups by cell key, so the sample COUNT moves too); `planStudioWebKaleidoInkSamples`
 * replicates about a fixed `centerX`/`centerY`; `planStudioWebMirrorInkSamples` reflects across a
 * fixed `axisX`/`axisY`; `planStudioWebCrossHatchPenSamples` hatches at hard-coded +/-45deg. This is
 * the same non-commuting shape as the `symmetry` guard above -- `A ∘ G` is not `G ∘ A` when G is
 * pinned to the world.
 *
 * Taken as the whole family rather than the members verified one by one, because the asymmetry that
 * justifies every entry in this file applies with full force: over-blocking costs a member its live
 * preview and nothing else, since the commit is unchanged and correct, while under-blocking ships a
 * visible snap -- and each of the last several review rounds found exactly one more member of a
 * pattern already established.
 *
 * Spelled out here rather than imported from `STUDIO_WEB_ASSIST_BRUSH_IDS`, which would pull that
 * kit's ~1,000 lines of sample planners into the eagerly-bundled canvas path just to read thirteen
 * strings -- the same bundle discipline `studio-selection-chrome-mirror` follows for the overlay's
 * node name. `studio-live-transform-preview-eligibility.test.ts` pins this set equal to the kit's
 * own exported list, so a brush added there fails the build rather than slipping past the guard.
 */
const STUDIO_WORLD_PARAMETERIZED_BRUSH_IDS: ReadonlySet<string> = new Set([
  "web-kaleido-ink",
  "web-fur-strand",
  "web-contour-double",
  "web-radial-burst",
  "web-mirror-ink",
  "web-grid-ink",
  "web-spiro-orbit",
  "web-zigzag-edge",
  "web-neon-tube",
  "web-pressure-flat",
  "web-smudge-trail",
  "web-cross-hatch-pen",
]);

/** Exported for the drift test alone; the guard reads the set directly. */
export const STUDIO_LIVE_TRANSFORM_WORLD_PARAMETERIZED_BRUSH_IDS =
  STUDIO_WORLD_PARAMETERIZED_BRUSH_IDS;

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
  const brushId = draw.brush;
  const catalogId = draw.brushCatalogId;
  if (studioBrushEngineResamplesCoordinates(brushId) || studioBrushEngineResamplesCoordinates(catalogId)) {
    return true;
  }
  if (typeof brushId === "string" && STUDIO_COORDINATE_RESAMPLED_BRUSH_IDS.has(brushId)) {
    return true;
  }
  if (typeof catalogId === "string" && STUDIO_COORDINATE_RESAMPLED_BRUSH_IDS.has(catalogId)) {
    return true;
  }
  if (typeof brushId === "string" && STUDIO_WORLD_PARAMETERIZED_BRUSH_IDS.has(brushId)) {
    return true;
  }
  if (typeof catalogId === "string" && STUDIO_WORLD_PARAMETERIZED_BRUSH_IDS.has(catalogId)) {
    return true;
  }
  return false;
}
