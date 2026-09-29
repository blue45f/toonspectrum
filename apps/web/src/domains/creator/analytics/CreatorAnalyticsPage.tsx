import { useMemo, useState } from "react";

import { useT } from "@/shared/lib/i18n";
import { Container } from "@/shared/components/section";
import { Badge } from "@/shared/components/ui/chip";
import { ErrorState } from "@/shared/components/feedback/error-state";
import { useApiResource } from "@/platform/use-api-resource";
import { AnalyticsPanel } from "./AnalyticsPanel";

import type {
  CreatorAnalyticsPeriod,
  CreatorAnalyticsResponse,
} from "./types";
import { buildClientMockAnalytics } from "./mock-analytics";
import { PeriodSelector } from "./PeriodSelector";
import { KpiCard } from "./KpiCard";
import { RetentionCurve } from "./RetentionCurve";
import { DropOffInsight } from "./DropOffInsight";
import { TrafficSources } from "./TrafficSources";
import { EpisodeTable } from "./EpisodeTable";

/**
 * 창작자 애널리틱스 대시보드 — PUBLISH T3 [P0].
 * 시리즈별 KPI(조회·좋아요·댓글·구독 전환), 회차별 리텐션 곡선(이탈 지점 표시),
 * 유입 경로, 기간 비교(7/30/90일).
 * API가 아직 붙지 않으면(404) 번들 목 데이터를 폴백으로 표시한다.
 */
export function CreatorAnalyticsPage() {
  const t = useT();
  const [period, setPeriod] = useState<CreatorAnalyticsPeriod>("30d");
  const [seriesId, setSeriesId] = useState<string | undefined>(undefined);

  const url =
    `/api/creator/analytics?period=${period}` +
    (seriesId ? `&seriesId=${encodeURIComponent(seriesId)}` : "");
  const { data, loading, error, notFound, reload } =
    useApiResource<CreatorAnalyticsResponse>(
      url,
      t("creatorAnalytics.error", "애널리틱스를 불러오지 못했습니다.")
    );

  const clientMock = useMemo(
    () => buildClientMockAnalytics(period, seriesId),
    [period, seriesId]
  );
  // 404(API 미배선)일 때만 클라이언트 목으로 폴백. 그 외 에러는 에러 상태로 둔다.
  const payload: CreatorAnalyticsResponse | null =
    data ?? (notFound ? clientMock : null);
  const showingMock = payload?.mock === true;

  const seriesOptions = payload?.series ?? [];

  return (
    <div>
      <section className="relative overflow-hidden border-b border-line bg-ledger">
        <div
          className="pointer-events-none absolute -top-1/2 right-1/4 h-[44rem] w-[44rem] opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, oklch(0.72 0.185 42 / 0.3), transparent 60%)" }}
          aria-hidden
        />
        <Container size="wide" className="relative py-12 lg:py-16">
          <div className="flex flex-wrap items-center gap-3">
            <p className="eyebrow text-accent">CREATOR · ANALYTICS</p>
            {showingMock && (
              <span
                title={t("creatorAnalytics.mockNote", "실제 집계 파이프라인 연결 전 목업 데이터를 표시합니다.")}
              >
                <Badge tone="neutral">
                  {t("creatorAnalytics.mockBadge", "목업 데이터")}
                </Badge>
              </span>
            )}
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

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-fg-3">
              <span>{t("creatorAnalytics.seriesLabel", "시리즈")}</span>
              <select
                value={seriesId ?? ""}
                onChange={(event) =>
                  setSeriesId(event.target.value || undefined)
                }
                className="rounded-full border border-line bg-card px-3 py-1.5 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <option value="">
                  {seriesOptions[0]?.title ?? "—"}
                </option>
                {seriesOptions.slice(1).map((series) => (
                  <option key={series.id} value={series.id}>
                    {series.title}
                  </option>
                ))}
              </select>
            </label>
            <PeriodSelector value={period} onChange={setPeriod} />
          </div>
        </Container>
      </section>

      <Container size="wide" className="py-10 sm:py-14">
        {loading && !payload && (
          <div role="status" aria-label={t("creatorAnalytics.loading", "애널리틱스를 불러오는 중…")}>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-32 rounded-2xl" />
              ))}
            </div>
            <div className="skeleton mt-4 h-64 rounded-2xl" />
          </div>
        )}

        {error && !payload && (
          <ErrorState
            title={t("creatorAnalytics.error", "애널리틱스를 불러오지 못했습니다.")}
            message={error}
            onRetry={reload}
          />
        )}

        {payload && (
          <div className="flex flex-col gap-4">
            {/* KPI 카드 4종 */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-live="polite">
              {payload.kpis.map((kpi) => (
                <KpiCard key={kpi.key} kpi={kpi} />
              ))}
            </div>

            {/* 리텐션 곡선 + 이탈 지점 콜아웃 */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <AnalyticsPanel
                className="lg:col-span-2"
                eyebrow={t("creatorAnalytics.retention.eyebrow", "RETENTION CURVE")}
                title={t("creatorAnalytics.retention.title", "회차별 리텐션 곡선")}
                insight={t(
                  "creatorAnalytics.retention.insight",
                  "빨간 지점이 독자가 크게 떨어진 회차입니다. 그 회차의 도입부·전개를 먼저 점검하세요."
                )}
              >
                <RetentionCurve points={payload.retention} />
              </AnalyticsPanel>
              <DropOffInsight points={payload.retention} />
            </div>

            {/* 유입 경로 */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <AnalyticsPanel
                eyebrow={t("creatorAnalytics.traffic.eyebrow", "ACQUISITION")}
                title={t("creatorAnalytics.traffic.title", "유입 경로")}
                insight={t(
                  "creatorAnalytics.traffic.insight",
                  "어디서 독자가 들어오는지 알면 홍보·연재 전략이 선명해집니다."
                )}
              >
                <TrafficSources sources={payload.trafficSources} />
              </AnalyticsPanel>

              {/* 회차별 성과 테이블 */}
              <AnalyticsPanel
                eyebrow={t("creatorAnalytics.episodes.eyebrow", "EPISODES")}
                title={t("creatorAnalytics.episodes.title", "회차별 성과")}
              >
                <EpisodeTable
                  episodes={payload.episodes}
                  retention={payload.retention}
                />
              </AnalyticsPanel>
            </div>
          </div>
        )}

        {!loading && !error && !payload && (
          <p className="py-16 text-center text-sm text-fg-3">
            {t("creatorAnalytics.empty", "표시할 데이터가 없습니다.")}
          </p>
        )}
      </Container>
    </div>
  );
}
