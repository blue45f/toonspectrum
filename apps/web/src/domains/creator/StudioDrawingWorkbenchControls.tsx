import { PanelsTopLeft, PanelLeft, Undo2 } from "lucide-react";

import type { StudioOptionsBarsHandlers } from "./StudioOptionsBars";

export interface StudioDrawingWorkbenchControlsProps {
  libraryOpen: boolean;
  undoAvailable: boolean;
  handlers: Pick<StudioOptionsBarsHandlers,
    "toggleBrushDock" | "restoreDrawingLayout" | "undoDrawingLayoutRestore">;
}

const button = "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-fg-2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function StudioDrawingWorkbenchControls({
  libraryOpen, undoAvailable, handlers,
}: StudioDrawingWorkbenchControlsProps) {
  if (!handlers.toggleBrushDock && !handlers.restoreDrawingLayout) return null;
  return (
    <div role="group" aria-label="드로잉 작업 배치"
      className="flex shrink-0 items-center gap-1 border-r border-line px-1">
      {handlers.toggleBrushDock ? (
        <button type="button" className={button} onClick={handlers.toggleBrushDock}
          aria-label={libraryOpen ? "브러시 패널 접기" : "브러시 패널 열기"}
          aria-expanded={libraryOpen} aria-controls={libraryOpen ? "studio-brush-workbench" : undefined}>
          <PanelLeft size={16} aria-hidden /><span>브러시</span>
        </button>
      ) : null}
      {handlers.restoreDrawingLayout ? (
        <button type="button" className={button} onClick={handlers.restoreDrawingLayout}
          aria-label="드로잉 기본 배치 복원"
          title="브러시·레이어 중심으로 배치를 복원합니다. 원고, 브러시와 단축키는 바꾸지 않습니다.">
          <PanelsTopLeft size={16} aria-hidden /><span className="hidden xl:inline">배치 복원</span>
        </button>
      ) : null}
      {undoAvailable && handlers.undoDrawingLayoutRestore ? (
        <button type="button" className={button} onClick={handlers.undoDrawingLayoutRestore}
          aria-label="이전 작업 배치로 되돌리기" title="이번 세션에서 복원 직전의 배치로 돌아갑니다">
          <Undo2 size={16} aria-hidden /><span className="hidden xl:inline">이전 배치</span>
        </button>
      ) : null}
    </div>
  );
}
