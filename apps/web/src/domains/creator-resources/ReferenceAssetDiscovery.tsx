import {
  Download,
  Grid2X2,
  LayoutGrid,
  LibraryBig,
  ListFilter,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Link } from "react-router-dom";

import { RESOURCE_BUTTON, RESOURCE_INPUT } from "./navigation";

import type { ReferenceSearchState, ReferenceViewState } from "@/shared/lib/reference-assets";

import {
  MET_DEPARTMENTS,
  REFERENCE_LENSES,
  REFERENCE_MEDIUM_PRESETS,
  REFERENCE_SEARCH_FIELDS,
  referenceFacets,
  referenceSearchFromLens,
} from "@/shared/lib/reference-assets";

export interface RecentReferenceSearch {
  key: string;
  label: string;
  params: string;
}

export function SearchLensGrid({
  onSelect,
}: {
  onSelect: (search: ReferenceSearchState) => void;
}) {
  return (
    <section aria-labelledby="reference-lenses-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Curated lenses</p>
          <h2 id="reference-lenses-title" className="mt-1 text-xl font-bold text-fg">장면 목적에서 바로 탐색하기</h2>
        </div>
        <p className="max-w-xl text-sm leading-6 text-fg-2">
          막연한 키워드 대신 복식·공간·동세처럼 실제 컷 제작 목적에 맞춘 검색 조건을 시작점으로 사용합니다.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {REFERENCE_LENSES.map((lens, index) => (
          <button
            key={lens.id}
            type="button"
            onClick={() => onSelect(referenceSearchFromLens(lens))}
            className="group min-h-40 rounded-2xl border border-line bg-panel p-5 text-left transition hover:-translate-y-0.5 hover:border-accent/60 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span className="flex items-center justify-between">
              <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-sm font-bold text-accent">
                {String(index + 1).padStart(2, "0")}
              </span>
              <Search className="size-4 text-fg-3 transition group-hover:text-accent" aria-hidden="true" />
            </span>
            <strong className="mt-5 block text-base text-fg">{lens.title}</strong>
            <span className="mt-2 block text-sm leading-6 text-fg-2">{lens.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function SearchWorkspace({
  draft,
  setDraft,
  advancedOpen,
  setAdvancedOpen,
  recent,
  onSubmit,
  onResetFilters,
  onRecent,
  onClearRecent,
}: {
  draft: ReferenceSearchState;
  setDraft: React.Dispatch<React.SetStateAction<ReferenceSearchState>>;
  advancedOpen: boolean;
  setAdvancedOpen: React.Dispatch<React.SetStateAction<boolean>>;
  recent: RecentReferenceSearch[];
  onSubmit: () => void;
  onResetFilters: () => void;
  onRecent: (entry: RecentReferenceSearch) => void;
  onClearRecent: () => void;
}) {
  const activeAdvanced = [
    draft.field !== "all",
    draft.departmentId,
    draft.medium,
    draft.geoLocation,
    draft.dateBegin && draft.dateEnd,
    draft.highlightOnly,
  ].filter(Boolean).length;
  return (
    <section aria-labelledby="asset-search-title" className="overflow-hidden rounded-3xl border border-line bg-panel shadow-sm">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="space-y-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Reference search</p>
              <h2 id="asset-search-title" className="mt-1 text-xl font-bold text-fg">공개 미술 자료 검색</h2>
            </div>
            <button
              type="button"
              className={`${RESOURCE_BUTTON} gap-2`}
              aria-expanded={advancedOpen}
              aria-controls="reference-advanced-filters"
              onClick={() => setAdvancedOpen((open) => !open)}
            >
              <SlidersHorizontal size={16} aria-hidden="true" />
              상세 필터
              {activeAdvanced > 0 ? <span className="rounded-full bg-accent px-2 py-0.5 text-[0.68rem] text-white">{activeAdvanced}</span> : null}
            </button>
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_auto]">
            <label className="relative block">
              <span className="sr-only">레퍼런스 검색어</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-fg-3" aria-hidden="true" />
              <input
                className={`${RESOURCE_INPUT} min-h-14 rounded-2xl pl-12 pr-4 text-base`}
                type="search"
                required
                minLength={2}
                maxLength={80}
                autoComplete="off"
                value={draft.query}
                placeholder="예: hanbok, armor, interior, gesture, moonlight"
                onChange={(event) => setDraft((current) => ({ ...current, query: event.target.value }))}
              />
            </label>
            <label>
              <span className="sr-only">검색 범위</span>
              <select
                className={`${RESOURCE_INPUT} min-h-14 rounded-2xl`}
                value={draft.field}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  field: event.target.value as ReferenceSearchState["field"],
                }))}
              >
                {REFERENCE_SEARCH_FIELDS.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}
              </select>
            </label>
            <button type="submit" className={`${RESOURCE_BUTTON} min-h-14 gap-2 rounded-2xl border-accent bg-accent px-6 text-white hover:bg-accent/90`}>
              <Search size={17} aria-hidden="true" />
              레퍼런스 찾기
            </button>
          </div>
          {recent.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2" aria-label="최근 검색">
              <span className="text-xs font-semibold text-fg-3">최근</span>
              {recent.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className="min-h-9 max-w-full truncate rounded-full border border-line bg-canvas px-3 text-xs font-semibold text-fg-2 transition hover:border-accent/50 hover:text-accent"
                  onClick={() => onRecent(entry)}
                  title={entry.label}
                >
                  {entry.label}
                </button>
              ))}
              <button type="button" className="min-h-9 px-2 text-xs font-semibold text-fg-3 underline" onClick={onClearRecent}>지우기</button>
            </div>
          ) : null}
        </div>
        {advancedOpen ? (
          <div id="reference-advanced-filters" className="border-t border-line bg-raised/60 p-5 sm:p-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2 text-sm font-semibold text-fg">
                <span>큐레이터 부서</span>
                <select
                  className={RESOURCE_INPUT}
                  value={draft.departmentId}
                  onChange={(event) => setDraft((current) => ({ ...current, departmentId: event.target.value }))}
                >
                  <option value="">전체 부서</option>
                  {MET_DEPARTMENTS.map((department) => <option key={department.id} value={department.id}>{department.label}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm font-semibold text-fg">
                <span>재료·유형</span>
                <input
                  className={RESOURCE_INPUT}
                  list="reference-medium-presets"
                  maxLength={80}
                  value={draft.medium}
                  placeholder="예: Textiles, Ceramics"
                  onChange={(event) => setDraft((current) => ({ ...current, medium: event.target.value }))}
                />
                <datalist id="reference-medium-presets">
                  {REFERENCE_MEDIUM_PRESETS.map((medium) => <option key={medium} value={medium} />)}
                </datalist>
              </label>
              <label className="space-y-2 text-sm font-semibold text-fg">
                <span>지역</span>
                <input
                  className={RESOURCE_INPUT}
                  maxLength={80}
                  value={draft.geoLocation}
                  placeholder="예: Korea, France, China"
                  onChange={(event) => setDraft((current) => ({ ...current, geoLocation: event.target.value }))}
                />
              </label>
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold text-fg">제작 연대</legend>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <input
                    className={RESOURCE_INPUT}
                    inputMode="numeric"
                    aria-label="시작 연도"
                    placeholder="-100"
                    maxLength={6}
                    value={draft.dateBegin}
                    onChange={(event) => setDraft((current) => ({ ...current, dateBegin: event.target.value }))}
                  />
                  <span className="text-fg-3">–</span>
                  <input
                    className={RESOURCE_INPUT}
                    inputMode="numeric"
                    aria-label="종료 연도"
                    placeholder="1900"
                    maxLength={6}
                    value={draft.dateEnd}
                    onChange={(event) => setDraft((current) => ({ ...current, dateEnd: event.target.value }))}
                  />
                </div>
                <p className="text-xs font-normal leading-5 text-fg-3">기원전은 음수로 입력합니다.</p>
              </fieldset>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line bg-panel px-4 text-sm font-semibold text-fg">
                <input
                  type="checkbox"
                  checked={draft.highlightOnly}
                  onChange={(event) => setDraft((current) => ({ ...current, highlightOnly: event.target.checked }))}
                  className="size-4 accent-accent"
                />
                Met 대표작만 보기
              </label>
              <button type="button" className={`${RESOURCE_BUTTON} gap-2`} onClick={onResetFilters}>
                <RotateCcw size={15} aria-hidden="true" />
                상세 필터 초기화
              </button>
            </div>
          </div>
        ) : null}
      </form>
    </section>
  );
}

