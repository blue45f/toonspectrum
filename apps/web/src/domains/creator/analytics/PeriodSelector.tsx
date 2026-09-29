import { cn } from "@/shared/lib/utils";
import { useT } from "@/shared/lib/i18n";

import type { CreatorAnalyticsPeriod } from "./types";
import { CREATOR_ANALYTICS_PERIODS } from "./types";

const PERIOD_LABEL_FALLBACK: Record<CreatorAnalyticsPeriod, string> = {
  "7d": "7일",
  "30d": "30일",
  "90d": "90일",
};

/** 7일/30일/90일 기간 선택 세그먼트 컨트롤. radiogroup 시맨틱 + 키보드 탐색 지원. */
export function PeriodSelector({
  value,
  onChange,
}: {
  value: CreatorAnalyticsPeriod;
  onChange: (period: CreatorAnalyticsPeriod) => void;
}) {
  const t = useT();
  return (
    <div
      role="radiogroup"
      aria-label={t("creatorAnalytics.periodLabel", "기간")}
      className="inline-flex rounded-full border border-line bg-raised p-1"
    >
      {CREATOR_ANALYTICS_PERIODS.map((period) => {
        const active = period === value;
        return (
          <button
            key={period}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(period)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[0.82rem] font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              active
                ? "bg-card text-fg shadow-sm"
                : "text-fg-3 hover:text-fg-2"
            )}
          >
            {t(`creatorAnalytics.period.${period}`, PERIOD_LABEL_FALLBACK[period])}
          </button>
        );
      })}
    </div>
  );
}
