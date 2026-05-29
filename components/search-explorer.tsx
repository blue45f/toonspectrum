"use client";

import { useMemo, useState } from "react";
import { TITLES, activeTags } from "@/lib/data";
import { searchTitles, type SearchFilters, type SortKey } from "@/lib/search";
import type { WorkType, SerialStatus, AgeRating, PlatformId } from "@/lib/types";
import { GENRES, STATUS_LABEL, AGE_LABEL } from "@/lib/taxonomy";
import { PLATFORM_LIST } from "@/lib/platforms";
import { TitleCard, TitleRow } from "./title-card";
import { GenreChip } from "./ui/chip";
import { cn } from "@/lib/utils";
import { Search, SlidersHorizontal, X, LayoutGrid, List, Gift, Link2 } from "lucide-react";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "relevance", label: "관련도순" },
  { value: "rating", label: "평점순" },
  { value: "popular", label: "인기순" },
  { value: "trending", label: "급상승순" },
  { value: "bookmarks", label: "관심순" },
  { value: "completion", label: "완독률순" },
  { value: "newest", label: "최신순" },
  { value: "title", label: "가나다순" },
];

const YEAR_RANGES: { label: string; range: [number, number] | null }[] = [
  { label: "전체", range: null },
  { label: "2022+", range: [2022, 9999] },
  { label: "2018-21", range: [2018, 2021] },
  { label: "2014-17", range: [2014, 2017] },
  { label: "~2013", range: [0, 2013] },
];

const TOP_TAGS = activeTags()
  .slice(0, 18)
  .map((t) => t.tag);

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function FacetGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line py-4 last:border-0">
      <h3 className="eyebrow mb-3 text-fg-3">{title}</h3>
      {children}
    </div>
  );
}

