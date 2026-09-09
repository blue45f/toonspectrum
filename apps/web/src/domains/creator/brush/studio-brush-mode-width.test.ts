import { describe, expect, it } from "vitest";

import {
  planStudioDrawModeChange,
  planStudioStrokeWidthChange,
  type StudioBrushModeWidthState,
} from "./studio-brush-mode-width";

const PEN_STATE: StudioBrushModeWidthState = {
  drawMode: "pen",
  strokeWidth: 7,
  lastNonPixelStrokeWidth: 7,
};

describe("Studio pixel-pencil width isolation", () => {
  it("keeps an integer pixel tip while restoring the non-pixel width on exit", () => {
    const pixel = planStudioDrawModeChange(PEN_STATE, "pixel");
    expect(pixel).toEqual({
      drawMode: "pixel",
      strokeWidth: 7,
      lastNonPixelStrokeWidth: 7,
    });

    expect(planStudioDrawModeChange(pixel, "pen")).toEqual(PEN_STATE);
  });

  it("edits the active pixel tip without overwriting the remembered brush width", () => {
    const pixel = planStudioDrawModeChange(PEN_STATE, "pixel");
    expect(planStudioStrokeWidthChange(pixel, 47.6)).toEqual({
      drawMode: "pixel",
      strokeWidth: 48,
      lastNonPixelStrokeWidth: 7,
    });
  });

  it("clamps unsafe pixel widths and preserves later non-pixel edits", () => {
    const pixel = planStudioDrawModeChange(
      { ...PEN_STATE, strokeWidth: 500 },
      "pixel",
    );
    expect(pixel.strokeWidth).toBe(64);
    expect(planStudioStrokeWidthChange(pixel, Number.POSITIVE_INFINITY).strokeWidth).toBe(64);

    const marker = planStudioDrawModeChange(PEN_STATE, "eraser");
    const resized = planStudioStrokeWidthChange(marker, 18);
    const resizedPixel = planStudioDrawModeChange(resized, "pixel");
    expect(planStudioDrawModeChange(resizedPixel, "shape")).toMatchObject({
      drawMode: "shape",
      strokeWidth: 18,
      lastNonPixelStrokeWidth: 18,
    });
  });
});
