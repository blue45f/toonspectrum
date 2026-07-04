import { BUBBLE_STYLE_PRESETS, type BubbleStylePreset } from "./studio-bubble-style-presets";
import { normalizeStrokeStyle, type StrokeStyle } from "./studio-stroke-shapes";

import type { BubbleVariant } from "./studio-assets";

import { cx } from "@/lib/cx";

export type BubbleStylePresetTarget = {
  fill: string;
  textFill: string;
  stroke?: string;
  strokeWidth?: number;
  font?: string;
  strokeStyle?: StrokeStyle;
  variant: BubbleVariant; // 항상 존재(BubbleEl.variant는 필수 필드) — 프리셋이 모양을 안 바꿀 때 되돌릴 기본값으로 쓴다.
};

export type BubbleStylePresetPatch = Pick<
  BubbleStylePreset,
  | "fill"
  | "textFill"
  | "stroke"
  | "strokeWidth"
  | "strokeStyle"
  | "variant"
  | "starAmplitude"
  | "shadowColor"
  | "shadowBlur"
  | "shadowOffsetX"
  | "shadowOffsetY"
  | "shadowOpacity"
  | "font"
>;

export function StudioBubbleStylePresetPanel({
  selected,
  onApplyPreset,
}: {
  selected: BubbleStylePresetTarget;
  onApplyPreset: (patch: BubbleStylePresetPatch) => void;
}) {
  return (
    <div className="mt-2.5 border-b border-line/40 pb-2.5">
      <p className="mb-2 text-[0.66rem] font-semibold uppercase tracking-wider text-fg-3">스타일 프리셋</p>
      <div className="grid grid-cols-2 gap-1.5">
        {BUBBLE_STYLE_PRESETS.map((preset) => {
          const isMatch =
            selected.fill === preset.fill &&
            selected.textFill === preset.textFill &&
            (preset.stroke ? selected.stroke === preset.stroke : !selected.stroke) &&
            (preset.strokeWidth ? selected.strokeWidth === preset.strokeWidth : true) &&
            (preset.variant ? selected.variant === preset.variant : true) &&
            (preset.strokeStyle
              ? normalizeStrokeStyle(selected.strokeStyle).dash === preset.strokeStyle.dash
              : true);

          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                onApplyPreset({
                  fill: preset.fill,
                  textFill: preset.textFill,
                  stroke: preset.stroke,
                  strokeWidth: preset.strokeWidth,
                  strokeStyle: preset.strokeStyle,
                  variant: preset.variant ?? selected.variant,
                  starAmplitude: preset.starAmplitude,
                  shadowColor: preset.shadowColor,
                  shadowBlur: preset.shadowBlur,
                  shadowOffsetX: preset.shadowOffsetX,
                  shadowOffsetY: preset.shadowOffsetY,
                  shadowOpacity: preset.shadowOpacity,
                  font: preset.font ?? selected.font,
                });
              }}
              className={cx(
                "flex cursor-pointer flex-col items-start rounded-lg border p-1.5 text-left transition-all hover:bg-raised/70",
                isMatch ? "border-accent bg-accent-soft/40 shadow-sm" : "border-line bg-card"
              )}
              title={preset.description}
            >
              <span className="mb-1 text-[0.65rem] font-semibold text-fg">{preset.label}</span>
              <div className="mt-auto flex w-full items-center gap-1">
                <span
                  className="flex size-3.5 items-center justify-center rounded-full border border-line text-[8px] font-bold shadow-sm"
                  style={{
                    backgroundColor: preset.fill === "transparent" ? "transparent" : preset.fill,
                    color: preset.textFill,
                    borderColor: preset.stroke || "rgba(0,0,0,0.15)",
                    borderWidth: preset.stroke ? "1.5px" : "1px",
                  }}
                >
                  가
                </span>
                <span className="truncate text-[0.55rem] text-fg-3">{preset.description}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
