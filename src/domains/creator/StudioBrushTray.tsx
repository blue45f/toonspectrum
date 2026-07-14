/**
 * StudioBrushTray — Picsart/Adobe Express inspired visual brush strip.
 * Category chips + stroke-preview tiles; beginner kit first (Canva), expandable depth (Picsart).
 * Pure presentation.
 */
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState, type ReactElement } from "react";

import {
  listStudioBrushTrayItems,
  STUDIO_BRUSH_TRAY_CATEGORY_CHIPS,
  type StudioBrushTrayCategory,
  type StudioBrushTrayItem,
} from "./studio-creative-ux";
import { STUDIO_FOCUS_RING, STUDIO_EASE } from "./studio-panel-ui";

import { cn } from "@/lib/utils";

export interface StudioBrushTrayProps {
  activeBrushId: string;
  onSelect: (item: StudioBrushTrayItem) => void;
  /** simple density → beginner only until expanded / category change */
  compact?: boolean;
  className?: string;
  "aria-label"?: string;
  /** Hide category chips (ultra-dense tool strip). */
  hideCategories?: boolean;
}

function BrushPreviewGlyph({
  item,
  active,
}: {
  item: StudioBrushTrayItem;
  active: boolean;
}): ReactElement {
  const stroke = active ? "currentColor" : "currentColor";
  const w = Math.max(1.2, item.previewWeight * 3.2);
  const opacity = active ? 0.95 : 0.72;
  // Mini SVG strokes read more like commercial brush chips than a flat bar.
  return (
    <svg
      aria-hidden
      width={28}
      height={12}
      viewBox="0 0 28 12"
      className={cn("block", active ? "text-on-accent" : "text-fg-2")}
    >
      {item.previewStyle === "dots" ? (
        <g fill={stroke} opacity={opacity}>
          {[4, 10, 16, 22].map((x) => (
            <circle key={x} cx={x} cy={6} r={Math.max(1.1, w * 0.55)} />
          ))}
        </g>
      ) : item.previewStyle === "dashed" ? (
        <path
          d="M2 8 C8 2, 12 10, 18 5 S26 7, 26 7"
          fill="none"
          stroke={stroke}
          strokeWidth={w}
          strokeLinecap="round"
          strokeDasharray="2.2 2.4"
          opacity={opacity}
        />
      ) : item.previewStyle === "soft" ? (
        <>
          <path
            d="M2 7 C9 3, 14 10, 26 5"
            fill="none"
            stroke={stroke}
            strokeWidth={w * 1.8}
            strokeLinecap="round"
            opacity={opacity * 0.35}
          />
          <path
            d="M2 7 C9 3, 14 10, 26 5"
            fill="none"
            stroke={stroke}
            strokeWidth={w}
            strokeLinecap="round"
            opacity={opacity}
          />
        </>
      ) : item.previewStyle === "wavy" ? (
        <path
          d="M2 8 C6 2, 10 10, 14 4 S22 10, 26 5"
          fill="none"
          stroke={stroke}
          strokeWidth={w}
          strokeLinecap="round"
          opacity={opacity}
        />
      ) : (
        <path
          d="M2 7 C10 3, 16 10, 26 6"
          fill="none"
          stroke={stroke}
          strokeWidth={w}
          strokeLinecap="round"
          opacity={opacity}
        />
      )}
    </svg>
  );
}

export function StudioBrushTray({
  activeBrushId,
  onSelect,
  compact = false,
  className,
  "aria-label": ariaLabel = "브러시 키트",
  hideCategories = false,
}: StudioBrushTrayProps): ReactElement {
  const [expanded, setExpanded] = useState(!compact);
  const [category, setCategory] = useState<StudioBrushTrayCategory>("beginner");

  const effectiveCategory: StudioBrushTrayCategory =
    !expanded && (category === "expressive" || category === "all")
      ? "beginner"
      : expanded
        ? category === "beginner" && !compact
          ? "beginner"
          : category
        : "beginner";

  const visible =
    !expanded
      ? listStudioBrushTrayItems("beginner")
      : listStudioBrushTrayItems(effectiveCategory === "all" ? "expressive" : effectiveCategory);

  return (
    <div
      data-studio-brush-tray="true"
      className={cn("flex min-w-0 max-w-full items-center gap-1", className)}
    >
      {!hideCategories && expanded ? (
        <div
          role="tablist"
          aria-label="브러시 분류"
          className="hidden shrink-0 items-center gap-0.5 sm:flex"
        >
          {STUDIO_BRUSH_TRAY_CATEGORY_CHIPS.map((chip) => {
            const active = effectiveCategory === chip.id || (chip.id === "expressive" && effectiveCategory === "all");
            return (
              <button
                key={chip.id}
                type="button"
                role="tab"
                aria-selected={active}
                title={chip.title}
                onClick={() => setCategory(chip.id)}
                className={cn(
                  "h-6 rounded-md px-1.5 text-[0.55rem] font-bold tracking-tight",
                  STUDIO_EASE,
                  STUDIO_FOCUS_RING,
                  active
                    ? "bg-raised text-fg ring-1 ring-accent/35"
                    : "text-fg-3 hover:bg-raised/70 hover:text-fg-2"
                )}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        role="listbox"
        aria-label={ariaLabel}
        className="flex min-w-0 max-w-full items-center gap-0.5 overflow-x-auto [scrollbar-width:thin]"
      >
        {visible.map((item) => {
          const active = activeBrushId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={active}
              title={`${item.name} — ${item.hint}`}
              onClick={() => onSelect(item)}
              className={cn(
                // Ibis/Sketchbook: tactile tiles with clearer stroke preview
                "flex h-11 min-w-[3.05rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-1.5",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
                active
                  ? "border-accent/55 bg-accent text-on-accent"
                  : "border-line/40 bg-canvas/35 text-fg-2 hover:border-line/80 hover:bg-raised hover:text-fg"
              )}
            >
              <BrushPreviewGlyph item={item} active={active} />
              <span className="text-[0.56rem] font-bold leading-none tracking-tight">{item.shortName}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => {
          setExpanded((v) => {
            const next = !v;
            if (next) setCategory("line");
            else setCategory("beginner");
            return next;
          });
        }}
        aria-expanded={expanded}
        title={expanded ? "기본 브러시만 보기" : "선·마커·페인트·질감 브러시 펼치기"}
        aria-label={expanded ? "브러시 키트 접기" : "브러시 키트 펼치기"}
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-md border border-line bg-card text-fg-3",
          STUDIO_EASE,
          STUDIO_FOCUS_RING,
          "hover:bg-raised hover:text-fg"
        )}
      >
        {expanded ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
      </button>
    </div>
  );
}
