import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioCc0ModelFile, parseStudioCc0Catalog } from "./studio-cc0-asset-delivery";
import { STUDIO_MARKETPLACE_CC0_ASSETS } from "./studio-marketplace-cc0-catalog.generated";
import { findStudioMarketplaceCc0Asset, resolveStudioMarketplaceCc0Model } from "./studio-marketplace-cc0-registry";
import { resolveStudioMarketplaceAssetPreview } from "./studio-marketplace-preview";

const root = new URL("../../../public/assets/studio/cc0-20260906/", import.meta.url);
afterEach(() => vi.unstubAllGlobals());

describe("pinned marketplace CC0 delivery", () => {
  it("pins the curated reviewed assets to the current catalog and real file hashes", () => {
    const catalog = parseStudioCc0Catalog(JSON.parse(readFileSync(new URL("manifest.json", root), "utf8")));
    expect(STUDIO_MARKETPLACE_CC0_ASSETS).toHaveLength(338);
    for (const asset of STUDIO_MARKETPLACE_CC0_ASSETS) {
      expect(asset).toEqual(catalog.find((candidate) => candidate.id === asset.id));
      const bytes = readFileSync(new URL(asset.path, root));
      expect(bytes.byteLength).toBe(asset.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
    }
  });
  it("rejects unknown, path-traversal and cross-kind model references", () => {
    for (const ref of ["https://example.com/a.glb", "studio-3d-asset:../model", "studio-3d-asset:polyhaven-background-wide-street-01", "studio-3d-asset:polyhaven-painted-wooden-chair-01", "studio-asset:polyhaven-sofa-02"]) {
      expect(resolveStudioMarketplaceCc0Model(ref)).toBeNull();
    }
    expect(findStudioMarketplaceCc0Asset("missing")).toBeNull();
  });
  it("loads the exact model file without redirects and rejects corrupt bytes", async () => {
    const asset = resolveStudioMarketplaceCc0Model("studio-3d-asset:polyhaven-street-lamp-02")!;
    const bytes = new Uint8Array(readFileSync(new URL(asset.path, root)));
    const fetcher = vi.fn(async () => new Response(bytes));
    vi.stubGlobal("fetch", fetcher);
    const file = await createStudioCc0ModelFile(asset);
    expect(file.name).toBe(`${asset.id}.glb`);
    expect(file.size).toBe(asset.bytes);
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining(asset.path), expect.objectContaining({ redirect: "error" }));
    fetcher.mockImplementationOnce(async () => new Response(new Uint8Array([0, 1, 2])));
    await expect(createStudioCc0ModelFile(asset)).rejects.toThrow("무결성");
  });
  it("does not fetch after cancellation or for an image reference", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController(); controller.abort();
    const model = resolveStudioMarketplaceCc0Model("studio-3d-asset:polyhaven-street-lamp-02")!;
    await expect(createStudioCc0ModelFile(model, controller.signal)).rejects.toThrow();
    await expect(createStudioCc0ModelFile(STUDIO_MARKETPLACE_CC0_ASSETS.find((asset) => asset.kind !== "model")!)).rejects.toThrow("3D 모델");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("previews only the selected trusted image or model, never an arbitrary URL", () => {
    expect(resolveStudioMarketplaceAssetPreview("studio-asset:polyhaven-background-wide-street-01")?.src).toContain("background.webp");
    expect(resolveStudioMarketplaceAssetPreview("studio-3d-asset:polyhaven-street-lamp-02")?.src).toContain("polyhaven-street-lamp-02");
    expect(resolveStudioMarketplaceAssetPreview("https://example.com/fake.png")).toBeNull();
  });
});
