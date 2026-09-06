import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { buildAssetId, detectVrmModelFromGlb, makeFormData, resolveAssetKind } from "./upload-toonstudio-3d-assets.mts";

// Register the same assertions with the repository runner and dependency-free Node.
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const exec = promisify(execFile);
const scriptUrl = new URL("./upload-toonstudio-3d-assets.mts", import.meta.url);
const scriptPath = fileURLToPath(scriptUrl);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=", "base64");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function glb(document = {}, binLength = 0) {
  const json = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, ...document }));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
  json.copy(padded);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + padded.length + (binLength ? 8 + binLength : 0), 8);
  header.writeUInt32LE(padded.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const parts = [header, padded];
  if (binLength) {
    const bin = Buffer.alloc(8 + binLength);
    bin.writeUInt32LE(binLength, 0);
    bin.writeUInt32LE(0x004e4942, 4);
    parts.push(bin);
  }
  return Buffer.concat(parts);
}

function plan(filePath = "/fixtures/asset.glb", extra = {}) {
  return { path: filePath, sourcePath: path.basename(filePath), name: "asset", category: "prop", ...extra };
}

for (const size of [0, 1, 7, 68, 1024, 4095, 4096, 8192, 65536]) {
  test(`multipart preserves exactly ${size} bytes and its SHA-256`, async () => {
    const bytes = Uint8Array.from({ length: size }, (_, index) => index % 251);
    const form = makeFormData(bytes, "fixture.png", "image", "fixture-id");
    const file = form.get("file");
    assert.ok(file instanceof Blob);
    assert.equal(file.size, bytes.length);
    assert.equal(file.name, "fixture.png");
    assert.equal(hash(new Uint8Array(await file.arrayBuffer())), hash(bytes));
    assert.equal(form.get("elementType"), "image");
    assert.equal(JSON.parse(form.get("descriptor")).element.id, "fixture-id");
  });
}

test("multipart preserves an offset view without either neighbouring sentinel", async () => {
  const backing = Buffer.alloc(1024, 0xa5);
  const bytes = backing.subarray(117, 186);
  bytes.fill(0x37);
  const file = makeFormData(bytes, "slice.glb", "background3d", "slice").get("file");
  assert.equal(file.size, 69);
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), new Uint8Array(bytes));
  assert.equal(file.type, "model/gltf-binary");
});

test("multipart snapshots bytes rather than retaining mutable input", async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const file = makeFormData(bytes, "snapshot.png", "image", "snapshot").get("file");
  bytes.fill(9);
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), new Uint8Array([1, 2, 3]));
});

for (const marker of ["VRM", "VRMC_vrm"]) {
  test(`GLB detects ${marker} in extensionsUsed`, () => {
    assert.equal(detectVrmModelFromGlb(glb({ extensionsUsed: [marker] })), true);
  });
  test(`GLB detects ${marker} in top-level extensions with a BIN chunk`, () => {
    assert.equal(detectVrmModelFromGlb(glb({ extensions: { [marker]: {} } }, 36)), true);
  });
}

test("GLB accepts an offset Uint8Array view", () => {
  const bytes = glb({ extensionsUsed: ["VRMC_vrm"] });
  const storage = Buffer.alloc(bytes.length + 128, 0xa5);
  bytes.copy(storage, 37);
  assert.equal(detectVrmModelFromGlb(storage.subarray(37, 37 + bytes.length)), true);
});

test("GLB does not mistake an ordinary scene or a name for a VRM marker", () => {
  assert.equal(detectVrmModelFromGlb(glb()), false);
  assert.equal(detectVrmModelFromGlb(glb({ name: "VRMC_vrm", extensionsUsed: ["OTHER"] })), false);
});

