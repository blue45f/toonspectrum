import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  isStudioAssetVisuallySelectable,
  STUDIO_VISUAL_RETIREMENTS,
  studioAssetVisualStyle,
} from "./studio-asset-visual-policy";
import { filterStudioCc0Assets, parseStudioCc0Catalog } from "./studio-cc0-asset-delivery";
import {
  findStudioOriginalFreeAsset,
  findStudioOriginalFreeAssetPackage,
  STUDIO_ORIGINAL_FREE_ASSETS,
  STUDIO_RETIRED_ORIGINAL_FREE_ASSETS,
} from "./studio-original-free-asset-packs";

const fixture = (id: string, provider = "Kenney") => ({
  id,
  name: "Chair",
  kind: "model",
  category: "furniture",
  path: `assets/models/${id}.glb`,
  previewPath: `previews/${id}.png`,
  bytes: 4096,
  sha256: "a".repeat(64),
  browserRenderVerified: true,
  license: {
    id: "CC0-1.0", provider,
    sourceUrl: provider === "Poly Haven" ? "https://polyhaven.com/a/modern_arm_chair_01" : "https://kenney.nl/assets/furniture-kit",
    commercialUse: true, redistributionAllowed: true,
  },
});
const parse = (...assets: unknown[]) => parseStudioCc0Catalog({schema: "toonspectrum.asset-delivery.v1", assets});

describe("visual selection policy", () => {
  it("has exactly five new selection retirements, not all simple or low-poly art", () => {
    expect(Object.keys(STUDIO_VISUAL_RETIREMENTS)).toHaveLength(5);
    expect(isStudioAssetVisuallySelectable("kenney-furniture-chair")).toBe(true);
    expect(isStudioAssetVisuallySelectable("original-city-bicycle")).toBe(true);
    expect(isStudioAssetVisuallySelectable("toString")).toBe(true);
    expect(Object.isFrozen(STUDIO_VISUAL_RETIREMENTS)).toBe(true);
  });
  it("keeps a retired model parseable for old references, but never returns it from discovery", () => {
    const catalog = parse(fixture("kenney-food-glass-wine"), fixture("kenney-furniture-chair"));
    expect(catalog).toHaveLength(2);
    expect(filterStudioCc0Assets(catalog, "").map(asset => asset.id)).toEqual(["kenney-furniture-chair"]);
    expect(filterStudioCc0Assets(catalog, "wine")).toHaveLength(0);
  });
  it("keeps all thirty-two legacy SVGs and their package references resolvable", () => {
    expect(STUDIO_ORIGINAL_FREE_ASSETS).toHaveLength(20);
    expect(STUDIO_RETIRED_ORIGINAL_FREE_ASSETS).toHaveLength(12);
    const legacy = [...STUDIO_ORIGINAL_FREE_ASSETS, ...STUDIO_RETIRED_ORIGINAL_FREE_ASSETS];
    expect(new Set(legacy.map(asset => asset.id)).size).toBe(32);
    for (const asset of legacy) {
      expect(findStudioOriginalFreeAsset(asset.id)).toBe(asset);
      expect(findStudioOriginalFreeAssetPackage(asset.packageId)?.includedItems).toContain(asset);
    }
    for (const id of Object.keys(STUDIO_VISUAL_RETIREMENTS).filter(id => id.startsWith("original-"))) {
      expect(findStudioOriginalFreeAsset(id)).not.toBeNull();
      expect(STUDIO_ORIGINAL_FREE_ASSETS.some(asset => asset.id === id)).toBe(false);
    }
  });
  it("separates visual style without altering input order or promoting image maps as models", () => {
    const catalog = parse(fixture("kenney-chair"), fixture("polyhaven-chair", "Poly Haven"));
    expect(filterStudioCc0Assets(catalog, "").map(asset => asset.id)).toEqual(["polyhaven-chair", "kenney-chair"]);
    expect(catalog[0].id).toBe("kenney-chair");
    expect(filterStudioCc0Assets(catalog, "chair", "model", "pbr")).toHaveLength(1);
    expect(filterStudioCc0Assets(catalog, "chair", "model", "stylized")).toHaveLength(1);
    expect(filterStudioCc0Assets(catalog, "", "model", "image")).toHaveLength(0);
    expect(studioAssetVisualStyle({kind: "surface-texture", provider: "Poly Haven"})).toBe("image");
  });
  it("retains all original image pixels and uses a dark checkerboard only for presentation", () => {
    const source = readFileSync(new URL("./StudioCc0AssetLibraryPanel.tsx", import.meta.url), "utf8");
    expect(source).toContain('asset.kind === "effect-mask"');
    expect(source).toContain("conic-gradient");
    expect(source).toContain('aria-label="에셋 표현 스타일"');
    expect(source).toContain('data-cc0-asset-id={asset.id}');
    expect(source).not.toContain("getImageData");
    expect(source).not.toContain("removeItem");
  });
});
