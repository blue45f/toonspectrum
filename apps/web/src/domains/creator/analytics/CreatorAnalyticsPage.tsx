import { BarChart3, LogIn } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { useI18n, useT } from "@/shared/lib/i18n";
import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useApiResource } from "@/platform/use-api-resource";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";

import { ShowcaseEmptyState, ShowcaseUnavailableState } from "../publishing/ShowcaseStates";

import "./analytics.css";
import { AnalyticsPanel } from "./AnalyticsPanel";
import { AnalyticsNextActions, AnalyticsSampleBanner, type AnalyticsSampleReason } from "./AnalyticsGuides";
import type {
  CreatorAnalyticsPeriod,
  CreatorAnalyticsResponse,
} from "./types";
import { analyticsPeriodDays, analyticsPeriodRange } from "./analytics-math";
import { buildClientMockAnalytics } from "./mock-analytics";
import { PeriodSelector } from "./PeriodSelector";
import { KpiCard } from "./KpiCard";
import { RetentionCurve } from "./RetentionCurve";
import { DropOffInsight } from "./DropOffInsight";
import { TrafficSources } from "./TrafficSources";
import { EpisodeTable } from "./EpisodeTable";

interface DisplayedAnalytics {
  readonly payload: CreatorAnalyticsResponse;
  readonly sampleReason: AnalyticsSampleReason | null;
}

function AnalyticsSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label}>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-40 rounded-2xl" />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="skeleton h-64 rounded-2xl lg:col-span-2" />
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    </div>
  );
}

/**
 * 창작자 애널리틱스 대시보드 — PUBLISH T3 [P0].
 * 시리즈별 KPI(조회·좋아요·댓글·구독 전환), 회차별 리텐션 곡선(이탈 지점 표시), 유입 경로, 기간 비교(7/30/90일).
 *
 * 데이터 정직성:
 * - API가 아직 없으면(404) 번들 예시 데이터로 화면 구성을 보여 주되, 상단 안내와 카드마다 "예시"를 표시한다.
 * - 네트워크·서버 오류에는 예시를 몰래 채우지 않는다. 재시도와 함께 "예시로 둘러보기"를 사용자가 직접 고르게 한다.
 * - 로그인 필요(401/403)는 로그인 안내로 구분한다.
 */
