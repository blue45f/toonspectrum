import type { Metadata } from "next";
import { TITLES, activeTags, adaptationsOf, titlesByType } from "@/lib/data";
import type { Title, Pricing } from "@/lib/types";
import { PLATFORMS, PRICING_LABEL } from "@/lib/platforms";
import { TYPE_LABEL } from "@/lib/taxonomy";
import { genreColor, spectrumGradient } from "@/lib/genre-color";
import { formatCount, formatFull } from "@/lib/utils";
import { Container } from "@/components/section";
import { MeterBar, DistributionBars } from "@/components/ui/spectrum-bar";
import { Badge } from "@/components/ui/chip";
import { Panel } from "./_components/panel";
import { BarList } from "./_components/bar-list";
import { AreaChart } from "./_components/area-chart";
import { Donut } from "./_components/donut";
import { CompareSplit } from "./_components/compare-split";
import { TagCloud } from "./_components/tag-cloud";

export const metadata: Metadata = {
  title: "데이터 인사이트 — 트렌드 대시보드",
  description:
    "WEBDEX 수록작 전체를 가로지르는 트렌드·데이터 대시보드. 장르 분포, 플랫폼 지형, 평점, 가격 모델, 어댑테이션 파이프라인을 한눈에.",
};

// ── 집계 헬퍼 ────────────────────────────────────────────────
const avg = (ns: number[]) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0);

