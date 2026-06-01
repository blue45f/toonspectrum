import type { Metadata } from "next";
import { TYPE_LABEL } from "@/lib/taxonomy";
import { getInsightsData } from "@/lib/server/insights";
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

export default async function InsightsPage() {
  const {
    total,
    genreRows,
    topGenre,
    bestRatedGenre,
    wt,
    wn,
    platformRows,
    topPlatform,
    platformTotal,
    yearPoints,
    peakYear,
    distTotal,
    distSum,
    weightedAvg,
    fourPlusPct,
    pricingTotal,
    pricingSegments,
    freeShare,
    webnovelsCount,
    adaptedNovelsCount,
    adaptPct,
    tags,
    trendingTop,
    completionTop,
  } = await getInsightsData();

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
              { v: platformTotal, label: "연재 플랫폼" },
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
                웹소설 {webnovelsCount}작 중 {adaptedNovelsCount}작이 웹툰으로 재탄생했습니다.
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
              value={adaptedNovelsCount}
              max={webnovelsCount}
              label="웹툰화된 웹소설"
              suffix={` / ${webnovelsCount}`}
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
          본 대시보드는 서버 카탈로그 API 기준 집계입니다. 플랫폼별 공개 실시간 랭킹은 랭킹 화면에서 별도 신호로 합산됩니다.
        </p>
      </Container>
    </div>
  );
}
