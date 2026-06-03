"use client";

import { useEffect, useMemo, useState } from "react";
import type { SortKey } from "@/lib/search";
import type { WorkType, SerialStatus, AgeRating, PlatformId, Title } from "@/lib/types";
import { GENRES, STATUS_LABEL, AGE_LABEL } from "@/lib/taxonomy";
import { PLATFORM_LIST } from "@/lib/platforms";
import { Segmented } from "./ui/segmented";
import { GenreChip, TagChip } from "./ui/chip";
import { buttonClass } from "./ui/button";
import { cn } from "@/lib/utils";
import { useSavedTitleIds } from "@/lib/store";
import {
  Search,
  SlidersHorizontal,
  X,
  LayoutGrid,
  List,
  Gift,
  Link2,
  AlertTriangle,
  RefreshCw,
  Database,
  Clock3,
  Bookmark,
} from "lucide-react";
import { TitleCard, TitleRow } from "./title-card";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "relevance", label: "관련도" },
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

const RATING_OPTIONS = [0, 3, 4, 4.5] as const;
const AGE_OPTIONS: AgeRating[] = ["all", "12", "15", "19"];
const WORK_TYPES = ["webtoon", "webnovel"] as const;
const STATUS_OPTIONS = ["ongoing", "completed", "hiatus"] as const;

function toggle<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((entry) => entry !== value) : [...arr, value];
}

type FilterToken = { key: string; label: string; category: string };
type PlatformCoverage = { id: PlatformId; count: number; share: number };
type SearchCatalogMeta = {
  source: string;
  sourceVersion?: string;
  loadedAt: string;
  titleCount: number;
  seedFallback?: boolean;
  platformCoverage: PlatformCoverage[];
  filteredPlatformCoverage: PlatformCoverage[];
};

function facetClass(active: boolean) {
  return cn(
    "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
    active
      ? "border-accent/60 bg-accent-soft text-accent"
      : "border-line bg-card text-fg-2 hover:text-fg hover:border-line-strong"
  );
}

function tinyPill(active: boolean) {
  return cn(
    "rounded-full border px-2.5 py-1 text-[0.72rem] font-medium transition-colors",
    active
      ? "border-accent/55 bg-accent-soft text-accent"
      : "border-line bg-card text-fg-3 hover:text-fg hover:border-line-strong"
  );
}

function FacetGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line py-3.5 last:border-0">
      <p className="eyebrow mb-2.5 text-fg-3">{title}</p>
      {children}
    </section>
  );
}

function compactNumber(value: number) {
  return value.toLocaleString("ko-KR");
}

