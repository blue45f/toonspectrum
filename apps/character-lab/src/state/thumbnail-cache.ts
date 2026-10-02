/**
 * 썸네일 캐시 키와 LRU 캐시.
 *
 * 프리셋 P의 썸네일은 `reduce(recipe, slot/apply P)`의 플랜이므로, P의 patch가 덮어쓰는 값은 썸네일에 영향이 없다.
 * 캐시 키는 그 부분을 뺀 레시피 digest다: 해당 슬롯 값, (카탈로그가 있으면) P의 patch가 다루는 파라미터·색,
 * 그리고 P가 덮어쓰는 표정/포즈/손 포즈 필드(카탈로그가 없으면 슬롯 종류로 판정)를 뺀다.
 * 따라서 같은 슬롯의 현재 선택을 바꾸거나 P가 덮어쓰는 키를 슬라이더로 바꿔도 P 카드의 키는 그대로이고,
 * 다른 슬롯·다른 색·셰이딩 모드가 바뀌면 키가 바뀐다.
 * paint 레이어(base64, 수 MB)는 썸네일에 반영하지 않으므로 키에서 제외한다.
 */
import { presetSlot } from "../contracts";
import { fnv1a64Hex } from "../shared/hash";
import { stableStringify } from "../shared/stable-json";

import type { BodyParamKey, CapturedRaster, CharacterRecipe, FaceParamKey, PresetCatalog, PresetId, RecipeColorKey, ShadingMode } from "../contracts";

export const THUMBNAIL_CACHE_DEFAULT_LIMIT = 400;

export function thumbnailCacheKey(presetId: PresetId, recipe: CharacterRecipe, shadingMode: ShadingMode, catalog?: PresetCatalog): string {
  const slot = presetSlot(presetId);
  const target = catalog?.get(presetId);

  const body: Partial<Record<BodyParamKey, number>> = { ...recipe.body };
  const face: Partial<Record<FaceParamKey, number>> = { ...recipe.face };
  const colors: Partial<Record<RecipeColorKey, string>> = { ...recipe.colors };
  if (target) {
    for (const key of Object.keys(target.patch.body ?? {}) as BodyParamKey[]) delete body[key];
    for (const key of Object.keys(target.patch.face ?? {}) as FaceParamKey[]) delete face[key];
    for (const key of Object.keys(target.patch.colors ?? {}) as RecipeColorKey[]) delete colors[key];
  }
  // 연기 필드는 patch가 그 필드를 통째로 교체할 때만 썸네일과 무관하다. 카탈로그가 없으면 슬롯 종류로 근사한다.
  const overridesExpression = target ? target.patch.expression !== undefined : slot === "expression";
  const overridesPose = target ? target.patch.pose !== undefined : slot === "pose";
  const overridesHandPose = target ? target.patch.handPose !== undefined : slot === "hand-pose";

  const subject = {
    source: recipe.source,
    slots: { ...recipe.slots, [slot]: null },
    body,
    face,
    colors,
    expression: overridesExpression ? null : recipe.expression,
    pose: overridesPose ? null : recipe.pose,
    handPose: overridesHandPose ? null : recipe.handPose,
    physics: recipe.physics,
    shadingMode,
  };
  return `${presetId}|${shadingMode}|${fnv1a64Hex(stableStringify(subject))}`;
}

export interface ThumbnailCache {
  readonly limit: number;
  get(key: string): CapturedRaster | undefined;
  set(key: string, raster: CapturedRaster): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  size(): number;
  /** 가장 오래된 것부터 */
  keys(): readonly string[];
}

/** 접근 순서 기반 LRU. `get`/`set`이 항목을 최신으로 올리고 한도를 넘으면 가장 오래된 항목을 버린다. */
export function createThumbnailCache(limit: number = THUMBNAIL_CACHE_DEFAULT_LIMIT): ThumbnailCache {
  const max = Math.max(1, Math.floor(limit));
  const map = new Map<string, CapturedRaster>();
  return {
    limit: max,
    get(key) {
      const value = map.get(key);
      if (value === undefined) return undefined;
      map.delete(key);
      map.set(key, value);
      return value;
    },
    set(key, raster) {
      map.delete(key);
      map.set(key, raster);
      while (map.size > max) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
    },
    has: (key) => map.has(key),
    delete: (key) => map.delete(key),
    clear: () => map.clear(),
    size: () => map.size,
    keys: () => [...map.keys()],
  };
}
