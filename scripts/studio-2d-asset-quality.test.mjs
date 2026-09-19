import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { auditStudio2dAssets, readImageDimensions, readPngDimensions, studio2dAssetRecommendationError, STUDIO_2D_MANIFEST_PATH } from "./studio-2d-asset-audit.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const root = fileURLToPath(new URL("../", import.meta.url));
const original = JSON.parse(readFileSync(path.join(root, STUDIO_2D_MANIFEST_PATH), "utf8"));
const webPublic = path.join(root, "apps", "web", "public");
const modified = (change) => {
  const manifest = structuredClone(original);
  change(manifest);
  return auditStudio2dAssets(root, manifest);
};

test("every declared original matches its bytes, dimensions, format and reviewed hash", () => {
  const result = auditStudio2dAssets(root);
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.originalCount, 9);
  assert.equal(result.largeOriginals, 9);
  assert.equal(result.smallOriginals, 0);
  assert.equal(result.recommended, 5);
});

test("JPEG originals use .jpg while all retained legacy .png aliases preserve identical bytes", () => {
  const aliases = original.assets.filter((asset) => asset.legacySrc);
  assert.equal(aliases.length, 5);
  for (const asset of aliases) {
    assert.equal(asset.mediaType, "image/jpeg");
    assert.ok(asset.src.endsWith(".jpg"));
    assert.deepEqual(readFileSync(path.join(webPublic, asset.src)), readFileSync(path.join(webPublic, asset.legacySrc)));
  }
});

test("duplicate IDs cannot inflate the catalog count", () => {
  assert.equal(modified((manifest) => manifest.assets.push(manifest.assets[0])).ok, false);
});

test("duplicate source URLs cannot inflate the catalog count", () => {
  const result = modified((manifest) => { manifest.assets[1].src = manifest.assets[0].src; });
  assert.match(result.errors.join(), /Duplicate source file/u);
});

test("declared upscaled dimensions fail against original bytes", () => {
  assert.match(modified((manifest) => { manifest.assets[0].width = 4096; }).errors.join(), /dimensions/u);
});

test("stale checksums invalidate prior quality evidence", () => {
  assert.match(modified((manifest) => { manifest.assets[0].sha256 = "0".repeat(64); }).errors.join(), /SHA-256/u);
});

test("extension-based PNG claims cannot disguise JPEG payloads", () => {
  assert.match(modified((manifest) => { manifest.assets[0].mediaType = "image/png"; }).errors.join(), /signature/u);
});

test("small originals cannot be promoted into recommendations even when the main catalog contains only large originals", () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "studio-small-original-"));
  try {
    const directory = path.join(fixtureRoot, "apps/web/public/assets/studio/backgrounds"); mkdirSync(directory, { recursive: true });
    const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+afoQAAAAASUVORK5CYII=", "base64");
    writeFileSync(path.join(directory,"small.png"), bytes);
    const item = { ...structuredClone(original.assets[0]), id: "small-fixture", src: "/assets/studio/backgrounds/small.png", legacySrc: null,
      mediaType: "image/png", width: 1, height: 1, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), recommended: true,
      review: { status: "usable", method: "full-image", notes: [] } };
    const result = auditStudio2dAssets(fixtureRoot, { version: 1, assets: [item] });
    assert.match(result.errors.join(), /Recommendation/u);
    assert.doesNotMatch(result.errors.join(), /ENOENT|SHA-256|dimensions/u);
    item.recommended = false;
    assert.equal(auditStudio2dAssets(fixtureRoot, { version: 1, assets: [item] }).ok, true);
  } finally { rmSync(fixtureRoot, { recursive: true, force: true }); }
});

test("recommendation predicate rejects small originals and admits reviewed large ones", () => {
  assert.match(studio2dAssetRecommendationError({
    recommended: true,
    review: { status: "usable", method: "full-image" },
  }, { width: 899, height: 2048 }) ?? "", /Recommendation/u);
  assert.equal(studio2dAssetRecommendationError({
    recommended: true,
    review: { status: "usable", method: "full-image" },
  }, { width: 1024, height: 1024 }), null);
});

test("contact-sheet-only inspection cannot pass full-image recommendation", () => {
  assert.match(modified((manifest) => { manifest.assets.find((asset) => asset.recommended).review.method = "contact-sheet"; }).errors.join(), /Recommendation/u);
});

test("unverified provenance cannot silently become a commercial license", () => {
  assert.match(modified((manifest) => { manifest.assets[0].provenance.licenseStatus = "commercial"; }).errors.join(), /provenance review/u);
});

test("path traversal and remote paths are rejected before reading", () => {
  for (const src of ["/assets/studio/backgrounds/../../etc/passwd", "https://example.com/asset.png", "/assets/studio/backgrounds/%2e%2e.png"]) {
    assert.match(modified((manifest) => { manifest.assets[0].src = src; }).errors.join(), /Unsafe asset path/u);
  }
});

test("missing declared entries cannot hide unreviewed files", () => {
  assert.match(modified((manifest) => { manifest.assets.pop(); }).errors.join(), /Unreviewed original/u);
});

test("truncated and hostile raster headers fail closed", () => {
  for (const bytes of [Buffer.alloc(0), Buffer.from([255, 216]), Buffer.from([255,216,255,224,0,0]), Buffer.from([255,216,255,192,255,255])]) {
    assert.throws(() => readImageDimensions(bytes));
  }
  assert.throws(() => readPngDimensions(Buffer.alloc(33)));
  const pngAsset = original.assets.find((asset) => asset.mediaType === "image/png");
  const png = Buffer.from(readFileSync(path.join(webPublic, pngAsset.src)));
  png.writeUInt32BE(0xffff_ffff, 16);
  assert.throws(() => readPngDimensions(png), /budget/u);
});

test("format detector reads both existing PNG and JPEG frames", () => {
  for (const asset of original.assets) {
    const dimensions = readImageDimensions(readFileSync(path.join(webPublic, asset.src)));
    assert.deepEqual(dimensions, { width: asset.width, height: asset.height, mediaType: asset.mediaType });
  }
});
