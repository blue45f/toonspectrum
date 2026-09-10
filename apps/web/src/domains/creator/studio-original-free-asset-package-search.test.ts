import { describe, expect, it } from "vitest";

import {
  STUDIO_ORIGINAL_FREE_ASSET_LICENSE,
  filterStudioOriginalFreeAssets,
  findStudioOriginalFreeAssetPackage,
} from "./studio-original-free-asset-packs";

describe("expanded original CC0 catalog boundary", () => {
  it("normalizes package and item rights to the canonical CC0 object", () => {
    const pkg = findStudioOriginalFreeAssetPackage("original-food-cafe-kit");

    expect(pkg).not.toBeNull();
    expect(pkg?.license).toBe(STUDIO_ORIGINAL_FREE_ASSET_LICENSE);
    expect(pkg?.includedItems).toHaveLength(8);
    for (const asset of pkg?.includedItems ?? []) {
      expect(asset.license).toBe(STUDIO_ORIGINAL_FREE_ASSET_LICENSE);
    }
  });

  it("includes package metadata in Korean catalog search", () => {
    const foodPackageAssets = filterStudioOriginalFreeAssets({ query: "음식" })
      .filter((asset) => asset.packageId === "original-food-cafe-kit");

    expect(foodPackageAssets).toHaveLength(8);
    expect(foodPackageAssets.map((asset) => asset.id)).toContain("original-food-soda-cup");
  });
});
