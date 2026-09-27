import type { StudioCanvasViewportProps } from "./StudioCanvasViewportTypes";

export type StudioCanvasElementSelectionState = Pick<
  StudioCanvasViewportProps,
  | "tool"
  | "activeSurfaceReviewLocked"
  | "canvasInteractionBlocked"
  | "commentPinArmed"
  | "advancedFillArmed"
  | "pixelToolArmed"
  | "cropArmed"
  | "panelSplitArmed"
  | "nodeEditArmed"
  | "smudgeArmed"
  | "dodgeBurnArmed"
  | "wetMixArmed"
  | "liquifyArmed"
  | "healCloneArmed"
  | "layerMaskPaintArmed"
  | "filterMaskPaintArmed"
  | "quickMaskArmed"
  | "historyBrushArmed"
  | "bubbleShapeArmed"
  | "puppetWarpArmed"
>;

/** 무장한 도구가 포인터를 소유하는 동안 렌더러와 관계없이 선택 대상을 유지한다. */
export function canSelectStudioCanvasElement(state: StudioCanvasElementSelectionState): boolean {
  return state.tool === "select"
    && !state.activeSurfaceReviewLocked
    && !state.canvasInteractionBlocked
    && !state.commentPinArmed
    && !state.advancedFillArmed
    && !state.pixelToolArmed
    && !state.cropArmed
    && !state.panelSplitArmed
    && !state.nodeEditArmed
    && !state.smudgeArmed
    && !state.dodgeBurnArmed
    && !state.wetMixArmed
    && !state.liquifyArmed
    && !state.healCloneArmed
    && !state.layerMaskPaintArmed
    && !state.filterMaskPaintArmed
    && !state.quickMaskArmed
    && !state.historyBrushArmed
    && !state.bubbleShapeArmed
    && !state.puppetWarpArmed;
}
