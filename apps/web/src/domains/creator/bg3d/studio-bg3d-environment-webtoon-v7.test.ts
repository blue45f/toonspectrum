import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import webtoonManifest from "../../../../public/assets/3d/environments/webtoon-v7/manifest.json";
import { SAMPLE_BG3D_MODEL_ENTRIES } from "./bg3d-model-library";
import {
  STUDIO_BG3D_ENVIRONMENT_ASSETS,
  STUDIO_BG3D_ENVIRONMENT_ASSETS_EXPANSION_V1,
  STUDIO_BG3D_ENVIRONMENT_ASSETS_V6,
  STUDIO_BG3D_ENVIRONMENT_ASSETS_WEBTOON_V7,
  STUDIO_BG3D_ENVIRONMENT_ASSETS_MCP_FREE_V1,
  getStudioBg3dEnvironmentAsset,
  getStudioBg3dEnvironmentAssetByHash,
} from "./studio-bg3d-environment-catalog";
import {
  DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
  validateStudioBg3dGlb,
} from "./studio-bg3d-glb-validation";

const GLB_JSON_CHUNK = 0x4e4f534a;

interface GltfDocument {
  readonly buffers?: readonly { readonly uri?: string }[];
  readonly images?: readonly { readonly uri?: string }[];
  readonly nodes?: readonly {
    readonly name?: string;
    readonly extras?: Readonly<Record<string, unknown>>;
  }[];
}

function publicAssetPath(url: string): string {
  return fileURLToPath(new URL(`../../../../public${url}`, import.meta.url));
}

function parseJsonChunk(bytes: Uint8Array): GltfDocument {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(view.getUint32(0, true)).toBe(0x46546c67);
  expect(view.getUint32(4, true)).toBe(2);
  expect(view.getUint32(8, true)).toBe(bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  expect(view.getUint32(16, true)).toBe(GLB_JSON_CHUNK);
  return JSON.parse(
    new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)),
  ) as GltfDocument;
}

