import Link from "@/src/compat/router-link";
import { useSearchParams } from "react-router-dom";
import { Container } from "@/components/section";
import { TitleCard } from "@/components/title-card";
import { buttonClass } from "@/components/ui/button";
import { genreBorder, genreColor, genreTint, spectrumGradient } from "@/lib/genre-color";
import type { SortKey } from "@/lib/search";
import { GENRES, TYPE_LABEL } from "@/lib/taxonomy";
import type { Title, WorkType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AlertTriangle, Compass, RefreshCw, RotateCcw } from "lucide-react";
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

function buildHref(base: ExploreParams, patch: Partial<ExploreParams>): string {
  const merged: ExploreParams = { ...base, ...patch };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `/explore?${query}` : "/explore";
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
  generatedAt: string;
  source: string;
}

export function ExplorePage() {
  const [searchParams] = useSearchParams();
  const genre = searchParams.get("genre") ?? undefined;
  const tag = searchParams.get("tag") ?? undefined;
  const type = searchParams.get("type") as WorkType | undefined;
  const sort = (SORTS.find((entry) => entry.key === searchParams.get("sort"))?.key ?? "popular") as SortKey;
  const fallbackCurrent = {
    genre: genre && GENRES.includes(genre as (typeof GENRES)[number]) ? genre : undefined,
    tag,
    type: type === "webtoon" || type === "webnovel" ? type : undefined,
    sort: searchParams.get("sort") ? sort : undefined,
  };
  const query = searchParams.toString();
  const { data, loading, error, reload } = useApiResource<ExploreResponse>(
    query ? `/api/explore?${query}` : "/api/explore",
    "탐색 데이터를 불러오지 못했습니다."
  );
  const current = data?.current ?? fallbackCurrent;
  const results = data?.results ?? [];
  const shown = data?.shown ?? [];
  const showCount = data?.showCount ?? 40;
  const pageSize = data?.pageSize ?? 40;
  const tags = data?.tags ?? [];
  const hasFilter = Boolean(current.genre || current.tag || current.type || current.sort);
  const accent = current.genre ? genreColor(current.genre, 0.84) : undefined;

  return (
    <div>
      <section className="relative overflow-hidden border-b border-line bg-ledger">
        {current.genre && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(120% 90% at 18% -10%, ${genreTint(
                current.genre,
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
              {current.genre ? (
                <span style={{ color: accent }}>{current.genre}</span>
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
                const active = entry === current.genre;
                return (
                  <Link
                    key={entry}
                    href={buildHref(current, { genre: active ? undefined : entry })}
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
                  </Link>
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
              const active = entry === current.tag;
              return (
                <Link
                  key={entry}
                  href={buildHref(current, { tag: active ? undefined : entry })}
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
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-4 border-y border-line py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="inline-flex items-center rounded-lg border border-line bg-card p-0.5" role="group" aria-label="작품 유형">
              {TYPES.map((entry) => {
                const active = entry.value === "all" ? !current.type : entry.value === current.type;
                return (
                  <Link
                    key={entry.value}
                    href={buildHref(current, { type: entry.value === "all" ? undefined : entry.value })}
                    aria-pressed={active}
                    className={cn(
                      "rounded-md px-3 py-1 text-sm font-medium transition-colors duration-150",
                      active ? "bg-accent text-on-accent" : "text-fg-2 hover:text-fg"
                    )}
                  >
                    {entry.label}
                  </Link>
                );
              })}
            </div>

            <div className="flex items-center gap-1">
              {SORTS.map((entry) => {
                const active = entry.key === sort;
                return (
                  <Link
                    key={entry.key}
                    href={buildHref(current, { sort: entry.key })}
                    aria-pressed={active}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-sm transition-colors duration-150",
                      active ? "font-semibold text-fg" : "font-medium text-fg-3 hover:text-fg-2"
                    )}
                  >
                    {entry.label}
                  </Link>
                );
              })}
            </div>
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
          <div className="rounded-2xl border border-bad/40 bg-[oklch(0.66_0.2_25/0.12)] p-12 text-center">
            <AlertTriangle size={24} className="mx-auto mb-3 text-bad" />
            <p className="text-sm font-medium text-fg">탐색 데이터를 불러오지 못했습니다.</p>
            <p className="mt-1 text-xs text-fg-3">{error}</p>
            <button
              type="button"
              onClick={reload}
              className={buttonClass({ size: "sm", variant: "outline", className: "mt-4" })}
            >
              다시 시도
            </button>
          </div>
        ) : results.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {shown.map((title) => (
                <TitleCard key={title.id} title={title} />
              ))}
            </div>
            {results.length > shown.length && (
              <div className="mt-10 flex justify-center">
                <Link
                  href={buildHref(current, { show: String(showCount + pageSize) })}
                  className="inline-flex items-center gap-2 rounded-xl border border-line bg-card px-5 py-2.5 text-sm font-medium text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
                >
                  더 보기
                  <span className="numeral text-fg-3">
                    {shown.length} / {results.length}
                  </span>
                </Link>
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
