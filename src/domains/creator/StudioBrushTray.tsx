/**
 * StudioBrushTray — compact recent/favorite shelf with a full-library exit.
 * Pure presentation; the complete searchable catalog lives in StudioBrushLibrarySheet.
 */
import { History, LayoutGrid, Star } from "lucide-react";

import {
  studioBrushChipSurface,
  studioBrushPreviewDashArray,
  studioBrushPreviewDotCenters,
  studioBrushPreviewPathD,
  studioBrushPreviewRibbonD,
  studioBrushPreviewStrokeWidth,
} from "./studio-brush-visual";
import {
  listStudioQuickBrushTrayItems,
  type StudioBrushTrayItem,
  type StudioQuickBrushSource,
} from "./studio-creative-ux";
import { planNeonBrushPasses } from "./studio-fx-brush";
import { STUDIO_FOCUS_RING, STUDIO_EASE } from "./studio-panel-ui";
import { StudioBrushPresetIcon } from "./StudioBrushPresetIcon";

import type { ReactElement } from "react";

import { cn } from "@/lib/utils";

export interface StudioBrushTrayProps {
  activeBrushId: string;
  onSelect: (item: StudioBrushTrayItem) => void;
  recentBrushIds?: readonly string[];
  favoriteBrushIds?: readonly string[];
  onOpenLibrary: (trigger: HTMLButtonElement) => void;
  libraryOpen?: boolean;
  className?: string;
  "aria-label"?: string;
}

const QUICK_SOURCE_LABEL: Record<StudioQuickBrushSource, string> = {
  favorite: "즐겨찾기",
  recent: "최근 사용",
  starter: "추천",
};

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
  const neonPasses = item.previewStyle === "neon" ? planNeonBrushPasses(strokeW) : null;

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
        neonPasses ? (
          <g data-studio-brush-preview-layer="neon">
            {neonPasses.map((pass, index) => (
              <path
                key={index}
                d={pathD}
                fill="none"
                stroke={pass.tone === "white-core" ? "oklch(0.97 0.015 85)" : ink}
                strokeWidth={Math.max(1, strokeW * pass.widthScale)}
                strokeLinecap="round"
                opacity={pass.opacity * (active ? 1 : 0.82)}
              />
            ))}
          </g>
        ) : (
          <>
          {item.previewStyle === "soft" && (
            <path
              d={pathD}
              fill="none"
              stroke={ink}
              strokeWidth={strokeW * 1.85}
              strokeLinecap="round"
              opacity={active ? 0.32 : 0.22}
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
        )
      )}
    </svg>
  );
}

export function StudioBrushTray({
  activeBrushId,
  onSelect,
  recentBrushIds = [],
  favoriteBrushIds = [],
  onOpenLibrary,
  libraryOpen = false,
  className,
  "aria-label": ariaLabel = "빠른 브러시 — 즐겨찾기, 최근 사용, 추천",
}: StudioBrushTrayProps): ReactElement {
  const visible = listStudioQuickBrushTrayItems({
    favoriteIds: favoriteBrushIds,
    recentIds: recentBrushIds,
  });

  return (
    <div
      data-studio-brush-tray="true"
      className={cn("flex min-w-0 max-w-full items-center gap-1", className)}
    >
      <div
        role="listbox"
        aria-label={ariaLabel}
        className="flex min-w-0 max-w-full items-center gap-1 overflow-x-auto py-0.5 [scrollbar-width:thin]"
      >
        {visible.map((item) => {
          const active = activeBrushId === item.id;
          const surface = studioBrushChipSurface(item.mediaGroup);
          const sourceLabel = QUICK_SOURCE_LABEL[item.quickSource];
          return (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={active}
              aria-label={`${sourceLabel} 브러시 ${item.name} — ${item.hint}`}
              title={`${sourceLabel} · ${item.name} — ${item.hint}`}
              onClick={() => onSelect(item)}
              data-studio-brush-chip={item.id}
              data-studio-brush-media={item.mediaGroup}
              data-studio-quick-source={item.quickSource}
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
              {item.quickSource !== "starter" ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute right-0.5 top-0.5 grid size-3.5 place-items-center rounded-full",
                    active ? "bg-on-accent/15 text-on-accent" : "bg-canvas/70 text-fg-2"
                  )}
                >
                  {item.quickSource === "favorite" ? (
                    <Star size={8} fill="currentColor" strokeWidth={1.5} />
                  ) : (
                    <History size={8} strokeWidth={2} />
                  )}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={(event) => onOpenLibrary(event.currentTarget)}
        aria-expanded={libraryOpen}
        aria-haspopup="dialog"
        aria-label="기본 프리셋 전체 보기"
        title="기본 프리셋 전체 보기"
        data-studio-open-brush-library="true"
        className={cn(
          "flex h-11 shrink-0 items-center gap-1 rounded-xl border border-line/70 bg-card/80 px-2 text-[0.62rem] font-bold text-fg-2 hover:border-accent/40 hover:bg-raised hover:text-fg",
          STUDIO_EASE,
          STUDIO_FOCUS_RING
        )}
      >
        <LayoutGrid size={13} strokeWidth={1.75} aria-hidden />
        <span className="whitespace-nowrap">전체 보기</span>
      </button>
    </div>
  );
}
