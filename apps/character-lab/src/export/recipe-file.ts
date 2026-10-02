/**
 * 레시피 JSON 파일 저장·불러오기. 파싱은 contracts/recipe.ts `parseRecipe`(strict zod, 미래 버전 거부)를 쓴다.
 * 페인트 레이어는 PNG base64 레코드로 레시피에 포함한다.
 */
import { failVisible, parseRecipe, recipeDigest } from "../contracts";
import { stableStringify } from "../shared/stable-json";

import { decodePaintLayerRecord, encodePaintLayerRecord } from "./paint-layer-record";

import type { CharacterRecipe, LabFailure, PaintLayer, ParseRecipeResult } from "../contracts";

export const RECIPE_FILE_SUFFIX = ".character.json";
export const RECIPE_MIME = "application/json";
/** 파일 하나의 상한(페인트 레이어 포함) */
export const MAX_RECIPE_FILE_BYTES = 64 * 1024 * 1024;

/** 키 정렬·2칸 들여쓰기(사람이 읽는 파일이면서 바이트 결정적) */
export function serializeRecipe(recipe: CharacterRecipe): string {
  return `${JSON.stringify(JSON.parse(stableStringify(recipe)), null, 2)}\n`;
}

export function parseRecipeFile(text: string, now?: number): ParseRecipeResult {
  if (text.length > MAX_RECIPE_FILE_BYTES) {
    return { ok: false, failure: failVisible("recipe-file-too-large", `레시피 파일이 상한(${MAX_RECIPE_FILE_BYTES} B)을 넘습니다.`, undefined, now) };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { ok: false, failure: failVisible("recipe-json-syntax", "레시피 파일이 올바른 JSON이 아닙니다.", error, now) };
  }
  return parseRecipe(json, now);
}

function datePart(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function recipeFileName(recipe: CharacterRecipe, date: Date = new Date()): string {
  return `character-${recipeDigest(recipe).slice(0, 8)}-${datePart(date)}${RECIPE_FILE_SUFFIX}`;
}

/** 레시피에 페인트 레이어를 PNG base64로 넣는다(빈 레이어는 제외). */
export async function embedPaintLayers(recipe: CharacterRecipe, layers: readonly PaintLayer[]): Promise<CharacterRecipe> {
  const records = [];
  for (const layer of layers) {
    if (layer.rgba.every((b) => b === 0)) continue;
    records.push(await encodePaintLayerRecord(layer));
  }
  return { ...recipe, paint: { layers: records } };
}

export interface ExtractedPaintLayers {
  readonly layers: readonly PaintLayer[];
  readonly failures: readonly LabFailure[];
}

/** 레시피의 페인트 레코드를 디코드한다. 깨진 레코드는 건너뛰고 사유를 모은다. */
export async function extractPaintLayers(recipe: CharacterRecipe, now?: number): Promise<ExtractedPaintLayers> {
  const layers: PaintLayer[] = [];
  const failures: LabFailure[] = [];
  for (const record of recipe.paint.layers) {
    const result = await decodePaintLayerRecord(record, now);
    if (result.ok) layers.push(result.layer);
    else failures.push(result.failure);
  }
  return { layers, failures };
}
