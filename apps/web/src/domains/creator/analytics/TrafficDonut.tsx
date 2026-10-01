import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

import { donutGradientStops } from "./analytics-math";

export interface TrafficDonutSegment {
  label: string;
  value: number;
  color: string;
}

/**
 * 유입 경로 도넛 차트 — creator analytics 도메인 전용.
 * CSS conic-gradient 기반 정적 렌더(애니메이션 없음, reduced-motion 친화).
 * 범례에 항목명·비율·값을 글자로 함께 보여 색만으로 구분하지 않는다.
 */
export function TrafficDonut({
  segments,
  size = 132,
  thickness = 18,
  center,
  formatValue,
  className,
}: {
  segments: readonly TrafficDonutSegment[];
  size?: number;
  thickness?: number;
  center?: ReactNode;
  formatValue?: (value: number) => string;
  className?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;

  return (
    <div className={cn("flex flex-col items-center gap-4 sm:flex-row sm:gap-5", className)}>
      <div
        className="relative shrink-0"
        style={{ width: size, height: size }}
        role="img"
        aria-label={segments
          .map((segment) => `${segment.label} ${((segment.value / total) * 100).toFixed(0)}%`)
          .join(", ")}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: `conic-gradient(${donutGradientStops(segments, "var(--color-card)")})` }}
          aria-hidden
        />
        <div className="absolute rounded-full bg-card" style={{ inset: thickness }} aria-hidden />
        {center != null && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            {center}
          </div>
        )}
      </div>
      <ul className="flex w-full flex-col gap-2">
        {segments.map((segment) => {
          const pct = (segment.value / total) * 100;
          return (
            <li key={segment.label} className="flex items-center gap-2.5">
              <span
                data-analytics-swatch
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: segment.color }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-sm text-fg-2">{segment.label}</span>
              <span className="numeral text-sm text-fg tabular-nums">{pct.toFixed(0)}%</span>
              <span className="tnum w-16 text-right text-xs text-fg-3">
                {formatValue ? formatValue(segment.value) : segment.value}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
