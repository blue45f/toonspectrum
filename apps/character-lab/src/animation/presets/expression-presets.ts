/**
 * 표정 프리셋 12종(SLOT_PRESET_IDS.expression 어휘와 1:1). 모든 가중치는 [0,1].
 * 값은 FACS AU 조합(Ekman)을 16 유닛으로 옮긴 자체 제작 데이터다(외부 에셋 복제 없음).
 */
import { SLOT_PRESET_IDS } from "../../contracts/preset-vocabulary";

import type { ExpressionPreset, ExpressionWeights } from "../../contracts/expression";
import type { ExpressionPresetName } from "../../contracts/preset-vocabulary";

const WEIGHTS: Readonly<Record<ExpressionPresetName, { readonly labelKo: string; readonly weights: ExpressionWeights }>> = {
  neutral: { labelKo: "무표정", weights: {} },
  joy: { labelKo: "기쁨", weights: { mouthSmile: 0.9, eyeSquint: 0.35, browOuterUp: 0.25, browInnerUp: 0.15, jawOpen: 0.2 } },
  smile: { labelKo: "미소", weights: { mouthSmile: 0.6, eyeSquint: 0.15, mouthPress: 0.1 } },
  sad: { labelKo: "슬픔", weights: { mouthFrown: 0.7, browInnerUp: 0.8, eyeSquint: 0.2, mouthPress: 0.15 } },
  angry: { labelKo: "화남", weights: { browDown: 0.9, eyeSquint: 0.45, noseSneer: 0.5, mouthFrown: 0.4, mouthPress: 0.5 } },
  surprised: { labelKo: "놀람", weights: { browInnerUp: 0.8, browOuterUp: 0.8, eyeWide: 0.9, jawOpen: 0.6, mouthFunnel: 0.3 } },
  wink: { labelKo: "윙크", weights: { eyeBlinkLeft: 1, mouthSmile: 0.5, browOuterUp: 0.2 } },
  pout: { labelKo: "삐짐", weights: { mouthPucker: 0.8, browDown: 0.35, eyeSquint: 0.15, cheekPuff: 0.5 } },
  laugh: { labelKo: "웃음", weights: { mouthSmile: 1, jawOpen: 0.7, eyeSquint: 0.6, browOuterUp: 0.3, cheekPuff: 0.1 } },
  fear: { labelKo: "두려움", weights: { browInnerUp: 0.9, browOuterUp: 0.3, eyeWide: 0.8, jawOpen: 0.35, mouthFrown: 0.4, mouthPress: 0.1 } },
  disgust: { labelKo: "역겨움", weights: { noseSneer: 0.9, browDown: 0.5, eyeSquint: 0.5, mouthFrown: 0.3, mouthPress: 0.2 } },
  sleepy: { labelKo: "졸림", weights: { eyeBlinkLeft: 0.75, eyeBlinkRight: 0.75, browInnerUp: 0.2, jawOpen: 0.25, mouthFrown: 0.1 } },
};

/** 어휘 순서대로 12개 */
export const EXPRESSION_PRESETS: readonly ExpressionPreset[] = SLOT_PRESET_IDS.expression.map((name) => ({
  id: `expression/${name}`,
  labelKo: WEIGHTS[name].labelKo,
  weights: WEIGHTS[name].weights,
}));

export function findExpressionPreset(name: ExpressionPresetName): ExpressionPreset {
  const found = EXPRESSION_PRESETS.find((preset) => preset.id === `expression/${name}`);
  if (!found) throw new Error(`표정 프리셋이 없습니다: ${name}`);
  return found;
}
