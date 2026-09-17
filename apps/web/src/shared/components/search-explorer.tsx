import {
  Search,
  SlidersHorizontal,
  X,
  LayoutGrid,
  List,
  AlertTriangle,
  RefreshCw,
  Database,
  Clock3,
  Bookmark,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useSearchParams } from "react-router-dom";

import {
  SORTS,
  WORK_TYPE_LABEL_KEY,
  STATUS_LABEL_KEY,
  AGE_LABEL_KEY,
} from "./search-explorer-constants";
import { SearchFacetPanel } from "./search-explorer-facets";
import {
  compactNumber,
  relativeTime,
  platformName,
  platformColor,
} from "./search-explorer-utils";
import { TitleCard, TitleRow } from "./title-card";
import { buttonClass } from "./ui/button-utils";
import { Segmented } from "./ui/segmented";
import { Select } from "./ui/select";

import type { SortKey } from "@/shared/lib/search";
import type {
  WorkType,
  SerialStatus,
  AgeRating,
  PlatformId,
} from "@/shared/lib/types";

import {
  hasCatalogDiscoveryFilters,
  parseCatalogDiscoveryState,
  writeCatalogDiscoveryState,
  type CatalogDiscoveryState,
} from "@/shared/lib/catalog-discovery-state";
import { useT } from "@/shared/lib/i18n";
import { PLATFORM_LIST } from "@/shared/lib/platforms";
import { normalizeQuery } from "@/shared/lib/recent-searches";
import { useApp, useSavedTitleIds } from "@/shared/lib/store";
import {
  EMPTY_TITLE_FILTERS,
  titleFiltersToParams,
  type TitleFilterState,
} from "@/shared/lib/title-filters";
import { cn } from "@/shared/lib/utils";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePaginatedSearch } from "@/infrastructure/use-paginated-search";

type FilterToken = { key: string; label: string; category: string };

type FilterSetter<K extends keyof TitleFilterState> = Dispatch<
  SetStateAction<TitleFilterState[K]>
>;

