import Link from "@/src/compat/router-link";
import { AdaptationGraph } from "@/components/adaptation-graph";
import { CountUp } from "@/components/count-up";
import { HomePersonal } from "@/components/home-personal";
import { OpenSearchButton } from "@/components/open-search-button";
import { Rail, Section, Container } from "@/components/section";
import { TitleCard } from "@/components/title-card";
import { TitlePoster } from "@/components/title-poster";
import { AvailabilityDots } from "@/components/availability";
import { buttonClass } from "@/components/ui/button";
import { ErrorState } from "@/src/components/error-state";
import { GenreChip } from "@/components/ui/chip";
import { RatingInline } from "@/components/ui/stars";
import { GenreSpectrum } from "@/components/ui/spectrum-bar";
import { genreColor } from "@/lib/genre-color";
import { GENRES } from "@/lib/taxonomy";
import { statsAreEstimated } from "@/lib/estimate";
import type { Title } from "@/lib/types";
import { formatCount } from "@/lib/utils";
import { ArrowRight, Layers, Search } from "lucide-react";
import { useApiResource } from "./use-api-resource";

interface HomeResponse {
  featured: Title[];
  spotlight: Title | null;
  topRated: Title[];
  waitFree: Title[];
  newest: Title[];
  families: { original: Title; adaptations: Title[] }[];
  tags: { tag: string; count: number }[];
  todayDay: string;
  todayReleases: Title[];
  stats: {
    titles: number;
    platforms: number;
    genres: number;
    reviews: number;
  };
  generatedAt: string;
}

