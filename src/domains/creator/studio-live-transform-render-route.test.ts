import { describe, expect, it } from "vitest";

import {
  studioLiveTransformRouteOfPoints,
  studioLiveTransformRouteSurvivesScale,
} from "./studio-live-transform-render-route";

/** A stroke comfortably inside every route: thick enough, long enough, densely sampled. */
const SAFE = { strokeWidth: 8, strokeDistance: 100, pointCount: 40 } as const;

describe("studioLiveTransformRouteSurvivesScale", () => {
  it("allows a stroke that stays well inside every route", () => {
    for (const scale of [0.5, 0.9, 1, 1.1, 1.7]) {
      expect(studioLiveTransformRouteSurvivesScale(SAFE, scale), `${scale}`).toBe(true);
    }
  });

  it("refuses a scale that drives the stroke under the renderer's 1px diameter floor", () => {
    // StudioDrawNode draws Math.max(1, el.strokeWidth). Halving a 1px stroke previews a 0.5px nib
    // and commits strokeWidth 0.5, which the renderer floors straight back to 1px.
    expect(studioLiveTransformRouteSurvivesScale({ ...SAFE, strokeWidth: 1 }, 0.5)).toBe(false);
    expect(studioLiveTransformRouteSurvivesScale({ ...SAFE, strokeWidth: 2 }, 0.25)).toBe(false);
    // Already below the floor, staying below it: the preview scales a 1px render while the commit
    // still floors to 1px, so they disagree too.
    expect(studioLiveTransformRouteSurvivesScale({ ...SAFE, strokeWidth: 0.5 }, 0.5)).toBe(false);
    // Scaling a sub-floor stroke UP past the floor also switches routes.
    expect(studioLiveTransformRouteSurvivesScale({ ...SAFE, strokeWidth: 0.5 }, 4)).toBe(false);
    // Away from the floor in both readings, it is exact.
    expect(studioLiveTransformRouteSurvivesScale({ ...SAFE, strokeWidth: 4 }, 0.5)).toBe(true);
  });

  it("refuses a scale that crosses the 16px compact-route cutoff", () => {
    // A 10px flick scaled 2x previews the enlarged compact fallback and commits a tapered outline.
    expect(
      studioLiveTransformRouteSurvivesScale(
        { strokeWidth: 8, strokeDistance: 10, pointCount: 3 },
        2,
      ),
    ).toBe(false);
    // And the reverse: a 20px stroke shrunk under the cutoff.
    expect(
      studioLiveTransformRouteSurvivesScale(
        { strokeWidth: 8, strokeDistance: 20, pointCount: 3 },
        0.5,
      ),
    ).toBe(false);
    // Comfortably short on both sides stays previewable.
    expect(
      studioLiveTransformRouteSurvivesScale(
        { strokeWidth: 8, strokeDistance: 4, pointCount: 3 },
        2,
      ),
    ).toBe(true);
  });

  it("refuses a scale that crosses the 180px sparse-long cutoff", () => {
    expect(studioLiveTransformRouteSurvivesScale({ ...SAFE, strokeDistance: 100 }, 2)).toBe(false);
    expect(studioLiveTransformRouteSurvivesScale({ ...SAFE, strokeDistance: 200 }, 0.5)).toBe(false);
  });

  it("refuses a scale that flips the sparse-spacing predicate on its non-linear floor", () => {
    // The floor is Math.max(20, strokeWidth * 4), which is NOT linear in scale, so this can flip
    // even when both distance cutoffs hold. Spacing 24px against a floor of 20 (width 2) is
    // sparse; at 4x the spacing is 96 and the floor becomes max(20, 32) = 32, still sparse -- but
    // shrinking makes the floor stick at 20 while the spacing falls below it.
    const stroke = { strokeWidth: 2, strokeDistance: 240, pointCount: 11 } as const;
    expect(studioLiveTransformRouteSurvivesScale(stroke, 0.5)).toBe(false);
  });

  it("refuses a scale that crosses the perfect-freehand 400px outline cap", () => {
    // studioPerfectFreehandStrokeOptions clamps the committed outline to 400px, so a 300px stroke
    // scaled 2x previews a 600px outline and re-renders at 400px.
    expect(studioLiveTransformRouteSurvivesScale({ ...SAFE, strokeWidth: 300 }, 2)).toBe(false);
    expect(studioLiveTransformRouteSurvivesScale({ ...SAFE, strokeWidth: 500 }, 0.5)).toBe(false);
    // Both readings under the cap: exact.
    expect(studioLiveTransformRouteSurvivesScale({ ...SAFE, strokeWidth: 100 }, 1.5)).toBe(true);
  });

  it("refuses a scale that crosses the 8px arrowhead floor, for strokes that draw one", () => {
    // The head is Math.max(8, strokeWidth * 2). A 2px arrow scaled 2x previews its existing 8px
    // head at 16px while the commit regenerates it at 8px.
    // strokeDistance 40 keeps both readings inside the 16/180 cutoffs at 2x, so this assertion
    // isolates the head floor rather than tripping a distance branch.
    const arrow = {
      strokeWidth: 2,
      strokeDistance: 40,
      pointCount: 40,
      drawsArrowHead: true,
    } as const;
    expect(studioLiveTransformRouteSurvivesScale(arrow, 2)).toBe(false);
    // Above the floor on both sides, the head scales exactly.
    expect(
      studioLiveTransformRouteSurvivesScale({ ...arrow, strokeWidth: 20 }, 2),
    ).toBe(true);
    // A stroke that draws no head does not pay for the check.
    expect(
      studioLiveTransformRouteSurvivesScale({ ...arrow, drawsArrowHead: false }, 2),
    ).toBe(true);
  });

  it("refuses anything it cannot read, because an unreadable route is not a licence", () => {
    expect(studioLiveTransformRouteSurvivesScale(SAFE, Number.NaN)).toBe(false);
    expect(studioLiveTransformRouteSurvivesScale(SAFE, 0)).toBe(false);
    expect(studioLiveTransformRouteSurvivesScale(SAFE, -1)).toBe(false);
    expect(studioLiveTransformRouteSurvivesScale({ ...SAFE, strokeWidth: Number.NaN }, 2))
      .toBe(false);
    expect(studioLiveTransformRouteSurvivesScale({ ...SAFE, strokeDistance: Number.NaN }, 2))
      .toBe(false);
  });
});

describe("studioLiveTransformRouteOfPoints", () => {
  it("reads the renderer's own strokeDistance off the point bounds", () => {
    // hypot of the bounding span, matching StudioDrawNode's strokeSpanX/strokeSpanY reading.
    expect(studioLiveTransformRouteOfPoints([0, 0, 3, 4], 5)).toEqual({
      strokeWidth: 5,
      strokeDistance: 5,
      pointCount: 2,
    });
  });

  it("reports a zero-length route for an empty stroke rather than an infinity", () => {
    expect(studioLiveTransformRouteOfPoints([], 3)).toEqual({
      strokeWidth: 3,
      strokeDistance: 0,
      pointCount: 0,
    });
  });
});
