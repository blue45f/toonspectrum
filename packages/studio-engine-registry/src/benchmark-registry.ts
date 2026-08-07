import { computeProviderScore, SCORE_WEIGHTS } from "./descriptor";

import type { AxisScores, ScoreAxis } from "./descriptor";

/**
 * ProviderBenchmarkRegistry (V11.1 §2 HybridExecutionPlanner 구성요소, 사용자
 * 지시 2026-08-07: 성능만이 아니라 실제 품질로 선택).
 *
 * Measured axis scores in [0,1] per provider; unmeasured axes default to a
 * neutral 0.5 so a provider is never rewarded or punished for missing data.
 * `visualQuality` carries the Quality Lab evidence (PSNR/SSIM vs
 * engine-independent references — tests/benchmarks/results/quality-lab.json),
 * which §3.2 weights at 30/100: quality outvotes any single speed axis.
 */

const NEUTRAL = 0.5;

export class ProviderBenchmarkRegistry {
  private readonly scores = new Map<string, Partial<AxisScores>>();

  record(providerId: string, axes: Partial<AxisScores>): void {
    const current = this.scores.get(providerId) ?? {};
    this.scores.set(providerId, { ...current, ...axes });
  }

  axisScores(providerId: string): AxisScores {
    const measured = this.scores.get(providerId) ?? {};
    const full = {} as AxisScores;
    for (const axis of Object.keys(SCORE_WEIGHTS) as ScoreAxis[]) {
      full[axis] = measured[axis] ?? NEUTRAL;
    }
    return full;
  }

  hasMeasurements(providerId: string): boolean {
    return this.scores.has(providerId);
  }

  /** §3.2 weighted total (0..100) with neutral fill for unmeasured axes. */
  score(providerId: string): number {
    return computeProviderScore(this.axisScores(providerId));
  }
}

/** Maps a PSNR measurement (dB, vs reference) onto the [0,1] quality axis. */
export function psnrToQualityAxis(psnrDb: number): number {
  // 20dB (visibly degraded) → 0, 50dB (reference-faithful) → 1.
  return Math.min(1, Math.max(0, (psnrDb - 20) / 30));
}
