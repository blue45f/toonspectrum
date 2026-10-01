import { useRef, type KeyboardEvent } from "react";

import { cn } from "@/shared/lib/utils";
import { useT } from "@/shared/lib/i18n";

import type { CreatorAnalyticsPeriod } from "./types";
import { CREATOR_ANALYTICS_PERIODS } from "./types";

const PERIOD_LABEL_FALLBACK: Record<CreatorAnalyticsPeriod, string> = {
  "7d": "7일",
  "30d": "30일",
  "90d": "90일",
};

/**
 * 7일/30일/90일 기간 선택 세그먼트 컨트롤.
 * WAI-ARIA radiogroup 패턴: 선택된 항목만 Tab 순서에 있고 ←/→/Home/End로 이동·선택한다.
 */
export function PeriodSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: CreatorAnalyticsPeriod;
  onChange: (period: CreatorAnalyticsPeriod) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const radios = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = CREATOR_ANALYTICS_PERIODS.length - 1;
    const next = event.key === "ArrowRight" || event.key === "ArrowDown" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (index === 0 ? last : index - 1)
        : event.key === "Home" ? 0
          : event.key === "End" ? last
            : null;
    const period = next === null ? undefined : CREATOR_ANALYTICS_PERIODS[next];
    if (next === null || !period) return;
    event.preventDefault();
    onChange(period);
    radios.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={t("creatorAnalytics.periodLabel", "기간")}
      aria-disabled={disabled || undefined}
      className="inline-flex rounded-full border border-line bg-raised p-1"
    >
      {CREATOR_ANALYTICS_PERIODS.map((period, index) => {
        const active = period === value;
        return (
          <button
            key={period}
            ref={(node) => {
              radios.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(period)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "min-h-9 rounded-full px-4 text-[0.82rem] font-medium transition-colors pointer-coarse:min-h-11",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50",
              active ? "bg-accent text-on-accent shadow-sm" : "text-fg-2 hover:text-fg",
            )}
          >
            {t(`creatorAnalytics.period.${period}`, PERIOD_LABEL_FALLBACK[period])}
          </button>
        );
      })}
    </div>
  );
}
