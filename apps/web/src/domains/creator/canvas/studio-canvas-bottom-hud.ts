import type { CSSProperties } from "react";

/**
 * 캔버스 오른쪽 아래 HUD 버튼(도움말·단축키·빠른 실행)의 바닥 위치.
 * 그리기 옵션 도크와 하단 페이지 스트립(`--studio-page-strip-offset`)이 차지한 높이만큼 비켜선다.
 */
export const STUDIO_CANVAS_BOTTOM_HUD_CLASS = "bottom-[calc(0.75rem+var(--studio-page-strip-offset,0px))]";

export function studioCanvasBottomHudStyle(drawing: boolean): CSSProperties | undefined {
  return drawing
    ? { bottom: "calc(var(--studio-draw-options-height, 3.75rem) + 1.25rem + var(--studio-page-strip-offset, 0px))" }
    : undefined;
}
