import { useI18n, useT } from "@/shared/lib/i18n";

import type { CreatorAnalyticsTrafficSource } from "./types";
import { TrafficDonut } from "./TrafficDonut";

const SOURCE_COLORS = [
  "var(--color-accent)",
  "var(--color-cool)",
  "#a78bfa",
  "#34d399",
  "#fbbf24",
  "var(--color-line-strong)",
];

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
      segments={sources.map((source, index) => ({
        label: lang === "ko" ? source.labelKo : source.labelEn,
        value: source.visits,
        color: SOURCE_COLORS[index % SOURCE_COLORS.length],
      }))}
      formatValue={formatValue}
      center={
        <>
          <span className="numeral text-2xl text-fg tabular-nums">
            {formatValue(total)}
          </span>
          <span className="text-[0.72rem] text-fg-3">
            {t("creatorAnalytics.traffic.total", "총 유입")}
          </span>
        </>
      }
    />
  );
}
