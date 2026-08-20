import type {
  ModeledSampleIR,
  StabilizerGraphIR,
} from "@toonspectrum/studio-project-model";

/**
 * Custom stabilizer stage (ADR 0005): the first-party lane that ships before
 * the Google Ink PoC gate. Two deterministic modes:
 *
 * - "ema": exponential moving average on positions. Zero-lag start, endpoint
 *   resolved so line endings stay where the artist lifted the pen.
 * - "spring": critically-damped spring follower — heavier smoothing with the
 *   pulled-string feel used for long inking strokes.
 *
 * Endpoint contract: both lanes end exactly on the raw pen-up sample, but the
 * filter lag is resolved over a trailing window instead of one hard snap
 * (ported from `flushStudioStrokeStabilizerEndpoint` in
 * src/domains/creator/brush/studio-stroke-stabilizer.ts — the live lane
 * catches its output up to the confirmed raw endpoint; the batch kernel
 * spreads that catch-up across the tail so high strength no longer produces
 * a last-segment kink).
 */

export function applyStabilizer(
  samples: readonly ModeledSampleIR[],
  config: StabilizerGraphIR,
): ModeledSampleIR[] {
  if (config.kind === "none" || config.strength === 0 || samples.length < 3) {
    return [...samples];
  }
  const smoothed =
    config.kind === "ema" ? emaStabilize(samples, config) : springStabilize(samples, config);
  return resolveEndpointTail(smoothed, samples, config.strength);
}

function emaStabilize(
  samples: readonly ModeledSampleIR[],
  config: StabilizerGraphIR,
): ModeledSampleIR[] {
  // strength 0..1 → keep-factor 1..0.05 (never fully frozen).
  const follow = 1 - config.strength * 0.95;
  const out: ModeledSampleIR[] = [];
  let x = samples[0]?.x ?? 0;
  let y = samples[0]?.y ?? 0;
  for (const sample of samples) {
    x += (sample.x - x) * follow;
    y += (sample.y - y) * follow;
    out.push({ ...sample, x, y });
  }
  return out;
}

function springStabilize(
  samples: readonly ModeledSampleIR[],
  config: StabilizerGraphIR,
): ModeledSampleIR[] {
  // Critically damped spring; stiffness shrinks as strength grows.
  const stiffness = 1 - config.strength * 0.9; // 1..0.1
  const out: ModeledSampleIR[] = [];
  let px = samples[0]?.x ?? 0;
  let py = samples[0]?.y ?? 0;
  let vx = 0;
  let vy = 0;
  let previousT = samples[0]?.tMs ?? 0;
  for (const sample of samples) {
    const dt = Math.min(4, Math.max(0.5, (sample.tMs - previousT) / 8));
    previousT = sample.tMs;
    const omega = stiffness;
    // Semi-implicit critically damped update.
    const ax = omega * omega * (sample.x - px) - 2 * omega * vx;
    const ay = omega * omega * (sample.y - py) - 2 * omega * vy;
    vx += ax * dt;
    vy += ay * dt;
    px += vx * dt;
    py += vy * dt;
    out.push({ ...sample, x: px, y: py });
  }
  return out;
}

/** 90% step-response of the ema lane at this strength, in samples — the tail window. */
function endpointTailSampleCount(strength: number, sampleCount: number): number {
  const follow = 1 - strength * 0.95;
  const decayPerSample = Math.max(1e-6, 1 - follow);
  const convergenceSamples = Math.log(0.1) / Math.log(decayPerSample);
  return Math.min(sampleCount - 1, Math.max(3, Math.min(24, Math.ceil(convergenceSamples))));
}

/**
 * Endpoint tail resolution. The smoothed path trails the raw pen-up point by
 * the filter lag; distribute that residual over the trailing window with a
 * smoothstep ramp so the path converges onto the raw endpoint instead of
 * jumping there in the final segment. The last sample is written verbatim
 * from the raw endpoint to keep the exact-endpoint contract free of float
 * drift. Deterministic; mutates only the freshly built `smoothed` array.
 */
function resolveEndpointTail(
  smoothed: ModeledSampleIR[],
  samples: readonly ModeledSampleIR[],
  strength: number,
): ModeledSampleIR[] {
  const lastIndex = smoothed.length - 1;
  const rawLast = samples[lastIndex];
  const smoothedLast = smoothed[lastIndex];
  if (!rawLast || !smoothedLast) return smoothed;
  const residualX = rawLast.x - smoothedLast.x;
  const residualY = rawLast.y - smoothedLast.y;
  const tailCount = endpointTailSampleCount(strength, smoothed.length);
  for (let offset = 1; offset < tailCount; offset += 1) {
    const index = lastIndex - tailCount + offset;
    const sample = smoothed[index];
    if (!sample) continue;
    const progress = offset / tailCount;
    const weight = progress * progress * (3 - 2 * progress);
    smoothed[index] = {
      ...sample,
      x: sample.x + residualX * weight,
      y: sample.y + residualY * weight,
    };
  }
  smoothed[lastIndex] = { ...rawLast };
  return smoothed;
}

/** Mean squared perpendicular jitter against the chord — test metric. */
export function pathJitterEnergy(samples: readonly ModeledSampleIR[]): number {
  if (samples.length < 3) return 0;
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!first || !last) return 0;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const length = Math.hypot(dx, dy) || 1;
  let energy = 0;
  for (const sample of samples) {
    const distance =
      Math.abs(dy * sample.x - dx * sample.y + last.x * first.y - last.y * first.x) / length;
    energy += distance * distance;
  }
  return energy / samples.length;
}

/**
 * Largest absolute turn angle (radians) across the trailing `segmentCount`
 * segments — test metric for the endpoint kink a hard final snap produces.
 */
export function pathEndpointKinkAngle(
  samples: readonly ModeledSampleIR[],
  segmentCount = 3,
): number {
  const lastIndex = samples.length - 1;
  const firstVertex = Math.max(1, lastIndex - segmentCount + 1);
  let maxTurn = 0;
  for (let index = firstVertex; index < lastIndex; index += 1) {
    const previous = samples[index - 1];
    const vertex = samples[index];
    const next = samples[index + 1];
    if (!previous || !vertex || !next) continue;
    const inX = vertex.x - previous.x;
    const inY = vertex.y - previous.y;
    const outX = next.x - vertex.x;
    const outY = next.y - vertex.y;
    if ((inX === 0 && inY === 0) || (outX === 0 && outY === 0)) continue;
    const turn = Math.abs(Math.atan2(inX * outY - inY * outX, inX * outX + inY * outY));
    maxTurn = Math.max(maxTurn, turn);
  }
  return maxTurn;
}
