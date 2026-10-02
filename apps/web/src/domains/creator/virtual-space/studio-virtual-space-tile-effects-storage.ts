/**
 * 타일 이펙트 배치의 로컬 저장소 (죽은 동선 배선).
 *
 * 꾸미기 저장소(decoration)와 같은 방식을 따른다: 브라우저 localStorage에
 * 스코프별로 보관하고, 읽을 때는 `createTileEffect`로 다시 살균해 깨진
 * 항목은 버린다. 월드 게시 데이터에 타일 이펙트 필드가 생기면 그쪽을
 * 정본으로 삼고 이 저장소는 초안 용도로 강등한다.
 */

import {
  createTileEffect,
  type StudioTileEffectDefinition,
  type StudioTileEffectInput,
} from "./studio-virtual-space-tile-effects";

const TILE_EFFECTS_STORAGE_KEY = "toonspectrum:virtual-space-tile-effects:v1";

function storageKey(scope?: string): string {
  return scope ? `${TILE_EFFECTS_STORAGE_KEY}:${encodeURIComponent(scope)}` : TILE_EFFECTS_STORAGE_KEY;
}

function safeRead(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** 저장값을 살균된 타일 이펙트 목록으로 되돌린다. 형식이 깨졌으면 빈 목록. */
export function parseStudioTileEffects(raw: string | null): readonly StudioTileEffectDefinition[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const effects: StudioTileEffectDefinition[] = [];
  for (const item of parsed) {
    const result = createTileEffect(item as StudioTileEffectInput, effects.map((effect) => effect.id));
    if (result.ok) effects.push(result.effect);
  }
  return Object.freeze(effects);
}

export function readStudioTileEffects(scope?: string): readonly StudioTileEffectDefinition[] {
  return parseStudioTileEffects(safeRead(storageKey(scope)));
}

/** 저장 성공 여부. 실패(용량·차단)해도 실행은 메모리 상태로 계속된다. */
export function writeStudioTileEffects(effects: readonly StudioTileEffectDefinition[], scope?: string): boolean {
  try {
    globalThis.localStorage?.setItem(storageKey(scope), JSON.stringify(effects));
    return true;
  } catch {
    return false;
  }
}