for (const [name, mutate] of [
  ["bad magic", (b) => { b.writeUInt32LE(0, 0); }],
  ["wrong container version", (b) => { b.writeUInt32LE(1, 4); }],
  ["short declared total", (b) => { b.writeUInt32LE(b.length - 4, 8); }],
  ["long declared total", (b) => { b.writeUInt32LE(b.length + 4, 8); }],
  ["wrong first chunk type", (b) => { b.writeUInt32LE(0x004e4942, 16); }],
  ["zero JSON length", (b) => { b.writeUInt32LE(0, 12); }],
  ["unaligned JSON length", (b) => { b.writeUInt32LE(7, 12); }],
  ["unsigned oversized JSON length", (b) => { b.writeUInt32LE(0xfffffff0, 12); }],
  ["invalid JSON", (b) => { b[20] = 0x21; }],
  ["invalid UTF-8", (b) => { b[b.indexOf("fixture")] = 0xff; }],
]) {
  test(`GLB declines ${name} without throwing`, () => {
    const bytes = glb({ name: "fixture", extensionsUsed: ["VRMC_vrm"] });
    mutate(bytes);
    assert.equal(detectVrmModelFromGlb(bytes), false);
  });
}

test("GLB declines every truncated prefix and non-object JSON", () => {
  const bytes = glb({ extensionsUsed: ["VRMC_vrm"] });
  for (let end = 0; end < bytes.length; end += 1) {
    assert.equal(detectVrmModelFromGlb(bytes.subarray(0, end)), false, `prefix ${end}`);
  }
  assert.equal(detectVrmModelFromGlb(glb({ asset: { version: "1.0" }, extensionsUsed: ["VRM"] })), false);
  for (const raw of ["null", "[]  ", "true"]) {
    const bytes = Buffer.alloc(24);
    bytes.writeUInt32LE(0x46546c67, 0);
    bytes.writeUInt32LE(2, 4);
    bytes.writeUInt32LE(24, 8);
    bytes.writeUInt32LE(4, 12);
    bytes.writeUInt32LE(0x4e4f534a, 16);
    bytes.write(raw, 20);
    assert.equal(detectVrmModelFromGlb(bytes), false);
  }
});

test("auto classification recognises a VRM stored in .glb", () => {
  assert.equal(resolveAssetKind(plan(), "auto", glb({ extensionsUsed: ["VRMC_vrm"] }), true), "vrm");
});

test("classification keeps existing explicit subtype, override, no-probe and file-extension contracts", () => {
  const bytes = glb({ extensionsUsed: ["VRMC_vrm"] });
  assert.equal(resolveAssetKind(plan(), "auto", bytes, false), "background3d");
  assert.equal(resolveAssetKind(plan(), "image", bytes, true), "image");
  // Merged contract (#787): an explicit --type wins over manifest metadata; a manifest subtype applies in auto mode.
  assert.equal(resolveAssetKind(plan("/a.glb", { subtype: "background3d" }), "vrm", bytes, true), "vrm");
  assert.equal(resolveAssetKind(plan("/a.glb", { subtype: "image" }), "auto", bytes, true), "image");
  assert.equal(resolveAssetKind(plan("/a.vrm"), "auto", bytes, false), "vrm");
  assert.equal(resolveAssetKind(plan("/a.PNG"), "auto", PNG, true), "image");
});

test("non-colliding IDs and the first collision retain their existing identity", () => {
  const item = plan("/fixtures/a.png", { name: "Café mug", category: "Food", seed: 42 });
  const used = new Set();
  assert.equal(buildAssetId(item, 0, used), "food-cafe-mug-seed-42");
  const suffix = hash(item.path + 0).slice(0, 6);
  assert.equal(buildAssetId(item, 0, used), `food-cafe-mug-seed-42-${suffix}`);
});

