/**
 * StudioDrawOptionsBar — Magma / PicsArt / CSP commercial draw chrome.
 *
 * Primary strip: mode · active brush · library · size · opacity · color · sticky tools
 * Progressive disclosure: advanced (stabilizer / pressure / locks / slots)
 * Full brush library sheet (search · favorites · categories)
 */
import {
  ChevronDown,
  ChevronUp,
  Circle,
  Droplets,
  Eraser,
  FlipHorizontal2,
  LayoutGrid,
  Lock,
  LockOpen,
  PaintBucket,
  Pencil,
  Shapes,
  Sparkles,
  Star,
  Wand2,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";

import {
  BRUSH_PRESETS,
  STUDIO_BRUSH_OPACITY_CHIPS,
  STUDIO_BRUSH_SIZE_CHIPS,
  nearestStudioBrushOpacityChip,
  nearestStudioBrushSizeChip,
} from "./studio-brush";
import { StudioDualColorWell } from "./studio-chrome-ui";
import { studioBrushTrayItem } from "./studio-creative-ux";
import {
  StudioOpacityGlyph,
  StudioPostCorrectGlyph,
  StudioPressureCurveGlyph,
  StudioShapePickerStrip,
  StudioSizeChipGlyph,
  StudioStabilizerGlyph,
  StudioStabilizerModeGlyph,
  StudioSymmetryGlyph,
} from "./studio-creative-visuals";
import { STUDIO_BRUSH_SIZE_RANGE } from "./studio-draw-ux";
import { STUDIO_EASE, STUDIO_FOCUS_RING } from "./studio-panel-ui";
import { StudioBrushLibrarySheet } from "./StudioBrushLibrarySheet";
import { StudioBrushPresetIcon } from "./StudioBrushPresetIcon";
import { StudioBrushTray } from "./StudioBrushTray";

import type { StudioBrushSlot } from "./studio-brush-slots";
import type { StudioBrushTrayItem } from "./studio-creative-ux";

import { cn } from "@/lib/utils";

export type StudioDrawModeUi = "pen" | "eraser" | "shape";
export type StudioSymmetryUi = "none" | "vertical" | "horizontal" | "radial" | "kaleidoscope";
export type StudioStabilizerModeUi = "standard" | "adaptive" | "precision";
export type StudioPressureCurveUi = "soft" | "linear" | "firm";

export interface StudioDrawOptionsBarProps {
  drawMode: StudioDrawModeUi;
  brushId: string;
  strokeWidth: number;
  brushOpacity: number;
  stabilizer: number;
  stabilizerMode?: StudioStabilizerModeUi;
  postCorrection?: number;
  pressureCurveId?: StudioPressureCurveUi;
  color: string;
  secondaryColor?: string;
  recentSwatches?: readonly string[];
  brushSlots?: readonly (StudioBrushSlot | null)[];
  symmetryType?: StudioSymmetryUi;
  quickShapeActive: boolean;
  canvasFlipH?: boolean;
  onSelectBrush: (item: StudioBrushTrayItem) => void;
  onStrokeWidthChange: (n: number) => void;
  onOpacityChange: (n: number) => void;
  onStabilizerChange: (n: number) => void;
  onStabilizerModeChange?: (mode: StudioStabilizerModeUi) => void;
  onPostCorrectionChange?: (n: number) => void;
  onPressureCurveChange?: (id: StudioPressureCurveUi) => void;
  onColorChange: (hex: string) => void;
  onSecondaryColorChange?: (hex: string) => void;
  onSwapColors?: () => void;
  onToggleQuickShape: () => void;
  onToggleCanvasFlipH?: () => void;
  onOpenBrushStudio?: () => void;
  onSetDrawMode?: (mode: StudioDrawModeUi) => void;
  onRecallBrushSlot?: (index: number) => void;
  onAssignBrushSlot?: (index: number) => void;
  onSymmetryTypeChange?: (type: StudioSymmetryUi) => void;
  sizeLocked?: boolean;
  opacityLocked?: boolean;
  onToggleSizeLock?: () => void;
  onToggleOpacityLock?: () => void;
  recentBrushIds?: readonly string[];
  favoriteBrushIds?: readonly string[];
  onToggleFavoriteBrush?: (brushId: string) => void;
  onCycleStabilizer?: () => void;
  shapeKind?: string;
  onShapeKindChange?: (kind: string) => void;
  shapeFill?: boolean;
  onShapeFillChange?: (filled: boolean) => void;
  shapeSlot?: ReactNode;
  /** Float above the canvas bottom edge instead of consuming a second top row. */
  docked?: boolean;
  /** Desktop workspace chrome that the fixed dock must not cover. */
  dockInsets?: Readonly<{ left: number; right: number }>;
  className?: string;
}

function SizePreview({
  size,
  color,
  opacity,
}: {
  size: number;
  color: string;
  opacity: number;
}): ReactElement {
  const d = Math.min(26, Math.max(4, size * 0.42));
  const halo = Math.min(30, d + 6);
  return (
    <span
      aria-hidden
      data-studio-size-preview="true"
      className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-line/80 bg-canvas/90 shadow-[inset_0_1px_0_oklch(0.97_0.01_85/0.06)]"
      title={`크기 ${size}px · ${Math.round(opacity * 100)}%`}
    >
      <span
        className="absolute rounded-full opacity-25 blur-[1.5px]"
        style={{ width: halo, height: halo, background: color }}
      />
      <span
        className="relative rounded-full shadow-[0_1px_3px_oklch(0.1_0.01_70/0.35)] ring-1 ring-black/15"
        style={{
          width: d,
          height: d,
          backgroundColor: color,
          opacity: Math.max(0.2, opacity),
        }}
      />
    </span>
  );
}

const iconBtn = cn(
  "grid size-8 shrink-0 place-items-center rounded-lg border",
  STUDIO_EASE,
  STUDIO_FOCUS_RING
);

export function StudioDrawOptionsBar({
  drawMode,
  brushId,
  strokeWidth,
  brushOpacity,
  stabilizer,
  stabilizerMode = "adaptive",
  postCorrection = 0,
  pressureCurveId = "linear",
  color,
  secondaryColor = "#ffffff",
  recentSwatches = [],
  brushSlots = [],
  symmetryType = "none",
  quickShapeActive,
  canvasFlipH = false,
  onSelectBrush,
  onStrokeWidthChange,
  onOpacityChange,
  onStabilizerChange,
  onStabilizerModeChange,
  onPostCorrectionChange,
  onPressureCurveChange,
  onColorChange,
  onSecondaryColorChange,
  onSwapColors,
  onToggleQuickShape,
  onToggleCanvasFlipH,
  onOpenBrushStudio,
  onSetDrawMode,
  onRecallBrushSlot,
  onAssignBrushSlot,
  onSymmetryTypeChange,
  sizeLocked = false,
  opacityLocked = false,
  onToggleSizeLock,
  onToggleOpacityLock,
  recentBrushIds = [],
  favoriteBrushIds = [],
  onToggleFavoriteBrush,
  onCycleStabilizer,
  shapeKind = "line",
  onShapeKindChange,
  shapeFill = false,
  onShapeFillChange,
  shapeSlot,
  docked = false,
  dockInsets = { left: 56, right: 56 },
  className,
}: StudioDrawOptionsBarProps): ReactElement {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [canvasDockFrame, setCanvasDockFrame] = useState<Readonly<{ center: number; width: number }> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const brushLibraryTriggerRef = useRef<HTMLButtonElement>(null);

  const brushMeta = BRUSH_PRESETS.find((preset) => preset.id === brushId);
  const brushTrayItem = brushMeta ? studioBrushTrayItem(brushMeta) : null;
  const isFavorite = favoriteBrushIds.includes(brushId);
  const tipColor = drawMode === "eraser" ? "oklch(0.55 0.02 70)" : color;
  const safeDockLeft = Math.max(0, Math.round(dockInsets.left));
  const safeDockRight = Math.max(0, Math.round(dockInsets.right));

  function closeBrushLibraryAndRestoreFocus() {
    setLibraryOpen(false);
    globalThis.setTimeout(() => brushLibraryTriggerRef.current?.focus(), 0);
  }

  useEffect(() => {
    if (!libraryOpen) return;
    function onPointerDown(e: PointerEvent) {
      const root = rootRef.current;
      if (!root) return;
      if (e.target instanceof Node && !root.contains(e.target)) {
        setLibraryOpen(false);
      }
    }
    globalThis.addEventListener("pointerdown", onPointerDown, true);
    return () => globalThis.removeEventListener("pointerdown", onPointerDown, true);
  }, [libraryOpen]);

  useEffect(() => {
    if (!docked) return;
    const root = rootRef.current;
    if (!root || typeof document === "undefined") return;
    const dockRoot = root;
    const editor = dockRoot.closest<HTMLElement>('[data-studio-editor="true"]') ?? document.documentElement;
    function publishHeight() {
      const height = Math.ceil(dockRoot.getBoundingClientRect().height);
      if (height > 0) editor.style.setProperty("--studio-draw-options-height", `${height}px`);
    }
    publishHeight();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publishHeight);
    observer?.observe(dockRoot);
    return () => {
      observer?.disconnect();
      editor.style.removeProperty("--studio-draw-options-height");
    };
  }, [docked]);

  useEffect(() => {
    if (!docked) return;
    const root = rootRef.current;
    if (!root) return;
    const editor = root.closest<HTMLElement>('[data-studio-editor="true"]');
    const canvasViewport = editor?.querySelector<HTMLElement>('[data-studio-canvas-viewport]');
    if (!canvasViewport) return;
    const measuredCanvasViewport = canvasViewport;

    function measureCanvasFrame() {
      const rect = measuredCanvasViewport.getBoundingClientRect();
      const viewportWidth = Math.max(0, globalThis.innerWidth || document.documentElement.clientWidth);
      const screenWidth = Math.max(0, viewportWidth - 24);
      const minimumWidth = Math.min(320, screenWidth);
      const width = Math.min(Math.max(rect.width - 24, minimumWidth), screenWidth, 1536);
      const half = width / 2;
      const center = Math.min(Math.max(rect.left + rect.width / 2, 12 + half), viewportWidth - 12 - half);
      setCanvasDockFrame((current) =>
        current && Math.abs(current.center - center) < 0.5 && Math.abs(current.width - width) < 0.5
          ? current
          : { center, width }
      );
    }

    measureCanvasFrame();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measureCanvasFrame);
    observer?.observe(measuredCanvasViewport);
    globalThis.addEventListener("resize", measureCanvasFrame);
    return () => {
      observer?.disconnect();
      globalThis.removeEventListener("resize", measureCanvasFrame);
    };
  }, [docked]);

  return (
    <div
      ref={rootRef}
      data-studio-draw-options-dock={docked ? "true" : undefined}
      data-studio-draw-options-dock-left={docked ? safeDockLeft : undefined}
      data-studio-draw-options-dock-right={docked ? safeDockRight : undefined}
      className={cn(
        docked
          ? "pointer-events-none fixed bottom-3 left-1/2 z-[40] hidden w-[min(calc(100vw-7rem),96rem)] -translate-x-1/2 lg:block"
          : "relative z-[40] shrink-0",
        className
      )}
      style={
        docked
          ? {
              left: canvasDockFrame
                ? `${canvasDockFrame.center}px`
                : `clamp(10.75rem, calc(${safeDockLeft}px + (100vw - ${safeDockLeft + safeDockRight}px) / 2), calc(100vw - 10.75rem))`,
              width: canvasDockFrame
                ? `${canvasDockFrame.width}px`
                : `min(max(calc(100vw - ${safeDockLeft + safeDockRight + 24}px), 20rem), calc(100vw - 1.5rem), 96rem)`,
            }
          : undefined
      }
    >
      <div
        role="toolbar"
        aria-label="그리기 옵션"
        data-studio-draw-options="true"
        data-studio-icon-first="true"
        className={cn(
          "pointer-events-auto flex min-h-[3.25rem] flex-nowrap items-center gap-1.5 overflow-x-auto border-b border-line px-2 py-1",
          "[scrollbar-width:thin] [scrollbar-color:oklch(0.42_0.02_70/0.4)_transparent]",
          "bg-panel/95 backdrop-blur-sm",
          docked && "rounded-lg border shadow-[0_18px_48px_oklch(0.06_0.01_70/0.62)]"
        )}
      >
        {onSetDrawMode ? (
          <div className="studio-opt-cluster shrink-0" role="group" aria-label="그리기 모드">
            {(
              [
                { id: "pen" as const, label: "펜", Icon: Pencil },
                { id: "eraser" as const, label: "지우개", Icon: Eraser },
                { id: "shape" as const, label: "도형", Icon: Shapes },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={drawMode === id}
                aria-label={label}
                title={label}
                onClick={() => onSetDrawMode(id)}
                className={cn(
                  iconBtn,
                  "border-transparent",
                  drawMode === id
                    ? "bg-accent text-on-accent shadow-[0_1px_4px_oklch(0.72_0.185_42/0.25)]"
                    : "text-fg-2 hover:bg-raised hover:text-fg"
                )}
              >
                <Icon size={15} strokeWidth={1.75} aria-hidden />
              </button>
            ))}
          </div>
        ) : null}

        {/* Active brush pill + library (PicsArt/Magma) */}
        {drawMode === "pen" ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              ref={brushLibraryTriggerRef}
              type="button"
              onClick={() => setLibraryOpen((v) => !v)}
              aria-expanded={libraryOpen}
              aria-haspopup="dialog"
              title={`${brushMeta?.name ?? brushId} — 브러시 라이브러리`}
              aria-label={`현재 브러시 ${brushMeta?.name ?? brushId}, 라이브러리 열기`}
              data-studio-brush-active-pill="true"
              className={cn(
                "flex h-9 max-w-[9.5rem] items-center gap-1.5 rounded-xl border px-2",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
                libraryOpen
                  ? "border-accent bg-accent text-on-accent shadow-[0_2px_8px_oklch(0.72_0.185_42/0.28)]"
                  : "border-line/80 bg-card text-fg hover:border-accent/40 hover:bg-raised"
              )}
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-md",
                  libraryOpen ? "bg-on-accent/15" : "bg-canvas/70"
                )}
                aria-hidden
              >
                <StudioBrushPresetIcon brushId={brushId} size={13} strokeWidth={2} />
              </span>
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full ring-1 ring-black/15"
                style={{ background: tipColor, opacity: brushOpacity }}
              />
              <span className="min-w-0 truncate text-[0.7rem] font-bold leading-none">
                {brushTrayItem?.shortName ?? brushMeta?.name?.slice(0, 6) ?? brushId}
              </span>
              <LayoutGrid size={12} className="shrink-0 opacity-80" aria-hidden />
            </button>
            {onToggleFavoriteBrush ? (
              <button
                type="button"
                title={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                aria-pressed={isFavorite}
                aria-label={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                onClick={() => onToggleFavoriteBrush(brushId)}
                className={cn(
                  iconBtn,
                  "size-8",
                  isFavorite
                    ? "border-accent/50 bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg"
                )}
              >
                <Star size={13} fill={isFavorite ? "currentColor" : "none"} aria-hidden />
              </button>
            ) : null}
          </div>
        ) : null}

        {drawMode === "shape" && onShapeKindChange ? (
          <div className="flex min-w-0 max-w-[min(28rem,52vw)] shrink items-center gap-1">
            <StudioShapePickerStrip
              activeKind={shapeKind}
              onSelect={onShapeKindChange}
              filled={shapeFill}
              showLabels={false}
              className="min-w-0"
            />
            {onShapeFillChange ? (
              <button
                type="button"
                aria-pressed={shapeFill}
                disabled={shapeKind === "line" || shapeKind === "arrow"}
                title="도형 채우기"
                aria-label="도형 채우기"
                onClick={() => onShapeFillChange(!shapeFill)}
                className={cn(
                  iconBtn,
                  shapeFill && shapeKind !== "line" && shapeKind !== "arrow"
                    ? "border-accent/55 bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg",
                  (shapeKind === "line" || shapeKind === "arrow") && "cursor-not-allowed opacity-45"
                )}
              >
                <PaintBucket size={14} strokeWidth={1.75} aria-hidden />
              </button>
            ) : null}
          </div>
        ) : null}

        <span aria-hidden className="hidden h-5 w-px shrink-0 bg-line sm:block" />

        <SizePreview size={strokeWidth} color={tipColor} opacity={brushOpacity} />

        <label className="flex shrink-0 items-center gap-1 text-fg-3" title={`크기 ${strokeWidth}px`}>
          <Circle size={12} strokeWidth={1.75} className="shrink-0 opacity-80" aria-hidden />
          <span className="sr-only">크기</span>
          <input
            type="range"
            min={STUDIO_BRUSH_SIZE_RANGE.min}
            max={STUDIO_BRUSH_SIZE_RANGE.max}
            value={strokeWidth}
            onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
            className="studio-range w-16 sm:w-20"
            aria-label="브러시 크기"
            aria-valuetext={`${strokeWidth}픽셀`}
          />
          <span className="w-6 tabular-nums text-[0.68rem] font-bold text-fg">{strokeWidth}</span>
        </label>


        <label
          className="flex shrink-0 items-center gap-1 text-fg-3"
          title={`불투명도 ${Math.round(brushOpacity * 100)}%`}
        >
          <StudioOpacityGlyph opacity01={brushOpacity} />
          <span className="sr-only">불투명</span>
          <input
            type="range"
            min={5}
            max={100}
            step={1}
            value={Math.round(brushOpacity * 100)}
            onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
            className="studio-range w-14 sm:w-16"
            aria-label="브러시 불투명도"
          />
          <span className="w-7 tabular-nums text-[0.68rem] font-bold text-fg">
            {Math.round(brushOpacity * 100)}
          </span>
        </label>

        {drawMode !== "eraser" ? (
          <>
            <span aria-hidden className="hidden h-5 w-px shrink-0 bg-line/80 sm:block" />
            <StudioDualColorWell
              primary={color}
              secondary={secondaryColor}
              recent={recentSwatches}
              onPrimaryChange={onColorChange}
              onSecondaryChange={onSecondaryColorChange}
              onSwap={onSwapColors}
            />
          </>
        ) : null}

        {/* Advanced toggle — Magma-style progressive disclosure */}
        <button
          type="button"
          aria-expanded={advancedOpen}
          aria-controls="studio-draw-advanced"
          onClick={() => setAdvancedOpen((v) => !v)}
          title={advancedOpen ? "세부 옵션 접기" : "세부 옵션 (프리셋·보정·필압·대칭·슬롯)"}
          aria-label={advancedOpen ? "세부 옵션 접기" : "세부 옵션 펼치기"}
          data-studio-draw-advanced-toggle="true"
          className={cn(
            iconBtn,
            "size-8",
            advancedOpen
              ? "border-accent/50 bg-accent-soft text-accent"
              : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg"
          )}
        >
          {advancedOpen ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
        </button>

        <div
          data-studio-draw-options-end="true"
          className={cn(
            "sticky right-0 ml-auto flex shrink-0 items-center gap-1 border-l border-line/70 bg-panel/95 pl-1.5 backdrop-blur-sm",
            "shadow-[-10px_0_12px_-8px_oklch(0.12_0.02_70/0.55)]"
          )}
        >
          {onToggleCanvasFlipH ? (
            <button
              type="button"
              aria-pressed={canvasFlipH}
              onClick={onToggleCanvasFlipH}
              title="캔버스 좌우 반전"
              aria-label="캔버스 좌우 반전"
              className={cn(
                iconBtn,
                "size-7",
                canvasFlipH
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg"
              )}
            >
              <FlipHorizontal2 size={13} strokeWidth={1.75} aria-hidden />
            </button>
          ) : null}

          {onOpenBrushStudio ? (
            <button
              type="button"
              onClick={onOpenBrushStudio}
              title="브러시 스튜디오 — 필압·도장·촉 고급 설정"
              aria-label="브러시 고급 설정"
              className={cn(iconBtn, "size-7 border-line bg-card text-fg-2 hover:bg-raised")}
            >
              <Wand2 size={13} strokeWidth={1.75} aria-hidden />
            </button>
          ) : null}


          {drawMode === "pen" ? (
            <button
              type="button"
              aria-pressed={quickShapeActive}
              onClick={onToggleQuickShape}
              title="스마트 도형 — 낙서를 선·원·사각형으로"
              aria-label="스마트 도형"
              className={cn(
                iconBtn,
                "size-7",
                quickShapeActive
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2 hover:bg-raised"
              )}
            >
              {quickShapeActive ? (
                <Sparkles size={13} strokeWidth={1.75} aria-hidden />
              ) : (
                <Shapes size={13} strokeWidth={1.75} aria-hidden />
              )}
            </button>
          ) : null}

          {shapeSlot}
        </div>
      </div>

      {/* Advanced row — stabilizer, pressure, slots (collapsed by default) */}
      {advancedOpen ? (
        <div
          id="studio-draw-advanced"
          data-studio-draw-advanced="true"
          className={cn(
            "pointer-events-auto flex flex-nowrap items-center gap-1.5 overflow-x-auto border-b border-line bg-canvas/95 px-2 py-1.5 [scrollbar-width:thin]",
            docked && "mt-1 rounded-lg border shadow-[0_14px_36px_oklch(0.06_0.01_70/0.52)]"
          )}
        >
          {drawMode === "pen" ? (
            <StudioBrushTray
              activeBrushId={brushId}
              compact
              hideCategories
              onSelect={onSelectBrush}
              className="w-[18rem] shrink-0"
              aria-label="빠른 브러시 프리셋"
            />
          ) : null}

          <div className="studio-opt-cluster shrink-0" role="group" aria-label="브러시 크기 프리셋">
            {STUDIO_BRUSH_SIZE_CHIPS.map((chip) => {
              const active = nearestStudioBrushSizeChip(strokeWidth) === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  title={`${chip.label} · ${chip.width}px`}
                  aria-label={`브러시 크기 ${chip.label} ${chip.width}픽셀`}
                  aria-pressed={active}
                  onClick={() => onStrokeWidthChange(chip.width)}
                  className={cn(
                    "grid size-7 place-items-center rounded-lg",
                    STUDIO_EASE,
                    STUDIO_FOCUS_RING,
                    active ? "bg-accent text-on-accent" : "text-fg-3 hover:bg-raised hover:text-fg"
                  )}
                >
                  <StudioSizeChipGlyph widthPx={Math.min(chip.width, 40)} />
                </button>
              );
            })}
            {onToggleSizeLock ? (
              <button
                type="button"
                title={sizeLocked ? "크기 잠금 해제" : "크기 잠금"}
                aria-pressed={sizeLocked}
                aria-label="브러시 크기 잠금"
                onClick={onToggleSizeLock}
                className={cn(
                  iconBtn,
                  "size-7 border-transparent",
                  sizeLocked ? "bg-accent-soft text-accent" : "text-fg-3 hover:bg-raised"
                )}
              >
                {sizeLocked ? <Lock size={12} aria-hidden /> : <LockOpen size={12} aria-hidden />}
              </button>
            ) : null}
          </div>

          <div className="studio-opt-cluster shrink-0" role="group" aria-label="브러시 불투명도 프리셋">
            {STUDIO_BRUSH_OPACITY_CHIPS.map((chip) => {
              const active = nearestStudioBrushOpacityChip(brushOpacity) === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  title={`불투명도 ${chip.label}`}
                  aria-label={`브러시 불투명도 ${chip.label}`}
                  aria-pressed={active}
                  onClick={() => onOpacityChange(chip.opacity)}
                  className={cn(
                    "min-w-7 rounded-lg px-1 py-1 text-[0.62rem] font-bold tabular-nums",
                    STUDIO_EASE,
                    STUDIO_FOCUS_RING,
                    active ? "bg-accent text-on-accent" : "text-fg-3 hover:bg-raised hover:text-fg"
                  )}
                >
                  {Math.round(chip.opacity * 100)}
                </button>
              );
            })}
            {onToggleOpacityLock ? (
              <button
                type="button"
                title={opacityLocked ? "불투명도 잠금 해제" : "불투명도 잠금"}
                aria-pressed={opacityLocked}
                aria-label="브러시 불투명도 잠금"
                onClick={onToggleOpacityLock}
                className={cn(
                  iconBtn,
                  "size-7 border-transparent",
                  opacityLocked ? "bg-accent-soft text-accent" : "text-fg-3 hover:bg-raised"
                )}
              >
                <Droplets size={12} strokeWidth={1.75} aria-hidden />
              </button>
            ) : null}
          </div>

          {onSymmetryTypeChange ? (
            <div className="studio-opt-cluster shrink-0" role="group" aria-label="대칭 그리기">
              {(
                [
                  { id: "none" as const, label: "없음" },
                  { id: "vertical" as const, label: "세로" },
                  { id: "horizontal" as const, label: "가로" },
                  { id: "radial" as const, label: "방사" },
                  { id: "kaleidoscope" as const, label: "만화경" },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={symmetryType === item.id}
                  title={`대칭: ${item.label}`}
                  aria-label={`대칭 ${item.label}`}
                  onClick={() => onSymmetryTypeChange(item.id)}
                  className={cn(
                    iconBtn,
                    "size-7 border-transparent",
                    symmetryType === item.id
                      ? "bg-accent text-on-accent"
                      : "text-fg-3 hover:bg-raised hover:text-fg"
                  )}
                >
                  <StudioSymmetryGlyph mode={item.id} />
                </button>
              ))}
            </div>
          ) : null}

          {onRecallBrushSlot ? (
            <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="최근 브러시 슬롯 1–6">
              {Array.from({ length: 6 }, (_, index) => {
                const slot = brushSlots[index] ?? null;
                const slotW = slot ? Math.min(10, Math.max(3, slot.strokeWidth * 0.45)) : 0;
                return (
                  <button
                    key={index}
                    type="button"
                    disabled={!slot && !onAssignBrushSlot}
                    title={
                      slot
                        ? `${index + 1}: ${slot.brushId} · ${slot.strokeWidth}px`
                        : `${index + 1}: 빈 슬롯 — 클릭으로 저장`
                    }
                    aria-label={`브러시 슬롯 ${index + 1}`}
                    onClick={(e) => {
                      if (e.shiftKey && onAssignBrushSlot) onAssignBrushSlot(index);
                      else if (slot) onRecallBrushSlot(index);
                      else if (onAssignBrushSlot) onAssignBrushSlot(index);
                    }}
                    className={cn(
                      "grid size-7 place-items-center rounded-lg border",
                      STUDIO_EASE,
                      STUDIO_FOCUS_RING,
                      slot
                        ? "border-line/80 bg-card text-fg-2 hover:border-accent/45 hover:bg-raised"
                        : "border-dashed border-line/60 text-fg-3 hover:bg-raised/70"
                    )}
                  >
                    {slot ? (
                      <span
                        aria-hidden
                        className="rounded-full ring-1 ring-black/20"
                        style={{
                          width: slotW,
                          height: slotW,
                          background: color,
                          opacity: slot.brushOpacity,
                        }}
                      />
                    ) : (
                      <span className="text-[0.55rem] font-bold tabular-nums text-fg-3">{index + 1}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : null}

          <label
            className="flex shrink-0 items-center gap-1 text-fg-3"
            title={`손떨림 보정 ${stabilizer} (S: 단계 순환)`}
          >
            <StudioStabilizerGlyph />
            <span className="sr-only">보정</span>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={stabilizer}
              onChange={(e) => onStabilizerChange(Number(e.target.value))}
              className="studio-range w-14"
              aria-label="손떨림 보정"
            />
            {onCycleStabilizer ? (
              <button
                type="button"
                title="보정 강도 순환 (S)"
                aria-label={`보정 강도 ${stabilizer}`}
                onClick={onCycleStabilizer}
                className={cn(
                  "w-5 rounded tabular-nums text-[0.68rem] font-bold text-fg hover:bg-raised",
                  STUDIO_FOCUS_RING
                )}
              >
                {stabilizer}
              </button>
            ) : (
              <span className="w-4 tabular-nums text-[0.68rem] font-bold text-fg">{stabilizer}</span>
            )}
          </label>

          {onStabilizerModeChange ? (
            <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="보정 방식">
              {(
                [
                  { id: "standard" as const, label: "표준" },
                  { id: "adaptive" as const, label: "적응" },
                  { id: "precision" as const, label: "정밀" },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={stabilizerMode === item.id}
                  aria-label={`보정 방식 ${item.label}`}
                  title={`보정 방식: ${item.label}`}
                  onClick={() => onStabilizerModeChange(item.id)}
                  className={cn(
                    iconBtn,
                    "size-7 border-transparent",
                    stabilizerMode === item.id
                      ? "bg-raised text-fg ring-1 ring-accent/40"
                      : "text-fg-3 hover:bg-raised/70"
                  )}
                >
                  <StudioStabilizerModeGlyph mode={item.id} />
                </button>
              ))}
            </div>
          ) : null}

          {onPostCorrectionChange ? (
            <label
              className="flex shrink-0 items-center gap-1 text-fg-3"
              title={`후처리 ${postCorrection}`}
            >
              <StudioPostCorrectGlyph />
              <span className="sr-only">후처리</span>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={postCorrection}
                onChange={(e) => onPostCorrectionChange(Number(e.target.value))}
                className="w-12 accent-accent"
                aria-label="후처리 보정"
              />
              <span className="w-4 tabular-nums text-[0.68rem] font-bold text-fg-2">{postCorrection}</span>
            </label>
          ) : null}

          {onPressureCurveChange ? (
            <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="필압 반응">
              {(
                [
                  { id: "soft" as const, label: "민감" },
                  { id: "linear" as const, label: "기본" },
                  { id: "firm" as const, label: "단단" },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={pressureCurveId === item.id}
                  aria-label={`필압 ${item.label}`}
                  title={`필압: ${item.label}`}
                  onClick={() => onPressureCurveChange(item.id)}
                  className={cn(
                    iconBtn,
                    "size-7 border-transparent",
                    pressureCurveId === item.id
                      ? "bg-raised text-fg ring-1 ring-accent/40"
                      : "text-fg-3 hover:bg-raised/70"
                  )}
                >
                  <StudioPressureCurveGlyph curve={item.id} />
                </button>
              ))}
            </div>
          ) : null}

          <p className="hidden shrink-0 text-[0.6rem] text-fg-3 sm:block">
            Shift+클릭 슬롯 저장 · S 보정 순환 · [ ] 크기
          </p>
        </div>
      ) : null}

      {drawMode === "pen" ? (
        <StudioBrushLibrarySheet
          open={libraryOpen}
          activeBrushId={brushId}
          favoriteIds={favoriteBrushIds}
          recentIds={recentBrushIds}
          onClose={closeBrushLibraryAndRestoreFocus}
          onSelect={onSelectBrush}
          onToggleFavorite={onToggleFavoriteBrush}
          className={cn(
            "pointer-events-auto",
            docked && "bottom-[calc(100%+0.4rem)] top-auto"
          )}
        />
      ) : null}
    </div>
  );
}
