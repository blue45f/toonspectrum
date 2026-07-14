/**
 * StudioDrawOptionsBar — Krita/Pixlr tool-options + Canva size chips + MediBang clarity.
 * Tool identity · brush kit · size · opacity · stabilizer · color · smart shape.
 * Pure presentation.
 */
import {
  ArrowLeftRight,
  Eraser,
  FlipHorizontal2,
  Lock,
  LockOpen,
  Pencil,
  Shapes,
  Sparkles,
  Star,
  Wand2,
} from "lucide-react";

import {
  BRUSH_PRESETS,
  STUDIO_BRUSH_SIZE_CHIPS,
  nearestStudioBrushSizeChip,
} from "./studio-brush";
import { StudioToolIdentity } from "./studio-chrome-ui";
import { STUDIO_EASE, STUDIO_FOCUS_RING } from "./studio-panel-ui";
import { StudioBrushTray } from "./StudioBrushTray";

import type { StudioBrushSlot } from "./studio-brush-slots";
import type { StudioBrushTrayItem } from "./studio-creative-ux";
import type { ReactElement, ReactNode } from "react";

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
  compactBrushes?: boolean;
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
  /** Procreate: keep size when switching brushes. */
  sizeLocked?: boolean;
  opacityLocked?: boolean;
  onToggleSizeLock?: () => void;
  onToggleOpacityLock?: () => void;
  /** Ibis/Procreate recent built-in brush ids (newest first). */
  recentBrushIds?: readonly string[];
  favoriteBrushIds?: readonly string[];
  onToggleFavoriteBrush?: (brushId: string) => void;
  onSelectRecentBrush?: (brushId: string) => void;
  onCycleStabilizer?: () => void;
  shapeSlot?: ReactNode;
  className?: string;
}

