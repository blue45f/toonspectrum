import { describe, expect, it } from "vitest";

import { applyStabilizer, pathEndpointKinkAngle, pathJitterEnergy } from "../stabilizer";

import type { ModeledSampleIR, StabilizerGraphIR } from "@toonspectrum/studio-project-model";

/**
 * Endpoint tail-resolution contracts (slice D-04, ported from
 * `flushStudioStrokeStabilizerEndpoint` in
 * src/domains/creator/brush/studio-stroke-stabilizer.ts):
 *
 * The ema/spring lanes used to hard-snap only the final sample onto the raw
 * pen-up point, so at high strength the last segment turned sharply (kink).
 * The tail resolution spreads that catch-up over the trailing samples. These
 * tests pin the before/after with a pathJitterEnergy-style angle metric: the
 * legacy hard-snap kernels are reproduced verbatim below as the "before".
 */

const STEP_MS = 8; // 125 Hz pen cadence, matching the sibling stabilizer suites

/** Straight run, then a sharp 5-sample upward flick right before pen-up. */
function flickTailLine(count: number): ModeledSampleIR[] {
  const samples: ModeledSampleIR[] = [];
  let x = 0;
  let y = 0;
  for (let index = 0; index < count; index += 1) {
    if (index > 0) {
      const angle = index >= count - 5 ? Math.PI * 0.42 : 0;
      x += Math.cos(angle) * 2.4;
      y += Math.sin(angle) * 2.4;
    }
    samples.push({
      x,
      y,
      tMs: index * STEP_MS,
      pressure: 0.6,
      velocity: 1,
      altitudeDeg: 90,
      azimuthDeg: 0,
    });
  }
  return samples;
}

/** Deterministic jittery diagonal: y = x + high-frequency hand tremor. */
function jitteryLine(count: number): ModeledSampleIR[] {
  const samples: ModeledSampleIR[] = [];
  for (let index = 0; index < count; index += 1) {
    const t = index / (count - 1);
    const noise = (index % 2 === 0 ? 1 : -1) * 2.2 + Math.sin(index * 0.9) * 0.6;
    samples.push({
      x: t * 100,
      y: t * 100 + noise,
      tMs: index * STEP_MS,
      pressure: 0.6,
      velocity: 1,
      altitudeDeg: 90,
      azimuthDeg: 0,
    });
  }
  return samples;
}

/** Legacy ema lane, quoted from stabilizer.ts before D-04: final sample hard-snapped. */
function legacyEmaHardSnap(
  samples: readonly ModeledSampleIR[],
  strength: number,
): ModeledSampleIR[] {
  const follow = 1 - strength * 0.95;
  const out: ModeledSampleIR[] = [];
  let x = samples[0]?.x ?? 0;
  let y = samples[0]?.y ?? 0;
  samples.forEach((sample, index) => {
    x += (sample.x - x) * follow;
    y += (sample.y - y) * follow;
    const isLast = index === samples.length - 1;
    out.push({ ...sample, x: isLast ? sample.x : x, y: isLast ? sample.y : y });
  });
  return out;
}

/** Legacy spring lane, quoted from stabilizer.ts before D-04: final sample hard-snapped. */
function legacySpringHardSnap(
  samples: readonly ModeledSampleIR[],
  strength: number,
): ModeledSampleIR[] {
  const stiffness = 1 - strength * 0.9;
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
    const ax = omega * omega * (sample.x - px) - 2 * omega * vx;
    const ay = omega * omega * (sample.y - py) - 2 * omega * vy;
    vx += ax * dt;
    vy += ay * dt;
    px += vx * dt;
    py += vy * dt;
    const isLast = index === samples.length - 1;
    out.push({ ...sample, x: isLast ? sample.x : px, y: isLast ? sample.y : py });
  });
  return out;
}

function legacyHardSnap(
  kind: "ema" | "spring",
  samples: readonly ModeledSampleIR[],
  strength: number,
): ModeledSampleIR[] {
  return kind === "ema"
    ? legacyEmaHardSnap(samples, strength)
    : legacySpringHardSnap(samples, strength);
}

