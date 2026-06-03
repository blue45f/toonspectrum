import Link from "@/src/compat/router-link";
import { useSearchParams } from "react-router-dom";
import { Container } from "@/components/section";
import { TitleCard } from "@/components/title-card";
import { TitleFilterPanel } from "@/components/title-filter-panel";
import { ErrorState } from "@/src/components/error-state";
import { genreBorder, genreColor, genreTint, spectrumGradient } from "@/lib/genre-color";
import type { SortKey } from "@/lib/search";
import { useSavedTitleIds } from "@/lib/store";
import { GENRES, TYPE_LABEL } from "@/lib/taxonomy";
import {
  applyClientOnlyFilters,
  countActiveTitleFilters,
  titleFiltersToParams,
  type TitleFilterState,
} from "@/lib/title-filters";
import type { AgeRating, PlatformId, Pricing, SerialStatus, Title, WorkType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Compass, RefreshCw, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useApiResource } from "./use-api-resource";

type ExploreParams = Record<string, string | undefined>;

const SORTS: { key: SortKey; label: string }[] = [
  { key: "popular", label: "인기순" },
  { key: "rating", label: "평점순" },
  { key: "trending", label: "급상승" },
  { key: "newest", label: "최신순" },
];

const TYPES: { value: WorkType | "all"; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "webtoon", label: TYPE_LABEL.webtoon },
  { value: "webnovel", label: TYPE_LABEL.webnovel },
];

const FACETS = [
  "saved",
  "type",
  "genre",
  "status",
  "platform",
  "age",
  "pricing",
  "minRating",
  "year",
  "tag",
  "adapted",
] as const;

