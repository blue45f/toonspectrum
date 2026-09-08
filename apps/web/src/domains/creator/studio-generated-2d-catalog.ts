/**
 * ToonStudio generated 2D library.
 *
 * Every item is composed from project-native SVG paths, gradients and shapes. The library
 * deliberately avoids remote images, fonts, emoji and third-party artwork so Studio insertion
 * stays scalable, deterministic and export-safe.
 */

import {
  STUDIO_GENERATED_BG_SCENES as STUDIO_GENERATED_BG_SCENES_V1,
} from "./studio-generated-2d-backgrounds";
import {
  STUDIO_GENERATED_CHARACTER_ITEMS,
} from "./studio-generated-2d-characters";
import { PACK_PREFIX } from "./studio-generated-2d-foundation";
import { STUDIO_GENERATED_GUIDE_ITEMS } from "./studio-generated-2d-guides";
import { STUDIO_GENERATED_PROP_ITEMS } from "./studio-generated-2d-props";
import {
  STUDIO_GENERATED_2D_PACK_V2_INFO,
  STUDIO_GENERATED_BG_SCENES_V2,
  STUDIO_GENERATED_CHARACTER_ITEMS_V2,
  STUDIO_GENERATED_ELEMENT_ITEMS_V2,
  STUDIO_GENERATED_GUIDE_ITEMS_V2,
  STUDIO_GENERATED_PROP_ITEMS_V2,
} from "./studio-generated-2d-wave-2";

import type { BgScene } from "./studio-bg-scenes";
import type { StudioElementItem } from "./studio-elements-catalog";
import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

export const STUDIO_GENERATED_BG_SCENES: readonly BgScene[] = Object.freeze([
  ...STUDIO_GENERATED_BG_SCENES_V2,
  ...STUDIO_GENERATED_BG_SCENES_V1,
]);

const STUDIO_GENERATED_ELEMENT_ITEMS_V1: readonly StudioElementItem[] =
  Object.freeze([
    ...STUDIO_GENERATED_PROP_ITEMS,
    ...STUDIO_GENERATED_CHARACTER_ITEMS,
    ...STUDIO_GENERATED_GUIDE_ITEMS,
  ]);

export const STUDIO_GENERATED_ELEMENT_ITEMS: readonly StudioElementItem[] =
  Object.freeze([
    ...STUDIO_GENERATED_ELEMENT_ITEMS_V2,
    ...STUDIO_GENERATED_ELEMENT_ITEMS_V1,
  ]);

export const STUDIO_GENERATED_2D_PACK_INFO = Object.freeze({
  id: "toonstudio-generated-2d-library",
  version: 2,
  generatedAt: "2026-09-09",
  sourceKind: "ai-assisted-native-vector",
  rightsStatus: "generated-in-project",
  externalResourceCount: 0,
  wave1AssetCount:
    STUDIO_GENERATED_BG_SCENES_V1.length +
    STUDIO_GENERATED_ELEMENT_ITEMS_V1.length,
  wave2AssetCount: STUDIO_GENERATED_2D_PACK_V2_INFO.assetCount,
  backgroundCount: STUDIO_GENERATED_BG_SCENES.length,
  propCount:
    STUDIO_GENERATED_PROP_ITEMS.length +
    STUDIO_GENERATED_PROP_ITEMS_V2.length,
  characterCount:
    STUDIO_GENERATED_CHARACTER_ITEMS.length +
    STUDIO_GENERATED_CHARACTER_ITEMS_V2.length,
  guideCount:
    STUDIO_GENERATED_GUIDE_ITEMS.length +
    STUDIO_GENERATED_GUIDE_ITEMS_V2.length,
  elementCount: STUDIO_GENERATED_ELEMENT_ITEMS.length,
  assetCount:
    STUDIO_GENERATED_BG_SCENES.length +
    STUDIO_GENERATED_ELEMENT_ITEMS.length,
});

function studioGeneratedSourceId(id: string): string {
  return id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
}

export function isStudioGenerated2dAssetId(id: string): boolean {
  return studioGeneratedSourceId(id).startsWith(PACK_PREFIX);
}

function generatedCategoryLabel(id: string, fallback: string): string {
  const sourceId = studioGeneratedSourceId(id);
  if (sourceId.startsWith(`${PACK_PREFIX}prop-`)) return "2D 소품";
  if (sourceId.startsWith(`${PACK_PREFIX}character-`)) return "2D 캐릭터";
  if (sourceId.startsWith(`${PACK_PREFIX}guide-`)) return "드로잉 구조";
  if (sourceId.startsWith(`${PACK_PREFIX}bg-`)) return "2D 배경";
  return fallback;
}

export function decorateStudioGenerated2dAsset(
  item: StudioUnifiedAssetItem,
): StudioUnifiedAssetItem {
  if (!isStudioGenerated2dAssetId(item.id)) return item;
  return {
    ...item,
    description: `${item.description} · ToonStudio 생성형 네이티브 벡터`,
    categoryLabel: generatedCategoryLabel(item.id, item.categoryLabel),
    badges: Object.freeze([
      ...new Set([
        ...item.badges,
        "AI 생성",
        "프로젝트 내장",
        "외부 리소스 없음",
        "무손실 확대",
      ]),
    ]),
    discoverability: "featured",
    sortPriority: item.sortPriority + 900,
  };
}