test("long-name repeated collisions terminate and remain unique", async () => {
  const code = `
    import { buildAssetId } from ${JSON.stringify(scriptUrl.href)};
    const item = { path: '/fixture/a.glb', sourcePath: 'a.glb', name: 'a'.repeat(200), category: 'prop' };
    const used = new Set();
    for (let i = 0; i < 250; i++) {
      const id = buildAssetId(item, 0, used);
      if (id.length > 120 || !/^[a-z0-9_.-]+$/.test(id)) throw Error('invalid ID');
    }
    if (used.size !== 250) throw Error('duplicate ID');
    console.log(used.size);
  `;
  const { stdout } = await exec(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", code], { timeout: 3000 });
  assert.equal(stdout.trim(), "250");
});

test("module import is inert and makes no requests", async () => {
  const code = `globalThis.fetch = () => { throw Error('unexpected request'); }; await import(${JSON.stringify(scriptUrl.href)}); console.log('import-only');`;
  const { stdout } = await exec(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", code], { timeout: 3000 });
  assert.equal(stdout.trim(), "import-only");
});

test("CLI dry-run stays offline even with auto-demo-login requested", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "studio-upload-dry-"));
  try {
    const manifest = path.join(directory, "manifest.json");
    await writeFile(manifest, JSON.stringify([{ path: "not-read.png", name: "fixture" }]));
    const { stdout } = await exec(process.execPath, ["--experimental-strip-types", scriptPath, "--manifest", manifest, "--base-url", "http://127.0.0.1:1", "--auto-demo-login", "--dry-run"], { timeout: 3000 });
    assert.match(stdout, /DRY-RUN/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("real CLI multipart request preserves PNG and GLB bytes against a loopback fixture", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "studio-upload-http-"));
  const requests = [];
  const failures = [];
  const server = createServer(async (request, response) => {
    try {
      requests.push({ method: request.method, url: request.url });
      response.setHeader("content-type", "application/json");
      if (request.method === "GET" && request.url === "/api/creator/works/fixture") {
        response.end(JSON.stringify({ id: "fixture" }));
        return;
      }
      assert.equal(request.method, "PUT");
      assert.match(request.url, /^\/api\/creator\/works\/fixture\/assets\//u);
      assert.equal(request.headers["x-user-id"], "local-test-only");
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const form = await new Request("http://127.0.0.1/fixture", {
        method: "PUT", headers: { "content-type": request.headers["content-type"] }, body: Buffer.concat(chunks),
      }).formData();
      const file = form.get("file");
      const expected = file.name === "asset.png" ? PNG : vrm;
      assert.equal(file.size, expected.length);
      assert.equal(hash(new Uint8Array(await file.arrayBuffer())), hash(expected));
      assert.equal(form.get("elementType"), file.name === "asset.png" ? "image" : "vrm");
      assert.equal(JSON.parse(form.get("descriptor")).element.type, form.get("elementType"));
      const assetId = request.url.slice(request.url.lastIndexOf("/") + 1);
      response.end(JSON.stringify({ verified: true, assetId }));
    } catch (error) {
      failures.push(error);
      response.statusCode = 400;
      response.end(JSON.stringify({ error: "fixture assertion failed" }));
    }
  });
  const vrm = glb({ extensionsUsed: ["VRMC_vrm"] }, 36);
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const port = server.address().port;
    await writeFile(path.join(directory, "asset.png"), PNG);
    await writeFile(path.join(directory, "avatar.glb"), vrm);
    const manifest = path.join(directory, "manifest.json");
    await writeFile(manifest, JSON.stringify([
      { path: "asset.png", name: "fixture-image", category: "prop" },
      { path: "avatar.glb", name: "fixture-avatar", category: "character" },
    ]));
    const result = await exec(process.execPath, ["--experimental-strip-types", scriptPath,
      "--manifest", manifest, "--base-url", `http://127.0.0.1:${port}`,
      "--session-token", "local-test-only", "--work-id", "fixture", "--concurrency", "2"], { timeout: 10000 });
    assert.equal(failures.length, 0);
    assert.match(result.stdout, /업로드: 2/u);
    assert.match(result.stdout, /실패: 0/u);
    assert.equal(requests.length, 3);
  } finally {
    server.closeAllConnections();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
