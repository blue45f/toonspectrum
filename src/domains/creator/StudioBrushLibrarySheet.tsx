/**
 * StudioBrushLibrarySheet — searchable built-in brush catalog popover.
 * Search · category · favorites · recent · render-faithful preview tiles.
 */
import { LoaderCircle, Search, Star, X } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";

import { STUDIO_ALL_BRUSH_CATALOG_ITEMS } from "./studio-brush-catalog";
import { isStudioBrushPackCatalogId } from "./studio-brush-pack-id";
import { studioCoreBrushCatalogSelection } from "./studio-brush-selection";
import {
  studioBrushChipSurface,
  studioBrushPreviewDashArray,
  studioBrushPreviewDotCenters,
  studioBrushPreviewPathD,
  studioBrushPreviewRibbonD,
  studioBrushPreviewStrokeWidth,
} from "./studio-brush-visual";
import {
  filterStudioBrushLibraryItems,
  STUDIO_BRUSH_LIBRARY_TABS,
} from "./studio-draw-ux";
import { planGlowBrushPasses, planNeonBrushPasses } from "./studio-fx-brush";
import { STUDIO_EASE, STUDIO_FOCUS_RING } from "./studio-panel-ui";
import { StudioBrushPresetIcon } from "./StudioBrushPresetIcon";

import type { StudioBrushCatalogSelection } from "./studio-brush-selection";
import type { StudioBrushTrayItem } from "./studio-creative-ux";

import { cn } from "@/lib/utils";

export interface StudioBrushLibrarySheetProps {
  open: boolean;
  activeBrushId: string;
  favoriteIds?: readonly string[];
  recentIds?: readonly string[];
  onClose: (reason: StudioBrushCatalogCloseReason) => void;
  onSelect: (selection: StudioBrushCatalogSelection) => void;
  onToggleFavorite?: (brushId: string) => void;
  className?: string;
  style?: CSSProperties;
}

export type StudioBrushCatalogPlacement = "desktop-dock" | "mobile-sheet";
export type StudioBrushCatalogCloseReason =
  | "explicit"
  | "escape"
  | "selection"
  | "outside-pointer";

export interface StudioBrushCatalogPortalProps {
  open: boolean;
  placement: StudioBrushCatalogPlacement;
  triggerElement: HTMLElement | null;
  activeBrushId: string;
  favoriteIds?: readonly string[];
  recentIds?: readonly string[];
  mobileKeyboardInset?: number;
  onClose: (reason: StudioBrushCatalogCloseReason) => void;
  onSelect: (selection: StudioBrushCatalogSelection) => void;
  onToggleFavorite: (brushId: string) => void;
}

export type StudioBrushCatalogPreviewKind =
  | "ribbon"
  | "calligraphy"
  | "marker"
  | "square-marker"
  | "pencil"
  | "texture"
  | "soft-air"
  | "soft-wash"
  | "soft-pigment"
  | "oil"
  | "neon"
  | "glow"
  | "particle"
  | "tone";

let studioBrushPackRuntimePromise: Promise<typeof import("./studio-brush-pack-runtime")> | null = null;

function loadStudioBrushPackRuntime() {
  studioBrushPackRuntimePromise ??= import("./studio-brush-pack-runtime").catch((error) => {
    studioBrushPackRuntimePromise = null;
    throw error;
  });
  return studioBrushPackRuntimePromise;
}

function studioBrushPreviewHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function StudioProceduralBrushPreviewDetail({
  item,
  ink,
  opacity,
}: {
  item: StudioBrushTrayItem;
  ink: string;
  opacity: number;
}): ReactElement | null {
  if (!isStudioBrushPackCatalogId(item.id)) return null;
  const hash = studioBrushPreviewHash(item.id);
  const phase = (hash % 17) / 17;
  const ids = item.id;

  if (ids.includes("heart")) {
    return (
      <g fill={ink} opacity={opacity * 0.72} transform={`translate(${phase * 3} 0)`}>
        <path d="M72 13 C72 8 80 7 81 13 C83 7 91 8 91 13 C91 19 81 24 81 24 C81 24 72 19 72 13Z" />
        <path d="M58 19 C58 16 63 15 64 19 C65 15 70 16 70 19 C70 23 64 26 64 26 C64 26 58 23 58 19Z" opacity="0.62" />
      </g>
    );
  }
  if (ids.includes("footstep")) {
    return (
      <g fill={ink} opacity={opacity * 0.72} transform={`rotate(${phase * 8 - 4} 75 17)`}>
        <ellipse cx="64" cy="20" rx="3.2" ry="6.2" />
        <circle cx="61" cy="12" r="1.5" /><circle cx="64" cy="10.5" r="1.35" /><circle cx="67" cy="11.5" r="1.2" />
        <ellipse cx="79" cy="14" rx="3.2" ry="6.2" />
        <circle cx="76" cy="6" r="1.5" /><circle cx="79" cy="4.5" r="1.35" /><circle cx="82" cy="5.5" r="1.2" />
      </g>
    );
  }
  if (ids.includes("checker")) {
    return (
      <g fill={ink} opacity={opacity * 0.58} transform={`translate(${phase * 2} 0)`}>
        {Array.from({ length: 12 }, (_, index) => {
          const column = index % 6;
          const row = Math.floor(index / 6);
          if ((column + row) % 2 !== 0) return null;
          return <rect key={index} x={55 + column * 6} y={10 + row * 6} width="6" height="6" />;
        })}
      </g>
    );
  }
  if (ids.includes("leaf") || ids.includes("foliage") || ids.includes("grass") || ids.includes("vine") || ids.includes("willow")) {
    return (
      <g fill={ink} stroke={ink} strokeWidth="0.7" opacity={opacity * 0.62}>
        {Array.from({ length: 6 }, (_, index) => {
          const x = 53 + index * 7 + ((hash >>> (index % 8)) & 3);
          const y = 10 + ((hash >>> ((index + 3) % 12)) & 11);
          const rotation = -38 + ((hash >>> ((index + 5) % 16)) & 63);
          return (
            <g key={index} transform={`translate(${x} ${y}) rotate(${rotation})`}>
              <path d="M0 0 C2.2 -3.4 6.5 -3.1 8 0 C5.9 2.7 2.1 2.9 0 0Z" />
              <path d="M0 0 H7" fill="none" stroke={ink} opacity="0.48" />
            </g>
          );
        })}
      </g>
    );
  }
  if (ids.includes("rake") || ids.includes("hair") || ids.includes("stripe") || ids.includes("roller")) {
    const count = 3 + (hash % 4);
    return (
      <g fill="none" stroke={ink} strokeLinecap="round" opacity={opacity * 0.62}>
        {Array.from({ length: count }, (_, index) => (
          <path
            key={index}
            d={`M50 ${9 + index * (15 / Math.max(1, count - 1))} C62 ${7 + index * 3 + phase * 2}, 74 ${23 - index * 2}, 92 ${10 + index * 2.4}`}
            strokeWidth={0.65 + ((hash >>> index) & 3) * 0.28}
            strokeDasharray={ids.includes("rough") || ids.includes("dry") ? `${2 + index} ${1.5 + phase}` : undefined}
          />
        ))}
      </g>
    );
  }
  if (ids.includes("square") || ids.includes("blade") || ids.includes("flat") || ids.includes("block") || ids.includes("marker")) {
    return (
      <g fill={ink} opacity={opacity * 0.5} transform={`rotate(${phase * 18 - 9} 74 17)`}>
        <rect x="53" y={9 + phase * 3} width={13 + (hash % 9)} height={4 + ((hash >>> 4) % 6)} rx={ids.includes("square") ? 0 : 1.5} />
        <rect x={72 + phase * 4} y={16 - phase * 3} width={17 - (hash % 5)} height={3 + ((hash >>> 7) % 5)} rx="1" opacity="0.58" />
      </g>
    );
  }
  if (ids.includes("oval")) {
    return (
      <g fill={ink} opacity={opacity * 0.56} transform={`rotate(${phase * 36 - 18} 74 17)`}>
        <ellipse cx="60" cy="17" rx={4 + (hash % 4)} ry={2 + ((hash >>> 3) % 3)} />
        <ellipse cx="75" cy="15" rx={6 + ((hash >>> 5) % 4)} ry={2.5 + ((hash >>> 8) % 3)} opacity="0.72" />
        <ellipse cx="89" cy="19" rx={3 + ((hash >>> 10) % 3)} ry={2 + ((hash >>> 12) % 2)} opacity="0.48" />
      </g>
    );
  }

  return (
    <g fill={ink} opacity={opacity * 0.44}>
      {Array.from({ length: 8 }, (_, index) => {
        const x = 51 + index * 5.4 + ((hash >>> (index % 16)) & 3);
        const y = 9 + ((hash >>> ((index + 5) % 19)) & 15);
        const radius = 0.7 + ((hash >>> ((index + 9) % 21)) & 3) * 0.45;
        return <circle key={index} cx={x} cy={y} r={radius} />;
      })}
    </g>
  );
}