function graph(kind: "ema" | "spring", strength: number): StabilizerGraphIR {
  return { kind, strength, predictionMs: 0 };
}

describe("stabilizer endpoint tail resolution", () => {
  // Measured on the deterministic flick fixture at strength 0.9 (rad):
  //   ema    kink 0.1383 → 0.0991 (bounded by the filter's own final-sample
  //          step response, which no tail pass may cancel)
  //   spring kink 0.2758 → 0.0496 (the velocity-carrying lane snapped worst)
  it.each([
    { kind: "ema", minBefore: 0.1, maxRatio: 0.8 },
    { kind: "spring", minBefore: 0.2, maxRatio: 0.25 },
  ] as const)(
    "$kind at high strength converges over trailing samples instead of one hard snap",
    ({ kind, minBefore, maxRatio }) => {
      const flick = flickTailLine(64);
      const strength = 0.9;
      const resolved = applyStabilizer(flick, graph(kind, strength));
      const snapped = legacyHardSnap(kind, flick, strength);

      const kinkBefore = pathEndpointKinkAngle(snapped);
      const kinkAfter = pathEndpointKinkAngle(resolved);
      // The hard snap turned sharply into the raw endpoint; the tail
      // resolution must flatten that trailing turn.
      expect(kinkBefore).toBeGreaterThan(minBefore);
      expect(kinkAfter).toBeLessThan(kinkBefore * maxRatio);
    },
  );

  it.each(["ema", "spring"] as const)("%s still ends exactly on the raw pen-up sample", (kind) => {
    const noisy = jitteryLine(48);
    const resolved = applyStabilizer(noisy, graph(kind, 0.9));
    const lastIn = noisy.at(-1);
    const lastOut = resolved.at(-1);
    expect(lastOut?.x).toBe(lastIn?.x);
    expect(lastOut?.y).toBe(lastIn?.y);
    const firstOut = resolved.at(0);
    expect(firstOut?.x).toBe(noisy[0]?.x);
    expect(firstOut?.y).toBe(noisy[0]?.y);
  });

  it.each(["ema", "spring"] as const)(
    "%s leaves the stroke body untouched — resolution is tail-local",
    (kind) => {
      const noisy = jitteryLine(64);
      const strength = 0.9;
      const resolved = applyStabilizer(noisy, graph(kind, strength));
      const snapped = legacyHardSnap(kind, noisy, strength);
      // The legacy kernel equals the raw filter everywhere but the final
      // snap, so an unchanged first half proves the tail window is bounded.
      expect(resolved.slice(0, 32)).toStrictEqual(snapped.slice(0, 32));
    },
  );

  it.each(["ema", "spring"] as const)("%s keeps the jitter-reduction golden", (kind) => {
    const noisy = jitteryLine(48);
    const resolved = applyStabilizer(noisy, graph(kind, 0.7));
    expect(resolved).toHaveLength(noisy.length);
    expect(pathJitterEnergy(resolved)).toBeLessThan(pathJitterEnergy(noisy) * 0.6);
  });

  it("is deterministic and never mutates its input", () => {
    const noisy = jitteryLine(40);
    const snapshot = noisy.map((sample) => ({ ...sample }));
    const a = applyStabilizer(noisy, graph("ema", 0.85));
    const b = applyStabilizer(noisy, graph("ema", 0.85));
    expect(b).toStrictEqual(a);
    expect(noisy).toStrictEqual(snapshot);
    expect(a).not.toBe(noisy);
  });

  it("resolves short strokes without reading outside the sample range", () => {
    const noisy = jitteryLine(3);
    const resolved = applyStabilizer(noisy, graph("ema", 1));
    expect(resolved).toHaveLength(3);
    expect(resolved.at(-1)?.x).toBe(noisy.at(-1)?.x);
    expect(resolved.at(-1)?.y).toBe(noisy.at(-1)?.y);
    expect(resolved.every((sample) => Number.isFinite(sample.x) && Number.isFinite(sample.y))).toBe(
      true,
    );
  });
});
