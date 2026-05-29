import { cn } from "@/lib/utils";

export interface AreaPoint {
  label: string | number;
  value: number;
}

/**
 * 단색 영역/라인 차트 — 순수 SVG path.
 * 시계열(연도별 추이 등)에 사용. viewBox 좌표계 기반으로 반응형.
 * 영역 채움(저채도 그라디언트) + 상단 스트로크 라인 + 데이터 도트.
 */
export function AreaChart({
  points,
  color = "var(--color-accent)",
  height = 132,
  className,
  showDots = true,
  highlightLast = true,
}: {
  points: AreaPoint[];
  color?: string;
  height?: number;
  className?: string;
  showDots?: boolean;
  /** 마지막 포인트(최신)를 악센트 도트로 강조 */
  highlightLast?: boolean;
}) {
  const W = 320;
  const H = 100;
  const padX = 6;
  const padTop = 10;
  const padBottom = 16;
  const max = Math.max(1, ...points.map((p) => p.value));
  const n = points.length;
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;

  const xy = points.map((p, i) => {
    const x = padX + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = padTop + (1 - p.value / max) * innerH;
    return { x, y, ...p };
  });

  const line = xy.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const baseY = padTop + innerH;
  const area = `${line} L${xy[xy.length - 1].x.toFixed(1)},${baseY} L${xy[0].x.toFixed(1)},${baseY} Z`;
  const gid = `area-fill-${Math.round((xy[0]?.value ?? 0) + n * 7)}`;

  return (
    <div className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* baseline 해어라인 */}
        <line
          x1={padX}
          y1={baseY}
          x2={W - padX}
          y2={baseY}
          stroke="var(--color-line)"
          strokeWidth="0.75"
        />
        <path d={area} fill={`url(#${gid})`} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {showDots &&
          xy.map((p, i) => {
            const isLast = highlightLast && i === n - 1;
            return (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={isLast ? 3 : 1.8}
                fill={isLast ? color : "var(--color-canvas)"}
                stroke={color}
                strokeWidth={isLast ? 0 : 1.4}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
      </svg>
      {/* x축 라벨 (양끝 + 중간 일부) */}
      <div className="mt-1 flex justify-between px-1">
        {xy.map((p, i) => {
          const show = n <= 7 || i === 0 || i === n - 1 || i % Math.ceil(n / 6) === 0;
          return (
            <span
              key={i}
              className={cn(
                "tnum text-[0.62rem] text-fg-3",
                !show && "opacity-0",
                highlightLast && i === n - 1 && "font-medium text-fg-2"
              )}
            >
              {String(p.label).slice(2)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
