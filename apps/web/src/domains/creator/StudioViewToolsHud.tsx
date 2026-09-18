/**
 * Precision, view-only canvas controls. The parent owns every state transition so this HUD never
 * mutates document data or enters Studio history.
 */
import {
  FlipHorizontal2,
  Focus,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  ScanLine,
  X,
  ZoomIn,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "./studio-panel-ui";
import {
  STUDIO_VIEW_ACTION_HINTS,
  studioViewFlipHint,
} from "./studio-view-action-hints";
import {
  clampStudioViewMagnification,
  parseStudioViewMagnificationPercent,
  studioMagnificationToSliderPosition,
  studioSliderPositionToMagnification,
  STUDIO_VIEW_MAGNIFICATION_PRESETS,
  STUDIO_VIEW_MAGNIFICATION_SLIDER_MAX,
  type StudioViewMagnificationBounds,
} from "./studio-view-workspace";
import { StudioToolHintTarget } from "./StudioToolHint";

import type { StudioToolHintSpec } from "./studio-tool-hints";
import type { StudioViewRotation } from "./studio-view-controls";
import type { LucideIcon } from "lucide-react";
import type { KeyboardEvent, ReactElement, ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

export type StudioViewToolMode = "zoom" | "rotate" | null;

export interface StudioViewToolsHudProps {
  mode: StudioViewToolMode;
  /** Effective document magnification (`fit scale × user zoom`), not the user zoom multiplier. */
  magnification: number;
  /** Effective magnification bounds after the current fit scale is applied. */
  minMagnification?: number;
  maxMagnification?: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  rotation: StudioViewRotation;
  flipped: boolean;
  selectionCount?: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSetMagnification?: (magnification: number) => void;
  onFit: () => void;
  onFitSelection?: () => void;
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

const ZOOM_INPUT_CLASS = cn(
  "h-9 w-[4.25rem] rounded-lg border border-line/80 bg-card px-2 pr-5 text-right text-xs font-black tabular-nums text-fg",
  "placeholder:text-fg-3 hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
);

function HudAction({
  label,
  hint,
  onClick,
  icon: Icon,
  pressed,
  children,
  disabled,
  unavailableReason,
}: {
  label: string;
  hint: StudioToolHintSpec;
  onClick: () => void;
  icon?: LucideIcon;
  pressed?: boolean;
  children?: ReactNode;
  disabled?: boolean;
  unavailableReason?: string;
}): ReactElement {
  return (
    <StudioToolHintTarget
      hint={hint}
      unavailableReason={disabled ? unavailableReason : undefined}
      preferredSide="bottom"
    >
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        aria-disabled={disabled ? true : undefined}
        onClick={() => {
          if (!disabled) onClick();
        }}
        tabIndex={-1}
        data-studio-view-action={label}
        className={cn(
          HUD_ACTION_CLASS,
          pressed &&
            "border-accent/50 bg-accent-soft text-accent hover:border-accent/65 hover:bg-accent-soft",
          disabled &&
            "cursor-not-allowed opacity-35 hover:border-transparent hover:bg-transparent hover:text-fg-2"
        )}
      >
        {Icon ? <Icon size={16} strokeWidth={1.75} aria-hidden /> : children}
      </button>
    </StudioToolHintTarget>
  );
}

function ZoomPresetButton({
  preset,
  magnification,
  bounds,
  onSelect,
}: {
  preset: number;
  magnification: number;
  bounds: StudioViewMagnificationBounds;
  onSelect: (magnification: number) => void;
}): ReactElement {
  const available =
    preset >= bounds.min - 1e-6 && preset <= bounds.max + 1e-6;
  const active = Math.abs(preset - magnification) < 0.005;
  const percent = Math.round(preset * 100);

  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={`캔버스 확대율 ${percent}퍼센트`}
      aria-pressed={active}
      aria-disabled={!available ? true : undefined}
      data-studio-view-zoom-preset={percent}
      onClick={() => {
        if (available) onSelect(preset);
      }}
      className={cn(
        "h-8 min-w-10 rounded-lg border border-line/70 bg-card px-2 text-[0.65rem] font-black tabular-nums text-fg-2",
        "hover:border-line-strong hover:bg-raised hover:text-fg",
        STUDIO_EASE,
        STUDIO_FOCUS_RING,
        active &&
          "border-accent/50 bg-accent-soft text-accent hover:border-accent/65 hover:bg-accent-soft",
        !available &&
          "cursor-not-allowed opacity-30 hover:border-line/70 hover:bg-card hover:text-fg-2"
      )}
    >
      {percent}%
    </button>
  );
}

function ViewHudDivider(): ReactElement {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      className="mx-0.5 h-6 w-px shrink-0 bg-line"
    />
  );
}

function formatMagnificationPercent(magnification: number): string {
  const rounded = Math.round(magnification * 10_000) / 100;
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/0+$/, "");
}

