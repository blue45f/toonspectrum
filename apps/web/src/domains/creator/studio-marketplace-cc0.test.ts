import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { buildMarketCc0ReleaseManifests } from "../../../../../scripts/seed/market-cc0-release-manifests.mts";
import { parseStudioCc0Catalog } from "./studio-cc0-asset-delivery";
import { getStudioCc0ReviewStatus, isStudioCc0EligibleForNewSelection } from "./studio-cc0-curation";
import { STUDIO_MARKETPLACE_CC0_ASSETS } from "./studio-marketplace-cc0-catalog.generated";
import { findStudioMarketplaceCc0Asset, resolveStudioMarketplaceCc0Entry } from "./studio-marketplace-cc0-assets";
import { isStudioMarketplaceCc0ModelRef } from "./studio-marketplace-cc0-model-refs";
import { projectCreatorMarketplaceRecordToAssets, projectCreatorMarketplaceRecordToStudioPack } from "./studio-community-marketplace";
import { resolveStudioCreatorBundledCatalogTarget, validateStudioCreatorPack } from "./studio-creator-pack-runtime";
import { applyStudioMarketplaceDeepLinkOperation } from "./studio-marketplace-deep-link-operation";

import { canonicalizeCreatorMarketplaceJson, creatorMarketplaceJsonByteSize, CreatorMarketplaceResourceRecordSchema } from "@/shared/lib/creator-marketplace-resource-contract";

const manifests = buildMarketCc0ReleaseManifests();
const records = manifests.map((manifest, index) => {
  const publicManifest = { ...manifest } as Record<string, unknown>;
  delete publicManifest.rightsConfirmed;
  return CreatorMarketplaceResourceRecordSchema.parse({ ...publicManifest,
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    publisher: { id: "cc0-release-test", name: "CC0 검증 계정", avatar: null },
    manifestHash: createHash("sha256").update(canonicalizeCreatorMarketplaceJson(manifest)).digest("hex"),
    manifestByteSize: creatorMarketplaceJsonByteSize(manifest),
    createdAt: "2026-09-13T00:00:00.000Z", updatedAt: "2026-09-13T00:00:00.000Z", isOwner: false, access: "free",
  });
});
const canonicalCatalog = parseStudioCc0Catalog(JSON.parse(readFileSync(
  new URL("../../../public/assets/studio/cc0-20260906/manifest.json", import.meta.url), "utf8",
)));

