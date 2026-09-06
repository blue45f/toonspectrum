/** Synthetic fixtures only. None of these files is an acquired ACON asset. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, symlink, truncate, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import test from "node:test";
import { canonicalProductUrl, inspectGlb, prepareAconIntake } from "./import-acon-assets.mjs";

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(color = 80) {
  const chunk = (type, payload) => {
    const bytes = Buffer.alloc(payload.length + 12);
    bytes.writeUInt32BE(payload.length); bytes.write(type, 4); payload.copy(bytes, 8);
    bytes.writeUInt32BE(crc32(bytes.subarray(4, bytes.length - 4)), bytes.length - 4);
    return bytes;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(1); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.from([0,color,120,160,255]))), chunk("IEND", Buffer.alloc(0))]);
}
function glb(change = () => {}) {
  const document = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], buffers: [{ byteLength: 36 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0,0,0], max: [1,1,0] }] };
  change(document);
  const raw = Buffer.from(JSON.stringify(document)); const json = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 0x20); raw.copy(json);
  const bin = Buffer.alloc(36); bin.writeFloatLE(1, 12); bin.writeFloatLE(1, 28);
  const bytes = Buffer.alloc(12 + 8 + json.length + 8 + bin.length);
  bytes.writeUInt32LE(0x46546c67); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(json.length, 12); bytes.writeUInt32LE(0x4e4f534a, 16); json.copy(bytes, 20);
  bytes.writeUInt32LE(bin.length, 20 + json.length); bytes.writeUInt32LE(0x004e4942, 24 + json.length); bin.copy(bytes, 28 + json.length);
  return bytes;
}
const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDmaKKK8E9U/9k=", "base64");
const webp = Buffer.from("UklGRjYAAABXRUJQVlA4ICoAAACQAQCdASoCAAIAAUAmJaACdLoAA5gA/vBTH/8gx289vPAH+rsT4T5YAAA=", "base64");
function item(overrides = {}) {
  return { id: "test-original", name: "테스트 원본", creator: "Synthetic fixture", productUrl: "https://www.acon3d.com/ko/product/1000000001", role: "original", category: "background-2d", file: "original.png", license: { name: "Test-only permission", reference: "synthetic-test-fixture-not-a-real-grant" }, ...overrides };
}
function inventory(assets = [item()]) { return { version: 1, provider: "acon", authorizationReference: "test-only-not-an-actual-authorization", assets }; }
async function setup(t) {
  const base = await mkdtemp(path.join(os.tmpdir(), "acon-intake-test-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const sourceDir = path.join(base, "source"); await mkdir(sourceDir); await writeFile(path.join(sourceDir, "original.png"), png());
  return { base, sourceDir, outputDir: path.join(base, "intake") };
}

test("canonicalizes current and legacy product links without retaining tokens", () => {
  for (const url of ["https://acon3d.com/product/123", "https://www.acon3d.com/ko/product/123?token=private#x", "https://www.acon3d.com/en/toon/product/123/"]) {
    assert.deepEqual(canonicalProductUrl(url), { productId: "123", productUrl: "https://www.acon3d.com/ko/product/123" });
  }
});
for (const url of ["http://acon3d.com/product/1", "https://acon3d.com.evil.test/product/1", "https://evil.test/product/1", "https://user:password@acon3d.com/product/1", "https://acon3d.com:444/product/1", "https://acon3d.com/ko/category/334", "https://acon3d.com/product/1/download", "not-a-url"]) {
  test(`rejects non-product or untrusted URL: ${url}`, () => assert.throws(() => canonicalProductUrl(url)));
}
test("inspection performs no writes and preserves explicit attribution", async (t) => {
  const options = await setup(t); const report = await prepareAconIntake({ sourceDir: options.sourceDir, inventory: inventory() });
  assert.equal(report.counts.candidateOriginals, 1); assert.equal(report.counts.published, 0);
  assert.equal(report.records[0].license.name, "Test-only permission"); assert.equal(report.records[0].reviewStatus, "pending");
  assert.equal(existsSync(options.outputDir), false);
});
test("creates byte-identical private snapshots and compatible relative upload manifest", async (t) => {
  const options = await setup(t); const report = await prepareAconIntake({ ...options, inventory: inventory() });
  const manifest = JSON.parse(await readFile(path.join(options.outputDir, "candidate-manifest.json"), "utf8"));
  const bytes = await readFile(path.resolve(options.outputDir, manifest[0].path));
  assert.deepEqual(bytes, png()); assert.deepEqual(await readFile(path.join(options.sourceDir, "original.png")), png());
  assert.equal(createHash("sha256").update(bytes).digest("hex"), report.records[0].sha256);
  assert.equal(manifest[0].subtype, "image"); assert.equal(manifest[0].category, "background"); assert.ok(Number.isInteger(manifest[0].seed));
  assert.equal(existsSync(path.join(options.outputDir, ".incomplete")), false);
  assert.deepEqual(JSON.parse(await readFile(path.join(options.outputDir, "provenance.json"), "utf8")), report);
});
test("never overwrites an existing intake or old manifest", async (t) => {
  const options = await setup(t); await mkdir(options.outputDir); await writeFile(path.join(options.outputDir, "candidate-manifest.json"), "keep");
  await assert.rejects(prepareAconIntake({ ...options, inventory: inventory() }), /EEXIST/u);
  assert.equal(await readFile(path.join(options.outputDir, "candidate-manifest.json"), "utf8"), "keep");
});
test("rejects output nested under the source directory", async (t) => {
  const options = await setup(t);
  await assert.rejects(prepareAconIntake({ ...options, outputDir: path.join(options.sourceDir, "output"), inventory: inventory() }), /outside/u);
});
test("exact byte duplicates do not inflate original or product counts", async (t) => {
  const options = await setup(t); await writeFile(path.join(options.sourceDir, "copy.png"), png());
  const report = await prepareAconIntake({ ...options, inventory: inventory([item(), item({ id: "copy", file: "copy.png" })]) });
  assert.equal(report.counts.candidateOriginals, 1); assert.equal(report.counts.duplicates, 1); assert.equal(report.counts.candidateProducts, 1);
  assert.equal(report.records[1].duplicateOf, "test-original");
});
test("distinct files in one product remain independent originals, not extra products", async (t) => {
  const options = await setup(t); await writeFile(path.join(options.sourceDir, "second.png"), png(90));
  const report = await prepareAconIntake({ ...options, inventory: inventory([item(), item({ id: "second", file: "second.png" })]) });
  assert.equal(report.counts.candidateOriginals, 2); assert.equal(report.counts.candidateProducts, 1);
});
test("duplicate IDs are rejected rather than treated as original variants", async (t) => {
  const options = await setup(t); const report = await prepareAconIntake({ ...options, inventory: inventory([item(), item()]) });
  assert.equal(report.counts.candidateOriginals, 1); assert.equal(report.counts.rejected, 1);
});
for (const file of ["../outside.png", "/etc/passwd", "a/../original.png", "C:\\original.png", "a//original.png", "./original.png"]) {
  test(`rejects unsafe source path: ${file}`, async (t) => {
    const options = await setup(t); const report = await prepareAconIntake({ ...options, inventory: inventory([item({ file })]) });
    assert.equal(report.counts.rejected, 1); assert.equal(report.counts.candidateOriginals, 0);
  });
}
test("rejects symlink files and directories", async (t) => {
  const options = await setup(t); await symlink(path.join(options.sourceDir, "original.png"), path.join(options.sourceDir, "link.png"));
  await symlink(options.sourceDir, path.join(options.sourceDir, "linkdir"));
  const report = await prepareAconIntake({ ...options, inventory: inventory([item({ id: "leaf", file: "link.png" }), item({ id: "parent", file: "linkdir/original.png" })]) });
  assert.equal(report.counts.rejected, 2); assert.ok(report.records.every((record) => record.reason.includes("symbolic links")));
});
test("rejects source root symlink", async (t) => {
  const options = await setup(t); const link = path.join(options.base, "link"); await symlink(options.sourceDir, link);
  await assert.rejects(prepareAconIntake({ sourceDir: link, inventory: inventory() }), /symbolic link/u);
});
for (const overrides of [{ role: "preview" }, { license: null }, { creator: "" }, { category: "__proto__" }, { id: "../../bad" }, { category: "prop-3d" }, { file: "missing.png" }]) {
  test(`rejects invalid attribution/format metadata: ${JSON.stringify(overrides)}`, async (t) => {
    const options = await setup(t); const report = await prepareAconIntake({ ...options, inventory: inventory([item(overrides)]) }); assert.equal(report.counts.rejected, 1);
  });
}
test("unsupported authoring formats and archives are retained, not falsely converted", async (t) => {
  const options = await setup(t); const assets = [];
  for (const ext of ["skp", "sut", "fbx", "zip", "psd", "wav", "ttf"]) {
    await writeFile(path.join(options.sourceDir, `original.${ext}`), "synthetic source data");
    assets.push(item({ id: ext, file: `original.${ext}` }));
  }
  const report = await prepareAconIntake({ ...options, inventory: inventory(assets) });
  assert.equal(report.counts.conversionRequired, 7); assert.equal(report.counts.candidateOriginals, 0);
  assert.deepEqual(JSON.parse(await readFile(path.join(options.outputDir, "candidate-manifest.json"), "utf8")), []);
});
test("rejects executable and oversized files before copying", async (t) => {
  const options = await setup(t); await writeFile(path.join(options.sourceDir, "bad.exe"), "MZ");
  await writeFile(path.join(options.sourceDir, "large.png"), ""); await truncate(path.join(options.sourceDir, "large.png"), 128 * 1024 * 1024 + 1);
  const report = await prepareAconIntake({ ...options, inventory: inventory([item({ id: "exe", file: "bad.exe" }), item({ id: "large", file: "large.png" })]) }); assert.equal(report.counts.rejected, 2);
});
test("accepts genuine PNG, JPEG and WebP envelopes and dimensions", async (t) => {
  const options = await setup(t); await writeFile(path.join(options.sourceDir, "sample.jpg"), jpeg); await writeFile(path.join(options.sourceDir, "sample.webp"), webp);
  const report = await prepareAconIntake({ ...options, inventory: inventory([item(), item({ id: "jpeg", file: "sample.jpg" }), item({ id: "webp", file: "sample.webp" })]) });
  assert.equal(report.counts.candidateOriginals, 3, JSON.stringify(report.records)); assert.deepEqual(report.records.map((record) => record.width), [1, 2, 2]);
});
test("rejects renamed, truncated and over-budget image containers", async (t) => {
  const options = await setup(t); const huge = png(); huge.writeUInt32BE(65536, 16);
  const fixtures = { "renamed.png": Buffer.from("not a png"), "truncated.png": png().subarray(0, 40), "huge.png": huge, "bad.jpg": Buffer.from([255,216,255,217]), "bad.webp": webp.subarray(0, 29) };
  const assets = [];
  for (const [file, bytes] of Object.entries(fixtures)) { await writeFile(path.join(options.sourceDir, file), bytes); assets.push(item({ id: file.replace(".", "-"), file })); }
  const report = await prepareAconIntake({ ...options, inventory: inventory(assets) }); assert.equal(report.counts.rejected, 5);
});
test("reads GLB JSON at byte 20 and distinguishes VRM from background models", () => {
  assert.deepEqual(inspectGlb(glb()), { subtype: "background3d", meshes: 1 });
  assert.equal(inspectGlb(glb((doc) => { doc.extensions = { VRMC_vrm: { specVersion: "1.0" } }; })).subtype, "vrm");
  assert.equal(inspectGlb(glb((doc) => { doc.extensions = { VRM: {} }; })).subtype, "vrm");
});
for (const [label, mutate] of [
  ["external texture", (doc) => { doc.images = [{ uri: "https://example.test/texture.png" }]; }],
  ["relative texture", (doc) => { doc.images = [{ uri: "texture.png" }]; }],
  ["missing buffer", (doc) => { doc.buffers[0].byteLength = 9999; }],
  ["buffer view overflow", (doc) => { doc.bufferViews[0].byteOffset = 100; }],
  ["empty scene", (doc) => { doc.meshes = []; }],
  ["unsupported glTF version", (doc) => { doc.asset.version = "1.0"; }],
]) test(`rejects GLB ${label}`, () => assert.throws(() => inspectGlb(glb(mutate))));
test("rejects truncated and misaligned GLB containers", () => {
  const short = glb().subarray(0, 30); assert.throws(() => inspectGlb(short));
  const badLength = glb(); badLength.writeUInt32LE(5, 12); assert.throws(() => inspectGlb(badLength));
  const badType = glb(); badType.writeUInt32LE(0x004e4942, 16); assert.throws(() => inspectGlb(badType));
});
test("only real VRM extension data can qualify a .vrm original", async (t) => {
  const options = await setup(t); await writeFile(path.join(options.sourceDir, "bad.vrm"), glb());
  await writeFile(path.join(options.sourceDir, "avatar.vrm"), glb((doc) => { doc.extensions = { VRMC_vrm: { specVersion: "1.0" } }; }));
  const report = await prepareAconIntake({ ...options, inventory: inventory([item({ id: "bad", file: "bad.vrm", category: "character-3d" }), item({ id: "avatar", file: "avatar.vrm", category: "character-3d" })]) });
  assert.equal(report.counts.rejected, 1); assert.equal(report.counts.candidateOriginals, 1); assert.equal(report.records[1].subtype, "vrm");
});
test("accepts embedded data resources but rejects active resource types", () => {
  assert.equal(inspectGlb(glb((doc) => { doc.images = [{ uri: `data:image/png;base64,${png().toString("base64")}` }]; })).subtype, "background3d");
  assert.throws(() => inspectGlb(glb((doc) => { doc.images = [{ uri: "data:image/svg+xml;base64,PHN2Zz4=" }]; })));
});
test("invalid or empty inventory cannot report successful completion", async (t) => {
  const options = await setup(t);
  for (const value of [null, {}, inventory([]), { ...inventory(), authorizationReference: "" }, { ...inventory(), provider: "other" }]) await assert.rejects(prepareAconIntake({ ...options, inventory: value }));
});
test("CLI reports success, partial intake, empty candidates and invalid arguments distinctly", async (t) => {
  const options = await setup(t); const script = fileURLToPath(new URL("./import-acon-assets.mjs", import.meta.url));
  const inventoryPath = path.join(options.base, "inventory.json");
  const run = (args = []) => spawnSync(process.execPath, [script, "--source-dir", options.sourceDir, "--inventory", inventoryPath, ...args], { encoding: "utf8" });
  await writeFile(inventoryPath, JSON.stringify(inventory())); assert.equal(run().status, 0);
  await writeFile(inventoryPath, JSON.stringify(inventory([item(), item({ id: "bad", file: "missing.png" })]))); assert.equal(run().status, 2);
  await writeFile(inventoryPath, JSON.stringify(inventory([item({ file: "missing.png" })]))); assert.equal(run().status, 3);
  assert.equal(run(["--unknown", "x"]).status, 1); assert.equal(run(["--source-dir", options.sourceDir]).status, 1);
  assert.equal(spawnSync(process.execPath, [script, "--help"]).status, 0);
});
test("5000 inventory entries are processed without inflating identical originals", async (t) => {
  const options = await setup(t);
  const assets = Array.from({ length: 5000 }, (_, index) => item({ id: `bulk-${index}` }));
  const report = await prepareAconIntake({ ...options, inventory: inventory(assets) });
  assert.equal(report.counts.listed, 5000); assert.equal(report.counts.candidateOriginals, 1); assert.equal(report.counts.duplicates, 4999);
});
test("malformed binary inputs always fail closed without a fabricated candidate", async (t) => {
  const options = await setup(t); const assets = [];
  for (let index = 0; index < 64; index += 1) {
    const ext = ["png", "jpg", "webp", "glb"][index % 4]; const file = `malformed-${index}.${ext}`;
    await writeFile(path.join(options.sourceDir, file), Buffer.alloc(index + 1, index));
    assets.push(item({ id: `bad-${index}`, file, category: ext === "glb" ? "background-3d" : "background-2d" }));
  }
  const report = await prepareAconIntake({ ...options, inventory: inventory(assets) });
  assert.equal(report.counts.rejected, 64); assert.equal(report.counts.candidateOriginals, 0); assert.equal(report.counts.published, 0);
});
