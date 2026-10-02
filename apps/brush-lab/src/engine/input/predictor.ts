import type { ModeledSample, PreviewSample } from "../core/types";

/**
 * 표시 전용 예측 표본. 마지막 두 정본 표본의 속도로 등속 외삽하며
 * 정본 스트림에는 절대 들어가지 않는다(`source: "predicted"`).
 */
export function predictSamples(
  history: readonly ModeledSample[],
  horizonMs: number,
  count: number,
): PreviewSample[] {
  const n = Math.max(0, Math.floor(count));
  if (n === 0 || horizonMs <= 0 || history.length === 0) return [];
  const last = history[history.length - 1];
  if (!last) return [];
  const prev = history.length >= 2 ? history[history.length - 2] : undefined;
  let vx = 0;
  let vy = 0;
  if (prev) {
    const dt = last.tMs - prev.tMs;
    if (dt > 0) {
      vx = (last.x - prev.x) / dt;
      vy = (last.y - prev.y) / dt;
    }
  }
  const out: PreviewSample[] = [];
  for (let i = 1; i <= n; i += 1) {
    const dt = (horizonMs * i) / n;
    out.push({
      x: last.x + vx * dt,
      y: last.y + vy * dt,
      tMs: last.tMs + dt,
      pressure: last.pressure,
      source: "predicted",
    });
  }
  return out;
}
