/**
 * 스프라이트 에셋 레지스트리 (Track 4 · 에셋 대량 추가)
 *
 * 가상 스튜디오의 모든 스프라이트 에셋을 ID·이름·카테고리·미리보기 구조로
 * 정리한 중앙 카탈로그. 전부 프로시저럴 코드 생성(외부 다운로드 없음)이라
 * 라이선스 문제가 없다.
 *
 * 카테고리:
 * - npc: NPC 아키타입 7종 (npc-cast 절차적 스킨)
 * - animal: 동물 6종 (펫 3종 + 크리터 3종)
 * - furniture: 가구 카탈로그 20종
 * - decor: 앰비언트 장식물 12종
 * - particle: 파티클 8종
 * - effect: 이동 이펙트 3종 (잔상·착지 퍼프·스키드 먼지, 로직 기반)
 */

import type { ProceduralSheetDeps } from "./studio-virtual-space-character-procedural";
import { STUDIO_AMBIENT_DECOR_CATALOG } from "./studio-virtual-space-ambient-decor";
import { STUDIO_NPC_ARCHETYPES } from "./studio-virtual-space-npc-archetypes";
import { buildStudioAnimalSpriteSheet, STUDIO_ANIMAL_SPRITE_KINDS, studioAnimalSpriteLabel } from "./studio-virtual-space-animal-sprites";
import { STUDIO_FURNITURE_CATALOG } from "./studio-virtual-space-furniture-catalog";
import { buildStudioParticleSprite, STUDIO_PARTICLE_SPRITE_KINDS, studioParticleSpriteLabel } from "./studio-virtual-space-particle-sprites";

/** 에셋 카테고리. */
export type StudioSpriteAssetCategory = "npc" | "animal" | "furniture" | "decor" | "particle" | "effect";

export const STUDIO_SPRITE_ASSET_CATEGORIES: readonly StudioSpriteAssetCategory[] = Object.freeze([
  "npc", "animal", "furniture", "decor", "particle", "effect",
]);

/** 에셋 소스. */
export type StudioSpriteAssetSource = "procedural" | "catalog" | "logic";

export interface StudioSpriteAsset {
  readonly id: string;
  readonly category: StudioSpriteAssetCategory;
  readonly source: StudioSpriteAssetSource;
  /** 미리보기 빌더 키 (procedural만). */
  readonly builderKey: string | null;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
}

/** 카테고리 라벨. */
export function studioSpriteAssetCategoryLabel(category: StudioSpriteAssetCategory): { readonly ko: string; readonly en: string } {
  switch (category) {
    case "npc": return { ko: "NPC", en: "NPCs" };
    case "animal": return { ko: "동물", en: "Animals" };
    case "furniture": return { ko: "가구", en: "Furniture" };
    case "decor": return { ko: "장식물", en: "Decor" };
    case "particle": return { ko: "파티클", en: "Particles" };
    case "effect": return { ko: "이펙트", en: "Effects" };
  }
}

function asset(def: StudioSpriteAsset): StudioSpriteAsset {
  return Object.freeze(def);
}

const EFFECT_ASSETS: readonly StudioSpriteAsset[] = Object.freeze([
  asset({ id: "effect:afterimage", category: "effect", source: "logic", builderKey: null,
    labelKo: "달리기 잔상", labelEn: "Run afterimage",
    descriptionKo: "최고속으로 달릴 때 남는 스프라이트 고스트예요.", descriptionEn: "Sprite ghosts left while sprinting." }),
  asset({ id: "effect:landing-puff", category: "effect", source: "logic", builderKey: null,
    labelKo: "급정지 퍼프", labelEn: "Landing puff",
    descriptionKo: "급정지하면 발밑에 먼지가 터져요.", descriptionEn: "Dust bursts on hard stops." }),
  asset({ id: "effect:skid-dust", category: "effect", source: "logic", builderKey: null,
    labelKo: "스키드 먼지", labelEn: "Skid dust",
    descriptionKo: "미끄러질 때 옆으로 나는 먼지예요.", descriptionEn: "Dust kicked up while skidding." }),
]);

