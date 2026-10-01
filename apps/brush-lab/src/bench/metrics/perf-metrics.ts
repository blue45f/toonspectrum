import { percentile } from "./lab-math";

import type { DabBatchReceipt, StrokeReceipt } from "../../lanes/lane";

/**
 * 성능 지표(순수 함수). 측정 불가 값은 null(사유는 리포트 metricNotes에 기록).
 */

/** 초당 dab 수. elapsedMs ≤ 0이면 0. */
export function dabsPerSecond(dabs: number, elapsedMs: number): number {
  if (!(elapsedMs > 0)) return 0;
  return (dabs * 1000) / elapsedMs;
}

/** 백분위수 묶음. 키는 `p50`처럼 `p${p}`. */
export function percentiles(values: ArrayLike<number>, ps: readonly number[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of ps) out[`p${p}`] = percentile(values, p);
  return out;
}

export interface PerfSample {
  frameTimesMs: readonly number[];
  dabCount: number;
  submitCount: number;
  gpuTimeMs: number | null;
  memoryBytes: number | null;
  /** 프레임별 입력→제출 지연(ms). 측정 불가 프레임은 null. */
  inputToSubmitMs?: readonly (number | null)[];
  /** 전체 벽시계 경과(ms). 없으면 frameTimesMs 합. */
  elapsedMs?: number;
}

export interface PerfSummary {
  dabsPerSecond: number;
  frameCount: number;
  frameP50Ms: number;
  frameP95Ms: number;
  frameMaxMs: number;
  totalFrameMs: number;
  elapsedMs: number;
  submitCount: number;
  gpuTimeMs: number | null;
  memoryBytes: number | null;
  inputToSubmitP50Ms: number | null;
  inputToSubmitP95Ms: number | null;
}

export function summarizePerf(s: PerfSample): PerfSummary {
  const frames = s.frameTimesMs;
  let total = 0;
  let max = 0;
  for (const f of frames) {
    total += f;
    if (f > max) max = f;
  }
  const elapsed = s.elapsedMs ?? total;
  const latencies = (s.inputToSubmitMs ?? []).filter((v): v is number => v !== null && Number.isFinite(v));
  return {
    dabsPerSecond: dabsPerSecond(s.dabCount, elapsed),
    frameCount: frames.length,
    frameP50Ms: percentile(frames, 50),
    frameP95Ms: percentile(frames, 95),
    frameMaxMs: max,
    totalFrameMs: total,
    elapsedMs: elapsed,
    submitCount: s.submitCount,
    gpuTimeMs: s.gpuTimeMs,
    memoryBytes: s.memoryBytes,
    inputToSubmitP50Ms: latencies.length > 0 ? percentile(latencies, 50) : null,
    inputToSubmitP95Ms: latencies.length > 0 ? percentile(latencies, 95) : null,
  };
}

/** 레인 영수증 → PerfSample. */
export function perfSampleFromReceipts(
  receipt: StrokeReceipt,
  frames: readonly DabBatchReceipt[],
  elapsedMs: number,
  memoryBytes: number | null = null,
): PerfSample {
  return {
    frameTimesMs: receipt.frameTimesMs,
    dabCount: receipt.dabCount,
    submitCount: receipt.submitCount,
    gpuTimeMs: receipt.gpuTimeMs,
    memoryBytes,
    inputToSubmitMs: frames.map((f) => f.inputToSubmitMs),
    elapsedMs,
  };
}
