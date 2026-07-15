/**
 * Commercial pressure response graph — CSP/Procreate-class transfer curve.
 * Icon-first presets + continuous exponent + live SVG graph. Pure presentation.
 */
import {
  BRUSH_PRESSURE_CURVE_PRESETS,
  pressureCurvePresetId,
  pressureCurveValueForPreset,
  type BrushPressureCurvePresetId,
} from "./studio-brush";
import { StudioPressureCurveGlyph } from "./studio-creative-visuals";
import {
  studioPressureCurvePathD,
  studioPressureCurveSliderMeta,
} from "./studio-pressure-curve-graph";

import type { ReactElement } from "react";

import { cn } from "@/lib/utils";

const CHART_W = 160;
const CHART_H = 88;

export interface StudioPressureCurveGraphProps {
  pressureCurve: number;
  onPressureCurveChange: (value: number) => void;
  className?: string;
  density?: "compact" | "touch";
}

export function StudioPressureCurveGraph({
  pressureCurve,
  onPressureCurveChange,
  className,
  density = "compact",
}: StudioPressureCurveGraphProps): ReactElement {
  const curveId = pressureCurvePresetId(pressureCurve);
  const pathD = studioPressureCurvePathD(pressureCurve, CHART_W, CHART_H, 28);
  const slider = studioPressureCurveSliderMeta(pressureCurve);
  const touch = density === "touch";

  return (
    <div
      data-studio-pressure-curve-graph="true"
      className={cn(
        "rounded-xl border border-line/70 bg-card/50 p-2.5",
        className
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[0.68rem] font-bold text-fg-2">필압 반응 곡선</p>
        <span className="tabular-nums text-[0.6rem] font-semibold text-fg-3">
          γ {slider.value.toFixed(2)}
        </span>
      </div>

      <svg
        aria-hidden
        width="100%"
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="mb-2 block h-auto max-h-28 w-full rounded-lg border border-line/50 bg-canvas/50"
        data-studio-pressure-curve-chart="true"
      >
        {/* Grid */}
        <path
          d={`M0 ${CHART_H} H${CHART_W} M0 0 V${CHART_H}`}
          fill="none"
          stroke="oklch(0.42 0.012 64 / 0.45)"
          strokeWidth={1}
        />
        <path
          d={`M0 ${CHART_H / 2} H${CHART_W} M${CHART_W / 2} 0 V${CHART_H}`}
          fill="none"
          stroke="oklch(0.42 0.012 64 / 0.25)"
          strokeWidth={0.75}
          strokeDasharray="3 3"
        />
        {/* Linear reference */}
        <path
          d={`M0 ${CHART_H} L${CHART_W} 0`}
          fill="none"
          stroke="oklch(0.57 0.012 76 / 0.35)"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
        {/* Active curve */}
        <path
          d={pathD}
          fill="none"
          stroke="oklch(0.72 0.185 42)"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <div
        className="mb-2 flex items-center gap-1"
        role="group"
        aria-label="필압 프리셋"
      >
        {BRUSH_PRESSURE_CURVE_PRESETS.map((preset) => {
          const active = curveId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              title={preset.label}
              aria-label={preset.label}
              aria-pressed={active}
              onClick={() =>
                onPressureCurveChange(
                  pressureCurveValueForPreset(preset.id as BrushPressureCurvePresetId)
                )
              }
              className={cn(
                "inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border text-[0.6rem] font-bold transition-colors",
                active
                  ? "border-accent/55 bg-accent-soft text-accent"
                  : "border-line/70 bg-canvas/40 text-fg-3 hover:bg-raised hover:text-fg"
              )}
            >
              <StudioPressureCurveGlyph curve={preset.id} />
              <span className="hidden sm:inline">{preset.label}</span>
            </button>
          );
        })}
      </div>

      <label className={cn("flex items-center gap-2 text-fg-3", touch ? "min-h-11" : "")}>
        <span className="sr-only">필압 지수 연속 조절</span>
        <input
          type="range"
          min={slider.min}
          max={slider.max}
          step={slider.step}
          value={slider.value}
          onChange={(e) => onPressureCurveChange(Number(e.target.value))}
          aria-valuetext={`감마 ${slider.value.toFixed(2)}`}
          aria-label="필압 반응 강도"
          className={cn("w-full accent-accent", touch ? "h-10" : "h-8")}
        />
      </label>
      <p className="mt-1 text-[0.58rem] leading-relaxed text-fg-3">
        가로=입력 필압 · 세로=획 굵기/농도. 민감할수록 약한 압력에도 굵어집니다.
      </p>
    </div>
  );
}