export default function InsightsPage() {
  const total = TITLES.length;

  // 1) 장르별 작품 수 + 평균 평점
  const genreAgg = new Map<string, { count: number; ratings: number[] }>();
  TITLES.forEach((t) =>
    t.genres.forEach((g) => {
      const e = genreAgg.get(g) ?? { count: 0, ratings: [] };
      e.count += 1;
      e.ratings.push(t.stats.ratingAvg);
      genreAgg.set(g, e);
    })
  );
  const genreRows = Array.from(genreAgg.entries())
    .map(([genre, e]) => ({ genre, count: e.count, rating: avg(e.ratings) }))
    .sort((a, b) => b.count - a.count);
  const topGenre = genreRows[0];
  const bestRatedGenre = [...genreRows].sort((a, b) => b.rating - a.rating)[0];

  // 2) 웹툰 vs 웹소설
  const webtoons = titlesByType("webtoon");
  const webnovels = titlesByType("webnovel");
  const grp = (ts: Title[]) => ({
    count: ts.length,
    rating: avg(ts.map((t) => t.stats.ratingAvg)),
    views: avg(ts.map((t) => t.stats.views)),
    binge: avg(ts.map((t) => t.stats.bingeIndex)),
  });
  const wt = grp(webtoons);
  const wn = grp(webnovels);

  // 3) 플랫폼별 작품 수 (availability 기준, 중복 작품은 플랫폼당 1회)
  const platformCount = new Map<string, number>();
  TITLES.forEach((t) => {
    const seen = new Set<string>();
    t.availability.forEach((a) => {
      if (seen.has(a.platformId)) return;
      seen.add(a.platformId);
      platformCount.set(a.platformId, (platformCount.get(a.platformId) ?? 0) + 1);
    });
  });
  const platformRows = Array.from(platformCount.entries())
    .map(([id, count]) => ({ id, count, p: PLATFORMS[id as keyof typeof PLATFORMS] }))
    .filter((r) => r.p)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const topPlatform = platformRows[0];

  // 4) 연도별 신작 수
  const yearCount = new Map<number, number>();
  TITLES.forEach((t) => yearCount.set(t.releaseYear, (yearCount.get(t.releaseYear) ?? 0) + 1));
  const years = Array.from(yearCount.keys()).sort((a, b) => a - b);
  const minYear = years[0];
  const maxYear = years[years.length - 1];
  const yearPoints = [];
  for (let y = minYear; y <= maxYear; y++) {
    yearPoints.push({ label: y, value: yearCount.get(y) ?? 0 });
  }
  const peakYear = [...yearPoints].sort((a, b) => b.value - a.value)[0];

  // 5) 전체 평점 분포 집계
  const distTotal: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  TITLES.forEach((t) =>
    t.stats.ratingDist.forEach((v, i) => {
      distTotal[i] += v;
    })
  );
  const distSum = distTotal.reduce((a, b) => a + b, 0);
  // 분포 가중 평균 평점 (1~5점 * 표수)
  const weightedAvg = distSum
    ? distTotal.reduce((acc, v, i) => acc + v * (i + 1), 0) / distSum
    : 0;
  const fourPlusPct = distSum ? ((distTotal[3] + distTotal[4]) / distSum) * 100 : 0;

  // 6) 가격 모델 분포 (availability 엔트리 단위)
  const pricingCount: Record<Pricing, number> = {
    free: 0,
    "wait-free": 0,
    paid: 0,
    subscription: 0,
  };
  TITLES.forEach((t) => t.availability.forEach((a) => (pricingCount[a.pricing] += 1)));
  const pricingTotal = Object.values(pricingCount).reduce((a, b) => a + b, 0);
  const PRICING_COLOR: Record<Pricing, string> = {
    free: "var(--color-good)",
    "wait-free": "var(--color-cool)",
    paid: "var(--color-accent)",
    subscription: "var(--color-warn)",
  };
  const pricingSegments = (["free", "wait-free", "paid", "subscription"] as Pricing[]).map((p) => ({
    label: PRICING_LABEL[p],
    value: pricingCount[p],
    color: PRICING_COLOR[p],
  }));
  const freeShare = pricingTotal
    ? ((pricingCount.free + pricingCount["wait-free"]) / pricingTotal) * 100
    : 0;

  // 7) 어댑테이션 지수 — 웹툰화된 웹소설 비율
  const adaptedNovels = webnovels.filter((n) => adaptationsOf(n).length > 0);
  const adaptPct = webnovels.length ? (adaptedNovels.length / webnovels.length) * 100 : 0;

  // 8) 인기 태그
  const tags = activeTags();

  // (옵션) 급상승 트렌드 TOP / 완독률 상위
  const trendingTop = [...TITLES].sort((a, b) => b.stats.trendingScore - a.stats.trendingScore).slice(0, 6);
  const completionTop = [...TITLES].sort((a, b) => b.stats.completionRate - a.stats.completionRate).slice(0, 6);

  return (
    <div>
      {/* ░░ HERO ░░ */}
      <section className="relative overflow-hidden border-b border-line bg-ledger">
        <div
          className="pointer-events-none absolute -top-1/2 right-1/4 h-[44rem] w-[44rem] opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, oklch(0.72 0.185 42 / 0.3), transparent 60%)" }}
          aria-hidden
        />
        <Container size="wide" className="relative py-12 lg:py-16">
          <p className="eyebrow text-accent">DATA · INSIGHTS</p>
          <h1 className="mt-3 text-pretty text-3xl font-bold leading-[1.1] tracking-[-0.02em] sm:text-4xl lg:text-[3rem]">
            이야기의 지형을 읽다
          </h1>
          <p className="mt-4 max-w-xl text-pretty text-base leading-relaxed text-fg-2">
            수록작 전체를 가로질러 장르·플랫폼·평점·가격·어댑테이션을 집계했습니다. 어느 플랫폼도
            보여주지 않는, 독자를 위한 트렌드 대시보드.
          </p>
          <div
            className="mt-7 h-1.5 w-full max-w-xl rounded-full"
            style={{ background: spectrumGradient(genreRows.map((g) => g.genre)) }}
            aria-hidden
          />
          <dl className="mt-7 flex flex-wrap items-center gap-x-8 gap-y-3">
            {[
              { v: total, label: "수록 작품" },
              { v: genreRows.length, label: "활성 장르" },
              { v: platformCount.size, label: "연재 플랫폼" },
              { v: formatFull(distSum), label: "집계 평가 수" },
            ].map((s) => (
              <div key={s.label} className="flex items-baseline gap-2">
                <dd className="numeral text-2xl text-fg tabular-nums">{s.v}</dd>
                <dt className="text-xs text-fg-3">{s.label}</dt>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      {/* ░░ BENTO GRID ░░ */}
      <Container size="wide" className="py-10 sm:py-14">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
          {/* 1. 장르 분포 & 평균 평점 — 큰 칸 (세로 긴) */}
          <Panel
            className="lg:col-span-3 lg:row-span-2"
            eyebrow="GENRE LANDSCAPE"
            title="장르 분포 & 평균 평점"
            aside={<Badge tone="neutral">{genreRows.length}개 장르</Badge>}
            insight={
              <>
                <span className="text-fg-2">{topGenre.genre}</span>가 {topGenre.count}작으로 가장
                두텁고, 평점은 <span className="text-fg-2">{bestRatedGenre.genre}</span>(
                {bestRatedGenre.rating.toFixed(2)})가 가장 높습니다. 색을 따라 취향의 밀도를 읽어보세요.
              </>
            }
          >
            <BarList
              max={topGenre.count}
              valueFormat={(v) => `${v}`}
              items={genreRows.map((g) => ({
                label: g.genre,
                value: g.count,
                color: genreColor(g.genre, 0.7),
                dot: true,
                meta: `★ ${g.rating.toFixed(2)}`,
              }))}
            />
          </Panel>

          {/* 2. 웹툰 vs 웹소설 — 가로 와이드 */}
          <Panel
            className="lg:col-span-3"
            eyebrow="FORMAT FACE-OFF"
            title="웹툰 vs 웹소설"
            insight={
              <>
                평균 평점은 <span className="text-fg-2">{wn.rating >= wt.rating ? "웹소설" : "웹툰"}</span>
                이 근소하게 앞서고, 누적 조회는 웹소설이 압도합니다. 글이 먼저, 그림이 뒤따르는 구조.
              </>
            }
          >
            <CompareSplit
              aName={TYPE_LABEL.webtoon}
              bName={TYPE_LABEL.webnovel}
              aColor="var(--color-cool)"
              bColor="var(--color-accent)"
              aCount={wt.count}
              bCount={wn.count}
              metrics={[
                { label: "평균 평점", a: wt.rating.toFixed(2), b: wn.rating.toFixed(2), aRaw: wt.rating, bRaw: wn.rating },
                { label: "평균 조회", a: formatCount(wt.views), b: formatCount(wn.views), aRaw: wt.views, bRaw: wn.views },
                { label: "몰입 지수", a: wt.binge.toFixed(0), b: wn.binge.toFixed(0), aRaw: wt.binge, bRaw: wn.binge },
              ]}
            />
          </Panel>

          {/* 7. 어댑테이션 지수 — 작은 칸 (강조 numeral) */}
          <Panel
            className="lg:col-span-3"
            eyebrow="ADAPTATION INDEX"
            title="원작 → 웹툰 파이프라인"
            insight={
              <>
                웹소설 {webnovels.length}작 중 {adaptedNovels.length}작이 웹툰으로 재탄생했습니다.
                검증된 IP가 그림을 입는 흐름 — 원작 추적이 곧 차기 화제작 예측입니다.
              </>
            }
          >
            <div className="flex items-end gap-3">
              <span className="numeral text-[3.4rem] leading-none text-accent">
                {adaptPct.toFixed(0)}
              </span>
              <span className="numeral mb-1.5 text-xl text-fg-3">%</span>
              <span className="mb-2 text-sm text-fg-3">웹툰화 비율</span>
            </div>
            <MeterBar
              className="mt-4"
              value={adaptedNovels.length}
              max={webnovels.length}
              label="웹툰화된 웹소설"
              suffix={` / ${webnovels.length}`}
            />
          </Panel>

          {/* 3. 플랫폼 지형도 */}
          <Panel
            className="lg:col-span-2"
            eyebrow="PLATFORM MAP"
            title="플랫폼 지형도"
            insight={
              <>
                <span className="text-fg-2">{topPlatform.p.name}</span>이 {topPlatform.count}작으로 최다
                수록. 한 작품이 여러 플랫폼에 걸쳐 있어, 경계를 넘는 탐색이 필요합니다.
              </>
            }
          >
            <BarList
              max={topPlatform.count}
              items={platformRows.map((r) => ({
                label: r.p.short,
                value: r.count,
                color: r.p.color,
                dot: true,
              }))}
            />
          </Panel>

          {/* 4. 연도별 신작 추이 */}
          <Panel
            className="lg:col-span-2"
            eyebrow="RELEASE TREND"
            title="연도별 신작 추이"
            insight={
              <>
                {peakYear.label}년 {peakYear.value}작으로 정점. 2010년대 후반 웹툰·웹소설 시장 팽창기가
                수록작 분포에도 그대로 새겨져 있습니다.
              </>
            }
          >
            <AreaChart points={yearPoints} color="var(--color-accent)" />
          </Panel>

          {/* 5. 전체 평점 분포 */}
          <Panel
            className="lg:col-span-2"
            eyebrow="RATING SPREAD"
            title="전체 평점 분포"
            aside={
              <div className="text-right">
                <div className="numeral text-2xl text-accent tabular-nums">
                  {weightedAvg.toFixed(2)}
                </div>
                <div className="text-[0.62rem] text-fg-3">가중 평균</div>
              </div>
            }
            insight={
              <>
                {formatFull(distSum)}건의 평가 중 4점 이상이 {fourPlusPct.toFixed(0)}%. 큐레이션된
                인덱스답게 분포가 상단에 쏠려 있습니다.
              </>
            }
          >
            <DistributionBars dist={distTotal} />
          </Panel>

          {/* 6. 가격 모델 분포 — 도넛 */}
          <Panel
            className="lg:col-span-3"
            eyebrow="PRICING MODEL"
            title="가격 모델 분포"
            insight={
              <>
                연재 채널 {pricingTotal}곳 중 무료·기다무 진입로가 {freeShare.toFixed(0)}%. 돈을 들이지
                않고도 시작할 길이 절반 이상 열려 있습니다.
              </>
            }
          >
            <Donut
              segments={pricingSegments}
              center={
                <>
                  <span className="numeral text-2xl text-fg tabular-nums">{pricingTotal}</span>
                  <span className="text-[0.62rem] text-fg-3">연재 채널</span>
                </>
              }
            />
          </Panel>

          {/* 8. 인기 태그 TOP — 가중 클라우드 */}
          <Panel
            className="lg:col-span-3"
            eyebrow="TRENDING TAGS"
            title="인기 태그 TOP"
            aside={<Badge tone="accent">{tags.length}종</Badge>}
            insight={
              <>
                <span className="text-fg-2">#{tags[0].tag}</span> · #{tags[1].tag}가 태그 지형을 주도.
                회귀·사이다 코드가 여전히 독자의 핵심 정서임을 보여줍니다.
              </>
            }
          >
            <TagCloud tags={tags.slice(0, 16)} />
          </Panel>

          {/* (옵션) 급상승 트렌드 TOP */}
          <Panel
            className="lg:col-span-3"
            eyebrow="RISING NOW"
            title="급상승 트렌드 TOP"
            insight={
              <>
                트렌드 점수 1위는 <span className="text-fg-2">{trendingTop[0].title}</span>(
                {trendingTop[0].stats.trendingScore}). 지금 입소문이 가장 빠르게 번지는 작품들입니다.
              </>
            }
          >
            <ol className="flex flex-col gap-2.5">
              {trendingTop.map((t, i) => (
                <li key={t.id} className="flex items-center gap-3">
                  <span className="numeral w-5 shrink-0 text-right text-sm text-accent tabular-nums">
                    {i + 1}
                  </span>
                  <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: genreColor(t.genres[0], 0.7) }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm text-fg-2">{t.title}</span>
                  <div className="hidden w-24 shrink-0 sm:block">
                    <MeterBar value={t.stats.trendingScore} max={100} />
                  </div>
                  <span className="numeral w-7 shrink-0 text-right text-xs text-fg tabular-nums">
                    {t.stats.trendingScore}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>

          {/* (옵션) 완독률 상위 */}
          <Panel
            className="lg:col-span-3"
            eyebrow="BINGE-WORTHY"
            title="완독률 상위"
            insight={
              <>
                <span className="text-fg-2">{completionTop[0].title}</span> 완독률 {completionTop[0].stats.completionRate}%.
                끝까지 붙잡는 흡인력 — 정주행 실패가 두렵다면 여기서 고르세요.
              </>
            }
          >
            <BarList
              max={100}
              valueFormat={(v) => `${v}%`}
              items={completionTop.map((t) => ({
                label: t.title,
                value: t.stats.completionRate,
                color: genreColor(t.genres[0], 0.68),
              }))}
            />
          </Panel>
        </div>

        <p className="mt-8 text-center text-xs text-fg-3">
          본 대시보드의 수치는 전부 데모용 샘플 데이터입니다. 실제 플랫폼 수치가 아닙니다.
        </p>
      </Container>
    </div>
  );
}
