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
  variant: BubbleVariant;
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

/** Mini bubble glyph — Canva/Clip Studio style swatch instead of text-only chips. */
function BubbleStyleSwatch({ preset }: { preset: BubbleStylePreset }) {
  const fill = preset.fill === "transparent" ? "oklch(0.95 0.01 85 / 0.15)" : preset.fill;
  const stroke = preset.stroke || "oklch(0.3 0.01 70 / 0.35)";
  const sw = Math.max(1.2, Math.min(2.8, preset.strokeWidth ?? 1.75));
  return (
    <svg
      aria-hidden
      width={44}
      height={28}
      viewBox="0 0 44 28"
      className="block drop-shadow-sm"
      data-studio-bubble-swatch={preset.id}
    >
      {/* Soft drop shadow */}
      <ellipse cx={22} cy={24} rx={14} ry={2.2} fill="oklch(0.1 0.01 70 / 0.22)" />
      {/* Speech body */}
      <path
        d="M8 5.5 C8 3.5, 10 2, 14 2 H30 C34 2, 36 3.5, 36 5.5 V15 C36 17, 34 18.5, 30 18.5 H20 L14 24.5 V18.5 H14 C10 18.5, 8 17, 8 15 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      {/* Sample glyph */}
      <text
        x={22}
        y={13.5}
        textAnchor="middle"
        fontSize={8}
        fontWeight={700}
        fill={preset.textFill}
        fontFamily="system-ui, sans-serif"
      >
        가
      </text>
    </svg>
  );
}

export function StudioBubbleStylePresetPanel({
  selected,
  onApplyPreset,
}: {
  selected: BubbleStylePresetTarget;
  onApplyPreset: (patch: BubbleStylePresetPatch) => void;
}) {
  return (
    <div className="mt-2.5 border-b border-line/40 pb-2.5" data-studio-bubble-style-presets="true">
      <p className="mb-2 text-[0.66rem] font-semibold uppercase tracking-wider text-fg-3">
        스타일 프리셋
      </p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
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
                "flex cursor-pointer flex-col items-stretch gap-1 rounded-xl border p-1.5 text-left transition-all",
                "hover:bg-raised/70 hover:shadow-sm",
                isMatch
                  ? "border-accent bg-accent-soft/40 shadow-sm ring-1 ring-accent/25"
                  : "border-line bg-card"
              )}
              title={preset.description}
            >
              <div className="flex items-center justify-center rounded-lg bg-canvas/50 py-1 ring-1 ring-line/40">
                <BubbleStyleSwatch preset={preset} />
              </div>
              <span className="truncate text-[0.65rem] font-semibold text-fg">{preset.label}</span>
              <span className="line-clamp-2 text-[0.55rem] leading-snug text-fg-3">
                {preset.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
