import { describe, expect, it } from "vitest";

import {
  applyStudioVrmExpressionIntensity,
  blendStudioVrmExpressionWeights,
  findStudioVrmExpressionCombo,
  normalizeStudioVrmExpressionWeights,
  STUDIO_VRM_EXPRESSION_COMBOS,
} from "./studio-vrm-expressions";

describe("studio vrm expressions", () => {
  it("표정 콤보 5종이 정의되어 있습니다", () => {
    expect(STUDIO_VRM_EXPRESSION_COMBOS.map((combo) => combo.id)).toEqual([
      "smile",
      "surprised",
      "angry",
      "sad",
      "neutral",
    ]);
  });

  it("모든 가중치는 0~1 범위입니다", () => {
    for (const combo of STUDIO_VRM_EXPRESSION_COMBOS) {
      for (const weight of Object.values(combo.weights)) {
        expect(weight).toBeGreaterThanOrEqual(0);
        expect(weight).toBeLessThanOrEqual(1);
      }
    }
  });

  it("콤보 조회가 동작합니다", () => {
    expect(findStudioVrmExpressionCombo("smile")?.weights).toEqual({ happy: 1 });
    expect(findStudioVrmExpressionCombo("neutral")?.weights).toEqual({});
    expect(findStudioVrmExpressionCombo("unknown")).toBeUndefined();
  });

  it("표정 블렌딩이 중간값을 돌립니다", () => {
    const mid = blendStudioVrmExpressionWeights({ happy: 1 }, { surprised: 1 }, 0.5);
    expect(mid.happy).toBeCloseTo(0.5, 10);
    expect(mid.surprised).toBeCloseTo(0.5, 10);
  });

  it("강도 0이면 무표정, 100이면 원본입니다", () => {
    expect(applyStudioVrmExpressionIntensity({ happy: 1 }, 0)).toEqual({});
    expect(applyStudioVrmExpressionIntensity({ happy: 1 }, 100)).toEqual({ happy: 1 });
    expect(applyStudioVrmExpressionIntensity({ happy: 1 }, 50)).toEqual({ happy: 0.5 });
  });

  it("가중치 정규화가 범위를 벗어난 값을 처리합니다", () => {
    const normalized = normalizeStudioVrmExpressionWeights({ happy: 2, sad: -1, angry: 0.7 });
    expect(normalized).toEqual({ happy: 1, angry: 0.7 });
  });
});