/**
 * Keep preview semantics aligned with the actual renderer rather than relying only on a decorative
 * style name. Marker aliases and the square highlighter, for example, share a previewStyle in older
 * saved UI data but use different caps in the canvas renderer.
 */
function studioBrushCatalogPreviewKind(
  item: StudioBrushTrayItem
): StudioBrushCatalogPreviewKind {
  if (item.id === "highlighter") return "square-marker";
  if (item.id === "marker" || item.id === "marker-bold" || item.id === "felt-tip") {
    return "marker";
  }
  if (item.previewStyle === "calligraphy") return "calligraphy";
  if (item.previewStyle === "neon") return "neon";
  if (item.previewStyle === "glow") return "glow";
  if (item.previewStyle === "glitter" || item.previewStyle === "dots") return "particle";
  if (item.previewStyle === "tone") return "tone";
  if (item.previewStyle === "oil") return "oil";
  if (item.previewStyle === "dashed") return "pencil";
  if (item.previewStyle === "texture") return "texture";
  if (item.previewStyle === "soft") {
    if (
      item.id === "airbrush"
      || item.id === "airbrush-fine"
      || item.id === "soft-brush"
      || item.id === "spray"
    ) {
      return "soft-air";
    }
    if (item.id === "watercolor" || item.id === "ink-wash" || item.id === "wash-brush") {
      return "soft-wash";
    }
    return "soft-pigment";
  }
  return "ribbon";
}

