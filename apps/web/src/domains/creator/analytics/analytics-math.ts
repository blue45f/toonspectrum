import type {
  CreatorAnalyticsKpi,
  CreatorAnalyticsKpiKey,
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
