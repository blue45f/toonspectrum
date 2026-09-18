/**
 * Stroke-width adjustment controls.
 * Uses ToonStudio task language and the shared Studio visual tokens.
 */

import { Check, Edit3, Sparkles } from "lucide-react";
import { useState } from "react";

import {
  calculateAdjustedStrokeWidth,
  LINE_WIDTH_PRESETS,
  type LineWidthAction,
  type LineWidthAdjustmentOptions,
} from "./studio-line-width-adjust";

import { cn } from "@/shared/lib/utils";

export interface StudioLineWidthAdjustmentPanelProps {
  readonly currentWidth?: number;
  readonly onApply: (options: LineWidthAdjustmentOptions) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

const ACTION_TABS: readonly { id: LineWidthAction; label: string }[] = [
  { id: "thicken", label: "굵게" },
  { id: "narrow", label: "가늘게" },
  { id: "scale", label: "배율" },
  { id: "fix", label: "고정" },
];

export function StudioLineWidthAdjustmentPanel({
  currentWidth = 4,
  onApply,
  disabled = false,
  className,
}: StudioLineWidthAdjustmentPanelProps) {
  const [action, setAction] = useState<LineWidthAction>("thicken");
  const [value, setValue] = useState<number>(2);
  const [scalePressures, setScalePressures] = useState<boolean>(true);

  const previewWidth = calculateAdjustedStrokeWidth(currentWidth, {
    action,
    value,
    scalePressures,
  });

  const handleApplyPreset = (presetOptions: LineWidthAdjustmentOptions) => {
    setAction(presetOptions.action);
    setValue(presetOptions.value);
  };

  const handleExecute = () => {
    onApply({ action, value, scalePressures });
  };

  return (
    <div
      className={cn(
        "space-y-2 rounded-xl border border-line bg-card p-3 text-xs text-fg shadow-sm select-none",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-line/60">
        <div className="flex items-center gap-1.5 min-w-0">
          <Edit3 size={14} className="shrink-0 text-accent" aria-hidden />
          <span className="truncate font-semibold">선 굵기 조절</span>
        </div>
        <span className="font-mono text-[10px] text-fg-3">
          {currentWidth}px → {previewWidth}px
        </span>
      </div>

      {/* Preset Chips */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
        <Sparkles size={11} className="shrink-0 text-accent" aria-hidden />
        {LINE_WIDTH_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => handleApplyPreset(preset.options)}
            disabled={disabled}
            className="whitespace-nowrap rounded-full border border-line bg-raised px-2 py-0.5 text-[10px] text-fg-2 transition-colors hover:border-accent/35 hover:text-fg disabled:opacity-50"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Action Mode Tabs */}
      <div className="grid grid-cols-4 gap-1 rounded-lg border border-line/60 bg-panel p-0.5">
        {ACTION_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setAction(tab.id)}
            disabled={disabled}
            className={cn(
              "py-1 rounded text-[10px] text-center font-medium transition-colors",
              action === tab.id
                ? "bg-accent text-on-accent shadow-sm"
                : "text-fg-3 hover:bg-raised hover:text-fg",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Value Slider & Controls */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-fg-2">
          <span>{action === "scale" ? "배율" : "변화 폭"}</span>
          <span className="font-mono text-accent">
            {action === "scale" ? `${value}x` : `${value}px`}
          </span>
        </div>
        <input
          type="range"
          min={action === "scale" ? 0.2 : 0.5}
          max={action === "scale" ? 3.0 : 30}
          step={action === "scale" ? 0.1 : 0.5}
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(Number(e.target.value))}
          aria-label="선폭 조절 값"
          className="w-full cursor-pointer accent-accent"
        />
      </div>

      {/* Stylus Pressure Scaling Checkbox */}
      <label className="flex cursor-pointer items-center gap-1.5 pt-0.5 text-[11px] text-fg-2">
        <input
          type="checkbox"
          checked={scalePressures}
          disabled={disabled}
          onChange={(e) => setScalePressures(e.target.checked)}
          className="size-3.5 cursor-pointer rounded border-line bg-panel text-accent focus:ring-accent"
        />
        <span>필압 변화도 함께 조절</span>
      </label>

      {/* Apply Button */}
      <button
        type="button"
        onClick={handleExecute}
        disabled={disabled}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent py-1.5 text-xs font-medium text-on-accent shadow-sm transition-transform hover:bg-accent-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Check size={13} aria-hidden />
        <span>선택한 선에 적용</span>
      </button>
    </div>
  );
}
