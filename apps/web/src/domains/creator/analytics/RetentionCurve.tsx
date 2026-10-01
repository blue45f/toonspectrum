import { useId } from "react";

import { cn } from "@/shared/lib/utils";
import { useT } from "@/shared/lib/i18n";
import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { CREATOR_ANALYTICS_DROP_OFF_THRESHOLD_PCT, type CreatorAnalyticsRetentionPoint } from "./types";
import { retentionPointToXy } from "./analytics-math";

const W = 320;
const H = 120;
const PAD_TOP = 12;
const PAD_BOTTOM = 18;
const GRID_PERCENTS = [25, 50, 75] as const;

/** 잔존율(%) 격자선의 viewBox y 좌표. */
function gridY(pct: number): number {
  return PAD_TOP + (1 - pct / 100) * (H - PAD_TOP - PAD_BOTTOM);
}

/**
 * 회차별 리텐션 곡선 — "이 회차에서 독자가 떨어졌다"를 바로 보여주는 핵심 차트.
 * 순수 SVG: 잔존율 선(2px) + 옅은 면 + 25/50/75% 가는 실선 격자 + 이탈 지점(상태색 표식·회차 라벨).
 * 선 그리기 애니메이션은 non-scaling-stroke 와 pathLength 조합에서 브라우저마다 끊겨 보여 쓰지 않는다.
 * 대신 전체를 짧게 페이드인하고, 모션 감소 설정에서는 바로 최종 상태를 보여 준다.
 * 모든 값은 아래 회차별 성과 표에도 있어 툴팁에만 의존하지 않는다.
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
  const bt = useBilingual("CreatorAnalyticsRetention");
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const n = points.length;
  const suffix = t("creatorAnalytics.dropOff.episodeSuffix", "화");
  const xy = points.map((point, index) => ({
    ...retentionPointToXy(point, index, n, W, H),
    point,
  }));

  const line =
    xy.length > 0
      ? xy.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
      : "";
  const baseY = H - PAD_BOTTOM;
  const first = xy[0];
  const last = xy[xy.length - 1];
  const area = first && last ? `${line} L${last.x.toFixed(1)},${baseY} L${first.x.toFixed(1)},${baseY} Z` : "";
  const dropOffs = points.filter((point) => point.isDropOff);
  const accessibleLabel = t("creatorAnalytics.retention.title", "회차별 리텐션 곡선");
  const pointTitle = (point: CreatorAnalyticsRetentionPoint) =>
    formatI18nTemplate(
      bt("{episode}화 · 잔존율 {retention}% · 이탈률 {dropOff}%", "Episode {episode} · retention {retention}% · drop-off {dropOff}%"),
      { episode: point.episode, retention: point.retentionPct, dropOff: point.dropOffPct },
    );

  const toLeft = (x: number) => `${((x / W) * 100).toFixed(3)}%`;
  const toTop = (y: number) => `${((y / H) * 100).toFixed(3)}%`;

  return (
    <div className={cn("w-full motion-safe:animate-fade-in", className)}>
      {/*
        선·면·격자는 가로로 늘어나도 되는 SVG(non-scaling-stroke)로, 표식·글자는 늘어나지 않도록
        같은 좌표계를 백분율로 옮긴 HTML 오버레이로 그린다(원이 타원으로 찌그러지거나 글자가 늘어나지 않게).
      */}
      <div className="flex">
        {/* y축 눈금 — 선·표식과 겹치지 않게 별도 여백 열에 둔다. */}
        <div className="relative w-9 shrink-0" style={{ height }} aria-hidden>
          {GRID_PERCENTS.map((pct) => (
            <span
              key={pct}
              className="tnum absolute right-2 -translate-y-1/2 text-[0.72rem] text-fg-3"
              style={{ top: toTop(gridY(pct)) }}
            >
              {pct}%
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1" style={{ height }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
            role="img"
            aria-label={
              dropOffs.length > 0
                ? `${accessibleLabel}: ${dropOffs.map((d) => `${d.episode}${suffix}`).join(", ")} ${bt("이탈", "drop-off")}`
                : accessibleLabel
            }
          >
            <defs>
              <linearGradient id={`ret-${gid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.16" />
                <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {GRID_PERCENTS.map((pct) => {
              const y = gridY(pct);
              return (
                <line
                  key={pct}
                  x1={8}
                  y1={y}
                  x2={W - 8}
                  y2={y}
                  stroke="var(--color-line)"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            <path d={area} fill={`url(#ret-${gid})`} />
            <path
              d={line}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {xy.map(({ x, y, point }) => {
            const isDrop = point.isDropOff;
            return (
              // 24px 판정 영역 안에 지름 10~12px 표식 + 표면색 2px 테두리. 가리키면 값 툴팁을 보여 준다.
              <span
                key={point.episode}
                aria-hidden
                title={pointTitle(point)}
                className="absolute grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center"
                style={{ left: toLeft(x), top: toTop(y) }}
              >
                <span className={cn("block rounded-full border-2 border-card", isDrop ? "size-3.5 bg-bad" : "size-3 bg-accent")} />
                {isDrop ? (
                  <span className="absolute bottom-full whitespace-nowrap rounded-md bg-card/90 px-1 text-[0.72rem] font-bold text-fg">
                    {point.episode}
                    {suffix}
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
      </div>
      {/* x축: 회차 라벨 — 표식과 같은 x 좌표에 맞춘다. */}
      <div className="relative ml-9 mt-1.5 h-4" aria-hidden>
        {xy.map(({ x, point }) => (
          <span
            key={point.episode}
            className={cn(
              "tnum absolute -translate-x-1/2 text-[0.72rem] text-fg-3",
              point.isDropOff && "font-bold text-fg underline decoration-bad decoration-2 underline-offset-2",
            )}
            style={{ left: toLeft(x) }}
          >
            {point.episode}
          </span>
        ))}
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.72rem] text-fg-2">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-4 rounded-full bg-accent" />
          {bt("잔존율(1화 대비)", "Retention (vs. episode 1)")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-2.5 rounded-full bg-bad" />
          {formatI18nTemplate(
            bt("이탈 지점(직전 회차보다 {pct}% 이상 감소)", "Drop-off ({pct}%+ below the previous episode)"),
            { pct: CREATOR_ANALYTICS_DROP_OFF_THRESHOLD_PCT },
          )}
        </span>
      </p>
    </div>
  );
}
