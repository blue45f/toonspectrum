/**
 * Pressure response curve graph — CSP/Procreate-class transfer curve math.
 * Pure functions only: maps input pressure → output size/opacity factor via exponent.
 * Not a brand clone of any vendor graph editor.
 */

const EXP_MIN = 0.35;
const EXP_MAX = 2.5;

export function clampStudioPressureCurveExponent(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 1;
  return Math.min(EXP_MAX, Math.max(EXP_MIN, n));
}

/** Same power curve as resolveBrushPressureSample (studio-brush). */
export function studioPressureCurveMap(input01: number, exponent: number): number {
  const x = Math.min(1, Math.max(0, input01));
  const e = clampStudioPressureCurveExponent(exponent);
  return Math.min(1, Math.max(0, Math.pow(x, e)));
}

export type StudioPressureCurvePoint = { x: number; y: number };

/** Chart samples in unit square (0,0 bottom-left → 1,1 top-right of input/output). */
export function studioPressureCurveGraphPoints(
  exponent: number,
  samples = 24
): StudioPressureCurvePoint[] {
  const n = Math.max(2, Math.min(64, Math.floor(samples)));
  const e = clampStudioPressureCurveExponent(exponent);
  const out: StudioPressureCurvePoint[] = [];
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    out.push({ x, y: studioPressureCurveMap(x, e) });
  }
  return out;
}

/**
 * SVG path for a viewBox chart: origin top-left, y grows down.
 * Unit curve is flipped so output rises toward top of chart.
 */
export function studioPressureCurvePathD(
  exponent: number,
  width: number,
  height: number,
  samples = 24
): string {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const pts = studioPressureCurveGraphPoints(exponent, samples);
  return pts
    .map((p, i) => {
      const sx = p.x * w;
      const sy = (1 - p.y) * h;
      return `${i === 0 ? "M" : "L"}${sx.toFixed(2)} ${sy.toFixed(2)}`;
    })
    .join(" ");
}

export function studioPressureCurveSliderMeta(exponent: number): {
  min: number;
  max: number;
  step: number;
  value: number;
  percent: number;
} {
  const value = clampStudioPressureCurveExponent(exponent);
  return {
    min: EXP_MIN,
    max: EXP_MAX,
    step: 0.05,
    value,
    percent: Math.round(((value - EXP_MIN) / (EXP_MAX - EXP_MIN)) * 100),
  };
}


