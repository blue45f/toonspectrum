import { describe, expect, it } from "vitest";

import {
  filterStudioAssetPresentation,
  isStudioAssetAssemblyKit,
  isStudioAssetVisuallySelectable,
  STUDIO_VISUAL_QUARANTINED_ASSET_IDS,
  studioAssetPresentationLabel,
  studioAssetPresentationStyle,
  studioAssetPreviewBackground,
} from "./studio-asset-visual-curation";
import {
  filterStudioCc0Assets,
  parseStudioCc0Catalog,
  studioCc0AssetUrl,
} from "./studio-cc0-asset-delivery";
import {
  findStudioOriginalFreeAsset,
  findStudioOriginalFreeAssetPackage,
  STUDIO_ORIGINAL_FREE_ASSETS,
  STUDIO_ORIGINAL_FREE_ASSET_PACKAGES,
  STUDIO_RETIRED_ORIGINAL_FREE_ASSETS,
} from "./studio-original-free-asset-packs";

const model = (id: string, provider = "Kenney") => ({id, provider, kind: "model", category: "furniture"});

describe("actual visual review selection policy", () => {
  it("quarantines exactly the four newly identified visual defects", () => {
    expect(STUDIO_VISUAL_QUARANTINED_ASSET_IDS).toHaveLength(4);
    for (const id of STUDIO_VISUAL_QUARANTINED_ASSET_IDS) expect(isStudioAssetVisuallySelectable(id)).toBe(false);
    expect(isStudioAssetVisuallySelectable("kenney-food-glass-tall")).toBe(true);
  });
  it("does not mistake intentional low-poly style for a broken asset", () => {
    expect(filterStudioAssetPresentation([model("kenney-furniture-chair")])).toHaveLength(1);
    expect(studioAssetPresentationLabel(model("kenney-furniture-chair"))).toBe("스타일 3D");
  });
  it("requires the real supplier as well as the namespace for detailed PBR labeling", () => {
    expect(studioAssetPresentationStyle(model("polyhaven-arm-chair-01", "Poly Haven"))).toBe("detailed-pbr");
    expect(studioAssetPresentationStyle(model("polyhaven-arm-chair-01", "Kenney"))).toBe("stylized-3d");
    expect(studioAssetPresentationStyle({...model("polyhaven-wood", "Poly Haven"), kind: "surface-texture"})).toBe("raster");
  });
  it("keeps construction kits available through an explicit option", () => {
    const items = [model("kenney-building-wall"), model("kenney-roads-road-bend"), model("kenney-furniture-floor-wood"), model("kenney-furniture-chair")];
    expect(filterStudioAssetPresentation(items)).toEqual([items[3]]);
    expect(filterStudioAssetPresentation(items, "all", true)).toEqual(items);
    expect(isStudioAssetAssemblyKit(model("polyhaven-modular-street-seating", "Poly Haven"))).toBe(true);
  });
  it("cannot reveal a quarantined file through the construction-kit or style controls", () => {
    const items = [model("kenney-food-glass-wine"), model("kenney-food-glass-tall")];
    expect(filterStudioAssetPresentation(items, "all", true)).toEqual([items[1]]);
    expect(filterStudioAssetPresentation(items, "stylized-3d", true)).toEqual([items[1]]);
  });
  it("uses a dark backdrop for white alpha masks and a neutral backdrop for models", () => {
    expect(studioAssetPreviewBackground({...model("spark"), kind: "effect-mask"})).toBe("#343943");
    expect(studioAssetPreviewBackground(model("white-chair"))).toBe("#cbd0d8");
  });
  it("retains retired SVG data and legacy package lookup for existing works", () => {
    expect(STUDIO_ORIGINAL_FREE_ASSETS).toHaveLength(21);
    expect(STUDIO_RETIRED_ORIGINAL_FREE_ASSETS).toHaveLength(11);
    expect(STUDIO_ORIGINAL_FREE_ASSET_PACKAGES).toHaveLength(3);
    for (const asset of STUDIO_RETIRED_ORIGINAL_FREE_ASSETS) {
      expect(findStudioOriginalFreeAsset(asset.id)).toBe(asset);
      expect(findStudioOriginalFreeAssetPackage(asset.packageId)?.includedItems).toContain(asset);
    }
    const atmosphere = STUDIO_ORIGINAL_FREE_ASSET_PACKAGES.find(pkg => pkg.includedItems.some(asset => asset.category === "atmosphere-fx"));
    expect(atmosphere?.includedItems).toHaveLength(5);
    expect(atmosphere?.version).toBe("1.1.0");
  });
  it("keeps legacy URLs resolvable while removing the faulty glass from every catalog search", () => {
    const asset = {id: "kenney-food-glass-wine", name: "glass wine", kind: "model", category: "food", path: "assets/kenney-food/glass-wine.glb", previewPath: "previews/kenney-food-glass-wine.png", bytes: 1024, sha256: "a".repeat(64), browserRenderVerified: true,
      license: {id: "CC0-1.0", provider: "Kenney", sourceUrl: "https://kenney.nl/assets/food-kit", commercialUse: true, redistributionAllowed: true}};
    const items = parseStudioCc0Catalog({schema: "toonspectrum.asset-delivery.v1", assets: [asset]});
    expect(items).toHaveLength(1);
    expect(filterStudioCc0Assets(items, "")).toHaveLength(0);
    expect(filterStudioCc0Assets(items, "wine", "model")).toHaveLength(0);
    expect(studioCc0AssetUrl(asset.path)).toContain("glass-wine.glb");
  });
});
