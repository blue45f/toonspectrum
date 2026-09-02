/**
 * StudioColorHarmoniesPanel.tsx
 *
 * Interactive Color Harmonies Panel benchmarking Adobe Color & Procreate.
 * Provides 6 harmony rules (Complementary, Analogous, Triadic, Split-Complementary, Tetradic, Monochromatic)
 * with real-time recalculation and one-click color selection.
 */

import { Check, Sparkles } from "lucide-react";
import { useState } from "react";

import {
  getAllHarmonies,
  type HarmonyMode,
} from "./studio-color-harmony-engine";

export interface StudioColorHarmoniesPanelProps {
  readonly value: string;
  readonly onSelectColor: (hex: string) => void;
  readonly onSaveAsPalette?: (name: string, colors: string[]) => void;
}

export function StudioColorHarmoniesPanel({
  value,
  onSelectColor,
  onSaveAsPalette,
}: StudioColorHarmoniesPanelProps) {
  const [activeMode, setActiveMode] = useState<HarmonyMode>("complementary");
  const [savedBadge, setSavedBadge] = useState<string | null>(null);

  const harmonies = getAllHarmonies(value);
  const selectedHarmony = harmonies.find((h) => h.mode === activeMode) ?? harmonies[0];

  const handleSavePalette = () => {
    if (!selectedHarmony) return;
    const name = `배색: ${selectedHarmony.label.split(" ")[0]} (${value})`;
    onSaveAsPalette?.(name, [...selectedHarmony.colors]);
    setSavedBadge("저장됨!");
    setTimeout(() => setSavedBadge(null), 1800);
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* Harmony Mode Pills */}
      <div
        role="tablist"
        aria-label="색상 조화 규칙"
        className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-raised/40 p-1"
      >
        {harmonies.map((h) => {
          const isActive = h.mode === activeMode;
          return (
            <button
              key={h.mode}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={h.label}
              onClick={() => setActiveMode(h.mode)}
              className={`rounded px-1.5 py-1 text-[0.62rem] font-medium transition-all ${
                isActive
                  ? "bg-card text-accent shadow-sm border border-accent/40"
                  : "text-fg-3 hover:bg-card/50 hover:text-fg-2"
              }`}
            >
              {h.label.split(" ")[0]}
            </button>
          );
        })}
      </div>

      {/* Description */}
      <p className="text-[0.65rem] leading-relaxed text-fg-3">
        {selectedHarmony.description}
      </p>

      {/* Swatches Grid */}
      <div className="flex flex-wrap items-center gap-2 pt-1" role="radiogroup" aria-label="조화 배색 목록">
        {selectedHarmony.colors.map((hex, idx) => {
          const isSelected = hex.toLowerCase() === value.toLowerCase();
          return (
            <div key={`${hex}-${idx}`} className="flex flex-col items-center gap-1">
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={`조화 색상 ${hex} 선택`}
                onClick={() => onSelectColor(hex)}
                className={`group relative size-10 cursor-pointer rounded-lg border border-line/70 shadow-sm transition-all hover:scale-105 active:scale-95 ${
                  isSelected ? "ring-2 ring-accent ring-offset-2 ring-offset-card" : ""
                }`}
                style={{ backgroundColor: hex }}
              >
                {isSelected && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Check className="size-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
                  </span>
                )}
              </button>
              <span className="font-mono text-[0.62rem] text-fg-3">{hex}</span>
            </div>
          );
        })}
      </div>

      {/* Save as Palette action */}
      {onSaveAsPalette && (
        <button
          type="button"
          aria-label="이 조화 배색을 내 팔레트로 저장"
          onClick={handleSavePalette}
          className="mt-1 flex items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[0.66rem] font-semibold text-accent transition-colors hover:bg-accent/20 active:scale-[0.98]"
        >
          <Sparkles className="size-3" aria-hidden />
          {savedBadge ? "내 팔레트에 저장했어요!" : "이 조화 배색을 내 팔레트로 저장"}
        </button>
      )}
    </div>
  );
}
