import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import expansionManifest from "../../../../public/assets/3d/environments/expansion-v1/manifest.json";
import { SAMPLE_BG3D_MODEL_ENTRIES } from "./bg3d-model-library";
import {
  STUDIO_BG3D_ENVIRONMENT_ASSETS,
  STUDIO_BG3D_ENVIRONMENT_ASSETS_EXPANSION_V1,
  STUDIO_BG3D_ENVIRONMENT_ASSETS_V6,
  STUDIO_BG3D_LEGACY_ENVIRONMENT_ASSETS,
  getStudioBg3dEnvironmentAsset,
  getStudioBg3dEnvironmentAssetByHash,
} from "./studio-bg3d-environment-catalog";
import {
  DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
  validateStudioBg3dGlb,
} from "./studio-bg3d-glb-validation";

function publicAssetPath(url: string): string {
  return fileURLToPath(new URL(`../../../../public${url}`, import.meta.url));
}

describe("Studio original environment expansion v1", () => {
  it("adds six distinct places without replacing refined or historical scene identities", () => {
    expect(STUDIO_BG3D_ENVIRONMENT_ASSETS_EXPANSION_V1).toHaveLength(6);
    expect(STUDIO_BG3D_ENVIRONMENT_ASSETS).toEqual([
      ...STUDIO_BG3D_ENVIRONMENT_ASSETS_V6,
      ...STUDIO_BG3D_ENVIRONMENT_ASSETS_EXPANSION_V1,
    ]);
    expect(STUDIO_BG3D_ENVIRONMENT_ASSETS).toHaveLength(18);
    expect(new Set(STUDIO_BG3D_ENVIRONMENT_ASSETS.map(({ id }) => id)).size).toBe(18);
    expect(new Set(STUDIO_BG3D_ENVIRONMENT_ASSETS.map(({ sha256 }) => sha256)).size).toBe(18);
    expect(SAMPLE_BG3D_MODEL_ENTRIES.map(({ id }) => id)).toEqual(
      STUDIO_BG3D_ENVIRONMENT_ASSETS.map(({ id }) => id),
    );
    for (const asset of [
      ...STUDIO_BG3D_LEGACY_ENVIRONMENT_ASSETS,
      ...STUDIO_BG3D_ENVIRONMENT_ASSETS,
    ]) {
      expect(getStudioBg3dEnvironmentAsset(asset.id)).toBe(asset);
      expect(getStudioBg3dEnvironmentAssetByHash(asset.sha256)).toBe(asset);
    }
    expect(STUDIO_BG3D_ENVIRONMENT_ASSETS_EXPANSION_V1.map(({ fileName }) => fileName)).toEqual([
      "library_reading_room.glb",
      "independent_bookshop.glb",
      "fashion_boutique.glb",
      "park_garden_pavilion.glb",
      "police_interview_room.glb",
      "science_research_laboratory.glb",
    ]);
  });

  it.each(STUDIO_BG3D_ENVIRONMENT_ASSETS_EXPANSION_V1)(
    "$fileName embeds safe textures and passes actual mobile GLB admission",
    async (asset) => {
      const bytes = new Uint8Array(readFileSync(publicAssetPath(asset.url)));
      const admission = await validateStudioBg3dGlb(bytes, {
        declared: { byteSize: asset.byteSize, sha256: asset.sha256 },
        cumulative: { usedBytes: 0, maximumBytes: 64 * 1024 * 1024 },
        profile: "mobile",
        budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
        digest: async (input) => createHash("sha256").update(input).digest("hex"),
      });
      expect(admission, asset.id).toMatchObject({ ok: true, code: "valid" });
      if (!admission.ok) return;
      expect(admission.metrics.textures).toBeGreaterThan(0);
      expect(admission.metrics.maxImageDimension).toBeLessThanOrEqual(1024);
      expect(admission.metrics.undeterminedImageDimensions).toBe(0);
      expect(admission.metrics.estimatedDecodedImageBytes).toBeLessThanOrEqual(128 * 1024 * 1024);
      expect(admission.metrics.lights).toBe(0);
      expect(admission.metrics.animations).toBe(0);
      expect(asset.url).toBe(`/assets/3d/environments/expansion-v1/${asset.fileName}`);
      expect(asset.normalization).toBe("authored-metres");
      expect(asset.provenance).toMatchObject({
        origin: "original-procedural-with-cc0-sources",
        generator: "scripts/blender/generate_studio_environment_expansion_v1.py",
        license: "CC0-1.0",
        externalResources: 0,
        commercialUse: true,
      });
      expect(asset.provenance.sources?.length).toBeGreaterThan(0);
      expect(Object.isFrozen(asset)).toBe(true);
      expect(Object.isFrozen(asset.camera)).toBe(true);
      const report = expansionManifest.assets.find(({ id }) => id === asset.id);
      expect(report?.semanticParts.length).toBeGreaterThanOrEqual(6);
      expect(report?.allAnglesArtisticallyApproved).toBe(false);
      const thumbnail = readFileSync(publicAssetPath(asset.thumbnailUrl));
      expect([...thumbnail.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(thumbnail.readUInt32BE(16)).toBe(960);
      expect(thumbnail.readUInt32BE(20)).toBe(720);
    },
  );
});
