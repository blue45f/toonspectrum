/**
 * StudioBrushTray — Picsart / Adobe Express / Ibis / CSP inspired visual brush strip.
 * Category chips + commercial stroke-preview tiles (not flat labels alone).
 * Pure presentation.
 */
import {
  ChevronDown,
  ChevronUp,
  Droplets,
  Highlighter,
  Pencil,
  Sparkles,
  Squircle,
  Stars,
  Wand2,
} from "lucide-react";
import { useState, type ReactElement } from "react";

import {
  studioBrushChipSurface,
  studioBrushPreviewDashArray,
  studioBrushPreviewDotCenters,
  studioBrushPreviewPathD,
  studioBrushPreviewRibbonD,
  studioBrushPreviewStrokeWidth,
} from "./studio-brush-visual";
import {
  listStudioBrushTrayItems,
  STUDIO_BRUSH_TRAY_CATEGORY_CHIPS,
  type StudioBrushTrayCategory,
  type StudioBrushTrayItem,
} from "./studio-creative-ux";
import { STUDIO_FOCUS_RING, STUDIO_EASE } from "./studio-panel-ui";
import { StudioBrushPresetIcon } from "./StudioBrushPresetIcon";

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<StudioBrushTrayCategory, LucideIcon> = {
  beginner: Sparkles,
  expressive: Wand2,
  line: Pencil,
  marker: Highlighter,
  paint: Droplets,
  fx: Stars,
  texture: Squircle,
  all: Wand2,
};

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

const PREVIEW_W = 40;
const PREVIEW_H = 18;