/** 전체 에셋 레지스트리. */
export const STUDIO_SPRITE_ASSET_REGISTRY: readonly StudioSpriteAsset[] = Object.freeze([
  ...STUDIO_NPC_ARCHETYPES.map((archetype) => asset({
    id: `npc:${archetype.key}`,
    category: "npc",
    source: "procedural",
    builderKey: archetype.proceduralSkinKey,
    labelKo: `${archetype.nameKo} · ${archetype.roleKo}`,
    labelEn: `${archetype.nameEn} · ${archetype.roleEn}`,
    descriptionKo: archetype.taglineKo,
    descriptionEn: archetype.taglineEn,
  })),
  ...STUDIO_ANIMAL_SPRITE_KINDS.map((kind) => {
    const label = studioAnimalSpriteLabel(kind);
    return asset({
      id: `animal:${kind}`,
      category: "animal",
      source: "procedural",
      builderKey: kind,
      labelKo: label.ko,
      labelEn: label.en,
      descriptionKo: `${label.ko} 스프라이트예요.`,
      descriptionEn: `${label.en} sprite.`,
    });
  }),
  ...STUDIO_FURNITURE_CATALOG.map((spec) => asset({
    id: `furniture:${spec.id}`,
    category: "furniture",
    source: "catalog",
    builderKey: null,
    labelKo: spec.labelKo,
    labelEn: spec.labelEn,
    descriptionKo: spec.descriptionKo,
    descriptionEn: spec.descriptionEn,
  })),
  ...STUDIO_AMBIENT_DECOR_CATALOG.map((decor) => asset({
    id: `decor:${decor.kind}`,
    category: "decor",
    source: "procedural",
    builderKey: decor.kind,
    labelKo: decor.labelKo,
    labelEn: decor.labelEn,
    descriptionKo: decor.descriptionKo,
    descriptionEn: decor.descriptionEn,
  })),
  ...STUDIO_PARTICLE_SPRITE_KINDS.map((kind) => {
    const label = studioParticleSpriteLabel(kind);
    return asset({
      id: `particle:${kind}`,
      category: "particle",
      source: "procedural",
      builderKey: kind,
      labelKo: label.ko,
      labelEn: label.en,
      descriptionKo: `${label.ko} 파티클 스프라이트예요.`,
      descriptionEn: `${label.en} particle sprite.`,
    });
  }),
  ...EFFECT_ASSETS,
]);

const ASSET_BY_ID = new Map<string, StudioSpriteAsset>(
  STUDIO_SPRITE_ASSET_REGISTRY.map((item) => [item.id, item]),
);

/** id로 에셋 조회. */
export function studioSpriteAssetById(id: string): StudioSpriteAsset | null {
  return ASSET_BY_ID.get(id) ?? null;
}

/** 카테고리별 에셋 조회. */
export function studioSpriteAssetsByCategory(category: StudioSpriteAssetCategory): readonly StudioSpriteAsset[] {
  return Object.freeze(STUDIO_SPRITE_ASSET_REGISTRY.filter((item) => item.category === category));
}

/** 레지스트리 구조 검증 (id 중복·빈 라벨·잘못된 카테고리). */
export function validateStudioSpriteAssetRegistry(
  registry: readonly StudioSpriteAsset[] = STUDIO_SPRITE_ASSET_REGISTRY,
): readonly string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const item of registry) {
    if (!item || typeof item !== "object") { errors.push("sprite asset is invalid"); continue; }
    if (typeof item.id !== "string" || !item.id.trim() || ids.has(item.id)) errors.push(`invalid sprite asset id: ${String(item.id)}`);
    ids.add(item.id);
    if (!(STUDIO_SPRITE_ASSET_CATEGORIES as readonly string[]).includes(item.category)) {
      errors.push(`unknown sprite asset category: ${item.id}`);
    }
    if (!item.labelKo?.trim() || !item.labelEn?.trim()) errors.push(`missing sprite asset label: ${item.id}`);
    if (item.source === "procedural" && !item.builderKey?.trim()) errors.push(`missing builder key: ${item.id}`);
  }
  return Object.freeze(errors);
}

/**
 * 에셋 미리보기 dataURL을 만든다.
 * procedural 에셋만 미리보기를 만들 수 있고, 나머지는 null이다.
 * 캔버스가 필요하므로 deps를 주입받는다.
 */
export function studioSpriteAssetPreviewUrl(
  asset: StudioSpriteAsset,
  deps?: ProceduralSheetDeps,
): string | null {
  if (asset.source !== "procedural" || !asset.builderKey) return null;
  switch (asset.category) {
    case "animal": {
      if (!(STUDIO_ANIMAL_SPRITE_KINDS as readonly string[]).includes(asset.builderKey)) return null;
      return buildStudioAnimalSpriteSheet(asset.builderKey as (typeof STUDIO_ANIMAL_SPRITE_KINDS)[number], deps).dataUrl;
    }
    case "particle": {
      if (!(STUDIO_PARTICLE_SPRITE_KINDS as readonly string[]).includes(asset.builderKey)) return null;
      return buildStudioParticleSprite(asset.builderKey as (typeof STUDIO_PARTICLE_SPRITE_KINDS)[number], deps).dataUrl;
    }
    default:
      // npc(캐릭터 시트)·decor(장식물)는 각 모듈의 빌더를 직접 쓴다.
      return null;
  }
}
