import { describe, expect, it } from "vitest";

import {
  buildStudioUnifiedAssetCatalog,
  searchStudioUnifiedAssets,
} from "./studio-unified-asset-catalog";
import {
  decorateStudioGenerated2dAsset,
  isStudioGenerated2dAssetId,
  STUDIO_GENERATED_2D_PACK_INFO,
  STUDIO_GENERATED_BG_SCENES,
  STUDIO_GENERATED_ELEMENT_ITEMS,
} from "./studio-generated-2d-catalog";

const generatedSources = [
  ...STUDIO_GENERATED_BG_SCENES,
  ...STUDIO_GENERATED_ELEMENT_ITEMS,
];

function generatedCatalog() {
  return buildStudioUnifiedAssetCatalog({
    backgrounds: STUDIO_GENERATED_BG_SCENES,
    elements: STUDIO_GENERATED_ELEMENT_ITEMS,
    sceneTemplates: [],
    localAssets: [],
    objects: [],
    nativeTools: [],
  }).map(decorateStudioGenerated2dAsset);
}

describe("generated 2D starter pack", () => {
  it("ships the reviewed background, prop, character and structure inventory", () => {
    expect(STUDIO_GENERATED_2D_PACK_INFO).toMatchObject({
      backgroundCount: 6,
      propCount: 8,
      characterCount: 6,
      guideCount: 4,
      elementCount: 18,
      assetCount: 24,
      externalResourceCount: 0,
      sourceKind: "ai-assisted-native-vector",
      rightsStatus: "generated-in-project",
    });
    expect(STUDIO_GENERATED_BG_SCENES).toHaveLength(6);
    expect(STUDIO_GENERATED_ELEMENT_ITEMS).toHaveLength(18);
    expect(new Set(generatedSources.map((asset) => asset.id)).size).toBe(24);
  });

  it("keeps every asset self-contained and safe for native SVG insertion", () => {
    for (const asset of generatedSources) {
      expect(asset.id).toMatch(/^gen2d-[a-z0-9]+(?:-[a-z0-9]+)*$/u);
      expect(asset.svg).toMatch(/^<svg\b/u);
      expect(asset.svg).toContain("viewBox=");
      expect(asset.svg).not.toMatch(/<(?:image|script|foreignObject)\b/iu);
      expect(asset.svg).not.toMatch(
        /\b(?:href|xlink:href)\s*=\s*["'](?:https?:|data:|javascript:)/iu,
      );
    }
  });

  it("integrates into unified search as featured, generated project assets", () => {
    const items = generatedCatalog();
    expect(items).toHaveLength(24);
    expect(items.filter((item) => item.category === "scene")).toHaveLength(6);
    expect(items.filter((item) => item.category === "element")).toHaveLength(18);

    const categoryLabels = new Set(items.map((item) => item.categoryLabel));
    expect(categoryLabels).toEqual(
      new Set(["2D 배경", "2D 소품", "2D 캐릭터", "드로잉 구조"]),
    );

    for (const item of items) {
      expect(isStudioGenerated2dAssetId(item.id)).toBe(true);
      expect(item.discoverability).toBe("featured");
      expect(item.badges).toEqual(
        expect.arrayContaining(["AI 생성", "프로젝트 내장", "외부 리소스 없음"]),
      );
      expect(item.description).toContain("ToonStudio 생성형 네이티브 벡터");
    }
  });

  it("supports intent searches for each creative asset family", () => {
    const items = generatedCatalog();
    expect(
      searchStudioUnifiedAssets(items, { query: "배경", limit: 100 }),
    ).toHaveLength(6);
    expect(
      searchStudioUnifiedAssets(items, { query: "소품", limit: 100 }),
    ).toHaveLength(8);
    expect(
      searchStudioUnifiedAssets(items, { query: "캐릭터", limit: 100 }),
    ).toHaveLength(6);
    expect(
      searchStudioUnifiedAssets(items, { query: "구조", limit: 100 }),
    ).toHaveLength(4);
  });
});
