import { describe, expect, it } from "vitest";

import { createDefaultRecipe, recipeDigest } from "../contracts";
import { bytesEqual } from "../shared/typed-array";
import { defaultRecipeFixture } from "../testing/recipe-fixtures";

import { MAX_RECIPE_FILE_BYTES, RECIPE_FILE_SUFFIX, embedPaintLayers, extractPaintLayers, parseRecipeFile, recipeFileName, serializeRecipe } from "./recipe-file";

import type { PaintLayer } from "../contracts";

describe("recipe-file", () => {
  it("serialize → parse 왕복이 같고 키 순서와 무관하게 바이트가 결정적이다", () => {
    const recipe = defaultRecipeFixture();
    const text = serializeRecipe(recipe);
    expect(text.endsWith("\n")).toBe(true);
    const parsed = parseRecipeFile(text);
    if (!parsed.ok) throw new Error(parsed.failure.reasonKo);
    expect(parsed.recipe).toEqual(recipe);
    expect(recipeDigest(parsed.recipe)).toBe(recipeDigest(recipe));
    const shuffled = { ...recipe, version: recipe.version, slots: { ...recipe.slots } };
    expect(serializeRecipe(shuffled)).toBe(text);
  });

  it("JSON 문법 오류·미지원 버전·형식 오류는 한글 사유를 가진 LabFailure다", () => {
    const syntax = parseRecipeFile("{ not json", 3);
    expect(!syntax.ok && syntax.failure.code).toBe("recipe-json-syntax");
    expect(!syntax.ok && syntax.failure.at).toBe(3);
    const future = parseRecipeFile(JSON.stringify({ ...createDefaultRecipe(), version: 2 }));
    expect(!future.ok && future.failure.code).toBe("recipe-unsupported-version");
    expect(!future.ok && future.failure.reasonKo).toMatch(/지원하지 않는 레시피 버전/u);
    const invalid = parseRecipeFile(JSON.stringify({ ...createDefaultRecipe(), colors: { skin: "red" } }));
    expect(!invalid.ok && invalid.failure.code).toBe("recipe-invalid");
    const huge = parseRecipeFile("x".repeat(MAX_RECIPE_FILE_BYTES + 1));
    expect(!huge.ok && huge.failure.code).toBe("recipe-file-too-large");
  });

  it("파일명은 digest 8자리와 날짜를 담는다", () => {
    const recipe = defaultRecipeFixture();
    const name = recipeFileName(recipe, new Date(Date.UTC(2026, 9, 1)));
    expect(name).toBe(`character-${recipeDigest(recipe).slice(0, 8)}-20261001${RECIPE_FILE_SUFFIX}`);
  });

  it("페인트 레이어를 PNG base64로 넣고 꺼내면 바이트가 같다(빈 레이어 제외, 손상 레코드는 사유)", async () => {
    const painted: PaintLayer = { part: "skin", width: 8, height: 8, rgba: new Uint8ClampedArray(8 * 8 * 4).fill(90), revision: 2 };
    const empty: PaintLayer = { part: "hair", width: 8, height: 8, rgba: new Uint8ClampedArray(8 * 8 * 4), revision: 0 };
    const recipe = await embedPaintLayers(defaultRecipeFixture(), [painted, empty]);
    expect(recipe.paint.layers).toHaveLength(1);
    expect(recipe.paint.layers[0]?.part).toBe("skin");
    const reparsed = parseRecipeFile(serializeRecipe(recipe));
    if (!reparsed.ok) throw new Error(reparsed.failure.reasonKo);
    const extracted = await extractPaintLayers(reparsed.recipe);
    expect(extracted.failures).toHaveLength(0);
    expect(extracted.layers).toHaveLength(1);
    expect(bytesEqual(extracted.layers[0]?.rgba ?? [], painted.rgba)).toBe(true);

    const broken = await extractPaintLayers({ ...recipe, paint: { layers: [{ part: "top", width: 2, height: 2, pngBase64: "AAAA" }] } });
    expect(broken.layers).toHaveLength(0);
    expect(broken.failures[0]?.code).toBe("paint-layer-png");
  });
});
