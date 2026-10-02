import { describe, expect, it } from "vitest";

import { RECIPE_COLOR_KEYS } from "./mesh-data";
import { characterRecipeSchema, createDefaultRecipe, parseRecipe, recipeDigest, recipePatchSchema, recipeColorsSchema } from "./recipe";

describe("contracts/recipe", () => {
  it("기본 레시피가 스키마를 통과하고 직렬화 round-trip이 동일하다", () => {
    const recipe = createDefaultRecipe();
    expect(characterRecipeSchema.safeParse(recipe).success).toBe(true);
    const parsed = parseRecipe(JSON.parse(JSON.stringify(recipe)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.recipe).toEqual(recipe);
  });

  it("strict: 알 수 없는 키를 거부한다", () => {
    const recipe = { ...createDefaultRecipe(), extra: 1 };
    const result = parseRecipe(recipe);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe("recipe-invalid");
      expect(result.failure.reasonKo).toMatch(/[가-힣]/u);
    }
  });

  it("범위 밖 값·잘못된 색·잘못된 프리셋 id를 거부한다", () => {
    const base = createDefaultRecipe();
    expect(parseRecipe({ ...base, body: { height: 2 } }).ok).toBe(false);
    expect(parseRecipe({ ...base, expression: { jawOpen: -0.1 } }).ok).toBe(false);
    expect(parseRecipe({ ...base, colors: { ...base.colors, skin: "#FFF" } }).ok).toBe(false);
    expect(parseRecipe({ ...base, slots: { ...base.slots, hair: "nope/x" } }).ok).toBe(false);
    expect(parseRecipe({ ...base, pose: { notABone: [0, 0, 0, 1] } }).ok).toBe(false);
    expect(parseRecipe({ ...base, pose: { head: [0, 0, 0, 1] } }).ok).toBe(true);
  });

  it("미래 버전은 한글 사유로 거부한다", () => {
    const result = parseRecipe({ ...createDefaultRecipe(), version: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe("recipe-unsupported-version");
      expect(result.failure.reasonKo).toContain("지원하지 않는 레시피 버전");
    }
    expect(parseRecipe(null).ok).toBe(false);
    expect(parseRecipe("x").ok).toBe(false);
  });

  it("digest는 키 순서와 무관하고 값 변경에 민감하다", () => {
    const a = createDefaultRecipe();
    const b = JSON.parse(JSON.stringify({ ...a, colors: Object.fromEntries(Object.entries(a.colors).reverse()) }));
    expect(recipeDigest(a)).toBe(recipeDigest(b));
    expect(recipeDigest(a)).toMatch(/^[0-9a-f]{16}$/u);
    expect(recipeDigest({ ...a, body: { height: 0.1 } })).not.toBe(recipeDigest(a));
  });

  it("패키지 소스 형식을 검증한다", () => {
    const base = createDefaultRecipe();
    expect(parseRecipe({ ...base, source: { kind: "package", characterId: "mina", sha256: "a".repeat(64) } }).ok).toBe(true);
    expect(parseRecipe({ ...base, source: { kind: "package", characterId: "Mina!", sha256: "a".repeat(64) } }).ok).toBe(false);
    expect(parseRecipe({ ...base, source: { kind: "package", characterId: "mina", sha256: "zz" } }).ok).toBe(false);
  });

  it("색 스키마 키와 RECIPE_COLOR_KEYS가 같다", () => {
    expect(Object.keys(recipeColorsSchema.shape).sort()).toEqual([...RECIPE_COLOR_KEYS].sort());
  });

  it("recipePatchSchema는 부분 색·파츠를 허용하고 모르는 키는 거부한다", () => {
    expect(recipePatchSchema.safeParse({ colors: { hair: "#112233" }, parts: { hair: "soft-bob" } }).success).toBe(true);
    expect(recipePatchSchema.safeParse({ slots: {} }).success).toBe(false);
    expect(recipePatchSchema.safeParse({ handPose: { left: { leftIndexDistal: [0, 0, 0, 1] }, right: {} } }).success).toBe(true);
  });
});
