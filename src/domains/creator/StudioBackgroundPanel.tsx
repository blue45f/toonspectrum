/**
 * StudioBackgroundPanel — PicsArt-class background editor.
 * Tabs: 채우기 (fill) · 크기 (canvas resizer). Friendly copy, icons, recent, search.
 */
import {
  Droplets,
  Grid3X3,
  Layers,
  Maximize2,
  Palette,
  Search,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactElement, type ReactNode } from "react";

import {
  findStudioBackgroundPreset,
  listStudioBackgroundPresets,
  planStudioBackgroundApply,
  STUDIO_BACKGROUND_CATEGORY_CHIPS,
  studioBackgroundPreviewCss,
  type StudioBackgroundApply,
  type StudioBackgroundCategory,
  type StudioBackgroundPreset,
} from "./studio-background-presets";
import {
  loadStudioBackgroundRecent,
  pushStudioBackgroundRecent,
} from "./studio-background-recent";
import { svgToDataUrl } from "./studio-characters";
import { STUDIO_EASE, STUDIO_FOCUS_RING } from "./studio-panel-ui";

import { cn } from "@/lib/utils";

export type StudioBackgroundEditorTab = "fill" | "size";

export interface StudioBackgroundPanelProps {
  canvasW: number;
  canvasH: number;
  currentBg: string;
  /** Current gradient stops when page uses gradient fill (optional, for status). */
  currentBgGrad?: string[] | null;
  onApply: (payload: StudioBackgroundApply) => void;
  /** Canvas size resizer slot (StudioCanvasResizer). */
  sizeSlot?: ReactNode;
  /** Initial tab. */
  initialTab?: StudioBackgroundEditorTab;
  className?: string;
}

const CATEGORY_ICONS: Record<StudioBackgroundCategory, LucideIcon> = {
  all: Layers,
  solid: Palette,
  gradient: Droplets,
  pattern: Grid3X3,
  atmosphere: Sparkles,
};

