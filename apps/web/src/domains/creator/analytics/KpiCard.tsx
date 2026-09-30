import { cn } from "@/shared/lib/utils";
import { useT } from "@/shared/lib/i18n";
import { CountUp } from "@/shared/components/count-up";

import type { CreatorAnalyticsKpi } from "./types";
import { formatDeltaPct } from "./analytics-math";

const KPI_LABEL_FALLBACK: Record<CreatorAnalyticsKpi["key"], string> = {
  views: "조회수",
  likes: "좋아요",
  comments: "댓글",
  subscribeConversion: "구독 전환율",
};

/** KPI 카드: 값 + 직전 기간 대비 증감 배지. */
export function KpiCard({ kpi }: { kpi: CreatorAnalyticsKpi }) {
  const t = useT();
  const label = t(`creatorAnalytics.kpi.${kpi.key}`, KPI_LABEL_FALLBACK[kpi.key]);
  const delta = Math.round(kpi.deltaPct * 10) / 10;
  const isPercent = kpi.key === "subscribeConversion";
  return (
    <div className="rounded-2xl border border-line bg-card p-5 surface-hl">
      <p className="text-[0.8rem] text-fg-3">{label}</p>
      <p className="mt-2 text-[1.7rem] font-bold leading-none text-fg">
        {isPercent ? (
          <span className="numeral tabular-nums">
            {kpi.value.toFixed(1)}
            <span className="text-[0.6em] text-fg-3">%</span>
          </span>
        ) : (
          <CountUp
            value={Math.round(kpi.value)}
            separator
            className="numeral tabular-nums"
          />
        )}
      </p>
      <p className="mt-2.5 flex items-center gap-1.5 text-xs">
        <span
          className={cn(
            "numeral rounded-full px-2 py-0.5 font-medium tabular-nums",
            delta > 0 && "bg-emerald-500/10 text-emerald-400",
            delta < 0 && "bg-rose-500/10 text-rose-400",
            delta === 0 && "bg-raised text-fg-3"
          )}
        >
          {formatDeltaPct(delta)}
          <span className="sr-only">
            {` ${t("creatorAnalytics.kpi.vsPrevious", "직전 기간 대비")}`}
          </span>
        </span>
        <span className="text-fg-3">
          {t("creatorAnalytics.kpi.vsPrevious", "직전 기간 대비")}
        </span>
      </p>
    </div>
  );
}
