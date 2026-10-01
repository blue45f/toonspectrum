import { hashU32 } from "../core/rng";

import type { BristleSpec } from "./physics-model";

/**
 * 붓모 다발(스칼라 모델). 폭 = w0·(1 + spreadGain·p), 기울기 비대칭,
 * 각도는 진행 방향을 τ = followTauMs로 원형 추종(이력).
 * 붓모 가닥 위상 시드 = hashU32(strokeSeed, strandIndex, 0).
 */

const f = Math.fround;
const TWO_PI = Math.PI * 2;

export interface BristleState {
  /** [0] 현재 각도(rad), [1] 초기화 플래그. */
  data: Float32Array;
  readonly seed: number;
}

export function createBristleState(seed: number): BristleState {
  return { data: new Float32Array(2), seed: seed >>> 0 };
}

/** 가닥 위상 시드(24비트). */
export function strandPhaseSeed(strokeSeed: number, strandIndex: number): number {
  return hashU32(strokeSeed, strandIndex, 0x6b72) & 0x00ff_ffff;
}

function wrapAngle(a: number): number {
  let x = a % TWO_PI;
  if (x > Math.PI) x -= TWO_PI;
  if (x < -Math.PI) x += TWO_PI;
  return x;
}

export interface BristleOutput {
  rx: number;
  ry: number;
  angle: number;
  asymmetry: number;
}

export function stepBristle(
  state: BristleState,
  sample: { pressure: number; altitudeDeg: number; dirX: number; dirY: number },
  dtMs: number,
  spec: BristleSpec & { baseRadius: number },
): BristleOutput {
  const p = sample.pressure < 0 ? 0 : sample.pressure > 1 ? 1 : sample.pressure;
  const width = f(spec.baseRadius * (1 + spec.spreadGain * p));
  const alt = sample.altitudeDeg < 0 ? 0 : sample.altitudeDeg > 90 ? 90 : sample.altitudeDeg;
  const asym = f(spec.tiltGain * (1 - alt / 90));
  const rx = f(width * (1 + asym));
  const ry = f(width * (1 - 0.5 * asym));
  const target = Math.atan2(sample.dirY, sample.dirX);
  const d = state.data;
  let angle: number;
  if ((d[1] ?? 0) === 0) {
    angle = target;
    d[1] = 1;
  } else {
    const cur = d[0] ?? 0;
    const alpha = spec.followTauMs > 0 ? 1 - Math.exp(-dtMs / spec.followTauMs) : 1;
    angle = cur + wrapAngle(target - cur) * alpha;
  }
  angle = f(wrapAngle(angle));
  d[0] = angle;
  return { rx, ry, angle, asymmetry: asym };
}
