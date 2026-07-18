/**
 * Shared built-in brush discovery for desktop and mobile.
 *
 * This module is loaded only while the pen picker is visible. The complete
 * searchable catalog remains a second lazy boundary so the 35 preview tiles
 * do not join the Studio route or quick-shelf download.
 */
import { Bookmark, Paintbrush } from "lucide-react";
import {
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type ReactElement,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";

import { BRUSH_PRESETS, type BrushPreset } from "./studio-brush";
import {
  saveStudioProDrawPrefs,
  studioProDrawStorage,
  toggleFavoriteBrushId,
  type StudioProDrawPrefs,
} from "./studio-pro-draw-prefs";
import { StudioBrushTray } from "./StudioBrushTray";

import type { StudioBrushStampTuning } from "./studio-brush-library";

import { lazyRetry } from "@/lib/lazy-retry";
import { cn } from "@/lib/utils";

const StudioBrushLibrarySheet = lazyRetry(
  () => import("./StudioBrushLibrarySheet").then((mod) => ({ default: mod.StudioBrushLibrarySheet })),
  "StudioBrushLibrarySheet"
);

export interface StudioUnifiedBrushPickerProps {
  activeBrushId: string;
  brushOpacity: number;
  color: string;
  mobileKeyboardInset?: number;
  placement: "inspector" | "mobile";
  proDrawPrefs: StudioProDrawPrefs;
  stampTuning?: StudioBrushStampTuning | null;
  strokeWidth: number;
  setProDrawPrefs: Dispatch<SetStateAction<StudioProDrawPrefs>>;
  onStampTuningChange?: (tuning: StudioBrushStampTuning) => void;
  onSelectBrush: (preset: BrushPreset) => void;
}

const STAMP_TUNING_CONTROLS = [
  { key: "flow", label: "흐름" },
  { key: "hardness", label: "경도" },
  { key: "minSize", label: "최소 굵기" },
] as const;

/**
 * One brush discovery path shared by the inspector and mobile draw sheet.
 * The shelf stays intentionally short; search/category browsing belongs to the
 * full catalog and user-authored brushes remain in the separate My Brushes UI.
 */
export function StudioUnifiedBrushPicker({
  activeBrushId,
  brushOpacity,
  color,
  mobileKeyboardInset = 0,
  placement,
  proDrawPrefs,
  stampTuning,
  strokeWidth,
  setProDrawPrefs,
  onStampTuningChange,
  onSelectBrush,
}: StudioUnifiedBrushPickerProps): ReactElement {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const pickerRef = useRef<HTMLElement>(null);
  const activePreset = BRUSH_PRESETS.find((preset) => preset.id === activeBrushId);
  const activeName = activePreset?.name ?? activeBrushId;
  const activeFavorite = proDrawPrefs.favoriteBrushIds.includes(activeBrushId);
  const catalogStyle: CSSProperties = placement === "inspector"
    ? {
        right: "var(--studio-brush-catalog-right, 1.25rem)",
        top: "var(--studio-brush-catalog-top, 6rem)",
      }
    : {
        bottom: `calc(7.5rem + env(safe-area-inset-bottom) + ${Math.max(0, mobileKeyboardInset)}px)`,
      };

  useEffect(() => {
    if (!libraryOpen || placement !== "inspector") return;
    const root = globalThis.document?.documentElement;
    if (!root) return;
    const picker = pickerRef.current;
    if (!picker) return;
    const updateCatalogAnchor = () => {
      const bounds = picker.getBoundingClientRect();
      root.style.setProperty("--studio-brush-catalog-top", `${Math.max(8, bounds.bottom + 6)}px`);
      root.style.setProperty(
        "--studio-brush-catalog-right",
        `${Math.max(8, globalThis.innerWidth - bounds.right)}px`
      );
    };
    updateCatalogAnchor();
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateCatalogAnchor);
    resizeObserver?.observe(picker);
    globalThis.addEventListener("resize", updateCatalogAnchor);
    globalThis.addEventListener("scroll", updateCatalogAnchor, true);
    return () => {
      resizeObserver?.disconnect();
      globalThis.removeEventListener("resize", updateCatalogAnchor);
      globalThis.removeEventListener("scroll", updateCatalogAnchor, true);
      root.style.removeProperty("--studio-brush-catalog-top");
      root.style.removeProperty("--studio-brush-catalog-right");
    };
  }, [libraryOpen, placement]);

  const closeLibraryAndRestoreFocus = () => {
    setLibraryOpen(false);
    globalThis.requestAnimationFrame?.(() => {
      pickerRef.current
        ?.querySelector<HTMLButtonElement>("[data-studio-open-brush-library='true']")
        ?.focus();
    });
  };
  const selectBrushId = (brushId: string) => {
    const preset = BRUSH_PRESETS.find((candidate) => candidate.id === brushId);
    if (preset) onSelectBrush(preset);
  };
  const toggleFavorite = (brushId: string) => {
    setProDrawPrefs((previous) => {
      const next = toggleFavoriteBrushId(previous, brushId);
      saveStudioProDrawPrefs(studioProDrawStorage(), next);
      return next;
    });
  };

  return (
    <section
      ref={pickerRef}
      aria-label="브러시 선택"
      data-studio-unified-brush-picker={placement}
      className="relative space-y-1.5"
    >
      <div
        className={cn(
          "flex min-h-11 items-center gap-2 rounded-lg border border-line/70 bg-card/75 px-2",
          placement === "mobile" && "min-h-12 rounded-xl px-2.5"
        )}
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
          onClick={() => toggleFavorite(activeBrushId)}
          aria-label={activeFavorite ? `${activeName} 즐겨찾기 해제` : `${activeName} 즐겨찾기`}
          aria-pressed={activeFavorite}
          title={activeFavorite ? "현재 브러시 즐겨찾기 해제" : "현재 브러시 즐겨찾기"}
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-lg border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            activeFavorite
              ? "border-accent/50 bg-accent-soft text-accent"
              : "border-line/70 text-fg-3 hover:bg-raised hover:text-fg"
          )}
        >
          <Bookmark size={14} fill={activeFavorite ? "currentColor" : "none"} aria-hidden />
        </button>
      </div>

      <StudioBrushTray
        activeBrushId={activeBrushId}
        favoriteBrushIds={proDrawPrefs.favoriteBrushIds}
        recentBrushIds={proDrawPrefs.recentBrushIds}
        libraryOpen={libraryOpen}
        onOpenLibrary={() => setLibraryOpen((current) => !current)}
        onSelect={(item) => selectBrushId(item.id)}
        aria-label="빠른 브러시 — 즐겨찾기, 최근 사용, 추천"
        className={placement === "mobile" ? "w-full" : undefined}
      />

      {placement === "mobile" && stampTuning && onStampTuningChange ? (
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
                className="h-7 w-full cursor-pointer accent-accent"
              />
            </label>
          ))}
        </div>
      ) : null}

      {libraryOpen && globalThis.document
        ? createPortal(
            <Suspense
              fallback={(
                <div
                  role="status"
                  className={cn(
                    "fixed z-[60] rounded-xl border border-line bg-panel p-4 text-center text-xs text-fg-3 shadow-xl",
                    placement === "inspector"
                      ? "bottom-3 w-[min(22rem,calc(100vw-1rem))]"
                      : "inset-x-2 bottom-[calc(7.5rem+env(safe-area-inset-bottom))] top-3"
                  )}
                  style={catalogStyle}
                >
                  브러시 카탈로그를 불러오는 중…
                </div>
              )}
            >
              <StudioBrushLibrarySheet
                open
                activeBrushId={activeBrushId}
                favoriteIds={proDrawPrefs.favoriteBrushIds}
                recentIds={proDrawPrefs.recentBrushIds}
                onClose={closeLibraryAndRestoreFocus}
                onSelect={(item) => selectBrushId(item.id)}
                onToggleFavorite={toggleFavorite}
                className={cn(
                  "fixed left-auto max-h-none",
                  placement === "inspector"
                    ? "bottom-3 w-[min(22rem,calc(100vw-1rem))]"
                    : "inset-x-2 bottom-[calc(7.5rem+env(safe-area-inset-bottom))] top-3 w-auto"
                )}
                style={catalogStyle}
              />
            </Suspense>,
            globalThis.document.body
          )
        : null}
    </section>
  );
}