function SizePreview({ size, color }: { size: number; color: string }): ReactElement {
  const d = Math.min(22, Math.max(4, size * 0.55));
  return (
    <span
      aria-hidden
      className="grid size-8 place-items-center rounded-xl border border-line/80 bg-canvas/80 shadow-[inset_0_1px_0_oklch(0.97_0.01_85/0.05)]"
      title={`크기 ${size}px`}
    >
      <span
        className="rounded-full shadow-[0_1px_3px_oklch(0.1_0.01_70/0.35)]"
        style={{
          width: d,
          height: d,
          backgroundColor: color,
          opacity: 0.95,
        }}
      />
    </span>
  );
}

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
  compactBrushes = true,
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
  onSelectRecentBrush,
  onCycleStabilizer,
  shapeSlot,
  className,
}: StudioDrawOptionsBarProps): ReactElement {
  const brushMeta = BRUSH_PRESETS.find((preset) => preset.id === brushId);
  const identityTitle =
    drawMode === "eraser" ? "지우개" : drawMode === "shape" ? "도형" : (brushMeta?.name ?? "펜");
  const identityDetail =
    drawMode === "eraser"
      ? `${strokeWidth}px`
      : drawMode === "shape"
        ? "드래그로 그리기"
        : `${strokeWidth}px · ${Math.round(brushOpacity * 100)}%${sizeLocked ? " · 크기잠금" : ""}${opacityLocked ? " · 불투명잠금" : ""}`;
  const IdentityIcon = drawMode === "eraser" ? Eraser : Pencil;
  const isFavorite = favoriteBrushIds.includes(brushId);
  const recentPresets = recentBrushIds
    .map((id) => BRUSH_PRESETS.find((preset) => preset.id === id))
    .filter((preset): preset is (typeof BRUSH_PRESETS)[number] => Boolean(preset));

  return (
    <div
      role="toolbar"
      aria-label="그리기 옵션"
      data-studio-draw-options="true"
      className={cn(
        // Primary icons stay in view; secondary chips can scroll. End cluster is sticky.
        "relative flex h-[3.25rem] min-h-[3.25rem] shrink-0 flex-nowrap items-center gap-2 overflow-x-auto border-b border-line px-2.5",
        "[scrollbar-width:thin] [scrollbar-color:oklch(0.42_0.02_70/0.4)_transparent]",
        className
      )}
    >
      {/* Krita/Pixlr: always know the active tool */}
      <StudioToolIdentity
        icon={IdentityIcon}
        title={identityTitle}
        detail={identityDetail}
        shortcut={drawMode === "eraser" ? "E" : drawMode === "pen" ? "B" : undefined}
        className="hidden sm:inline-flex"
      />

      {onSetDrawMode ? (
        <div className="studio-opt-cluster shrink-0" role="group" aria-label="그리기 모드">
          {(
            [
              { id: "pen" as const, label: "펜", Icon: Pencil },
              { id: "eraser" as const, label: "지우개", Icon: Eraser },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={drawMode === id}
              title={label}
              onClick={() => onSetDrawMode(id)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[0.7rem] font-semibold",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
                drawMode === id
                  ? "bg-accent text-on-accent shadow-[0_1px_4px_oklch(0.72_0.185_42/0.25)]"
                  : "text-fg-2 hover:bg-raised hover:text-fg"
              )}
            >
              <Icon size={14} strokeWidth={1.75} aria-hidden />
              <span className="hidden md:inline">{label}</span>
            </button>
          ))}
        </div>
      ) : null}

      {onRecallBrushSlot ? (
        <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="최근 브러시 슬롯 1–6">
          {Array.from({ length: 6 }, (_, index) => {
            const slot = brushSlots[index] ?? null;
            return (
              <button
                key={index}
                type="button"
                disabled={!slot && !onAssignBrushSlot}
                title={
                  slot
                    ? `${index + 1}: ${slot.brushId} · ${slot.strokeWidth}px · ${Math.round(slot.brushOpacity * 100)}% (클릭=호출, Shift+클릭=저장)`
                    : `${index + 1}: 빈 슬롯 — Shift+클릭으로 현재 브러시 저장`
                }
                aria-label={`브러시 슬롯 ${index + 1}`}
                onClick={(e) => {
                  if (e.shiftKey && onAssignBrushSlot) onAssignBrushSlot(index);
                  else if (slot) onRecallBrushSlot(index);
                  else if (onAssignBrushSlot) onAssignBrushSlot(index);
                }}
                className={cn(
                  "grid size-7 place-items-center rounded-lg border text-[0.6rem] font-bold tabular-nums",
                  STUDIO_EASE,
                  STUDIO_FOCUS_RING,
                  slot
                    ? "border-line/80 bg-card text-fg-2 hover:border-accent/45 hover:bg-raised"
                    : "border-dashed border-line/60 text-fg-3 hover:bg-raised/70",
                  !slot && !onAssignBrushSlot && "opacity-40"
                )}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
      ) : null}

      {drawMode === "pen" ? (
        <StudioBrushTray
          activeBrushId={brushId}
          compact={compactBrushes}
          onSelect={onSelectBrush}
          // Cap width so size/color/end icons stay on-screen at laptop widths.
          className="min-w-0 max-w-[min(14rem,28vw)] xl:max-w-[min(20rem,34vw)]"
        />
      ) : null}

      {/* Ibis/Procreate recent strip */}
      {drawMode === "pen" && recentPresets.length > 0 && onSelectRecentBrush ? (
        <div
          className="flex shrink-0 items-center gap-0.5"
          role="group"
          aria-label="최근 브러시"
        >
          {recentPresets.slice(0, 4).map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={`최근: ${preset.name}`}
              aria-pressed={brushId === preset.id}
              onClick={() => onSelectRecentBrush(preset.id)}
              className={cn(
                "max-w-[3.5rem] truncate rounded-md px-1.5 py-1 text-[0.55rem] font-bold",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
                brushId === preset.id
                  ? "bg-accent text-on-accent"
                  : "bg-card text-fg-3 ring-1 ring-line/70 hover:bg-raised hover:text-fg"
              )}
            >
              {preset.name.replace(/\(.*\)/, "").trim().slice(0, 4)}
            </button>
          ))}
        </div>
      ) : null}

      {drawMode === "pen" && onToggleFavoriteBrush ? (
        <button
          type="button"
          title={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가 (CSP/Ibis)"}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          onClick={() => onToggleFavoriteBrush(brushId)}
          className={cn(
            "grid size-7 place-items-center rounded-md border",
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
            isFavorite
              ? "border-accent/50 bg-accent-soft text-accent"
              : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg"
          )}
        >
          <Star size={13} strokeWidth={1.75} fill={isFavorite ? "currentColor" : "none"} aria-hidden />
        </button>
      ) : null}

      <span aria-hidden className="hidden h-5 w-px shrink-0 bg-line sm:block" />

      <SizePreview size={strokeWidth} color={drawMode === "eraser" ? "oklch(0.55 0.02 70)" : color} />

      {/* Procreate size / opacity locks */}
      {onToggleSizeLock ? (
        <button
          type="button"
          title={sizeLocked ? "크기 잠금 해제 (Shift+S)" : "크기 잠금 — 브러시 전환 시 크기 유지 (Shift+S)"}
          aria-pressed={sizeLocked}
          aria-label="브러시 크기 잠금"
          onClick={onToggleSizeLock}
          className={cn(
            "grid size-7 place-items-center rounded-md border",
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
            sizeLocked
              ? "border-accent/50 bg-accent-soft text-accent"
              : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg"
          )}
        >
          {sizeLocked ? <Lock size={12} aria-hidden /> : <LockOpen size={12} aria-hidden />}
        </button>
      ) : null}
      {onToggleOpacityLock ? (
        <button
          type="button"
          title={opacityLocked ? "불투명 잠금 해제 (Alt+S)" : "불투명 잠금 — 브러시 전환 시 농도 유지 (Alt+S)"}
          aria-pressed={opacityLocked}
          aria-label="브러시 불투명도 잠금"
          onClick={onToggleOpacityLock}
          className={cn(
            "grid size-7 place-items-center rounded-md border text-[0.55rem] font-bold",
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
            opacityLocked
              ? "border-accent/50 bg-accent-soft text-accent"
              : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg"
          )}
        >
          %
        </button>
      ) : null}

      {/* Canva/Express-style size chips — one-tap brush scale */}
      <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="브러시 크기 프리셋">
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
                "grid h-7 min-w-7 place-items-center rounded-lg px-1.5 text-[0.6rem] font-bold tabular-nums",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
                active
                  ? "bg-accent text-on-accent shadow-[0_1px_4px_oklch(0.72_0.185_42/0.28)]"
                  : "bg-card/90 text-fg-3 ring-1 ring-line/70 hover:bg-raised hover:text-fg"
              )}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      <label className="flex shrink-0 items-center gap-1 text-[0.65rem] font-semibold text-fg-3">
        <span className="select-none">크기</span>
        <input
          type="range"
          min={1}
          max={48}
          value={strokeWidth}
          onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
          className="studio-range w-16 sm:w-20"
          aria-valuetext={`${strokeWidth}픽셀`}
        />
        <span className="w-6 tabular-nums text-[0.68rem] text-fg">{strokeWidth}</span>
      </label>

      <label className="flex shrink-0 items-center gap-1 text-[0.68rem] font-medium text-fg-3">
        <span className="select-none">불투명</span>
        <input
          type="range"
          min={5}
          max={100}
          step={1}
          value={Math.round(brushOpacity * 100)}
          onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
          className="studio-range w-14 sm:w-16"
        />
        <span className="w-7 tabular-nums text-[0.68rem] text-fg">{Math.round(brushOpacity * 100)}%</span>
      </label>

      <label className="flex shrink-0 items-center gap-1 text-[0.68rem] font-medium text-fg-3" title="라이브 손떨림 보정 강도 (S: 단계 순환 · SAI/CSP)">
        <span className="select-none">보정</span>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={stabilizer}
          onChange={(e) => onStabilizerChange(Number(e.target.value))}
          className="studio-range w-12 sm:w-14"
        />
        {onCycleStabilizer ? (
          <button
            type="button"
            title="보정 강도 순환 (S)"
            onClick={onCycleStabilizer}
            className={cn(
              "w-5 rounded tabular-nums text-[0.68rem] font-bold text-fg hover:bg-raised",
              STUDIO_FOCUS_RING
            )}
          >
            {stabilizer}
          </button>
        ) : (
          <span className="w-4 tabular-nums text-[0.68rem] text-fg">{stabilizer}</span>
        )}
      </label>

      {/* Secondary drawing science — hide under xl so icons/color stay exposed on laptop widths */}
      {onStabilizerModeChange ? (
        <div className="hidden shrink-0 items-center gap-0.5 xl:flex" role="group" aria-label="보정 방식">
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
              title={`보정 방식: ${item.label}`}
              onClick={() => onStabilizerModeChange(item.id)}
              className={cn(
                "h-7 rounded px-1.5 text-[0.58rem] font-bold",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
                stabilizerMode === item.id
                  ? "bg-raised text-fg ring-1 ring-accent/40"
                  : "text-fg-3 hover:bg-raised/70"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {onPostCorrectionChange ? (
        <label
          className="hidden shrink-0 items-center gap-1 text-[0.65rem] font-semibold text-fg-3 xl:flex"
          title="획 끝난 뒤 곡선 다듬기"
        >
          <span className="select-none">후처리</span>
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={postCorrection}
            onChange={(e) => onPostCorrectionChange(Number(e.target.value))}
            className="w-12 accent-accent"
          />
          <span className="w-4 tabular-nums text-fg-2">{postCorrection}</span>
        </label>
      ) : null}

      {onPressureCurveChange ? (
        <div className="hidden shrink-0 items-center gap-0.5 xl:flex" role="group" aria-label="필압 반응">
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
              title={`필압: ${item.label}`}
              onClick={() => onPressureCurveChange(item.id)}
              className={cn(
                "h-7 rounded px-1.5 text-[0.58rem] font-bold",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
                pressureCurveId === item.id
                  ? "bg-raised text-fg ring-1 ring-accent/40"
                  : "text-fg-3 hover:bg-raised/70"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {drawMode !== "eraser" ? (
        <>
          <span aria-hidden className="h-5 w-px shrink-0 bg-line" />
          <div className="flex shrink-0 items-center gap-1" aria-label="색상">
            {recentSwatches.slice(0, 5).map((swatch) => (
              <button
                key={swatch}
                type="button"
                title={swatch}
                aria-label={`색 ${swatch}`}
                onClick={() => onColorChange(swatch)}
                className={cn(
                  "size-5 rounded-md border transition-transform hover:scale-110",
                  STUDIO_FOCUS_RING,
                  color.toLowerCase() === swatch.toLowerCase()
                    ? "ring-2 ring-accent ring-offset-1 ring-offset-panel"
                    : "border-line/70"
                )}
                style={{ background: swatch }}
              />
            ))}
            <div className="relative size-7">
              {onSecondaryColorChange ? (
                <label
                  className="absolute bottom-0 right-0 size-4 cursor-pointer overflow-hidden rounded border border-line shadow-sm"
                  title="보조 색 (X로 교체)"
                  style={{ background: secondaryColor }}
                >
                  <span className="sr-only">보조 색</span>
                  <input
                    type="color"
                    value={secondaryColor}
                    onChange={(e) => onSecondaryColorChange(e.target.value)}
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                    aria-label="보조 색"
                  />
                </label>
              ) : null}
              <label
                className="absolute left-0 top-0 size-5 cursor-pointer overflow-hidden rounded-md border border-line shadow-sm"
                title="주 색"
                style={{ background: color }}
              >
                <span className="sr-only">브러시 색 선택</span>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => onColorChange(e.target.value)}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                  aria-label="브러시 색 선택"
                />
              </label>
            </div>
            {onSwapColors ? (
              <button
                type="button"
                onClick={onSwapColors}
                title="주/보조 색 교체 (X)"
                aria-label="주 색과 보조 색 교체"
                className={cn(
                  "grid size-7 place-items-center rounded border border-line text-fg-3 hover:bg-raised hover:text-fg",
                  STUDIO_EASE,
                  STUDIO_FOCUS_RING
                )}
              >
                <ArrowLeftRight size={12} aria-hidden />
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {/* Sticky end cluster — always pin primary action icons even when the middle scrolls */}
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
            title="캔버스 좌우 반전 (그리기 확인용)"
            aria-label="캔버스 좌우 반전"
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md border px-1.5 text-[0.6rem] font-bold",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
              canvasFlipH
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg"
            )}
          >
            <FlipHorizontal2 size={13} strokeWidth={1.75} aria-hidden />
            <span className="hidden sm:inline">반전</span>
          </button>
        ) : null}

        {onOpenBrushStudio ? (
          <button
            type="button"
            onClick={onOpenBrushStudio}
            title="브러시 스튜디오 — 필압·도장·촉 고급 설정"
            aria-label="브러시 고급 설정"
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md border border-line bg-card px-1.5 text-[0.6rem] font-bold text-fg-2 hover:bg-raised",
              STUDIO_EASE,
              STUDIO_FOCUS_RING
            )}
          >
            <Wand2 size={13} strokeWidth={1.75} aria-hidden />
            <span className="hidden sm:inline">고급</span>
          </button>
        ) : null}

        {onSymmetryTypeChange ? (
          <div className="hidden shrink-0 items-center gap-0.5 lg:flex" role="group" aria-label="대칭 그리기">
            <FlipHorizontal2 size={13} className="mr-0.5 text-fg-3" aria-hidden />
            {(
              [
                { id: "none" as const, label: "없음" },
                { id: "vertical" as const, label: "세로" },
                { id: "horizontal" as const, label: "가로" },
                { id: "radial" as const, label: "방사" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={symmetryType === item.id}
                title={`대칭: ${item.label}`}
                onClick={() => onSymmetryTypeChange(item.id)}
                className={cn(
                  "h-7 rounded px-1.5 text-[0.6rem] font-bold",
                  STUDIO_EASE,
                  STUDIO_FOCUS_RING,
                  symmetryType === item.id
                    ? "bg-accent text-on-accent"
                    : "text-fg-3 hover:bg-raised hover:text-fg-2"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}

        {drawMode === "pen" ? (
          <button
            type="button"
            aria-pressed={quickShapeActive}
            onClick={onToggleQuickShape}
            title="스마트 도형 — 낙서를 선·원·사각형으로 다듬기"
            aria-label="스마트 도형"
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[0.65rem] font-bold",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
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
            <span className="hidden sm:inline">스마트 도형</span>
          </button>
        ) : null}

        {shapeSlot}
      </div>
    </div>
  );
}
