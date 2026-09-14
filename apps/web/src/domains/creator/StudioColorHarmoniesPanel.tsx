/**
 * StudioColorHarmoniesPanel.tsx
 *
 * Interactive Color Harmonies Panel benchmarking Adobe Color & Procreate.
 * Provides 6 harmony rules (Complementary, Analogous, Triadic, Split-Complementary, Tetradic, Monochromatic)
 * with real-time recalculation, continuous gradient preview ribbons, and one-click color selection.
 */

import { Check, LockKeyhole, Sparkles, UnlockKeyhole } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import {
  getAllHarmonies,
  type HarmonyMode,
} from "./studio-color-harmony-engine";
import { normalizeHexColor } from "./studio-color-utils";

export interface StudioColorHarmoniesPanelProps {
  readonly value: string;
  readonly onSelectColor: (hex: string) => void;
  readonly onSaveAsPalette?: (name: string, colors: string[]) => void;
  /** An asynchronous persistence host owns its success/failure feedback. */
  readonly saveFeedbackExternally?: boolean;
}

function navigationIndex(event: KeyboardEvent<HTMLButtonElement>, index: number, count: number): number | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  if (event.key === "Home") return 0;
  if (event.key === "End") return count - 1;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") return (index + 1) % count;
  if (event.key === "ArrowLeft" || event.key === "ArrowUp") return (index - 1 + count) % count;
  return null;
}

