/**
 * 표정 합성: 프리셋 가중치 + FACS 16 슬라이더.
 *
 * - `blendExpression(preset, sliders)`: 슬라이더가 지정한 유닛은 슬라이더 값이 우선, 나머지는 프리셋. [0,1] 클램프.
 * - `blendExpressionPresets(layers)`: 여러 프리셋을 영향도로 가중합(델타 블렌드셰이프 f = b0 + Σ w_k Δb_k의 가중치 단계, Lewis 2014).
 * - `relaxAntagonists(weights)`: three-vrm VRMExpressionManager의 override 규칙을 길항 쌍에 적용한 배수
 *   m = clamp(1 − Σ w_other, 0, 1)로 서로 모순되는 유닛(입꼬리 올림↔내림 등)이 동시에 1이 되지 않게 한다.
 * - `expressionToMorphWeights`: contracts/morph-names의 `facs:<unit>` 변환을 그대로 쓴다(단일 구현).
 */
import { FACS_UNITS, clampExpression } from "../contracts/expression";

import type { ExpressionWeights, FacsUnit } from "../contracts/expression";

export { expressionToMorphWeights } from "../contracts/morph-names";

/** 슬라이더 우선 합성. 슬라이더 값이 undefined인 유닛은 프리셋 값을 쓴다. */
export function blendExpression(presetWeights: ExpressionWeights, sliderOverrides: ExpressionWeights): ExpressionWeights {
  const merged: ExpressionWeights = {};
  for (const unit of FACS_UNITS) {
    const slider = sliderOverrides[unit];
    const preset = presetWeights[unit];
    const value = slider !== undefined && !Number.isNaN(slider) ? slider : preset;
    if (value !== undefined) merged[unit] = value;
  }
  return clampExpression(merged);
}

export interface ExpressionLayer {
  readonly weights: ExpressionWeights;
  /** 영향도 [0,1] */
  readonly influence: number;
}

/** 여러 프리셋 레이어를 영향도로 가중합한다(합이 1을 넘으면 1로 클램프). */
export function blendExpressionPresets(layers: readonly ExpressionLayer[]): ExpressionWeights {
  const sum: Partial<Record<FacsUnit, number>> = {};
  for (const layer of layers) {
    const influence = Math.min(1, Math.max(0, Number.isFinite(layer.influence) ? layer.influence : 0));
    if (influence === 0) continue;
    for (const unit of FACS_UNITS) {
      const w = layer.weights[unit];
      if (w === undefined || Number.isNaN(w)) continue;
      sum[unit] = (sum[unit] ?? 0) + w * influence;
    }
  }
  return clampExpression(sum);
}

/** 서로 모순되는 FACS 유닛 쌍(동시에 최대가 되면 메시가 찌그러진다). */
export const EXPRESSION_ANTAGONISTS: ReadonlyArray<readonly [FacsUnit, FacsUnit]> = [
  ["mouthSmile", "mouthFrown"],
  ["browInnerUp", "browDown"],
  ["browOuterUp", "browDown"],
  ["eyeWide", "eyeSquint"],
  ["eyeWide", "eyeBlinkLeft"],
  ["eyeWide", "eyeBlinkRight"],
  ["mouthPucker", "mouthSmile"],
  ["mouthPress", "jawOpen"],
  ["mouthPress", "mouthFunnel"],
];

/**
 * 길항 완화: 각 유닛에 m = clamp(1 − Σ(길항 상대 가중치), 0, 1)을 곱한다.
 * 양쪽을 동시에 줄이므로 대칭이며 결과는 입력보다 커지지 않는다.
 */
export function relaxAntagonists(weights: ExpressionWeights): ExpressionWeights {
  const input = clampExpression(weights);
  const multipliers: Partial<Record<FacsUnit, number>> = {};
  for (const [a, b] of EXPRESSION_ANTAGONISTS) {
    const wa = input[a] ?? 0;
    const wb = input[b] ?? 0;
    if (wa === 0 || wb === 0) continue;
    multipliers[a] = Math.min(multipliers[a] ?? 1, Math.max(0, 1 - wb));
    multipliers[b] = Math.min(multipliers[b] ?? 1, Math.max(0, 1 - wa));
  }
  const result: ExpressionWeights = {};
  for (const unit of FACS_UNITS) {
    const w = input[unit];
    if (w === undefined) continue;
    result[unit] = w * (multipliers[unit] ?? 1);
  }
  return clampExpression(result);
}

/** 두 표정을 t로 보간한다(미리보기·전환용, [0,1] 클램프). */
export function lerpExpression(from: ExpressionWeights, to: ExpressionWeights, t: number): ExpressionWeights {
  const k = Math.min(1, Math.max(0, t));
  const result: ExpressionWeights = {};
  for (const unit of FACS_UNITS) {
    const a = from[unit] ?? 0;
    const b = to[unit] ?? 0;
    const v = a + (b - a) * k;
    if (v !== 0) result[unit] = v;
  }
  return clampExpression(result);
}
