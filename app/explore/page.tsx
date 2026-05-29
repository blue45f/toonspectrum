import type { Metadata } from "next";
import Link from "next/link";
import { TITLES, activeTags } from "@/lib/data";
import { searchTitles, type SortKey } from "@/lib/search";
import { GENRES, TYPE_LABEL } from "@/lib/taxonomy";
import type { WorkType } from "@/lib/types";
import { Container } from "@/components/section";
import { TitleCard } from "@/components/title-card";
import { genreColor, genreTint, genreBorder, spectrumGradient } from "@/lib/genre-color";
import { cn } from "@/lib/utils";
import { genreVibe } from "./_components/genre-vibe";
import { ArrowUpRight, Compass, RotateCcw } from "lucide-react";

export const metadata: Metadata = {
  title: "장르 스펙트럼 탐색",
  description:
    "18개 장르가 각자의 색을 가집니다. 색과 태그를 따라 웹툰·웹소설을 발견하세요.",
};

type SP = Record<string, string | undefined>;

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

// 현재 필터 상태를 유지하며 한 축만 바꾼 쿼리스트링 생성
function buildHref(base: SP, patch: Partial<SP>): string {
  const merged: SP = { ...base, ...patch };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `/explore?${qs}` : "/explore";
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  const genre = sp.genre && GENRES.includes(sp.genre as (typeof GENRES)[number]) ? sp.genre : undefined;
  const tag = sp.tag || undefined;
  const type =
    sp.type === "webtoon" || sp.type === "webnovel" ? (sp.type as WorkType) : undefined;
  const sort: SortKey =
    sp.sort === "rating" || sp.sort === "trending" || sp.sort === "newest" || sp.sort === "popular"
      ? sp.sort
      : "popular";

  // 현재 활성 필터를 유지하는 base (정규화된 값만)
  const current: SP = {
    genre,
    tag,
    type,
    sort: sp.sort ? sort : undefined,
  };

  const results = searchTitles(
    TITLES,
    {
      genres: genre ? [genre] : undefined,
      tags: tag ? [tag] : undefined,
      types: type ? [type] : undefined,
    },
    sort
  );

  const tags = activeTags().slice(0, 18);
  const hasFilter = Boolean(genre || tag || type || sp.sort);
  const accent = genre ? genreColor(genre, 0.84) : undefined;

  return (
    <div>
      {/* ░░ SPECTRUM HEADER BAND ░░ */}
      <section className="relative overflow-hidden border-b border-line bg-ledger">
        {/* 활성 장르일 때 해당 색으로 헤더를 은은하게 틴트 */}
        {genre && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(120% 90% at 18% -10%, ${genreTint(
                genre,
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
            <h1 className="text-pretty text-3xl font-bold leading-[1.1] tracking-[-0.02em] sm:text-4xl">
              색을 따라 떠나는{" "}
              {genre ? (
                <span style={{ color: accent }}>{genre}</span>
              ) : (
                <span className="font-serif font-normal italic text-accent">스펙트럼 탐색</span>
              )}
            </h1>
            <p className="mt-3.5 text-pretty text-sm leading-relaxed text-fg-2 sm:text-base">
              {genre ? (
                <span className="font-serif italic text-fg">{genreVibe(genre)}</span>
              ) : (
                "18개 장르가 색상환 위에서 각자의 색을 가집니다. 색과 코드(태그)를 따라 다음 정주행작을 발견하세요."
              )}
            </p>
          </div>

          {/* 전체 18색 스펙트럼 바 */}
          <div className="mt-8">
            <div
              className="h-2 w-full rounded-full"
              style={{ background: spectrumGradient([...GENRES]) }}
              aria-hidden
            />
            {/* 18개 장르 색 칩 (Link). 활성 장르는 알파/링으로 강조 */}
            <div className="mt-4 flex flex-wrap gap-2">
              {GENRES.map((g) => {
                const active = g === genre;
                return (
                  <Link
                    key={g}
                    href={buildHref(current, { genre: active ? undefined : g })}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium",
                      "transition-[transform,background-color,border-color,box-shadow] duration-200 ease-out-expo",
                      "hover:-translate-y-px",
                      active && "ring-1"
                    )}
                    style={{
                      color: genreColor(g, active ? 0.92 : 0.82),
                      backgroundColor: genreTint(g, active ? 0.3 : 0.12),
                      borderColor: genreBorder(g, active ? 0.7 : 0.26),
                      ...(active
                        ? ({ ["--tw-ring-color" as string]: genreBorder(g, 0.55) } as React.CSSProperties)
                        : {}),
                    }}
                  >
                    {g}
                  </Link>
                );
              })}
            </div>
          </div>
        </Container>
      </section>

      <Container size="wide" className="flex flex-col gap-8 py-10">
        {/* ░░ TAG CLOUD ░░ */}
        <div>
          <p className="eyebrow mb-3 text-fg-3">BY CODE / 코드로 좁히기</p>
          <div className="flex flex-wrap gap-2">
            {tags.map(({ tag: t, count }) => {
              const active = t === tag;
              return (
                <Link
                  key={t}
                  href={buildHref(current, { tag: active ? undefined : t })}
                  aria-pressed={active}
                  className={cn(
                    "group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors duration-150",
                    active
                      ? "border-accent/60 bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg"
                  )}
                >
                  <span className={cn(active ? "text-accent" : "text-fg-3 group-hover:text-accent")}>
                    #
                  </span>
                  {t}
                  <span className="tnum text-xs text-fg-3">{count}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* ░░ CONTROL ROW ░░ */}
        <div className="flex flex-col gap-4 border-y border-line py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {/* 타입 토글 (segmented) */}
            <div
              className="inline-flex items-center rounded-lg border border-line bg-card p-0.5"
              role="group"
              aria-label="작품 유형"
            >
              {TYPES.map((t) => {
                const active = t.value === "all" ? !type : t.value === type;
                return (
                  <Link
                    key={t.value}
                    href={buildHref(current, {
                      type: t.value === "all" ? undefined : t.value,
                    })}
                    aria-pressed={active}
                    className={cn(
                      "rounded-md px-3 py-1 text-sm font-medium transition-colors duration-150",
                      active
                        ? "bg-accent text-on-accent"
                        : "text-fg-2 hover:text-fg"
                    )}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </div>

            {/* 정렬 (quiet links) */}
            <div className="flex items-center gap-1">
              {SORTS.map((s) => {
                const active = s.key === sort;
                return (
                  <Link
                    key={s.key}
                    href={buildHref(current, { sort: s.key })}
                    aria-pressed={active}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-sm transition-colors duration-150",
                      active
                        ? "font-semibold text-fg"
                        : "font-medium text-fg-3 hover:text-fg-2"
                    )}
                  >
                    {s.label}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <p className="text-sm text-fg-2">
              작품 <span className="numeral text-base text-fg">{results.length}</span>편
            </p>
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

        {/* ░░ RESULT GRID / EMPTY STATE ░░ */}
        {results.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {results.map((t) => (
              <TitleCard key={t.id} title={t} />
            ))}
          </div>
        ) : (
          <EmptyState current={current} />
        )}
      </Container>
    </div>
  );
}

// 빈 상태 — "없음"이 아니라 인터페이스를 가르친다.
function EmptyState({ current }: { current: SP }) {
  // 데이터에 많이 등장하는 장르 몇 개를 안내
  const suggestions = ["로맨스", "판타지", "액션"];
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center rounded-2xl border border-line bg-card px-6 py-12 text-center surface-hl">
      <div
        className="h-1.5 w-28 rounded-full"
        style={{ background: spectrumGradient(suggestions) }}
        aria-hidden
      />
      <h2 className="mt-6 text-pretty text-lg font-bold text-fg">
        이 조합에 맞는 작품이 아직 없어요
      </h2>
      <p className="mt-2 text-pretty text-sm leading-relaxed text-fg-3">
        장르와 태그를 함께 걸면 결과가 좁아집니다. 태그를 하나 풀거나, 아래 인기 장르의 색부터
        다시 시작해 보세요.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {suggestions.map((g) => (
          <Link
            key={g}
            href={buildHref({ sort: current.sort }, { genre: g })}
            className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium transition-transform duration-150 ease-out-expo hover:-translate-y-px"
            style={{
              color: genreColor(g, 0.85),
              backgroundColor: genreTint(g, 0.14),
              borderColor: genreBorder(g, 0.3),
            }}
          >
            {g}
            <ArrowUpRight size={13} className="opacity-70" />
          </Link>
        ))}
      </div>
      <Link
        href="/explore"
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-fg-2 transition-colors duration-150 hover:text-accent"
      >
        <RotateCcw size={13} />
        전체 작품 보기
      </Link>
    </div>
  );
}
