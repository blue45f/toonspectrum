import { describe, expect, it } from "vitest";

import { EXTRA_POSE_PRESETS, NATURAL_IDLE_POSES } from "./studio-pose-presets";
import {
  STUDIO_VRM_CHARACTER_RECIPES,
  filterStudioVrmCharacterRecipes,
  studioVrmCharacterRecipeById,
} from "./studio-vrm-character-recipes";
import { POSE_PRESETS } from "./studio-vrm-poser-utils";
import { VRM_PROPS } from "./studio-vrm-props";
import { WARDROBE_SETS } from "./studio-vrm-wardrobe";
import { SAMPLE_VRMS } from "./vrm-library";

describe("VRM 시작 캐릭터 레시피", () => {
  it("모든 id가 고유하고 참조 대상이 실제 카탈로그에 있다", () => {
    const ids = STUDIO_VRM_CHARACTER_RECIPES.map((recipe) => recipe.id);
    expect(new Set(ids).size).toBe(ids.length);

    const modelIds = new Set(SAMPLE_VRMS.map((model) => model.id));
    const wardrobeSetIds = new Set(WARDROBE_SETS.map((set) => set.id));
    const poseIds = new Set(
      [...POSE_PRESETS, ...NATURAL_IDLE_POSES, ...EXTRA_POSE_PRESETS].map((pose) => pose.id)
    );
    const propIds = new Set(VRM_PROPS.map((prop) => prop.id));

    for (const recipe of STUDIO_VRM_CHARACTER_RECIPES) {
      expect(modelIds.has(recipe.modelId), `${recipe.id}.modelId`).toBe(true);
      expect(wardrobeSetIds.has(recipe.wardrobeSetId), `${recipe.id}.wardrobeSetId`).toBe(true);
      expect(poseIds.has(recipe.poseId), `${recipe.id}.poseId`).toBe(true);
      for (const propId of recipe.propIds) {
        expect(propIds.has(propId), `${recipe.id}.propIds.${propId}`).toBe(true);
      }
    }
  });

  it("아동부터 노년, 여성·남성·중성 표현을 모두 제공한다", () => {
    expect(new Set(STUDIO_VRM_CHARACTER_RECIPES.map((recipe) => recipe.ageBand))).toEqual(
      new Set(["child", "teen", "young-adult", "adult", "senior"])
    );
    expect(new Set(STUDIO_VRM_CHARACTER_RECIPES.map((recipe) => recipe.presentation))).toEqual(
      new Set(["feminine", "masculine", "androgynous"])
    );
  });

  it("의사·간호사·응급구조사 의료진을 연령·표현별로 충분히 제공한다", () => {
    const medical = STUDIO_VRM_CHARACTER_RECIPES.filter((recipe) =>
      ["doctor", "nurse", "paramedic"].includes(recipe.occupation)
    );
    expect(medical.length).toBeGreaterThanOrEqual(8);
    expect(new Set(medical.map((recipe) => recipe.presentation))).toEqual(
      new Set(["feminine", "masculine", "androgynous"])
    );
    expect(medical.some((recipe) => recipe.ageBand === "senior")).toBe(true);
    expect(medical.some((recipe) => recipe.occupation === "nurse")).toBe(true);
    expect(medical.some((recipe) => recipe.occupation === "paramedic")).toBe(true);
  });

  it("체형과 색상 입력이 포저 허용 범위와 6자리 hex를 지킨다", () => {
    for (const recipe of STUDIO_VRM_CHARACTER_RECIPES) {
      expect(recipe.bodyScale.height).toBeGreaterThanOrEqual(0.7);
      expect(recipe.bodyScale.height).toBeLessThanOrEqual(1.4);
      expect(recipe.bodyScale.width).toBeGreaterThanOrEqual(0.7);
      expect(recipe.bodyScale.width).toBeLessThanOrEqual(1.3);
      for (const color of Object.values(recipe.colors)) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it("검색과 연령·표현·직업 필터를 함께 적용한다", () => {
    expect(
      filterStudioVrmCharacterRecipes(STUDIO_VRM_CHARACTER_RECIPES, {
        occupation: "doctor",
        presentation: "androgynous",
      }).map((recipe) => recipe.id)
    ).toEqual(["doctor-androgynous"]);

    const seniors = filterStudioVrmCharacterRecipes(STUDIO_VRM_CHARACTER_RECIPES, {
      ageBand: "senior",
      query: "의사",
    });
    expect(seniors.map((recipe) => recipe.id)).toEqual([
      "senior-masculine-doctor",
      "senior-feminine-doctor",
    ]);

    expect(
      filterStudioVrmCharacterRecipes(STUDIO_VRM_CHARACTER_RECIPES, { query: "논바이너리" })
        .map((recipe) => recipe.id)
    ).toContain("doctor-androgynous");
  });

  it("id 조회는 정확히 찾고 미지의 id는 undefined를 반환한다", () => {
    expect(studioVrmCharacterRecipeById("doctor-feminine")?.occupation).toBe("doctor");
    expect(studioVrmCharacterRecipeById("missing")).toBeUndefined();
  });
});