function resolveAction<T>(action: SetStateAction<T>, current: T): T {
  return typeof action === "function"
    ? (action as (value: T) => T)(current)
    : action;
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
  const [searchParams, setSearchParams] = useSearchParams();
  const explicitFilters = hasCatalogDiscoveryFilters(searchParams);
  const parsed = useMemo(() => {
    const current = parseCatalogDiscoveryState(searchParams, {
      fallbackQuery: initialQuery,
    });
    if (explicitFilters) return current;
    return {
      ...current,
      filters: {
        ...current.filters,
        platforms: initialPlatforms,
        pricing: initialFree ? ["free", "wait-free"] : current.filters.pricing,
      },
    } satisfies CatalogDiscoveryState;
  }, [
    explicitFilters,
    initialFree,
    initialPlatforms,
    initialQuery,
    searchParams,
  ]);
  const [q, setQ] = useState(parsed.query);
  const debouncedQ = useDebouncedValue(q, 180);
  const [showFilters, setShowFilters] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const filterSheetRef = useRef<HTMLElement>(null);
  const [retryKey, setRetryKey] = useState(0);
  const t = useT();

  const updateState = useCallback(
    (update: (current: CatalogDiscoveryState) => CatalogDiscoveryState) => {
      const next = update(parsed);
      setSearchParams(writeCatalogDiscoveryState(searchParams, next), {
        replace: true,
        preventScrollReset: true,
      });
    },
    [parsed, searchParams, setSearchParams],
  );

  const updateFilters = useCallback(
    (action: SetStateAction<TitleFilterState>) => {
      updateState((current) => ({
        ...current,
        filters: resolveAction(action, current.filters),
      }));
    },
    [updateState],
  );

  const filterSetter = useCallback(
    <K extends keyof TitleFilterState>(key: K): FilterSetter<K> =>
      (action) => {
        updateFilters((current) => ({
          ...current,
          [key]: resolveAction(action, current[key]),
        }));
      },
    [updateFilters],
  );

  const { filters, sort, view } = parsed;
  const {
    types,
    genres,
    status,
    platforms,
    ages,
    minRating,
    tags,
    yearRange,
    adaptedOnly,
  } = filters;
  const savedOnly = filters.savedOnly;
  const freeOnly =
    filters.pricing.length > 0 &&
    filters.pricing.every(
      (pricing) => pricing === "free" || pricing === "wait-free",
    );
  const setTypes = filterSetter("types");
  const setGenres = filterSetter("genres");
  const setStatus = filterSetter("status");
  const setPlatforms = filterSetter("platforms");
  const setAges = filterSetter("ages");
  const setMinRating = filterSetter("minRating");
  const setTags = filterSetter("tags");
  const setYearRange = filterSetter("yearRange");
  const setAdaptedOnly = filterSetter("adaptedOnly");
  const setSavedOnly: Dispatch<SetStateAction<boolean>> = (action) => {
    updateFilters((current) => ({
      ...current,
      savedOnly: resolveAction(action, current.savedOnly),
    }));
  };
  const setFreeOnly: Dispatch<SetStateAction<boolean>> = (action) => {
    const next = resolveAction(action, freeOnly);
    updateFilters((current) => ({
      ...current,
      pricing: next ? ["free", "wait-free"] : [],
    }));
  };
  const setSort = (next: SortKey) =>
    updateState((current) => ({ ...current, sort: next }));
  const setView = (next: "grid" | "list") =>
    updateState((current) => ({ ...current, view: next }));

  useEffect(() => {
    setQ((current) => (current === parsed.query ? current : parsed.query));
  }, [parsed.query]);
  useEffect(() => {
    if (!showFilters) return undefined;
    const previousOverflow = document.body.style.overflow;
    const sheet = filterSheetRef.current;
    const focusReturnTarget = filterButtonRef.current;
    const focusableSelector = [
      "button:not([disabled])",
      "a[href]",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setShowFilters(false);
        return;
      }
      if (event.key !== "Tab" || !sheet) return;
      const focusable = [
        ...sheet.querySelectorAll<HTMLElement>(focusableSelector),
      ];
      if (focusable.length === 0) {
        event.preventDefault();
        sheet.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => sheet?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      focusReturnTarget?.focus();
    };
  }, [showFilters]);
  useEffect(() => {
    if (debouncedQ.trim() === parsed.query.trim()) return;
    updateState((current) => ({
      ...current,
      query: debouncedQ,
      sort:
        debouncedQ.trim() && current.sort === "popular"
          ? "relevance"
          : current.sort,
    }));
  }, [debouncedQ, parsed.query, updateState]);

  const recentSearches = useApp((s) => s.recentSearches);
  const recordRecentSearch = useApp((s) => s.addRecentSearch);
  const removeRecentSearch = useApp((s) => s.removeRecentSearch);
  const clearRecentSearches = useApp((s) => s.clearRecentSearches);
  const textSettling = q.trim() !== debouncedQ.trim();
  const savedIds = useSavedTitleIds();

  const query = useMemo(() => {
    const params = new URLSearchParams(titleFiltersToParams(filters, { sort }));
    if (debouncedQ) params.set("q", debouncedQ);
    if (savedOnly) params.set("ids", [...savedIds].sort().join(","));
    return params.toString();
  }, [debouncedQ, filters, savedIds, savedOnly, sort]);

  const search = usePaginatedSearch(query, !textSettling, retryKey);
  const results = search.items;
  const loading = search.loading;
  const error = search.failed ? t("search.explorer.error.description") : null;
  const typeCount = search.data?.typeCount ?? { webtoon: 0, webnovel: 0 };
  const topTags = search.data?.topTags ?? [];
  const catalog = search.data?.catalog ?? null;
  useEffect(() => {
    if (!loading && normalizeQuery(debouncedQ) && results.length > 0)
      recordRecentSearch(debouncedQ);
  }, [debouncedQ, loading, results.length, recordRecentSearch]);

  const shown = results;
  const hasResult = Boolean(shown.length);
  const resultText =
    search.total > 0
      ? t("search.explorer.resultCount").replace(
          "{count}",
          compactNumber(search.total),
        )
      : t("search.explorer.noResult");
  const catalogCoverage = catalog?.platformCoverage.slice(0, 5) ?? [];
  const filteredCoverage = catalog?.filteredPlatformCoverage.slice(0, 4) ?? [];
  // 플랫폼 필터는 카탈로그에 실제로 존재하는 플랫폼만 노출(빈 슬롯 방지). 커버리지 정보가
  // 아직 없으면 전체를 보여주고, 이미 선택된 플랫폼은 사라지지 않게 유지한다.
  const presentPlatformIds = new Set(
    (catalog?.platformCoverage ?? []).map((entry) => entry.id),
  );
  const platformOptions = presentPlatformIds.size
    ? PLATFORM_LIST.filter(
        (entry) =>
          presentPlatformIds.has(entry.id) || platforms.includes(entry.id),
      )
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

  const selectedTokens: FilterToken[] = (() => {
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
      entries.push({
        key: `status:${entry}`,
        category: "status",
        label: t(STATUS_LABEL_KEY[entry]),
      });
    });

    platforms.forEach((entry) => {
      const matched = PLATFORM_LIST.find((platform) => platform.id === entry);
      if (matched) {
        entries.push({
          key: `platform:${entry}`,
          category: "platform",
          label: matched.name,
        });
      }
    });

    ages.forEach((entry) => {
      entries.push({
        key: `age:${entry}`,
        category: "age",
        label: t(AGE_LABEL_KEY[entry]),
      });
    });

    if (minRating > 0) {
      entries.push({
        key: "minRating",
        category: "rating",
        label: `${minRating}★+`,
      });
    }

    if (yearRange) {
      entries.push({
        key: "year",
        category: "year",
        label:
          yearRange[0] === 0
            ? t("search.explorer.year.upto2013")
            : `${yearRange[0]}-${yearRange[1]}`,
      });
    }

    if (freeOnly) {
      entries.push({
        key: "freeOnly",
        category: "option",
        label: t("search.explorer.option.freeOnly"),
      });
    }

    if (adaptedOnly) {
      entries.push({
        key: "adaptedOnly",
        category: "option",
        label: t("search.explorer.option.adapted"),
      });
    }

    return entries;
  })();

  const reset = () => {
    updateFilters(EMPTY_TITLE_FILTERS);
  };

  const removeToken = (token: FilterToken) => {
    if (token.key.startsWith("type:")) {
      const value = token.key.replace("type:", "") as WorkType;
      setTypes((prev) => prev.filter((entry) => entry !== value));
      return;
    }

    if (token.key.startsWith("genre:")) {
      setGenres((prev) =>
        prev.filter((entry) => entry !== token.key.replace("genre:", "")),
      );
      return;
    }

    if (token.key.startsWith("tag:")) {
      setTags((prev) =>
        prev.filter((entry) => entry !== token.key.replace("tag:", "")),
      );
      return;
    }

    if (token.key.startsWith("status:")) {
      setStatus((prev) =>
        prev.filter(
          (entry) =>
            entry !== (token.key.replace("status:", "") as SerialStatus),
        ),
      );
      return;
    }

    if (token.key.startsWith("platform:")) {
      setPlatforms((prev) =>
        prev.filter((entry) => entry !== token.key.replace("platform:", "")),
      );
      return;
    }

    if (token.key.startsWith("age:")) {
      setAges((prev) =>
        prev.filter(
          (entry) => entry !== (token.key.replace("age:", "") as AgeRating),
        ),
      );
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
          typeCount.webtoon
            ? `${t("search.explorer.type.webtoon")} ${compactNumber(typeCount.webtoon)}`
            : "",
          typeCount.webnovel
            ? `${t("search.explorer.type.webnovel")} ${compactNumber(typeCount.webnovel)}`
            : "",
        ]
          .filter(Boolean)
          .join(t("search.explorer.separator"));

  const mobileCount = activeCount;

  const facets = (
    <SearchFacetPanel
      t={t}
      types={types}
      setTypes={setTypes}
      genres={genres}
      setGenres={setGenres}
      topTags={topTags}
      tags={tags}
      setTags={setTags}
      yearRange={yearRange}
      setYearRange={setYearRange}
      status={status}
      setStatus={setStatus}
      platformOptions={platformOptions}
      platforms={platforms}
      setPlatforms={setPlatforms}
      minRating={minRating}
      setMinRating={setMinRating}
      ages={ages}
      setAges={setAges}
      freeOnly={freeOnly}
      setFreeOnly={setFreeOnly}
      adaptedOnly={adaptedOnly}
      setAdaptedOnly={setAdaptedOnly}
    />
  );

  return (
    <section className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <aside className="hidden lg:block">
        <div className="sticky top-[var(--site-header-sticky-offset,5rem)] rounded-2xl border border-line bg-panel/40 p-4">
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-line pb-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <SlidersHorizontal size={15} />
              {t("search.explorer.filter")}
              {activeCount > 0 && (
                <span className="numeral rounded-full bg-accent px-1.5 text-[0.7rem] text-on-accent">
                  {activeCount}
                </span>
              )}
            </h2>
            {activeCount > 0 && (
              <button
                type="button"
                onClick={reset}
                className="text-xs text-fg-3 hover:text-accent"
              >
                {t("search.explorer.filterReset")}
              </button>
            )}
          </div>
          {facets}
        </div>
      </aside>

      <div data-search-results="">
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
              ref={filterButtonRef}
              type="button"
              className={buttonClass({
                size: "sm",
                variant: "quiet",
                className: "min-h-11 gap-1.5 lg:hidden",
              })}
              onClick={() => setShowFilters((value) => !value)}
              aria-expanded={showFilters}
              aria-controls="search-mobile-filter-sheet"
            >
              <SlidersHorizontal size={14} />
              {t("search.explorer.filter")}
              {activeCount > 0 && (
                <span className="ml-0.5 text-accent">{mobileCount}</span>
              )}
            </button>

            <Select
              value={sort}
              onValueChange={(value) => setSort(value as SortKey)}
              ariaLabel={t("search.explorer.sort.label")}
              triggerClassName="h-8 rounded-lg border border-line bg-card px-2.5 text-[0.8125rem] text-fg-2"
              options={SORTS.map((entry) => ({
                value: entry.value,
                label: t(entry.labelKey),
              }))}
            />

            <button
              type="button"
              onClick={() => setSavedOnly((current) => !current)}
              aria-pressed={savedOnly}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[0.8125rem] font-medium transition-colors",
                savedOnly
                  ? "border-accent/55 bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
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
                {
                  value: "grid",
                  label: <LayoutGrid size={14} />,
                  hint: t("search.explorer.view.grid"),
                },
                {
                  value: "list",
                  label: <List size={14} />,
                  hint: t("search.explorer.view.list"),
                },
              ]}
              className="ml-auto"
            />

            <button
              type="button"
              onClick={() => {
                setRetryKey((value) => value + 1);
              }}
              className={buttonClass({
                size: "sm",
                variant: "quiet",
                className: "gap-1.5",
              })}
            >
              <RefreshCw size={14} />
              {t("search.explorer.refresh")}
            </button>
          </div>

          <div
            className="mt-3 flex flex-wrap items-center gap-2 text-xs text-fg-3"
            role="status"
            aria-live="polite"
          >
            <span className="truncate">
              {t("search.explorer.search.label")}:{" "}
              <strong>{q ? `"${q}"` : t("search.queryAll")}</strong>
            </span>
            <span className="h-1 w-1 rounded-full bg-line-strong" />
            <span className="truncate">{resultText}</span>
            <span className="h-1 w-1 rounded-full bg-line-strong" />
            <span className="truncate">
              {loading || textSettling
                ? t("search.explorer.loading")
                : typeSummary}
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
                    aria-label={t("search.explorer.recent.delete").replace(
                      "{query}",
                      `"${entry}"`,
                    )}
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
                  {t("search.explorer.catalog.label")}{" "}
                  <strong className="numeral text-fg">
                    {compactNumber(catalog.titleCount)}
                  </strong>
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
                {(filteredCoverage.length
                  ? filteredCoverage
                  : catalogCoverage
                ).map((entry) => (
                  <span
                    key={entry.id}
                    className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-line bg-card px-2.5"
                    title={`${platformName(entry.id)} ${compactNumber(entry.count)}${t("search.explorer.unit.itemSuffix")}`}
                  >
                    <span
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: platformColor(entry.id) }}
                    />
                    {platformName(entry.id)}
                    <span className="numeral text-fg">
                      {compactNumber(entry.count)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {selectedTokens.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-xs uppercase tracking-[0.06em] text-fg-3">
                {t("search.explorer.currentFilter")}
              </span>
              {selectedTokens.map((token) => (
                <button
                  type="button"
                  key={`${token.key}:${token.category}`}
                  onClick={() => removeToken(token)}
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-panel/45 px-2.5 py-1 text-[0.7rem] text-fg-2 transition-all duration-150 hover:border-accent/50 hover:text-fg"
                  aria-label={t("search.explorer.token.remove").replace(
                    "{label}",
                    token.label,
                  )}
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

        {showFilters ? (
          <div className="lg:hidden">
            <button
              type="button"
              aria-label="필터 닫기"
              className="fixed inset-0 z-[70] bg-canvas/75 backdrop-blur-sm"
              onClick={() => setShowFilters(false)}
            />
            <section
              ref={filterSheetRef}
              tabIndex={-1}
              id="search-mobile-filter-sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby="search-mobile-filter-title"
              className="fixed inset-x-0 bottom-0 z-[71] flex max-h-[88dvh] flex-col overflow-hidden rounded-t-[1.75rem] border border-line bg-panel shadow-2xl"
            >
              <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                <div>
                  <h2
                    id="search-mobile-filter-title"
                    className="text-base font-bold text-fg"
                  >
                    {t("search.explorer.filter")}
                  </h2>
                  <p className="mt-0.5 text-xs text-fg-3">
                    {activeCount > 0
                      ? `${activeCount}개 조건 적용 중`
                      : "원하는 조건을 골라 결과를 좁히세요."}
                  </p>
                </div>
                {activeCount > 0 ? (
                  <button
                    type="button"
                    onClick={reset}
                    className="min-h-11 rounded-xl px-3 text-xs font-semibold text-accent"
                  >
                    {t("search.explorer.filterReset")}
                  </button>
                ) : null}
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2">
                {facets}
              </div>
              <footer className="grid grid-cols-[auto_1fr] gap-2 border-t border-line bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={reset}
                  disabled={activeCount === 0}
                  className="min-h-12 rounded-xl border border-line bg-card px-4 text-sm font-semibold text-fg-2 disabled:opacity-40"
                >
                  {t("search.explorer.filterReset")}
                </button>
                <button
                  type="button"
                  onClick={() => setShowFilters(false)}
                  className="min-h-12 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent"
                >
                  {search.total > 0
                    ? `${compactNumber(search.total)}개 결과 보기`
                    : "결과 보기"}
                </button>
              </footer>
            </section>
          </div>
        ) : null}

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
            <p className="text-sm font-medium text-fg">
              {t("search.explorer.error.title")}
            </p>
            <p className="mt-1 text-sm text-fg-3">{error}</p>
            <button
              type="button"
              onClick={() => setRetryKey((value) => value + 1)}
              className={buttonClass({
                size: "sm",
                variant: "outline",
                className: "mt-4",
              })}
            >
              {t("search.explorer.retry")}
            </button>
          </div>
        ) : !hasResult ? (
          <div className="mt-10 rounded-xl border border-dashed border-line bg-card/40 px-5 py-12 text-center">
            <p className="text-sm font-medium text-fg">
              {t("search.explorer.noResults")}
            </p>
            <p className="mt-1 text-sm text-fg-2">
              {q
                ? t("search.explorer.hint.search")
                : t("search.explorer.hint.filter")}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  className={buttonClass({
                    size: "sm",
                    variant: "outline",
                    className: "gap-1.5",
                  })}
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

            {search.moreFailed && (
              <p role="alert" className="mt-4 text-center text-sm text-bad">
                {t("search.explorer.error.description")}
              </p>
            )}
            {search.hasMore && (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={search.loadMore}
                  disabled={search.loadingMore}
                  aria-busy={search.loadingMore}
                  className={buttonClass({ size: "sm", className: "gap-1.5" })}
                >
                  {search.loadingMore
                    ? t("search.explorer.loading")
                    : search.moreFailed
                      ? t("search.explorer.retry")
                      : t("search.explorer.loadMore")}
                  <span className="text-fg-3">
                    ({compactNumber(Math.max(0, search.total - shown.length))}
                    {t("search.explorer.unit.itemSuffix")})
                  </span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
