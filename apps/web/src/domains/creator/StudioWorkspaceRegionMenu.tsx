import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Maximize2, Minimize2, PanelLeftClose, Pin, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { StudioFloatingSurfaceDock, StudioFloatingSurfaceLayout, StudioFloatingSurfaceRect, StudioFloatingSurfaceSizePreset } from "./studio-floating-surface";
import { STUDIO_FOCUS_RING } from "./studio-panel-ui";
import { cn } from "@/shared/lib/utils";

export interface StudioWorkspaceRegionMenuProps {
  readonly label: string;
  readonly buttonClass: string;
  readonly choices: readonly (readonly [StudioFloatingSurfaceDock, string])[];
  readonly layout: StudioFloatingSurfaceLayout;
  readonly setLayout: (layout: StudioFloatingSurfaceLayout) => void;
  readonly changeDetached: (value: boolean) => void;
  readonly move: (dx: number, dy: number) => void;
  readonly minWidth: number; readonly maxWidth: number;
  readonly minHeight: number; readonly maxHeight: number;
  readonly viewport: { width: number; height: number; insetTop: number };
  readonly insetTop: number;
  readonly rect: StudioFloatingSurfaceRect;
  readonly floating: boolean;
  readonly compact: boolean;
  readonly menuButtonRef: RefObject<HTMLButtonElement | null>;
  readonly onClose: () => void;
  readonly onResize: (width: number, height: number) => void;
  readonly onResizePreset: (preset: StudioFloatingSurfaceSizePreset) => void;
  readonly attach: () => void; readonly reset: () => void;
  readonly authority: string;
}

