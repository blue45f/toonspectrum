/**
 * CreatorRevenueDashboardPage.tsx
 *
 * 창작자 수익 대시보드 (`/creator/revenue`).
 * 등록된 수익원 제공자들을 모아 기간별 수익·정산을 보여준다.
 */
import { ChartColumn, LogIn } from "lucide-react";
import { useMemo, useState } from "react";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { Container } from "@/shared/components/section";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

// 제공자 등록을 위해 트랙 index를 로드한다 (side-effect import).
import "@/domains/monetization/tipping";
import "@/domains/monetization/membership";

import {
  lastNMonths,
  monthRange,
  type MonthlyRevenue,
  type RevenueSourceId,
} from "../models/revenue-model";
import { aggregateCreatorRevenue, computeSettlementBreakdown } from "../revenue-aggregator";
import { RevenueChart } from "../components/RevenueChart";
import { SettlementCard, formatKrw } from "../components/SettlementCard";
import { PayoutDialog } from "../components/PayoutDialog";

type PeriodKey = "month" | "3m" | "6m";

const SOURCE_ORDER: readonly RevenueSourceId[] = ["tips", "membership", "early-access", "market", "custom"];

function sourceLabelKey(sourceId: RevenueSourceId): string {
  return `revenue.source.${sourceId}`;
}

export function CreatorRevenueDashboardPage() {
  const t = useT();
  const { data: session, ready, status } = useSession();
  const [periodKey, setPeriodKey] = useState<PeriodKey>("month");
  const [payoutOpen, setPayoutOpen] = useState(false);

  const creatorId = session?.user.id ?? null;
  const authenticated = ready && status === "authenticated" && Boolean(creatorId);

  useDocumentTitle(t("revenue.dashboard.documentTitle"));

  const months = useMemo(() => lastNMonths(6), []);
  const period = useMemo(() => {
    const current = months[months.length - 1] ?? "2026-10";
    if (periodKey === "month") return monthRange(current);
    const span = periodKey === "3m" ? 3 : 6;
    const start = months[months.length - span] ?? current;
    const { from } = monthRange(start);
    const { to } = monthRange(current);
    return { from, to };
  }, [periodKey, months]);

  const summary = useMemo(() => {
    if (!creatorId) return null;
    return aggregateCreatorRevenue({ creatorId, period });
  }, [creatorId, period]);

  const chartData: readonly MonthlyRevenue[] = useMemo(() => {
    if (!creatorId) return [];
    return months.map((month) => {
      const monthSummary = aggregateCreatorRevenue({
        creatorId,
        period: monthRange(month),
      });
      return { month, amount: monthSummary.totalAmount };
    });
  }, [creatorId, months]);

  if (!ready) {
    return (
      <Container className="py-16 text-center text-sm text-muted">
        {t("revenue.dashboard.loading")}
      </Container>
    );
  }

  if (!authenticated || !summary) {
    return (
      <Container className="py-16 text-center">
        <ChartColumn className="mx-auto h-10 w-10 text-muted/50" aria-hidden />
        <h1 className="mt-3 text-xl font-bold text-fg">{t("revenue.dashboard.title")}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          {t("revenue.dashboard.loginRequired")}
        </p>
        <button
          type="button"
          onClick={() => requestAuthModalOpen({ reason: "protected-action", source: "creator-revenue", mode: "login" })}
          className={cn(buttonClass({ variant: "solid" }), "mt-4 gap-1.5")}
        >
          <LogIn className="h-4 w-4" aria-hidden />
          {t("revenue.dashboard.login")}
        </button>
      </Container>
    );
  }

  const netKrw = computeSettlementBreakdown(summary.totalAmount).netCreatorPayoutKrw;

  return (
    <Container className="py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-fg">
            <ChartColumn className="h-6 w-6 text-accent" aria-hidden />
            {t("revenue.dashboard.title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t("revenue.dashboard.subtitle")}</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-line p-1" role="group" aria-label={t("revenue.dashboard.periodLabel")}>
          {(["month", "3m", "6m"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPeriodKey(key)}
              aria-pressed={periodKey === key}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                periodKey === key ? "bg-accent/15 text-accent" : "text-muted hover:text-fg",
              )}
            >
              {t(`revenue.dashboard.period.${key}`)}
            </button>
          ))}
        </div>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section aria-label={t("revenue.dashboard.summaryTitle")} className="rounded-2xl border border-line bg-panel/50 p-4 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-muted">{t("revenue.dashboard.totalRevenue")}</h2>
              <p className="text-xs text-muted">{t("revenue.dashboard.entryCount", { count: summary.entryCount })}</p>
            </div>
            <p className="mt-1 text-3xl font-bold tabular-nums text-fg">
              {formatKrw(summary.totalAmount)}
            </p>
            <RevenueChart data={chartData} className="mt-4" />
          </section>

          <section aria-label={t("revenue.dashboard.sourceBreakdown")} className="rounded-2xl border border-line bg-panel/50 p-4 sm:p-6">
            <h2 className="text-base font-bold text-fg">{t("revenue.dashboard.sourceBreakdown")}</h2>
            {summary.bySource.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">{t("revenue.dashboard.empty")}</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {[...summary.bySource]
                  .sort((a, b) => SOURCE_ORDER.indexOf(a.sourceId) - SOURCE_ORDER.indexOf(b.sourceId))
                  .map((bucket) => {
                    const ratio = summary.totalAmount > 0 ? bucket.amount / summary.totalAmount : 0;
                    return (
                      <li key={bucket.sourceId}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-semibold text-fg">{t(sourceLabelKey(bucket.sourceId))}</span>
                          <span className="tabular-nums text-muted">
                            {formatKrw(bucket.amount)}
                            {" · "}
                            {t("revenue.dashboard.entryCount", { count: bucket.count })}
                          </span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-fg/10" role="presentation">
                          <div
                            className="h-full rounded-full bg-accent/70"
                            style={{ width: `${Math.max(2, Math.round(ratio * 100))}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <SettlementCard
            grossKrw={summary.totalAmount}
            onPayoutClick={() => setPayoutOpen(true)}
          />
        </div>
      </div>

      <PayoutDialog open={payoutOpen} netKrw={netKrw} onClose={() => setPayoutOpen(false)} />
    </Container>
  );
}
