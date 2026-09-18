import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STUDIO_MARKETPLACE_CC0_ASSETS } from "./studio-marketplace-cc0-catalog.generated";
import { findStudioMarketplaceCc0Asset, studioMarketplaceCc0Reference } from "./studio-marketplace-cc0-catalog";
import { createStudioCc0ModelFile, parseStudioCc0Catalog } from "./studio-cc0-asset-delivery";
import { projectCreatorMarketplaceRecordToAssets, projectCreatorMarketplaceRecordToStudioPack } from "./studio-community-marketplace";
import { resolveStudioCreatorBundledCatalogTarget, validateStudioCreatorPack } from "./studio-creator-pack-runtime";
import { MARKET_CC0_MANIFESTS } from "../../../../../scripts/seed/market-cc0-manifests.mjs";
import { CreatorMarketplaceResourceRecordSchema, canonicalizeCreatorMarketplaceJson, creatorMarketplaceJsonByteSize } from "@/shared/lib/creator-marketplace-resource-contract";

const root = new URL("../../../public/assets/studio/cc0-20260906/", import.meta.url);
const hash = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
afterEach(() => vi.unstubAllGlobals());
describe("reviewed market CC0 delivery", () => {
  it("pins 100 distinct entries to the actual delivery manifest and file bytes", () => {
    const catalog = parseStudioCc0Catalog(JSON.parse(readFileSync(new URL("manifest.json", root), "utf8")));
    expect(STUDIO_MARKETPLACE_CC0_ASSETS).toHaveLength(100);
    expect(new Set(STUDIO_MARKETPLACE_CC0_ASSETS.map(a => a.id)).size).toBe(100);
    for (const asset of STUDIO_MARKETPLACE_CC0_ASSETS) {
      expect(asset).toEqual(catalog.find(item => item.id === asset.id));
      const bytes = readFileSync(new URL(asset.path, root));
      expect(bytes.byteLength).toBe(asset.bytes); expect(hash(bytes)).toBe(asset.sha256);
      expect(findStudioMarketplaceCc0Asset(studioMarketplaceCc0Reference(asset))).toEqual(asset);
    }
    expect(new Set(STUDIO_MARKETPLACE_CC0_ASSETS.map(asset => asset.kind))).toEqual(new Set([
      "background", "effect-mask", "model", "prop-image", "surface-texture",
    ]));
    expect(STUDIO_MARKETPLACE_CC0_ASSETS.filter(asset => asset.kind === "background")).toHaveLength(28);
    expect(STUDIO_MARKETPLACE_CC0_ASSETS.filter(asset => asset.kind === "prop-image")).toHaveLength(24);
    expect(STUDIO_MARKETPLACE_CC0_ASSETS.filter(asset => asset.kind === "model")).toHaveLength(24);
    expect(STUDIO_MARKETPLACE_CC0_ASSETS.filter(asset => asset.kind === "surface-texture")).toHaveLength(12);
    expect(STUDIO_MARKETPLACE_CC0_ASSETS.filter(asset => asset.kind === "effect-mask")).toHaveLength(12);
    for (const asset of STUDIO_MARKETPLACE_CC0_ASSETS) {
      if (asset.kind === "background") expect(Math.max(asset.width ?? 0, asset.height ?? 0)).toBeGreaterThanOrEqual(2048);
      if (asset.kind === "prop-image") expect(Math.min(asset.width ?? 0, asset.height ?? 0)).toBeGreaterThanOrEqual(1536);
      if (asset.kind === "surface-texture") expect(Math.min(asset.width ?? 0, asset.height ?? 0)).toBeGreaterThanOrEqual(1024);
      if (asset.kind === "effect-mask") expect(Math.min(asset.width ?? 0, asset.height ?? 0)).toBeGreaterThanOrEqual(512);
    }
  });
  it.each(["https://example.com/model.glb", "cc0/../x", "studio-3d-asset:unknown", "cc0/polyhaven-sofa-02", "studio-3d-asset:polyhaven-background-wide-street-01"])("rejects unregistered or mismatched references: %s", value => {
    expect(findStudioMarketplaceCc0Asset(value)).toBeNull();
  });
  it.each(MARKET_CC0_MANIFESTS.map(m => [m.name, m] as const))("validates and resolves %s", (_name, manifest) => {
    for (const entry of manifest.entries) {
      const value = entry.delivery.mode === "builtin-ref"
        ? { mode: entry.delivery.mode, runtimeRef: entry.delivery.runtimeRef } : entry.delivery.payload;
      expect(hash(canonicalizeCreatorMarketplaceJson(value))).toBe(entry.delivery.sha256);
    }
    const { rightsConfirmed: _rights, ...publicManifest } = manifest;
    const record = CreatorMarketplaceResourceRecordSchema.parse({ ...publicManifest,
      id: randomUUID(), manifestHash: hash(canonicalizeCreatorMarketplaceJson(manifest)),
      manifestByteSize: creatorMarketplaceJsonByteSize(manifest), publisher: { id: "qa", name: "QA", avatar: null },
      createdAt: "2026-09-13T00:00:00.000Z", updatedAt: "2026-09-13T00:00:00.000Z", isOwner: false, access: "free" });
    if (record.kind === "asset") {
      const projection = projectCreatorMarketplaceRecordToAssets(record);
      expect(projection.unsupportedCount).toBe(0); expect(projection.assets).toHaveLength(1);
    } else {
      const projection = projectCreatorMarketplaceRecordToStudioPack(record);
      expect(projection.status).toBe("installable");
      if (projection.status !== "installable") throw new Error(projection.reason);
      expect(validateStudioCreatorPack(projection.pack).issues).toEqual([]);
      expect(resolveStudioCreatorBundledCatalogTarget(projection.pack).status).toBe("supported");
    }
  });
  it.each(STUDIO_MARKETPLACE_CC0_ASSETS.filter(a => a.kind === "model"))("verifies actual GLB download $id", async asset => {
    const bytes = readFileSync(new URL(asset.path, root));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes)));
    const file = await createStudioCc0ModelFile(asset);
    expect(file.type).toBe("model/gltf-binary"); expect(file.size).toBe(asset.bytes);
  });
  it("rejects a same-size tampered GLB", async () => {
    const asset = STUDIO_MARKETPLACE_CC0_ASSETS.find(a => a.kind === "model")!;
    const bytes = readFileSync(new URL(asset.path, root)); bytes[bytes.length - 1] ^= 1;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes)));
    await expect(createStudioCc0ModelFile(asset)).rejects.toThrow("무결성");
  });
  it("rejects oversized and missing downloads", async () => {
    const asset = STUDIO_MARKETPLACE_CC0_ASSETS.find(a => a.kind === "model")!;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(asset.bytes + 1))));
    await expect(createStudioCc0ModelFile(asset)).rejects.toThrow("크기 제한");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 })));
    await expect(createStudioCc0ModelFile(asset)).rejects.toThrow("불러오지 못했습니다");
  });
  it("rejects images at the GLB boundary", async () => {
    await expect(createStudioCc0ModelFile(STUDIO_MARKETPLACE_CC0_ASSETS[0]!)).rejects.toThrow("3D 모델");
  });
});

describe("market model production admission", () => {
  it.each(STUDIO_MARKETPLACE_CC0_ASSETS.filter(a => a.kind === "model"))("admits $id under the unchanged mobile profile", async asset => {
    const { validateStudioBg3dGlb, DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES } = await import("./bg3d/studio-bg3d-glb-validation");
    const bytes = new Uint8Array(readFileSync(new URL(asset.path, root)));
    const result = await validateStudioBg3dGlb(bytes, {
      declared: { byteSize: asset.bytes, sha256: `sha256:${asset.sha256}` },
      cumulative: { usedBytes: 0, maximumBytes: 64 * 1024 * 1024 },
      profile: "mobile", budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
      digest: async input => hash(input),
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
  });
});
