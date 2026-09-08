import {
  Contrast,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { memo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import {
  planStudioSelectionContextBarPlacement,
  studioOnCanvasSafeArea,
  type StudioSurfaceRect,
} from "./studio-oncanvas-command-surfaces";
import {
  SELECTION_FEATHER_RANGE,
  SELECTION_OPERATION_MODES,
  isSelectionUsable,
  selectionBoundsNorm,
  type PixelSelection,
  type SelectionOperationMode,
} from "./studio-selection-tools";
import { cn } from "@/shared/lib/utils";

export interface StudioPixelSelectionHudPlacementHandlers {
  /** Pixel-selection owner bounds in client coordinates. */
  getSelectionRect: () => StudioSurfaceRect | null;
  /** Canvas host bounds in client coordinates. */
  getCanvasRect: () => StudioSurfaceRect | null;
}

export interface StudioPixelSelectionHudProps {
  readonly visible: boolean;
  readonly selection: PixelSelection | null;
  readonly operation: SelectionOperationMode;
  readonly busy?: boolean;
  readonly readOnly?: boolean;
  readonly stableHandlers: StudioPixelSelectionHudPlacementHandlers;
  readonly onOperationChange: (operation: SelectionOperationMode) => void;
  readonly onExpand: () => void;
  readonly onContract: () => void;
  readonly onSmooth: () => void;
  readonly onFeatherChange: (featherPx: number) => void;
  readonly onInvert: () => void;
  readonly onClear: () => void;
}

const BUTTON_CLASS = cn(
  "inline-flex min-h-8 shrink-0 touch-manipulation items-center justify-center gap-1 rounded-md border border-line bg-card px-2 text-[0.65rem] font-medium text-fg-2 shadow-sm transition",
  "hover:border-accent/50 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
  "disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:min-h-11",
);

function viewportRect(): StudioSurfaceRect {
  const visual = globalThis.visualViewport;
  return {
    left: visual?.offsetLeft ?? 0,
    top: visual?.offsetTop ?? 0,
    width: visual?.width ?? globalThis.innerWidth ?? 0,
    height: visual?.height ?? globalThis.innerHeight ?? 0,
  };
}

function boundarySummary(selection: PixelSelection): string {
  const bounds = selectionBoundsNorm(selection);
  if (!bounds) return "선택 없음";
  const width = Math.max(0, Math.round(bounds.w * 100));
  const height = Math.max(0, Math.round(bounds.h * 100));
  return selection.invert && selection.subpaths.length === 0
    ? "전체 이미지"
    : `${selection.subpaths.length}개 · ${width}% × ${height}%`;
}

/**
 * Contextual command surface for pixel selections. It deliberately reuses the same
 * viewport/obstacle-aware placement policy as the element selection bar so neither
 * surface pushes the canvas or becomes hidden beneath collaboration chrome.
 */
export const StudioPixelSelectionHud = memo(function StudioPixelSelectionHud({
  visible,
  selection,
  operation,
  busy = false,
  readOnly = false,
  stableHandlers,
  onOperationChange,
  onExpand,
  onContract,
  onSmooth,
  onFeatherChange,
  onInvert,
  onClear,
}: StudioPixelSelectionHudProps) {
  const hudRef = useRef<HTMLDivElement | null>(null);
  const scheduleRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!visible) return;
    const node = hudRef.current;
    if (!node) return;

    let frame = 0;
    let disposed = false;
    const hide = () => {
      node.style.visibility = "hidden";
      node.style.pointerEvents = "none";
    };

    const DOCK_OBSTACLE_REFRESH_MS = 250;
    let dockObstacle: StudioSurfaceRect | null = null;
    let dockObstacleAt = -Infinity;

    const paint = () => {
      frame = 0;
      if (disposed) return;
      const selectionRect = stableHandlers.getSelectionRect();
      const canvasRect = stableHandlers.getCanvasRect();
      if (!selectionRect || !canvasRect || node.offsetWidth === 0 || node.offsetHeight === 0) {
        hide();
        return;
      }

      const now = globalThis.performance?.now?.() ?? Date.now();
      if (now - dockObstacleAt >= DOCK_OBSTACLE_REFRESH_MS) {
        dockObstacleAt = now;
        const rect = globalThis.document
          .querySelector('[data-studio-presence-dock="true"]')
          ?.getBoundingClientRect();
        dockObstacle = rect && rect.width > 0 && rect.height > 0
          ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
          : null;
      }

      const placement = planStudioSelectionContextBarPlacement({
        selection: selectionRect,
        bar: { width: node.offsetWidth, height: node.offsetHeight },
        safeArea: studioOnCanvasSafeArea(canvasRect, viewportRect()),
        obstacles: dockObstacle ? [dockObstacle] : [],
      });
      node.style.visibility = "visible";
      node.style.pointerEvents = "auto";
      node.style.transform = `translate3d(${Math.round(placement.rect.left)}px, ${Math.round(placement.rect.top)}px, 0)`;
      node.dataset.studioPixelSelectionHudSide = placement.side;
      node.dataset.studioPixelSelectionHudWithinBudget = placement.withinBudget ? "true" : "false";
    };

    const schedule = () => {
      if (frame !== 0) return;
      frame = globalThis.requestAnimationFrame(paint);
    };
    scheduleRef.current = schedule;

    const passive = { passive: true, capture: true } as const;
    globalThis.addEventListener("pointermove", schedule, passive);
    globalThis.addEventListener("pointerup", schedule, passive);
    globalThis.addEventListener("wheel", schedule, passive);
    globalThis.addEventListener("scroll", schedule, passive);
    globalThis.addEventListener("resize", schedule, { passive: true });
    globalThis.visualViewport?.addEventListener("resize", schedule);
    globalThis.visualViewport?.addEventListener("scroll", schedule);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(node);

    hide();
    schedule();
    return () => {
      disposed = true;
      scheduleRef.current = null;
      if (frame !== 0) globalThis.cancelAnimationFrame(frame);
      observer?.disconnect();
      globalThis.removeEventListener("pointermove", schedule, passive);
      globalThis.removeEventListener("pointerup", schedule, passive);
      globalThis.removeEventListener("wheel", schedule, passive);
      globalThis.removeEventListener("scroll", schedule, passive);
      globalThis.removeEventListener("resize", schedule);
      globalThis.visualViewport?.removeEventListener("resize", schedule);
      globalThis.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [stableHandlers, visible]);

  useEffect(() => {
    if (visible && selection) scheduleRef.current?.();
  }, [selection, visible]);

  if (
    !visible
    || !selection
    || !isSelectionUsable(selection)
    || typeof globalThis.document === "undefined"
  ) {
    return null;
  }

  const locked = busy || readOnly;
  const noVectorBoundary = selection.invert && selection.subpaths.length === 0;
  const feather = Math.min(
    SELECTION_FEATHER_RANGE.max,
    Math.max(SELECTION_FEATHER_RANGE.min, Math.round(selection.featherPx)),
  );
  const changeFeather = (value: number) => {
    if (!Number.isFinite(value)) return;
    const next = Math.min(
      SELECTION_FEATHER_RANGE.max,
      Math.max(SELECTION_FEATHER_RANGE.min, Math.round(value)),
    );
    if (next !== feather) onFeatherChange(next);
  };

  return createPortal(
    <div
      ref={hudRef}
      role="toolbar"
      aria-label="픽셀 선택 빠른 작업"
      aria-busy={busy}
      data-studio-pixel-selection-hud="true"
      data-studio-shortcut-boundary="true"
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        transform: "translate3d(-9999px, -9999px, 0)",
        visibility: "hidden",
      }}
      className="z-[48] flex w-max max-w-[calc(100vw-1rem)] items-center gap-1.5 overflow-x-auto rounded-xl border border-line/90 bg-bg/95 p-1.5 shadow-2xl backdrop-blur supports-[backdrop-filter]:bg-bg/85"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="hidden shrink-0 border-r border-line px-2 sm:block">
        <span className="block text-[0.58rem] font-semibold uppercase tracking-wide text-fg-3">
          픽셀 선택
        </span>
        <span className="block whitespace-nowrap text-[0.63rem] text-fg-2">
          {boundarySummary(selection)} · 페더 {feather}px
        </span>
      </div>

      <div
        className="flex shrink-0 items-center gap-0.5 rounded-lg border border-line bg-card/70 p-0.5"
        role="group"
        aria-label="다음 선택 작업"
      >
        {SELECTION_OPERATION_MODES.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            className={cn(
              "min-h-7 rounded-md px-2 text-[0.62rem] font-medium transition pointer-coarse:min-h-10",
              operation === candidate.id
                ? "bg-accent text-accent-foreground shadow-sm"
                : "text-fg-3 hover:bg-accent/10 hover:text-fg",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
            aria-label={`다음 선택: ${candidate.label}`}
            aria-pressed={operation === candidate.id}
            title={candidate.shortcut ? `${candidate.tip} (${candidate.shortcut})` : candidate.tip}
            disabled={locked}
            onClick={() => onOperationChange(candidate.id)}
          >
            {candidate.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        className={BUTTON_CLASS}
        disabled={locked || noVectorBoundary}
        onClick={onExpand}
        aria-label="픽셀 선택 경계 확장"
        title="선택 경계를 기본 간격만큼 확장"
      >
        <Maximize2 className="size-3.5" aria-hidden="true" />
        확장
      </button>
      <button
        type="button"
        className={BUTTON_CLASS}
        disabled={locked || noVectorBoundary}
        onClick={onContract}
        aria-label="픽셀 선택 경계 축소"
        title="선택 경계를 기본 간격만큼 축소"
      >
        <Minimize2 className="size-3.5" aria-hidden="true" />
        축소
      </button>
      <button
        type="button"
        className={BUTTON_CLASS}
        disabled={locked || noVectorBoundary}
        onClick={onSmooth}
        aria-label="픽셀 선택 경계 스무딩"
        title="선택 경계의 지터를 줄이고 면적과 중심을 보존"
      >
        <Sparkles className="size-3.5" aria-hidden="true" />
        스무딩
      </button>

      <div
        className="flex shrink-0 items-center gap-0.5 rounded-lg border border-line bg-card/70 p-0.5"
        role="group"
        aria-label="선택 페더 조절"
      >
        <button
          type="button"
          className="grid size-7 place-items-center rounded-md text-fg-3 transition hover:bg-accent/10 hover:text-fg disabled:opacity-40 pointer-coarse:size-10"
          disabled={locked || feather <= SELECTION_FEATHER_RANGE.min}
          onClick={() => changeFeather(feather - 2)}
          aria-label="선택 페더 2픽셀 줄이기"
        >
          <Minus className="size-3.5" aria-hidden="true" />
        </button>
        <input
          type="number"
          min={SELECTION_FEATHER_RANGE.min}
          max={SELECTION_FEATHER_RANGE.max}
          step={SELECTION_FEATHER_RANGE.step}
          value={feather}
          inputMode="numeric"
          disabled={locked}
          onChange={(event) => changeFeather(event.currentTarget.valueAsNumber)}
          aria-label="선택 페더 픽셀"
          className="h-7 w-12 rounded border border-transparent bg-transparent px-1 text-center text-[0.62rem] tabular-nums text-fg-2 outline-none hover:border-line focus:border-accent disabled:opacity-40 pointer-coarse:h-10"
        />
        <span className="pr-0.5 text-[0.58rem] text-fg-3" aria-hidden="true">px</span>
        <button
          type="button"
          className="grid size-7 place-items-center rounded-md text-fg-3 transition hover:bg-accent/10 hover:text-fg disabled:opacity-40 pointer-coarse:size-10"
          disabled={locked || feather >= SELECTION_FEATHER_RANGE.max}
          onClick={() => changeFeather(feather + 2)}
          aria-label="선택 페더 2픽셀 늘리기"
        >
          <Plus className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      <button
        type="button"
        className={BUTTON_CLASS}
        disabled={locked}
        onClick={onInvert}
        aria-label="픽셀 선택 반전"
      >
        <Contrast className="size-3.5" aria-hidden="true" />
        반전
      </button>
      <button
        type="button"
        className={cn(BUTTON_CLASS, "text-danger hover:border-danger/50 hover:text-danger")}
        disabled={locked}
        onClick={onClear}
        aria-label="픽셀 선택 해제"
      >
        <X className="size-3.5" aria-hidden="true" />
        해제
      </button>
    </div>,
    globalThis.document.body,
  );
});
