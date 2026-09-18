import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { Grid2x2, LayoutGrid, List, Star } from "lucide-react";

import type { StudioCatalogOrientation, StudioCatalogSort, StudioCatalogView } from "./studio-catalog-query";

export const STUDIO_CATALOG_CONTROL = "min-h-11 min-w-0 rounded-lg border border-line bg-card px-2 text-xs text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent hover:bg-raised aria-pressed:border-accent aria-pressed:text-accent";

export const STUDIO_CATALOG_PRIMARY_CONTROL = "min-h-11 min-w-0 rounded-lg border border-accent bg-accent px-2 text-xs text-on-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent hover:opacity-90 aria-pressed:border-accent aria-pressed:text-accent";

export function StudioCatalogControls({
  view, onView, sort, onSort, favoritesOnly, onFavoritesOnly, favoriteCount,
  orientation, onOrientation,
}: {
  view: StudioCatalogView; onView: (value: StudioCatalogView) => void;
  sort: StudioCatalogSort; onSort: (value: StudioCatalogSort) => void;
  favoritesOnly: boolean; onFavoritesOnly: (value: boolean) => void; favoriteCount: number;
  orientation?: StudioCatalogOrientation; onOrientation?: (value: StudioCatalogOrientation) => void;
}) {
  return <div className="grid min-w-0 gap-2" data-studio-catalog-controls="true">
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <button type="button" aria-label={translateCurrentStaticSourceText("domains.creator.catalog.StudioCatalogControls", "ko", "즐겨찾기만 표시")} aria-pressed={favoritesOnly} onClick={() => onFavoritesOnly(!favoritesOnly)}
        className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.catalog.StudioCatalogControls", "en", "{v0} inline-flex flex-1 items-center justify-center gap-1.5 {v1}"), { v0: String(STUDIO_CATALOG_CONTROL), v1: String(favoritesOnly ? "border-accent text-accent" : "") })}>
        <Star size={14} aria-hidden fill={favoritesOnly ? translateCurrentStaticSourceText("domains.creator.catalog.StudioCatalogControls", "en", "currentColor") : translateCurrentStaticSourceText("domains.creator.catalog.StudioCatalogControls", "en", "none")} />{translateCurrentStaticSourceText("domains.creator.catalog.StudioCatalogControls", "ko", "즐겨찾기 ")}<span className="tabular-nums">{favoriteCount}</span>
      </button>
      <div role="group" aria-label={translateCurrentStaticSourceText("domains.creator.catalog.StudioCatalogControls", "ko", "카탈로그 보기")} className="flex shrink-0 gap-1">
        {([
          ["comfortable", "큰 미리보기", LayoutGrid], ["compact", "작은 미리보기", Grid2x2], ["list", "목록 보기", List],
        ] as const).map(([value, label, Icon]) => <button key={value} type="button" title={label} aria-label={label}
          aria-pressed={view === value} onClick={() => onView(value)}
          className={`${STUDIO_CATALOG_CONTROL} w-11 ${view === value ? "border-accent text-accent" : ""}`}><Icon size={16} className="mx-auto" aria-hidden /></button>)}
      </div>
    </div>
    <div className={onOrientation ? translateCurrentStaticSourceText("domains.creator.catalog.StudioCatalogControls", "en", "grid grid-cols-2 gap-2") : translateCurrentStaticSourceText("domains.creator.catalog.StudioCatalogControls", "en", "grid")}>
      <label className="grid min-w-0 gap-1 text-[0.65rem] text-fg-3">{translateCurrentStaticSourceText("domains.creator.catalog.StudioCatalogControls", "ko", "정렬")}<select aria-label={translateCurrentStaticSourceText("domains.creator.catalog.StudioCatalogControls", "ko", "소재 정렬")} value={sort} onChange={(event) => onSort(event.target.value as StudioCatalogSort)} className={STUDIO_CATALOG_CONTROL}>
          <option value="relevance">{translateCurrentStaticSourceText("domains.creator.catalog.StudioCatalogControls", "ko", "관련도순")}</option><option value="name">{translateCurrentStaticSourceText("domains.creator.catalog.StudioCatalogControls", "ko", "이름순")}</option><option value="recent">{translateCurrentStaticSourceText("domains.creator.catalog.StudioCatalogControls", "ko", "최근 사용순")}</option>
        </select>
      </label>
      {onOrientation && <label className="grid min-w-0 gap-1 text-[0.65rem] text-fg-3">{translateCurrentStaticSourceText("domains.creator.catalog.StudioCatalogControls", "ko", "형태")}<select aria-label={translateCurrentStaticSourceText("domains.creator.catalog.StudioCatalogControls", "ko", "소재 형태")} value={orientation} onChange={(event) => onOrientation(event.target.value as StudioCatalogOrientation)} className={STUDIO_CATALOG_CONTROL}>
          <option value="all">{translateCurrentStaticSourceText("domains.creator.catalog.StudioCatalogControls", "ko", "모든 비율")}</option><option value="portrait">{translateCurrentStaticSourceText("domains.creator.catalog.StudioCatalogControls", "ko", "세로형")}</option><option value="landscape">{translateCurrentStaticSourceText("domains.creator.catalog.StudioCatalogControls", "ko", "가로형")}</option><option value="square">{translateCurrentStaticSourceText("domains.creator.catalog.StudioCatalogControls", "ko", "정사각형")}</option>
        </select>
      </label>}
    </div>
  </div>;
}

export function StudioCatalogStorageNotice({ authority, onRetry }: {
  authority: "loading" | "sqlite-opfs" | "memory-only"; onRetry: () => void;
}) {
  return authority === "memory-only" ? <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs text-fg-2">
    <span className="min-w-0 flex-1">{translateCurrentStaticSourceText("domains.creator.catalog.StudioCatalogControls", "ko", "즐겨찾기·보기 설정은 아직 저장되지 않았습니다. 이번 화면에서만 유지됩니다.")}</span>
    <button type="button" className={STUDIO_CATALOG_CONTROL} onClick={onRetry}>{translateCurrentStaticSourceText("domains.creator.catalog.StudioCatalogControls", "ko", "저장 다시 시도")}</button>
  </div> : null;
}
