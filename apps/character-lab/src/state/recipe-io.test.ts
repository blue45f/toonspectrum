import { describe, expect, it } from "vitest";

import { createDefaultRecipe } from "../contracts";

import { RECIPE_FILE_NAME_PATTERN, deserializeRecipe, isAbortError, openMethodFor, recipeFileName, saveMethodFor, serializeRecipe } from "./recipe-io";

describe("state/recipe-io", () => {
  it("직렬화 → 역직렬화 round-trip이 deep-equal이고 다시 직렬화하면 바이트가 같다", () => {
    const recipe = { ...createDefaultRecipe(), body: { height: 0.25 }, pose: { head: [0, 0, 0, 1] as const } };
    const text = serializeRecipe(recipe);
    expect(text.endsWith("\n")).toBe(true);
    const parsed = deserializeRecipe(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.recipe).toEqual(recipe);
    expect(serializeRecipe(parsed.recipe)).toBe(text);
  });

  it("키 순서가 달라도 같은 텍스트를 낸다", () => {
    const a = createDefaultRecipe();
    const b = JSON.parse(JSON.stringify({ ...a, colors: Object.fromEntries(Object.entries(a.colors).reverse()) }));
    expect(serializeRecipe(b)).toBe(serializeRecipe(a));
    expect(serializeRecipe(a)).toContain('"version": 1');
  });

  it("손상된 JSON은 recipe-json-syntax 한글 사유로 실패한다", () => {
    const result = deserializeRecipe("{ not json", 7);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("recipe-json-syntax");
    expect(result.failure.reasonKo).toContain("올바른 JSON이 아닙니다");
    expect(result.failure.at).toBe(7);
  });

  it("스키마 위반·버전 불일치는 parseRecipe 코드를 그대로 쓴다", () => {
    const base = createDefaultRecipe();
    const invalid = deserializeRecipe(JSON.stringify({ ...base, extra: 1 }));
    expect(!invalid.ok && invalid.failure.code).toBe("recipe-invalid");
    const future = deserializeRecipe(JSON.stringify({ ...base, version: 2 }));
    expect(!future.ok && future.failure.code).toBe("recipe-unsupported-version");
    expect(!future.ok && future.failure.reasonKo).toContain("지원하지 않는 레시피 버전");
  });

  it("파일 이름은 character-<digest8>.json이고 내용에 따라 달라진다", () => {
    const a = createDefaultRecipe();
    const name = recipeFileName(a);
    expect(name).toMatch(RECIPE_FILE_NAME_PATTERN);
    expect(recipeFileName({ ...a, body: { height: 0.5 } })).not.toBe(name);
    expect(recipeFileName(JSON.parse(serializeRecipe(a)))).toBe(name);
  });

  it("브라우저 파일 접근 capability 판정: 피커 함수가 있으면 File System Access, 없으면 input/anchor 경로", () => {
    const picker = (): Promise<never> => Promise.reject(new Error("미사용"));
    expect(openMethodFor({})).toBe("input-file");
    expect(openMethodFor({ showOpenFilePicker: undefined })).toBe("input-file");
    expect(openMethodFor({ showOpenFilePicker: "not-a-function" })).toBe("input-file");
    expect(openMethodFor({ showOpenFilePicker: picker })).toBe("file-system-access");
    expect(saveMethodFor({})).toBe("anchor-download");
    expect(saveMethodFor({ showSaveFilePicker: picker })).toBe("file-system-access");
    // 열기와 저장은 독립 판정이다(한쪽만 있는 브라우저).
    expect(openMethodFor({ showSaveFilePicker: picker })).toBe("input-file");
    expect(saveMethodFor({ showOpenFilePicker: picker })).toBe("anchor-download");
  });

  it("사용자 취소(AbortError)만 취소로 판정하고 다른 오류는 전파 대상이다", () => {
    expect(isAbortError(new DOMException("사용자가 취소했습니다", "AbortError"))).toBe(true);
    const named = new Error("취소");
    named.name = "AbortError";
    expect(isAbortError(named)).toBe(true);
    expect(isAbortError(new DOMException("권한 없음", "NotAllowedError"))).toBe(false);
    expect(isAbortError(new Error("디스크 오류"))).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});