function BrushPreviewGlyph({
  item,
  active,
}: {
  item: StudioBrushTrayItem;
  active: boolean;
}): ReactElement {
  const surface = studioBrushChipSurface(item.mediaGroup);
  const strokeW = studioBrushPreviewStrokeWidth(item.previewWeight, item.previewStyle);
  const pathD = studioBrushPreviewPathD(item.previewStyle, PREVIEW_W, PREVIEW_H);
  const dash = studioBrushPreviewDashArray(item.previewStyle);
  const dots = studioBrushPreviewDotCenters(item.previewStyle, PREVIEW_W, PREVIEW_H);
  // 필압 테이퍼 리본: 균일 선 아이콘 대신 실제 획감(얇게 시작→부풀고→빠짐)을 보여준다.
  const ribbonD = studioBrushPreviewRibbonD(
    item.previewStyle,
    PREVIEW_W,
    PREVIEW_H,
    item.previewWeight
  );
  const ink = active ? "currentColor" : surface.ink;
  const glow = item.previewStyle === "neon" || item.previewStyle === "glow";

  return (
    <svg
      aria-hidden
      width={PREVIEW_W}
      height={PREVIEW_H}
      viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`}
      className={cn("block drop-shadow-sm", active ? "text-on-accent" : "")}
      data-studio-brush-preview={item.previewStyle}
    >
      {/* Paper / canvas tooth under stroke */}
      <rect
        x={0.5}
        y={0.5}
        width={PREVIEW_W - 1}
        height={PREVIEW_H - 1}
        rx={3.5}
        fill={active ? "oklch(0.98 0.01 85 / 0.14)" : surface.paper}
        stroke={active ? "oklch(0.98 0.01 85 / 0.2)" : "oklch(0.4 0.012 64 / 0.35)"}
        strokeWidth={0.6}
      />
      {/* Subtle grain for texture media */}
      {(item.previewStyle === "texture"
        || item.previewStyle === "tone"
        || item.previewStyle === "dots"
        || item.previewStyle === "glitter") &&
        !active && (
          <g opacity={0.35} fill={surface.ink}>
            <circle cx={6} cy={4} r={0.4} />
            <circle cx={14} cy={12} r={0.35} />
            <circle cx={22} cy={5} r={0.4} />
            <circle cx={30} cy={11} r={0.35} />
          </g>
        )}
      {dots.length > 0 ? (
        <g fill={ink} opacity={active ? 0.95 : 0.8}>
          {dots.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={d.r} />
          ))}
        </g>
      ) : (
        <>
          {(item.previewStyle === "soft" || item.previewStyle === "neon") && (
            <path
              d={pathD}
              fill="none"
              stroke={ink}
              strokeWidth={strokeW * (glow ? 2.4 : 1.85)}
              strokeLinecap="round"
              opacity={glow ? (active ? 0.45 : 0.28) : active ? 0.32 : 0.22}
              style={
                glow
                  ? {
                      filter: active
                        ? "drop-shadow(0 0 3px currentColor)"
                        : "drop-shadow(0 0 2px oklch(0.72 0.14 42 / 0.55))",
                    }
                  : undefined
              }
            />
          )}
          {item.previewStyle === "calligraphy" && (
            <path
              d={pathD}
              fill="none"
              stroke={ink}
              strokeWidth={strokeW * 0.55}
              strokeLinecap="round"
              opacity={active ? 0.4 : 0.28}
              transform="translate(0 1.2)"
            />
          )}
          {ribbonD ? (
            <path d={ribbonD} fill={ink} opacity={active ? 0.98 : 0.88} />
          ) : (
            <path
              d={pathD}
              fill="none"
              stroke={ink}
              strokeWidth={strokeW}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={dash}
              opacity={active ? 0.98 : 0.88}
            />
          )}
        </>
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
          className="hidden shrink-0 items-center gap-0.5 rounded-lg border border-line/50 bg-canvas/30 p-0.5 sm:flex"
        >
          {STUDIO_BRUSH_TRAY_CATEGORY_CHIPS.map((chip) => {
            const active =
              effectiveCategory === chip.id ||
              (chip.id === "expressive" && effectiveCategory === "all");
            const CatIcon = CATEGORY_ICONS[chip.id] ?? Sparkles;
            return (
              <button
                key={chip.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={chip.title}
                title={chip.title}
                onClick={() => setCategory(chip.id)}
                className={cn(
                  "grid size-7 place-items-center rounded-md",
                  STUDIO_EASE,
                  STUDIO_FOCUS_RING,
                  active
                    ? "bg-raised text-fg shadow-sm ring-1 ring-accent/35"
                    : "text-fg-3 hover:bg-raised/70 hover:text-fg-2"
                )}
              >
                <CatIcon size={13} strokeWidth={1.75} aria-hidden />
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        role="listbox"
        aria-label={ariaLabel}
        className="flex min-w-0 max-w-full items-center gap-1 overflow-x-auto py-0.5 [scrollbar-width:thin]"
      >
        {visible.map((item) => {
          const active = activeBrushId === item.id;
          const surface = studioBrushChipSurface(item.mediaGroup);
          return (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={active}
              aria-label={`${item.name} — ${item.hint}`}
              title={`${item.name} — ${item.hint}`}
              onClick={() => onSelect(item)}
              data-studio-brush-chip={item.id}
              data-studio-brush-media={item.mediaGroup}
              className={cn(
                // Icon + stroke preview tile (Ibis/Picsart/CSP)
                "relative grid h-11 w-11 shrink-0 place-items-center rounded-xl border",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
                active
                  ? "border-accent/60 bg-accent text-on-accent shadow-[0_2px_10px_oklch(0.72_0.185_42/0.28)]"
                  : "border-line/50 text-fg-2 hover:border-line/90 hover:bg-raised hover:text-fg hover:shadow-sm"
              )}
              style={
                active
                  ? undefined
                  : {
                      background: `linear-gradient(165deg, ${surface.tile} 0%, oklch(0.16 0.008 70 / 0.65) 100%)`,
                    }
              }
            >
              <span
                className={cn(
                  "absolute left-0.5 top-0.5 grid size-4 place-items-center rounded-md",
                  active ? "bg-on-accent/15 text-on-accent" : "bg-canvas/55 text-fg-2"
                )}
                data-studio-brush-chip-icon={item.id}
              >
                <StudioBrushPresetIcon brushId={item.id} size={10} strokeWidth={2} />
              </span>
              <BrushPreviewGlyph item={item} active={active} />
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? "브러시 키트 접기" : "브러시 키트 펼치기"}
        title={expanded ? "접기" : "더 많은 브러시"}
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg border border-line/70 bg-card/80 text-fg-3 hover:bg-raised hover:text-fg",
          STUDIO_EASE,
          STUDIO_FOCUS_RING
        )}
      >
        {expanded ? (
          <ChevronUp size={14} strokeWidth={1.75} aria-hidden />
        ) : (
          <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
        )}
      </button>
    </div>
  );
}
