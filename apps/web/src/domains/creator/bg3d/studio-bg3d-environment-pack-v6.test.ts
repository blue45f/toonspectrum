import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_ENVIRONMENT_ASSETS,
  STUDIO_BG3D_ENVIRONMENT_ASSETS_V6,
  STUDIO_BG3D_LEGACY_ENVIRONMENT_ASSETS,
  getStudioBg3dEnvironmentAsset,
  getStudioBg3dEnvironmentAssetByHash,
} from "./studio-bg3d-environment-catalog";
import {
  DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
  validateStudioBg3dGlb,
} from "./studio-bg3d-glb-validation";

function bytesFor(url: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`../../../../public${url}`, import.meta.url)));
}

describe("Studio revised environment delivery v6", () => {
  it("selects twelve revised scenes while preserving every historical ID and hash", () => {
    expect(STUDIO_BG3D_ENVIRONMENT_ASSETS.slice(0, 12)).toEqual(STUDIO_BG3D_ENVIRONMENT_ASSETS_V6);
    expect(STUDIO_BG3D_ENVIRONMENT_ASSETS_V6).toHaveLength(12);
    expect(STUDIO_BG3D_LEGACY_ENVIRONMENT_ASSETS).toHaveLength(12);
    const selectedIds = new Set(STUDIO_BG3D_ENVIRONMENT_ASSETS.map(({ id }) => id));
    for (const legacy of STUDIO_BG3D_LEGACY_ENVIRONMENT_ASSETS) {
      expect(selectedIds.has(legacy.id)).toBe(false);
      expect(getStudioBg3dEnvironmentAsset(legacy.id)).toBe(legacy);
      expect(getStudioBg3dEnvironmentAssetByHash(legacy.sha256)).toBe(legacy);
      const revised = STUDIO_BG3D_ENVIRONMENT_ASSETS.find(({ fileName }) => fileName === legacy.fileName);
      expect(revised?.url).not.toBe(legacy.url);
      expect(revised?.sha256).not.toBe(legacy.sha256);
      expect(revised?.theme).toBe(legacy.theme);
      expect(revised?.camera).toEqual(legacy.camera);
    }
  });

  it.each(STUDIO_BG3D_ENVIRONMENT_ASSETS_V6)(
    "$fileName preserves exact bytes and passes the actual mobile admission gate with embedded PBR maps",
    async (asset) => {
      const bytes = bytesFor(asset.url);
      const result = await validateStudioBg3dGlb(bytes, {
        declared: { byteSize: asset.byteSize, sha256: asset.sha256 },
        cumulative: { usedBytes: 0, maximumBytes: 64 * 1024 * 1024 },
        profile: "mobile",
        budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
        digest: async (input) => createHash("sha256").update(input).digest("hex"),
      });
      expect(result.ok, result.code).toBe(true);
      if (!result.ok) return;
      expect(result.metrics.textures).toBeGreaterThan(0);
      expect(result.metrics.maxImageDimension).toBeLessThanOrEqual(1024);
      expect(result.metrics.undeterminedImageDimensions).toBe(0);
      expect(result.metrics.estimatedDecodedImageBytes).toBeLessThanOrEqual(128 * 1024 * 1024);
      expect(result.metrics.lights).toBe(0);
      expect(result.metrics.animations).toBe(0);
      expect(asset.normalization).toBe("authored-metres");
      expect(asset.provenance.origin).toBe("original-procedural-with-cc0-sources");
      expect(asset.provenance.sources?.length).toBeGreaterThan(0);
      expect(asset.provenance.sources?.every((source) => source.startsWith("https://polyhaven.com/a/"))).toBe(true);
      expect(Object.isFrozen(asset.provenance.sources)).toBe(true);
      expect(asset.provenance.externalResources).toBe(0);
      const thumbnail = bytesFor(asset.thumbnailUrl);
      expect([...thumbnail.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    },
  );
});
