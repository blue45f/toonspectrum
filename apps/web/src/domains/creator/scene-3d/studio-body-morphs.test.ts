import { describe, expect, it } from "vitest";

import {
  applyStudioBodyMorph,
  applyStudioHeadRatioPreset,
  clampStudioBodyMorphValue,
  STUDIO_BODY_MORPH_RANGE,
  STUDIO_HEAD_RATIO_PRESETS,
} from "./studio-body-morphs";
import { STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS } from "./studio-mannequin-model";

const BASE = STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS;

describe("studio body morphs", () => {
  it("모프 값은 -100~100으로 클램프됩니다", () => {
    expect(clampStudioBodyMorphValue(150)).toBe(STUDIO_BODY_MORPH_RANGE.max);
    expect(clampStudioBodyMorphValue(-150)).toBe(STUDIO_BODY_MORPH_RANGE.min);
    expect(clampStudioBodyMorphValue(Number.NaN)).toBe(0);
  });

  it("근육 모프는 build를 근육(2) 방향으로 이동시킵니다", () => {
    const result = applyStudioBodyMorph(BASE, { muscle: 100, bodyFat: 0, slim: 0 });
    expect(result.build).toBeGreaterThan(BASE.build);
    expect(result.upperArmThickness ?? 1).toBeGreaterThan(BASE.upperArmThickness ?? 1);
  });

  it("체지방 모프는 build를 통통(3) 방향·허리 굵기를 키웁니다", () => {
    const result = applyStudioBodyMorph(BASE, { muscle: 0, bodyFat: 100, slim: 0 });
    expect(result.build).toBeGreaterThan(BASE.build);
    expect(result.waistWidth ?? 1).toBeGreaterThan(BASE.waistWidth ?? 1);
  });

  it("슬림 모프는 build를 마른(0) 방향으로 이동시킵니다", () => {
    const result = applyStudioBodyMorph(BASE, { muscle: 0, bodyFat: 0, slim: 100 });
    expect(result.build).toBeLessThan(BASE.build);
    expect(result.limbThickness ?? 1).toBeLessThan(BASE.limbThickness ?? 1);
  });

  it("모프 0이면 파라미터가 변하지 않습니다", () => {
    const result = applyStudioBodyMorph(BASE, { muscle: 0, bodyFat: 0, slim: 0 });
    expect(result).toEqual(BASE);
  });

  it("두신 프리셋 4종이 headCount를 올바르게 설정합니다", () => {
    expect(STUDIO_HEAD_RATIO_PRESETS).toHaveLength(4);
    expect(applyStudioHeadRatioPreset(BASE, "realistic").headCount).toBe(7.5);
    expect(applyStudioHeadRatioPreset(BASE, "six").headCount).toBe(6);
    expect(applyStudioHeadRatioPreset(BASE, "four").headCount).toBe(4);
    expect(applyStudioHeadRatioPreset(BASE, "chibi").headCount).toBe(3);
  });

  it("알 수 없는 두신 프리셋은 거부됩니다", () => {
    expect(() =>
      applyStudioHeadRatioPreset(BASE, "unknown" as never),
    ).toThrowError("알 수 없는 두신 프리셋입니다");
  });
});
