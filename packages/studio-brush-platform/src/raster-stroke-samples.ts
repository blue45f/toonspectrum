/** Renderer/schema-free stroke input and deterministic parity fixture. */
export interface RasterStrokeSample {
  x: number;
  y: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  tMs: number;
}

/**
 * The standard fidelity path: x sweeps left→right while y zigzags through
 * three triangle cycles, carrying a linear 0→1 pressure ramp. Deterministic,
 * shared by the compile-bridge gates so goldens stay comparable.
 */
export function standardZigzagStrokeSamples(
  width: number,
  height: number,
  sampleCount: number,
): RasterStrokeSample[] {
  const margin = 16;
  // Leave real headroom for wide, high-pressure dabs: clipping ink at the
  // zigzag peaks would corrupt the pressure→mass profile the gates measure.
  const amplitude = Math.max(4, height / 2 - 24);
  const cycles = 3;
  const samples: RasterStrokeSample[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const t = sampleCount === 1 ? 0 : index / (sampleCount - 1);
    const phase = (t * cycles) % 1;
    const zig = phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase;
    samples.push({
      x: margin + t * (width - 2 * margin),
      y: height / 2 + zig * amplitude,
      pressure: t,
      tiltX: 0,
      tiltY: 0,
      tMs: index * 6,
    });
  }
  return samples;
}

