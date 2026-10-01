import type { GraphiteSpec } from "./physics-model";

/**
 * 흑연·목탄·콩테 침착. 압력이 높을수록 종이 요철 골까지 채워진다(fill ↑ → 그레인 변조 ↓).
 * fill = clamp((p·contactGain − bumpThreshold)/(1 − bumpThreshold), 0, 1): 압력에 단조 증가.
 */

const f = Math.fround;

export interface GraphiteState {
  /** [0] 마모(0..1, 확장용). */
  data: Float32Array;
}

export function createGraphiteState(): GraphiteState {
  return { data: new Float32Array(1) };
}

/** 요철 채움 비율(압력 단조 증가). */
export function graphiteFill(p: number, contactGain: number, bumpThreshold: number): number {
  const denom = 1 - bumpThreshold;
  const v = denom > 0 ? (p * contactGain - bumpThreshold) / denom : 1;
  return f(v < 0 ? 0 : v > 1 ? 1 : v);
}

export interface GraphiteOutput {
  /** 요철 채움 비율(압력 단조 증가). */
  fill: number;
  /** dab.grain에 들어가는 그레인 변조 강도 = 1 − fill. */
  grain: number;
  /** 경도 보정 배율(압력이 높을수록 가장자리가 또렷). */
  hardnessScale: number;
}

export function stepGraphite(
  state: GraphiteState,
  sample: { pressure: number },
  _dtMs: number,
  spec: GraphiteSpec,
): GraphiteOutput {
  const fill = graphiteFill(sample.pressure, spec.contactGain, spec.bumpThreshold);
  state.data[0] = state.data[0] ?? 0;
  return { fill, grain: f(1 - fill), hardnessScale: f(0.6 + 0.4 * fill) };
}
