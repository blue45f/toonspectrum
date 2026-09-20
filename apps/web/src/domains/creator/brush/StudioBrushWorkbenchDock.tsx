import { PanelLeftClose, SlidersHorizontal, SquareArrowOutUpRight } from "lucide-react";

import { StudioBrushLibrarySheet, type StudioBrushLibrarySheetProps } from "./StudioBrushLibrarySheet";

export interface StudioBrushWorkbenchDockProps extends Pick<StudioBrushLibrarySheetProps,
  "activeBrushId" | "operation" | "favoriteIds" | "recentIds" | "restoredView"
  | "onViewStateChange" | "onSelect" | "onToggleFavorite"> {
  expanded?: boolean;
  onCollapse: () => void;
  onOpenBrushStudio: () => void;
  onExpandCatalog: (trigger: HTMLButtonElement) => void;
}

/** Presentation only: the catalogue owns selection/loading; the editor owns brush state. */
export function StudioBrushWorkbenchDock({
  expanded = false, onCollapse, onOpenBrushStudio, onExpandCatalog, ...catalog
}: StudioBrushWorkbenchDockProps) {
  return (
    <aside
      id="studio-brush-workbench"
      aria-label="브러시 작업 패널"
      data-studio-brush-workbench-dock="true"
      className="hidden h-full min-h-0 w-64 shrink-0 flex-col border-r border-line bg-panel lg:flex xl:w-[17rem]"
    >
      <header className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
        <h2 className="text-sm font-semibold text-fg">{catalog.operation === "erase" ? "지우개 라이브러리" : "브러시 라이브러리"}</h2>
        <button type="button" onClick={onCollapse} aria-label="브러시 패널 접기"
          className="grid size-11 shrink-0 place-items-center rounded-lg text-fg-2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <PanelLeftClose size={17} aria-hidden />
        </button>
      </header>
      <div className="min-h-0 flex-1">
        {expanded ? <p className="p-3 text-sm leading-relaxed text-fg-2">확장 보기에서 브러시를 고르고 있어요. 닫으면 이 패널로 돌아옵니다.</p> : <StudioBrushLibrarySheet {...catalog} open embedded workbench
          autoFocusSearch={false} dismissOnEscape={false}
          closeOnSelection={false} dismissOnOutsidePointer={false}
          onClose={onCollapse} />}
      </div>
      <footer className="flex shrink-0 flex-wrap gap-1 border-t border-line p-2">
        <button type="button" onClick={onOpenBrushStudio}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line px-2 text-xs text-fg-2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <SlidersHorizontal size={14} aria-hidden />브러시 편집
        </button>
        <button type="button" onClick={(event) => onExpandCatalog(event.currentTarget)}
          title="엔진 필터와 브러시 상세 정보가 있는 전체 라이브러리"
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line px-2 text-xs text-fg-2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <SquareArrowOutUpRight size={14} aria-hidden />{expanded ? "도킹 보기" : "확장 보기"}
        </button>
      </footer>
    </aside>
  );
}
