import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import mcpManifest from "../../../../public/assets/3d/environments/mcp-free-v1/manifest.json";
import { SAMPLE_BG3D_MODEL_ENTRIES } from "./bg3d-model-library";
import {
  STUDIO_BG3D_ENVIRONMENT_ASSETS,
  STUDIO_BG3D_ENVIRONMENT_ASSETS_EXPANSION_V1,
  STUDIO_BG3D_ENVIRONMENT_ASSETS_MCP_FREE_V1,
  STUDIO_BG3D_ENVIRONMENT_ASSETS_V6,
  STUDIO_BG3D_ENVIRONMENT_ASSETS_WEBTOON_V7,
  getStudioBg3dEnvironmentAsset,
  getStudioBg3dEnvironmentAssetByHash,
} from "./studio-bg3d-environment-catalog";
import {
  DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
  validateStudioBg3dGlb,
} from "./studio-bg3d-glb-validation";
import { STUDIO_BG3D_CANONICAL_REQUIRED_GLTF_EXTENSIONS } from "./studio-bg3d-meshopt";

const GLB_JSON_CHUNK = 0x4e4f534a;

interface GltfDocument {
  readonly buffers?: readonly { readonly uri?: string }[];
  readonly images?: readonly { readonly uri?: string; readonly mimeType?: string }[];
  readonly extensionsRequired?: readonly string[];
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

describe("Studio Tripo MCP free-wallet environment pack v1", () => {
  it("adds ten audited webtoon modules after all original environment packs", () => {
    expect(mcpManifest.schema).toBe("toonspectrum.bg3d-environment-pack.mcp-free-v1");
    expect(mcpManifest.generation).toMatchObject({
      providerModelVersion: "v3.0-20250812",
      geometryQuality: "detailed",
      textureQuality: "detailed",
      pbr: true,
      faceLimit: 40_000,
      totalCreditCost: 200,
      billingMode: "free-api-wallet",
      paymentMethodUsed: false,
    });
    expect(STUDIO_BG3D_ENVIRONMENT_ASSETS_MCP_FREE_V1).toHaveLength(10);
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
  });

  it.each(STUDIO_BG3D_ENVIRONMENT_ASSETS_MCP_FREE_V1)(
    "$fileName is self-contained, hash-pinned, WebP/meshopt compressed, and mobile-admitted",
    async (asset) => {
      const bytes = new Uint8Array(readFileSync(publicAssetPath(asset.url)));
      expect(bytes.byteLength).toBe(asset.byteSize);
      expect(`sha256:${createHash("sha256").update(bytes).digest("hex")}`).toBe(asset.sha256);
      expect(bytes.byteLength).toBeLessThan(700 * 1024);

      const admission = await validateStudioBg3dGlb(bytes, {
        declared: { byteSize: asset.byteSize, sha256: asset.sha256 },
        cumulative: { usedBytes: 0, maximumBytes: 64 * 1024 * 1024 },
        profile: "mobile",
        budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
        supportedRequiredExtensions: STUDIO_BG3D_CANONICAL_REQUIRED_GLTF_EXTENSIONS,
        digest: async (input) => createHash("sha256").update(input).digest("hex"),
      });
      expect(admission, asset.id).toMatchObject({ ok: true, code: "valid" });
      if (!admission.ok) return;
      expect(admission.metrics.triangles).toBeLessThanOrEqual(40_000);
      expect(admission.metrics.drawCalls).toBeLessThanOrEqual(4);
      expect(admission.metrics.textures).toBe(3);
      expect(admission.metrics.maxImageDimension).toBe(1024);
      expect(admission.metrics.undeterminedImageDimensions).toBe(0);
      expect(admission.metrics.lights).toBe(0);
      expect(admission.metrics.animations).toBe(0);
      expect(admission.metrics.skins).toBe(0);

      const document = parseJsonChunk(bytes);
      expect(document.extensionsRequired).toEqual([
        "EXT_meshopt_compression",
        "EXT_texture_webp",
        "KHR_mesh_quantization",
      ]);
      expect((document.buffers ?? []).every(({ uri }) => uri === undefined)).toBe(true);
      expect((document.images ?? []).every(({ uri }) => uri === undefined)).toBe(true);
      expect((document.images ?? []).every(({ mimeType }) => mimeType === "image/webp")).toBe(true);

      const report = mcpManifest.assets.find(({ id }) => id === asset.id);
      expect(report).toBeDefined();
      expect(report?.externalRuntimeResources).toBe(0);
      expect(report?.visualReviewLevel).toBe("three-angle-local-structural-review");
      expect(report?.allAnglesArtisticallyApproved).toBe(false);
      expect(report?.previewReview).toMatchObject({
        visibleStructuralBlocker: false,
        reviewedImageWidth: 960,
        reviewedImageHeight: 720,
        reviewedModelSha256: asset.sha256,
      });

      const root = document.nodes?.find(({ name }) =>
        name === `TS_ENV_${asset.fileName.replace(/\.glb$/u, "")}_Root`,
      );
      expect(root?.extras).toMatchObject({
        asset_id: asset.id,
        asset_type: "studio-bg3d-environment",
        asset_provider: "Tripo",
        asset_generator: "official-tripo-mcp",
        asset_model_version: "v3.0-20250812",
        asset_license: "Tripo Terms of Service - Free User Output",
        asset_license_url: "https://www.tripo3d.ai/terms",
        asset_commercial_use: true,
        asset_nonexclusive: true,
        asset_provider_retains_rights: true,
        asset_credit_source: "free-api-wallet",
        asset_credit_cost: 20,
        units: "metres",
        ground_plane: "glTF-Y=0",
        ground_y_m: 0,
        embedded_texture_max_dimension: 1024,
      });
      expect(root?.extras?.asset_provider_task_id).toMatch(/^[a-f0-9-]{36}$/u);
      expect(root?.extras?.asset_prompt_sha256).toMatch(/^[a-f0-9]{64}$/u);

      expect(asset.normalization).toBe("authored-metres");
      expect(asset.provenance).toMatchObject({
        origin: "ai-generated-free-wallet",
        author: "ToonSpectrum",
        provider: "Tripo",
        generator: "official-tripo-mcp",
        providerModelVersion: "v3.0-20250812",
        license: "Tripo Terms of Service - Free User Output",
        licenseUrl: "https://www.tripo3d.ai/terms",
        attributionRequired: false,
        commercialUse: true,
        nonExclusive: true,
        providerRetainsRights: true,
        billingMode: "free-api-wallet",
        paymentMethodUsed: false,
        creditCost: 20,
        externalResources: 0,
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

  it("keeps generated rights explicit rather than widening the pack to CC0", () => {
    for (const report of mcpManifest.assets) {
      expect(report.license).toEqual({
        name: "Tripo Terms of Service - Free User Output",
        url: "https://www.tripo3d.ai/terms",
        commercialUse: true,
        attributionRequired: false,
        exclusive: false,
        providerRetainsRights: true,
        cc0: false,
      });
      expect(report.billing).toEqual({
        mode: "free-api-wallet",
        creditCost: 20,
        paymentMethodUsed: false,
        paidUpgradeUsed: false,
      });
      expect(report.prompt).not.toMatch(/(?:api[_-]?key|tsk_|bearer)/iu);
      expect(report).not.toHaveProperty("providerDownloadUrl");
    }
  });
});
