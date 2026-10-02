import type { NibSpec } from "./physics-model";

/**
 * 닙 벌어짐 2차계. g'' = ωn²·(target − g) − 2ζωn·g'.
 * - `stiffness` = ωn(rad/s), `damping` = ζ(0이면 임계 감쇠 1). 예: G펜 ωn ≈ 180 rad/s(≈ 2π·30).
 * - semi-implicit Euler, 내부 substep ≤ 2 ms(ωn·dt ≪ 2 안정 조건).
 * - target = clamp(p − threshold, 0, 1)·gapMax, 폭 = baseWidth + gap·widthGain.
 */

const f = Math.fround;
const MAX_SUBSTEP_MS = 2;

export interface NibFlexState {
  /** [0] gap(px), [1] gap 속도(px/s). */
  data: Float32Array;
}

export function nibTarget(pressure: number, spec: NibSpec): number {
  const t = pressure - spec.threshold;
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return f(c * spec.gapMax);
}

/** 획 시작 압력으로 정상 상태 초기화(첫 dab 지연 0). */
export function createNibFlexState(spec: NibSpec, initialPressure = 0): NibFlexState {
  const data = new Float32Array(2);
  data[0] = nibTarget(initialPressure, spec);
  data[1] = 0;
  return { data };
}

export interface NibOutput {
  nibGap: number;
  rx: number;
  ry: number;
}

export function stepNibFlex(
  state: NibFlexState,
  sample: { pressure: number },
  dtMs: number,
  spec: NibSpec,
): NibOutput {
  const target = nibTarget(sample.pressure, spec);
  const wn = spec.stiffness;
  const zeta = spec.damping > 0 ? spec.damping : 1;
  const steps = Math.max(1, Math.ceil(dtMs / MAX_SUBSTEP_MS));
  const h = dtMs / steps / 1000;
  let g = state.data[0] ?? 0;
  let v = state.data[1] ?? 0;
  for (let i = 0; i < steps; i += 1) {
    const acc = wn * wn * (target - g) - 2 * zeta * wn * v;
    v = f(v + acc * h);
    g = f(g + v * h);
  }
  if (g < 0) {
    g = 0;
    v = 0;
  }
  state.data[0] = g;
  state.data[1] = v;
  const width = f(spec.baseWidth + g * spec.widthGain);
  return { nibGap: g, rx: f(width / 2), ry: f((width * spec.aspect) / 2) };
}
