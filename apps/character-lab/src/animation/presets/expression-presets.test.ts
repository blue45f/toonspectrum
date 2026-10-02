import { describe, expect, it } from "vitest";

import { FACS_UNITS, clampExpression } from "../../contracts/expression";
import { SLOT_PRESET_IDS } from "../../contracts/preset-vocabulary";

import { EXPRESSION_PRESETS, findExpressionPreset } from "./expression-presets";

describe("EXPRESSION_PRESETS", () => {
  it("12개이며 어휘 id와 1:1(순서 포함)", () => {
    expect(EXPRESSION_PRESETS).toHaveLength(12);
    expect(EXPRESSION_PRESETS.map((p) => p.id)).toEqual(SLOT_PRESET_IDS.expression.map((n) => `expression/${n}`));
  });

  it("가중치는 FACS 유닛만, [0,1] 안이며 클램프 불변", () => {
    for (const preset of EXPRESSION_PRESETS) {
      for (const [unit, value] of Object.entries(preset.weights)) {
        expect(FACS_UNITS).toContain(unit);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      expect(clampExpression(preset.weights)).toEqual(preset.weights);
      expect(preset.labelKo).toMatch(/[가-힣]/u);
    }
  });

  it("neutral은 비어 있고 나머지는 서로 다르다", () => {
    expect(findExpressionPreset("neutral").weights).toEqual({});
    const seen = new Set(EXPRESSION_PRESETS.map((p) => JSON.stringify(p.weights)));
    expect(seen.size).toBe(12);
    expect(findExpressionPreset("wink").weights.eyeBlinkLeft).toBe(1);
  });
});
