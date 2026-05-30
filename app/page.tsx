import Link from "next/link";
import { TITLES, adaptationsOf, activeTags, SEED_REVIEWS } from "@/lib/data";
import { PLATFORM_LIST } from "@/lib/platforms";
import { GENRES, WEEK_DAYS } from "@/lib/taxonomy";
import { rankBy } from "@/lib/ranking";
import { sortTitles } from "@/lib/search";
import { Container, Section, Rail } from "@/components/section";
import { TitleCard } from "@/components/title-card";
import { LiveRanking } from "@/components/live-ranking";
import { AdaptationGraph } from "@/components/adaptation-graph";
import { TitlePoster } from "@/components/title-poster";
import { RatingInline } from "@/components/ui/stars";
import { GenreChip } from "@/components/ui/chip";
import { AvailabilityDots } from "@/components/availability";
import { OpenSearchButton } from "@/components/open-search-button";
import { HomePersonal } from "@/components/home-personal";
import { CountUp } from "@/components/count-up";
import { buttonClass } from "@/components/ui/button";
import { genreColor, spectrumGradient } from "@/lib/genre-color";
import { formatCount, kstDayOfWeek } from "@/lib/utils";
import { Search, ArrowRight, Layers } from "lucide-react";

// '오늘 연재'/실시간 랭킹 신선도를 명시적으로 고정 (자식 fetch revalidate에 암묵 의존하지 않도록)
export const revalidate = 600;

