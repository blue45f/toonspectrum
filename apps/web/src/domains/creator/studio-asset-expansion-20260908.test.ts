import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  filterStudioCc0Assets,
  parseStudioCc0Catalog,
  studioCc0AssetUrl,
} from "./studio-cc0-asset-delivery";
import { isStudioCc0EligibleForNewSelection } from "./studio-cc0-curation";

const publicRoot = new URL("../../../public/assets/studio/cc0-20260906/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", publicRoot), "utf8")) as {
  schema: string;
  assets: Array<Record<string, unknown>>;
};
const catalog = parseStudioCc0Catalog(manifest);
const reviewRoot = "artifacts/studio-asset-expansion/pbr-20260908/";
const additions = catalog.filter(asset => asset.visualReviewSource?.startsWith(reviewRoot));

describe("September 8 reviewed CC0 expansion", () => {
  it("adds actual originals rather than counting variations within a source set", () => {
    expect(additions).toHaveLength(69);
    expect(additions.filter(asset => asset.kind === "model")).toHaveLength(51);
    expect(additions.filter(asset => asset.kind === "surface-texture")).toHaveLength(18);
    expect(new Set(additions.map(asset => asset.id)).size).toBe(69);
    expect(new Set(additions.map(asset => asset.sha256)).size).toBe(69);
    expect(catalog.length).toBeGreaterThanOrEqual(1212);
  });

  it.each(additions)("ships the reviewed bytes and local resources for $id", asset => {
    const raw = readFileSync(new URL(asset.path, publicRoot));
    expect(raw.byteLength).toBe(asset.bytes);
    expect(createHash("sha256").update(raw).digest("hex")).toBe(asset.sha256);
    expect(studioCc0AssetUrl(asset.path)).toBe("/assets/studio/cc0-20260906/" + asset.path);
    expect(asset.visualReviewed).toBe(true);
    expect(asset.visualReviewLevel).toBe("contact-sheet-visual-triage");
    expect(asset.allAnglesArtisticallyApproved).toBe(false);
    expect(isStudioCc0EligibleForNewSelection(asset)).toBe(true);
    if (asset.kind === "model") {
      expect(asset.browserRenderVerified).toBe(true);
      expect(asset.previewPath).toBeTruthy();
      expect(readFileSync(new URL(asset.previewPath!, publicRoot)).byteLength).toBeGreaterThan(1000);
      expect(raw.toString("ascii", 0, 4)).toBe("glTF");
      expect(raw.readUInt32LE(4)).toBe(2);
      expect(raw.readUInt32LE(8)).toBe(raw.byteLength);
      const document = JSON.parse(raw.toString("utf8", 20, 20 + raw.readUInt32LE(12))) as {
        buffers: Array<{ uri?: string }>;
        images: Array<{ uri?: string; bufferView?: number }>;
      };
      expect(document.buffers.every(buffer => !buffer.uri)).toBe(true);
      expect(document.images.every(image => !image.uri && Number.isInteger(image.bufferView))).toBe(true);
    }
  });

  it("keeps the failed framing and noisy-surface candidates out of the active manifest", () => {
    expect(catalog.some(asset => asset.id === "polyhaven-dandelion-01")).toBe(false);
    expect(catalog.some(asset => asset.id === "polyhaven-leafy-grass")).toBe(false);
  });

  it("uses restored clock alpha and mobile-ready paths instead of their rejected originals", () => {
    for (const id of ["alarm-clock-01", "vintage-grandfather-clock-01", "vintage-telephone-wall-clock"]) {
      const asset = additions.find(candidate => candidate.id === "polyhaven-" + id);
      expect(asset?.path.endsWith("-alpha-restored-v1.glb")).toBe(true);
    }
    for (const id of ["cassette-player", "brass-goblets", "korean-fire-extinguisher-01"]) {
      const asset = additions.find(candidate => candidate.id === "polyhaven-" + id);
      expect(asset?.path.endsWith("-mobile-v1.glb")).toBe(true);
    }
  });

  it("labels the gate latch as a component rather than a complete environment", () => {
    expect(additions.find(asset => asset.id === "polyhaven-gate-latch-01")?.role).toBe("assembly-component");
  });

  it("makes the new originals searchable by Korean names", () => {
    expect(filterStudioCc0Assets(catalog, "소화기").some(asset => asset.id === "polyhaven-korean-fire-extinguisher-01")).toBe(true);
    expect(filterStudioCc0Assets(catalog, "알람시계").some(asset => asset.id === "polyhaven-alarm-clock-01")).toBe(true);
    expect(filterStudioCc0Assets(catalog, "무늬목").some(asset => asset.id === "polyhaven-oak-veneer-01")).toBe(true);
  });
});
