/**
 * StudioBrushLibrarySheet — Magma / PicsArt full brush library popover.
 * Search · category · favorites · recent · large preview tiles.
 */
import { Search, Star, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactElement } from "react";

import {
  studioBrushChipSurface,
  studioBrushPreviewDotCenters,
  studioBrushPreviewPathD,
  studioBrushPreviewStrokeWidth,
} from "./studio-brush-visual";
import {
  filterStudioBrushLibraryItems,
  STUDIO_BRUSH_LIBRARY_TABS,
} from "./studio-draw-ux";
import { STUDIO_EASE, STUDIO_FOCUS_RING } from "./studio-panel-ui";
import { StudioBrushPresetIcon } from "./StudioBrushPresetIcon";

import type { StudioBrushTrayItem } from "./studio-creative-ux";

import { cn } from "@/lib/utils";

export interface StudioBrushLibrarySheetProps {
  open: boolean;
  activeBrushId: string;
  favoriteIds?: readonly string[];
  recentIds?: readonly string[];
  onClose: () => void;
  onSelect: (item: StudioBrushTrayItem) => void;
  onToggleFavorite?: (brushId: string) => void;
  className?: string;
}

function LargeBrushPreview({ item, active }: { item: StudioBrushTrayItem; active: boolean }): ReactElement {
  const w = 72;
  const h = 28;
  const surface = studioBrushChipSurface(item.mediaGroup);
  const strokeW = studioBrushPreviewStrokeWidth(item.previewWeight, item.previewStyle);
  const pathD = studioBrushPreviewPathD(item.previewStyle, w, h);
  const dots = studioBrushPreviewDotCenters(item.previewStyle, w, h);
  const ink = active ? "currentColor" : surface.ink;

  return (
    <svg
      aria-hidden
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={cn("block", active && "text-on-accent")}
    >
      <rect
        x={0.5}
        y={0.5}
        width={w - 1}
        height={h - 1}
        rx={5}
        fill={active ? "oklch(0.98 0.01 85 / 0.14)" : surface.paper}
        stroke={active ? "oklch(0.98 0.01 85 / 0.25)" : "oklch(0.4 0.012 64 / 0.35)"}
        strokeWidth={0.7}
      />
      {dots.length > 0 ? (
        <g fill={ink} opacity={0.9}>
          {dots.map((d, i) => (
            <circle key={i} cx={d.x * (w / 36)} cy={d.y * (h / 16)} r={d.r * 1.1} />
          ))}
        </g>
      ) : (
        <path
          d={pathD}
          fill="none"
          stroke={ink}
          strokeWidth={strokeW * 1.15}
          strokeLinecap="round"
          opacity={active ? 0.98 : 0.88}
        />
      )}
    </svg>
  );
}

