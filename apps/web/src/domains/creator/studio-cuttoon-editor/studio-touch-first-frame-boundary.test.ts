import { describe, expect, it } from "vitest";

import { shouldActivateStudioStrokeFocusForPointer } from "../studio-stroke-focus-activity";
import pointerDownSource from "./studio-cuttoon-stage-pointers-down-draw.ts?raw";

describe("Studio mobile touch first-frame boundary", () => {
  it("does not mutate shell stroke-focus chrome on a touch pointerdown", () => {
    const drawingAssigned = pointerDownSource.indexOf("drawingRef.current = next;");
    const focusGuard = pointerDownSource.indexOf(
      "if (shouldActivateStudioStrokeFocusForPointer(pointerSample.pointerType))",
      drawingAssigned,
    );
    const focusMutation = pointerDownSource.indexOf(
      'setStudioStrokeFocusActivity("canvas-stroke", true)',
      focusGuard,
    );
    const previewStart = pointerDownSource.indexOf(
      "drawingGesturePreviewPublisherRef.current.begin",
      focusMutation,
    );

    expect(shouldActivateStudioStrokeFocusForPointer("touch")).toBe(false);
    expect(shouldActivateStudioStrokeFocusForPointer("pen")).toBe(true);
    expect(drawingAssigned).toBeGreaterThan(-1);
    expect(focusGuard).toBeGreaterThan(drawingAssigned);
    expect(focusMutation).toBeGreaterThan(focusGuard);
    expect(previewStart).toBeGreaterThan(focusMutation);
  });
});
