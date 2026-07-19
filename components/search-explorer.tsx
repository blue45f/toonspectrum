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
import { useEffect, useMemo, useState } from "react";

import { TitleCard, TitleRow } from "./title-card";
import { buttonClass } from "./ui/button-utils";
import { GenreChip, TagChip } from "./ui/chip";
import { Segmented } from "./ui/segmented";
import { Select } from "./ui/select";

import type { SortKey } from "@/lib/search";
import type { WorkType, SerialStatus, AgeRating, PlatformId, Title } from "@/lib/types";

import { useT } from "@/lib/i18n";
import { PLATFORM_LIST } from "@/lib/platforms";
import { normalizeQuery } from "@/lib/recent-searches";
import { useApp, useSavedTitleIds } from "@/lib/store";
import { GENRES } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/src/hooks/use-debounced-value";
import { fetchSearchResponse, isSearchAbortError, type SearchCatalogMeta } from "@/src/infrastructure/search-client";


const SORTS: { value: SortKey; labelKey: string }[] = [
  { value: "relevance", labelKey: "search.explorer.sort.relevance" },
  { value: "rating", labelKey: "search.explorer.sort.rating" },
  { value: "popular", labelKey: "search.explorer.sort.popular" },
  { value: "trending", labelKey: "search.explorer.sort.trending" },
  { value: "bookmarks", labelKey: "search.explorer.sort.bookmarks" },
  { value: "completion", labelKey: "search.explorer.sort.completion" },
  { value: "newest", labelKey: "search.explorer.sort.newest" },
  { value: "title", labelKey: "search.explorer.sort.title" },
];

const YEAR_RANGES: { key: string; labelKey: string; range: [number, number] | null }[] = [
  { key: "all", labelKey: "search.explorer.year.all", range: null },
  { key: "2022+", labelKey: "search.explorer.year.2022plus", range: [2022, 9999] },
  { key: "2018-21", labelKey: "search.explorer.year.2018-21", range: [2018, 2021] },
  { key: "2014-17", labelKey: "search.explorer.year.2014-17", range: [2014, 2017] },
  { key: "upto2013", labelKey: "search.explorer.year.upto2013", range: [0, 2013] },
];

const RATING_OPTIONS = [0, 3, 4, 4.5] as const;
const AGE_OPTIONS: AgeRating[] = ["all", "12", "15", "19"];
const WORK_TYPES: { value: WorkType; labelKey: string }[] = [
  { value: "webtoon", labelKey: "search.explorer.type.webtoon" },
  { value: "webnovel", labelKey: "search.explorer.type.webnovel" },
];
const WORK_TYPE_LABEL_KEY: Record<WorkType, string> = {
  webtoon: "search.explorer.type.webtoon",
  webnovel: "search.explorer.type.webnovel",
};
const STATUS_OPTIONS = ["ongoing", "completed", "hiatus"] as const;
const STATUS_LABEL_KEY: Record<SerialStatus, string> = {
  ongoing: "search.explorer.status.ongoing",
  completed: "search.explorer.status.completed",
  hiatus: "search.explorer.status.hiatus",
};
const AGE_LABEL_KEY: Record<AgeRating, string> = {
  all: "search.explorer.age.all",
  "12": "search.explorer.age.12",
  "15": "search.explorer.age.15",
  "19": "search.explorer.age.19",
};

function toggle<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((entry) => entry !== value) : [...arr, value];
}

type FilterToken = { key: string; label: string; category: string };
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
    // 좁은 화면에서도 읽히고 누르기 편하도록 최소 높이(32px)·12px 본문 + 한 줄 유지(줄바꿈 방지).
    "inline-flex min-h-8 items-center justify-center whitespace-nowrap rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors",
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
  return value.toLocaleString();
}

function relativeTime(value: string | undefined, t: (key: string) => string) {
  if (!value) return t("search.explorer.time.noData");
  const elapsed = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(elapsed)) return t("search.explorer.time.noData");
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return t("search.explorer.time.justNow");
  if (minutes < 60) return t("search.explorer.time.minutesAgo").replace("{count}", String(minutes));
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("search.explorer.time.hoursAgo").replace("{count}", String(hours));
  return t("search.explorer.time.daysAgo").replace("{count}", String(Math.floor(hours / 24)));
}

