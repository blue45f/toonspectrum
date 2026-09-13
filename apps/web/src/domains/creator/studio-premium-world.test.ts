import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { getStudioBg3dEnvironmentAsset, getStudioBg3dEnvironmentAssetByHash, STUDIO_BG3D_ENVIRONMENT_ASSETS } from "./bg3d/studio-bg3d-environment-catalog";
import { filterStudioCc0Assets, parseStudioCc0Catalog, studioCc0AssetUrl } from "./studio-cc0-asset-delivery";
import { curateStudioCc0Selection, studioCc0StyleLabel } from "./studio-cc0-curation";
import { isTrustedStudioCc0Source, STUDIO_PREMIUM_WORLD_SOURCE_URL } from "./studio-cc0-source-policy";

const publicRoot = fileURLToPath(new URL("../../../public/", import.meta.url));
const read = (relative: string) => readFileSync(path.join(publicRoot, relative));
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const catalog = parseStudioCc0Catalog(JSON.parse(read("assets/studio/cc0-20260906/manifest.json").toString("utf8")) as unknown);
const additions = catalog.filter((asset) => asset.id.startsWith("ts-world-"));

// Unrelated GitHub URLs must never become a trusted asset provider.
describe("premium world provenance boundary", () => {
  it("admits only the exact reviewed first-party generator", () => {
    expect(isTrustedStudioCc0Source("ToonSpectrum", STUDIO_PREMIUM_WORLD_SOURCE_URL)).toBe(true);
    for (const url of [
      STUDIO_PREMIUM_WORLD_SOURCE_URL + "?raw=1", STUDIO_PREMIUM_WORLD_SOURCE_URL + "#forged",
      STUDIO_PREMIUM_WORLD_SOURCE_URL.replace("blue45f", "another-owner"),
      STUDIO_PREMIUM_WORLD_SOURCE_URL.replace("https:", "http:"),
      STUDIO_PREMIUM_WORLD_SOURCE_URL.replace("github.com", "github.com.evil.example"),
      "https://polyhaven.com/a/fake", "not a URL",
    ]) expect(isTrustedStudioCc0Source("ToonSpectrum", url)).toBe(false);
    expect(isTrustedStudioCc0Source("Other", STUDIO_PREMIUM_WORLD_SOURCE_URL)).toBe(false);
  });

  it("retains the existing external source policy", () => {
    expect(isTrustedStudioCc0Source("Poly Haven", "https://polyhaven.com/a/wood_table_001")).toBe(true);
    expect(isTrustedStudioCc0Source("Kenney", "https://kenney.nl/assets/furniture-kit")).toBe(true);
    expect(isTrustedStudioCc0Source("Poly Haven", "https://user:secret@polyhaven.com/a/test")).toBe(false);
    expect(isTrustedStudioCc0Source("Poly Haven", "https://polyhaven.com:8443/a/test")).toBe(false);
  });
});

describe("premium world delivered assets", () => {
  it("registers 16 real 3D props and 24 explicitly derived 2D images", () => {
    expect(additions).toHaveLength(40);
    expect(additions.filter((asset) => asset.kind === "model")).toHaveLength(16);
    expect(additions.filter((asset) => asset.kind === "illustration")).toHaveLength(24);
    expect(curateStudioCc0Selection(additions)).toHaveLength(40);
    expect(curateStudioCc0Selection(additions, { style: "detailed" })).toHaveLength(40);
  });

  it("offers Korean and English lookup and distinguishes illustration labels", () => {
    expect(filterStudioCc0Assets(additions, "정류장").length).toBeGreaterThan(0);
    expect(filterStudioCc0Assets(additions, "bus stop").length).toBeGreaterThan(0);
    const illustration = additions.find((asset) => asset.kind === "illustration");
    expect(illustration).toBeDefined();
    expect(studioCc0StyleLabel(illustration!)).toBe("2D 배경 · 투명 소품");
  });

  it("binds each delivered model and image to its actual bytes", () => {
    for (const asset of additions) {
      const bytes = read(studioCc0AssetUrl(asset.path).slice(1));
      expect(bytes.byteLength, asset.id).toBe(asset.bytes);
      expect(digest(bytes), asset.id).toBe(asset.sha256);
      expect(read(studioCc0AssetUrl(asset.previewPath!).slice(1)).length).toBeGreaterThan(0);
      if (asset.kind === "model") expect(bytes.subarray(0, 4).toString()).toBe("glTF");
      else {
        expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
        expect(bytes.subarray(8, 12).toString()).toBe("WEBP");
        expect(asset.width).toBeGreaterThanOrEqual(1536);
        expect(asset.height).toBe(1536);
      }
    }
  });

  it("registers eight immutable environment selections with working legacy lookups", () => {
    const worlds = STUDIO_BG3D_ENVIRONMENT_ASSETS.filter((asset) => asset.id.startsWith("ts-world-"));
    expect(worlds).toHaveLength(8);
    for (const asset of worlds) {
      expect(getStudioBg3dEnvironmentAsset(asset.id)).toBe(asset);
      expect(getStudioBg3dEnvironmentAssetByHash(asset.sha256)).toBe(asset);
      const bytes = read(asset.url.slice(1));
      expect(bytes.byteLength).toBe(asset.byteSize);
      expect(`sha256:${digest(bytes)}`).toBe(asset.sha256);
      expect(read(asset.thumbnailUrl.slice(1)).length).toBeGreaterThan(0);
      expect(asset.provenance.externalResources).toBe(0);
      expect(asset.provenance.commercialUse).toBe(true);
    }
    expect(getStudioBg3dEnvironmentAsset("ts-bg3d-compact_apartment_interior-v1")).not.toBeNull();
  });

  it("rejects a first-party entry with a forged source without trusting its review flag", () => {
    const manifest = JSON.parse(read("assets/studio/cc0-20260906/manifest.json").toString("utf8"));
    const candidate = manifest.assets.find((asset: { id: string }) => asset.id.startsWith("ts-world-"));
    candidate.license.sourceUrl = "https://github.com/other-owner/unrelated/blob/main/asset.py";
    expect(() => parseStudioCc0Catalog({ schema: manifest.schema, assets: [candidate] })).toThrow();
  });
});
