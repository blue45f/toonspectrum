import { PanelLeftClose, SlidersHorizontal, SquareArrowOutUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStudioBrushDockLayout } from "./useStudioBrushDockLayout";
import { StudioBrushLibrarySheet, type StudioBrushLibrarySheetProps } from "./StudioBrushLibrarySheet";

export interface StudioBrushWorkbenchDockProps extends Pick<StudioBrushLibrarySheetProps,
  "activeBrushId" | "operation" | "favoriteIds" | "recentIds" | "restoredView"
  | "onViewStateChange" | "onSelect" | "onToggleFavorite"> {
  width?: number;
  onWidthChange?: (width: number) => void;
  sizeLocked?: boolean;
  opacityLocked?: boolean;
  onToggleSizeLock?: () => void;
  onToggleOpacityLock?: () => void;
  modifiedCount?: number;
  onRestoreDefaults?: () => void;
  expanded?: boolean;
  onCollapse: () => void;
  onOpenBrushStudio: () => void;
  onExpandCatalog: (trigger: HTMLButtonElement) => void;
}

export function StudioBrushWorkbenchDock({
  expanded = false, width = 240, onWidthChange, sizeLocked = false, opacityLocked = false,
  onToggleSizeLock, onToggleOpacityLock, modifiedCount = 0, onRestoreDefaults,
  onCollapse, onOpenBrushStudio, onExpandCatalog, ...catalog
}: StudioBrushWorkbenchDockProps) {
  const rootRef = useRef<HTMLElement>(null);
  const [draftWidth, setDraftWidth] = useState(width);
  const draftWidthRef = useRef(width);
  const { overlay, left } = useStudioBrushDockLayout(rootRef, width);
  useEffect(() => { setDraftWidth(width); draftWidthRef.current = width; }, [width]);
  const commitWidth = () => { if (draftWidthRef.current !== width) onWidthChange?.(draftWidthRef.current); };
  return <aside ref={rootRef} id="studio-brush-workbench" aria-label="브러시 작업 패널"
    data-studio-brush-workbench-dock="true" data-studio-brush-panel-presentation={overlay ? "overlay" : "docked"}
    className="hidden h-full min-h-0 shrink-0 flex-col border-r border-line bg-panel lg:flex"
    style={{ width, ...(overlay ? { position: "absolute", left, top: 0, bottom: 0, zIndex: 50 } : {}) }}>
    <header className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
      <h2 className="text-sm font-semibold text-fg">{catalog.operation === "erase" ? "지우개 라이브러리" : "브러시 라이브러리"}</h2>
      <button type="button" onClick={onCollapse} aria-label="브러시 패널 접기"
        className="grid size-11 shrink-0 place-items-center rounded-lg text-fg-2 hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent"><PanelLeftClose size={17} aria-hidden /></button>
    </header>
    <div className="shrink-0 space-y-1 border-b border-line px-3 py-2 text-xs text-fg-2" aria-label="브러시 교체 정책">
      <p>브러시 교체 시 주 색은 유지됩니다.</p>
      {onToggleSizeLock ? <label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={sizeLocked} onChange={onToggleSizeLock} />현재 크기 유지</label> : null}
      {onToggleOpacityLock ? <label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={opacityLocked} disabled={catalog.operation === "erase"} onChange={onToggleOpacityLock} />현재 불투명도 유지</label> : null}
      {catalog.operation === "erase" ? <p>지우기 강도는 지우개 프리셋을 따릅니다.</p> : null}
      {modifiedCount > 0 ? <div className="flex items-center justify-between gap-1"><span>수정됨 · {modifiedCount}개 설정</span><button type="button" className="min-h-9 rounded px-2 text-accent" onClick={onRestoreDefaults}>프리셋 복원</button></div> : null}
      {overlay ? <p role="status">캔버스 공간을 유지하기 위해 겹쳐 보기로 표시합니다.</p> : null}
    </div>
    <div className="min-h-0 flex-1">
      {expanded ? <p className="p-3 text-sm leading-relaxed text-fg-2">확장 보기에서 브러시를 고르고 있어요. 닫으면 이 패널로 돌아옵니다.</p>
        : <StudioBrushLibrarySheet {...catalog} open embedded workbench autoFocusSearch={false} dismissOnEscape={false}
          closeOnSelection={false} dismissOnOutsidePointer={false} onClose={onCollapse} />}
    </div>
    {onWidthChange ? <details className="shrink-0 border-t border-line p-2 text-xs text-fg-2">
      <summary className="min-h-9 cursor-pointer">패널 너비 · {draftWidth}px</summary>
      <input type="range" aria-label="브러시 패널 너비" min={200} max={360} step={8} value={draftWidth}
        onChange={(event) => { const next = Number(event.currentTarget.value); draftWidthRef.current = next; setDraftWidth(next); }}
        onPointerUp={commitWidth} onKeyUp={commitWidth} onBlur={commitWidth} className="h-11 w-full" />
    </details> : null}
    <footer className="flex shrink-0 flex-wrap gap-1 border-t border-line p-2">
      <button type="button" onClick={onOpenBrushStudio}
        className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line px-2 text-xs text-fg-2 hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent">
        <SlidersHorizontal size={14} aria-hidden />브러시 편집
      </button>
      <button type="button" onClick={(event) => onExpandCatalog(event.currentTarget)}
        className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line px-2 text-xs text-fg-2 hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent">
        <SquareArrowOutUpRight size={14} aria-hidden />{expanded ? "도킹 보기" : "확장 보기"}
      </button>
    </footer>
  </aside>;
}
