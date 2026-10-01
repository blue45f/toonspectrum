/**
 * 스프라이트 에셋 레지스트리 테스트 (Track 4)
 */
import { describe, expect, it } from "vitest";

import {
  STUDIO_SPRITE_ASSET_CATEGORIES,
  STUDIO_SPRITE_ASSET_REGISTRY,
  studioSpriteAssetById,
  studioSpriteAssetCategoryLabel,
  studioSpriteAssetPreviewUrl,
  studioSpriteAssetsByCategory,
  validateStudioSpriteAssetRegistry,
  type StudioSpriteAsset,
} from "./studio-virtual-space-sprite-assets";

describe("스프라이트 에셋 레지스트리", () => {
  it("에셋 id가 중복 없이 유니크하다", () => {
    const ids = STUDIO_SPRITE_ASSET_REGISTRY.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("구조 검증이 통과한다", () => {
    expect(validateStudioSpriteAssetRegistry()).toEqual([]);
  });

  it("6개 카테고리를 모두 포함한다", () => {
    expect(STUDIO_SPRITE_ASSET_CATEGORIES).toHaveLength(6);
    for (const category of STUDIO_SPRITE_ASSET_CATEGORIES) {
      expect(studioSpriteAssetsByCategory(category).length).toBeGreaterThan(0);
    }
  });

  it("동물·파티클 에셋을 id로 조회할 수 있다", () => {
    const fox = studioSpriteAssetById("animal:fox");
    expect(fox?.category).toBe("animal");
    expect(fox?.labelKo).toContain("여우");
    const dust = studioSpriteAssetById("particle:dust");
    expect(dust?.category).toBe("particle");
    expect(studioSpriteAssetById("bogus:id")).toBeNull();
  });

  it("NPC 7종을 모두 포함한다", () => {
    const npcs = studioSpriteAssetsByCategory("npc");
    expect(npcs.map((item) => item.id)).toContain("npc:shopkeeper");
    expect(npcs).toHaveLength(7);
  });

  it("카테고리 라벨을 반환한다", () => {
    expect(studioSpriteAssetCategoryLabel("furniture").ko).toBe("가구");
    expect(studioSpriteAssetCategoryLabel("effect").en).toBe("Effects");
  });

  it("캔버스 없이 미리보기를 만들 수 없다", () => {
    // deps 미주입 시 defaultProceduralSheetDeps가 document를 쓰므로 null 가드만 확인.
    const logicAsset: StudioSpriteAsset = {
      id: "effect:afterimage", category: "effect", source: "logic", builderKey: null,
      labelKo: "잔상", labelEn: "Afterimage", descriptionKo: "테스트", descriptionEn: "Test",
    };
    expect(studioSpriteAssetPreviewUrl(logicAsset)).toBeNull();
  });

  it("손상된 레지스트리를 감지한다", () => {
    const broken: StudioSpriteAsset = {
      id: "npc:guide", category: "npc", source: "procedural", builderKey: "guide-skin",
      labelKo: "안내원", labelEn: "Guide", descriptionKo: "중복", descriptionEn: "Dup",
    };
    const errors = validateStudioSpriteAssetRegistry([...STUDIO_SPRITE_ASSET_REGISTRY, broken]);
    expect(errors.some((message) => message.includes("invalid sprite asset id"))).toBe(true);
  });
});
