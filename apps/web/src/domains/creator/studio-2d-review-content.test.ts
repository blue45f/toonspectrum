import { describe, expect, it } from "vitest";

import { filterStudio2dScenes, STUDIO_2D_ASSET_METADATA } from "./studio-2d-asset-quality";
import { BG_SCENE_COMPATIBILITY_LIBRARY, BG_SCENES, groupBgScenes } from "./studio-bg-scenes";

const assets = new Map(STUDIO_2D_ASSET_METADATA.map((asset) => [asset.id, asset]));

describe("native-size 2D content review", () => {
  it("promotes regenerated empty scenes after full-frame review", () => {
    const emptyIds = new Set(filterStudio2dScenes(groupBgScenes(BG_SCENES), { emptySceneOnly: true }).map((scene) => scene.id));
    for (const id of ["webtoon-bedroom", "webtoon-sf-research-lab"]) {
      expect(assets.get(id)?.containsPeople).toBe(false);
      expect(emptyIds.has(id)).toBe(true);
    }
  });
  it("records regenerated legacy IDs as reviewed text-free backgrounds", () => {
    for (const id of ["webtoon-bedroom", "webtoon-drama-hospital-corridor", "webtoon-fantasy-dragon-peak", "webtoon-sf-space-station"]) {
      expect(assets.get(id)?.containsText).toBe(false);
      expect(assets.get(id)?.review.status).toBe("usable");
      expect(assets.get(id)?.review.notes.length).toBeGreaterThan(0);
    }
  });
  it("keeps native review, visual recommendation and source rights independent", () => {
    const legacy = STUDIO_2D_ASSET_METADATA.filter((asset) => asset.provenance.kind === "legacy-catalog");
    const cc0 = STUDIO_2D_ASSET_METADATA.filter((asset) => asset.provenance.kind === "poly-haven-cc0");
    const generated = STUDIO_2D_ASSET_METADATA.filter((asset) => asset.provenance.kind === "gpt-image-2.5");
    expect(STUDIO_2D_ASSET_METADATA).toHaveLength(57);
    expect(STUDIO_2D_ASSET_METADATA.every((asset) => asset.review.method === "full-image")).toBe(true);
    expect(legacy).toHaveLength(9);
    expect(legacy.every((asset) => asset.provenance.licenseStatus === "unverified")).toBe(true);
    expect(cc0).toHaveLength(28);
    expect(cc0.every((asset) => asset.provenance.licenseStatus === "cc0-verified")).toBe(true);
    expect(generated).toHaveLength(20);
    expect(generated.every((asset) => asset.provenance.licenseStatus === "first-party-generated")).toBe(true);
    expect(STUDIO_2D_ASSET_METADATA.filter((asset) => asset.recommended)).toHaveLength(53);
    expect(STUDIO_2D_ASSET_METADATA.filter((asset) => asset.review.status === "small-panel-only")).toHaveLength(0);
    expect(BG_SCENE_COMPATIBILITY_LIBRARY).toHaveLength(4);
  });
});
