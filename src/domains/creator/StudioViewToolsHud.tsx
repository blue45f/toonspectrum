/**
 * Compact, view-only canvas controls. The parent owns every state transition so this HUD never
 * mutates document data or enters Studio history.
 */
import {
  FlipHorizontal2,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  ScanLine,
  X,
  ZoomIn,
} from "lucide-react";
import { useEffect, useRef } from "react";

import {
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
} from "./studio-panel-ui";

import type { StudioViewRotation } from "./studio-view-controls";
import type { LucideIcon } from "lucide-react";
import type { KeyboardEvent, ReactElement, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type StudioViewToolMode = "zoom" | "rotate" | null;

export interface StudioViewToolsHudProps {
  mode: StudioViewToolMode;
  /** Effective document magnification (`fit scale × user zoom`), not the user zoom multiplier. */
  magnification: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  rotation: StudioViewRotation;
  flipped: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onActual: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onToggleFlip: () => void;
  onReset: () => void;
  onClose: () => void;
  className?: string;
}

const HUD_ACTION_CLASS = cn(
  "grid size-11 min-h-11 min-w-11 shrink-0 place-items-center rounded-xl border border-transparent",
  "text-fg-2 hover:border-line/70 hover:bg-raised hover:text-fg active:bg-card",
  STUDIO_EASE,
  STUDIO_FOCUS_RING
);

function HudAction({
  label,
  onClick,
  icon: Icon,
  pressed,
  children,
  disabled,
}: {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
  pressed?: boolean;
  children?: ReactNode;
  disabled?: boolean;
}): ReactElement {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      disabled={disabled}
      tabIndex={-1}
      data-studio-view-action={label}
      className={cn(
        HUD_ACTION_CLASS,
        pressed && "border-accent/50 bg-accent-soft text-accent hover:border-accent/65 hover:bg-accent-soft",
        disabled && "cursor-not-allowed opacity-35 hover:border-transparent hover:bg-transparent hover:text-fg-2"
      )}
    >
      {Icon ? <Icon size={16} strokeWidth={1.75} aria-hidden /> : children}
    </button>
  );
}

function ViewHudDivider(): ReactElement {
  return <span role="separator" aria-orientation="vertical" className="mx-0.5 h-6 w-px shrink-0 bg-line" />;
}

export function StudioViewToolsHud({
  mode,
  magnification,
  canZoomIn,
  canZoomOut,
  rotation,
  flipped,
  onZoomIn,
  onZoomOut,
  onFit,
  onActual,
  onRotateLeft,
  onRotateRight,
  onToggleFlip,
  onReset,
  onClose,
  className,
}: StudioViewToolsHudProps): ReactElement | null {
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode === null) return;
    const buttons = Array.from(
      toolbarRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []
    );
    buttons.forEach((button, index) => {
      button.tabIndex = index === 0 ? 0 : -1;
    });
    buttons[0]?.focus();
  }, [mode]);

  if (mode === null) return null;

  const zoomPercent = Math.round(
    (Number.isFinite(magnification) && magnification > 0 ? magnification : 1) * 100
  );
  const isZoom = mode === "zoom";
  const toolName = isZoom ? "확대/축소" : "회전";
  const currentValue = isZoom ? `${zoomPercent}%` : `${rotation}°`;
  const toolbarLabel = isZoom ? "캔버스 확대 및 축소 보기 도구" : "캔버스 회전 보기 도구";

  const restoreFocusAndClose = () => {
    const trigger = document.querySelector<HTMLElement>(
      `[data-studio-view-tool-trigger="${mode}"]`
    );
    const fallback = document.querySelector<HTMLElement>("[data-studio-canvas-viewport]");
    (trigger ?? fallback)?.focus();
    onClose();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      restoreFocusAndClose();
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(
      toolbarRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []
    );
    if (buttons.length === 0) return;
    event.preventDefault();
    const currentIndex = Math.max(0, buttons.indexOf(event.target as HTMLButtonElement));
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    buttons.forEach((button, index) => {
      button.tabIndex = index === nextIndex ? 0 : -1;
    });
    buttons[nextIndex]?.focus();
  };

  return (
    <div
      role="toolbar"
      id={`studio-view-tools-hud-${mode}`}
      ref={toolbarRef}
      aria-label={toolbarLabel}
      aria-orientation="horizontal"
      data-studio-view-tools-hud={mode}
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => event.stopPropagation()}
      className={cn(
        "pointer-events-auto absolute left-1/2 top-3 z-40 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center",
        "overflow-x-auto rounded-2xl border border-line/90 bg-panel/95 p-1 shadow-[0_10px_30px_oklch(0.08_0.01_70/0.42),inset_0_1px_0_oklch(0.97_0.01_85/0.06)]",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      <div className="flex min-h-11 shrink-0 items-center gap-2 px-2.5">
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-lg border border-line/70 bg-card text-accent"
        >
          {isZoom ? (
            <ZoomIn size={14} strokeWidth={1.75} />
          ) : (
            <RotateCw size={14} strokeWidth={1.75} />
          )}
        </span>
        <span className="whitespace-nowrap text-xs font-bold tracking-tight text-fg">{toolName}</span>
        <span
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-label={isZoom ? `현재 확대율 ${zoomPercent}퍼센트` : `현재 회전 각도 ${rotation}도`}
          className="min-w-11 rounded-lg border border-line/70 bg-card px-2 py-1 text-center text-[0.72rem] font-bold tabular-nums text-fg-2"
        >
          {currentValue}
        </span>
      </div>

      <ViewHudDivider />

      {isZoom ? (
        <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="확대 및 축소">
          <HudAction label="캔버스 축소" icon={Minus} onClick={onZoomOut} disabled={!canZoomOut} />
          <HudAction label="캔버스 확대" icon={Plus} onClick={onZoomIn} disabled={!canZoomIn} />
          <HudAction label="캔버스 화면 맞춤" icon={ScanLine} onClick={onFit} />
          <HudAction label="캔버스 실제 픽셀 100%" onClick={onActual}>
            <span className="text-[0.68rem] font-black tabular-nums" aria-hidden>1:1</span>
          </HudAction>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="캔버스 회전">
          <HudAction label="캔버스 왼쪽으로 90도 회전" icon={RotateCcw} onClick={onRotateLeft} />
          <HudAction label="캔버스 오른쪽으로 90도 회전" icon={RotateCw} onClick={onRotateRight} />
        </div>
      )}

      <ViewHudDivider />

      <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="공통 보기 작업">
        <HudAction
          label={flipped ? "캔버스 좌우 반전 해제" : "캔버스 좌우 반전"}
          icon={FlipHorizontal2}
          pressed={flipped}
          onClick={onToggleFlip}
        />
        <HudAction label="캔버스 보기 초기화" icon={RotateCcw} onClick={onReset} />
        <HudAction label="보기 도구 닫기" icon={X} onClick={restoreFocusAndClose} />
      </div>
    </div>
  );
}
