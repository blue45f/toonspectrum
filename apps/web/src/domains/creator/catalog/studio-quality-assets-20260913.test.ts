import { describe, expect, it } from "vitest";

import {
  STUDIO_ORIGINAL_FREE_ASSETS,
  STUDIO_RETIRED_ORIGINAL_FREE_ASSETS,
  createStudioOriginalFreeAssetRecord,
  filterStudioOriginalFreeAssets,
  findStudioOriginalFreeAsset,
  findStudioOriginalFreeAssetPackage,
} from "../studio-original-free-asset-packs";

import { STUDIO_QUALITY_2D_PACKAGES } from "./studio-quality-assets-20260913";

const assets = STUDIO_QUALITY_2D_PACKAGES.flatMap(pkg => pkg.includedItems);

describe("20260913 original architecture and street illustration collection", () => {
  it("adds eight distinct scenes and sixteen props without replacing legacy assets", () => {
    expect(assets).toHaveLength(24);
    expect(assets.filter(asset => asset.category === "modern-background")).toHaveLength(8);
    expect(assets.filter(asset => asset.category === "daily-prop")).toHaveLength(16);
    expect(new Set(assets.map(asset => asset.svg)).size).toBe(24);
    expect(new Set(assets.map(asset => asset.id)).size).toBe(24);
    for (const asset of assets) {
      expect(findStudioOriginalFreeAsset(asset.id)).toMatchObject({ id: asset.id, svg: asset.svg });
      expect(STUDIO_ORIGINAL_FREE_ASSETS.filter(item => item.id === asset.id)).toHaveLength(1);
    }
    for (const retired of STUDIO_RETIRED_ORIGINAL_FREE_ASSETS) {
      expect(findStudioOriginalFreeAsset(retired.id)).toBe(retired);
      expect(assets.some(asset => asset.id === retired.id)).toBe(false);
    }
  });

  it("keeps paint-server identifiers unique across simultaneously displayed SVGs", () => {
    const globalIds = new Set<string>();
    for (const asset of assets) {
      const ids = [...asset.svg.matchAll(/\bid="([^"]+)"/gu)].map(match => match[1]);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) {
        expect(id.startsWith(`${asset.id}-`)).toBe(true);
        expect(globalIds.has(id)).toBe(false);
        globalIds.add(id);
      }
      for (const reference of asset.svg.matchAll(/url\(#([^)]+)\)/gu)) {
        expect(ids).toContain(reference[1]);
      }
    }
  });

  it("keeps scalable dimensions, bounded payloads and no external or active content", () => {
    for (const asset of assets) {
      const background = asset.category === "modern-background";
      expect([asset.width, asset.height]).toEqual(background ? [1280, 800] : [512, 512]);
      expect(asset.svg).toContain(`<title>${asset.name}</title>`);
      expect(asset.svg.length).toBeLessThan(30_000);
      expect(asset.svg).not.toMatch(/<(?:script|filter|foreignObject|image|iframe)\b/iu);
      expect(asset.svg).not.toMatch(/\b(?:href|src|onload|onclick)\s*=/iu);
      expect(asset.svg).not.toMatch(/NaN|Infinity|undefined/gu);
      const record = createStudioOriginalFreeAssetRecord(asset);
      expect(decodeURIComponent(record.dataUrl.split(",")[1] ?? "")).toBe(asset.svg);
      expect(record.width).toBe(asset.width);
      expect(record.height).toBe(asset.height);
    }
  });

  it("makes packages and items discoverable in Korean and English", () => {
    expect(filterStudioOriginalFreeAssets({ query: "온실" }).map(asset => asset.id))
      .toContain("original-quality-20260913-botanical-house");
    expect(filterStudioOriginalFreeAssets({ query: "BUS SHELTER" }).map(asset => asset.id))
      .toContain("original-quality-20260913-bus-shelter");
    for (const pkg of STUDIO_QUALITY_2D_PACKAGES) {
      expect(findStudioOriginalFreeAssetPackage(pkg.id)?.includedItems).toHaveLength(pkg.includedItems.length);
      expect(filterStudioOriginalFreeAssets({ packageIds: [pkg.id] })).toHaveLength(pkg.includedItems.length);
      expect(pkg.license).toMatchObject({ commercialUse: true, redistributionAllowed: true, attributionRequired: false });
      expect(pkg.availability).toMatchObject({ payment: "unavailable", cloudSync: "unavailable" });
    }
  });
});