export function SearchExplorer({
  initialQuery = "",
  initialFree = false,
}: {
  initialQuery?: string;
  initialFree?: boolean;
}) {
  const [q, setQ] = useState(initialQuery);
  const [types, setTypes] = useState<WorkType[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [status, setStatus] = useState<SerialStatus[]>([]);
  const [platforms, setPlatforms] = useState<PlatformId[]>([]);
  const [ages, setAges] = useState<AgeRating[]>([]);
  const [minRating, setMinRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [yearRange, setYearRange] = useState<[number, number] | null>(null);
  const [freeOnly, setFreeOnly] = useState(initialFree);
  const [adaptedOnly, setAdaptedOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>(initialQuery ? "relevance" : "popular");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(24);

  const results = useMemo(() => {
    const filters: SearchFilters = {
      q,
      types: types.length ? types : undefined,
      genres: genres.length ? genres : undefined,
      tags: tags.length ? tags : undefined,
      status: status.length ? status : undefined,
      platforms: platforms.length ? platforms : undefined,
      ageRatings: ages.length ? ages : undefined,
      minRating: minRating || undefined,
      yearMin: yearRange?.[0],
      yearMax: yearRange?.[1],
      freeOnly,
      adaptedOnly,
    };
    return searchTitles(TITLES, filters, sort);
  }, [q, types, genres, tags, status, platforms, ages, minRating, yearRange, freeOnly, adaptedOnly, sort]);

  // 필터/정렬이 바뀌면 페이지네이션 리셋 (렌더 중 파생 상태 조정 패턴)
  const [prevResults, setPrevResults] = useState(results);
  if (prevResults !== results) {
    setPrevResults(results);
    setLimit(24);
  }

  const shown = results.slice(0, limit);
  const typeCount = {
    webtoon: results.filter((t) => t.type === "webtoon").length,
    webnovel: results.filter((t) => t.type === "webnovel").length,
  };

  const activeCount =
    types.length +
    genres.length +
    tags.length +
    status.length +
    platforms.length +
    ages.length +
    (minRating ? 1 : 0) +
    (yearRange ? 1 : 0) +
    (freeOnly ? 1 : 0) +
    (adaptedOnly ? 1 : 0);

  const reset = () => {
    setTypes([]);
    setGenres([]);
    setTags([]);
    setYearRange(null);
    setStatus([]);
    setPlatforms([]);
    setAges([]);
    setMinRating(0);
    setFreeOnly(false);
    setAdaptedOnly(false);
  };

  const facets = (
    <div className="flex flex-col">
      <FacetGroup title="유형">
        <div className="flex gap-1.5">
          {(["webtoon", "webnovel"] as WorkType[]).map((t) => (
            <button
              key={t}
              onClick={() => setTypes((p) => toggle(p, t))}
              className={cn(
                "flex-1 rounded-lg border py-2 text-sm font-medium transition-colors",
                types.includes(t)
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2 hover:text-fg"
              )}
            >
              {t === "webtoon" ? "웹툰" : "웹소설"}
            </button>
          ))}
        </div>
      </FacetGroup>

      <FacetGroup title="장르">
        <div className="flex flex-wrap gap-1.5">
          {GENRES.map((g) => (
            <button key={g} onClick={() => setGenres((p) => toggle(p, g))}>
              <GenreChip genre={g} active={genres.includes(g)} size="sm" />
            </button>
          ))}
        </div>
      </FacetGroup>

      <FacetGroup title="태그">
        <div className="flex flex-wrap gap-1.5">
          {TOP_TAGS.map((t) => (
            <button
              key={t}
              onClick={() => setTags((p) => toggle(p, t))}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                tags.includes(t)
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-line bg-raised/50 text-fg-3 hover:text-fg"
              )}
            >
              #{t}
            </button>
          ))}
        </div>
      </FacetGroup>

      <FacetGroup title="연재 연도">
        <div className="flex flex-wrap gap-1.5">
          {YEAR_RANGES.map((y) => {
            const on =
              (y.range === null && !yearRange) ||
              (y.range && yearRange && y.range[0] === yearRange[0] && y.range[1] === yearRange[1]);
            return (
              <button
                key={y.label}
                onClick={() => setYearRange(y.range)}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                  on
                    ? "border-accent/50 bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2 hover:text-fg"
                )}
              >
                {y.label}
              </button>
            );
          })}
        </div>
      </FacetGroup>

      <FacetGroup title="연재 상태">
        <div className="flex flex-wrap gap-1.5">
          {(["ongoing", "completed", "hiatus"] as SerialStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus((p) => toggle(p, s))}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                status.includes(s)
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2 hover:text-fg"
              )}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </FacetGroup>

      <FacetGroup title="플랫폼">
        <div className="flex flex-col gap-1">
          {PLATFORM_LIST.map((p) => (
            <button
              key={p.id}
              onClick={() => setPlatforms((prev) => toggle(prev, p.id))}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                platforms.includes(p.id)
                  ? "bg-accent-soft text-accent"
                  : "text-fg-2 hover:bg-raised hover:text-fg"
              )}
            >
              <span className="size-2.5 rounded-full" style={{ backgroundColor: p.color }} />
              {p.name}
            </button>
          ))}
        </div>
      </FacetGroup>

      <FacetGroup title="최소 평점">
        <div className="flex gap-1.5">
          {[0, 3, 4, 4.5].map((r) => (
            <button
              key={r}
              onClick={() => setMinRating(r)}
              className={cn(
                "flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors",
                minRating === r
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2 hover:text-fg"
              )}
            >
              {r === 0 ? "전체" : `${r}★+`}
            </button>
          ))}
        </div>
      </FacetGroup>

      <FacetGroup title="이용가">
        <div className="flex flex-wrap gap-1.5">
          {(["all", "12", "15", "19"] as AgeRating[]).map((a) => (
            <button
              key={a}
              onClick={() => setAges((p) => toggle(p, a))}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                ages.includes(a)
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2 hover:text-fg"
              )}
            >
              {AGE_LABEL[a]}
            </button>
          ))}
        </div>
      </FacetGroup>

      <FacetGroup title="옵션">
        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => setFreeOnly((v) => !v)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              freeOnly
                ? "border-good/40 bg-[oklch(0.8_0.15_150/0.12)] text-good"
                : "border-line bg-card text-fg-2 hover:text-fg"
            )}
          >
            <Gift size={15} /> 무료·기다무만
          </button>
          <button
            onClick={() => setAdaptedOnly((v) => !v)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              adaptedOnly
                ? "border-accent/50 bg-accent-soft text-accent"
                : "border-line bg-card text-fg-2 hover:text-fg"
            )}
          >
            <Link2 size={15} /> 원작·2차창작 연결
          </button>
        </div>
      </FacetGroup>
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      {/* 사이드 패싯 (데스크탑) */}
      <aside className="hidden lg:block">
        <div className="sticky top-20 rounded-2xl border border-line bg-panel/40 px-4">
          <div className="flex items-center justify-between border-b border-line py-3.5">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <SlidersHorizontal size={15} /> 필터
              {activeCount > 0 && (
                <span className="numeral rounded-full bg-accent px-1.5 text-[0.7rem] text-on-accent">
                  {activeCount}
                </span>
              )}
            </span>
            {activeCount > 0 && (
              <button onClick={reset} className="text-xs text-fg-3 hover:text-accent">
                초기화
              </button>
            )}
          </div>
          {facets}
        </div>
      </aside>

      <div>
        {/* 검색 입력 */}
        <div className="flex items-center gap-2 rounded-2xl border border-line bg-card px-4 focus-within:border-accent/50">
          <Search size={18} className="text-fg-3" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (e.target.value && sort === "popular") setSort("relevance");
            }}
            placeholder="작품, 작가, 태그를 검색하세요"
            className="h-12 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3"
          />
          {q && (
            <button onClick={() => setQ("")} className="text-fg-3 hover:text-fg">
              <X size={16} />
            </button>
          )}
        </div>

        {/* 결과 헤더 */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-fg-2">
            <span className="numeral text-fg">{results.length}</span>편
            {results.length > 0 && (
              <span className="text-fg-3">
                {" "}· 웹툰 {typeCount.webtoon} · 웹소설 {typeCount.webnovel}
              </span>
            )}
            {q && <span className="text-fg-3"> · {`'${q}'`}</span>}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-medium text-fg-2 lg:hidden"
            >
              <SlidersHorizontal size={14} /> 필터
              {activeCount > 0 && <span className="text-accent">{activeCount}</span>}
            </button>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-8 rounded-lg border border-line bg-card px-2.5 text-[0.8125rem] text-fg-2 outline-none transition-colors focus:border-accent/50"
              aria-label="정렬"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <div className="hidden rounded-lg border border-line bg-card p-0.5 sm:flex">
              {(["grid", "list"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "grid size-7 place-items-center rounded-md transition-colors",
                    view === v ? "bg-raised text-fg" : "text-fg-3"
                  )}
                >
                  {v === "grid" ? <LayoutGrid size={14} /> : <List size={14} />}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 모바일 필터 패널 */}
        {showFilters && (
          <div className="mt-3 rounded-2xl border border-line bg-panel/40 px-4 lg:hidden">
            <div className="flex items-center justify-between border-b border-line py-3">
              <span className="text-sm font-semibold">필터</span>
              {activeCount > 0 && (
                <button onClick={reset} className="text-xs text-accent">
                  초기화
                </button>
              )}
            </div>
            {facets}
          </div>
        )}

        {/* 결과 */}
        {results.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-line bg-card/40 p-12 text-center">
            <p className="text-sm text-fg-2">조건에 맞는 작품이 없어요.</p>
            <button onClick={reset} className="mt-2 text-sm text-accent hover:underline">
              필터 초기화하기
            </button>
          </div>
        ) : (
          <>
            {view === "grid" ? (
              <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
                {shown.map((t) => (
                  <TitleCard key={t.id} title={t} />
                ))}
              </div>
            ) : (
              <div className="mt-5 flex flex-col gap-2.5">
                {shown.map((t) => (
                  <TitleRow key={t.id} title={t} />
                ))}
              </div>
            )}
            {shown.length < results.length && (
              <div className="mt-8 flex justify-center">
                <button
                  onClick={() => setLimit((l) => l + 24)}
                  className="rounded-xl border border-line bg-card px-5 py-2.5 text-sm font-medium text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
                >
                  더 보기 <span className="text-fg-3">({results.length - shown.length}개 더)</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
