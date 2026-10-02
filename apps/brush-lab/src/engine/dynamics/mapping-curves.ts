import { evalCurve } from "../core/curve";

import type { Curve } from "../core/curve";
import type { Pcg32 } from "../core/rng";
import type { ModeledSample } from "../core/types";

/** 동적 매핑 입력 채널. */
export type DynamicInput =
  | "pressure"
  | "velocity"
  | "tiltAltitude"
  | "tiltAzimuth"
  | "twist"
  | "direction"
  | "strokeProgress"
  | "random"
  | "constant";

export interface DynamicMapping {
  input: DynamicInput;
  curve: Curve;
  min: number;
  max: number;
}

/** 속도 정규화 기준(px/ms). 2 px/ms = 2000 px/s에서 1. */
export const VELOCITY_NORM_PX_PER_MS = 2;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 입력 채널을 0..1로 정규화한다. `random`은 rng를 1회 소비한다. */
export function dynamicInputValue(
  input: DynamicInput,
  sample: ModeledSample,
  progress: number,
  rng: Pcg32,
): number {
  switch (input) {
    case "pressure":
      return clamp01(sample.pressure);
    case "velocity":
      return clamp01(sample.velocity / VELOCITY_NORM_PX_PER_MS);
    case "tiltAltitude":
      return clamp01(1 - sample.altitudeDeg / 90);
    case "tiltAzimuth":
      return clamp01((((sample.azimuthDeg % 360) + 360) % 360) / 360);
    case "twist":
      return clamp01(((((sample.twistDeg ?? 0) % 360) + 360) % 360) / 360);
    case "direction": {
      const a = Math.atan2(sample.dirY, sample.dirX);
      return clamp01(a / (Math.PI * 2) + 0.5);
    }
    case "strokeProgress":
      return clamp01(progress);
    case "random":
      return rng.nextF32();
    case "constant":
      return 1;
  }
}

/** 매핑 평가: min + (max − min)·curve(input). */
export function evaluateMapping(
  m: DynamicMapping,
  sample: ModeledSample,
  progress: number,
  rng: Pcg32,
): number {
  const t = dynamicInputValue(m.input, sample, progress, rng);
  return m.min + (m.max - m.min) * evalCurve(m.curve, t);
}

/** 여러 매핑의 곱(크기·flow 배율 합성 규약). 빈 배열은 1. */
export function evaluateMappingProduct(
  mappings: readonly DynamicMapping[],
  sample: ModeledSample,
  progress: number,
  rng: Pcg32,
): number {
  let v = 1;
  for (const m of mappings) v *= evaluateMapping(m, sample, progress, rng);
  return v;
}
