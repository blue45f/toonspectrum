import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { auditStudio2dCc0Assets, readWebpDimensions, STUDIO_2D_CC0_MANIFEST_PATH } from "./studio-2d-cc0-asset-audit.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const root = fileURLToPath(new URL("../", import.meta.url));
const original = JSON.parse(readFileSync(path.join(root, STUDIO_2D_CC0_MANIFEST_PATH), "utf8"));

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(target) : [target];
  });
}
const modified = (change) => {
  const manifest = structuredClone(original);
  change(manifest);
  return auditStudio2dCc0Assets(root, manifest);
};

test("all curated replacement backgrounds match their reviewed CC0 originals", () => {
  const result = auditStudio2dCc0Assets(root);
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.assetCount, 28);
  assert.ok(result.totalBytes > 8_000_000);
});

test("the WebP parser reads every selected 2048 by 1152 frame", () => {
  for (const asset of original.assets) {
    const bytes = readFileSync(path.join(root, "apps/web/public", asset.src));
    assert.deepEqual(readWebpDimensions(bytes), { width: 2048, height: 1152, mediaType: "image/webp" });
  }
});

test("duplicate IDs and sources cannot inflate the replacement catalog", () => {
  assert.equal(modified((manifest) => manifest.assets.push(manifest.assets[0])).ok, false);
  assert.match(modified((manifest) => { manifest.assets[1].src = manifest.assets[0].src; }).errors.join(), /paths|Duplicate/u);
});

test("stale dimensions, bytes, and hashes fail closed", () => {
  assert.match(modified((manifest) => { manifest.assets[0].width = 4096; }).errors.join(), /dimensions/u);
  assert.match(modified((manifest) => { manifest.assets[0].bytes += 1; }).errors.join(), /file size/u);
  assert.match(modified((manifest) => { manifest.assets[0].sha256 = "0".repeat(64); }).errors.join(), /SHA-256/u);
});

test("path traversal and source-manifest substitution are rejected", () => {
  assert.match(modified((manifest) => { manifest.assets[0].src = "/assets/studio/cc0-20260906/assets/../../etc/passwd"; }).errors.join(), /paths/u);
  assert.match(modified((manifest) => { manifest.assets[0].sourceManifest = manifest.assets[1].sourceManifest; }).errors.join(), /paths/u);
});

test("a recommendation requires the recorded full-image review and CC0 provenance", () => {
  assert.match(modified((manifest) => { manifest.assets[0].review.method = "contact-sheet"; }).errors.join(), /review/u);
  assert.match(modified((manifest) => { manifest.assets[0].provenance.licenseStatus = "unverified"; }).errors.join(), /provenance/u);
});

test("truncated, unsupported, or hostile WebP headers are rejected", () => {
  for (const bytes of [Buffer.alloc(0), Buffer.from("RIFF0000WEBP", "ascii"), Buffer.alloc(30)]) assert.throws(() => readWebpDimensions(bytes));
  const bytes = Buffer.from(readFileSync(path.join(root, "apps/web/public", original.assets[0].src)));
  bytes.writeUInt16LE(0x3fff, 26);
  bytes.writeUInt16LE(0x3fff, 28);
  assert.throws(() => readWebpDimensions(bytes), /budget/u);
});

test("retired low-quality backgrounds cannot be referenced by product UI", () => {
  const legacy = JSON.parse(readFileSync(path.join(root, "apps/web/src/domains/creator/studio-2d-asset-manifest.json"), "utf8"));
  const retiredSources = legacy.assets.filter((asset) => !asset.recommended)
    .flatMap((asset) => [asset.src, asset.legacySrc].filter(Boolean));
  const sourceRoot = path.join(root, "apps/web/src");
  const allowed = new Set([
    "domains/creator/studio-bg-scenes.ts",
    "domains/creator/studio-2d-asset-manifest.json",
  ]);
  const offenders = [];
  for (const file of sourceFiles(sourceRoot)) {
    const relative = path.relative(sourceRoot, file).replaceAll(path.sep, "/");
    if (allowed.has(relative) || /(?:^|\/)__snapshots__\//u.test(relative) || /\.test\.[cm]?[jt]sx?$/u.test(relative)) continue;
    if (!/\.(?:css|html|json|[cm]?[jt]sx?)$/u.test(relative)) continue;
    const text = readFileSync(file, "utf8");
    for (const source of retiredSources) if (text.includes(source)) offenders.push(`${relative}: ${source}`);
  }
  assert.deepEqual(offenders, []);
});
