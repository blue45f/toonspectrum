import { describe, expect, it } from "vitest";

import {
  createStarterDotPositions,
  getStudioAssetCurationDecision,
  removeTrustedStarterBackdrop,
  selectStudioCuratedAssets,
  STUDIO_ASSET_VISUAL_CURATION,
} from "./studio-asset-visual-curation";
import {
  STUDIO_ORIGINAL_FREE_ASSETS,
  STUDIO_ORIGINAL_FREE_ASSET_PACKAGES,
  STUDIO_RETIRED_ORIGINAL_FREE_ASSETS,
  findStudioOriginalFreeAsset,
} from "./studio-original-free-asset-packs";

describe("visually screened selection without destructive deletion", () => {
  it("quarantines one visible rendering defect and groups 16 rotated derivatives", () => {
    expect(STUDIO_ASSET_VISUAL_CURATION.filter(d => d.disposition === "quarantine")).toHaveLength(1);
    expect(STUDIO_ASSET_VISUAL_CURATION.filter(d => d.disposition === "variant")).toHaveLength(16);
    for (const decision of STUDIO_ASSET_VISUAL_CURATION) {
      if (decision.disposition === "variant") {
        expect(decision.canonicalId).toBe(decision.id.replace(/-rotated$/u, ""));
        expect(getStudioAssetCurationDecision(decision.canonicalId!)).toBeUndefined();
      }
    }
  });
  it("filters only new selection, leaving the caller's original records untouched", () => {
    const original = Object.freeze([
      Object.freeze({id: "kenney-food-glass-wine", file: "legacy.glb"}),
      Object.freeze({id: "kenney-particles-trace-01-rotated", file: "legacy.webp"}),
      Object.freeze({id: "kenney-particles-trace-01", file: "original.webp"}),
      Object.freeze({id: "polyhaven-modern-arm-chair-01", file: "chair.glb"}),
    ]);
    const selected = selectStudioCuratedAssets(original);
    expect(selected).toHaveLength(2);
    expect(original).toHaveLength(4);
    expect(original[0].file).toBe("legacy.glb");
    expect(Object.isFrozen(selected)).toBe(true);
  });
  it("does not misclassify purposeful low-poly geometry as low quality", () => {
    expect(getStudioAssetCurationDecision("kenney-roads-road-straight")).toBeUndefined();
    expect(selectStudioCuratedAssets([{id: "unknown-original"}])).toHaveLength(1);
  });
});

describe("trusted starter compositing", () => {
  const art = '<path d="M20 20h40v40z" fill="#ed7541"/>';
  it.each(["#f5efe4", "#272836"])("removes only the exact leading full-canvas %s rectangle", fill => {
    expect(removeTrustedStarterBackdrop(`<rect width="220" height="240" fill="${fill}"/>${art}`, 220, 240)).toBe(art);
  });
  it("does not remove inner rectangles or arbitrary uploaded markup", () => {
    const inner = `${art}<rect width="220" height="240" fill="#f5efe4"/>`;
    expect(removeTrustedStarterBackdrop(inner, 220, 240)).toBe(inner);
    const other = '<rect width="100" height="240" fill="#f5efe4"/>';
    expect(removeTrustedStarterBackdrop(other, 220, 240)).toBe(other);
  });
  it("keeps all 16 selectable prop IDs but removes their opaque full-canvas backdrops", () => {
    const props = STUDIO_ORIGINAL_FREE_ASSETS.filter(a => a.category === "daily-prop" || a.category === "genre-prop");
    expect(props).toHaveLength(16);
    for (const asset of props) {
      expect(asset.svg).not.toContain(`<rect width="${asset.width}" height="${asset.height}" fill=`);
      expect(findStudioOriginalFreeAsset(asset.id)).toBe(asset);
      expect(asset.contentFingerprint).toContain("original-svg:v2:");
    }
    expect(STUDIO_RETIRED_ORIGINAL_FREE_ASSETS).toHaveLength(8);
    for (const asset of STUDIO_RETIRED_ORIGINAL_FREE_ASSETS) expect(findStudioOriginalFreeAsset(asset.id)).toBe(asset);
    for (const pkg of STUDIO_ORIGINAL_FREE_ASSET_PACKAGES) expect(pkg.version).toBe("1.1.0");
  });
});

describe("repeatable scatter with independent coordinates", () => {
  it.each([14, 28, 44, 54])("spreads %i particles across distinct cells without changing on reload", count => {
    const positions = createStarterDotPositions(count, 360, 240, "#e5bd54");
    expect(positions).toEqual(createStarterDotPositions(count, 360, 240, "#e5bd54"));
    expect(positions).toHaveLength(count);
    expect(new Set(positions.map(p => p.join(","))).size).toBe(count);
    expect(positions.every(([x, y]) => x > 20 && x < 340 && y > 20 && y < 220)).toBe(true);
    expect(positions).not.toEqual(createStarterDotPositions(count, 360, 240, "#dd8eaa"));
  });
  it("rejects invalid dimensions and unbounded particle counts", () => {
    expect(() => createStarterDotPositions(5001, 360, 240, "x")).toThrow();
    expect(() => createStarterDotPositions(10, NaN, 240, "x")).toThrow();
    expect(createStarterDotPositions(0, 360, 240, "x")).toEqual([]);
  });
});