describe("market CC0 exact delivery", () => {
  it("pins eight raster assets and six models to the existing reviewed shipping manifest", () => {
    expect(STUDIO_MARKETPLACE_CC0_ASSETS).toHaveLength(14);
    expect(STUDIO_MARKETPLACE_CC0_ASSETS.filter(asset => asset.kind === "model")).toHaveLength(6);
    for (const asset of STUDIO_MARKETPLACE_CC0_ASSETS) {
      const source = canonicalCatalog.find(item => item.id === asset.id);
      expect(source).toBeDefined();
      for (const key of ["kind", "path", "previewPath", "bytes", "sha256", "sourceUrl", "provider", "width", "height"] as const) {
        expect(asset[key], `${asset.id}:${key}`).toEqual(source![key]);
      }
      expect(isStudioCc0EligibleForNewSelection(source!)).toBe(true);
      expect(getStudioCc0ReviewStatus(source!)).toBe("contact-sheet-reviewed");
      expect(isStudioMarketplaceCc0ModelRef(`studio-3d-asset:cc0/${asset.id}`)).toBe(asset.kind === "model");
    }
  });
  it.each(records)("projects the exact source of $name", record => {
    const resolved = resolveStudioMarketplaceCc0Entry(record, record.entries[0]);
    expect(resolved?.id).toBe(record.entries[0].id);
    if (record.kind === "asset") {
      const projection = projectCreatorMarketplaceRecordToAssets(record);
      expect(projection.unsupportedCount).toBe(0);
      expect(projection.assets[0]).toEqual(resolved);
    } else {
      const projection = projectCreatorMarketplaceRecordToStudioPack(record);
      expect(projection.status).toBe("installable");
      if (projection.status !== "installable") throw new Error(projection.reason);
      expect(validateStudioCreatorPack(projection.pack).valid).toBe(true);
      expect(resolveStudioCreatorBundledCatalogTarget(projection.pack)).toMatchObject({
        status: "supported", target: { kind: "3d-asset-catalog" },
      });
    }
  });
  it.each(["https://example.com/model.glb", "studio-3d-asset:cc0/../secret", "studio-3d-asset:cc0/unknown", "studio-asset:cc0/polyhaven-sofa-02", null])("rejects arbitrary references %s", value => {
    expect(findStudioMarketplaceCc0Asset(value)).toBeNull();
  });
  it("does not grant a source preview to a relabelled or mismatched release", () => {
    const source = records[0];
    expect(resolveStudioMarketplaceCc0Entry({ ...source, license: "toonspectrum-standard" }, source.entries[0])).toBeNull();
    expect(resolveStudioMarketplaceCc0Entry({ ...source, provenance: { origin: "original", authoredByPublisher: true } }, source.entries[0])).toBeNull();
    expect(resolveStudioMarketplaceCc0Entry({ ...source, kind: "3d-asset" }, source.entries[0])).toBeNull();
    expect(resolveStudioMarketplaceCc0Entry({ ...source, provenance: { ...manifests[1].provenance } }, source.entries[0])).toBeNull();
  });
  it("has byte-accurate built-in entry hashes accepted by the API contract", () => {
    for (const manifest of manifests) {
      const delivery = manifest.entries[0].delivery;
      if (delivery.mode !== "builtin-ref") throw new Error("Expected immutable built-in delivery");
      expect(delivery.byteSize).toBe(0);
      expect(delivery.sha256).toBe(createHash("sha256").update(canonicalizeCreatorMarketplaceJson({
        mode: "builtin-ref", runtimeRef: delivery.runtimeRef,
      })).digest("hex"));
    }
  });
});

describe("awaited marketplace image insertion", () => {
  function dependencies(insertAsset: (asset: string) => Promise<boolean>) {
    return {
      loadResource: async () => records[0],
      projectAssets: () => ({ assets: ["verified-image"], reason: null }),
      insertAsset,
      projectPack: () => ({ status: "unsupported" as const, pack: null, reason: "not a tool pack" }),
      installPack: async () => ({ status: "invalid" as const, message: "not a tool pack" }),
      openBundledPackCatalog: () => ({ status: "unsupported" as const, message: "not a tool pack" }),
    };
  }
  it("does not mistake a Promise resolving false for successful canvas insertion", async () => {
    const result = await applyStudioMarketplaceDeepLinkOperation(records[0].id, dependencies(async () => false));
    expect(result.status).toBe("error");
  });
  it("suppresses completion after a different operation takes over during image decoding", async () => {
    let finish!: (value: boolean) => void;
    let current = true;
    const insert = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    const pending = applyStudioMarketplaceDeepLinkOperation(records[0].id, dependencies(insert), { isCurrent: () => current });
    await vi.waitFor(() => expect(insert).toHaveBeenCalledOnce());
    current = false;
    finish(true);
    expect((await pending).status).toBe("stale");
  });
  it("keeps the real canvas scope guard after raster decoding and before insertion", () => {
    const host = readFileSync(new URL("./StudioCuttoonEditorHost.tsx", import.meta.url), "utf8");
    const section = host.slice(host.indexOf("insertAsset: async (projectedAsset)"));
    expect(section.indexOf("await createStudioCommunityAssetRecord")).toBeGreaterThan(-1);
    expect(section.indexOf("if (!isStudioPasteScopeCurrent({")).toBeGreaterThan(section.indexOf("await createStudioCommunityAssetRecord"));
    expect(section.indexOf("return addRenderedImage(asset.dataUrl")).toBeGreaterThan(section.indexOf("if (!isStudioPasteScopeCurrent({"));
  });
});
