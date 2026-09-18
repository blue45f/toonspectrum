export const STUDIO_SOAK_HEAP_MIN_ALLOWANCE_BYTES = 96 * 1024 * 1024;
export const STUDIO_SOAK_HEAP_RELATIVE_ALLOWANCE = 0.35;
export const STUDIO_SOAK_HEAP_MAX_SLOPE_BYTES_PER_HOUR = 8 * 1024 * 1024;
export const STUDIO_SOAK_HEAP_MIN_SLOPE_GROWTH_BYTES = 48 * 1024 * 1024;
export const STUDIO_SOAK_HEAP_MIN_SLOPE_WINDOW_MS = 30 * 60 * 1000;
export const STUDIO_SOAK_HEAP_MIN_SLOPE_SAMPLES = 4;

export function heapSlopeBytesPerHour(samples) {
  if (samples.length < 2) return 0;
  const origin = samples[0].atMs;
  const points = samples.map((sample) => ({
    x: (sample.atMs - origin) / 3_600_000,
    y: sample.usedBytes,
  }));
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  let covariance = 0;
  let variance = 0;
  for (const point of points) {
    const dx = point.x - meanX;
    covariance += dx * (point.y - meanY);
    variance += dx * dx;
  }
  return variance > 0 ? covariance / variance : 0;
}
export function evaluateStudioSoakHeapGrowth(samples, baseline = samples[0], options = {}) {
  if (!baseline || samples.length === 0) return null;
  const latest = samples.at(-1);
  const minAllowanceBytes = options.minAllowanceBytes ?? STUDIO_SOAK_HEAP_MIN_ALLOWANCE_BYTES;
  const relativeAllowance = options.relativeAllowance ?? STUDIO_SOAK_HEAP_RELATIVE_ALLOWANCE;
  const maxSlopeBytesPerHour = options.maxSlopeBytesPerHour ?? STUDIO_SOAK_HEAP_MAX_SLOPE_BYTES_PER_HOUR;
  const minSlopeGrowthBytes = options.minSlopeGrowthBytes ?? STUDIO_SOAK_HEAP_MIN_SLOPE_GROWTH_BYTES;
  const minSlopeWindowMs = options.minSlopeWindowMs ?? STUDIO_SOAK_HEAP_MIN_SLOPE_WINDOW_MS;
  const minSlopeSamples = options.minSlopeSamples ?? STUDIO_SOAK_HEAP_MIN_SLOPE_SAMPLES;
  const allowanceBytes = Math.max(minAllowanceBytes, Math.round(baseline.usedBytes * relativeAllowance));
  const growthBytes = latest.usedBytes - baseline.usedBytes;
  const relevant = samples.filter((sample) => sample.atMs >= baseline.atMs);
  const slopeBytesPerHour = heapSlopeBytesPerHour(relevant);
  const windowMs = latest.atMs - baseline.atMs;
  const absoluteExceeded = growthBytes > allowanceBytes;
  const slopeExceeded = relevant.length >= minSlopeSamples
    && windowMs >= minSlopeWindowMs
    && growthBytes >= minSlopeGrowthBytes
    && slopeBytesPerHour > maxSlopeBytesPerHour;
  return {
    absoluteExceeded,
    slopeExceeded,
    allowanceBytes,
    growthBytes,
    slopeBytesPerHour,
    windowMs,
  };
}