function PreviewSwatch({
  preset,
  canvasW,
  canvasH,
  active,
}: {
  preset: StudioBackgroundPreset;
  canvasW: number;
  canvasH: number;
  active?: boolean;
}): ReactElement {
  if (preset.kind === "pattern" || preset.kind === "atmosphere") {
    const src = svgToDataUrl(preset.buildSvg(Math.min(120, canvasW), Math.min(160, canvasH)));
    return (
      <span
        className={cn(
          "block h-12 w-full overflow-hidden rounded-md border",
          active ? "border-on-accent/50" : "border-line/60"
        )}
        style={{
          backgroundImage: `url(${src})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
    );
  }
  return (
    <span
      className={cn(
        "block h-12 w-full rounded-md border",
        active ? "border-on-accent/50" : "border-line/60"
      )}
      style={{ background: studioBackgroundPreviewCss(preset) }}
    />
  );
}

function currentFillCss(bg: string, grad?: string[] | null): string {
  if (grad && grad.length >= 2) {
    return `linear-gradient(to bottom, ${grad.join(", ")})`;
  }
  return bg || "#f7f1e6";
}

export function StudioBackgroundPanel({
  canvasW,
  canvasH,
  currentBg,
  currentBgGrad = null,
  onApply,
  sizeSlot,
  initialTab = "fill",
  className,
}: StudioBackgroundPanelProps): ReactElement {
  const [tab, setTab] = useState<StudioBackgroundEditorTab>(initialTab);
  const [category, setCategory] = useState<StudioBackgroundCategory>("solid");
  const [query, setQuery] = useState("");
  const [customColor, setCustomColor] = useState(currentBg || "#f7f1e6");
  const [recentIds, setRecentIds] = useState(
    () => loadStudioBackgroundRecent(globalThis.localStorage).ids
  );

  const items = listStudioBackgroundPresets(category, query);
  const recentItems = recentIds
    .map((id) => findStudioBackgroundPreset(id))
    .filter((p): p is StudioBackgroundPreset => Boolean(p));

  function pick(preset: StudioBackgroundPreset) {
    const next = pushStudioBackgroundRecent(globalThis.localStorage, preset.id);
    setRecentIds(next.ids);
    onApply(planStudioBackgroundApply(preset, canvasW, canvasH));
  }

  function pickCustom() {
    onApply({ kind: "solid", color: customColor, presetId: "custom-solid" });
  }

  return (
    <div className={cn("grid gap-2", className)} data-studio-background-panel="true">
      {/* Friendly header */}
      <div className="flex items-start gap-2 rounded-xl border border-line bg-card px-2.5 py-2">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          {tab === "size" ? <Maximize2 size={16} aria-hidden /> : <Droplets size={16} aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[0.75rem] font-bold text-fg">배경 편집기</p>
          <p className="text-[0.62rem] leading-snug text-fg-3">
            {tab === "size"
              ? "페이지 비율·높이를 바꿔 스토리·피드·웹툰 규격에 맞춰요."
              : "단색·그라데이션·패턴·분위기로 페이지 바탕을 고르세요."}
          </p>
        </div>
        <span
          className="size-8 shrink-0 rounded-lg border border-line shadow-inner"
          style={{ background: currentFillCss(currentBg, currentBgGrad) }}
          title="현재 배경"
          aria-label="현재 배경 미리보기"
        />
      </div>

      {/* Editor tabs */}
      <div
        className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-canvas/40 p-1"
        role="tablist"
        aria-label="배경 편집 구역"
      >
        {(
          [
            { id: "fill" as const, label: "채우기", Icon: Palette, title: "색·패턴·분위기" },
            { id: "size" as const, label: "크기 · 비율", Icon: Maximize2, title: "캔버스 리사이저" },
          ] as const
        ).map(({ id, label, Icon, title }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              title={title}
              onClick={() => setTab(id)}
              className={cn(
                "flex min-h-10 items-center justify-center gap-1.5 rounded-lg text-[0.72rem] font-bold",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
                active
                  ? "bg-accent text-on-accent shadow-sm"
                  : "text-fg-3 hover:bg-raised hover:text-fg"
              )}
            >
              <Icon size={14} aria-hidden />
              {label}
            </button>
          );
        })}
      </div>

      {tab === "size" ? (
        sizeSlot ?? (
          <div className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-fg-3">
            크기 조절 패널을 불러오는 중…
          </div>
        )
      ) : (
        <>
          {/* Custom + quick solids */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-card/80 p-2">
            <label className="flex items-center gap-1.5 text-[0.64rem] font-medium text-fg-2">
              <span>내 색</span>
              <input
                type="color"
                value={
                  customColor.startsWith("#") && customColor.length >= 7
                    ? customColor.slice(0, 7)
                    : "#f7f1e6"
                }
                onChange={(e) => setCustomColor(e.target.value)}
                className="h-9 w-11 cursor-pointer rounded-lg border border-line bg-transparent"
                aria-label="커스텀 배경색"
              />
            </label>
            <button
              type="button"
              onClick={pickCustom}
              className={cn(
                "min-h-9 rounded-lg border border-accent bg-accent-soft px-3 text-[0.68rem] font-bold text-accent",
                STUDIO_EASE,
                STUDIO_FOCUS_RING
              )}
            >
              적용
            </button>
            {(
              [
                { color: "#ffffff", label: "화이트", id: "s-white" },
                { color: "#f7f1e6", label: "원고지", id: "s-paper" },
                { color: "#1a1410", label: "잉크", id: "s-ink" },
                { color: "#c8e8ff", label: "하늘", id: "s-sky" },
              ] as const
            ).map((chip) => (
              <button
                key={chip.id}
                type="button"
                title={chip.label}
                aria-label={`${chip.label} 배경`}
                onClick={() => {
                  setCustomColor(chip.color);
                  onApply({ kind: "solid", color: chip.color, presetId: chip.id });
                }}
                className={cn(
                  "size-9 rounded-lg border border-line shadow-sm ring-offset-1 ring-offset-panel hover:ring-2 hover:ring-accent/50",
                  STUDIO_FOCUS_RING
                )}
                style={{ background: chip.color }}
              />
            ))}
          </div>

          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-3"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="배경 검색 (노을, 도트, 보케…)"
              className="min-h-10 w-full rounded-xl border border-line bg-card py-1.5 pl-9 pr-10 text-xs placeholder:text-fg-3 outline-none focus:border-accent focus:ring-1 focus:ring-accent/40"
              aria-label="배경 검색"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="검색어 지우기"
                className="absolute right-0 top-1/2 grid size-10 -translate-y-1/2 place-items-center text-fg-3 hover:bg-raised"
              >
                <X size={12} />
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-1" role="tablist" aria-label="배경 종류">
            {STUDIO_BACKGROUND_CATEGORY_CHIPS.map((chip) => {
              const Icon = CATEGORY_ICONS[chip.id] ?? Layers;
              const active = category === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setCategory(chip.id)}
                  className={cn(
                    "inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-[0.64rem] font-semibold",
                    STUDIO_EASE,
                    STUDIO_FOCUS_RING,
                    active
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg"
                  )}
                >
                  <Icon size={12} aria-hidden />
                  {chip.label}
                </button>
              );
            })}
          </div>

          {recentItems.length > 0 && !query ? (
            <>
              <p className="text-[0.64rem] font-semibold text-fg-2">최근 쓴 배경</p>
              <div className="grid grid-cols-4 gap-1.5">
                {recentItems.slice(0, 8).map((preset) => (
                  <button
                    key={`recent-${preset.id}`}
                    type="button"
                    title={preset.label}
                    onClick={() => pick(preset)}
                    className={cn(
                      "flex flex-col gap-0.5 rounded-xl border border-line bg-card p-1",
                      STUDIO_FOCUS_RING,
                      "hover:border-accent/45"
                    )}
                  >
                    <PreviewSwatch preset={preset} canvasW={canvasW} canvasH={canvasH} />
                    <span className="truncate text-center text-[0.52rem] text-fg-3">{preset.label}</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <p className="text-[0.64rem] font-semibold text-fg-2">
            {STUDIO_BACKGROUND_CATEGORY_CHIPS.find((c) => c.id === category)?.label ?? "배경"}
            <span className="ml-1 tabular-nums font-normal text-fg-3">({items.length})</span>
          </p>

          {items.length === 0 ? (
            <div className="flex h-28 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line px-3 text-center">
              <Sparkles size={16} className="text-fg-3" aria-hidden />
              <p className="text-xs font-medium text-fg-2">검색 결과가 없어요</p>
              <p className="text-[0.62rem] text-fg-3">다른 단어로 찾아보거나 분류를 「전체」로 바꿔 보세요.</p>
            </div>
          ) : (
            <div className="grid max-h-60 grid-cols-4 gap-1.5 overflow-y-auto pr-0.5">
              {items.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  title={preset.label}
                  onClick={() => pick(preset)}
                  data-studio-bg-preset={preset.id}
                  className={cn(
                    "flex flex-col gap-0.5 rounded-xl border border-line bg-card p-1",
                    STUDIO_EASE,
                    STUDIO_FOCUS_RING,
                    "hover:border-accent/50 hover:bg-raised"
                  )}
                >
                  <PreviewSwatch preset={preset} canvasW={canvasW} canvasH={canvasH} />
                  <span className="truncate text-center text-[0.52rem] font-semibold text-fg-2">
                    {preset.label}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
