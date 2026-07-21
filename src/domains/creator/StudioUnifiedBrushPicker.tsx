/**
 * Mobile built-in preset shelf.
 *
 * The searchable catalog itself is owned once by StudioPage. Keeping this
 * component presentational prevents a hidden desktop inspector and the mobile
 * sheet from opening competing dialogs or maintaining divergent favorites.
 */
import { Bookmark, Paintbrush } from "lucide-react";
import { type ReactElement } from "react";

import { BRUSH_PRESETS, type BrushPreset } from "./studio-brush";
import { StudioBrushTray } from "./StudioBrushTray";

import type { StudioBrushStampTuning } from "./studio-brush-library";
import type { StudioBrushTrayItem } from "./studio-creative-ux";
import type { StudioProDrawPrefs } from "./studio-pro-draw-prefs";

import { cn } from "@/lib/utils";

export interface StudioUnifiedBrushPickerProps {
  activeBrushId: string;
  activeCatalogBrushId?: string;
  activeCatalogBrushName?: string;
  brushOpacity: number;
  brushCatalogItems?: readonly StudioBrushTrayItem[];
  catalogOpen?: boolean;
  color: string;
  proDrawPrefs: StudioProDrawPrefs;
  stampTuning?: StudioBrushStampTuning | null;
  strokeWidth: number;
  onStampTuningChange?: (tuning: StudioBrushStampTuning) => void;
  onSelectBrush: (preset: BrushPreset) => void;
  onSelectBrushId?: (brushId: string) => void;
  onToggleCatalog: (trigger: HTMLButtonElement) => void;
  onToggleFavoriteBrush: (brushId: string) => void;
}

const STAMP_TUNING_CONTROLS = [
  { key: "flow", label: "흐름" },
  { key: "hardness", label: "경도" },
  { key: "minSize", label: "최소 굵기" },
] as const;

/**
 * A short, thumb-reachable mobile projection of StudioPage's single built-in
 * catalog session. User-authored brushes remain in the separate My Brushes UI.
 */
export function StudioUnifiedBrushPicker({
  activeBrushId,
  activeCatalogBrushId,
  activeCatalogBrushName,
  brushOpacity,
  brushCatalogItems,
  catalogOpen = false,
  color,
  proDrawPrefs,
  stampTuning,
  strokeWidth,
  onStampTuningChange,
  onSelectBrush,
  onSelectBrushId,
  onToggleCatalog,
  onToggleFavoriteBrush,
}: StudioUnifiedBrushPickerProps): ReactElement {
  const catalogBrushId = activeCatalogBrushId ?? activeBrushId;
  const activePreset = BRUSH_PRESETS.find((preset) => preset.id === catalogBrushId);
  const catalogItem = brushCatalogItems?.find((item) => item.id === catalogBrushId);
  const activeName = activeCatalogBrushName
    ?? catalogItem?.name
    ?? activePreset?.name
    ?? catalogBrushId;
  const activeFavorite = proDrawPrefs.favoriteBrushIds.includes(catalogBrushId);
  const selectBrushId = (brushId: string) => {
    if (onSelectBrushId) {
      onSelectBrushId(brushId);
      return;
    }
    const preset = BRUSH_PRESETS.find((candidate) => candidate.id === brushId);
    if (preset) onSelectBrush(preset);
  };
  return (
    <section
      aria-label="기본 프리셋"
      data-studio-unified-brush-picker="mobile"
      className="relative space-y-1.5"
    >
      <div className="flex items-center justify-between gap-2 px-0.5">
        <p className="text-[0.68rem] font-bold text-fg-2">기본 프리셋</p>
        <p className="text-[0.6rem] text-fg-3">앱 제공 · 내 브러시와 별도</p>
      </div>
      <div
        className="flex min-h-12 items-center gap-2 rounded-xl border border-line/70 bg-card/75 px-2.5"
      >
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-lg border border-line/70 shadow-inner"
          style={{ backgroundColor: color }}
        >
          <Paintbrush className="size-4 text-white mix-blend-difference" strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.58rem] font-semibold uppercase text-fg-3">현재 브러시</span>
          <span aria-live="polite" className="block truncate text-xs font-bold text-fg">
            {activeName}
          </span>
        </span>
        <span className="shrink-0 text-right text-[0.62rem] tabular-nums text-fg-3">
          <span className="block">{strokeWidth}px</span>
          <span className="block">{Math.round(brushOpacity * 100)}%</span>
        </span>
        <button
          type="button"
          onClick={() => onToggleFavoriteBrush(catalogBrushId)}
          aria-label={activeFavorite ? `${activeName} 즐겨찾기 해제` : `${activeName} 즐겨찾기`}
          aria-pressed={activeFavorite}
          title={activeFavorite ? "현재 브러시 즐겨찾기 해제" : "현재 브러시 즐겨찾기"}
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-xl border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            activeFavorite
              ? "border-accent/50 bg-accent-soft text-accent"
              : "border-line/70 text-fg-3 hover:bg-raised hover:text-fg"
          )}
        >
          <Bookmark size={14} fill={activeFavorite ? "currentColor" : "none"} aria-hidden />
        </button>
      </div>

      <StudioBrushTray
        activeBrushId={catalogBrushId}
        brushCatalogItems={brushCatalogItems}
        favoriteBrushIds={proDrawPrefs.favoriteBrushIds}
        recentBrushIds={proDrawPrefs.recentBrushIds}
        libraryOpen={catalogOpen}
        onOpenLibrary={onToggleCatalog}
        onSelect={(item) => selectBrushId(item.id)}
        aria-label="기본 프리셋 빠른 선택 — 즐겨찾기, 최근 사용, 추천"
        className="w-full"
      />

      {stampTuning && onStampTuningChange ? (
        <div
          role="group"
          aria-label="스탬프 브러시 세부 조절"
          className="grid grid-cols-3 gap-1.5 rounded-xl border border-line/70 bg-card/55 p-2"
        >
          {STAMP_TUNING_CONTROLS.map((control) => (
            <label key={control.key} className="min-w-0 text-[0.62rem] font-semibold text-fg-3">
              <span className="mb-1 flex items-center justify-between gap-1">
                <span>{control.label}</span>
                <span className="tabular-nums text-fg-2">
                  {Math.round(stampTuning[control.key] * 100)}%
                </span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(stampTuning[control.key] * 100)}
                onChange={(event) => onStampTuningChange({
                  ...stampTuning,
                  [control.key]: Number(event.target.value) / 100,
                })}
                aria-label={`스탬프 ${control.label}`}
                className="h-11 w-full cursor-pointer accent-accent"
              />
            </label>
          ))}
        </div>
      ) : null}
    </section>
  );
}
