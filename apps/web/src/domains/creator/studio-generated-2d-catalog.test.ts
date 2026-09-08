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
import { STUDIO_GENERATED_2D_PACK_V2_INFO } from "./studio-generated-2d-wave-2";

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

describe("generated 2D library", () => {
  it("ships the expanded wave-2 inventory and preserves wave 1", () => {
    expect(STUDIO_GENERATED_2D_PACK_V2_INFO).toMatchObject({
      backgroundCount: 11,
      propCount: 16,
      characterCount: 8,
      guideCount: 8,
      elementCount: 32,
      assetCount: 43,
      externalResourceCount: 0,
      sourceKind: "ai-assisted-native-vector",
      rightsStatus: "generated-in-project",
    });
    expect(STUDIO_GENERATED_2D_PACK_INFO).toMatchObject({
      version: 2,
      wave1AssetCount: 24,
      wave2AssetCount: 43,
      backgroundCount: 17,
      propCount: 24,
      characterCount: 14,
      guideCount: 12,
      elementCount: 50,
      assetCount: 67,
      externalResourceCount: 0,
    });
    expect(STUDIO_GENERATED_BG_SCENES).toHaveLength(17);
    expect(STUDIO_GENERATED_ELEMENT_ITEMS).toHaveLength(50);
    expect(new Set(generatedSources.map((asset) => asset.id)).size).toBe(67);
    expect(new Set(generatedSources.map((asset) => asset.label)).size).toBe(67);
  });

  it("keeps every asset self-contained and safe for native SVG insertion", () => {
    for (const asset of generatedSources) {
      expect(asset.id).toMatch(/^gen2d-[a-z0-9]+(?:-[a-z0-9]+)*$/u);
      expect(asset.width).toBeGreaterThanOrEqual(240);
      expect(asset.height).toBeGreaterThanOrEqual(300);
      expect(asset.svg).toMatch(/^<svg\b/u);
      expect(asset.svg).toContain("viewBox=");
      expect(asset.svg).not.toMatch(/<(?:image|script|foreignObject)\b/iu);
      expect(asset.svg).not.toMatch(
        /\b(?:href|xlink:href)\s*=\s*["'](?:https?:|data:|javascript:)/iu,
      );
    }
  });

  it("integrates into unified search as featured, scalable project assets", () => {
    const items = generatedCatalog();
    expect(items).toHaveLength(67);
    expect(items.filter((item) => item.category === "scene")).toHaveLength(17);
    expect(items.filter((item) => item.category === "element")).toHaveLength(50);

    expect(new Set(items.map((item) => item.categoryLabel))).toEqual(
      new Set(["2D 배경", "2D 소품", "2D 캐릭터", "드로잉 구조"]),
    );

    for (const item of items) {
      expect(isStudioGenerated2dAssetId(item.id)).toBe(true);
      expect(item.discoverability).toBe("featured");
      expect(item.badges).toEqual(
        expect.arrayContaining([
          "AI 생성",
          "프로젝트 내장",
          "외부 리소스 없음",
          "무손실 확대",
        ]),
      );
      expect(item.description).toContain("ToonStudio 생성형 네이티브 벡터");
    }
  });

  it("supports intent searches across asset families and production genres", () => {
    const items = generatedCatalog();
    expect(
      searchStudioUnifiedAssets(items, { query: "배경", limit: 100 }),
    ).toHaveLength(17);
    expect(
      searchStudioUnifiedAssets(items, { query: "소품", limit: 100 }),
    ).toHaveLength(24);
    expect(
      searchStudioUnifiedAssets(items, { query: "캐릭터", limit: 100 }),
    ).toHaveLength(14);
    expect(
      searchStudioUnifiedAssets(items, { query: "구조", limit: 100 }),
    ).toHaveLength(12);

    for (const query of [
      "전철",
      "루프탑",
      "도서관",
      "SF",
      "병원",
      "판타지",
      "카페",
      "투시",
      "표정",
      "조명",
    ]) {
      expect(
        searchStudioUnifiedAssets(items, { query, limit: 100 }).length,
      ).toBeGreaterThan(0);
    }
  });
});