export function StudioColorHarmoniesPanel({
  value,
  onSelectColor,
  onSaveAsPalette,
  saveFeedbackExternally = false,
}: StudioColorHarmoniesPanelProps) {
  const [activeMode, setActiveMode] = useState<HarmonyMode>("complementary");
  const [lockedBase, setLockedBase] = useState<string | null>(null);
  const [swatchIndex, setSwatchIndex] = useState<number | null>(null);
  const [savedBadge, setSavedBadge] = useState(false);
  const panelId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const swatchRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentColor = normalizeHexColor(value) ?? "#000000";
  const baseColor = lockedBase ?? currentColor;

  const harmonies = getAllHarmonies(baseColor);
  const selectedHarmony = harmonies.find((h) => h.mode === activeMode) ?? harmonies[0];
  const selectedIndex = selectedHarmony.colors.findIndex((hex) => hex.toLowerCase() === currentColor);
  const baseIndex = selectedHarmony.colors.findIndex((hex) => hex.toLowerCase() === baseColor);
  const focusIndex = Math.min(swatchIndex ?? Math.max(0, selectedIndex), selectedHarmony.colors.length - 1);

  useEffect(() => {
    setSavedBadge(false);
    if (savedTimeout.current !== null) clearTimeout(savedTimeout.current);
    savedTimeout.current = null;
    return () => {
      if (savedTimeout.current !== null) clearTimeout(savedTimeout.current);
    };
  }, [baseColor, activeMode]);

  const selectMode = (mode: HarmonyMode) => {
    setActiveMode(mode);
    setSwatchIndex(null);
  };

  const selectSwatch = (index: number) => {
    setSwatchIndex(index);
    onSelectColor(selectedHarmony.colors[index]!);
  };

  const handleSavePalette = () => {
    if (!selectedHarmony || !onSaveAsPalette) return;
    const name = `배색: ${selectedHarmony.label.split(" (")[0]} (${baseColor})`;
    onSaveAsPalette?.(name, [...selectedHarmony.colors]);
    if (saveFeedbackExternally) return;
    setSavedBadge(true);
    if (savedTimeout.current !== null) clearTimeout(savedTimeout.current);
    savedTimeout.current = setTimeout(() => {
      savedTimeout.current = null;
      setSavedBadge(false);
    }, 1800);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-card/40 p-1.5">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[0.65rem] text-fg-2">
          <span aria-hidden className="size-4 shrink-0 rounded border border-line-strong" style={{ backgroundColor: baseColor }} />
          기준 <span className="font-mono" data-studio-harmony-base>{baseColor}</span>
        </span>
        <button
          type="button"
          aria-label="배색 기준색 고정"
          aria-pressed={lockedBase !== null}
          onClick={() => setLockedBase(lockedBase === null ? currentColor : null)}
          className="flex min-h-11 items-center gap-1 rounded-lg border border-line px-2 text-[0.65rem] text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {lockedBase === null ? <UnlockKeyhole className="size-3.5" aria-hidden /> : <LockKeyhole className="size-3.5" aria-hidden />}
          {lockedBase === null ? "기준 고정" : "고정됨"}
        </button>
        {lockedBase !== null && (
          <button
            type="button"
            disabled={baseColor === currentColor}
            onClick={() => setLockedBase(currentColor)}
            className="min-h-11 rounded-lg border border-line px-2 text-[0.65rem] text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            현재 색을 기준으로
          </button>
        )}
      </div>
      <p className="text-[0.62rem] leading-relaxed text-fg-3">
        {lockedBase === null ? "현재 색에 맞춰 배색합니다. 기준을 고정하면 같은 배색의 색들을 이어서 고를 수 있어요." : "색을 골라도 기준색과 배색을 유지합니다."}
      </p>
      {/* Visual Harmony Ribbon Preview */}
      <div className="relative overflow-hidden rounded-lg border border-line/60 p-1 bg-raised/40 shadow-inner">
        <div
          className="h-2.5 w-full rounded-md shadow-inner transition-all duration-300"
          style={{
            background:
              selectedHarmony.colors.length > 1
                ? `linear-gradient(to right, ${selectedHarmony.colors.join(", ")})`
                : selectedHarmony.colors[0] ?? baseColor,
          }}
        />
      </div>

      {/* Harmony Mode Pills (6 Rules) */}
      <div
        role="tablist"
        aria-label="색상 조화 규칙"
        className="grid grid-cols-3 gap-1 rounded-xl border border-line/70 bg-raised/50 p-1 backdrop-blur-sm"
      >
        {harmonies.map((h, index) => {
          const isActive = h.mode === activeMode;
          return (
            <button
              key={h.mode}
              type="button"
              role="tab"
              id={`${panelId}-${h.mode}`}
              aria-controls={panelId}
              aria-selected={isActive}
              aria-label={h.label}
              tabIndex={isActive ? 0 : -1}
              ref={(node) => { tabRefs.current[index] = node; }}
              onClick={() => selectMode(h.mode)}
              onKeyDown={(event) => {
                const next = navigationIndex(event, index, harmonies.length);
                if (next === null) return;
                event.preventDefault();
                event.stopPropagation();
                selectMode(harmonies[next]!.mode);
                tabRefs.current[next]?.focus();
              }}
              className={`min-h-11 rounded-lg px-1.5 py-1 text-[0.62rem] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                isActive
                  ? "bg-card text-accent font-semibold shadow-sm border border-accent/40 scale-[1.02]"
                  : "text-fg-3 hover:bg-card/60 hover:text-fg"
              }`}
            >
              {h.label.split(" (")[0]}
            </button>
          );
        })}
      </div>

      <div id={panelId} role="tabpanel" aria-labelledby={`${panelId}-${activeMode}`} className="flex flex-col gap-2.5">
      {/* Description & Angle guide */}
      <div className="flex items-center justify-between px-0.5">
        <p className="text-[0.65rem] leading-relaxed text-fg-3">
          {selectedHarmony.description}
        </p>
        <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[0.56rem] font-mono font-semibold text-accent">
          {selectedHarmony.colors.length}색 조화
        </span>
      </div>

      {/* Swatches Grid with Painter Chips */}
      <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5" role="radiogroup" aria-label="조화 배색 목록">
        {selectedHarmony.colors.map((hex, idx) => {
          const isSelected = idx === selectedIndex;
          const isBase = idx === baseIndex;
          return (
            <div key={`${activeMode}-slot-${idx}`} className="flex flex-col items-center gap-1">
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={`조화 색상 ${hex} 선택`}
                tabIndex={idx === focusIndex ? 0 : -1}
                ref={(node) => { swatchRefs.current[idx] = node; }}
                onFocus={() => setSwatchIndex(idx)}
                onClick={() => selectSwatch(idx)}
                onKeyDown={(event) => {
                  const next = navigationIndex(event, idx, selectedHarmony.colors.length);
                  if (next === null) return;
                  event.preventDefault();
                  event.stopPropagation();
                  selectSwatch(next);
                  swatchRefs.current[next]?.focus();
                }}
                className={`group relative size-11 cursor-pointer rounded-xl border border-line-strong shadow-md transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transform-none motion-reduce:transition-none ${
                  isSelected ? "ring-2 ring-accent ring-offset-2 ring-offset-panel" : ""
                }`}
                style={{ backgroundColor: hex }}
              >
                {/* Glossy top reflection */}
                <span
                  className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-xl opacity-30"
                  style={{
                    background: "linear-gradient(180deg, rgba(255,255,255,0.8) 0%, transparent 100%)",
                  }}
                />
                {isSelected && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Check className="size-4 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]" aria-hidden />
                  </span>
                )}
                {isBase && !isSelected && (
                  <span className="absolute bottom-1 right-1 size-1.5 rounded-full bg-white shadow-[0_0_2px_rgba(0,0,0,0.8)]" />
                )}
              </button>
              <div className="flex flex-col items-center">
                <span className="font-mono text-[0.58rem] font-medium text-fg-2 tracking-tight">{hex}</span>
                <span className="text-[0.52rem] text-fg-3">{isBase ? "기준색" : `조화 ${idx + 1}`}</span>
              </div>
            </div>
          );
        })}
      </div>
      </div>

      {/* Save as Palette action */}
      {onSaveAsPalette && (
        <button
          type="button"
          aria-label="이 조화 배색을 내 팔레트로 저장"
          onClick={handleSavePalette}
          className="mt-1 flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-3 py-1.5 text-[0.66rem] font-semibold text-accent transition-colors hover:bg-accent/20 hover:border-accent/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Sparkles className="size-3" aria-hidden />
          {savedBadge ? "내 팔레트에 저장했어요!" : "이 조화 배색을 내 팔레트로 저장"}
        </button>
      )}
      <span role="status" aria-label="팔레트 저장 상태" aria-live="polite" className="sr-only">{savedBadge ? "내 팔레트에 저장했습니다." : ""}</span>
    </div>
  );
}
