// 창작 갤러리의 보기 조절 줄 — 보기 탭, 정렬, 작품 유형·제작 방식·포트폴리오 필터, 적용된 필터 칩.
// 상태는 갖지 않고 주소 조건(GalleryView)과 변경 요청(onPatch)만 주고받는다.
import { Heart, X } from "lucide-react";
import { useRef, type KeyboardEvent, type ReactNode } from "react";

import {
  CONTENT_GROUP_LABEL,
  GALLERY_TABS,
  PROVENANCE_FILTER_LABEL,
  SORTS,
  TABPANEL_ID,
  galleryTabId,
  hasActiveFilters,
  type Bilingual,
  type GalleryView,
  type WorksQuery,
} from "./gallery-query";
import type { ShowcaseGalleryTab } from "./showcase-links";

import {
  CREATOR_COMMUNITY_CONTENT_GROUPS,
  CREATOR_COMMUNITY_PROVENANCES,
} from "@/shared/lib/creator-community-publication-contract";
import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import type { WorkSort } from "@/platform/creator-client";

const CHIP_FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** 보기 탭 — WAI-ARIA 탭 패턴(←/→/Home/End로 이동, 선택된 탭만 Tab 순서에 포함). */
function GalleryTabs({ value, onChange }: { value: ShowcaseGalleryTab; onChange: (tab: ShowcaseGalleryTab) => void }) {
  const bt = useBilingual("CreateGalleryPage");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = GALLERY_TABS.length - 1;
    const next = event.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
        : event.key === "Home" ? 0
          : event.key === "End" ? last
            : null;
    if (next === null) return;
    event.preventDefault();
    const target = GALLERY_TABS[next];
    if (!target) return;
    onChange(target.value);
    tabRefs.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label={bt("작품 보기", "Browse works")} className="grid grid-cols-4 gap-1 rounded-2xl border border-line bg-canvas/50 p-1 sm:inline-flex">
      {GALLERY_TABS.map((option, index) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            id={galleryTabId(option.value)}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={TABPANEL_ID}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => moveFocus(event, index)}
            className={cn(
              // 모바일은 4칸 균등(아이콘 위·라벨 아래), sm 이상은 한 줄 알약 탭.
              "inline-flex min-h-14 flex-col items-center justify-center gap-0.5 whitespace-nowrap rounded-xl px-1 text-sm font-semibold transition-colors duration-150 sm:min-h-11 sm:flex-row sm:gap-1.5 sm:px-3.5 sm:font-medium",
              CHIP_FOCUS,
              active ? "bg-accent text-on-accent shadow-md shadow-accent/25" : "text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            <Icon size={15} aria-hidden />
            {bt(option.ko, option.en)}
          </button>
        );
      })}
    </div>
  );
}

function SortControl({ value, onChange }: { value: WorkSort; onChange: (sort: WorkSort) => void }) {
  const bt = useBilingual("CreateGalleryPage");
  return (
    <div role="group" aria-label={bt("정렬", "Sort")} className="inline-flex shrink-0 items-center gap-1 rounded-2xl border border-line bg-canvas/50 p-1">
      {SORTS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex min-h-11 items-center gap-1 whitespace-nowrap rounded-xl px-3 text-sm transition-colors duration-150",
              CHIP_FOCUS,
              active ? "bg-raised font-semibold text-fg shadow-sm" : "text-fg-3 hover:text-fg",
            )}
          >
            {option.value === "likes" ? <Heart size={13} aria-hidden /> : null}
            {bt(option.ko, option.en)}
          </button>
        );
      })}
    </div>
  );
}

function FilterChip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "min-h-11 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors",
        CHIP_FOCUS,
        pressed ? "border-accent/60 bg-accent-soft text-fg" : "border-line bg-card text-fg-2 hover:bg-raised",
      )}
    >
      {children}
    </button>
  );
}

function ActiveFilterChip({ label, clearLabel, onClear }: { label: string; clearLabel: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      aria-label={clearLabel}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-accent/50 bg-accent-soft px-3.5 text-sm font-medium text-fg transition-colors hover:bg-accent-soft/70 active:scale-[0.96]",
        CHIP_FOCUS,
      )}
    >
      {label}
      <X size={13} aria-hidden />
    </button>
  );
}

type FilterKey = "tag" | "content" | "provenance" | "portfolio";

