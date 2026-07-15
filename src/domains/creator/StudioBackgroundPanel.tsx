/**
 * StudioBackgroundPanel — PicsArt-class page background picker.
 * Solid · gradient · pattern · atmosphere + search + recent + custom color.
 */
import { Droplets, Search, X } from "lucide-react";
import { useState, type ReactElement } from "react";

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

export interface StudioBackgroundPanelProps {
  canvasW: number;
  canvasH: number;
  currentBg: string;
  onApply: (payload: StudioBackgroundApply) => void;
  className?: string;
}

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

export function StudioBackgroundPanel({
  canvasW,
  canvasH,
  currentBg,
  onApply,
  className,
}: StudioBackgroundPanelProps): ReactElement {
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
      <div className="flex items-start gap-2 rounded-lg border border-line bg-card px-2 py-1.5">
        <Droplets size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0">
          <p className="text-[0.72rem] font-semibold text-fg">배경 채우기</p>
          <p className="text-[0.62rem] leading-snug text-fg-3">
            단색·그라데이션·패턴·분위기 배경. PicsArt·Canva급 페이지 필 프리셋입니다.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-card/80 p-2">
        <label className="flex items-center gap-1.5 text-[0.64rem] text-fg-2">
          <span>커스텀</span>
          <input
            type="color"
            value={customColor.startsWith("#") && customColor.length >= 7 ? customColor.slice(0, 7) : "#f7f1e6"}
            onChange={(e) => setCustomColor(e.target.value)}
            className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent"
            aria-label="커스텀 배경색"
          />
        </label>
        <button
          type="button"
          onClick={pickCustom}
          className={cn(
            "min-h-8 rounded-md border border-accent bg-accent-soft px-2.5 text-[0.64rem] font-semibold text-accent",
            STUDIO_EASE,
            STUDIO_FOCUS_RING
          )}
        >
          단색 적용
        </button>
        <button
          type="button"
          onClick={() => {
            setCustomColor("#ffffff");
            onApply({ kind: "solid", color: "#ffffff", presetId: "s-white" });
          }}
          className="min-h-8 rounded-md border border-line px-2 text-[0.62rem] text-fg-3 hover:bg-raised"
        >
          화이트
        </button>
        <button
          type="button"
          onClick={() => {
            setCustomColor("#1a1410");
            onApply({ kind: "solid", color: "#1a1410", presetId: "s-ink" });
          }}
          className="min-h-8 rounded-md border border-line px-2 text-[0.62rem] text-fg-3 hover:bg-raised"
        >
          잉크
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-3" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="배경 검색 (노을, 도트, 보케…)"
          className="min-h-10 w-full rounded-lg border border-line bg-card py-1 pl-8 pr-10 text-xs placeholder:text-fg-3 outline-none focus:border-accent focus:ring-1 focus:ring-accent/40"
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
        {STUDIO_BACKGROUND_CATEGORY_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            role="tab"
            aria-selected={category === chip.id}
            onClick={() => setCategory(chip.id)}
            className={cn(
              "min-h-8 rounded-full border px-2 text-[0.64rem] font-medium",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
              category === chip.id
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-card text-fg-3 hover:bg-raised"
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {recentItems.length > 0 && !query ? (
        <>
          <p className="text-[0.64rem] font-medium text-fg-3">최근</p>
          <div className="grid grid-cols-4 gap-1.5">
            {recentItems.slice(0, 8).map((preset) => (
              <button
                key={`recent-${preset.id}`}
                type="button"
                title={preset.label}
                onClick={() => pick(preset)}
                className={cn(
                  "flex flex-col gap-0.5 rounded-lg border border-line bg-card p-1",
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

      <p className="text-[0.64rem] font-medium text-fg-3">
        {STUDIO_BACKGROUND_CATEGORY_CHIPS.find((c) => c.id === category)?.label ?? "배경"}
        <span className="ml-1 tabular-nums opacity-70">({items.length})</span>
      </p>

      {items.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-line text-xs text-fg-3">
          검색 결과가 없습니다.
        </div>
      ) : (
        <div className="grid max-h-64 grid-cols-4 gap-1.5 overflow-y-auto pr-0.5">
          {items.map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={preset.label}
              onClick={() => pick(preset)}
              data-studio-bg-preset={preset.id}
              className={cn(
                "flex flex-col gap-0.5 rounded-lg border border-line bg-card p-1",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
                "hover:border-accent/50 hover:bg-raised"
              )}
            >
              <PreviewSwatch preset={preset} canvasW={canvasW} canvasH={canvasH} />
              <span className="truncate text-center text-[0.52rem] font-medium text-fg-2">
                {preset.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
