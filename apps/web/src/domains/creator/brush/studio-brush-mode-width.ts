import type { DrawMode } from "../studio-editor-tool-model";
import {
  normalizeStudioPixelPencilStrokeWidth,
  STUDIO_PIXEL_PENCIL_MIN_STROKE_WIDTH,
} from "../studio-pixel-pencil";

export interface StudioBrushModeWidthState {
  readonly drawMode: DrawMode;
  readonly strokeWidth: number;
  readonly lastNonPixelStrokeWidth: number;
}

function pixelWidth(requested: number, fallback: number): number {
  return normalizeStudioPixelPencilStrokeWidth(requested)
    ?? normalizeStudioPixelPencilStrokeWidth(fallback)
    ?? STUDIO_PIXEL_PENCIL_MIN_STROKE_WIDTH;
}

export function planStudioStrokeWidthChange(
  state: StudioBrushModeWidthState,
  requestedWidth: number,
): StudioBrushModeWidthState {
  if (state.drawMode === "pixel") {
    return {
      ...state,
      strokeWidth: pixelWidth(requestedWidth, state.strokeWidth),
    };
  }
  return {
    ...state,
    strokeWidth: requestedWidth,
    lastNonPixelStrokeWidth: requestedWidth,
  };
}

export function planStudioDrawModeChange(
  state: StudioBrushModeWidthState,
  nextMode: DrawMode,
): StudioBrushModeWidthState {
  if (nextMode === state.drawMode) {
    return state.drawMode === "pixel"
      ? { ...state, strokeWidth: pixelWidth(state.strokeWidth, 1) }
      : state;
  }
  if (nextMode === "pixel") {
    return {
      drawMode: nextMode,
      strokeWidth: pixelWidth(state.strokeWidth, 1),
      lastNonPixelStrokeWidth:
        state.drawMode === "pixel"
          ? state.lastNonPixelStrokeWidth
          : state.strokeWidth,
    };
  }
  return {
    drawMode: nextMode,
    strokeWidth:
      state.drawMode === "pixel"
        ? state.lastNonPixelStrokeWidth
        : state.strokeWidth,
    lastNonPixelStrokeWidth:
      state.drawMode === "pixel"
        ? state.lastNonPixelStrokeWidth
        : state.strokeWidth,
  };
}