export default function HomePage() {
  const featured = TITLES.filter((t) => t.featured);
  const spotlight = [...featured].sort((a, b) => b.stats.views - a.stats.views)[0];
  const topRated = rankBy(TITLES, "rating", { limit: 12 }).map((r) => r.title);
  const waitFree = sortTitles(
    TITLES.filter((t) =>
      t.availability.some((a) => a.pricing === "free" || a.pricing === "wait-free")
    ),
    "popular"
  ).slice(0, 12);
  const newest = sortTitles(TITLES, "newest").slice(0, 12);

  const families = TITLES.filter((t) => t.type === "webnovel" && adaptationsOf(t).length > 0)
    .map((novel) => ({ original: novel, adaptations: adaptationsOf(novel) }))
    .sort((a, b) => b.original.stats.views - a.original.stats.views)
    .slice(0, 3);

  const tags = activeTags().slice(0, 14);

  // 오늘 연재 (실제 연재요일 기반, KST)
  const todayDay = WEEK_DAYS[[6, 0, 1, 2, 3, 4, 5][kstDayOfWeek()]];
  const todayReleases = TITLES.filter(
    (t) => t.type === "webtoon" && t.status === "ongoing" && t.updateDays?.includes(todayDay)
  )
    .sort((a, b) => b.stats.views - a.stats.views)
    .slice(0, 12);

  return (
    <div>
      {/* ░░ HERO ░░ */}
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
            <p className="eyebrow text-accent">WEBTOON × WEBNOVEL · 통합 인덱스</p>
            <h1 className="mt-4 text-pretty text-4xl font-bold leading-[1.08] tracking-[-0.02em] sm:text-5xl lg:text-[3.6rem]">
              흩어진 이야기를,
              <br />
              <span className="font-serif font-normal italic text-accent">한 권의 색인</span>으로.
            </h1>
            <p className="mt-5 max-w-md text-pretty text-base leading-relaxed text-fg-2">
              네이버·카카오·리디·문피아·노벨피아를 가로질러 검색하고, 6개 축으로 줄 세우고, 솔직한
              리뷰로 정합니다. 무엇을, 어디서, 왜 봐야 하는지 한 곳에서.
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
                { v: TITLES.length, suffix: "", label: "수록 작품" },
                { v: PLATFORM_LIST.length, suffix: "", label: "연재 플랫폼" },
                { v: GENRES.length, suffix: "", label: "장르 스펙트럼" },
                { v: SEED_REVIEWS.length, suffix: "+", label: "독자 리뷰" },
              ].map((s) => (
                <div key={s.label} className="flex items-baseline gap-2">
                  <dd className="numeral text-2xl text-fg">
                    <CountUp value={s.v} suffix={s.suffix} />
                  </dd>
                  <dt className="text-xs text-fg-3">{s.label}</dt>
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
                    <TitlePoster title={spotlight} size="lg" className="rounded-none border-0" />
                  </div>
                  <div className="flex flex-col gap-3 p-5">
                    <div className="flex flex-wrap gap-1.5">
                      {spotlight.genres.slice(0, 2).map((g) => (
                        <GenreChip key={g} genre={g} size="sm" />
                      ))}
                    </div>
                    <h3 className="text-pretty text-xl font-bold leading-tight">{spotlight.title}</h3>
                    <RatingInline
                      value={spotlight.stats.ratingAvg}
                      count={spotlight.stats.ratingCount}
                      size="sm"
                    />
                    {spotlight.editorNote && (
                      <p className="font-serif text-sm italic leading-relaxed text-fg-2">
                        “{spotlight.editorNote}”
                      </p>
                    )}
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

        <Section
          eyebrow="LIVE RANKING"
          title="실시간 인기 랭킹"
          desc="네이버·카카오에서 지금 가장 뜨거운 작품을 실시간 집계"
          action={{ label: "전체 랭킹", href: "/ranking" }}
        >
          <LiveRanking />
        </Section>

        {todayReleases.length > 0 && (
          <Section
            eyebrow="TODAY"
            title={`오늘(${todayDay}) 새로 올라오는`}
            desc="오늘 새 회차가 공개되는 연재작"
            action={{ label: "연재 캘린더", href: "/calendar" }}
          >
            <Rail>
              {todayReleases.map((t) => (
                <TitleCard key={t.id} title={t} />
              ))}
            </Rail>
          </Section>
        )}

        <Section
          eyebrow="GENRE SPECTRUM"
          title="장르로 떠나는 탐색"
          desc="18개 장르가 각자의 색을 가집니다. 색을 따라 발견하세요."
          action={{ label: "스펙트럼 탐색", href: "/explore" }}
        >
          <div
            className="mb-5 h-1.5 w-full rounded-full"
            style={{ background: spectrumGradient(GENRES) }}
            aria-hidden
          />
          <div className="flex flex-wrap gap-2">
            {GENRES.map((g) => (
              <Link key={g} href={`/explore?genre=${encodeURIComponent(g)}`}>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-transform duration-150 hover:scale-105"
                  style={{
                    color: genreColor(g, 0.85),
                    backgroundColor: `color-mix(in oklch, ${genreColor(g, 0.6)} 14%, transparent)`,
                    borderColor: `color-mix(in oklch, ${genreColor(g, 0.6)} 32%, transparent)`,
                  }}
                >
                  {g}
                </span>
              </Link>
            ))}
          </div>
        </Section>

        <Section
          eyebrow="ADAPTATION GRAPH"
          title="원작에서 영상까지, 한 우주"
          desc="웹소설 → 웹툰 → 드라마. 같은 이야기의 모든 형태를 연결합니다. WEBDEX만의 어댑테이션 그래프."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            {families.map(({ original, adaptations }) => (
              <div key={original.id} className="rounded-2xl border border-line bg-card p-5 surface-hl">
                <div className="mb-4 flex items-center gap-2 text-fg-3">
                  <Layers size={14} />
                  <span className="eyebrow text-[0.62rem]">
                    {original.title.length > 14 ? original.title.slice(0, 14) + "…" : original.title}{" "}
                    유니버스
                  </span>
                </div>
                <AdaptationGraph original={original} adaptations={adaptations} />
              </div>
            ))}
          </div>
        </Section>

        <Section
          eyebrow="EDITOR'S PICK"
          title="에디터의 발견"
          desc="수치 너머, 직접 정주행하고 골랐습니다"
          action={{ label: "더 보기", href: "/explore?sort=rating" }}
        >
          <Rail>
            {featured.map((t) => (
              <TitleCard key={t.id} title={t} />
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
            {topRated.map((t) => (
              <TitleCard key={t.id} title={t} />
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
            {waitFree.map((t) => (
              <TitleCard key={t.id} title={t} />
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
            <div className="grid grid-cols-3 gap-3.5 sm:grid-cols-4">
              {newest.slice(0, 8).map((t) => (
                <TitleCard key={t.id} title={t} size="sm" />
              ))}
            </div>
          </Section>
        </div>
      </Container>
    </div>
  );
}
