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

  it("keeps the preview for brushes that are not coordinate-resampled", () => {
    expect(studioLiveTransformPreviewBlockedForElement(draw({ brush: "pen" }), false)).toBe(false);
    expect(
      studioLiveTransformPreviewBlockedForElement(draw({ brushCatalogId: "calligraphy" }), false),
    ).toBe(false);
  });

  it("ignores non-draw elements entirely", () => {
    // Coordinate elements carry their transform in the document, so this guard has no say on them.
    expect(
      studioLiveTransformPreviewBlockedForElement({ id: "i", type: "image" } as unknown as El, true),
    ).toBe(false);
  });
});
