import { describe, expect, it } from "vitest";

import { FACS_UNITS } from "../contracts/expression";

import { EXPRESSION_ANTAGONISTS, blendExpression, blendExpressionPresets, expressionToMorphWeights, lerpExpression, relaxAntagonists } from "./expression-blend";

describe("blendExpression", () => {
  it("슬라이더가 지정한 유닛은 슬라이더가 우선하고 나머지는 프리셋을 쓴다", () => {
    const out = blendExpression({ mouthSmile: 0.8, eyeSquint: 0.3 }, { mouthSmile: 0.2, jawOpen: 0.5 });
    expect(out).toEqual({ eyeSquint: 0.3, jawOpen: 0.5, mouthSmile: 0.2 });
  });

  it("범위를 [0,1]로 클램프하고 0·NaN은 제거한다", () => {
    const out = blendExpression({ mouthSmile: 1.7, browDown: -0.2 }, { eyeWide: Number.NaN, jawOpen: 0 });
    expect(out).toEqual({ mouthSmile: 1 });
    for (const value of Object.values(out)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("슬라이더 0은 프리셋 값을 덮어쓴다(명시 0 = 끔)", () => {
    expect(blendExpression({ mouthSmile: 0.9 }, { mouthSmile: 0 })).toEqual({});
  });
});

describe("blendExpressionPresets", () => {
  it("영향도로 가중합하고 합이 1을 넘으면 클램프한다", () => {
    const out = blendExpressionPresets([
      { weights: { mouthSmile: 0.8, jawOpen: 0.4 }, influence: 0.5 },
      { weights: { mouthSmile: 0.9, eyeWide: 1 }, influence: 1 },
    ]);
    expect(out.mouthSmile).toBe(1);
    expect(out.jawOpen).toBeCloseTo(0.2, 9);
    expect(out.eyeWide).toBe(1);
  });

  it("영향도 0·음수·NaN 레이어는 무시한다", () => {
    expect(blendExpressionPresets([{ weights: { jawOpen: 1 }, influence: 0 }, { weights: { jawOpen: 1 }, influence: -1 }, { weights: { jawOpen: 1 }, influence: Number.NaN }])).toEqual({});
  });
});

describe("relaxAntagonists", () => {
  it("길항 쌍이 동시에 켜지면 서로 줄이고, 결과는 입력을 넘지 않는다", () => {
    const out = relaxAntagonists({ mouthSmile: 1, mouthFrown: 0.5 });
    expect(out.mouthSmile).toBeCloseTo(0.5, 9);
    expect(out.mouthFrown).toBeUndefined();
    const single = relaxAntagonists({ mouthSmile: 0.7 });
    expect(single).toEqual({ mouthSmile: 0.7 });
  });

  it("쌍 목록은 FACS 유닛만 담고 자기 자신과 짝짓지 않는다", () => {
    for (const [a, b] of EXPRESSION_ANTAGONISTS) {
      expect(FACS_UNITS).toContain(a);
      expect(FACS_UNITS).toContain(b);
      expect(a).not.toBe(b);
    }
  });
});

describe("lerpExpression / expressionToMorphWeights", () => {
  it("보간은 양 끝에서 원본과 같고 중간은 선형이다", () => {
    const a = { mouthSmile: 0.2 };
    const b = { mouthSmile: 0.8, jawOpen: 0.4 };
    expect(lerpExpression(a, b, 0)).toEqual(a);
    expect(lerpExpression(a, b, 1)).toEqual(b);
    const mid = lerpExpression(a, b, 0.5);
    expect(mid.mouthSmile).toBeCloseTo(0.5, 9);
    expect(mid.jawOpen).toBeCloseTo(0.2, 9);
  });

  it("morph 이름 변환은 facs: 접두사를 붙인다", () => {
    expect(expressionToMorphWeights({ jawOpen: 0.5, mouthSmile: 0 })).toEqual({ "facs:jawOpen": 0.5 });
  });
});
