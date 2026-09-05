import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prepareAuthorizedImport, SOURCE_SCHEMA, validateSourceManifest, runCli } from "./import-authorized-assets.mjs";

// The same contracts execute both locally without dependencies and in root Vitest CI.
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=", "base64");
function manifest(files = [{ path: "asset.png", role: "asset" }]) {
  return { schema: SOURCE_SCHEMA, authorization: { reference: "TEST-ONLY-PERMISSION", scope: "private-workspace", redistributionAllowed: false },
    products: [{ id: "1444", title: "테스트 원본", sourceUrl: "https://dontdraw.com/itemDetail.html?pdIdx=1444", category: "prop", files }] };
}
async function fixture(run, input = manifest()) {
  const base = await mkdtemp(path.join(os.tmpdir(), "dontdraw-test-"));
  const sourceDir = path.join(base, "source");
  const outputDir = path.join(base, "output");
  await mkdir(sourceDir);
  await writeFile(path.join(sourceDir, "asset.png"), PNG);
  await writeFile(path.join(sourceDir, "source.json"), JSON.stringify(input));
  const options = { sourceDir, outputDir, manifestPath: "source.json" };
  try { return await run({ base, sourceDir, outputDir, options }); }
  finally { await rm(base, { recursive: true, force: true }); }
}
function glb(extra = {}) {
  const document = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }], buffers: [{ byteLength: 36 }], ...extra };
  const raw = JSON.stringify(document);
  const json = Buffer.from(raw.padEnd(Math.ceil(Buffer.byteLength(raw) / 4) * 4));
  const binary = Buffer.alloc(36);
  binary.writeFloatLE(1, 12);
  binary.writeFloatLE(1, 28);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + 8 + binary.length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(json.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binary.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, json, binHeader, binary]);
}

test("dry run leaves no output and never claims website completeness or publication", async () => fixture(async ({ options, outputDir }) => {
  const result = await prepareAuthorizedImport(options);
  assert.equal(result.report.counts.ready, 1);
  assert.equal(result.report.counts.published, 0);
  assert.equal(result.report.websiteInventoryComplete, false);
  assert.equal(result.report.visualReview, "not-performed");
  assert.equal(result.report.authorization.verification, "operator-attested");
  await assert.rejects(access(outputDir));
}));

test("staged manifest resolves relative to the existing upload CLI and preserves provenance", async () => fixture(async ({ options, outputDir }) => {
  const result = await prepareAuthorizedImport({ ...options, write: true });
  const ready = path.join(outputDir, "ready");
  const staged = JSON.parse(await readFile(path.join(ready, "manifest.json"), "utf8"));
  assert.deepEqual(staged, result.manifest);
  assert.deepEqual(await readFile(path.resolve(ready, staged[0].path)), PNG);
  assert.equal(staged[0].provenance.sha256, createHash("sha256").update(PNG).digest("hex"));
  assert.equal(staged[0].subtype, "image");
  assert.equal(staged[0].category, "prop");
  assert.deepEqual(await readdir(outputDir), ["ready"]);
  assert.equal(JSON.parse(await readFile(path.join(ready, "intake-report.json"))).counts.published, 0);
}));

test("duplicates do not inflate asset counts", async () => fixture(async ({ options, sourceDir }) => {
  await writeFile(path.join(sourceDir, "duplicate.png"), PNG);
  const { report, manifest: entries } = await prepareAuthorizedImport(options);
  assert.equal(report.counts.ready, 1);
  assert.equal(report.counts.duplicates, 1);
  assert.equal(entries.length, 1);
  assert.equal(report.records.find((record) => record.status === "duplicate").duplicateOf, report.records.find((record) => record.status === "ready-for-review").id);
}, manifest([{ path: "asset.png", role: "asset" }, { path: "duplicate.png", role: "asset" }])));

test("previews, sources and unsupported files are never uploaded as originals", async () => fixture(async ({ options, sourceDir }) => {
  await writeFile(path.join(sourceDir, "source.skp"), "synthetic native-format test fixture");
  const { report, manifest: entries } = await prepareAuthorizedImport(options);
  assert.equal(report.counts.excludedPreviews, 1);
  assert.equal(report.counts.conversionRequired, 2);
  assert.equal(report.counts.unsupported, 2);
  assert.equal(entries.length, 0);
}, manifest([{ path: "preview.png", role: "preview" }, { path: "asset.png", role: "source" },
  { path: "source.skp", role: "asset" }, { path: "installer.exe", role: "asset" }, { path: "package.zip", role: "asset" }])));

test("SKP and CS3O require real conversion, not filename changes", async () => fixture(async ({ options, sourceDir }) => {
  await writeFile(path.join(sourceDir, "native.cs3o"), "synthetic Clip Studio fixture");
  const result = await prepareAuthorizedImport(options);
  assert.equal(result.report.counts.conversionRequired, 1);
  assert.equal(result.report.counts.ready, 0);
}, manifest([{ path: "native.cs3o", role: "asset" }])));

for (const [label, mutate] of [
  ["malformed PNG", async (sourceDir) => writeFile(path.join(sourceDir, "asset.png"), "not an image")],
  ["missing file", async (sourceDir) => rm(path.join(sourceDir, "asset.png"))],
  ["empty file", async (sourceDir) => writeFile(path.join(sourceDir, "asset.png"), "")],
]) test(`${label} is reported and prevents partial staging`, async () => fixture(async ({ options, sourceDir, outputDir }) => {
  await mutate(sourceDir);
  assert.equal((await prepareAuthorizedImport(options)).report.counts.invalid, 1);
  await assert.rejects(prepareAuthorizedImport({ ...options, write: true }), /invalid files/u);
  await assert.rejects(access(outputDir));
}));

