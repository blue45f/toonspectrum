import { translateBilingualValueForActiveLocale } from "@/shared/lib/i18n-bilingual-copy";
import type { SortKey } from "./search";
import {
  EMPTY_TITLE_FILTERS,
  type TitleFilterState,
} from "./title-filters";
import type {
  AgeRating,
  PlatformId,
  Pricing,
  SerialStatus,
  WorkType,
} from "./types";

import { PLATFORM_LIST } from "./platforms";
import { GENRES } from "./taxonomy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("catalog-discovery-state", ko, en);

export type CatalogDiscoveryMode = "search" | "explore" | "recommend";
export type CatalogDiscoveryView = "grid" | "list";
export type RecommendationDiversity = "focused" | "balanced" | "wide";

export interface CatalogDiscoveryState {
  readonly query: string;
  readonly sort: SortKey;
  readonly view: CatalogDiscoveryView;
  readonly filters: TitleFilterState;
  readonly tasteGenres: readonly string[];
  readonly seedId: string | null;
  readonly diversity: RecommendationDiversity;
}

export interface CatalogDiscoveryParseOptions {
  readonly defaultSort?: SortKey;
  readonly fallbackQuery?: string;
  readonly fallbackGenres?: readonly string[];
}

const OWNED_PARAMS = [
  "q",
  "sort",
  "view",
  "types",
  "genres",
  "genre",
  "tags",
  "tag",
  "status",
  "platforms",
  "ages",
  "pricing",
  "minRating",
  "yearMin",
  "yearMax",
  "savedOnly",
  "adaptedOnly",
  "free",
  "freeOnly",
  "taste",
  "seed",
  "diversity",
] as const;

const SORT_KEYS = new Set<SortKey>([
  "relevance",
  "rating",
  "popular",
  "trending",
  "bookmarks",
  "completion",
  "newest",
  "title",
]);
const VIEWS = new Set<CatalogDiscoveryView>(["grid", "list"]);
const DIVERSITY = new Set<RecommendationDiversity>(["focused", "balanced", "wide"]);
const WORK_TYPES = new Set<WorkType>(["webtoon", "webnovel"]);
const STATUSES = new Set<SerialStatus>(["ongoing", "completed", "hiatus"]);
const AGES = new Set<AgeRating>(["all", "12", "15", "19"]);
const PRICING = new Set<Pricing>(["free", "wait-free", "paid", "subscription"]);
const PLATFORMS = new Set<PlatformId>(PLATFORM_LIST.map((entry) => entry.id));
const GENRE_SET = new Set<string>(GENRES);

function split(value: string | null, max = 32): string[] {
  return [...new Set((value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.slice(0, 80)))]
    .slice(0, max);
}

function allowed<T extends string>(
  values: readonly string[],
  accepted: ReadonlySet<T>,
): T[] {
  return values.filter((value): value is T => accepted.has(value as T));
}

function finiteNumber(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function booleanParam(value: string | null): boolean {
  return value === "1" || value === "true";
}

function parseYearRange(params: URLSearchParams): [number, number] | null {
  const min = finiteNumber(params.get("yearMin"));
  const max = finiteNumber(params.get("yearMax"));
  if (min === null || max === null || min < 0 || max > 9999 || min > max) return null;
  return [Math.round(min), Math.round(max)];
}

export function hasCatalogDiscoveryFilters(params: URLSearchParams): boolean {
  return [
    "types",
    "genres",
    "genre",
    "tags",
    "tag",
    "status",
    "platforms",
    "ages",
    "pricing",
    "minRating",
    "yearMin",
    "yearMax",
    "savedOnly",
    "adaptedOnly",
    "free",
    "freeOnly",
  ].some((key) => params.has(key));
}
export function parseTitleFiltersFromSearchParams(
  params: URLSearchParams,
): TitleFilterState {
  const genres = new Set(allowed(split(params.get("genres")), GENRE_SET));
  const singleGenre = params.get("genre")?.trim();
  if (singleGenre && GENRE_SET.has(singleGenre)) genres.add(singleGenre);

  const tags = new Set(split(params.get("tags")));
  const singleTag = params.get("tag")?.trim();
  if (singleTag) tags.add(singleTag.slice(0, 80));

  const pricing = allowed(split(params.get("pricing")), PRICING);
  if (
    pricing.length === 0
    && (booleanParam(params.get("free")) || booleanParam(params.get("freeOnly")))
  ) {
    pricing.push("free", "wait-free");
  }

  const minRating = finiteNumber(params.get("minRating"));
  return {
    ...EMPTY_TITLE_FILTERS,
    types: allowed(split(params.get("types")), WORK_TYPES),
    genres: [...genres],
    status: allowed(split(params.get("status")), STATUSES),
    platforms: allowed(split(params.get("platforms")), PLATFORMS),
    ages: allowed(split(params.get("ages")), AGES),
    pricing,
    minRating: minRating === null ? 0 : Math.min(5, Math.max(0, minRating)),
    yearRange: parseYearRange(params),
    tags: [...tags],
    savedOnly: booleanParam(params.get("savedOnly")),
    adaptedOnly: booleanParam(params.get("adaptedOnly")),
  };
}

function clearOwnedParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of OWNED_PARAMS) next.delete(key);
  return next;
}

