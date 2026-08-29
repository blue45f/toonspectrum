import { describe, expect, it } from "vitest";

import { studioLiveTransformPreviewBlockedForElement } from "./studio-live-transform-preview-eligibility";

import type { El } from "./studio-element-model";

function draw(overrides: Record<string, unknown> = {}): El {
  return {
    id: "draw-1",
    type: "draw",
    points: [0, 0, 10, 10],
    stroke: "#101010",
    strokeWidth: 4,
    ...overrides,
  } as unknown as El;
}

describe("studioLiveTransformPreviewBlockedForElement", () => {
  it("allows an ordinary freehand stroke", () => {
    expect(studioLiveTransformPreviewBlockedForElement(draw(), false)).toBe(false);
  });

  it("refuses bound-derived shapes, whose commit rebuilds them axis-aligned", () => {
    // StudioDrawNode reconstructs rect/ellipse/star/triangle/polygon from drawBounds(points), so a
    // rotation shown in the preview is discarded and the commit lands an unrotated shape sized to
    // the rotated points' bounding box.
    expect(studioLiveTransformPreviewBlockedForElement(draw(), true)).toBe(true);
  });

  it("refuses symmetry strokes, whose copies regenerate about world axes", () => {
    expect(
      studioLiveTransformPreviewBlockedForElement(
        draw({ symmetry: { type: "vertical", centerX: 0, centerY: 0 } }),
        false,
      ),
    ).toBe(true);
    // "none" is not symmetry and must keep its preview.
    expect(
      studioLiveTransformPreviewBlockedForElement(
        draw({ symmetry: { type: "none", centerX: 0, centerY: 0 } }),
        false,
      ),
    ).toBe(false);
  });

  it("refuses coordinate-resampled dry media by brush id or catalogue id", () => {
    // The committed texture is replanned from dab-relative coordinates, so it is a DIFFERENT
    // texture rather than the previewed one transformed.
    // "dry-media" is the RENDERER id: pack descriptors persist it as runtimeBrushId next to an
    // unrelated catalogue id, so classifying by catalogue name alone missed all of those strokes.
    for (const id of ["dry-media", "crayon", "chalk", "charcoal", "pastel", "oil-pastel"]) {
      expect(studioLiveTransformPreviewBlockedForElement(draw({ brush: id }), false), id).toBe(true);
      expect(
        studioLiveTransformPreviewBlockedForElement(draw({ brushCatalogId: id }), false),
        `${id} (catalogue)`,
      ).toBe(true);
    }
  });

  it("refuses a pack stroke whose catalogue id is unrelated to its renderer", () => {
    // The shape that motivated classifying by renderer: a sketch pencil stores
    // brush = "dry-media" (runtimeBrushId) with a catalogue id of its own.
    expect(
      studioLiveTransformPreviewBlockedForElement(
        draw({ brush: "dry-media", brushCatalogId: "정밀 연필" }),
        false,
      ),
    ).toBe(true);
  });

  it("refuses strokes carrying per-sample stylus orientation", () => {
    // The renderer composes the nib angle from tilt AND twist together, on a branch that depends
    // on whether the sample has tilt, so no transform of these channels here is correct.
    expect(studioLiveTransformPreviewBlockedForElement(draw({ tiltXs: [1], tiltYs: [0] }), false))
      .toBe(true);
    expect(studioLiveTransformPreviewBlockedForElement(draw({ twists: [30] }), false)).toBe(true);
    // Empty channels are not stylus data and must not cost an ordinary stroke its preview.
    expect(
      studioLiveTransformPreviewBlockedForElement(
        draw({ tiltXs: [], tiltYs: [], twists: [] }),
        false,
      ),
    ).toBe(false);
  });

  it("keeps the preview for brushes that are not coordinate-resampled", () => {
    expect(studioLiveTransformPreviewBlockedForElement(draw({ brush: "pen" }), false)).toBe(false);
    expect(
      studioLiveTransformPreviewBlockedForElement(draw({ brushCatalogId: "calligraphy" }), false),
    ).toBe(false);
  });

  it("refuses the watercolor renderer family, by engine rather than by brush id", () => {
    // Two independent divergences in studio-watercolor-brush.ts: the station count is
    // ceil(totalLength / spacing) + 1, so a scale re-seeds every hash2(stationIndex, …) draw; and
    // createDiffuseDab's halo angle is hash2(stationIndex, 31, seed) * TAU, which does not follow
    // the stroke's orientation, so even a pure rotation leaves every halo pointing the old way.
    for (const brush of ["watercolor", "ink-wash", "gouache", "inkwash-bleed-wash"]) {
      expect(studioLiveTransformPreviewBlockedForElement(draw({ brush }), false), brush).toBe(true);
    }
    // Resolved through the runtime contract, so a lane whose catalogue id differs from its
    // renderer is caught the same way.
    expect(
      studioLiveTransformPreviewBlockedForElement(
        draw({ brush: "watercolor", brushCatalogId: "수채 · 과립 번짐" }),
        false,
      ),
    ).toBe(true);
  });

  it("refuses the world-axis renderers, which regenerate marks the stroke never turns", () => {
    // screentoneDotsForStroke lays every dot on a global lattice in world coordinates -- the whole
    // point of the design, and the reason a rotation cannot be previewed.
    for (const brush of ["screentone", "crosshatch"]) {
      expect(studioLiveTransformPreviewBlockedForElement(draw({ brush }), false), brush).toBe(true);
    }
    // planGlitterBrushParticles takes each spark's angle from hash2(stationIndex, ...) * TAU, which
    // does not follow the stroke's orientation.
    for (const brush of ["glitter", "star-dust", "sparkle-star"]) {
      expect(studioLiveTransformPreviewBlockedForElement(draw({ brush }), false), brush).toBe(true);
    }
  });

  it("refuses sketch-styled lines and arrows, whose Rough.js wobble is replanned", () => {
    // buildStudioRoughShapeRenderPlan derives its perturbations from the points it is handed, so
    // the commit's replan wobbles differently from the previewed path even with the seed,
    // roughness and bowing untouched.
    expect(
      studioLiveTransformPreviewBlockedForElement(
        draw({ kind: "line", sketch: { enabled: true, roughness: 1.2, bowing: 1 } }),
        false,
      ),
    ).toBe(true);
    expect(
      studioLiveTransformPreviewBlockedForElement(
        draw({ kind: "arrow", sketch: { enabled: true } }),
        false,
      ),
    ).toBe(true);
    // A disabled sketch style renders through the clean primitive branch and keeps its preview.
    expect(
      studioLiveTransformPreviewBlockedForElement(
        draw({ kind: "line", sketch: { enabled: false, roughness: 1.2 } }),
        false,
      ),
    ).toBe(false);
    // StudioDrawNode never builds a sketch plan for freehand strokes, so a stray style on one
    // must not cost it the preview.
    expect(
      studioLiveTransformPreviewBlockedForElement(draw({ sketch: { enabled: true } }), false),
    ).toBe(false);
  });

  it("ignores non-draw elements entirely", () => {
    // Coordinate elements carry their transform in the document, so this guard has no say on them.
    expect(
      studioLiveTransformPreviewBlockedForElement({ id: "i", type: "image" } as unknown as El, true),
    ).toBe(false);
  });
});