test("SHA-256 mismatch is never accepted", async () => fixture(async ({ options }) => {
  const result = await prepareAuthorizedImport(options);
  assert.equal(result.report.counts.invalid, 1);
  assert.match(result.report.records[0].reason, /SHA-256 mismatch/u);
}, manifest([{ path: "asset.png", role: "asset", sha256: "0".repeat(64) }])));

test("source symlinks are rejected even when the target is inside source", async () => fixture(async ({ options, sourceDir }) => {
  await symlink(path.join(sourceDir, "asset.png"), path.join(sourceDir, "link.png"));
  assert.equal((await prepareAuthorizedImport(options)).report.counts.invalid, 1);
}, manifest([{ path: "link.png", role: "asset" }])));

test("source manifest symlinks are rejected", async () => fixture(async ({ options, sourceDir }) => {
  await symlink(path.join(sourceDir, "source.json"), path.join(sourceDir, "link.json"));
  await assert.rejects(prepareAuthorizedImport({ ...options, manifestPath: "link.json" }), /symlinks/u);
}));

test("existing output is preserved rather than overwritten", async () => fixture(async ({ options, outputDir }) => {
  await mkdir(outputDir);
  await writeFile(path.join(outputDir, "keep.txt"), "existing user data");
  await assert.rejects(prepareAuthorizedImport({ ...options, write: true }), /EEXIST/u);
  assert.equal(await readFile(path.join(outputDir, "keep.txt"), "utf8"), "existing user data");
}));

test("output cannot overlap source", async () => fixture(async ({ options, sourceDir }) => {
  await assert.rejects(prepareAuthorizedImport({ ...options, outputDir: path.join(sourceDir, "out"), write: true }), /overlap/u);
}));

test("output-parent symlinks cannot bypass source-overlap protection", async () => fixture(async ({ options, sourceDir, base }) => {
  await symlink(sourceDir, path.join(base, "alias"));
  await assert.rejects(prepareAuthorizedImport({ ...options, outputDir: path.join(base, "alias", "out"), write: true }), /overlap/u);
  await assert.rejects(access(path.join(sourceDir, "out")));
}));

test("empty input is reported as zero and cannot produce a staged asset pack", async () => fixture(async ({ options }) => {
  assert.equal((await prepareAuthorizedImport(options)).report.counts.ready, 0);
  await assert.rejects(prepareAuthorizedImport({ ...options, write: true }), /No compatible/u);
}, { ...manifest(), products: [] }));

for (const unsafe of ["../asset.png", "/asset.png", "a/../../asset.png", "C:\\asset.png", "a//b.png", "./asset.png", "a/%2e%2e/b.png"]) {
  test(`reject unsafe manifest path: ${unsafe}`, () => assert.throws(() => validateSourceManifest(manifest([{ path: unsafe, role: "asset" }])), /Unsafe source path/u));
}

test("CLI manifest path cannot escape the source root", async () => fixture(async ({ options }) => {
  await assert.rejects(prepareAuthorizedImport({ ...options, manifestPath: "../source/source.json" }), /Unsafe/u);
}));

test("public redistribution requires explicit authorization; no CC0 is inferred", () => {
  const input = manifest();
  input.authorization.scope = "public-library";
  assert.throws(() => validateSourceManifest(input), /redistribution authorization/u);
  input.authorization.redistributionAllowed = true;
  assert.equal(validateSourceManifest(input).authorization.scope, "public-library");
  assert.equal(validateSourceManifest(input).authorization.verification, "operator-attested");
});

for (const [label, mutate] of [
  ["schema", (input) => { input.schema = "wrong"; }],
  ["source URL", (input) => { input.products[0].sourceUrl = "https://dontdraw.com/itemDetail.html?pdIdx=999"; }],
  ["duplicate ID", (input) => { input.products.push(structuredClone(input.products[0])); }],
  ["role", (input) => { input.products[0].files[0].role = "unknown"; }],
  ["category", (input) => { input.products[0].category = "unknown"; }],
  ["hash", (input) => { input.products[0].files[0].sha256 = "invalid"; }],
  ["permission reference", (input) => { input.authorization.reference = ""; }],
]) test(`invalid ${label} fails manifest validation`, () => {
  const input = manifest();
  mutate(input);
  assert.throws(() => validateSourceManifest(input));
});

test("embedded GLB is staged as actual 3D, not a preview", async () => fixture(async ({ options, sourceDir }) => {
  await writeFile(path.join(sourceDir, "model.glb"), glb());
  const result = await prepareAuthorizedImport({ ...options, write: true });
  assert.equal(result.report.counts.ready, 1);
  assert.equal(result.manifest[0].subtype, "background3d");
}, manifest([{ path: "model.glb", role: "asset" }])));

for (const [label, bytes] of [
  ["external texture", glb({ images: [{ uri: "https://example.test/texture.png" }] })],
  ["extension URI", glb({ extensions: { unknown: { uri: "file:///private" } } })],
  ["missing mesh", glb({ meshes: [] })],
  ["truncated GLB", glb().subarray(0, 32)],
]) test(`reject ${label} without any network requests`, async () => fixture(async ({ options, sourceDir }) => {
  await writeFile(path.join(sourceDir, "model.glb"), bytes);
  assert.equal((await prepareAuthorizedImport(options)).report.counts.invalid, 1);
}, manifest([{ path: "model.glb", role: "asset" }])));

test("malformed command options fail closed", async () => {
  await assert.rejects(runCli([]), /source-dir/u);
  await assert.rejects(runCli(["--download-everything"]), /Unknown option/u);
  await assert.rejects(runCli(["--source-dir"]), /missing value/u);
});
