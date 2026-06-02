import { cn } from "@/lib/utils";

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

/**
 * 도넛 차트 — CSS conic-gradient.
 * 비율 구성(가격 모델 분포 등)에 사용. 중앙에 총합/캡션 슬롯.
 */
export function Donut({
  segments,
  size = 132,
  thickness = 18,
  center,
  className,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  center?: React.ReactNode;
  className?: string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  // 무변이 prefix-sum 으로 각 세그먼트의 시작/끝 각도 계산
  const stops = segments
    .map((s, i) => {
      const before = segments.slice(0, i).reduce((a, x) => a + x.value, 0);
      const start = (before / total) * 360;
      const end = ((before + s.value) / total) * 360;
      return `${s.color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
    })
    .join(", ");

  return (
    <div className={cn("flex flex-col items-center gap-4 sm:flex-row sm:gap-5", className)}>
      <div
        className="relative shrink-0 rounded-full"
        style={{ width: size, height: size, background: `conic-gradient(${stops})` }}
        role="img"
      >
        {/* 가운데 구멍 */}
        <div
          className="absolute rounded-full bg-card"
          style={{ inset: thickness }}
        />
        {center != null && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            {center}
          </div>
        )}
      </div>
      <ul className="flex w-full flex-col gap-2">
        {segments.map((s) => {
          const pct = (s.value / total) * 100;
          return (
            <li key={s.label} className="flex items-center gap-2.5">
              <span
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: s.color }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-sm text-fg-2">{s.label}</span>
              <span className="numeral text-sm text-fg tabular-nums">{pct.toFixed(0)}%</span>
              <span className="tnum w-7 text-right text-xs text-fg-3">{s.value}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
