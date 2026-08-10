import type {
  ModeledSampleIR,
  StabilizerGraphIR,
} from "@toonspectrum/studio-project-model";

/**
 * Custom stabilizer stage (ADR 0005): the first-party lane that ships before
 * the Google Ink PoC gate. Two deterministic modes:
 *
 * - "ema": exponential moving average on positions. Zero-lag start, endpoint
 *   snapped so line endings stay where the artist lifted the pen.
 * - "spring": critically-damped spring follower — heavier smoothing with the
 *   pulled-string feel used for long inking strokes.
 */

export function applyStabilizer(
  samples: readonly ModeledSampleIR[],
  config: StabilizerGraphIR,
): ModeledSampleIR[] {
  if (config.kind === "none" || config.strength === 0 || samples.length < 3) {
    return [...samples];
  }
  return config.kind === "ema" ? emaStabilize(samples, config) : springStabilize(samples, config);
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
  samples.forEach((sample, index) => {
    x += (sample.x - x) * follow;
    y += (sample.y - y) * follow;
    const isLast = index === samples.length - 1;
    out.push({
      ...sample,
      x: isLast ? sample.x : x,
      y: isLast ? sample.y : y,
    });
  });
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
  samples.forEach((sample, index) => {
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
    const isLast = index === samples.length - 1;
    out.push({
      ...sample,
      x: isLast ? sample.x : px,
      y: isLast ? sample.y : py,
    });
  });
  return out;
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
