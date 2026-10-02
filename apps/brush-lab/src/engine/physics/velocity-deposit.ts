import type { VelocitySpec } from "./physics-model";

/**
 * 속도 의존 도포. 빠를수록 도포가 줄고(flowScale), vBreak를 넘으면 끊김(갈필)이 시작되며,
 * 느릴수록 수분 공급이 는다(물이 고임).
 */

const f = Math.fround;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export interface VelocityOutput {
  depositStrength: number;
  breakup: number;
  water: number;
}

/** v는 px/ms. */
export function velocityDeposit(v: number, spec: VelocitySpec): VelocityOutput {
  const vv = v < 0 ? 0 : v;
  const flowScale = f(Math.pow(1 - clamp01(vv / spec.vMax), spec.gamma));
  const span = spec.vMax - spec.vBreak;
  const breakup = span > 0 ? f(clamp01((vv - spec.vBreak) / span)) : vv > spec.vBreak ? 1 : 0;
  const slow = spec.vSlow > 0 ? 1 - clamp01(vv / spec.vSlow) : 0;
  const water = f(clamp01(spec.waterBase + spec.slowGain * slow));
  return { depositStrength: flowScale, breakup, water };
}
