/**
 * 레시피 파일 직렬화. 키 정렬·2칸 들여쓰기·끝 개행의 정규형이라 `serialize(deserialize(text)) === text`다.
 * 손상된 JSON·스키마 위반은 한글 사유의 LabFailure로 돌려준다(throw 없음).
 *
 * 브라우저 파일 열기·저장(`recipe-io.browser.ts`)이 쓰는 capability 판정(`openMethodFor`/`saveMethodFor`)과
 * 취소 판정(`isAbortError`)은 순수 함수라 여기 두고 Node 테스트로 검증한다.
 */
import { failVisible, parseRecipe, recipeDigest } from "../contracts";
import { stableStringify } from "../shared/stable-json";

import type { CharacterRecipe, ParseRecipeResult } from "../contracts";

export const RECIPE_MIME_TYPE = "application/json";
export const RECIPE_FILE_EXTENSION = ".json";
export const RECIPE_FILE_NAME_PATTERN = /^character-[0-9a-f]{8}\.json$/u;

/** 정규형 JSON 텍스트(키 정렬, 들여쓰기 2, 끝 개행 1) */
export function serializeRecipe(recipe: CharacterRecipe): string {
  const canonical: unknown = JSON.parse(stableStringify(recipe));
  return `${JSON.stringify(canonical, null, 2)}\n`;
}

/** JSON 구문 오류는 `recipe-json-syntax`, 스키마·버전 오류는 parseRecipe의 코드를 그대로 쓴다. */
export function deserializeRecipe(text: string, now?: number): ParseRecipeResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, failure: failVisible("recipe-json-syntax", `레시피 파일이 올바른 JSON이 아닙니다: ${message}`, error, now) };
  }
  return parseRecipe(json, now);
}

/** `character-<digest 앞 8자리>.json` */
export function recipeFileName(recipe: CharacterRecipe): string {
  return `character-${recipeDigest(recipe).slice(0, 8)}${RECIPE_FILE_EXTENSION}`;
}

// ---- 브라우저 파일 접근 capability 판정(순수) ----

/** File System Access API 존재 여부만 보는 최소 호스트 형태(window 또는 테스트용 객체) */
export interface FileAccessHost {
  readonly showOpenFilePicker?: unknown;
  readonly showSaveFilePicker?: unknown;
}

export type OpenMethod = "file-system-access" | "input-file";
export type SaveMethod = "file-system-access" | "anchor-download";

/** 어떤 열기 경로를 쓸지: `showOpenFilePicker`가 함수면 File System Access, 아니면 `<input type="file">` */
export function openMethodFor(host: FileAccessHost): OpenMethod {
  return typeof host.showOpenFilePicker === "function" ? "file-system-access" : "input-file";
}

/** 어떤 저장 경로를 쓸지: `showSaveFilePicker`가 함수면 File System Access, 아니면 `<a download>` */
export function saveMethodFor(host: FileAccessHost): SaveMethod {
  return typeof host.showSaveFilePicker === "function" ? "file-system-access" : "anchor-download";
}

/** 사용자가 피커를 취소했을 때의 오류(DOMException/Error name "AbortError"). 취소는 실패가 아니라 null 결과다. */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
