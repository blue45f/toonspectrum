// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";

import type { MaterialAsset } from "../material-atlas/model";
import {
  MATERIAL_DRAG_MIME,
  buildMaterialSuggestions,
  buildTrendingMaterials,
  clearRecentMaterialSearches,
  getRecentMaterialSearches,
  hasSeenMaterialGuide,
  markMaterialGuideSeen,
  readMaterialDrop,
  saveRecentMaterialSearch,
  serializeMaterialDrop,
  storeMaterialDrop,
  MATERIAL_DROP_KEY,
  TRENDING_MATERIAL_KEYWORDS,
} from "./material-search-ux";

const asset = (over: Partial<MaterialAsset> = {}): MaterialAsset => ({
  id: "ambientcg:test-1", provider: "ambientcg", sourceId: "test-1", title: "Worn Wood Planks",
  kind: "texture", tags: ["wood", "worn", "plank"], authors: ["ambientCG"],
  sourceUrl: "https://ambientcg.com/a/test-1", thumbnailUrl: "https://acg-media.struffelproductions.com/file/ambientCG-Web/media/thumbnail/256-WEBP/test-1.webp",
  license: "CC0-1.0", ...over,
});

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });

describe("material search ux", () => {
  it("최근 검색어를 최대 5개까지 중복 없이 저장한다", () => {
    for (const term of ["나무", "벽돌", "나무", "숲", "야경", "의자", "돌", "금속"]) saveRecentMaterialSearch(term);
    const recent = getRecentMaterialSearches();
    expect(recent).toHaveLength(5);
    expect(recent[0]).toBe("금속");
    expect(new Set(recent).size).toBe(5);
    clearRecentMaterialSearches();
    expect(getRecentMaterialSearches()).toEqual([]);
  });

  it("가이드 확인 상태를 저장한다", () => {
    expect(hasSeenMaterialGuide()).toBe(false);
    markMaterialGuideSeen();
    expect(hasSeenMaterialGuide()).toBe(true);
  });

  it("접두사로 태그 자동완성 후보를 만든다", () => {
    const assets = [asset(), asset({ id: "ambientcg:test-2", title: "Wooden Chair", tags: ["wood", "chair", "furniture"] })];
    const suggestions = buildMaterialSuggestions("wo", assets);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((s) => s.value.toLowerCase().startsWith("wo"))).toBe(true);
    expect(buildMaterialSuggestions("", assets)).toEqual([]);
  });

  it("인기 키워드도 자동완성에 포함한다", () => {
    const suggestions = buildMaterialSuggestions("나", []);
    expect(suggestions.some((s) => s.kind === "keyword")).toBe(true);
    expect(TRENDING_MATERIAL_KEYWORDS.length).toBeGreaterThan(0);
  });

  it("트렌딩 소재는 종류를 고르게 섞는다", () => {
    const assets = [
      asset({ id: "a1", kind: "texture" }), asset({ id: "a2", kind: "texture" }),
      asset({ id: "a3", kind: "model", thumbnailUrl: "" }), asset({ id: "a4", kind: "hdri" }),
      asset({ id: "a5", kind: "texture" }), asset({ id: "a6", kind: "model" }),
    ];
    const trending = buildTrendingMaterials(assets, 4);
    expect(trending).toHaveLength(4);
    expect(new Set(trending.map((a) => a.kind)).size).toBeGreaterThan(1);
  });

  it("스튜디오 전달 페이로드를 직렬화·저장·조회한다", () => {
    const json = serializeMaterialDrop(asset());
    const parsed = JSON.parse(json) as { schema: string; id: string };
    expect(parsed.schema).toBe("toonstudio.material-drop.v1");
    expect(parsed.id).toBe("ambientcg:test-1");
    expect(storeMaterialDrop(asset())).toBe(true);
    expect(window.sessionStorage.getItem(MATERIAL_DROP_KEY)).toBe(json);
    expect(readMaterialDrop()).toBe(json);
    expect(MATERIAL_DRAG_MIME).toBe("application/x-toonstudio-material");
  });
});
