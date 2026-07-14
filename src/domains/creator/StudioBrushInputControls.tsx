import {
  BRUSH_PRESSURE_CURVE_PRESETS,
  pressureCurvePresetId,
  pressureCurveValueForPreset,
  type BrushPressureCurvePresetId,
} from "./studio-brush";

import { cx } from "@/lib/cx";

export interface StudioBrushInputControlsProps {
  useVelocityPressure: boolean;
  onUseVelocityPressureChange: (value: boolean) => void;
  velocitySensitivity: number;
  onVelocitySensitivityChange: (value: number) => void;
  pressureCurve: number;
  onPressureCurveChange: (value: number) => void;
  density?: "compact" | "touch";
}
export function StudioBrushInputControls({
  useVelocityPressure,
  onUseVelocityPressureChange,
  velocitySensitivity,
  onVelocitySensitivityChange,
  pressureCurve,
  onPressureCurveChange,
  density = "compact",
}: StudioBrushInputControlsProps) {
  const touch = density === "touch";
  const curveId = pressureCurvePresetId(pressureCurve);
  const curve = BRUSH_PRESSURE_CURVE_PRESETS.find((preset) => preset.id === curveId)
    ?? BRUSH_PRESSURE_CURVE_PRESETS[1];

  return (
    <section
      aria-label="필압 입력"
      className={cx("border-t border-line/35", touch ? "mt-2.5 space-y-2.5 pt-2.5" : "space-y-2 pt-2")}
    >
      <label
        className={cx(
          "flex cursor-pointer items-center justify-between gap-3 text-fg-2",
          touch ? "min-h-11 rounded-lg bg-card/45 px-2.5 text-xs" : "text-sm"
        )}
      >
        <span>
          <span className="block font-medium">마우스·터치 속도 필압</span>
          {touch ? (
            <span className="block text-[0.62rem] leading-relaxed text-fg-3">
              스타일러스 필압이 없을 때 CSS 화면 속도로 굵기를 보완
            </span>
          ) : null}
        </span>
        <input
          type="checkbox"
          checked={useVelocityPressure}
          onChange={(event) => onUseVelocityPressureChange(event.target.checked)}
          className={cx("shrink-0 rounded accent-accent", touch ? "size-5" : "size-4")}
        />
      </label>

      {useVelocityPressure ? (
        <label className={cx("flex items-center justify-between gap-2 text-fg-3", touch ? "text-[0.7rem]" : "text-xs")}>
          <span>속도 감도</span>
          <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={velocitySensitivity}
              onChange={(event) => onVelocitySensitivityChange(Number(event.target.value))}
              aria-label="마우스와 터치 속도 필압 감도"
              className={cx("cursor-pointer accent-accent", touch ? "h-10 w-full max-w-52" : "w-20")}
            />
            <span className="w-9 text-right tabular-nums">{Math.round(velocitySensitivity * 100)}%</span>
          </span>
        </label>
      ) : null}

      <label className={cx("flex items-center justify-between gap-3 text-fg-3", touch ? "min-h-11 text-[0.7rem]" : "text-xs")}>
        <span className="shrink-0">필압 반응</span>
        <select
          value={curveId}
          onChange={(event) => onPressureCurveChange(
            pressureCurveValueForPreset(event.target.value as BrushPressureCurvePresetId)
          )}
          className={cx(
            "min-w-0 rounded-lg border border-line bg-card px-2 text-fg outline-none focus:border-accent",
            touch ? "min-h-11 flex-1 text-xs" : "h-7 w-32 text-xs"
          )}
        >
          {BRUSH_PRESSURE_CURVE_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>{preset.label}</option>
          ))}
        </select>
      </label>
      <p className="text-[0.62rem] leading-relaxed text-fg-3">{curve.description}</p>
    </section>
  );
}