export function HomePage() {
  const { data, loading, error, reload } = useApiResource<HomeResponse>("/api/home", "홈 데이터를 불러오지 못했습니다.");

  if (loading) {
    return (
      <div>
        <section className="border-b border-line bg-ledger">
          <Container size="wide" className="grid items-center gap-12 py-14 lg:grid-cols-[1.15fr_0.85fr] lg:py-20">
            <div className="space-y-5">
              <span className="skeleton block h-4 w-56" />
              <span className="skeleton block h-16 w-4/5" />
              <span className="skeleton block h-5 w-96 max-w-full" />
              <span className="skeleton block h-11 w-64" />
            </div>
            <span className="skeleton block aspect-[4/3] rounded-2xl" />
          </Container>
        </section>
        <Container size="wide" className="grid grid-cols-2 gap-4 py-16 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <span key={index} className="skeleton block aspect-[3/4] rounded-xl" />
          ))}
        </Container>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Container size="wide" className="py-10">
        <ErrorState title="홈 데이터를 불러오지 못했습니다." message={error} onRetry={reload} />
      </Container>
    );
  }

  const {
    featured,
    spotlight,
    topRated,
    waitFree,
    newest,
    families,
    tags,
    todayDay,
    todayReleases,
    stats,
  } = data;

  return (
    <div>
      <section className="relative overflow-hidden border-b border-line bg-ledger">
        <div
          className="pointer-events-none absolute -top-1/3 right-0 h-[60rem] w-[60rem] opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, oklch(0.72 0.185 42 / 0.35), transparent 60%)" }}
          aria-hidden
        />
        <Container
          size="wide"
          className="relative grid items-center gap-12 py-14 lg:grid-cols-[1.15fr_0.85fr] lg:py-20"
        >
          <div style={{ animation: "fade-up 0.6s var(--ease-out-expo) both" }}>
            <p className="eyebrow text-accent">WEBTOON × WEBNOVEL · Vite React</p>
            <h1 className="mt-4 text-pretty text-4xl font-bold leading-[1.08] sm:text-5xl lg:text-[3.6rem]">
              흩어진 이야기를,
              <br />
              <span className="font-serif font-normal italic text-accent">한 권의 색인</span>으로.
            </h1>
            <p className="mt-5 max-w-md text-pretty text-base leading-relaxed text-fg-2">
              네이버 웹툰·시리즈와 카카오웹툰을 가로질러 검색하고, 실시간 신호와 독자 취향을 함께
              읽어 무엇을 볼지 빠르게 좁힙니다.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <OpenSearchButton className={buttonClass({ size: "lg", className: "gap-2.5" })}>
                <Search size={18} />
                작품·작가·태그 검색
                <kbd className="ml-1 rounded-md bg-black/15 px-1.5 py-0.5 text-[0.7rem]">⌘K</kbd>
              </OpenSearchButton>
              <Link href="/ranking" className={buttonClass({ variant: "outline", size: "lg" })}>
                통합 랭킹 보기
                <ArrowRight size={17} />
              </Link>
            </div>

            <dl className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-3 border-t border-line pt-5">
              {[
                { v: stats.titles, suffix: "", label: "수록 작품" },
                { v: stats.platforms, suffix: "", label: "연재 플랫폼" },
                { v: stats.genres, suffix: "", label: "장르 스펙트럼" },
                { v: stats.reviews, suffix: "+", label: "독자 리뷰" },
              ].map((item) => (
                <div key={item.label} className="flex items-baseline gap-2">
                  <dd className="numeral text-2xl text-fg">
                    <CountUp value={item.v} suffix={item.suffix} />
                  </dd>
                  <dt className="text-xs text-fg-3">{item.label}</dt>
                </div>
              ))}
            </dl>
          </div>

          {spotlight && (
            <div className="relative" style={{ animation: "fade-up 0.7s var(--ease-out-expo) 0.1s both" }}>
              <div className="absolute -top-3 left-4 z-10">
                <span className="eyebrow rounded-full border border-accent/40 bg-accent-soft px-3 py-1 text-accent">
                  이 주의 발견
                </span>
              </div>
              <Link
                href={`/title/${spotlight.slug}`}
                className="group block overflow-hidden rounded-2xl border border-line bg-card surface-hl"
              >
                <div className="grid grid-cols-[1.1fr_1fr]">
                  <div className="transition-transform duration-500 ease-out-expo group-hover:scale-[1.03]">
                    <TitlePoster title={spotlight} size="lg" className="rounded-none border-0" priority />
                  </div>
                  <div className="flex flex-col gap-3 p-5">
                    <div className="flex flex-wrap gap-1.5">
                      {spotlight.genres.slice(0, 2).map((genre) => (
                        <GenreChip key={genre} genre={genre} size="sm" />
                      ))}
                    </div>
                    <h3 className="text-pretty text-xl font-bold leading-tight">{spotlight.title}</h3>
                    <RatingInline
                      value={spotlight.stats.ratingAvg}
                      count={spotlight.stats.ratingCount}
                      estimated={statsAreEstimated(spotlight)}
                      size="sm"
                    />
                    <p className="font-serif text-sm italic leading-relaxed text-fg-2">
                      {spotlight.editorNote ?? spotlight.synopsis}
                    </p>
                    <div className="mt-auto flex items-center justify-between border-t border-line pt-3">
                      <AvailabilityDots availability={spotlight.availability} max={4} />
                      <span className="text-xs font-medium text-accent">
                        {formatCount(spotlight.stats.views)} 조회
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          )}
        </Container>
      </section>

      <Container size="wide" className="reveal-children flex flex-col gap-20 py-16">
        <HomePersonal />

        {todayReleases.length > 0 && (
          <Section
            eyebrow="TODAY"
            title={`오늘(${todayDay}) 새로 올라오는`}
            desc="오늘 새 회차가 공개되는 연재작"
            action={{ label: "연재 캘린더", href: "/calendar" }}
          >
            <Rail>
              {todayReleases.map((title) => (
                <TitleCard key={title.id} title={title} />
              ))}
            </Rail>
          </Section>
        )}

        <Section
          eyebrow="GENRE SPECTRUM"
          title="장르로 떠나는 탐색"
          desc="장르마다 다른 색을 따라 다음 정주행작을 발견하세요."
          action={{ label: "스펙트럼 탐색", href: "/explore" }}
        >
          <GenreSpectrum
            genres={[...GENRES]}
            height={10}
            interactive
            label={`전체 장르 스펙트럼 (${GENRES.length}개)`}
            className="mb-5"
          />
          <div className="flex flex-wrap gap-2">
            {GENRES.map((genre) => (
              <Link key={genre} href={`/explore?genre=${encodeURIComponent(genre)}`}>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-transform duration-150 hover:scale-105"
                  style={{
                    color: genreColor(genre, 0.85),
                    backgroundColor: `color-mix(in oklch, ${genreColor(genre, 0.6)} 14%, transparent)`,
                    borderColor: `color-mix(in oklch, ${genreColor(genre, 0.6)} 32%, transparent)`,
                  }}
                >
                  {genre}
                </span>
              </Link>
            ))}
          </div>
        </Section>

        <Section
          eyebrow="ADAPTATION GRAPH"
          title="원작에서 웹툰까지, 한 우주"
          desc="웹소설과 웹툰이 이어지는 관계를 같은 이야기의 계보로 묶었습니다."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            {families.map(({ original, adaptations }) => (
              <div key={original.id} className="rounded-2xl border border-line bg-card p-5 surface-hl">
                <div className="mb-4 flex items-center gap-2 text-fg-3">
                  <Layers size={14} />
                  <span className="eyebrow text-[0.62rem]">{original.title} 유니버스</span>
                </div>
                <AdaptationGraph original={original} adaptations={adaptations} />
              </div>
            ))}
          </div>
        </Section>

        <Section
          eyebrow="EDITOR'S PICK"
          title="에디터의 발견"
          desc="수치 너머 작품 설명과 독자 반응을 함께 볼 수 있는 추천 묶음"
          action={{ label: "더 보기", href: "/explore?sort=rating" }}
        >
          <Rail>
            {featured.map((title) => (
              <TitleCard key={title.id} title={title} />
            ))}
          </Rail>
        </Section>

        <Section
          eyebrow="TOP RATED"
          title="평점이 검증한 명작"
          desc="독자 평점 베이즈 보정 상위작"
          action={{ label: "평점 랭킹", href: "/ranking?axis=rating" }}
        >
          <Rail>
            {topRated.map((title) => (
              <TitleCard key={title.id} title={title} />
            ))}
          </Rail>
        </Section>

        <Section
          eyebrow="FREE TO START"
          title="지금 무료로 시작하기"
          desc="무료 공개 · 기다리면 무료로 진입 가능한 작품"
          action={{ label: "전체 보기", href: "/search?free=1" }}
        >
          <Rail>
            {waitFree.map((title) => (
              <TitleCard key={title.id} title={title} />
            ))}
          </Rail>
        </Section>

        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.4fr]">
          <Section eyebrow="BY MOOD" title="코드로 찾기" desc="작품의 결을 나타내는 특성 태그">
            <div className="flex flex-wrap gap-2">
              {tags.map(({ tag, count }) => (
                <Link
                  key={tag}
                  href={`/explore?tag=${encodeURIComponent(tag)}`}
                  className="group inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-sm text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
                >
                  <span className="text-fg-3 group-hover:text-accent">#</span>
                  {tag}
                  <span className="tnum text-xs text-fg-3">{count}</span>
                </Link>
              ))}
            </div>
          </Section>

          <Section
            eyebrow="FRESH"
            title="신작 발굴"
            desc="최근 합류한 라이징 작품"
            action={{ label: "신작 랭킹", href: "/ranking?axis=rookie" }}
          >
            {/* 리드 1작은 가로 에디토리얼 카드(2칸), 나머지는 그리드 — 균일 매트릭스 탈피 */}
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
              {newest.slice(0, 7).map((title, i) =>
                i === 0 ? (
                  <TitleCard
                    key={title.id}
                    title={title}
                    feature
                    className="col-span-2"
                  />
                ) : (
                  <TitleCard key={title.id} title={title} size="sm" />
                )
              )}
            </div>
          </Section>
        </div>
      </Container>
    </div>
  );
}