function ActiveFilters({ query, bt, onClear, onClearAll }: {
  query: WorksQuery;
  bt: Bilingual;
  onClear: (key: FilterKey) => void;
  onClearAll: () => void;
}) {
  if (!hasActiveFilters(query)) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line/70 pt-3" aria-label={bt("적용된 필터", "Active filters")} role="group">
      <span className="mr-1 text-sm font-medium text-fg-2">{bt("적용된 필터", "Active filters")}</span>
      {query.tag ? (
        <ActiveFilterChip
          label={`#${query.tag}`}
          clearLabel={formatI18nTemplate(bt("#{tag} 태그 필터 해제", "Clear #{tag} tag filter"), { tag: query.tag })}
          onClear={() => onClear("tag")}
        />
      ) : null}
      {query.contentType !== "all" ? (
        <ActiveFilterChip
          label={bt(...CONTENT_GROUP_LABEL[query.contentType])}
          clearLabel={bt("작품 유형 필터 해제", "Clear content type filter")}
          onClear={() => onClear("content")}
        />
      ) : null}
      {query.provenance ? (
        <ActiveFilterChip
          label={bt(...PROVENANCE_FILTER_LABEL[query.provenance])}
          clearLabel={bt("제작 방식 필터 해제", "Clear production method filter")}
          onClear={() => onClear("provenance")}
        />
      ) : null}
      {query.portfolio ? (
        <ActiveFilterChip
          label={bt("대표 포트폴리오·전시", "Featured portfolio & exhibits")}
          clearLabel={bt("포트폴리오 필터 해제", "Clear portfolio filter")}
          onClear={() => onClear("portfolio")}
        />
      ) : null}
      <button
        type="button"
        onClick={onClearAll}
        className={cn("ml-auto min-h-11 rounded-full px-3 text-sm font-medium text-accent underline-offset-4 hover:underline", CHIP_FOCUS)}
      >
        {bt("필터 모두 지우기", "Clear all filters")}
      </button>
    </div>
  );
}

/**
 * 갤러리 상단 조절 상자: 보기 탭 → (정렬 + 작품 유형 필터) 한 줄 → 적용된 필터.
 * 좁은 화면에서는 정렬·필터를 한 줄 가로 레일로 두어 여러 줄로 쌓이지 않게 한다.
 * 팔로잉 탭은 정렬이 없고, 필터는 전체 작품 탭에만 있다(북마크는 내 목록이라 조건을 두지 않는다).
 */
export function GalleryToolbar({ view, onPatch }: {
  readonly view: GalleryView;
  /** 주소 조건을 바꾼다. 값이 null이면 그 조건을 지운다. */
  readonly onPatch: (patch: Readonly<Record<string, string | null>>) => void;
}) {
  const bt = useBilingual("CreateGalleryPage");
  const { tab, query } = view;
  const showSort = tab !== "following";
  const showWorkFilters = tab === "works";

  return (
    <div className="mb-6 space-y-3 rounded-2xl border border-line bg-panel p-3 sm:p-4">
      <GalleryTabs value={tab} onChange={(next) => onPatch({ tab: next === "works" ? null : next })} />

      {showSort || showWorkFilters ? (
        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          {showSort ? (
            <SortControl value={query.sort} onChange={(next) => onPatch({ sort: next === "recent" ? null : next })} />
          ) : null}
          {showWorkFilters ? (
            <>
              <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-line" />
              <div role="group" aria-label={bt("작품 유형", "Content type")} className="flex shrink-0 items-center gap-2">
                {CREATOR_COMMUNITY_CONTENT_GROUPS.map((group) => (
                  <FilterChip
                    key={group}
                    pressed={query.contentType === group}
                    onClick={() => onPatch({ content: group === "all" ? null : group })}
                  >
                    {bt(...CONTENT_GROUP_LABEL[group])}
                  </FilterChip>
                ))}
              </div>
              <select
                value={query.provenance ?? ""}
                onChange={(event) => onPatch({ provenance: event.target.value || null })}
                aria-label={bt("제작 방식 필터", "Production method filter")}
                className={cn("min-h-11 shrink-0 rounded-full border border-line bg-card px-3 text-sm text-fg-2", CHIP_FOCUS)}
              >
                <option value="">{bt("모든 제작 방식", "All production methods")}</option>
                {CREATOR_COMMUNITY_PROVENANCES.map((value) => (
                  <option key={value} value={value}>{bt(...PROVENANCE_FILTER_LABEL[value])}</option>
                ))}
              </select>
              <FilterChip pressed={query.portfolio} onClick={() => onPatch({ portfolio: query.portfolio ? null : "1" })}>
                {bt("대표 포트폴리오·전시", "Featured portfolio & exhibits")}
              </FilterChip>
            </>
          ) : null}
        </div>
      ) : null}

      {showWorkFilters ? (
        <ActiveFilters
          query={query}
          bt={bt}
          onClear={(key) => onPatch({ [key]: null })}
          onClearAll={() => onPatch({ tag: null, content: null, provenance: null, portfolio: null })}
        />
      ) : null}
    </div>
  );
}