export function StudioWorkspaceRegionMenu({ label, buttonClass, choices, layout, setLayout, changeDetached, move, minWidth, maxWidth, minHeight, maxHeight, viewport, insetTop, rect, floating, compact, menuButtonRef, onClose, onResize, onResizePreset, attach, reset, authority }: StudioWorkspaceRegionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [widthInput, setWidthInput] = useState(() => String(Math.round(rect.width)));
  const [heightInput, setHeightInput] = useState(() => String(Math.round(rect.height)));
  useEffect(() => {
    const close = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target) && !menuButtonRef.current?.contains(event.target)) onClose();
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [menuButtonRef, onClose]);
  function applySize() {
    const width = Number(widthInput), height = Number(heightInput);
    if (layout.sizeLocked || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    onResize(width, height);
  }
  return (<div ref={menuRef} role="group" aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionMenu", "ko", "{v0} 배치 설정 옵션"), { v0: String(label) })}
    style={floating ? { position: "fixed", right: "auto", left: Math.max(12, Math.min(rect.x, viewport.width - 276)), top: Math.max(viewport.insetTop, Math.min(rect.y + (compact ? 84 : 44), viewport.height - 440)) } : undefined}
    className="absolute right-0 top-11 z-[70] max-h-[min(26rem,70dvh)] w-64 overflow-y-auto rounded-lg border border-line-strong bg-panel p-2 text-fg shadow-2xl"
    onKeyDownCapture={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); menuButtonRef.current?.focus(); } }}>
        <p className="px-2 py-1 text-xs font-bold">{translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionMenu", "ko", "드래그 없이 배치")}</p>
        <div className="flex flex-wrap gap-1">{choices.map(([dock, name]) => <button type="button" key={dock} className={buttonClass} disabled={layout.positionLocked}
          onClick={() => { setLayout({ ...layout, dock }); changeDetached(true); }}>{name}</button>)}</div>
        <div className="my-1 flex justify-center gap-1">{([
          [-10, 0, "왼쪽으로 이동", ArrowLeft], [0, -10, "위로 이동", ArrowUp],
          [0, 10, "아래로 이동", ArrowDown], [10, 0, "오른쪽으로 이동", ArrowRight],
        ] as const).map(([dx, dy, name, Icon]) => <button key={name} type="button" className={buttonClass} aria-label={`${label} ${name}`} disabled={layout.positionLocked} onClick={() => move(dx, dy)}><Icon size={15} aria-hidden /></button>)}</div>
        <div role="group" aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionMenu", "ko", "{v0} 빠른 크기"), { v0: String(label) })} className="my-2 grid grid-cols-3 gap-1 rounded-md border border-line p-1">
          <button type="button" disabled={layout.sizeLocked} className={cn(buttonClass, "min-w-0 flex-col gap-0.5 px-1 py-1 text-[0.65rem]")} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionMenu", "ko", "{v0} 최소 크기"), { v0: String(label) })} onClick={() => onResizePreset("minimum")}><Minimize2 size={14} aria-hidden />{translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionMenu", "ko", "최소")}</button>
          <button type="button" disabled={layout.sizeLocked} className={cn(buttonClass, "min-w-0 flex-col gap-0.5 px-1 py-1 text-[0.65rem]")} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionMenu", "ko", "{v0} 권장 크기"), { v0: String(label) })} onClick={() => onResizePreset("default")}><RotateCcw size={14} aria-hidden />{translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionMenu", "ko", "권장")}</button>
          <button type="button" disabled={layout.sizeLocked} className={cn(buttonClass, "min-w-0 flex-col gap-0.5 px-1 py-1 text-[0.65rem]")} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionMenu", "ko", "{v0} 최대 크기"), { v0: String(label) })} onClick={() => onResizePreset("maximum")}><Maximize2 size={14} aria-hidden />{translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionMenu", "ko", "최대")}</button>
        </div>
        <fieldset disabled={layout.sizeLocked} className="my-2 grid grid-cols-2 gap-2 rounded-md border border-line p-2">
          <legend className="px-1 text-xs font-semibold">{translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionMenu", "ko", "크기 직접 입력 · px")}</legend>
          <label className="text-xs">{translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionMenu", "ko", "너비")}<input aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionMenu", "ko", "{v0} 너비"), { v0: String(label) })} type="number" min={minWidth} max={Math.min(maxWidth, viewport.width - 24)} value={widthInput} onChange={event => setWidthInput(event.target.value)} className={cn("mt-1 w-full rounded border border-line bg-panel p-1", STUDIO_FOCUS_RING)} /></label>
          <label className="text-xs">{translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionMenu", "ko", "높이")}<input aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionMenu", "ko", "{v0} 높이"), { v0: String(label) })} type="number" min={minHeight} max={Math.min(maxHeight, viewport.height - insetTop - 12)} value={heightInput} onChange={event => setHeightInput(event.target.value)} className={cn("mt-1 w-full rounded border border-line bg-panel p-1", STUDIO_FOCUS_RING)} /></label>
          <button type="button" className={cn(buttonClass, "col-span-2 bg-raised")} onClick={applySize}>{translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionMenu", "ko", "크기 적용")}</button>
        </fieldset>
        <button type="button" className={cn(buttonClass, "w-full justify-start")} aria-pressed={layout.positionLocked}
          onClick={() => setLayout({ ...layout, positionLocked: !layout.positionLocked })}><Pin size={14} aria-hidden />{translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionMenu", "ko", "위치 잠금 ")}{layout.positionLocked ? translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionMenu", "ko", "켬") : translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionMenu", "ko", "끔")}</button>
        <button type="button" className={cn(buttonClass, "w-full justify-start")} aria-pressed={layout.sizeLocked}
          onClick={() => setLayout({ ...layout, sizeLocked: !layout.sizeLocked })}>{translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionMenu", "ko", "크기 잠금 ")}{layout.sizeLocked ? translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionMenu", "ko", "켬") : translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionMenu", "ko", "끔")}</button>
        <button type="button" className={cn(buttonClass, "w-full justify-start")} onClick={attach}><PanelLeftClose size={14} aria-hidden />{translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionMenu", "ko", "원래 자리로 붙이기")}</button>
        <button type="button" className={cn(buttonClass, "w-full justify-start")} onClick={reset}><RotateCcw size={14} aria-hidden />{translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionMenu", "ko", "위치·크기·잠금 초기화")}</button>
        <p className="px-2 py-1 text-[0.65rem] text-fg-3">{authority === "sqlite-opfs" ? translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionMenu", "ko", "위치·크기는 기기에 저장됩니다. 분리·접기까지 보관하려면 배치 편집 → 기기에 저장을 사용하세요.") : translateCurrentStaticSourceText("domains.creator.StudioWorkspaceRegionMenu", "ko", "현재 탭에서 배치를 유지합니다. 기기 저장 여부는 배치 편집에서 확인하세요.")}</p>
  </div>);
}
