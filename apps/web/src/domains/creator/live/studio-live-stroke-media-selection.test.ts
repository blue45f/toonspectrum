import { describe, expect, it } from "vitest";

import { BRUSH_STUDIO_V6_RECIPES } from "../brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6ProductBrush } from "../brush-lab/brush-studio-v6-product-bridge";
import { STUDIO_PIXEL_PENCIL_RENDER_MODE } from "../studio-pixel-pencil";
import { selectStudioLiveStrokeMedia, studioHokusaiLiveStrokeSelected } from "./studio-live-stroke-media-selection";

import type { DrawEl } from "../studio-element-model";
import type { StudioLiveStrokeMediaSelectionInput } from "./studio-live-stroke-media-selection";

const defaults: StudioLiveStrokeMediaSelectionInput = {
  livingInkPhysicalModeEnabled: false,
  retainedHasSettledStrokes: false,
  explicitBackend: undefined,
  hardwareReady: false,
  rolloutPrefersGpu: false,
};
function stroke(overrides: Partial<DrawEl> = {}): DrawEl {
  return {
    id: "admission", type: "draw", kind: "freehand", mode: "pen",
    points: [0, 0, 20, 10], pressures: [0.3, 0.8], stroke: "#123456",
    strokeWidth: 20, opacity: 1, brush: "pen", ...overrides,
  };
}

describe("live stroke media selection", () => {
  it("pins every saved material recipe ahead of legacy stamp, wet and GPU candidates", () => {
    for (const recipe of BRUSH_STUDIO_V6_RECIPES) {
      const saved = createBrushStudioV6ProductBrush(recipe.create());
      for (const brush of [saved.brushId, "airbrush-fine", "ink-wash"]) {
        expect(selectStudioLiveStrokeMedia(stroke({
          brush, brushEnginePrograms: saved.enginePrograms!,
          watercolorPipeline: "causal-walker-v2", stampPipeline: "causal-walker-v2",
        }), { ...defaults, livingInkPhysicalModeEnabled: true, explicitBackend: "webgpu" }), recipe.id)
          .toEqual({ kind: "retained" });
      }
    }
  });

  it.each(["oil", "pencil", "calligraphy", "highlighter"])(
    "keeps legacy %s contacts on the retained renderer",
    (brush) => expect(selectStudioLiveStrokeMedia(stroke({ brush }), defaults)).toEqual({ kind: "retained" }),
  );

  it("preserves the stamp kind and the separate wet-media contract", () => {
    expect(selectStudioLiveStrokeMedia(stroke({ brush: "airbrush-fine", stampPipeline: "causal-walker-v2" }), defaults))
      .toEqual({ kind: "stamp", stampKind: "airbrush" });
    const wet = stroke({ brush: "ink-wash", watercolorPipeline: "causal-walker-v2" });
    expect(selectStudioLiveStrokeMedia(wet, defaults)).toEqual({ kind: "wet" });
    expect(selectStudioLiveStrokeMedia(wet, { ...defaults, livingInkPhysicalModeEnabled: true }))
      .toEqual({ kind: "wet" });
    expect(studioHokusaiLiveStrokeSelected(wet)).toBe(false);
  });

  it("allows erasing retained ink only while that renderer owns settled strokes", () => {
    const eraser = stroke({ mode: "eraser" });
    expect(selectStudioLiveStrokeMedia(eraser, defaults)).toEqual({ kind: "canvas2d" });
    expect(selectStudioLiveStrokeMedia(eraser, { ...defaults, retainedHasSettledStrokes: true }))
      .toEqual({ kind: "retained" });
  });

  it("leaves pixel strokes on their existing dedicated path", () => {
    expect(selectStudioLiveStrokeMedia(stroke({ brush: STUDIO_PIXEL_PENCIL_RENDER_MODE }), defaults))
      .toEqual({ kind: "none" });
  });

  it("keeps explicit GPU ownership even when its runtime is unavailable, but never selects incompatible styles", () => {
    const explicit = { ...defaults, explicitBackend: "webgpu" };
    expect(selectStudioLiveStrokeMedia(stroke(), explicit)).toEqual({ kind: "webgpu" });
    expect(selectStudioLiveStrokeMedia(stroke({ opacity: 0.6 }), explicit)).toEqual({ kind: "canvas2d" });
    expect(selectStudioLiveStrokeMedia(stroke(), { ...explicit, explicitBackend: "canvas2d", hardwareReady: true }))
      .toEqual({ kind: "canvas2d" });
  });
});