function platformName(id: PlatformId) {
  return PLATFORM_LIST.find((platform) => platform.id === id)?.short ?? id;
}

function platformColor(id: PlatformId) {
  return PLATFORM_LIST.find((platform) => platform.id === id)?.color ?? "oklch(0.305 0.012 64)";
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
  const debouncedQ = useDebouncedValue(q, 180);
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
  const t = useT();

  const recentSearches = useApp((s) => s.recentSearches);
  const recordRecentSearch = useApp((s) => s.addRecentSearch);
  const removeRecentSearch = useApp((s) => s.removeRecentSearch);
  const clearRecentSearches = useApp((s) => s.clearRecentSearches);
  const textSettling = q.trim() !== debouncedQ.trim();

  const query = useMemo(() => {
    const params = new URLSearchParams({ sort });
    if (debouncedQ) params.set("q", debouncedQ);
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
  }, [adaptedOnly, ages, debouncedQ, freeOnly, genres, minRating, platforms, sort, status, tags, types, yearRange]);

  useEffect(() => {
    if (textSettling) {
      setLoading(true);
      return;
    }

    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchSearchResponse(query, controller.signal)
      .then((data) => {
        if (!alive) return;
        setResults(data.items);
        setTypeCount(data.typeCount);
        setTopTags(data.topTags);
        setCatalog(data.catalog ?? null);
        setLimit(24);
        // 결과가 있는 검색어만 최근 검색어로 기록(오타·빈 검색은 제외). 정규화·중복 제거는 스토어가 담당.
        if (normalizeQuery(debouncedQ) && data.items.length > 0) recordRecentSearch(debouncedQ);
      })
      .catch((error: unknown) => {
        if (isSearchAbortError(error)) return;
        if (!alive) return;
        setError(t("search.explorer.error.description"));
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
  }, [debouncedQ, query, recordRecentSearch, retryKey, textSettling, t]);

  const savedIds = useSavedTitleIds();
  const visibleResults = savedOnly ? results.filter((title) => savedIds.has(title.id)) : results;
  const shown = visibleResults.slice(0, limit);
  const hasResult = Boolean(visibleResults.length);
  const resultText = hasResult
    ? t("search.explorer.resultCount").replace("{count}", compactNumber(visibleResults.length))
    : t("search.explorer.noResult");
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
        label: t(WORK_TYPE_LABEL_KEY[entry]),
      });
    });

    genres.forEach((entry) => {
      entries.push({ key: `genre:${entry}`, category: "genre", label: entry });
    });

    tags.forEach((tag) => {
      entries.push({ key: `tag:${tag}`, category: "tag", label: `#${tag}` });
    });

    status.forEach((entry) => {
      entries.push({ key: `status:${entry}`, category: "status", label: t(STATUS_LABEL_KEY[entry]) });
    });

    platforms.forEach((entry) => {
      const matched = PLATFORM_LIST.find((platform) => platform.id === entry);
      if (matched) {
        entries.push({ key: `platform:${entry}`, category: "platform", label: matched.name });
      }
    });

    ages.forEach((entry) => {
      entries.push({ key: `age:${entry}`, category: "age", label: t(AGE_LABEL_KEY[entry]) });
    });

    if (minRating > 0) {
      entries.push({ key: "minRating", category: "rating", label: `${minRating}★+` });
    }

    if (yearRange) {
      entries.push({
        key: "year",
        category: "year",
        label: yearRange[0] === 0 ? t("search.explorer.year.upto2013") : `${yearRange[0]}-${yearRange[1]}`,
      });
    }

    if (freeOnly) {
      entries.push({ key: "freeOnly", category: "option", label: t("search.explorer.option.freeOnly") });
    }

    if (adaptedOnly) {
      entries.push({ key: "adaptedOnly", category: "option", label: t("search.explorer.option.adapted") });
    }

    return entries;
  }, [adaptedOnly, ages, freeOnly, genres, minRating, platforms, status, t, tags, types, yearRange]);

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
      ? t("search.explorer.typeSummary.empty")
      : [
          typeCount.webtoon ? `${t("search.explorer.type.webtoon")} ${compactNumber(typeCount.webtoon)}` : "",
          typeCount.webnovel ? `${t("search.explorer.type.webnovel")} ${compactNumber(typeCount.webnovel)}` : "",
        ]
          .filter(Boolean)
          .join(t("search.explorer.separator"));

  const mobileCount = activeCount;

  const facets = (
    <div className="flex flex-col">
      <FacetGroup title={t("search.explorer.facet.type")}>
        <div className="grid grid-cols-2 gap-1.5">
          {WORK_TYPES.map((entry) => (
            <button
              key={entry.value}
              type="button"
              aria-pressed={types.includes(entry.value)}
              onClick={() => setTypes((prev) => toggle(prev, entry.value))}
              className={facetClass(types.includes(entry.value))}
            >
              {t(entry.labelKey)}
            </button>
          ))}
        </div>
      </FacetGroup>

      <FacetGroup title={t("search.explorer.facet.genre")}>
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

      <FacetGroup title={t("search.explorer.facet.tag")}>
        <div className="flex flex-wrap gap-1.5">
          {topTags.map((tag) => (
            <TagChip
              key={tag}
              label={tag}
              active={tags.includes(tag)}
              onClick={() => setTags((prev) => toggle(prev, tag))}
              className="h-7"
            />
          ))}
        </div>
      </FacetGroup>

      <FacetGroup title={t("search.explorer.facet.year")}>
        <div className="grid grid-cols-3 gap-1.5">
          {YEAR_RANGES.map((entry) => {
            const active =
              (entry.range === null && yearRange === null) ||
              (entry.range !== null && yearRange !== null && entry.range[0] === yearRange[0] && entry.range[1] === yearRange[1]);

            return (
              <button
                type="button"
                key={entry.key}
                onClick={() => setYearRange(entry.range)}
                aria-pressed={active}
                className={tinyPill(active)}
              >
                {entry.key === "all" ? t("search.explorer.year.all") : t(entry.labelKey)}
              </button>
            );
          })}
        </div>
      </FacetGroup>

      <FacetGroup title={t("search.explorer.facet.status")}>
        <div className="grid grid-cols-3 gap-1.5">
          {STATUS_OPTIONS.map((entry) => (
            <button
              type="button"
              key={entry}
              onClick={() => setStatus((prev) => toggle(prev, entry))}
              aria-pressed={status.includes(entry)}
              className={tinyPill(status.includes(entry))}
            >
              {t(STATUS_LABEL_KEY[entry])}
            </button>
          ))}
        </div>
      </FacetGroup>

      <FacetGroup title={t("search.explorer.facet.platform")}>
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

      <FacetGroup title={t("search.explorer.facet.minRating")}>
        <div className="grid grid-cols-4 gap-1.5">
          {RATING_OPTIONS.map((rating) => (
            <button
              type="button"
              key={rating}
              onClick={() => setMinRating(rating)}
              aria-pressed={minRating === rating}
              className={tinyPill(minRating === rating)}
            >
              {rating === 0 ? t("search.explorer.ratingAll") : `${rating}★+`}
            </button>
          ))}
        </div>
      </FacetGroup>

      <FacetGroup title={t("search.explorer.facet.age")}>
        <div className="grid grid-cols-4 gap-1.5">
          {AGE_OPTIONS.map((entry) => (
            <button
              type="button"
              key={entry}
              onClick={() => setAges((prev) => toggle(prev, entry))}
              aria-pressed={ages.includes(entry)}
              className={tinyPill(ages.includes(entry))}
            >
              {t(AGE_LABEL_KEY[entry])}
            </button>
          ))}
        </div>
      </FacetGroup>

      <FacetGroup title={t("search.explorer.facet.option")}>
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
            {t("search.explorer.option.freeOnly")}
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
            {t("search.explorer.option.adapted")}
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
              {t("search.explorer.filter")}
              {activeCount > 0 && (
                <span className="numeral rounded-full bg-accent px-1.5 text-[0.7rem] text-on-accent">{activeCount}</span>
              )}
            </h2>
            {activeCount > 0 && (
              <button type="button" onClick={reset} className="text-xs text-fg-3 hover:text-accent">
                {t("search.explorer.filterReset")}
              </button>
            )}
          </div>
          {facets}
        </div>
      </aside>

      <main>
        <div className="rounded-2xl border border-line bg-card p-3 sm:p-4">
          <label htmlFor="search-explorer-query" className="sr-only">
            {t("search.explorer.search.label")}
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
              placeholder={t("search.explorer.search.placeholder")}
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="rounded-md p-1 text-fg-3 transition-colors hover:bg-raised hover:text-fg"
                aria-label={t("search.explorer.search.clear")}
              >
                <X size={16} />
              </button>
            )}
            <button
              type="button"
              className={buttonClass({ size: "icon", variant: "quiet" })}
              onClick={() => setRetryKey((value) => value + 1)}
              aria-label={t("search.explorer.search.reload")}
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
              {t("search.explorer.filter")}
              {activeCount > 0 && <span className="ml-0.5 text-accent">{mobileCount}</span>}
            </button>

            <Select
              value={sort}
              onValueChange={(value) => setSort(value as SortKey)}
              ariaLabel={t("search.explorer.sort.label")}
              triggerClassName="h-8 rounded-lg border border-line bg-card px-2.5 text-[0.8125rem] text-fg-2"
              options={SORTS.map((entry) => ({ value: entry.value, label: t(entry.labelKey) }))}
            />

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
              {t("search.explorer.savedOnly")}
            </button>

            <Segmented
              size="sm"
              value={view}
              onChange={(value) => setView(value)}
              items={[
                { value: "grid", label: <LayoutGrid size={14} />, hint: t("search.explorer.view.grid") },
                { value: "list", label: <List size={14} />, hint: t("search.explorer.view.list") },
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
              {t("search.explorer.refresh")}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-fg-3" role="status" aria-live="polite">
            <span className="truncate">
              {t("search.explorer.search.label")}: <strong>{q ? `"${q}"` : t("search.queryAll")}</strong>
            </span>
            <span className="h-1 w-1 rounded-full bg-line-strong" />
            <span className="truncate">{resultText}</span>
            <span className="h-1 w-1 rounded-full bg-line-strong" />
            <span className="truncate">
              {loading || textSettling ? t("search.explorer.loading") : typeSummary}
            </span>
          </div>

          {/* 최근 검색어 — 입력이 비었을 때만 노출, 칩 클릭으로 즉시 복귀(각 칩은 개별 삭제 가능). */}
          {!q && recentSearches.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
              <span className="inline-flex items-center gap-1 text-[0.72rem] font-medium text-fg-3">
                <Clock3 size={13} />
                {t("search.explorer.recent")}
              </span>
              {recentSearches.map((entry) => (
                <span
                  key={entry}
                  className="group inline-flex items-center overflow-hidden rounded-full border border-line bg-card text-[0.72rem] text-fg-2 transition-colors hover:border-line-strong"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setQ(entry);
                      if (sort === "popular") setSort("relevance");
                    }}
                    className="py-1 pl-2.5 pr-1.5 font-medium transition-colors hover:text-fg"
                  >
                    {entry}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRecentSearch(entry)}
                    aria-label={t("search.explorer.recent.delete").replace("{query}", `"${entry}"`)}
                    className="grid h-full place-items-center py-1 pl-0.5 pr-2 text-fg-3 transition-colors hover:text-bad"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={clearRecentSearches}
                className="ml-0.5 rounded-full px-2 py-1 text-[0.72rem] text-fg-3 underline-offset-2 transition-colors hover:text-fg hover:underline"
              >
                {t("search.explorer.recent.clearAll")}
              </button>
            </div>
          )}

          {catalog && (
            <div className="mt-4 grid gap-2 border-t border-line pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-fg-3">
                <span className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-line bg-panel/50 px-2.5">
                  <Database size={13} className="text-accent" />
                  {t("search.explorer.catalog.label")} <strong className="numeral text-fg">{compactNumber(catalog.titleCount)}</strong>
                  {t("search.explorer.unit.itemSuffix")}
                </span>
                <span className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-line bg-panel/50 px-2.5">
                  <Clock3 size={13} className="text-fg-2" />
                  {relativeTime(catalog.loadedAt, t)}
                </span>
                {catalog.titleCount === 0 && (
                  <span className="inline-flex h-7 items-center rounded-lg border border-warn/40 bg-[oklch(0.82_0.15_80/0.12)] px-2.5 text-warn">
                    {t("search.explorer.catalog.empty")}
                  </span>
                )}
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[0.72rem] text-fg-3 sm:justify-end">
                {(filteredCoverage.length ? filteredCoverage : catalogCoverage).map((entry) => (
                  <span
                    key={entry.id}
                    className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-line bg-card px-2.5"
                    title={`${platformName(entry.id)} ${compactNumber(entry.count)}${t("search.explorer.unit.itemSuffix")}`}
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
              <span className="text-xs uppercase tracking-[0.06em] text-fg-3">{t("search.explorer.currentFilter")}</span>
              {selectedTokens.map((token) => (
                <button
                  type="button"
                  key={`${token.key}:${token.category}`}
                  onClick={() => removeToken(token)}
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-panel/45 px-2.5 py-1 text-[0.7rem] text-fg-2 transition-all duration-150 hover:border-accent/50 hover:text-fg"
                  aria-label={t("search.explorer.token.remove").replace("{label}", token.label)}
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
                {t("search.explorer.filterReset")}
              </button>
            </div>
          )}
        </div>

        {showFilters && (
          <div className="mt-3 rounded-2xl border border-line bg-panel/40 lg:hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-sm font-semibold">{t("search.explorer.filter")}</p>
              {activeCount > 0 && (
                <button type="button" onClick={reset} className="text-xs text-accent">
                  {t("search.explorer.filterReset")}
                </button>
              )}
            </div>
            <div className="px-4 py-3">{facets}</div>
          </div>
        )}

        {loading ? (
          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4">
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
            <p className="text-sm font-medium text-fg">{t("search.explorer.error.title")}</p>
            <p className="mt-1 text-sm text-fg-3">{error}</p>
            <button
              type="button"
              onClick={() => setRetryKey((value) => value + 1)}
              className={buttonClass({ size: "sm", variant: "outline", className: "mt-4" })}
            >
              {t("search.explorer.retry")}
            </button>
          </div>
        ) : !hasResult ? (
          <div className="mt-10 rounded-xl border border-dashed border-line bg-card/40 px-5 py-12 text-center">
            <p className="text-sm font-medium text-fg">{t("search.explorer.noResults")}</p>
            <p className="mt-1 text-sm text-fg-2">
              {q ? t("search.explorer.hint.search") : t("search.explorer.hint.filter")}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  className={buttonClass({ size: "sm", variant: "outline", className: "gap-1.5" })}
                >
                  <X size={14} />
                  {t("search.explorer.search.clear")}
                </button>
              )}
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={reset}
                  className="text-sm text-accent underline underline-offset-2"
                >
                  {t("search.explorer.filterReset")}
                </button>
              )}
            </div>
            {q && recentSearches.filter((entry) => entry !== q).length > 0 && (
              <div className="mt-5 border-t border-line/70 pt-4">
                <p className="mb-2 inline-flex items-center gap-1 text-[0.72rem] font-medium text-fg-3">
                  <Clock3 size={13} />
                  {t("search.explorer.recent.searchAgain")}
                </p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {recentSearches
                    .filter((entry) => entry !== q)
                    .slice(0, 6)
                    .map((entry) => (
                      <button
                        key={entry}
                        type="button"
                        onClick={() => setQ(entry)}
                        className="rounded-full border border-line bg-card px-2.5 py-1 text-[0.72rem] font-medium text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
                      >
                        {entry}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {view === "grid" ? (
              <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4">
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
                  {t("search.explorer.loadMore")}
                  <span className="text-fg-3">
                    (
                    {compactNumber(visibleResults.length - shown.length)}
                    {t("search.explorer.unit.itemSuffix")}
                    )
                  </span>
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </section>
  );
}
