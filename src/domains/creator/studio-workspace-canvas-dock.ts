import { studioUiDensityAllows, type StudioUiDensityMode } from "./studio-ui-density";

const STUDIO_CANVAS_DOCK_GAP_OPEN = 8;
const STUDIO_CANVAS_DRAW_TOOL_RAIL_WIDTH = 52;

export interface StudioWorkspaceCanvasDockInsets {
  readonly left: number;
  readonly right: number;
}

export interface StudioWorkspaceCanvasDockInsetsInput {
  readonly leftPanelWidth: number;
  readonly rightPanelWidth: number;
  readonly visibleLeftPanelOpen: boolean;
  readonly visibleRightPanelOpen: boolean;
  readonly uiDensityMode: StudioUiDensityMode;
}

export function resolveStudioWorkspaceCanvasDockInsets(
  input: StudioWorkspaceCanvasDockInsetsInput,
): StudioWorkspaceCanvasDockInsets {
  const toolRailInset = studioUiDensityAllows(input.uiDensityMode, "tool-rail")
    ? STUDIO_CANVAS_DRAW_TOOL_RAIL_WIDTH
    : 0;

  return {
    left:
      (input.visibleLeftPanelOpen
        ? input.leftPanelWidth + STUDIO_CANVAS_DOCK_GAP_OPEN
        : 0) + toolRailInset,
    right: input.visibleRightPanelOpen
      ? input.rightPanelWidth + STUDIO_CANVAS_DOCK_GAP_OPEN
      : 0,
  };
}