export function StudioViewToolsHud({
  mode,
  magnification,
  minMagnification = 0.01,
  maxMagnification = 10,
  canZoomIn,
  canZoomOut,
  rotation,
  flipped,
  selectionCount = 0,
  onZoomIn,
  onZoomOut,
  onSetMagnification,
  onFit,
  onFitSelection,
  onActual,
  onRotateLeft,
  onRotateRight,
  onToggleFlip,
  onReset,
  onClose,
  className,
}: StudioViewToolsHudProps): ReactElement | null {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const skipZoomBlurCommitRef = useRef(false);
  const safeMagnification =
    Number.isFinite(magnification) && magnification > 0 ? magnification : 1;
  const safeMinMagnification =
    Number.isFinite(minMagnification) && minMagnification > 0
      ? minMagnification
      : 0.01;
  const safeMaxMagnification =
    Number.isFinite(maxMagnification) && maxMagnification > 0
      ? maxMagnification
      : 10;
  const bounds: StudioViewMagnificationBounds = {
    min: safeMinMagnification,
    max: Math.max(safeMinMagnification, safeMaxMagnification),
  };
  const zoomPercent = formatMagnificationPercent(safeMagnification);
  const [zoomDraft, setZoomDraft] = useState(() => zoomPercent);

  useEffect(() => {
    setZoomDraft(zoomPercent);
  }, [mode, zoomPercent]);

  useEffect(() => {
    if (mode === null) return;
    const buttons = Array.from(
      toolbarRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []
    );
    buttons.forEach((button, index) => {
      button.tabIndex = index === 0 ? 0 : -1;
    });
    buttons[0]?.focus();
  }, [mode]);

  if (mode === null) return null;

  const isZoom = mode === "zoom";
  const toolName = isZoom ? "확대/축소" : "회전";
  const currentValue = isZoom ? `${zoomPercent}%` : `${rotation}°`;
  const toolbarLabel = isZoom
    ? "캔버스 확대 및 축소 보기 도구"
    : "캔버스 회전 보기 도구";
  const precisionZoomAvailable = typeof onSetMagnification === "function";
  const setMagnification = (next: number) => {
    onSetMagnification?.(next);
  };
  const sliderValue = studioMagnificationToSliderPosition(
    safeMagnification,
    bounds
  );

  const commitMagnificationDraft = () => {
    if (skipZoomBlurCommitRef.current) {
      skipZoomBlurCommitRef.current = false;
      return;
    }
    if (!onSetMagnification) {
      setZoomDraft(zoomPercent);
      return;
    }
    const parsed = parseStudioViewMagnificationPercent(zoomDraft);
    if (parsed === null) {
      setZoomDraft(zoomPercent);
      return;
    }
    const next = clampStudioViewMagnification(parsed, bounds);
    onSetMagnification(next);
    setZoomDraft(formatMagnificationPercent(next));
  };

  const restoreFocusAndClose = () => {
    const trigger = document.querySelector<HTMLElement>(
      `[data-studio-view-tool-trigger="${mode}"]`
    );
    const fallback = document.querySelector<HTMLElement>(
      "[data-studio-canvas-viewport]"
    );
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
    if (!(event.target instanceof HTMLButtonElement)) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    const buttons = Array.from(
      toolbarRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []
    );
    if (buttons.length === 0) return;
    event.preventDefault();
    const currentIndex = Math.max(0, buttons.indexOf(event.target));
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (currentIndex +
              (event.key === "ArrowRight" ? 1 : -1) +
              buttons.length) %
            buttons.length;
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
      data-studio-view-precision={precisionZoomAvailable ? "true" : undefined}
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => event.stopPropagation()}
      className={cn(
        "pointer-events-auto absolute left-1/2 top-3 z-40 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center",
        "overflow-x-auto rounded-2xl border border-line/90 bg-panel/95 p-1 shadow-[0_10px_30px_oklch(0.08_0.01_70/0.42),inset_0_1px_0_oklch(0.97_0.01_85/0.06)]",
        "backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
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
        <span className="whitespace-nowrap text-xs font-bold tracking-tight text-fg">
          {toolName}
        </span>
        {isZoom && precisionZoomAvailable ? (
          <label
            className="relative flex shrink-0 items-center"
            aria-label={`현재 확대율 ${zoomPercent}퍼센트`}
          >
            <input
              type="text"
              inputMode="decimal"
              value={zoomDraft}
              aria-label="캔버스 확대율 입력"
              aria-describedby="studio-view-zoom-range"
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setZoomDraft(event.currentTarget.value)}
              onBlur={commitMagnificationDraft}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitMagnificationDraft();
                  event.currentTarget.select();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  skipZoomBlurCommitRef.current = true;
                  setZoomDraft(zoomPercent);
                  event.currentTarget.blur();
                }
              }}
              className={ZOOM_INPUT_CLASS}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute right-2 text-[0.65rem] font-black text-fg-3"
            >
              %
            </span>
          </label>
        ) : (
          <span
            role="status"
            aria-live="polite"
            aria-atomic="true"
            aria-label={
              isZoom
                ? `현재 확대율 ${zoomPercent}퍼센트`
                : `현재 회전 각도 ${rotation}도`
            }
            className="min-w-11 rounded-lg border border-line/70 bg-card px-2 py-1 text-center text-[0.72rem] font-bold tabular-nums text-fg-2"
          >
            {currentValue}
          </span>
        )}
      </div>

      <ViewHudDivider />

      {isZoom ? (
        <>
          <div
            className="flex shrink-0 items-center gap-0.5"
            role="group"
            aria-label="확대 및 축소"
          >
            <HudAction
              label="캔버스 축소"
              hint={STUDIO_VIEW_ACTION_HINTS.zoomOut}
              icon={Minus}
              onClick={onZoomOut}
              disabled={!canZoomOut}
              unavailableReason="최소 축소 배율에 도달했습니다."
            />
            {precisionZoomAvailable ? (
              <div className="flex h-11 shrink-0 items-center px-1.5">
                <input
                  type="range"
                  min={0}
                  max={STUDIO_VIEW_MAGNIFICATION_SLIDER_MAX}
                  step={1}
                  value={sliderValue}
                  aria-label="캔버스 확대율 정밀 조절"
                  aria-valuetext={`${zoomPercent}%`}
                  onChange={(event) => {
                    setMagnification(
                      studioSliderPositionToMagnification(
                        Number(event.currentTarget.value),
                        bounds
                      )
                    );
                  }}
                  onKeyDown={(event) => {
                    if (
                      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key
                      )
                    ) {
                      event.stopPropagation();
                    }
                  }}
                  className="h-11 w-28 cursor-ew-resize accent-[var(--accent)] sm:w-36"
                />
                <span id="studio-view-zoom-range" className="sr-only">
                  허용 범위 {Math.round(bounds.min * 100)}%에서{" "}
                  {Math.round(bounds.max * 100)}%
                </span>
              </div>
            ) : null}
            <HudAction
              label="캔버스 확대"
              hint={STUDIO_VIEW_ACTION_HINTS.zoomIn}
              icon={Plus}
              onClick={onZoomIn}
              disabled={!canZoomIn}
              unavailableReason="최대 확대 배율에 도달했습니다."
            />
            <HudAction
              label="캔버스 너비에 맞춤"
              hint={STUDIO_VIEW_ACTION_HINTS.fitWidth}
              icon={ScanLine}
              onClick={onFit}
            />
            {onFitSelection ? (
              <HudAction
                label="선택 영역에 맞춤"
                hint={STUDIO_VIEW_ACTION_HINTS.fitSelection}
                icon={Focus}
                onClick={onFitSelection}
                disabled={selectionCount <= 0}
                unavailableReason="먼저 캔버스 요소를 하나 이상 선택하세요."
              />
            ) : null}
            <HudAction
              label="캔버스 실제 픽셀 100%"
              hint={STUDIO_VIEW_ACTION_HINTS.actualSize}
              onClick={onActual}
            >
              <span
                className="text-[0.68rem] font-black tabular-nums"
                aria-hidden
              >
                1:1
              </span>
            </HudAction>
          </div>
          {precisionZoomAvailable ? (
            <>
              <ViewHudDivider />
              <div
                className="flex shrink-0 items-center gap-1 px-1"
                role="group"
                aria-label="확대율 프리셋"
              >
                {STUDIO_VIEW_MAGNIFICATION_PRESETS.map((preset) => (
                  <ZoomPresetButton
                    key={preset}
                    preset={preset}
                    magnification={safeMagnification}
                    bounds={bounds}
                    onSelect={setMagnification}
                  />
                ))}
              </div>
            </>
          ) : null}
        </>
      ) : (
        <div
          className="flex shrink-0 items-center gap-0.5"
          role="group"
          aria-label="캔버스 회전"
        >
          <HudAction
            label="캔버스 왼쪽으로 90도 회전"
            hint={STUDIO_VIEW_ACTION_HINTS.rotateLeft}
            icon={RotateCcw}
            onClick={onRotateLeft}
          />
          <span
            role="status"
            aria-live="polite"
            aria-atomic="true"
            aria-label={`현재 회전 각도 ${rotation}도`}
            className="mx-1 min-w-12 rounded-lg border border-line/70 bg-card px-2 py-1.5 text-center text-[0.72rem] font-black tabular-nums text-fg-2"
          >
            {rotation}°
          </span>
          <HudAction
            label="캔버스 오른쪽으로 90도 회전"
            hint={STUDIO_VIEW_ACTION_HINTS.rotateRight}
            icon={RotateCw}
            onClick={onRotateRight}
          />
        </div>
      )}

      <ViewHudDivider />

      <div
        className="flex shrink-0 items-center gap-0.5"
        role="group"
        aria-label="공통 보기 작업"
      >
        <HudAction
          label={
            flipped ? "캔버스 좌우 반전 해제" : "캔버스 좌우 반전"
          }
          hint={studioViewFlipHint(flipped)}
          icon={FlipHorizontal2}
          pressed={flipped}
          onClick={onToggleFlip}
        />
        <HudAction
          label="캔버스 보기 초기화"
          hint={STUDIO_VIEW_ACTION_HINTS.reset}
          icon={RotateCcw}
          onClick={onReset}
        />
        <HudAction
          label="보기 도구 닫기"
          hint={STUDIO_VIEW_ACTION_HINTS.close}
          icon={X}
          onClick={restoreFocusAndClose}
        />
      </div>
    </div>
  );
}
