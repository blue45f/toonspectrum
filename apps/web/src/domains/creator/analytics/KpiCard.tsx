import { Eye, Heart, MessageCircle, Minus, TrendingDown, TrendingUp, UserPlus, type LucideIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { useT } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { CountUp } from "@/shared/components/count-up";

import type { CreatorAnalyticsKpi, CreatorAnalyticsKpiKey } from "./types";
import { deltaDirection, formatDeltaPct } from "./analytics-math";

const KPI_LABEL_FALLBACK: Record<CreatorAnalyticsKpiKey, string> = {
  views: "조회수",
  likes: "좋아요",
  comments: "댓글",
  subscribeConversion: "구독 전환율",
};

const KPI_ICON: Record<CreatorAnalyticsKpiKey, LucideIcon> = {
  views: Eye,
  likes: Heart,
  comments: MessageCircle,
  subscribeConversion: UserPlus,
};

/** 지표 정의 — 숫자만 보고 뜻을 추측하지 않도록 카드마다 한 줄로 알려 준다. */
const KPI_HINT: Record<CreatorAnalyticsKpiKey, readonly [string, string]> = {
  views: ["기간 안에 회차가 열린 횟수", "Episode opens in the period"],
  likes: ["기간 안에 받은 좋아요", "Likes received in the period"],
  comments: ["기간 안에 달린 새 댓글", "New comments in the period"],
  subscribeConversion: ["새 구독자 ÷ 조회수", "New subscribers ÷ views"],
};

const DELTA_STYLE = {
  up: { icon: TrendingUp, className: "bg-good/12 text-good" },
  down: { icon: TrendingDown, className: "bg-bad/12 text-bad" },
  flat: { icon: Minus, className: "bg-raised text-fg-3" },
} as const;

/**
 * KPI 카드: 아이콘·지표명·값·직전 기간 대비 증감(부호+아이콘+색)·지표 정의.
 * 큰 값은 비례폭 숫자, 증감 배지는 정렬이 필요한 작은 숫자라 tabular 숫자를 쓴다.
 */
export function KpiCard({
  kpi,
  comparisonLabel,
  sample = false,
}: {
  kpi: CreatorAnalyticsKpi;
  /** 증감 비교 기준 — 예: "직전 30일 대비". */
  comparisonLabel: string;
  /** 예시 데이터이면 카드에도 표시해 실제 수치로 오해하지 않게 한다. */
  sample?: boolean;
}) {
  const t = useT();
  const bt = useBilingual("CreatorAnalyticsKpiCard");
  const label = t(`creatorAnalytics.kpi.${kpi.key}`, KPI_LABEL_FALLBACK[kpi.key]);
  const Icon = KPI_ICON[kpi.key];
  const direction = deltaDirection(kpi.deltaPct);
  const { icon: DeltaIcon, className: deltaClass } = DELTA_STYLE[direction];
  const isPercent = kpi.key === "subscribeConversion";

  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-line bg-card p-4 surface-hl sm:p-5" aria-label={label}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-fg-2">
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
            <Icon size={16} />
          </span>
          {label}
        </p>
        {sample ? (
          <span className="shrink-0 rounded-full border border-line-strong/70 px-2 py-0.5 text-xs font-semibold text-fg-2">
            {bt("예시", "Sample")}
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-[1.625rem] font-bold leading-none text-fg sm:text-[1.75rem]">
        {isPercent ? (
          <span className="numeral">
            {kpi.value.toFixed(1)}
            <span className="text-[0.6em] text-fg-3">%</span>
          </span>
        ) : (
          <CountUp value={Math.round(kpi.value)} separator className="numeral" />
        )}
      </p>
      <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
        <span className={cn("numeral inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold tabular-nums", deltaClass)}>
          <DeltaIcon size={12} aria-hidden />
          {formatDeltaPct(kpi.deltaPct)}
        </span>
        <span className="text-fg-3">{comparisonLabel}</span>
      </p>
      <p className="mt-2 break-keep border-t border-line/70 pt-2 text-xs leading-relaxed text-fg-3">
        {bt(...KPI_HINT[kpi.key])}
      </p>
    </article>
  );
}
