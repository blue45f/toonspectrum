import { useI18n, useT } from "@/shared/lib/i18n";

import type { CreatorAnalyticsTrafficSource } from "./types";
import { TrafficDonut } from "./TrafficDonut";

/**
 * 범주형 6색(analytics.css에서 테마별로 검증된 값). 색은 항목 순서가 아니라 유입 경로 자체를 따라가야
 * 기간을 바꿔도 같은 경로가 같은 색을 유지한다.
 */
const SOURCE_COLOR: Readonly<Record<string, string>> = {
  home: "var(--analytics-series-1)",
  ranking: "var(--analytics-series-2)",
  search: "var(--analytics-series-3)",
  subscriptions: "var(--analytics-series-4)",
  external: "var(--analytics-series-5)",
  community: "var(--analytics-series-6)",
};
const FALLBACK_COLOR = "var(--color-line-strong)";

/** 유입 경로 도넛 차트. 현재 언어에 따라 라벨(ko/en)을 고른다. */
export function TrafficSources({
  sources,
}: {
  sources: readonly CreatorAnalyticsTrafficSource[];
}) {
  const t = useT();
  const lang = useI18n((state) => state.lang);
  const locale = lang === "ko" ? "ko-KR" : "en-US";
  const formatValue = (value: number) => value.toLocaleString(locale);
  const total = sources.reduce((sum, source) => sum + source.visits, 0);

  return (
    <TrafficDonut
      segments={sources.map((source) => ({
        label: lang === "ko" ? source.labelKo : source.labelEn,
        value: source.visits,
        color: SOURCE_COLOR[source.source] ?? FALLBACK_COLOR,
      }))}
      formatValue={formatValue}
      size={148}
      center={
        <>
          <span className="numeral max-w-[5.5rem] truncate text-base font-semibold text-fg">{formatValue(total)}</span>
          <span className="text-[0.72rem] text-fg-2">
            {t("creatorAnalytics.traffic.total", "총 유입")}
          </span>
        </>
      }
    />
  );
}
