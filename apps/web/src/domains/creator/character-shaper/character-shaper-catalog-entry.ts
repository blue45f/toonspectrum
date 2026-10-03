/**
 * Character Shaper — 카탈로그 항목 생성 헬퍼.
 *
 * 슬롯별 빌더가 공유하는 항목 팩토리와 능력 요구 상수다. 모든 항목은 여기서 동결되며,
 * id는 `"slot:name"` 네임스페이스를 따른다. (2026-10-03 파일 크기 래칫 해소로
 * character-shaper-catalog에서 추출 — 동작 변경 없음.)
 */

import type {
  CharacterCapabilityRequirement,
  CharacterGenreTag,
  CharacterPsdSemanticLayer,
  CharacterSemanticMorphBundle,
  CharacterSlotApplyRef,
  CharacterSlotEntry,
  CharacterSlotKind,
  CharacterSlotPreviewSpec,
} from "./character-shaper-contract";

export const MODEL_LOADED: readonly CharacterCapabilityRequirement[] = Object.freeze([{ kind: "model-loaded" as const }]);
export const HUMANOID: readonly CharacterCapabilityRequirement[] = Object.freeze([{ kind: "humanoid" as const }]);
export const PROPS: readonly CharacterCapabilityRequirement[] = Object.freeze([{ kind: "props" as const }]);
export const WARDROBE: readonly CharacterCapabilityRequirement[] = Object.freeze([{ kind: "wardrobe-metrics" as const }]);

export type EntrySeed = {
  readonly name: string;
  readonly label: string;
  readonly labelEn?: string;
  readonly hint: string;
  readonly tags: readonly CharacterGenreTag[];
  readonly keywords: readonly string[];
  readonly preview: CharacterSlotPreviewSpec;
  readonly apply: CharacterSlotApplyRef;
  readonly requires: readonly CharacterCapabilityRequirement[];
  readonly exportLayer: CharacterPsdSemanticLayer;
  readonly license?: CharacterSlotEntry["license"];
  readonly featured?: boolean;
};

export function entry(slot: CharacterSlotKind, order: number, seed: EntrySeed): CharacterSlotEntry {
  const { name, license, featured, labelEn, ...rest } = seed;
  return Object.freeze({
    id: `${slot}:${name}`,
    slot,
    ...rest,
    ...(labelEn ? { labelEn } : {}),
    tags: Object.freeze([...new Set(seed.tags)]),
    keywords: Object.freeze([...new Set(seed.keywords.map((keyword) => keyword.trim()).filter(Boolean))]),
    requires: Object.freeze([...seed.requires]),
    license: license ?? "toonstudio-original",
    order,
    ...(featured ? { featured: true } : {}),
  });
}

export function morphRequirement(morphs: CharacterSemanticMorphBundle): readonly CharacterCapabilityRequirement[] {
  const ids = (Object.keys(morphs) as (keyof CharacterSemanticMorphBundle)[])
    .filter((id) => Math.abs(morphs[id] ?? 0) >= 1e-4);
  return ids.length > 0 ? [{ kind: "semantic-morph", ids }] : MODEL_LOADED;
}