describe("Studio original webtoon environment pack v7", () => {
  it("publishes three original procedural scenes after the refined and expansion packs", () => {
    expect(webtoonManifest.schema).toBe("toonspectrum.bg3d-environment-pack.v7");
    expect(STUDIO_BG3D_ENVIRONMENT_ASSETS_WEBTOON_V7).toHaveLength(3);
    expect(STUDIO_BG3D_ENVIRONMENT_ASSETS).toEqual([
      ...STUDIO_BG3D_ENVIRONMENT_ASSETS_V6,
      ...STUDIO_BG3D_ENVIRONMENT_ASSETS_EXPANSION_V1,
      ...STUDIO_BG3D_ENVIRONMENT_ASSETS_WEBTOON_V7,
      ...STUDIO_BG3D_ENVIRONMENT_ASSETS_MCP_FREE_V1,
    ]);
    expect(STUDIO_BG3D_ENVIRONMENT_ASSETS).toHaveLength(31);
    expect(new Set(STUDIO_BG3D_ENVIRONMENT_ASSETS.map(({ id }) => id)).size).toBe(31);
    expect(new Set(STUDIO_BG3D_ENVIRONMENT_ASSETS.map(({ sha256 }) => sha256)).size).toBe(31);
    expect(SAMPLE_BG3D_MODEL_ENTRIES.map(({ id }) => id)).toEqual(
      STUDIO_BG3D_ENVIRONMENT_ASSETS.map(({ id }) => id),
    );
    expect(STUDIO_BG3D_ENVIRONMENT_ASSETS_WEBTOON_V7.map(({ fileName }) => fileName)).toEqual([
      "webtoon_rooftop_utility_platform.glb",
      "webtoon_corner_store_facade.glb",
      "webtoon_street_prop_pack.glb",
    ]);
  });

  it.each(STUDIO_BG3D_ENVIRONMENT_ASSETS_WEBTOON_V7)(
    "$fileName is self-contained, hash-pinned, and admitted by the mobile profile",
    async (asset) => {
      const bytes = new Uint8Array(readFileSync(publicAssetPath(asset.url)));
      expect(bytes.byteLength).toBe(asset.byteSize);
      expect(`sha256:${createHash("sha256").update(bytes).digest("hex")}`).toBe(asset.sha256);
      expect(bytes.byteLength).toBeLessThan(2 * 1024 * 1024);

      const admission = await validateStudioBg3dGlb(bytes, {
        declared: { byteSize: asset.byteSize, sha256: asset.sha256 },
        cumulative: { usedBytes: 0, maximumBytes: 64 * 1024 * 1024 },
        profile: "mobile",
        budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
        digest: async (input) => createHash("sha256").update(input).digest("hex"),
      });
      expect(admission, asset.id).toMatchObject({ ok: true, code: "valid" });
      if (!admission.ok) return;
      expect(admission.metrics.triangles).toBeLessThanOrEqual(40_000);
      expect(admission.metrics.drawCalls).toBeLessThanOrEqual(24);
      expect(admission.metrics.textures).toBe(2);
      expect(admission.metrics.maxImageDimension).toBe(128);
      expect(admission.metrics.undeterminedImageDimensions).toBe(0);
      expect(admission.metrics.lights).toBe(0);
      expect(admission.metrics.animations).toBe(0);

      const document = parseJsonChunk(bytes);
      expect((document.buffers ?? []).every(({ uri }) => uri === undefined)).toBe(true);
      expect((document.images ?? []).every(({ uri }) => uri === undefined)).toBe(true);
      const report = webtoonManifest.assets.find(({ id }) => id === asset.id);
      expect(report).toBeDefined();
      expect(report?.externalRuntimeResources).toBe(0);
      expect(report?.originalProceduralGeometry).toBe(true);
      expect(report?.semanticParts.length).toBeGreaterThanOrEqual(8);
      expect(report?.allAnglesArtisticallyApproved).toBe(false);
      expect(report?.referenceWorkflow).toMatchObject({
        embeddedThirdPartyModelBytes: false,
        embeddedThirdPartyImageBytes: false,
      });
      const root = document.nodes?.find(({ name }) =>
        name === `TS_ENV_${asset.fileName.replace(/\.glb$/u, "")}_Root`,
      );
      expect(root?.extras).toMatchObject({
        asset_id: asset.id,
        asset_type: "studio-bg3d-environment",
        asset_author: "ToonSpectrum",
        asset_generator: "scripts/blender/generate_environment_pack_v7.py",
        asset_generator_version: "7.0.0-blender-5.2",
        asset_license: "CC0-1.0",
        units: "metres",
        ground_plane: "glTF-Y=0",
        ground_y_m: 0,
        embedded_texture_count: 2,
        embedded_texture_max_dimension: 128,
      });

      expect(asset.normalization).toBe("authored-metres");
      expect(asset.provenance).toMatchObject({
        origin: "original-procedural",
        generator: "scripts/blender/generate_environment_pack_v7.py",
        license: "CC0-1.0",
        externalResources: 0,
        attributionRequired: false,
        commercialUse: true,
      });
      expect(getStudioBg3dEnvironmentAsset(asset.id)).toBe(asset);
      expect(getStudioBg3dEnvironmentAssetByHash(asset.sha256)).toBe(asset);
      expect(Object.isFrozen(asset)).toBe(true);
      expect(Object.isFrozen(asset.camera)).toBe(true);

      const thumbnail = readFileSync(publicAssetPath(asset.thumbnailUrl));
      expect([...thumbnail.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(thumbnail.readUInt32BE(16)).toBe(960);
      expect(thumbnail.readUInt32BE(20)).toBe(720);
      expect(`sha256:${createHash("sha256").update(thumbnail).digest("hex")}`)
        .toBe(report?.previewReview.reviewedImageSha256);
    },
  );
});
