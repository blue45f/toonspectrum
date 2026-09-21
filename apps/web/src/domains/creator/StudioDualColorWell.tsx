import { ArrowLeftRight, Eraser, Pipette } from "lucide-react";
import { useStudioColorWorkspace } from "./color/StudioColorWorkspaceContext";
import { useStudioSharedColorHistory } from "./color/useStudioSharedColorHistory";
import { LazyStudioColorPopover } from "./StudioLazyColorPopover";
import { STUDIO_FOCUS_RING } from "./studio-panel-ui";
import { studioToolHintFromLabel } from "./studio-tool-hints";
import { StudioToolHintTarget } from "./StudioToolHint";
import { cn } from "@/shared/lib/utils";

/* eslint-disable react-refresh/only-export-components -- shared typed hints are tested with their controls */
export const STUDIO_DUAL_COLOR_WELL_HINTS = {
  primary: studioToolHintFromLabel("주 색", "펜·도형·채우기에 사용할 주 색을 편집합니다.", undefined, "color-palette", "primary-color"),
  secondary: studioToolHintFromLabel("보조 색", "주 색과 교환할 보조 색을 같은 색상 편집기에서 고릅니다.", undefined, "color-palette", "secondary-color"),
  swap: studioToolHintFromLabel("주·보조 색 교체", "두 색의 역할을 한 번에 맞바꿉니다.", "X", "color-palette", "swap-colors"),
  transparent: studioToolHintFromLabel("지우개로 전환", "마지막으로 사용한 지우개로 전환합니다. 현재 브러시로 투명색을 그리는 기능과 다릅니다.", "E", "color-palette"),
} as const;

export function StudioDualColorWell({ primary, secondary, recent, onPrimaryChange, onSecondaryChange,
  onSwap, className, isTransparent, onTransparentToggle, onRequestCanvasEyedropper, compact = false,
}: {
  primary: string;
  secondary?: string;
  recent?: readonly string[];
  onPrimaryChange: (hex: string) => void;
  onSecondaryChange?: (hex: string) => void;
  onSwap?: () => void;
  className?: string;
  isTransparent?: boolean;
  onTransparentToggle?: () => void;
  onRequestCanvasEyedropper?: () => void;
  compact?: boolean;
}) {
  const history = useStudioSharedColorHistory(recent);
  const workspace = useStudioColorWorkspace();
  const showSecondary = Boolean(secondary !== undefined && onSecondaryChange);
  const common = {
    recentColors: history.colors, documentColors: workspace?.documentColors,
    onUseColor: history.rememberColor, onLoadRecentColors: history.ensureLoaded,
    historyStatus: history.status, onRetryHistory: history.retry,
    purpose: "brush-shape" as const, initialTab: "quick" as const,
    onBeforeOpen: workspace?.onBeforePopupOpen,
  };
  return <div data-studio-dual-color-well="true" data-studio-primary-color={primary.toLowerCase()}
    data-studio-secondary-color={secondary?.toLowerCase()} role="group" aria-label="색상"
    className={cn("flex shrink-0 items-center gap-1.5", className)}>
    <div data-studio-color-stack="true" className="flex shrink-0 items-center gap-1.5">
      <LazyStudioColorPopover {...common} value={primary} onChange={onPrimaryChange} label="주 색" targetKey="primary"
        triggerVariant={compact ? "swatch" : "labeled"}
        onRequestOpen={() => workspace?.requestDock("primary") ?? false}
        onPinToWorkspace={workspace ? () => workspace.pinDock("primary") : undefined}
        onRequestCanvasEyedropper={workspace?.onRequestSample ? () => workspace.sampleColor("primary") : onRequestCanvasEyedropper} />
      {showSecondary ? <LazyStudioColorPopover {...common} value={secondary!} onChange={onSecondaryChange!} label="보조 색" targetKey="secondary"
        triggerVariant="swatch" onRequestOpen={() => workspace?.requestDock("secondary") ?? false}
        onPinToWorkspace={workspace ? () => workspace.pinDock("secondary") : undefined}
        onRequestCanvasEyedropper={workspace?.onRequestSample ? () => workspace.sampleColor("secondary") : undefined} /> : null}
    </div>
    {showSecondary && onSwap ? <StudioToolHintTarget preferredSide="bottom" hint={STUDIO_DUAL_COLOR_WELL_HINTS.swap}>
      <button type="button" onClick={onSwap} aria-label="주 색과 보조 색 교체" aria-keyshortcuts="X"
        data-studio-color-swap="true" className={cn("grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-card text-fg-2 pointer-coarse:size-11", STUDIO_FOCUS_RING)}>
        <ArrowLeftRight size={18} aria-hidden />
      </button>
    </StudioToolHintTarget> : null}
    {onRequestCanvasEyedropper || workspace?.onRequestSample ? <button type="button" aria-label="캔버스 스포이드"
      onClick={() => { workspace?.onBeforePopupOpen(); if (workspace?.onRequestSample) workspace.sampleColor("primary"); else onRequestCanvasEyedropper?.(); }}
      className={cn("grid size-10 shrink-0 place-items-center rounded-lg border border-line text-fg-2 pointer-coarse:size-11", STUDIO_FOCUS_RING)}><Pipette size={18} aria-hidden /></button> : null}
    {!compact && onTransparentToggle ? <StudioToolHintTarget preferredSide="bottom" hint={STUDIO_DUAL_COLOR_WELL_HINTS.transparent}>
      <button type="button" onClick={onTransparentToggle} aria-label="지우개로 전환" aria-pressed={isTransparent || undefined}
        data-studio-transparent-color-well="true" className={cn("grid size-10 shrink-0 place-items-center rounded-lg border border-line text-fg-2 pointer-coarse:size-11", STUDIO_FOCUS_RING)}><Eraser size={18} aria-hidden /></button>
    </StudioToolHintTarget> : null}
    {!compact ? <div className="hidden items-center gap-1 2xl:flex" aria-label="최근 선택 색">
      {history.colors.slice(0, 3).map((color) => <button key={color} type="button" data-studio-recent-color="true"
        aria-label={`최근 선택 색 ${color} 적용`} aria-pressed={primary.toLowerCase() === color.toLowerCase()}
        onClick={() => { onPrimaryChange(color); history.rememberColor(color); }}
        className={cn("size-9 shrink-0 rounded-md border border-line-strong pointer-coarse:size-11", STUDIO_FOCUS_RING)} style={{ background: color }} />)}
    </div> : null}
  </div>;
}