function relativeTime(value?: string) {
  if (!value) return "갱신 정보 없음";
  const elapsed = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(elapsed)) return "갱신 정보 없음";
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return "방금 갱신";
  if (minutes < 60) return `${minutes}분 전 갱신`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전 갱신`;
  return `${Math.floor(hours / 24)}일 전 갱신`;
}

function platformName(id: PlatformId) {
  return PLATFORM_LIST.find((platform) => platform.id === id)?.short ?? id;
}

function platformColor(id: PlatformId) {
  return PLATFORM_LIST.find((platform) => platform.id === id)?.color ?? "#888";
}

export function SearchExplorer({
  initialQuery = "",
  initialFree = false,
  initialPlatforms = [],
}: {
  initialQuery?: string;
  initialFree?: boolean;
  initialPlatforms?: PlatformId[];
}) {
  const [q, setQ] = useState(initialQuery);
  const [types, setTypes] = useState<WorkType[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [status, setStatus] = useState<SerialStatus[]>([]);
  const [platforms, setPlatforms] = useState<PlatformId[]>(initialPlatforms);
  const [ages, setAges] = useState<AgeRating[]>([]);
  const [minRating, setMinRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [yearRange, setYearRange] = useState<[number, number] | null>(null);
  const [freeOnly, setFreeOnly] = useState(initialFree);
  const [adaptedOnly, setAdaptedOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>(initialQuery ? "relevance" : "popular");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [savedOnly, setSavedOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(24);
  const [results, setResults] = useState<Title[]>([]);
  const [typeCount, setTypeCount] = useState({ webtoon: 0, webnovel: 0 });
  const [topTags, setTopTags] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<SearchCatalogMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const query = useMemo(() => {
    const params = new URLSearchParams({ sort });
    if (q) params.set("q", q);
    if (types.length) params.set("types", types.join(","));
    if (genres.length) params.set("genres", genres.join(","));
    if (tags.length) params.set("tags", tags.join(","));
    if (status.length) params.set("status", status.join(","));
    if (platforms.length) params.set("platforms", platforms.join(","));
    if (ages.length) params.set("ages", ages.join(","));
    if (minRating) params.set("minRating", String(minRating));
    if (yearRange) {
      params.set("yearMin", String(yearRange[0]));
      params.set("yearMax", String(yearRange[1]));
    }
    if (freeOnly) params.set("freeOnly", "true");
    if (adaptedOnly) params.set("adaptedOnly", "true");
    return params.toString();
  }, [adaptedOnly, ages, freeOnly, genres, minRating, platforms, q, sort, status, tags, types, yearRange]);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/search?${query}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("search_request_failed");
        return response.json() as Promise<{
          items: Title[];
          typeCount: { webtoon: number; webnovel: number };
          topTags: string[];
          catalog?: SearchCatalogMeta;
        }>;
      })
      .then((data) => {
        if (!alive) return;
        setResults(data.items);
        setTypeCount(data.typeCount);
        setTopTags(data.topTags);
        setCatalog(data.catalog ?? null);
        setLimit(24);
      })
      .catch(() => {
        if (!alive) return;
        setError("검색 데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
        setResults([]);
        setTypeCount({ webtoon: 0, webnovel: 0 });
        setCatalog(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [query, retryKey]);

  const savedIds = useSavedTitleIds();
  const visibleResults = savedOnly ? results.filter((title) => savedIds.has(title.id)) : results;
  const shown = visibleResults.slice(0, limit);
  const hasResult = Boolean(visibleResults.length);
  const resultText = hasResult ? `${visibleResults.length.toLocaleString("ko-KR")}개의 작품` : "결과가 없습니다";
  const catalogCoverage = catalog?.platformCoverage.slice(0, 5) ?? [];
  const filteredCoverage = catalog?.filteredPlatformCoverage.slice(0, 4) ?? [];
  // 플랫폼 필터는 카탈로그에 실제로 존재하는 플랫폼만 노출(빈 슬롯 방지). 커버리지 정보가
  // 아직 없으면 전체를 보여주고, 이미 선택된 플랫폼은 사라지지 않게 유지한다.
  const presentPlatformIds = new Set((catalog?.platformCoverage ?? []).map((entry) => entry.id));
  const platformOptions = presentPlatformIds.size
    ? PLATFORM_LIST.filter((entry) => presentPlatformIds.has(entry.id) || platforms.includes(entry.id))
    : PLATFORM_LIST;

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

  const selectedTokens = useMemo<FilterToken[]>(() => {
    const entries: FilterToken[] = [];

    types.forEach((entry) => {
      entries.push({
        key: `type:${entry}`,
        category: "type",
        label: entry === "webtoon" ? "웹툰" : "웹소설",
      });
    });

    genres.forEach((entry) => {
      entries.push({ key: `genre:${entry}`, category: "genre", label: entry });
    });

    tags.forEach((tag) => {
      entries.push({ key: `tag:${tag}`, category: "tag", label: `#${tag}` });
    });

    status.forEach((entry) => {
      entries.push({ key: `status:${entry}`, category: "status", label: STATUS_LABEL[entry] });
    });

    platforms.forEach((entry) => {
      const matched = PLATFORM_LIST.find((platform) => platform.id === entry);
      if (matched) {
        entries.push({ key: `platform:${entry}`, category: "platform", label: matched.name });
      }
    });

    ages.forEach((entry) => {
      entries.push({ key: `age:${entry}`, category: "age", label: AGE_LABEL[entry] });
    });

    if (minRating > 0) {
      entries.push({ key: "minRating", category: "rating", label: `${minRating}★+` });
    }

    if (yearRange) {
      entries.push({
        key: "year",
        category: "year",
        label: yearRange[0] === 0 ? "~2013" : `${yearRange[0]}-${yearRange[1]}`,
      });
    }

    if (freeOnly) {
      entries.push({ key: "freeOnly", category: "option", label: "무료·기다무" });
    }

    if (adaptedOnly) {
      entries.push({ key: "adaptedOnly", category: "option", label: "원작·2차창작" });
    }

    return entries;
  }, [adaptedOnly, ages, freeOnly, genres, minRating, platforms, status, tags, types, yearRange]);

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
    if (activeCount > 0) {
      setLimit(24);
    }
  };

  const removeToken = (token: FilterToken) => {
    if (token.key.startsWith("type:")) {
      const value = token.key.replace("type:", "") as WorkType;
      setTypes((prev) => prev.filter((entry) => entry !== value));
      return;
    }

    if (token.key.startsWith("genre:")) {
      setGenres((prev) => prev.filter((entry) => entry !== token.key.replace("genre:", "")));
      return;
    }

    if (token.key.startsWith("tag:")) {
      setTags((prev) => prev.filter((entry) => entry !== token.key.replace("tag:", "")));
      return;
    }

    if (token.key.startsWith("status:")) {
      setStatus((prev) => prev.filter((entry) => entry !== token.key.replace("status:", "") as SerialStatus));
      return;
    }

    if (token.key.startsWith("platform:")) {
      setPlatforms((prev) => prev.filter((entry) => entry !== token.key.replace("platform:", "")));
      return;
    }

    if (token.key.startsWith("age:")) {
      setAges((prev) => prev.filter((entry) => entry !== token.key.replace("age:", "") as AgeRating));
      return;
    }

    if (token.key === "minRating") {
      setMinRating(0);
      return;
    }

    if (token.key === "year") {
      setYearRange(null);
      return;
    }

    if (token.key === "freeOnly") {
      setFreeOnly(false);
      return;
    }

    if (token.key === "adaptedOnly") {
      setAdaptedOnly(false);
      return;
    }

    setRetryKey((value) => value + 1);
  };

  const typeSummary =
    typeCount.webtoon === 0 && typeCount.webnovel === 0
      ? "유형 없음"
      : [
          typeCount.webtoon ? `웹툰 ${typeCount.webtoon.toLocaleString("ko-KR")}` : "",
          typeCount.webnovel ? `웹소설 ${typeCount.webnovel.toLocaleString("ko-KR")}` : "",
        ]
          .filter(Boolean)
          .join(" · ");

  const mobileCount = activeCount;

  const facets = (
    <div className="flex flex-col">
      <FacetGroup title="유형">
        <div className="grid grid-cols-2 gap-1.5">
          {WORK_TYPES.map((entry) => (
            <button
              key={entry}
              type="button"
              aria-pressed={types.includes(entry)}
              onClick={() => setTypes((prev) => toggle(prev, entry))}
              className={facetClass(types.includes(entry))}
            >
              {entry === "webtoon" ? "웹툰" : "웹소설"}
            </button>
          ))}
        </div>
      </FacetGroup>

      <FacetGroup title="장르">
        <div className="flex flex-wrap gap-1.5">
          {GENRES.map((genre) => (
            <button
              type="button"
              key={genre}
              onClick={() => setGenres((prev) => toggle(prev, genre))}
              aria-pressed={genres.includes(genre)}
            >
              <GenreChip genre={genre} active={genres.includes(genre)} size="sm" />
            </button>
          ))}
        </div>
      </FacetGroup>

      <FacetGroup title="태그">
        <div className="flex flex-wrap gap-1.5">
          {topTags.map((tag) => (
            <TagChip
              key={tag}
              label={tag}
              active={tags.includes(tag)}
              onClick={() => setTags((prev) => toggle(prev, tag))}
              className={cn("h-7", tags.includes(tag) ? "" : "")}
            />
          ))}
        </div>
      </FacetGroup>

      <FacetGroup title="연재 연도">
        <div className="grid grid-cols-3 gap-1.5">
          {YEAR_RANGES.map((entry) => {
            const active =
              (entry.range === null && yearRange === null) ||
              (entry.range !== null && yearRange !== null && entry.range[0] === yearRange[0] && entry.range[1] === yearRange[1]);

            return (
              <button
                type="button"
                key={entry.label}
                onClick={() => setYearRange(entry.range)}
                aria-pressed={active}
                className={tinyPill(active)}
              >
                {entry.label}
              </button>
            );
          })}
        </div>
      </FacetGroup>

      <FacetGroup title="연재 상태">
        <div className="grid grid-cols-3 gap-1.5">
          {STATUS_OPTIONS.map((entry) => (
            <button
              type="button"
              key={entry}
              onClick={() => setStatus((prev) => toggle(prev, entry))}
              aria-pressed={status.includes(entry)}
              className={tinyPill(status.includes(entry))}
            >
              {STATUS_LABEL[entry]}
            </button>
          ))}
        </div>
      </FacetGroup>

      <FacetGroup title="플랫폼">
        <div className="grid gap-1.5 sm:grid-cols-2">
          {platformOptions.map((entry) => (
            <button
              type="button"
              key={entry.id}
              onClick={() => setPlatforms((prev) => toggle(prev, entry.id))}
              aria-pressed={platforms.includes(entry.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm transition-colors",
                platforms.includes(entry.id)
                  ? "border-accent/55 bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg"
              )}
            >
              <span className="size-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.name}
            </button>
          ))}
        </div>
      </FacetGroup>

      <FacetGroup title="최소 평점">
        <div className="grid grid-cols-4 gap-1.5">
          {RATING_OPTIONS.map((rating) => (
            <button
              type="button"
              key={rating}
              onClick={() => setMinRating(rating)}
              aria-pressed={minRating === rating}
              className={tinyPill(minRating === rating)}
            >
              {rating === 0 ? "전체" : `${rating}★+`}
            </button>
          ))}
        </div>
      </FacetGroup>

      <FacetGroup title="이용가">
        <div className="grid grid-cols-4 gap-1.5">
          {AGE_OPTIONS.map((entry) => (
            <button
              type="button"
              key={entry}
              onClick={() => setAges((prev) => toggle(prev, entry))}
              aria-pressed={ages.includes(entry)}
              className={tinyPill(ages.includes(entry))}
            >
              {AGE_LABEL[entry]}
            </button>
          ))}
        </div>
      </FacetGroup>

      <FacetGroup title="옵션">
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setFreeOnly((current) => !current)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              freeOnly
                ? "border-good/45 bg-[oklch(0.8_0.15_150/0.14)] text-good border border-good/35"
                : "border-line bg-card text-fg-2 hover:text-fg"
            )}
            aria-pressed={freeOnly}
          >
            <Gift size={15} />
            무료·기다무만
          </button>
          <button
            type="button"
            onClick={() => setAdaptedOnly((current) => !current)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              adaptedOnly
                ? "border-accent/55 bg-accent-soft text-accent border"
                : "border-line bg-card text-fg-2 hover:text-fg"
            )}
            aria-pressed={adaptedOnly}
          >
            <Link2 size={15} />
            원작·2차창작 연결
          </button>
        </div>
      </FacetGroup>
    </div>
  );

  return (
    <section className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <aside className="hidden lg:block">
        <div className="sticky top-20 rounded-2xl border border-line bg-panel/40 p-4">
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-line pb-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <SlidersHorizontal size={15} />
              필터
              {activeCount > 0 && (
                <span className="numeral rounded-full bg-accent px-1.5 text-[0.7rem] text-on-accent">{activeCount}</span>
              )}
            </h2>
            {activeCount > 0 && (
              <button type="button" onClick={reset} className="text-xs text-fg-3 hover:text-accent">
                전체 초기화
              </button>
            )}
          </div>
          {facets}
        </div>
      </aside>

      <main>
        <div className="rounded-2xl border border-line bg-card p-3 sm:p-4">
          <label htmlFor="search-explorer-query" className="sr-only">
            작품, 작가, 태그 검색
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-raised/60 px-3 py-2 transition-colors focus-within:border-accent/50 focus-within:bg-panel/90">
            <Search size={18} className="text-fg-3" />
            <input
              id="search-explorer-query"
              type="search"
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                if (event.target.value && sort === "popular") {
                  setSort("relevance");
                }
              }}
              className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3"
              placeholder="작품, 작가, 태그 검색"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="rounded-md p-1 text-fg-3 transition-colors hover:bg-raised hover:text-fg"
                aria-label="검색어 지우기"
              >
                <X size={16} />
              </button>
            )}
            <button
              type="button"
              className={buttonClass({ size: "icon", variant: "quiet" })}
              onClick={() => setRetryKey((value) => value + 1)}
              aria-label="검색 새로고침"
            >
              <Search size={14} />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1.5 lg:hidden" })}
              onClick={() => setShowFilters((value) => !value)}
              aria-expanded={showFilters}
            >
              <SlidersHorizontal size={14} />
              필터
              {activeCount > 0 && <span className="ml-0.5 text-accent">{mobileCount}</span>}
            </button>

            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className="h-8 rounded-lg border border-line bg-card px-2.5 text-[0.8125rem] text-fg-2 outline-none transition-colors focus:border-accent/50"
              aria-label="정렬 기준"
            >
              {SORTS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setSavedOnly((current) => !current)}
              aria-pressed={savedOnly}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[0.8125rem] font-medium transition-colors",
                savedOnly
                  ? "border-accent/55 bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg"
              )}
            >
              <Bookmark size={14} className={savedOnly ? "fill-current" : ""} />
              내 찜만
            </button>

            <Segmented
              size="sm"
              value={view}
              onChange={(value) => setView(value)}
              items={[
                { value: "grid", label: <LayoutGrid size={14} />, hint: "그리드 보기" },
                { value: "list", label: <List size={14} />, hint: "리스트 보기" },
              ]}
              className="ml-auto"
            />

            <button
              type="button"
              onClick={() => {
                setRetryKey((value) => value + 1);
              }}
              className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1.5" })}
            >
              <RefreshCw size={14} />
              갱신
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-fg-3" role="status" aria-live="polite">
            <span className="truncate">
              검색어: <strong>{q ? `"${q}"` : "전체"}</strong>
            </span>
            <span className="h-1 w-1 rounded-full bg-line-strong" />
            <span className="truncate">{resultText}</span>
            <span className="h-1 w-1 rounded-full bg-line-strong" />
            <span className="truncate">{loading ? "로딩 중" : typeSummary}</span>
          </div>

          {catalog && (
            <div className="mt-4 grid gap-2 border-t border-line pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-fg-3">
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-panel/50 px-2.5">
                  <Database size={13} className="text-accent" />
                  서버 색인 <strong className="numeral text-fg">{compactNumber(catalog.titleCount)}</strong>편
                </span>
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-panel/50 px-2.5">
                  <Clock3 size={13} className="text-fg-2" />
                  {relativeTime(catalog.loadedAt)}
                </span>
                {catalog.titleCount === 0 && (
                  <span className="inline-flex h-7 items-center rounded-full border border-warn/40 bg-[oklch(0.82_0.15_80/0.12)] px-2.5 text-warn">
                    DB 비어 있음
                  </span>
                )}
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[0.72rem] text-fg-3 sm:justify-end">
                {(filteredCoverage.length ? filteredCoverage : catalogCoverage).map((entry) => (
                  <span
                    key={entry.id}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-card px-2.5"
                    title={`${platformName(entry.id)} ${compactNumber(entry.count)}편`}
                  >
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: platformColor(entry.id) }} />
                    {platformName(entry.id)}
                    <span className="numeral text-fg">{compactNumber(entry.count)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {selectedTokens.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-xs uppercase tracking-[0.06em] text-fg-3">현재 필터</span>
              {selectedTokens.map((token) => (
                <button
                  type="button"
                  key={`${token.key}:${token.category}`}
                  onClick={() => removeToken(token)}
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-panel/45 px-2.5 py-1 text-[0.7rem] text-fg-2 transition-all duration-150 hover:border-accent/50 hover:text-fg"
                  aria-label={`${token.label} 필터 제거`}
                >
                  <span>{token.label}</span>
                  <span aria-hidden>×</span>
                </button>
              ))}

              <button
                type="button"
                onClick={reset}
                className="ml-auto text-xs text-accent underline underline-offset-2"
              >
                초기화
              </button>
            </div>
          )}
        </div>

        {showFilters && (
          <div className="mt-3 rounded-2xl border border-line bg-panel/40 lg:hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-sm font-semibold">필터</p>
              {activeCount > 0 && (
                <button type="button" onClick={reset} className="text-xs text-accent">
                  전체 초기화
                </button>
              )}
            </div>
            <div className="px-4 py-3">{facets}</div>
          </div>
        )}

        {loading ? (
          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="space-y-3">
                <div className="skeleton aspect-[3/4] rounded-xl" />
                <div className="skeleton h-4 w-3/4" />
                <div className="skeleton h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="mt-10 rounded-xl border border-bad/40 bg-[oklch(0.66_0.2_25/0.12)] px-5 py-12 text-center">
            <AlertTriangle size={24} className="mx-auto mb-3 text-bad" />
            <p className="text-sm font-medium text-fg">검색 데이터를 불러오지 못했어요.</p>
            <p className="mt-1 text-sm text-fg-3">{error}</p>
            <button
              type="button"
              onClick={() => setRetryKey((value) => value + 1)}
              className={buttonClass({ size: "sm", variant: "outline", className: "mt-4" })}
            >
              다시 시도
            </button>
          </div>
        ) : !hasResult ? (
          <div className="mt-10 rounded-xl border border-dashed border-line bg-card/40 px-5 py-12 text-center">
            <p className="text-sm font-medium text-fg">조건에 맞는 작품이 없어요.</p>
            <p className="mt-1 text-sm text-fg-3">필터를 줄이거나 검색어를 바꿔보세요.</p>
            {activeCount > 0 && (
              <button
                type="button"
                onClick={reset}
                className="mt-3 text-sm text-accent underline underline-offset-2"
              >
                필터 전체 초기화
              </button>
            )}
          </div>
        ) : (
          <>
            {view === "grid" ? (
              <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
                {shown.map((title) => (
                  <TitleCard key={title.id} title={title} />
                ))}
              </div>
            ) : (
              <div className="mt-5 flex flex-col gap-2">
                {shown.map((title) => (
                  <TitleRow key={title.id} title={title} />
                ))}
              </div>
            )}

            {shown.length < visibleResults.length && (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={() => setLimit((current) => current + 24)}
                  className={buttonClass({ size: "sm", className: "gap-1.5" })}
                >
                  더 보기
                  <span className="text-fg-3">({(visibleResults.length - shown.length).toLocaleString("ko-KR")}개)</span>
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </section>
  );
}