function splitParam(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

// URL 검색파라미터 → 패널 상태. 단일 genre/tag(스펙트럼·태그 칩)와 복수 genres/tags를 병합한다.
// 서버 explore는 freeOnly만 받으므로(가격 정밀값은 클라 전용) URL에서 pricing 정밀 선택을 복원한다.
function filtersFromSearchParams(sp: URLSearchParams): TitleFilterState {
  const genres = new Set(splitParam(sp.get("genres")));
  const singleGenre = sp.get("genre");
  if (singleGenre && GENRES.includes(singleGenre as (typeof GENRES)[number])) genres.add(singleGenre);

  const tags = new Set(splitParam(sp.get("tags")));
  const singleTag = sp.get("tag");
  if (singleTag) tags.add(singleTag);

  const types = new Set<WorkType>(splitParam(sp.get("types")) as WorkType[]);
  const singleType = sp.get("type") as WorkType | null;
  if (singleType === "webtoon" || singleType === "webnovel") types.add(singleType);

  const yearMin = Number(sp.get("yearMin"));
  const yearMax = Number(sp.get("yearMax"));
  const yearRange: [number, number] | null =
    Number.isFinite(yearMin) && Number.isFinite(yearMax) && sp.get("yearMin") && sp.get("yearMax")
      ? [yearMin, yearMax]
      : null;

  const minRating = Number(sp.get("minRating"));

  return {
    types: [...types],
    genres: [...genres],
    status: splitParam(sp.get("status")) as SerialStatus[],
    platforms: splitParam(sp.get("platforms")) as PlatformId[],
    ages: splitParam(sp.get("ages")) as AgeRating[],
    pricing: splitParam(sp.get("pricing")) as Pricing[],
    minRating: Number.isFinite(minRating) ? minRating : 0,
    yearRange,
    tags: [...tags],
    savedOnly: sp.get("savedOnly") === "true",
    adaptedOnly: sp.get("adaptedOnly") === "true",
  };
}

// 패널 상태 → URL. 서버 파라미터(titleFiltersToParams)에 더해 클라 전용(pricing 정밀·savedOnly)도
// URL에 보존해 새로고침/공유 시 복원되게 한다. sort/show는 호출부에서 합친다.
function clientOnlyParams(filters: TitleFilterState): Record<string, string> {
  const extra: Record<string, string> = {};
  if (filters.pricing.length) extra.pricing = filters.pricing.join(",");
  if (filters.savedOnly) extra.savedOnly = "true";
  return extra;
}

interface PlatformCoverage {
  id: PlatformId;
  label: string;
  color: string;
  count: number;
  share: number;
}

interface ExploreResponse {
  filters: {
    genre?: string;
    tag?: string;
    type?: WorkType;
    sort: SortKey;
  };
  current: ExploreParams;
  results: Title[];
  shown: Title[];
  hasMore: boolean;
  showCount: number;
  pageSize: number;
  tags: { tag: string; count: number }[];
  genres: string[];
  catalog?: {
    platformCoverage?: PlatformCoverage[];
    filteredPlatformCoverage?: PlatformCoverage[];
  };
  generatedAt: string;
  source: string;
}

export function ExplorePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const savedIds = useSavedTitleIds();
  const [panelOpen, setPanelOpen] = useState(false);

  const sort = (SORTS.find((entry) => entry.key === searchParams.get("sort"))?.key ?? "popular") as SortKey;
  const sortExplicit = Boolean(searchParams.get("sort"));
  const showParam = searchParams.get("show") ?? undefined;

  const filters = filtersFromSearchParams(searchParams);
  const activeFilters = countActiveTitleFilters(filters);
  // 헤더 스펙트럼/그라데이션이 강조할 장르 — 선택한 첫 장르(없으면 미강조).
  const heroGenre = filters.genres[0];

  // 패널/칩이 바꾼 상태를 서버 파라미터 + 클라 전용 파라미터로 직렬화해 URL에 반영.
  // sort/show는 명시 override가 없으면 기존 값을 보존한다(show는 필터 변경 시 초기화).
  const writeState = (next: TitleFilterState, override?: { sort?: SortKey | null; show?: string | null }) => {
    const extra: Record<string, string> = { ...clientOnlyParams(next) };
    const nextSort = override && "sort" in override ? override.sort : sortExplicit ? sort : null;
    if (nextSort) extra.sort = nextSort;
    const nextShow = override && "show" in override ? override.show : null;
    if (nextShow) extra.show = nextShow;
    setSearchParams(new URLSearchParams(titleFiltersToParams(next, extra)));
  };

  const applyFilters = (next: TitleFilterState) => writeState(next);
  const changeSort = (key: SortKey) => writeState(filters, { sort: key, show: showParam ?? null });
  const showMore = () => writeState(filters, { sort: sortExplicit ? sort : null, show: String(showCount + pageSize) });

  // 빌드된 서버 쿼리(현재 URL 그대로 사용). useApiResource가 키스트로크당 네트워크를 보장.
  const query = searchParams.toString();
  const { data, loading, error, reload } = useApiResource<ExploreResponse>(
    query ? `/api/explore?${query}` : "/api/explore",
    "탐색 데이터를 불러오지 못했습니다."
  );
  const rawResults = data?.results ?? [];
  // 서버가 적용하지 못한 클라 전용 facet(가격 정밀·내 찜만)을 결과에 추가 적용.
  const results = applyClientOnlyFilters(rawResults, filters, savedIds);
  const showCount = data?.showCount ?? 40;
  const pageSize = data?.pageSize ?? 40;
  const shown = results.slice(0, showCount);
  const tags = data?.tags ?? [];
  // 데이터에 존재하는 플랫폼만 패널에 노출(빈 플랫폼 숨김).
  const platformOptions = data?.catalog?.platformCoverage?.map((entry) => entry.id);
  const hasFilter = sortExplicit || activeFilters > 0;
  const accent = heroGenre ? genreColor(heroGenre, 0.84) : undefined;

  return (
    <div>
      <section className="relative overflow-hidden border-b border-line bg-ledger">
        {heroGenre && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(120% 90% at 18% -10%, ${genreTint(
                heroGenre,
                0.22
              )}, transparent 60%)`,
            }}
            aria-hidden
          />
        )}
        <Container size="wide" className="relative py-12 lg:py-16">
          <div className="flex items-center gap-2 text-accent">
            <Compass size={15} strokeWidth={2} />
            <p className="eyebrow">GENRE SPECTRUM / 탐색</p>
          </div>

          <div className="mt-4 max-w-2xl">
            <h1 className="text-pretty text-3xl font-bold leading-[1.1] sm:text-4xl">
              색을 따라 떠나는{" "}
              {heroGenre ? (
                <span style={{ color: accent }}>{heroGenre}</span>
              ) : (
                <span className="font-serif font-normal italic text-accent">스펙트럼 탐색</span>
              )}
            </h1>
            <p className="mt-3.5 text-pretty text-sm leading-relaxed text-fg-2 sm:text-base">
              장르·태그·유형별로 웹툰과 웹소설을 좁혀봅니다. 작품 카드에는 줄거리와 연재 상태가 함께
              표시되어 무슨 작품인지 바로 판단할 수 있습니다.
            </p>
          </div>

          <div className="mt-8">
            <div className="h-2 w-full rounded-full" style={{ background: spectrumGradient([...GENRES]) }} aria-hidden />
            <div className="mt-4 flex flex-wrap gap-2">
              {GENRES.map((entry) => {
                const active = filters.genres.includes(entry);
                return (
                  <button
                    key={entry}
                    type="button"
                    onClick={() => applyFilters({ ...filters, genres: toggleValue(filters.genres, entry) })}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium",
                      "transition-[transform,background-color,border-color,box-shadow] duration-200 ease-out-expo",
                      "hover:-translate-y-px",
                      active && "ring-1"
                    )}
                    style={{
                      color: genreColor(entry, active ? 0.92 : 0.82),
                      backgroundColor: genreTint(entry, active ? 0.3 : 0.12),
                      borderColor: genreBorder(entry, active ? 0.7 : 0.26),
                    }}
                  >
                    {entry}
                  </button>
                );
              })}
            </div>
          </div>
        </Container>
      </section>

      <Container size="wide" className="flex flex-col gap-8 py-10">
        <div>
          <p className="eyebrow mb-3 text-fg-3">BY CODE / 코드로 좁히기</p>
          <div className="flex flex-wrap gap-2">
            {tags.map(({ tag: entry, count }) => {
              const active = filters.tags.includes(entry);
              return (
                <button
                  key={entry}
                  type="button"
                  onClick={() => applyFilters({ ...filters, tags: toggleValue(filters.tags, entry) })}
                  aria-pressed={active}
                  className={cn(
                    "group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors duration-150",
                    active
                      ? "border-accent/60 bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg"
                  )}
                >
                  <span className={cn(active ? "text-accent" : "text-fg-3 group-hover:text-accent")}>#</span>
                  {entry}
                  <span className="tnum text-xs text-fg-3">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-4 border-y border-line py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="inline-flex items-center rounded-lg border border-line bg-card p-0.5" role="group" aria-label="작품 유형">
              {TYPES.map((entry) => {
                const active =
                  entry.value === "all"
                    ? filters.types.length === 0
                    : filters.types.length === 1 && filters.types[0] === entry.value;
                return (
                  <button
                    key={entry.value}
                    type="button"
                    onClick={() =>
                      applyFilters({
                        ...filters,
                        types: entry.value === "all" ? [] : [entry.value],
                      })
                    }
                    aria-pressed={active}
                    className={cn(
                      "rounded-md px-3 py-1 text-sm font-medium transition-colors duration-150",
                      active ? "bg-accent text-on-accent" : "text-fg-2 hover:text-fg"
                    )}
                  >
                    {entry.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1">
              {SORTS.map((entry) => {
                const active = entry.key === sort;
                return (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => changeSort(entry.key)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-sm transition-colors duration-150",
                      active ? "font-semibold text-fg" : "font-medium text-fg-3 hover:text-fg-2"
                    )}
                  >
                    {entry.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setPanelOpen((open) => !open)}
              aria-expanded={panelOpen}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors duration-150",
                panelOpen || activeFilters > 0
                  ? "border-accent/60 bg-accent-soft/60 text-fg"
                  : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg"
              )}
            >
              <SlidersHorizontal size={14} className="text-accent" />
              상세 필터
              {activeFilters > 0 && (
                <span className="rounded-full bg-accent/15 px-1.5 text-[0.68rem] text-accent">{activeFilters}</span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-4">
            <p className="text-sm text-fg-2">
              작품 <span className="numeral text-base text-fg">{results.length.toLocaleString("ko-KR")}</span>편
            </p>
            <button
              type="button"
              onClick={reload}
              className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-fg-3 transition-colors duration-150 hover:text-accent"
            >
              <RefreshCw size={13} className={cn(loading && "animate-spin")} />
              갱신
            </button>
            {hasFilter && (
              <Link
                href="/explore"
                className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-fg-3 transition-colors duration-150 hover:text-accent"
              >
                <RotateCcw size={13} />
                필터 초기화
              </Link>
            )}
          </div>
        </div>

        {panelOpen && (
          <TitleFilterPanel
            value={filters}
            onChange={applyFilters}
            facets={[...FACETS]}
            platformOptions={platformOptions}
            savedCount={savedIds.size}
          />
        )}

        {loading ? (
          <div className="grid grid-cols-2 gap-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, index) => (
              <div key={index} className="space-y-3">
                <span className="skeleton block aspect-[3/4] rounded-xl" />
                <span className="skeleton block h-4 w-3/4" />
                <span className="skeleton block h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : error ? (
          <ErrorState title="탐색 데이터를 불러오지 못했습니다." message={error} onRetry={reload} />
        ) : results.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {shown.map((title) => (
                <TitleCard key={title.id} title={title} />
              ))}
            </div>
            {results.length > shown.length && (
              <div className="mt-10 flex justify-center">
                <button
                  type="button"
                  onClick={showMore}
                  className="inline-flex items-center gap-2 rounded-xl border border-line bg-card px-5 py-2.5 text-sm font-medium text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
                >
                  더 보기
                  <span className="numeral text-fg-3">
                    {shown.length} / {results.length}
                  </span>
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-line bg-card/40 p-12 text-center">
            <p className="text-sm font-medium text-fg">조건에 맞는 작품이 없어요.</p>
            <p className="mt-1 text-xs text-fg-3">장르나 태그 필터를 조금 넓혀보세요.</p>
          </div>
        )}
      </Container>
    </div>
  );
}

function toggleValue<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((entry) => entry !== value) : [...arr, value];
}