function setList(params: URLSearchParams, key: string, values: readonly string[]): void {
  if (values.length) params.set(key, values.join(","));
}

export function writeTitleFiltersToSearchParams(
  params: URLSearchParams,
  filters: TitleFilterState,
): URLSearchParams {
  const next = clearOwnedParams(params);
  setList(next, "types", filters.types);
  setList(next, "genres", filters.genres);
  setList(next, "tags", filters.tags);
  setList(next, "status", filters.status);
  setList(next, "platforms", filters.platforms);
  setList(next, "ages", filters.ages);
  setList(next, "pricing", filters.pricing);
  if (filters.minRating > 0) next.set("minRating", String(filters.minRating));
  if (filters.yearRange) {
    next.set("yearMin", String(filters.yearRange[0]));
    next.set("yearMax", String(filters.yearRange[1]));
  }
  if (filters.savedOnly) next.set("savedOnly", "true");
  if (filters.adaptedOnly) next.set("adaptedOnly", "true");
  return next;
}

export function parseCatalogDiscoveryState(
  params: URLSearchParams,
  options: CatalogDiscoveryParseOptions = {},
): CatalogDiscoveryState {
  const query = (params.get("q") ?? options.fallbackQuery ?? "").slice(0, 160);
  const requestedSort = params.get("sort") as SortKey | null;
  const defaultSort = options.defaultSort ?? (query.trim() ? "relevance" : "popular");
  const requestedView = params.get("view") as CatalogDiscoveryView | null;
  const requestedDiversity = params.get("diversity") as RecommendationDiversity | null;
  const tasteGenres = allowed(
    split(params.get("taste") ?? params.get("genre")),
    GENRE_SET,
  );
  const fallbackGenres = allowed(options.fallbackGenres ?? [], GENRE_SET);
  return {
    query,
    sort: requestedSort && SORT_KEYS.has(requestedSort) ? requestedSort : defaultSort,
    view: requestedView && VIEWS.has(requestedView) ? requestedView : "grid",
    filters: parseTitleFiltersFromSearchParams(params),
    tasteGenres: tasteGenres.length ? tasteGenres : fallbackGenres,
    seedId: params.get("seed")?.slice(0, 160) || null,
    diversity: requestedDiversity && DIVERSITY.has(requestedDiversity)
      ? requestedDiversity
      : "balanced",
  };
}

export interface CatalogDiscoveryWriteOptions {
  readonly includeQuery?: boolean;
  readonly includeSort?: boolean;
  readonly includeView?: boolean;
  readonly includeFilters?: boolean;
  readonly includeRecommendation?: boolean;
}

export function writeCatalogDiscoveryState(
  params: URLSearchParams,
  state: CatalogDiscoveryState,
  options: CatalogDiscoveryWriteOptions = {},
): URLSearchParams {
  const includeQuery = options.includeQuery ?? true;
  const includeSort = options.includeSort ?? true;
  const includeView = options.includeView ?? true;
  const includeFilters = options.includeFilters ?? true;
  const includeRecommendation = options.includeRecommendation ?? true;
  let next = clearOwnedParams(params);
  if (includeFilters) next = writeTitleFiltersToSearchParams(next, state.filters);
  if (includeQuery && state.query.trim()) next.set("q", state.query.trim());
  if (includeSort && state.sort !== (state.query.trim() ? "relevance" : "popular")) {
    next.set("sort", state.sort);
  }
  if (includeView && state.view !== "grid") next.set("view", state.view);
  if (includeRecommendation) {
    setList(next, "taste", state.tasteGenres);
    if (state.seedId) next.set("seed", state.seedId);
    if (state.diversity !== "balanced") next.set("diversity", state.diversity);
  }
  return next;
}

export function catalogDiscoveryHref(
  mode: CatalogDiscoveryMode,
  params: URLSearchParams,
): string {
  const state = parseCatalogDiscoveryState(params);
  const next = writeCatalogDiscoveryState(new URLSearchParams(), state, {
    includeQuery: mode === "search",
    includeSort: mode !== "recommend",
    includeView: mode === "search",
    includeFilters: true,
    includeRecommendation: mode === "recommend",
  });
  const query = next.toString();
  return query ? `/${mode}?${query}` : `/${mode}`;
}

export function titleFiltersEqual(
  left: TitleFilterState,
  right: TitleFilterState,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function recommendationDiversityLabel(
  diversity: RecommendationDiversity,
  _locale: string,
): string {
  const labels = {
    ko: {
      focused: "취향에 가깝게",
      balanced: "균형 있게",
      wide: "새로운 결까지",
    },
    en: {
      focused: "Closer to my taste",
      balanced: "Balanced",
      wide: "Broaden discovery",
    },
  } as const;
  return bi((labels).ko, (labels).en)[diversity];
}
