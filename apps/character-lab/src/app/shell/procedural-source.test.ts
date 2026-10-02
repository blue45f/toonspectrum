import { describe, expect, it } from "vitest";

import { EMPTY_OUTFIT_RESULT, createDefaultRecipe } from "../../contracts";
import { minimalHumanoidModelFixture } from "../../testing/recipe-fixtures";

import { PROCEDURAL_BUILDER_MISSING, PROCEDURAL_SOURCE_INVALID, assertHumanoidModel, createProceduralSourceBuilder } from "./procedural-source";

import type { HumanoidBuildOptions } from "./procedural-source";
import type { HumanoidModelData, OutfitBuilderPort } from "../../contracts";

const outfit: OutfitBuilderPort = {
  buildHair: () => EMPTY_OUTFIT_RESULT,
  buildGarments: () => EMPTY_OUTFIT_RESULT,
};

describe("app/shell/procedural-source", () => {
  it("humanoid 빌더가 없으면 fixture로 대체하지 않고 procedural-builder-missing으로 실패한다", async () => {
    const build = createProceduralSourceBuilder({ humanoid: null, outfit, subdivisionLevels: 1, seed: 7, now: () => 3 });
    await expect(build(createDefaultRecipe())).rejects.toMatchObject({ code: PROCEDURAL_BUILDER_MISSING, at: 3 });
  });

  it("빌더에 레시피·세분 단계·시드·outfit 포트를 그대로 넘기고 결과를 정합성 검사한 뒤 돌려준다", async () => {
    const seen: HumanoidBuildOptions[] = [];
    const fixture = minimalHumanoidModelFixture();
    const build = createProceduralSourceBuilder({
      humanoid: (recipe, options) => {
        expect(recipe.version).toBe(1);
        seen.push(options);
        return fixture;
      },
      outfit,
      subdivisionLevels: 1,
      seed: 20261001,
    });
    await expect(build(createDefaultRecipe())).resolves.toBe(fixture);
    expect(seen).toEqual([{ subdivisionLevels: 1, seed: 20261001, outfit }]);
  });

  it("빌더 결과의 파츠가 정합성 검사를 통과하지 못하면 procedural-source-invalid로 실패한다", async () => {
    const fixture = minimalHumanoidModelFixture();
    const first = fixture.parts[0];
    if (!first) throw new Error("fixture에 파츠가 없습니다.");
    const broken: HumanoidModelData = { ...fixture, parts: [{ ...first, normals: new Float32Array(3) }] };
    const build = createProceduralSourceBuilder({ humanoid: () => broken, outfit, subdivisionLevels: 0, seed: 1, now: () => 9 });
    await expect(build(createDefaultRecipe())).rejects.toMatchObject({ code: PROCEDURAL_SOURCE_INVALID, at: 9 });
    expect(() => assertHumanoidModel({ ...fixture, parts: [] }, 1)).toThrow(expect.objectContaining({ code: PROCEDURAL_SOURCE_INVALID }));
  });
});
