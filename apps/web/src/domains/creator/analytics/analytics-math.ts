import type {
  CreatorAnalyticsKpi,
  CreatorAnalyticsKpiKey,
  CreatorAnalyticsPeriod,
  CreatorAnalyticsRetentionPoint,
} from "./types";

/** 증감률 표시: +12.3% / -4.1% / ±0% */
export function formatDeltaPct(deltaPct: number): string {
  const rounded = Math.round(deltaPct * 10) / 10;
  if (rounded === 0) return "±0%";
  const sign = rounded > 0 ? "+" : "-";
  return `${sign}${Math.abs(rounded)}%`;
}

/** 이탈률이 가장 큰 회차 포인트(1화 제외). 동률이면 앞 회차 우선. */
export function findWorstDropOffPoint(
  points: readonly CreatorAnalyticsRetentionPoint[],
): CreatorAnalyticsRetentionPoint | null {
  let worst: CreatorAnalyticsRetentionPoint | null = null;
  for (const point of points) {
    if (point.episode <= 1) continue;
    if (worst == null || point.dropOffPct > worst.dropOffPct) worst = point;
  }
  return worst;
}

/** KPI 키로 조회. 없으면 undefined. */
export function kpiByKey(
  kpis: readonly CreatorAnalyticsKpi[],
  key: CreatorAnalyticsKpiKey,
): CreatorAnalyticsKpi | undefined {
  return kpis.find((kpi) => kpi.key === key);
}

/**
 * 리텐션 곡선을 SVG 좌표로 변환.
 * x: 회차 순서, y: 잔존율(%). viewBox 320x120 기준.
 */
export function retentionPointToXy(
  point: CreatorAnalyticsRetentionPoint,
  index: number,
  count: number,
  width = 320,
  height = 120,
): { x: number; y: number } {
  const padX = 8;
  const padTop = 12;
  const padBottom = 18;
  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;
  const x = padX + (count <= 1 ? innerW / 2 : (index / (count - 1)) * innerW);
  const clamped = Math.max(0, Math.min(100, point.retentionPct));
  const y = padTop + (1 - clamped / 100) * innerH;
  return { x, y };
}

const PERIOD_DAYS: Record<CreatorAnalyticsPeriod, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/** 기간 코드(7d/30d/90d)의 일수. */
export function analyticsPeriodDays(period: CreatorAnalyticsPeriod): number {
  return PERIOD_DAYS[period];
}

/**
 * 집계 기준 시각(generatedAt)을 마지막 날로 하는 기간 범위.
 * 예: 30d, 9/30 집계 → 9/1 ~ 9/30(양 끝 포함 30일). 잘못된 시각이면 null.
 */
export function analyticsPeriodRange(
  period: CreatorAnalyticsPeriod,
  generatedAt: string,
): { start: Date; end: Date; days: number } | null {
  const end = new Date(generatedAt);
  if (!Number.isFinite(end.getTime())) return null;
  const days = analyticsPeriodDays(period);
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  return { start, end, days };
}

/** 증감 방향 — 모든 KPI는 "올라가면 좋은" 지표라 방향이 곧 좋고 나쁨이다. */
export function deltaDirection(deltaPct: number): "up" | "down" | "flat" {
  const rounded = Math.round(deltaPct * 10) / 10;
  if (rounded > 0) return "up";
  if (rounded < 0) return "down";
  return "flat";
}

/** 조각 사이 표면색 틈(도). 두께 18px 링 기준 약 2px — 테두리 선 없이 조각을 구분한다. */
const SEGMENT_GAP_DEG = 2;

/** conic-gradient 색 정지점 — 각 조각 끝에 표면색 틈을 넣는다. 조각이 틈보다 작으면 틈을 생략한다. */
export function donutGradientStops(
  segments: readonly { readonly value: number; readonly color: string }[],
  gapColor: string,
  gapDeg = SEGMENT_GAP_DEG,
): string {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) return `${gapColor} 0deg 360deg`;
  const stops: string[] = [];
  let cursor = 0;
  for (const segment of segments) {
    const sweep = (segment.value / total) * 360;
    const start = cursor;
    const end = cursor + sweep;
    const gap = segments.length > 1 && sweep > gapDeg * 2 ? gapDeg : 0;
    stops.push(`${segment.color} ${start.toFixed(2)}deg ${(end - gap).toFixed(2)}deg`);
    if (gap > 0) stops.push(`${gapColor} ${(end - gap).toFixed(2)}deg ${end.toFixed(2)}deg`);
    cursor = end;
  }
  return stops.join(", ");
}
