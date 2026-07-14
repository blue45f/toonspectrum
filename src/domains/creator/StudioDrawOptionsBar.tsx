/**
 * StudioDrawOptionsBar — tool options strip under the menu (CSP/Fresco/Magma Properties lite).
 * Brush kit · size · opacity · stabilizer · color · smart shape.
 * Pure presentation.
 */
import { Eraser, FlipHorizontal2, Pencil, Shapes, Sparkles } from "lucide-react";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "./studio-panel-ui";
import { StudioBrushTray } from "./StudioBrushTray";

import type { StudioBrushSlot } from "./studio-brush-slots";
import type { StudioBrushTrayItem } from "./studio-creative-ux";
import type { ReactElement, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type StudioDrawModeUi = "pen" | "eraser" | "shape";
export type StudioSymmetryUi = "none" | "vertical" | "horizontal" | "radial" | "kaleidoscope";

export interface StudioDrawOptionsBarProps {
  drawMode: StudioDrawModeUi;
  brushId: string;
  strokeWidth: number;
  brushOpacity: number;
  stabilizer: number;
  stabilizerModeLabel?: string;
  color: string;
  recentSwatches?: readonly string[];
  brushSlots?: readonly (StudioBrushSlot | null)[];
  symmetryType?: StudioSymmetryUi;
  quickShapeActive: boolean;
  compactBrushes?: boolean;
  onSelectBrush: (item: StudioBrushTrayItem) => void;
  onStrokeWidthChange: (n: number) => void;
  onOpacityChange: (n: number) => void;
  onStabilizerChange: (n: number) => void;
  onColorChange: (hex: string) => void;
  onToggleQuickShape: () => void;
  onSetDrawMode?: (mode: StudioDrawModeUi) => void;
  onRecallBrushSlot?: (index: number) => void;
  onAssignBrushSlot?: (index: number) => void;
  onSymmetryTypeChange?: (type: StudioSymmetryUi) => void;
  shapeSlot?: ReactNode;
  className?: string;
}

function SizePreview({ size, color }: { size: number; color: string }): ReactElement {
  const d = Math.min(22, Math.max(4, size * 0.55));
  return (
    <span
      aria-hidden
      className="grid size-7 place-items-center rounded-md border border-line bg-canvas"
      title={`크기 ${size}px`}
    >
      <span
        className="rounded-full"
        style={{
          width: d,
          height: d,
          backgroundColor: color,
          opacity: 0.92,
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
  stabilizerModeLabel,
  color,
  recentSwatches = [],
  brushSlots = [],
  symmetryType = "none",
  quickShapeActive,
  compactBrushes = true,
  onSelectBrush,
  onStrokeWidthChange,
  onOpacityChange,
  onStabilizerChange,
  onColorChange,
  onToggleQuickShape,
  onSetDrawMode,
  onRecallBrushSlot,
  onAssignBrushSlot,
  onSymmetryTypeChange,
  shapeSlot,
  className,
}: StudioDrawOptionsBarProps): ReactElement {
  return (
    <div
      role="toolbar"
      aria-label="그리기 옵션"
      data-studio-draw-options="true"
      className={cn(
        "flex min-h-10 shrink-0 flex-nowrap items-center gap-2 overflow-x-auto border-b border-line bg-panel/95 px-2 py-1",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {onSetDrawMode ? (
        <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-line/70 bg-card/50 p-0.5" role="group" aria-label="그리기 모드">
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
                "inline-flex h-7 items-center gap-1 rounded px-2 text-[0.65rem] font-semibold",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
                drawMode === id
                  ? "bg-accent text-on-accent"
                  : "text-fg-2 hover:bg-raised"
              )}
            >
              <Icon size={13} aria-hidden />
              <span className="hidden sm:inline">{label}</span>
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
                  "grid size-7 place-items-center rounded border text-[0.6rem] font-bold tabular-nums",
                  STUDIO_EASE,
                  STUDIO_FOCUS_RING,
                  slot
                    ? "border-line bg-card text-fg-2 hover:border-accent/50 hover:bg-raised"
                    : "border-dashed border-line/70 text-fg-3 hover:bg-raised/60",
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
          className="min-w-0 max-w-[min(28rem,42vw)]"
        />
      ) : null}

      <span aria-hidden className="hidden h-5 w-px shrink-0 bg-line sm:block" />

      <SizePreview size={strokeWidth} color={drawMode === "eraser" ? "oklch(0.55 0.02 70)" : color} />

      <label className="flex shrink-0 items-center gap-1.5 text-[0.65rem] font-semibold text-fg-3">
        <span className="select-none">크기</span>
        <input
          type="range"
          min={1}
          max={48}
          value={strokeWidth}
          onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
          className="w-20 accent-accent sm:w-28"
          aria-valuetext={`${strokeWidth}픽셀`}
        />
        <span className="w-7 tabular-nums text-fg-2">{strokeWidth}</span>
      </label>

      <label className="flex shrink-0 items-center gap-1.5 text-[0.65rem] font-semibold text-fg-3">
        <span className="select-none">불투명</span>
        <input
          type="range"
          min={5}
          max={100}
          step={1}
          value={Math.round(brushOpacity * 100)}
          onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
          className="w-16 accent-accent sm:w-24"
        />
        <span className="w-8 tabular-nums text-fg-2">{Math.round(brushOpacity * 100)}%</span>
      </label>

      <label className="flex shrink-0 items-center gap-1.5 text-[0.65rem] font-semibold text-fg-3" title={stabilizerModeLabel}>
        <span className="select-none">보정</span>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={stabilizer}
          onChange={(e) => onStabilizerChange(Number(e.target.value))}
          className="w-14 accent-accent sm:w-20"
        />
        <span className="w-4 tabular-nums text-fg-2">{stabilizer}</span>
      </label>

      {drawMode !== "eraser" ? (
        <>
          <span aria-hidden className="h-5 w-px shrink-0 bg-line" />
          <div className="flex shrink-0 items-center gap-1" aria-label="색상">
            {recentSwatches.slice(0, 6).map((swatch) => (
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
            <label
              className="relative size-6 cursor-pointer overflow-hidden rounded-md border border-line shadow-sm"
              title="색 선택"
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
        </>
      ) : null}

      {onSymmetryTypeChange ? (
        <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="대칭 그리기">
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
          className={cn(
            "ml-auto inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[0.65rem] font-bold",
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
            quickShapeActive
              ? "border-accent bg-accent-soft text-accent"
              : "border-line bg-card text-fg-2 hover:bg-raised"
          )}
        >
          {quickShapeActive ? <Sparkles size={13} aria-hidden /> : <Shapes size={13} aria-hidden />}
          스마트 도형
        </button>
      ) : (
        <span className="ml-auto" />
      )}

      {shapeSlot}
    </div>
  );
}