export function CreatorAnalyticsPage() {
  const t = useT();
  const bt = useBilingual("CreatorAnalyticsPage");
  const lang = useI18n((state) => state.lang);
  const seriesSelectId = useId();
  const [period, setPeriod] = useState<CreatorAnalyticsPeriod>("30d");
  const [seriesId, setSeriesId] = useState<string | undefined>(undefined);
  const [sampleOptIn, setSampleOptIn] = useState(false);

  const url =
    `/api/creator/analytics?period=${period}` +
    (seriesId ? `&seriesId=${encodeURIComponent(seriesId)}` : "");
  const { data, loading, error, notFound, appError, stale, reload } =
    useApiResource<CreatorAnalyticsResponse>(
      url,
      t("creatorAnalytics.error", "애널리틱스를 불러오지 못했습니다.")
    );

  const sampleRequested = !data && (notFound || sampleOptIn);
  const clientSample = useMemo(
    () => (sampleRequested ? buildClientMockAnalytics(period, seriesId) : null),
    [period, sampleRequested, seriesId]
  );
  const current: DisplayedAnalytics | null = data
    ? { payload: data, sampleReason: data.mock ? "server-sample" : null }
    : clientSample
      ? { payload: clientSample, sampleReason: notFound ? "api-missing" : "opted-in" }
      : null;

  // 기간·시리즈를 바꾸는 동안 이전 결과를 흐리게 유지한다(스켈레톤 깜빡임·레이아웃 밀림 방지).
  const [lastShown, setLastShown] = useState<DisplayedAnalytics | null>(null);
  if (current && (lastShown === null || current.payload !== lastShown.payload || current.sampleReason !== lastShown.sampleReason)) {
    setLastShown(current);
  }
  const displayed = current ?? (loading ? lastShown : null);
  const refreshing = !current && loading && displayed !== null;
  const payload = displayed?.payload ?? null;
  const sample = displayed?.sampleReason != null;

  const locale = lang === "ko" ? "ko-KR" : "en-US";
  const range = payload ? analyticsPeriodRange(payload.period, payload.generatedAt) : null;
  const dateFormat = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });
  const periodDays = analyticsPeriodDays(payload?.period ?? period);
  const comparisonLabel = formatI18nTemplate(bt("직전 {days}일 대비", "vs. previous {days} days"), { days: periodDays });
  const seriesOptions = payload?.series ?? [];
  const selectedSeries = seriesId ?? payload?.seriesId ?? "";
  const needsLogin = appError?.kind === "unauthorized" || appError?.kind === "forbidden";

  const sampleBadge = sample ? (
    <span className="shrink-0 rounded-full border border-line-strong/70 px-2 py-0.5 text-[0.72rem] font-semibold text-fg-2">
      {bt("예시", "Sample")}
    </span>
  ) : undefined;

  return (
    <div className="creator-analytics">
      <section className="relative overflow-hidden border-b border-line bg-ledger">
        <div
          className="pointer-events-none absolute -top-1/2 right-1/4 h-[44rem] w-[44rem] opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, color-mix(in oklch, var(--color-accent) 30%, transparent), transparent 60%)" }}
          aria-hidden
        />
        <Container size="wide" className="relative py-12 lg:py-16">
          <div className="flex flex-wrap items-center gap-3">
            <p className="eyebrow text-accent">CREATOR · ANALYTICS</p>
            {sample ? (
              <span className="rounded-full border border-accent/50 bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-fg">
                {bt("예시 데이터로 보는 중", "Viewing sample data")}
              </span>
            ) : null}
          </div>
          <h1 className="mt-3 text-pretty text-3xl font-bold leading-[1.1] sm:text-4xl lg:text-[3rem]">
            {t("creatorAnalytics.title", "창작자 애널리틱스")}
          </h1>
          <p className="mt-4 max-w-xl text-pretty text-base leading-relaxed text-fg-2">
            {t(
              "creatorAnalytics.subtitle",
              "시리즈별 조회·좋아요·댓글·구독 전환과 회차별 리텐션을 한눈에 봅니다."
            )}
          </p>

          <div className="mt-7 flex flex-wrap items-end gap-x-5 gap-y-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={seriesSelectId} className="text-xs font-medium text-fg-2">
                {t("creatorAnalytics.seriesLabel", "시리즈")}
              </label>
              <select
                id={seriesSelectId}
                value={selectedSeries}
                disabled={seriesOptions.length === 0}
                onChange={(event) => setSeriesId(event.target.value || undefined)}
                className="min-h-11 min-w-48 rounded-full border border-line bg-card px-4 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
              >
                {seriesOptions.length === 0 ? (
                  <option value="">{loading ? bt("시리즈 불러오는 중…", "Loading series…") : bt("선택할 시리즈 없음", "No series")}</option>
                ) : (
                  seriesOptions.map((series) => (
                    <option key={series.id} value={series.id}>
                      {formatI18nTemplate(bt("{title} · {count}화", "{title} · {count} episodes"), { title: series.title, count: series.episodeCount })}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-fg-2" aria-hidden>
                {t("creatorAnalytics.periodLabel", "기간")}
              </span>
              <PeriodSelector value={period} onChange={setPeriod} />
            </div>
            {range ? (
              <p className="pb-3 text-xs text-fg-2" aria-live="polite">
                {formatI18nTemplate(bt("최근 {days}일 · {start} – {end} · {comparison}", "Last {days} days · {start} – {end} · {comparison}"), {
                  days: range.days,
                  start: dateFormat.format(range.start),
                  end: dateFormat.format(range.end),
                  comparison: comparisonLabel,
                })}
              </p>
            ) : null}
          </div>
        </Container>
      </section>

      <Container size="wide" className="py-10 sm:py-14">
        {!displayed && loading ? (
          <AnalyticsSkeleton label={t("creatorAnalytics.loading", "애널리틱스를 불러오는 중…")} />
        ) : null}

        {!displayed && !loading && error ? (
          needsLogin ? (
            <ShowcaseEmptyState
              icon={LogIn}
              title={bt("로그인하면 내 작품의 지표를 볼 수 있어요", "Log in to see your work's metrics")}
              description={bt("조회·좋아요·구독 전환은 작품을 발행한 창작자 본인에게만 보입니다. 로그인 전에는 예시 데이터로 화면을 둘러볼 수 있어요.", "Views, likes and conversions are visible only to the creator. Before logging in, you can preview the layout with sample data.")}
              action={
                <>
                  <button
                    type="button"
                    onClick={() => requestAuthModalOpen({ reason: "protected-action", source: "creator-analytics", mode: "login" })}
                    className={buttonClass({ size: "md", variant: "solid", className: "gap-1.5" })}
                  >
                    <LogIn size={15} aria-hidden />
                    {bt("로그인하기", "Log in")}
                  </button>
                  <button type="button" onClick={() => setSampleOptIn(true)} className={buttonClass({ size: "md", variant: "outline", className: "gap-1.5" })}>
                    <BarChart3 size={15} aria-hidden />
                    {bt("예시 데이터로 둘러보기", "Preview with sample data")}
                  </button>
                </>
              }
            />
          ) : (
            <ShowcaseUnavailableState
              title={bt("애널리틱스를 잠시 불러올 수 없어요", "Analytics are temporarily unavailable")}
              description={bt("집계 서버 연결을 준비하고 있거나 네트워크가 불안정합니다. 다시 시도하거나, 그동안 예시 데이터로 화면 구성을 먼저 살펴보세요.", "The aggregation server is warming up or the network is unstable. Try again, or preview the layout with sample data meanwhile.")}
              detail={error}
              onRetry={reload}
              actions={
                <button type="button" onClick={() => setSampleOptIn(true)} className={buttonClass({ size: "md", variant: "outline", className: "gap-1.5" })}>
                  <BarChart3 size={15} aria-hidden />
                  {bt("예시 데이터로 둘러보기", "Preview with sample data")}
                </button>
              }
            />
          )
        ) : null}

        {payload && displayed ? (
          <div className="flex flex-col gap-4" data-refreshing={refreshing ? "true" : undefined} aria-busy={refreshing || undefined}>
            {displayed.sampleReason ? (
              <AnalyticsSampleBanner
                reason={displayed.sampleReason}
                onRetryLive={displayed.sampleReason === "opted-in" ? () => { setSampleOptIn(false); reload(); } : undefined}
              />
            ) : null}
            {stale ? (
              <p role="status" className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-xs text-fg">
                {bt("연결이 불안정해 마지막으로 불러온 지표를 보여 주고 있어요.", "The connection is unstable, so the last loaded metrics are shown.")}
              </p>
            ) : null}

            {/* KPI 카드 4종 */}
            <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4" aria-live="polite">
              {payload.kpis.map((kpi) => (
                <KpiCard key={kpi.key} kpi={kpi} comparisonLabel={comparisonLabel} sample={sample} />
              ))}
            </div>

            {/* 리텐션 곡선 + 이탈 지점 콜아웃 */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <AnalyticsPanel
                className="lg:col-span-2"
                eyebrow={t("creatorAnalytics.retention.eyebrow", "RETENTION CURVE")}
                title={t("creatorAnalytics.retention.title", "회차별 리텐션 곡선")}
                badge={sampleBadge}
                insight={t(
                  "creatorAnalytics.retention.insight",
                  "빨간 지점이 독자가 크게 떨어진 회차입니다. 그 회차의 도입부·전개를 먼저 점검하세요."
                )}
              >
                <RetentionCurve points={payload.retention} />
              </AnalyticsPanel>
              <DropOffInsight points={payload.retention} />
            </div>

            {/* 유입 경로 + 회차별 성과 표(차트 값의 표 보기) */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <AnalyticsPanel
                eyebrow={t("creatorAnalytics.traffic.eyebrow", "ACQUISITION")}
                title={t("creatorAnalytics.traffic.title", "유입 경로")}
                badge={sampleBadge}
                insight={t(
                  "creatorAnalytics.traffic.insight",
                  "어디서 독자가 들어오는지 알면 홍보·연재 전략이 선명해집니다."
                )}
              >
                <TrafficSources sources={payload.trafficSources} />
              </AnalyticsPanel>

              <AnalyticsPanel
                eyebrow={t("creatorAnalytics.episodes.eyebrow", "EPISODES")}
                title={t("creatorAnalytics.episodes.title", "회차별 성과")}
                badge={sampleBadge}
              >
                <EpisodeTable
                  episodes={payload.episodes}
                  retention={payload.retention}
                />
              </AnalyticsPanel>
            </div>

            <AnalyticsNextActions />
          </div>
        ) : null}

        {!displayed && !loading && !error ? (
          <p className="py-16 text-center text-sm text-fg-3">
            {t("creatorAnalytics.empty", "표시할 데이터가 없습니다.")}
          </p>
        ) : null}
      </Container>
    </div>
  );
}
