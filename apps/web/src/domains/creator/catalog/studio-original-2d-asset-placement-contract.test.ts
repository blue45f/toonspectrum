import { describe, expect, it } from "vitest";

import { STUDIO_ORIGINAL_FREE_ASSETS } from "../studio-original-free-asset-packs";

import type { StudioMarketplacePlacementPreset } from "../studio-marketplace-packages";

const ALLOWED = new Set<StudioMarketplacePlacementPreset>([
  "current-view",
  "pointer",
  "panel-fit",
  "background-cover",
]);

describe("authored 2D asset placement contract", () => {
  it("keeps every bundled asset on supported Studio placement presets", () => {
    for (const asset of STUDIO_ORIGINAL_FREE_ASSETS) {
      expect(asset.placementPresets.length, asset.id).toBeGreaterThan(0);
      expect(new Set(asset.placementPresets).size, asset.id).toBe(asset.placementPresets.length);
      for (const preset of asset.placementPresets) {
        expect(ALLOWED.has(preset), `${asset.id}: ${preset}`).toBe(true);
      }
    }
  });

  it("keeps the common authored fallback as pointer + current view", () => {
    const common = STUDIO_ORIGINAL_FREE_ASSETS.filter((asset) =>
      asset.placementPresets.length === 2
      && asset.placementPresets.includes("pointer")
      && asset.placementPresets.includes("current-view"),
    );

    expect(common.length).toBeGreaterThan(0);
  });
});
