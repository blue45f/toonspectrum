import { describe, expect, it } from "vitest";

import {
  selectStudioLocalAssetPage,
  selectStudioSceneLibraryPage,
  studioLocalAssetKindLabel,
  summarizeStudioAssetDeletion,
} from "./studio-asset-library-management";

import type { StudioAsset } from "./studio-asset-library";
import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

function asset(index: number): StudioAsset {
  return { id: `asset-${index}`, name: `배경 ${index}`, dataUrl: "data:image/png;base64,AA==", width: 100, height: 100, createdAt: index };
}
function background(index: number): StudioUnifiedAssetItem {
  return {
    id: `background-${index}`, title: `학교 ${index}`, description: "공용 배경",
    category: "scene", scope: "studio", categoryLabel: "배경", keywords: ["school"], badges: [],
    preview: { kind: "none" }, useMode: "insert", useLabel: "삽입", discoverability: "standard", sortPriority: 1,
    source: { kind: "background", value: { id: `bg-${index}`, label: `학교 ${index}`, genre: "학교", width: 100, height: 100 } },
  };
}

describe("asset library management", () => {
  it("searches before pagination, including items beyond 240", () => {
    const result = selectStudioLocalAssetPage(Array.from({ length: 501 }, (_, i) => asset(i)), "배경 500");
    expect(result.total).toBe(1);
    expect(result.items[0]?.id).toBe("asset-500");
  });
  it("clamps pages after deletions and handles invalid page values", () => {
    expect(selectStudioLocalAssetPage([asset(1)], "", "recent", 99).page).toBe(0);
    expect(selectStudioLocalAssetPage([], "", "recent", Number.NaN)).toMatchObject({ page: 0, pages: 1, total: 0 });
  });
  it("sorts newest first without mutating source arrays", () => {
    const items = [asset(1), asset(3), asset(2)];
    expect(selectStudioLocalAssetPage(items).items.map((item) => item.createdAt)).toEqual([3, 2, 1]);
    expect(items.map((item) => item.createdAt)).toEqual([1, 3, 2]);
  });
  it("normalizes Korean/English queries and full-width text", () => {
    const item = { ...asset(1), name: "ＣＡＦＥ 밤" };
    expect(selectStudioLocalAssetPage([item], "cafe   밤").total).toBe(1);
  });
  it("identifies 3D render images separately from 3D model originals", () => {
    const item = { ...asset(1), kind: "bg3d" as const };
    expect(studioLocalAssetKindLabel(item)).toBe("3D 렌더 이미지");
    expect(selectStudioLocalAssetPage([item], "3d 렌더").total).toBe(1);
  });
  it("reports persisted UI removals rather than claiming every void callback succeeded", () => {
    expect(summarizeStudioAssetDeletion(["a", "b", "b"], [{ id: "b" }])).toEqual({ removed: 1, remaining: 1 });
    expect(summarizeStudioAssetDeletion(["a"], [{ id: "a" }])).toEqual({ removed: 0, remaining: 1 });
  });
  it("exposes all scene pages, including an exact result after the recommendation cap", () => {
    const items = Array.from({ length: 501 }, (_, i) => background(i));
    expect(selectStudioSceneLibraryPage(items).total).toBe(501);
    expect(selectStudioSceneLibraryPage(items).items).toHaveLength(24);
    expect(selectStudioSceneLibraryPage(items, "학교 500").items[0]?.id).toBe("background-500");
  });
  it("keeps source-kind filters honest", () => {
    expect(selectStudioSceneLibraryPage([background(1)], "", "scene-template").total).toBe(0);
    expect(selectStudioSceneLibraryPage([background(1)], "school", "background").total).toBe(1);
  });
});
