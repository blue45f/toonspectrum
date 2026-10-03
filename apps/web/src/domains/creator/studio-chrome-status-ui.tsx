/**
 * Studio chrome UI — 상단 빠른 작업 바와 캔버스 상태 바.
 * (2026-10-03 파일 크기 래칫 해소로 studio-chrome-ui에서 추출 — 동작 변경 없음.)
 */

import type { CSSProperties, ReactElement, ReactNode } from "react";

import { handleStudioHorizontalWheel } from "./studio-horizontal-wheel";

import { cn } from "@/shared/lib/utils";

/**
 * Top Bar Quick Actions — undo / redo / zoom / fit, icon-first.
 * Lives in the horizontal tool belt center (quick actions strip).
 */
export function StudioQuickActionsBar({
  children,
  className,
  "aria-label": ariaLabel = "빠른 작업",
}: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}): ReactElement {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-studio-quick-actions="true"
      className={cn("studio-opt-cluster shrink-0", className)}
    >
      {children}
    </div>
  );
}

/**
 * Sketchbook/Krita/Concepts status bar — zoom + tool metrics over the canvas.
 * Does not steal layout height when position=absolute.
 */
export function StudioStatusBar({
  children,
  className,
  id = "studio-status-bar",
  style,
  "aria-label": ariaLabel = "캔버스 상태 및 보기",
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  style?: CSSProperties;
  "aria-label"?: string;
}): ReactElement {
  return (
    <div
      id={id}
      role="group"
      aria-label={ariaLabel}
      data-studio-status-bar="true"
      tabIndex={-1}
      style={style}
      onWheel={handleStudioHorizontalWheel}
      className={cn(
        "pointer-events-auto absolute bottom-3.5 left-3.5 z-[10] flex min-w-0 max-w-[calc(100%_-_11rem)] flex-nowrap items-center gap-1.5 overflow-x-auto overscroll-x-contain",
        "touch-pan-x scroll-px-3 whitespace-nowrap [word-break:keep-all] [overflow-wrap:normal] [scrollbar-width:thin] [&>*]:shrink-0",
        "sm:max-w-[min(calc(100%_-_11rem),44rem)]",
        "rounded-2xl px-2.5 py-1.5 text-[0.68rem] font-semibold tracking-tight text-fg-2",
        className
      )}
    >
      {children}
    </div>
  );
}