export function LargeBrushPreview({
  item,
  active,
}: {
  item: StudioBrushTrayItem;
  active: boolean;
}): ReactElement {
  const w = 96;
  const h = 34;
  const surface = studioBrushChipSurface(item.mediaGroup);
  const strokeW = studioBrushPreviewStrokeWidth(item.previewWeight, item.previewStyle);
  const pathD = studioBrushPreviewPathD(item.previewStyle, w, h);
  const ribbonD = studioBrushPreviewRibbonD(item.previewStyle, w, h, item.previewWeight);
  const dashArray = studioBrushPreviewDashArray(item.previewStyle);
  // Dot helpers use their canonical 36×16 coordinate system. Convert once into the padded large
  // preview viewport; the previous implementation passed 72×28 and then scaled those coordinates
  // again, which clipped screentone rows and pushed particles outside the tile.
  const dotStyle = item.previewStyle === "dashed" ? "texture" : item.previewStyle;
  const dots = studioBrushPreviewDotCenters(dotStyle, 36, 16).map((dot) => ({
    x: 4 + dot.x * ((w - 8) / 36),
    y: 3 + dot.y * ((h - 6) / 16),
    r: dot.r * Math.min((w - 8) / 36, (h - 6) / 16),
  }));
  // Suggested preset colors make effect brushes recognizable in the catalog only. Selecting a
  // preset still preserves the artist's working color (the apply contract lives outside this view).
  const ink = active ? "currentColor" : item.defaultColor ?? surface.ink;
  const kind = studioBrushCatalogPreviewKind(item);
  const opacity = Math.max(0.35, Math.min(1, item.defaultOpacity));

  let brushSample: ReactElement;
  if (kind === "square-marker") {
    brushSample = (
      <g data-studio-brush-preview-layer="square-marker">
        <path
          d={pathD}
          fill="none"
          stroke={ink}
          strokeWidth={Math.max(6.8, strokeW * 1.55)}
          strokeLinecap="square"
          strokeLinejoin="miter"
          opacity={opacity * 0.72}
        />
        <path
          d={pathD}
          fill="none"
          stroke={ink}
          strokeWidth={Math.max(2.2, strokeW * 0.5)}
          strokeLinecap="square"
          opacity={opacity * 0.32}
        />
      </g>
    );
  } else if (kind === "marker") {
    brushSample = (
      <g data-studio-brush-preview-layer="marker">
        <path
          d={pathD}
          fill="none"
          stroke={ink}
          strokeWidth={Math.max(4.8, strokeW * 1.25)}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={opacity}
        />
        <circle cx={w - 7} cy={h / 2 - 1} r={Math.max(2.4, strokeW * 0.56)} fill={ink} opacity={opacity * 0.78} />
      </g>
    );
  } else if (kind === "neon" || kind === "glow") {
    const softGlow = item.id === "soft-glow";
    const passes = kind === "neon"
      ? planNeonBrushPasses(strokeW)
      : planGlowBrushPasses(strokeW, softGlow).map((pass) => ({ ...pass, tone: "color" as const }));
    brushSample = (
      <g data-studio-brush-preview-layer={kind}>
        {passes.map((pass, index) => (
          <path
            key={index}
            d={pathD}
            fill="none"
            stroke={pass.tone === "white-core" ? "oklch(0.97 0.015 85)" : ink}
            strokeWidth={Math.max(1.15, strokeW * pass.widthScale)}
            strokeLinecap="round"
            opacity={pass.opacity * opacity}
          />
        ))}
      </g>
    );
  } else if (kind === "particle" || kind === "tone") {
    const particleDots = item.id === "star-dust" ? dots.filter((_, index) => index % 2 === 0) : dots;
    brushSample = (
      <g data-studio-brush-preview-layer={kind} fill={ink} opacity={opacity}>
        {particleDots.map((dot, index) => {
          if (kind === "particle" && (item.id === "star-dust" || index % 3 === 1)) {
            const size = dot.r * (item.id === "star-dust" ? 2.1 : 1.45);
            return (
              <path
                key={index}
                d={`M${dot.x} ${dot.y - size} L${dot.x + size * 0.38} ${dot.y - size * 0.38} L${dot.x + size} ${dot.y} L${dot.x + size * 0.38} ${dot.y + size * 0.38} L${dot.x} ${dot.y + size} L${dot.x - size * 0.38} ${dot.y + size * 0.38} L${dot.x - size} ${dot.y} L${dot.x - size * 0.38} ${dot.y - size * 0.38} Z`}
              />
            );
          }
          return <circle key={index} cx={dot.x} cy={dot.y} r={dot.r} />;
        })}
      </g>
    );
  } else if (kind === "pencil" || kind === "texture") {
    brushSample = (
      <g data-studio-brush-preview-layer={kind}>
        <path
          d={pathD}
          fill="none"
          stroke={ink}
          strokeWidth={Math.max(1.1, strokeW * (kind === "texture" ? 1.15 : 0.82))}
          strokeLinecap="round"
          strokeDasharray={dashArray ?? "1.6 1.3"}
          opacity={opacity * 0.88}
        />
        <g fill={ink} opacity={kind === "texture" ? 0.52 : 0.34}>
          {dots.map((dot, index) => (
            <circle key={index} cx={dot.x} cy={dot.y} r={Math.max(0.45, dot.r * 0.48)} />
          ))}
        </g>
      </g>
    );
  } else if (kind === "soft-air") {
    brushSample = (
      <g data-studio-brush-preview-layer="soft-air">
        <path d={pathD} fill="none" stroke={ink} strokeWidth={Math.max(10, strokeW * 3.3)} strokeLinecap="round" opacity={0.08} />
        <path d={pathD} fill="none" stroke={ink} strokeWidth={Math.max(7, strokeW * 2.35)} strokeLinecap="round" opacity={0.16} />
        <path d={pathD} fill="none" stroke={ink} strokeWidth={Math.max(3.5, strokeW * 1.15)} strokeLinecap="round" opacity={opacity * 0.42} />
      </g>
    );
  } else if (kind === "soft-wash" || kind === "soft-pigment") {
    const wash = kind === "soft-wash";
    brushSample = (
      <g data-studio-brush-preview-layer={kind}>
        <path
          d={pathD}
          fill="none"
          stroke={ink}
          strokeWidth={Math.max(wash ? 8.4 : 7.2, strokeW * (wash ? 2.45 : 2.05))}
          strokeLinecap="round"
          opacity={opacity * (wash ? 0.2 : 0.24)}
        />
        <path
          d={pathD}
          fill="none"
          stroke={ink}
          strokeWidth={Math.max(3.2, strokeW * 1.08)}
          strokeLinecap="round"
          strokeDasharray={wash ? "8 2.2" : undefined}
          opacity={opacity * 0.48}
        />
        {wash ? (
          <g fill="none" stroke={ink} opacity={0.25}>
            <circle cx={22} cy={h / 2 - 1.5} r={Math.max(3.6, strokeW)} />
            <circle cx={68} cy={h / 2 + 0.5} r={Math.max(4.2, strokeW * 1.15)} />
          </g>
        ) : null}
      </g>
    );
  } else if (kind === "oil") {
    brushSample = (
      <g data-studio-brush-preview-layer="oil">
        <path d={ribbonD ?? pathD} fill={ribbonD ? ink : "none"} stroke={ribbonD ? "none" : ink} opacity={opacity * 0.92} />
        <path d={pathD} fill="none" stroke={active ? "currentColor" : surface.paper} strokeWidth={1.1} strokeDasharray="7 2" opacity={0.72} />
        <path d={pathD} fill="none" stroke={ink} strokeWidth={0.7} strokeDasharray="2 3" opacity={0.58} transform="translate(0 2.2)" />
      </g>
    );
  } else {
    brushSample = (
      <g data-studio-brush-preview-layer={kind}>
        {ribbonD ? (
          <path d={ribbonD} fill={ink} opacity={opacity} />
        ) : (
          <path
            d={pathD}
            fill="none"
            stroke={ink}
            strokeWidth={strokeW * 1.15}
            strokeLinecap="round"
            opacity={opacity}
          />
        )}
        {kind === "calligraphy" ? (
          <path d={pathD} fill="none" stroke={active ? "currentColor" : surface.paper} strokeWidth={0.75} opacity={0.62} />
        ) : null}
      </g>
    );
  }

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${w} ${h}`}
      data-studio-brush-preview="true"
      data-studio-brush-preview-kind={kind}
      className={cn("block h-[2.125rem] w-full", active && "text-on-accent")}
    >
      <rect
        x={0.5}
        y={0.5}
        width={w - 1}
        height={h - 1}
        rx={6}
        fill={active ? "oklch(0.98 0.01 85 / 0.14)" : surface.tile}
        stroke={active ? "oklch(0.98 0.01 85 / 0.25)" : "oklch(0.4 0.012 64 / 0.35)"}
        strokeWidth={0.7}
      />
      <path d={`M5 ${h - 5.5} H${w - 5}`} stroke={active ? "currentColor" : surface.paper} strokeWidth={0.5} opacity={0.35} />
      {brushSample}
      <StudioProceduralBrushPreviewDetail item={item} ink={ink} opacity={opacity} />
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
  style,
}: StudioBrushLibrarySheetProps): ReactElement | null {
  const titleId = useId();
  const tabsId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const tabListRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<(typeof STUDIO_BRUSH_LIBRARY_TABS)[number]["id"]>("beginner");
  const [pendingSelectionId, setPendingSelectionId] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const panelId = `${tabsId}-panel`;

  useEffect(() => {
    if (!open) return;
    setSelectionError(null);
    const t = globalThis.setTimeout(() => searchRef.current?.focus(), 30);
    return () => globalThis.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose("escape");
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
    catalogItems: STUDIO_ALL_BRUSH_CATALOG_ITEMS,
  });

  async function selectCatalogItem(item: StudioBrushTrayItem): Promise<void> {
    if (pendingSelectionId) return;
    setSelectionError(null);
    setPendingSelectionId(item.id);
    try {
      const selection = isStudioBrushPackCatalogId(item.id)
        ? (await loadStudioBrushPackRuntime()).materializeStudioBrushPackSelection(item.id)
        : studioCoreBrushCatalogSelection({
            id: item.id,
            name: item.name,
            defaultWidth: item.defaultWidth,
            defaultOpacity: item.defaultOpacity,
            ...(item.defaultColor ? { defaultColor: item.defaultColor } : {}),
          });
      if (!selection) throw new Error("브러시 프로필을 찾을 수 없습니다.");
      onSelect(selection);
      onClose("selection");
    } catch (error) {
      setSelectionError(
        error instanceof Error && error.message
          ? error.message
          : "브러시를 불러오지 못했습니다. 다시 시도해 주세요."
      );
    } finally {
      setPendingSelectionId(null);
    }
  }

  function onTabKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentIndex: number
  ): void {
    const lastIndex = STUDIO_BRUSH_LIBRARY_TABS.length - 1;
    let nextIndex: number;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = lastIndex;
    } else {
      return;
    }
    const nextTab = STUDIO_BRUSH_LIBRARY_TABS[nextIndex];
    if (!nextTab) return;
    event.preventDefault();
    setTab(nextTab.id);
    tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
  }

  return (
    <div
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={`${titleId}-description`}
      data-studio-brush-library="true"
      data-studio-brush-catalog="built-in"
      data-studio-brush-catalog-session="true"
      style={style}
      className={cn(
        "absolute left-2 top-[calc(100%+0.35rem)] z-[60] flex max-h-[min(32rem,calc(100dvh-1rem))] w-[min(22rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_16px_48px_oklch(0.12_0.02_70/0.55)]",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0">
          <p id={titleId} className="text-sm font-bold text-fg">
            앱 브러시
          </p>
          <p id={`${titleId}-description`} className="text-[0.62rem] text-fg-3">
            코어 35 + 프로시저럴 67 · 내 브러시와 별개 · {items.length}개 표시
          </p>
        </div>
        <button
          type="button"
          onClick={() => onClose("explicit")}
          aria-label="앱 브러시 닫기"
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-xl text-fg-3 hover:bg-raised hover:text-fg",
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
          className="min-h-11 w-full rounded-xl border border-line bg-card py-1.5 pl-9 pr-3 text-xs outline-none placeholder:text-fg-3 focus:border-accent focus:ring-1 focus:ring-accent/40"
          aria-label="브러시 검색"
          aria-controls={panelId}
        />
      </div>

      <div
        ref={tabListRef}
        className="flex gap-1 overflow-x-auto border-b border-line px-2 py-1.5 [scrollbar-width:thin]"
        role="tablist"
        aria-label="브러시 분류"
      >
        {STUDIO_BRUSH_LIBRARY_TABS.map((chip, chipIndex) => {
          const active = tab === chip.id;
          return (
            <button
              key={chip.id}
              id={`${tabsId}-${chip.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={panelId}
              tabIndex={active ? 0 : -1}
              title={chip.title}
              onClick={() => setTab(chip.id)}
              onKeyDown={(event) => onTabKeyDown(event, chipIndex)}
              className={cn(
                "min-h-11 min-w-11 shrink-0 rounded-xl border px-3 py-1 text-[0.64rem] font-semibold",
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

      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={`${tabsId}-${tab}`}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto p-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        {selectionError ? (
          <div
            role="alert"
            className="mb-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-[0.68rem] font-medium text-danger"
          >
            {selectionError}
          </div>
        ) : null}
        <p role="status" aria-live="polite" className="sr-only">
          {items.length}개의 브러시가 표시됩니다.
        </p>
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
                  data-studio-brush-source={isStudioBrushPackCatalogId(item.id) ? "pro" : "core"}
                  className={cn(
                    "group relative flex flex-col rounded-xl border p-1.5 [contain-intrinsic-size:7.25rem] [content-visibility:auto]",
                    STUDIO_EASE,
                    active
                      ? "border-accent bg-accent text-on-accent shadow-[0_2px_10px_oklch(0.72_0.185_42/0.25)]"
                      : "border-line bg-card hover:border-accent/40 hover:bg-raised"
                  )}
                >
                  <button
                    type="button"
                    onPointerEnter={() => {
                      if (isStudioBrushPackCatalogId(item.id)) {
                        void loadStudioBrushPackRuntime().catch(() => undefined);
                      }
                    }}
                    onFocus={() => {
                      if (isStudioBrushPackCatalogId(item.id)) {
                        void loadStudioBrushPackRuntime().catch(() => undefined);
                      }
                    }}
                    onClick={() => void selectCatalogItem(item)}
                    title={item.hint}
                    aria-label={`${item.name} 선택`}
                    aria-pressed={active}
                    aria-busy={pendingSelectionId === item.id || undefined}
                    disabled={pendingSelectionId !== null}
                    className={cn(
                      "flex flex-col items-stretch gap-1 rounded-lg text-left disabled:cursor-wait disabled:opacity-70",
                      STUDIO_FOCUS_RING
                    )}
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
                      {pendingSelectionId === item.id ? (
                        <LoaderCircle size={12} className="ml-auto shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
                      ) : isStudioBrushPackCatalogId(item.id) ? (
                        <span className="ml-auto shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[0.48rem] font-black text-accent">
                          PRO
                        </span>
                      ) : null}
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
                        "absolute right-0 top-0 grid size-11 place-items-center rounded-xl",
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

/**
 * The only built-in preset catalog Portal in Studio. Desktop and mobile
 * triggers point at this controlled host, so Escape/outside-click/focus return
 * and favorite mutations cannot diverge across hidden UI surfaces.
 */
export function StudioBrushCatalogPortal({
  open,
  placement,
  triggerElement,
  activeBrushId,
  favoriteIds = [],
  recentIds = [],
  mobileKeyboardInset = 0,
  onClose,
  onSelect,
  onToggleFavorite,
}: StudioBrushCatalogPortalProps): ReactElement | null {
  const [desktopStyle, setDesktopStyle] = useState<CSSProperties>({
    bottom: 72,
    left: 8,
    width: "min(22rem, calc(100vw - 1rem))",
  });

  useLayoutEffect(() => {
    if (!open || placement !== "desktop-dock") return;

    const updatePosition = () => {
      const viewportWidth = Math.max(320, globalThis.innerWidth || 0);
      const viewportHeight = Math.max(320, globalThis.innerHeight || 0);
      const catalogWidth = Math.min(352, Math.max(304, viewportWidth - 16));
      const anchor = triggerElement?.getBoundingClientRect();
      const anchorLeft = anchor?.left ?? (viewportWidth - catalogWidth) / 2;
      const left = Math.min(
        Math.max(8, anchorLeft),
        Math.max(8, viewportWidth - catalogWidth - 8)
      );
      const spaceAbove = anchor ? Math.max(1, anchor.top - 16) : Math.max(1, viewportHeight - 80);
      const spaceBelow = anchor ? Math.max(1, viewportHeight - anchor.bottom - 16) : 1;
      // Prefer the side with real room. Never invent a minimum height larger than the viewport:
      // on short laptop windows that pushed the fixed dialog above y=0 and hid its close/search UI.
      setDesktopStyle(spaceAbove >= spaceBelow
        ? {
            bottom: anchor ? Math.max(8, viewportHeight - anchor.top + 8) : 72,
            left,
            maxHeight: spaceAbove,
            top: "auto",
            width: catalogWidth,
          }
        : {
            bottom: "auto",
            left,
            maxHeight: spaceBelow,
            top: Math.max(8, (anchor?.bottom ?? 0) + 8),
            width: catalogWidth,
          });
    };

    updatePosition();
    const resizeObserver =
      triggerElement && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updatePosition)
        : null;
    if (triggerElement) resizeObserver?.observe(triggerElement);
    globalThis.addEventListener("resize", updatePosition);
    globalThis.addEventListener("scroll", updatePosition, true);
    return () => {
      resizeObserver?.disconnect();
      globalThis.removeEventListener("resize", updatePosition);
      globalThis.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, placement, triggerElement]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      const catalog = globalThis.document?.querySelector<HTMLElement>(
        '[data-studio-brush-catalog-session="true"]'
      );
      if (catalog?.contains(event.target) || triggerElement?.contains(event.target)) return;
      onClose("outside-pointer");
    };
    globalThis.addEventListener("pointerdown", onPointerDown, true);
    return () => globalThis.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, onClose, triggerElement]);

  if (!open || !globalThis.document) return null;

  const mobileStyle: CSSProperties = {
    bottom: `calc(7.5rem + env(safe-area-inset-bottom) + ${Math.max(0, mobileKeyboardInset)}px)`,
  };

  return createPortal(
    <StudioBrushLibrarySheet
      open
      activeBrushId={activeBrushId}
      favoriteIds={favoriteIds}
      recentIds={recentIds}
      onClose={onClose}
      onSelect={onSelect}
      onToggleFavorite={onToggleFavorite}
      className={cn(
        "fixed pointer-events-auto",
        placement === "desktop-dock"
          ? "bottom-auto left-auto top-auto"
          : "inset-x-2 top-3 w-auto max-h-none"
      )}
      style={placement === "desktop-dock" ? desktopStyle : mobileStyle}
    />,
    globalThis.document.body
  );
}
