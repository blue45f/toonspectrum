/**
 * 프레임 시간 링버퍼(순수). HUD의 frameMs/p95 계산에 쓴다.
 */
export interface FrameStats {
  push(frameMs: number): void;
  /** 가장 최근 값(없으면 0) */
  last(): number;
  /** nearest-rank p95(없으면 0) */
  p95(): number;
  average(): number;
  count(): number;
  reset(): void;
}

export function percentileNearestRank(values: readonly number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((percentile / 100) * sorted.length)));
  return sorted[rank - 1] ?? 0;
}

export function createFrameStats(capacity = 240): FrameStats {
  if (!Number.isInteger(capacity) || capacity <= 0) throw new Error(`createFrameStats: capacity(${capacity})는 양의 정수여야 합니다.`);
  const ring = new Float64Array(capacity);
  let head = 0;
  let size = 0;
  const snapshot = (): number[] => {
    const out: number[] = [];
    for (let i = 0; i < size; i += 1) out.push(ring[(head - size + i + capacity) % capacity] ?? 0);
    return out;
  };
  return {
    push(frameMs) {
      if (!Number.isFinite(frameMs) || frameMs < 0) return;
      ring[head] = frameMs;
      head = (head + 1) % capacity;
      size = Math.min(size + 1, capacity);
    },
    last: () => (size === 0 ? 0 : (ring[(head - 1 + capacity) % capacity] ?? 0)),
    p95: () => percentileNearestRank(snapshot(), 95),
    average() {
      if (size === 0) return 0;
      let sum = 0;
      for (const value of snapshot()) sum += value;
      return sum / size;
    },
    count: () => size,
    reset() {
      head = 0;
      size = 0;
    },
  };
}
