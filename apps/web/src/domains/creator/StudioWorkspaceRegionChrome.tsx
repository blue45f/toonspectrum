import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { ChevronDown, ChevronUp, GripHorizontal, Maximize2, MoreHorizontal, PanelLeftClose, Pin } from "lucide-react";
import type { KeyboardEvent, PointerEvent, RefObject } from "react";
import type { StudioFloatingSurfaceResizeEdge } from "./studio-floating-surface";
import { STUDIO_FOCUS_RING } from "./studio-panel-ui";
import { cn } from "@/shared/lib/utils";

export interface StudioWorkspaceRegionChromeProps {
  readonly label: string;
  readonly buttonClass: string;
  readonly floating: boolean;
  readonly compact: boolean;
  readonly folded: boolean;
  readonly positionLocked: boolean;
  readonly sizeLocked: boolean;
  readonly menuOpen: boolean;
  readonly menuButtonRef: RefObject<HTMLButtonElement | null>;
  readonly onBegin: (event: PointerEvent<HTMLButtonElement>, edge?: StudioFloatingSurfaceResizeEdge) => void;
  readonly onMoveKey: (event: KeyboardEvent<HTMLButtonElement>, edge?: StudioFloatingSurfaceResizeEdge) => void;
  readonly onToggleCollapsed: () => void;
  readonly onMaximize: () => void;
  readonly onToggleMenu: () => void;
  readonly onAttach: () => void;
}

const RESIZERS: readonly [StudioFloatingSurfaceResizeEdge, string, string][] = [
  ["n", "위쪽", "left-5 right-5 top-0 h-1.5 cursor-n-resize"],
  ["ne", "오른쪽 위", "right-0 top-0 size-4 cursor-ne-resize"],
  ["e", "오른쪽", "bottom-5 right-0 top-5 w-1.5 cursor-e-resize"],
  ["se", "오른쪽 아래", "bottom-0 right-0 size-6 cursor-se-resize"],
  ["s", "아래쪽", "bottom-0 left-5 right-5 h-1.5 cursor-s-resize"],
  ["sw", "왼쪽 아래", "bottom-0 left-0 size-4 cursor-sw-resize"],
  ["w", "왼쪽", "bottom-5 left-0 top-5 w-1.5 cursor-w-resize"],
  ["nw", "왼쪽 위", "left-0 top-0 size-4 cursor-nw-resize"],
];
/** Editing affordances load on intent; panel content keeps its stable DOM owner. */
export function StudioWorkspaceRegionChrome({ label, buttonClass, floating, compact, folded, positionLocked, sizeLocked, menuOpen, menuButtonRef, onBegin, onMoveKey, onToggleCollapsed, onMaximize, onToggleMenu, onAttach }: StudioWorkspaceRegionChromeProps) {
  return <>
      <div 
        className={cn("flex shrink-0 items-center border-b border-line bg-raised text-fg", compact ? "h-20 flex-wrap justify-center" : "h-10", floating ? "z-10" : "absolute inset-x-0 top-0 z-30 rounded-t-md")}>
        <button type="button" aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionChrome", "ko", "{v0} 이동"), { v0: String(label) })} disabled={positionLocked}
          title={translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionChrome", "ko", "드래그하여 배치 · Alt+방향키 이동 · Alt+Home 복원")}
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight Alt+Home"
          className={cn(buttonClass, "min-w-0 touch-none cursor-grab justify-start overflow-hidden active:cursor-grabbing", compact ? "h-10 w-full flex-none" : "flex-1")}
          onPointerDown={(event) => onBegin(event)} onKeyDown={(event) => onMoveKey(event)}>
          {positionLocked ? <Pin size={14} aria-hidden /> : <GripHorizontal size={14} aria-hidden />}
          <span className="truncate">{label}</span>
        </button>
        {floating && <button type="button" className={buttonClass} aria-label={`${label} ${folded ? "펼치기" : "접기"}`} aria-expanded={!folded}
          onClick={onToggleCollapsed}>
          {folded ? <ChevronDown size={16} aria-hidden /> : <ChevronUp size={16} aria-hidden />}
        </button>}
        {floating && <button type="button" className={buttonClass} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionChrome", "ko", "{v0} 최대 크기"), { v0: String(label) })} disabled={sizeLocked}
          title={sizeLocked ? translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionChrome", "ko", "크기 잠금을 해제한 뒤 확대할 수 있어요.") : translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionChrome", "ko", "화면에 맞춰 최대 크기로 확대")}
          onClick={onMaximize}><Maximize2 size={15} aria-hidden /></button>}
        <button ref={menuButtonRef} type="button" className={buttonClass} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionChrome", "ko", "{v0} 배치 설정"), { v0: String(label) })} aria-expanded={menuOpen}
          onClick={onToggleMenu}><MoreHorizontal size={16} aria-hidden /></button>
        {floating && !compact && <button type="button" className={buttonClass} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionChrome", "ko", "{v0} 원래 자리로 붙이기"), { v0: String(label) })} onClick={onAttach}><PanelLeftClose size={16} aria-hidden /></button>}
      </div>
      {floating && !folded && RESIZERS.map(([edge, name, position]) => <button key={edge} type="button"
        className={cn("absolute z-20 touch-none border-0 bg-transparent p-0 disabled:cursor-not-allowed", position, STUDIO_FOCUS_RING,
          edge === "se" && "after:absolute after:bottom-1 after:right-1 after:size-2 after:border-b-2 after:border-r-2 after:border-fg-3")}
        aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionChrome", "ko", "{v0} {v1} 크기 조절"), { v0: String(label), v1: String(name) })} disabled={sizeLocked}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight"
        onPointerDown={(event) => onBegin(event, edge)} onKeyDown={(event) => onMoveKey(event, edge)} />)}
  </>;
}
