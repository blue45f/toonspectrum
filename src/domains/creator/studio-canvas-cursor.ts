import type { DrawMode, Tool } from "./studio-editor-tool-model";

export type StudioCanvasCursorClassName =
  | "cursor-crosshair"
  | "cursor-default"
  | "cursor-grab"
  | "cursor-grabbing"
  | "cursor-none"
  | "cursor-not-allowed";

export interface StudioCanvasCursorInput {
  tool: Tool;
  drawMode: DrawMode;
  isSpacePressed: boolean;
  isPanning: boolean;
  interactionBlocked: boolean;
  commentPinArmed: boolean;
  eyedropperActive: boolean;
  advancedFillArmed: boolean;
  cropArmed: boolean;
  pixelToolArmed: boolean;
  panelSplitArmed: boolean;
  nodeEditArmed: boolean;
  bubbleShapeArmed: boolean;
  puppetWarpArmed: boolean;
  perspectiveRulerActive: boolean;
  precisionBrushArmed: boolean;
}

export type StudioCanvasViewportCursorInput = Pick<
  StudioCanvasCursorInput,
  "tool" | "isSpacePressed" | "isPanning" | "interactionBlocked"
>;

/** The scrollable workspace only advertises pan/lock actions that also work outside the paper. */
export function studioCanvasViewportCursorClassName(
  input: StudioCanvasViewportCursorInput
): StudioCanvasCursorClassName {
  if (input.interactionBlocked) return "cursor-not-allowed";
  if (input.isPanning) return "cursor-grabbing";
  if (input.isSpacePressed || input.tool === "hand") return "cursor-grab";
  return "cursor-default";
}

/**
 * Resolves one native cursor for the whole canvas viewport. Konva's precision brush rings remain
 * the richer in-canvas preview; `cursor-none` prevents the OS arrow from obscuring those rings.
 */
export function studioCanvasCursorClassName(
  input: StudioCanvasCursorInput
): StudioCanvasCursorClassName {
  const viewportCursor = studioCanvasViewportCursorClassName(input);
  if (viewportCursor !== "cursor-default") return viewportCursor;
  if (input.precisionBrushArmed) return "cursor-none";
  if (
    input.commentPinArmed
    || input.eyedropperActive
    || input.advancedFillArmed
    || input.cropArmed
    || input.pixelToolArmed
    || input.panelSplitArmed
    || input.nodeEditArmed
    || input.bubbleShapeArmed
    || input.puppetWarpArmed
    || input.perspectiveRulerActive
  ) {
    return "cursor-crosshair";
  }
  if (input.tool === "draw") {
    return input.drawMode === "shape" || input.drawMode === "lasso-fill"
      ? "cursor-crosshair"
      : "cursor-none";
  }
  return "cursor-default";
}