export function StudioBrushLibrarySheet({
  open,
  activeBrushId,
  favoriteIds = [],
  recentIds = [],
  onClose,
  onSelect,
  onToggleFavorite,
  className,
}: StudioBrushLibrarySheetProps): ReactElement | null {
  const titleId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<(typeof STUDIO_BRUSH_LIBRARY_TABS)[number]["id"]>("beginner");

  useEffect(() => {
    if (!open) return;
    const t = globalThis.setTimeout(() => searchRef.current?.focus(), 30);
    return () => globalThis.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const items = filterStudioBrushLibraryItems({
    category: tab,
    query,
    favoriteIds,
    recentIds,
  });

  return (
    <div
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={`${titleId}-description`}
      data-studio-brush-library="true"
      className={cn(
        "absolute left-2 top-[calc(100%+0.35rem)] z-[60] w-[min(22rem,calc(100vw-1rem))] overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_16px_48px_oklch(0.12_0.02_70/0.55)]",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0">
          <p id={titleId} className="text-sm font-bold text-fg">
            브러시 라이브러리
          </p>
          <p id={`${titleId}-description`} className="text-[0.62rem] text-fg-3">
            전체 브러시 키트 · 검색·즐겨찾기
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="브러시 라이브러리 닫기"
          className={cn(
            "grid size-8 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-fg",
            STUDIO_FOCUS_RING
          )}
        >
          <X size={15} aria-hidden />
        </button>
      </div>

      <div className="relative border-b border-line px-2 py-2">
        <Search className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-3" aria-hidden />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="브러시 검색 (네온, 수채, G펜…)"
          className="min-h-10 w-full rounded-xl border border-line bg-card py-1.5 pl-9 pr-3 text-xs outline-none placeholder:text-fg-3 focus:border-accent focus:ring-1 focus:ring-accent/40"
          aria-label="브러시 검색"
        />
      </div>

      <div
        className="flex gap-1 overflow-x-auto border-b border-line px-2 py-1.5 [scrollbar-width:thin]"
        role="tablist"
        aria-label="브러시 분류"
      >
        {STUDIO_BRUSH_LIBRARY_TABS.map((chip) => {
          const active = tab === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              role="tab"
              aria-selected={active}
              title={chip.title}
              onClick={() => setTab(chip.id)}
              className={cn(
                "shrink-0 rounded-full border px-2.5 py-1 text-[0.64rem] font-semibold",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
                active
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg"
              )}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      <div className="max-h-[min(22rem,50vh)] overflow-y-auto p-2">
        {items.length === 0 ? (
          <div className="flex h-28 flex-col items-center justify-center rounded-xl border border-dashed border-line text-center">
            <p className="text-xs text-fg-3">
              {tab === "favorites"
                ? "즐겨찾기한 브러시가 없어요. ☆로 추가해 보세요."
                : tab === "recent"
                  ? "최근 사용한 브러시가 아직 없어요."
                  : "검색 결과가 없습니다."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {items.map((item) => {
              const active = item.id === activeBrushId;
              const fav = favoriteIds.includes(item.id);
              return (
                <div
                  key={item.id}
                  className={cn(
                    "group relative flex flex-col rounded-xl border p-1.5",
                    STUDIO_EASE,
                    active
                      ? "border-accent bg-accent text-on-accent shadow-[0_2px_10px_oklch(0.72_0.185_42/0.25)]"
                      : "border-line bg-card hover:border-accent/40 hover:bg-raised"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(item);
                      onClose();
                    }}
                    title={item.hint}
                    aria-label={`${item.name} 선택`}
                    aria-pressed={active}
                    className={cn("flex flex-col items-stretch gap-1 text-left", STUDIO_FOCUS_RING, "rounded-lg")}
                  >
                    <LargeBrushPreview item={item} active={active} />
                    <span className="flex min-w-0 items-center gap-1 pr-5">
                      <StudioBrushPresetIcon
                        brushId={item.id}
                        size={12}
                        strokeWidth={2}
                        className={active ? "text-on-accent" : "text-fg-2"}
                      />
                      <span className="truncate text-[0.68rem] font-bold leading-tight">{item.name}</span>
                    </span>
                    <span
                      className={cn(
                        "truncate text-[0.55rem] leading-tight",
                        active ? "text-on-accent/75" : "text-fg-3"
                      )}
                    >
                      {item.defaultWidth}px · {Math.round(item.defaultOpacity * 100)}%
                    </span>
                  </button>
                  {onToggleFavorite ? (
                    <button
                      type="button"
                      title={fav ? "즐겨찾기 해제" : "즐겨찾기"}
                      aria-label={fav ? `${item.name} 즐겨찾기 해제` : `${item.name} 즐겨찾기`}
                      aria-pressed={fav}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(item.id);
                      }}
                      className={cn(
                        "absolute right-1 top-1 grid size-7 place-items-center rounded-md",
                        STUDIO_FOCUS_RING,
                        fav
                          ? active
                            ? "text-on-accent"
                            : "text-accent"
                          : active
                            ? "text-on-accent/55 hover:text-on-accent"
                            : "text-fg-3 hover:text-fg"
                      )}
                    >
                      <Star size={12} fill={fav ? "currentColor" : "none"} aria-hidden />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
