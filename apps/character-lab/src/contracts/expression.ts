/**
 * 표정 계약: FACS 유사 16 유닛, 가중치 [0, 1].
 */
import type { PresetId } from "./slots";

export const FACS_UNITS = [
  "browInnerUp",
  "browOuterUp",
  "browDown",
  "eyeBlinkLeft",
  "eyeBlinkRight",
  "eyeWide",
  "eyeSquint",
  "cheekPuff",
  "noseSneer",
  "jawOpen",
  "mouthSmile",
  "mouthFrown",
  "mouthPucker",
  "mouthFunnel",
  "mouthPress",
  "tongueOut",
] as const;

export type FacsUnit = (typeof FACS_UNITS)[number];

export type ExpressionWeights = Partial<Record<FacsUnit, number>>;

export interface ExpressionPreset {
  readonly id: PresetId;
  readonly labelKo: string;
  readonly weights: ExpressionWeights;
}

export const FACS_LABELS_KO: Readonly<Record<FacsUnit, string>> = {
  browInnerUp: "눈썹 안쪽 올림",
  browOuterUp: "눈썹 바깥 올림",
  browDown: "눈썹 내림",
  eyeBlinkLeft: "왼눈 감기",
  eyeBlinkRight: "오른눈 감기",
  eyeWide: "눈 크게",
  eyeSquint: "눈 찡그림",
  cheekPuff: "볼 부풀림",
  noseSneer: "코 찡그림",
  jawOpen: "턱 열기",
  mouthSmile: "입꼬리 올림",
  mouthFrown: "입꼬리 내림",
  mouthPucker: "입 오므림",
  mouthFunnel: "입 깔때기",
  mouthPress: "입 다물기",
  tongueOut: "혀 내밀기",
};

const FACS_SET: ReadonlySet<string> = new Set(FACS_UNITS);

export function isFacsUnit(value: string): value is FacsUnit {
  return FACS_SET.has(value);
}

/** 가중치를 [0, 1]로 클램프하고 0·NaN·미지 키를 제거한다. */
export function clampExpression(weights: ExpressionWeights): ExpressionWeights {
  const result: ExpressionWeights = {};
  for (const unit of FACS_UNITS) {
    const raw = weights[unit];
    if (raw === undefined || Number.isNaN(raw)) continue;
    const clamped = Math.min(1, Math.max(0, raw));
    if (clamped > 0) result[unit] = clamped;
  }
  return result;
}
