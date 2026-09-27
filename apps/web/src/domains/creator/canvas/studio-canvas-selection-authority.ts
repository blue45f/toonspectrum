import type { StudioCanvasViewportProps } from "./StudioCanvasViewportTypes";

type SelectionAuthority = Pick<StudioCanvasViewportProps,
  "tool" | "activeSurfaceReviewLocked" | "canvasInteractionBlocked" | "commentPinArmed"
  | "advancedFillArmed" | "pixelToolArmed" | "cropArmed" | "panelSplitArmed"
  | "nodeEditArmed" | "smudgeArmed" | "dodgeBurnArmed" | "wetMixArmed"
  | "liquifyArmed" | "healCloneArmed" | "layerMaskPaintArmed" | "filterMaskPaintArmed"
  | "quickMaskArmed" | "historyBrushArmed" | "bubbleShapeArmed" | "puppetWarpArmed">;

/** Konva 문서 경로처럼 편집 도구가 소유한 접촉은 선택 전환에 사용하지 않는다. */
export function studioCanvasDocumentSelectionEnabled(authority: SelectionAuthority): boolean {
  return authority.tool === "select"
    && !authority.activeSurfaceReviewLocked && !authority.canvasInteractionBlocked && !authority.commentPinArmed
    && !authority.advancedFillArmed && !authority.pixelToolArmed && !authority.cropArmed && !authority.panelSplitArmed
    && !authority.nodeEditArmed && !authority.smudgeArmed && !authority.dodgeBurnArmed && !authority.wetMixArmed
    && !authority.liquifyArmed && !authority.healCloneArmed && !authority.layerMaskPaintArmed && !authority.filterMaskPaintArmed
    && !authority.quickMaskArmed && !authority.historyBrushArmed && !authority.bubbleShapeArmed && !authority.puppetWarpArmed;
}