export function ResultControls({
  search,
  view,
  itemCount,
  total,
  savedCount,
  facets,
  onView,
  onExportMarkdown,
  onExportJson,
}: {
  search: ReferenceSearchState;
  view: ReferenceViewState;
  itemCount: number;
  total?: number;
  savedCount: number;
  facets: {
    departments: ReturnType<typeof referenceFacets>;
    cultures: ReturnType<typeof referenceFacets>;
    classifications: ReturnType<typeof referenceFacets>;
  };
  onView: (next: Partial<ReferenceViewState>) => void;
  onExportMarkdown: () => void;
  onExportJson: () => void;
}) {
  return (
    <section aria-labelledby="reference-results-title" className="space-y-4 rounded-2xl border border-line bg-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="reference-results-title" className="text-lg font-bold text-fg">
            {view.mode === "saved" ? "저장한 레퍼런스" : search.query ? `"${search.query}" 검색 결과` : "레퍼런스 작업 보드"}
          </h2>
          <p className="mt-1 text-xs leading-5 text-fg-3">
            {view.mode === "saved"
              ? `이 브라우저의 Met 저장 자료 ${savedCount}개`
              : `현재 페이지 검증 자료 ${itemCount}개${total !== undefined ? ` · 검색 후보 ${total.toLocaleString("ko-KR")}개` : ""}`}
          </p>
        </div>
        <div className="flex rounded-xl border border-line bg-canvas p-1" aria-label="자료 범위">
          <button
            type="button"
            aria-pressed={view.mode === "results"}
            onClick={() => onView({ mode: "results", department: "", culture: "", classification: "" })}
            className={`min-h-10 rounded-lg px-3 text-xs font-bold ${view.mode === "results" ? "bg-accent-soft text-accent" : "text-fg-2"}`}
          >
            검색 결과
          </button>
          <button
            type="button"
            aria-pressed={view.mode === "saved"}
            onClick={() => onView({ mode: "saved", department: "", culture: "", classification: "" })}
            className={`min-h-10 rounded-lg px-3 text-xs font-bold ${view.mode === "saved" ? "bg-accent-soft text-accent" : "text-fg-2"}`}
          >
            저장 자료 {savedCount}
          </button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(12rem,1.4fr)_repeat(3,minmax(9rem,1fr))_10rem]">
        <label className="relative block">
          <span className="sr-only">현재 결과 안에서 검색</span>
          <ListFilter className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden="true" />
          <input className={`${RESOURCE_INPUT} pl-9`} type="search" maxLength={80} value={view.within} placeholder="현재 결과 안에서 찾기" onChange={(event) => onView({ within: event.target.value })} />
        </label>
        <label>
          <span className="sr-only">부서 필터</span>
          <select className={RESOURCE_INPUT} value={view.department} onChange={(event) => onView({ department: event.target.value })}>
            <option value="">모든 부서</option>
            {facets.departments.map((facet) => <option key={facet.value} value={facet.value}>{facet.value} ({facet.count})</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">문화권 필터</span>
          <select className={RESOURCE_INPUT} value={view.culture} onChange={(event) => onView({ culture: event.target.value })}>
            <option value="">모든 문화권</option>
            {facets.cultures.map((facet) => <option key={facet.value} value={facet.value}>{facet.value} ({facet.count})</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">분류 필터</span>
          <select className={RESOURCE_INPUT} value={view.classification} onChange={(event) => onView({ classification: event.target.value })}>
            <option value="">모든 분류</option>
            {facets.classifications.map((facet) => <option key={facet.value} value={facet.value}>{facet.value} ({facet.count})</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">정렬</span>
          <select className={RESOURCE_INPUT} value={view.sort} onChange={(event) => onView({ sort: event.target.value as ReferenceViewState["sort"] })}>
            <option value="relevance">검색 순서</option>
            <option value="title">제목순</option>
            <option value="oldest">오래된 순</option>
            <option value="newest">최근 순</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-fg-3">보기</span>
          <button type="button" aria-label="여유 있는 카드 보기" aria-pressed={view.density === "comfortable"} onClick={() => onView({ density: "comfortable" })} className={`grid size-10 place-items-center rounded-xl border ${view.density === "comfortable" ? "border-accent bg-accent-soft text-accent" : "border-line text-fg-2"}`}>
            <Grid2X2 size={16} aria-hidden="true" />
          </button>
          <button type="button" aria-label="촘촘한 카드 보기" aria-pressed={view.density === "compact"} onClick={() => onView({ density: "compact" })} className={`grid size-10 place-items-center rounded-xl border ${view.density === "compact" ? "border-accent bg-accent-soft text-accent" : "border-line text-fg-2"}`}>
            <LayoutGrid size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${RESOURCE_BUTTON} gap-2`} disabled={savedCount === 0} onClick={onExportMarkdown}>
            <Download size={15} aria-hidden="true" /> 출처 MD
          </button>
          <button type="button" className={`${RESOURCE_BUTTON} gap-2`} disabled={savedCount === 0} onClick={onExportJson}>
            <Download size={15} aria-hidden="true" /> 보드 JSON
          </button>
          <Link className={`${RESOURCE_BUTTON} gap-2`} to="/research">
            <LibraryBig size={15} aria-hidden="true" /> 전체 연구 보드
          </Link>
        </div>
      </div>
    </section>
  );
}
