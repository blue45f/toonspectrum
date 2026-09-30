import { useId } from "react";

import { cn } from "@/shared/lib/utils";
import { useT } from "@/shared/lib/i18n";
import { useInView } from "@/shared/hooks/use-in-view";

import type { CreatorAnalyticsRetentionPoint } from "./types";
import { retentionPointToXy } from "./analytics-math";

const W = 320;
const H = 120;

/**
 * 회차별 리텐션 곡선 — "이 회차에서 독자가 떨어졌다"를 바로 보여주는 핵심 차트.
 * 순수 SVG: 잔존율 라인 + 이탈 지점(빨간 마커·펄스 링) + 25/50/75% 그리드.
 */
export function RetentionCurve({
  points,
  height = 168,
  className,
}: {
  points: CreatorAnalyticsRetentionPoint[];
  height?: number;
  className?: string;
}) {
  const t = useT();
  const [ref, inView] = useInView<HTMLDivElement>();
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const n = points.length;
  const xy = points.map((point, index) => ({
    ...retentionPointToXy(point, index, n, W, H),
    point,
  }));

  const line =
    xy.length > 0
      ? xy.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
      : "";
  const baseY = H - 18;
  const area =
    xy.length > 0
      ? `${line} L${xy[xy.length - 1].x.toFixed(1)},${baseY} L${xy[0].x.toFixed(1)},${baseY} Z`
      : "";
  const lineDrawMs = 900;
  const dropOffs = points.filter((point) => point.isDropOff);
  const accessibleLabel = t(
    "creatorAnalytics.retention.title",
    "회차별 리텐션 곡선"
  );

  return (
    <div ref={ref} className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={
          dropOffs.length > 0
            ? `${accessibleLabel}: ${dropOffs.map((d) => `${d.episode}화`).join(", ")}에서 이탈`
            : accessibleLabel
        }
      >
        <defs>
          <linearGradient id={`ret-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* 25/50/75% 그리드 */}
        {[25, 50, 75].map((pct) => {
          const y = 12 + (1 - pct / 100) * (H - 12 - 18);
          return (
            <g key={pct}>
              <line
                x1={8}
                y1={y}
                x2={W - 8}
                y2={y}
                stroke="var(--color-line)"
                strokeWidth="0.5"
                strokeDasharray="3 3"
              />
              <text
                x={W - 10}
                y={y - 2.5}
                textAnchor="end"
                fontSize="7"
                fill="var(--color-fg-3)"
              >
                {pct}%
              </text>
            </g>
          );
        })}
        <path
          d={area}
          fill={`url(#ret-${gid})`}
          style={{
            opacity: inView ? 1 : 0,
            transition: "opacity 600ms var(--ease-out-expo)",
            transitionDelay: `${lineDrawMs * 0.5}ms`,
          }}
        />
        <path
          d={line}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          pathLength={1}
          style={{
            strokeDasharray: 1,
            strokeDashoffset: inView ? 0 : 1,
            transition: `stroke-dashoffset ${lineDrawMs}ms var(--ease-out-quint)`,
          }}
        />
        {xy.map(({ x, y, point }, i) => {
          const isDrop = point.isDropOff;
          const delay = n <= 1 ? 0 : (i / (n - 1)) * lineDrawMs;
          return (
            <g key={point.episode}>
              {isDrop && (
                <circle
                  cx={x}
                  cy={y}
                  r={7}
                  fill="none"
                  stroke="#fb7185"
                  strokeWidth="1.5"
                  opacity={inView ? 0.55 : 0}
                  style={{ transition: `opacity 300ms ease ${delay}ms` }}
                />
              )}
              <circle
                cx={x}
                cy={y}
                r={isDrop ? 3.4 : 2}
                fill={isDrop ? "#fb7185" : "var(--color-canvas)"}
                stroke={isDrop ? "#fb7185" : "var(--color-accent)"}
                strokeWidth={isDrop ? 0 : 1.5}
                vectorEffect="non-scaling-stroke"
                style={{
                  transformBox: "fill-box",
                  transformOrigin: "center",
                  opacity: inView ? 1 : 0,
                  transform: inView ? "scale(1)" : "scale(0.4)",
                  transition: `opacity 240ms var(--ease-out-expo) ${delay}ms, transform 240ms var(--ease-out-quint) ${delay}ms`,
                }}
              >
                <title>{`${point.episode}화 · 잔존율 ${point.retentionPct}% · 이탈률 ${point.dropOffPct}%`}</title>
              </circle>
              {isDrop && (
                <text
                  x={x}
                  y={Math.max(10, y - 11)}
                  textAnchor="middle"
                  fontSize="8.5"
                  fontWeight="700"
                  fill="#fb7185"
                  style={{
                    opacity: inView ? 1 : 0,
                    transition: `opacity 300ms ease ${delay + 120}ms`,
                  }}
                >
                  {point.episode}화
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {/* x축: 회차 라벨 */}
      <div className="mt-1 flex justify-between gap-1 overflow-hidden px-1" aria-hidden>
        {points.map((point) => (
          <span
            key={point.episode}
            className={cn(
              "tnum w-0 flex-1 text-center text-[0.68rem] text-fg-3",
              point.isDropOff && "font-bold text-rose-400"
            )}
          >
            {point.episode}
          </span>
        ))}
      </div>
    </div>
  );
}
