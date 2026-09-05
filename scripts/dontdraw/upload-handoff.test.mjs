import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildAssetId, detectVrmModelFromGlb, hasExistingAsset, loadManifest, makeFormData, resolveAssetKind,
} from "../upload-toonstudio-3d-assets.mts";
import { prepareAuthorizedImport, SOURCE_SCHEMA } from "./import-authorized-assets.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const CLI = fileURLToPath(new URL("../upload-toonstudio-3d-assets.mts", import.meta.url));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=", "base64");
const plan = (fields = {}) => ({ name: "test", path: "/test.glb", sourcePath: "test.glb", category: "prop", ...fields });

function chunk(type, bytes) {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(bytes.length, 0);
  header.writeUInt32LE(type, 4);
  return Buffer.concat([header, bytes]);
}
function glb(doc = { asset: { version: "2.0" }, extensionsUsed: ["VRMC_vrm"] }, extras = []) {
  const raw = Buffer.from(JSON.stringify(doc));
  const json = Buffer.concat([raw, Buffer.alloc((4 - raw.length % 4) % 4, 32)]);
  const chunks = Buffer.concat([chunk(0x4e4f534a, json), ...extras]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + chunks.length, 8);
  return Buffer.concat([header, chunks]);
}
function cli(args) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (key.startsWith("STUDIO_") || ["API_BASE_URL", "NEST_API_URL"].includes(key)) delete env[key];
    }
    const child = spawn(process.execPath, ["--experimental-strip-types", CLI, ...args], {
      cwd: os.tmpdir(), env, stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("CLI timeout")); }, 10000);
    child.stdout.on("data", (bytes) => { stdout += bytes; });
    child.stderr.on("data", (bytes) => { stderr += bytes; });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}
async function fixture(run) {
  const base = await mkdtemp(path.join(os.tmpdir(), "upload-handoff-"));
  try { return await run(base); } finally { await rm(base, { recursive: true, force: true }); }
}
async function serverFixture(run, existingStatus = 404) {
  const requests = [];
  let handlerError;
  const server = createServer(async (req, res) => {
    try {
      const entry = { method: req.method, url: req.url };
      requests.push(entry);
      if (req.method === "GET") {
        res.writeHead(req.url.includes("/assets/") ? existingStatus : 200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id: "test-work", message: "test response" }));
        return;
      }
      const pieces = [];
      for await (const piece of req) pieces.push(piece);
      const form = await new Response(Buffer.concat(pieces), { headers: { "content-type": req.headers["content-type"] } }).formData();
      const file = form.get("file");
      Object.assign(entry, { filename: file.name, bytes: new Uint8Array(await file.arrayBuffer()),
        descriptor: JSON.parse(form.get("descriptor")), elementType: form.get("elementType") });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ assetId: entry.descriptor.element.id }));
    } catch (error) {
      handlerError = error;
      res.writeHead(500); res.end("test handler failed");
    }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  try {
    await run(`http://127.0.0.1:${server.address().port}`, requests);
    if (handlerError) throw handlerError;
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

for (const length of [0, 3, 64, 4095, 8193]) test(`multipart preserves exactly ${length} bytes`, async () => {
  const input = Uint8Array.from({ length }, (_, index) => index % 251);
  const file = makeFormData(input, "fixture.png", "image", "test-id").get("file");
  assert.equal(file.size, input.length);
  assert.equal(hash(new Uint8Array(await file.arrayBuffer())), hash(input));
});

test("a nonzero-offset view excludes surrounding sentinel bytes and snapshots mutations", async () => {
  const backing = Buffer.alloc(10000, 0xaa);
  const view = backing.subarray(31, 98);
  view.fill(0x42);
  const form = makeFormData(view, "fixture.png", "image", "test-id");
  view.fill(0xff);
  const request = new Request("https://example.invalid/never-sent", { method: "PUT", body: form });
  const received = await request.formData();
  assert.deepEqual(Buffer.from(await received.get("file").arrayBuffer()), Buffer.alloc(67, 0x42));
});

for (const kind of ["image", "vrm", "background3d"]) test(`multipart ${kind} descriptor preserves upload identity`, () => {
  const form = makeFormData(Uint8Array.of(1), "fixture.bin", kind, "test-id");
  assert.equal(form.get("elementType"), kind);
  assert.deepEqual(JSON.parse(form.get("descriptor")), { version: 1,
    element: { id: "test-id", type: kind, x: 0, y: 0, width: 1024, height: 1024, rotation: 0 } });
  assert.equal(form.get("file").type, kind === "image" ? "application/octet-stream" : "model/gltf-binary");
});

for (const extension of ["VRM", "VRMC_vrm"]) {
  test(`GLB detects declared ${extension} at spec offsets`, () => {
    assert.equal(detectVrmModelFromGlb(glb({ asset: { version: "2.0" }, extensionsUsed: [extension] })), true);
  });
  test(`GLB detects ${extension} in the root extensions object`, () => {
    assert.equal(detectVrmModelFromGlb(glb({ asset: { version: "2.0" }, extensions: { [extension]: {} } })), true);
  });
}

test("GLB probe respects a nonzero input byteOffset and valid optional chunks", () => {
  const bytes = glb(undefined, [chunk(0x004e4942, Buffer.alloc(4)), chunk(0x12345678, Buffer.alloc(4))]);
  const backing = Buffer.concat([Buffer.alloc(19, 0xab), bytes, Buffer.alloc(19, 0xab)]);
  assert.equal(detectVrmModelFromGlb(backing.subarray(19, 19 + bytes.length)), true);
});

for (const [name, mutate] of [
  ["magic", (bytes) => { bytes.writeUInt32LE(0, 0); }],
  ["container version", (bytes) => { bytes.writeUInt32LE(1, 4); }],
  ["total length", (bytes) => { bytes.writeUInt32LE(bytes.length - 4, 8); }],
  ["first chunk type", (bytes) => { bytes.writeUInt32LE(0x004e4942, 16); }],
  ["unsigned oversized JSON", (bytes) => { bytes.writeUInt32LE(0xfffffffc, 12); }],
  ["misaligned JSON", (bytes) => { bytes.writeUInt32LE(5, 12); }],
  ["empty JSON", (bytes) => { bytes.writeUInt32LE(0, 12); }],
  ["malformed UTF-8", (bytes) => { bytes[22] = 0xff; }],
  ["malformed JSON", (bytes) => { bytes[20] = 0x21; }],
]) test(`GLB rejects ${name}`, () => {
  const bytes = glb(); mutate(bytes);
  assert.equal(detectVrmModelFromGlb(bytes), false);
});

test("GLB rejects truncation, duplicate JSON and a misplaced binary chunk", () => {
  const bytes = glb();
  for (let length = 0; length < bytes.length; length += 1) assert.equal(detectVrmModelFromGlb(bytes.subarray(0, length)), false);
  assert.equal(detectVrmModelFromGlb(glb(undefined, [chunk(0x4e4f534a, Buffer.from("{}  "))])), false);
  assert.equal(detectVrmModelFromGlb(glb(undefined, [chunk(0x12345678, Buffer.alloc(4)), chunk(0x004e4942, Buffer.alloc(4))])), false);
});

for (const doc of [null, [], {}, { asset: { version: "1.0" }, extensionsUsed: ["VRM"] }, { asset: { version: "2.0" }, extensionsUsed: ["OTHER"] }]) {
  test(`not a VRM document: ${JSON.stringify(doc)}`, () => assert.equal(detectVrmModelFromGlb(glb(doc)), false));
}

test("probe remains bounded for oversized JSON content", () => {
  const bytes = glb({ asset: { version: "2.0" }, extensionsUsed: ["VRM"], extras: "x".repeat(16 * 1024 * 1024) });
  assert.equal(detectVrmModelFromGlb(bytes), false);
});

for (const override of ["image", "vrm", "background3d"]) test(`explicit --type ${override} wins over manifest metadata`, () => {
  for (const subtype of ["image", "vrm", "background3d"]) assert.equal(resolveAssetKind(plan({ subtype }), override, glb(), true), override);
});

test("auto mode probes generated background3d GLB metadata but honors no-probe-vrm", () => {
  assert.equal(resolveAssetKind(plan({ subtype: "background3d" }), "auto", glb(), true), "vrm");
  assert.equal(resolveAssetKind(plan({ subtype: "background3d" }), "auto", glb(), false), "background3d");
  assert.equal(resolveAssetKind(plan({ path: "/avatar.VRM" }), "auto", glb(), false), "vrm");
  assert.equal(resolveAssetKind(plan({ path: "/photo.PNG" }), "auto", PNG, true), "image");
  assert.equal(resolveAssetKind(plan(), "auto", glb({ asset: { version: "2.0" } }), true), "background3d");
});

test("long colliding IDs always progress, remain bounded and are deterministic", () => {
  const item = plan({ name: "a".repeat(500) });
  const generate = () => {
    const used = new Set();
    return Array.from({ length: 100 }, () => buildAssetId(item, 0, used));
  };
  const ids = generate();
  assert.equal(new Set(ids).size, 100);
  assert.ok(ids.every((id) => id.length <= 120 && /^[a-zA-Z0-9_.-]+$/u.test(id)));
  assert.deepEqual(ids, generate());
  assert.equal(buildAssetId(plan({ name: "chair", seed: 123 }), 0, new Set()), "prop-chair-seed-123");
});

for (const status of [200, 404, 401, 403, 429, 500]) test(`existing-asset HTTP ${status} is classified without assuming errors are absence`, async () => {
  await serverFixture(async (baseUrl) => {
    const result = hasExistingAsset(baseUrl, {}, "test-work", "test-id", "image");
    if (status === 200 || status === 404) assert.equal(await result, status === 200);
    else await assert.rejects(result, new RegExp(`\\(${status}\\)`, "u"));
  }, status);
});

test("staged Dontdraw manifest reaches real CLI multipart with the exact original hash", async () => fixture(async (base) => {
  const source = path.join(base, "source"); await mkdir(source);
  await writeFile(path.join(source, "asset.png"), PNG);
  await writeFile(path.join(source, "source.json"), JSON.stringify({ schema: SOURCE_SCHEMA,
    authorization: { reference: "TEST-ONLY", scope: "private-workspace", redistributionAllowed: false },
    products: [{ id: "1444", title: "테스트", sourceUrl: "https://dontdraw.com/itemDetail.html?pdIdx=1444", category: "prop", files: [{ path: "asset.png", role: "asset" }] }] }));
  await prepareAuthorizedImport({ sourceDir: source, manifestPath: "source.json", outputDir: path.join(base, "staged"), write: true });
  const manifestPath = path.join(base, "staged", "ready", "manifest.json");
  const [loaded] = await loadManifest(manifestPath);
  assert.deepEqual(await readFile(loaded.path), PNG);
  await serverFixture(async (baseUrl, requests) => {
    const result = await cli(["--base-url", baseUrl, "--session-token", "test-only", "--work-id", "test-work", "--manifest", manifestPath]);
    assert.equal(result.code, 0, result.stderr);
    const puts = requests.filter((req) => req.method === "PUT");
    assert.equal(puts.length, 1);
    assert.equal(puts[0].elementType, "image");
    assert.equal(hash(puts[0].bytes), hash(PNG));
  });
}));

test("CLI resume preserves IDs from the full plan despite duplicate long names", async () => fixture(async (base) => {
  await writeFile(path.join(base, "a.png"), PNG); await writeFile(path.join(base, "b.png"), PNG);
  const manifestPath = path.join(base, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(["a.png", "b.png"].map((filename) => ({ path: filename, name: "a".repeat(500), category: "prop", subtype: "image" }))));
  await serverFixture(async (baseUrl, requests) => {
    const args = ["--base-url", baseUrl, "--session-token", "test-only", "--work-id", "test-work", "--manifest", manifestPath];
    assert.equal((await cli(args)).code, 0);
    const first = requests.filter((req) => req.method === "PUT");
    assert.equal(first.length, 2); assert.notEqual(first[0].descriptor.element.id, first[1].descriptor.element.id);
    const secondAssetId = first.find((req) => req.filename === "b.png").descriptor.element.id;
    requests.length = 0;
    assert.equal((await cli([...args, "--start-index", "1", "--max-items", "1"])).code, 0);
    assert.equal(requests.find((req) => req.method === "PUT").descriptor.element.id, secondAssetId);
  });
}));

for (const existingStatus of [404, 401, 429, 500]) test(`CLI --skip-existing does not upload after HTTP ${existingStatus} unless it is 404`, async () => fixture(async (base) => {
  await writeFile(path.join(base, "asset.png"), PNG);
  const manifestPath = path.join(base, "manifest.json");
  await writeFile(manifestPath, JSON.stringify([{ path: "asset.png", name: "test", subtype: "image" }]));
  await serverFixture(async (baseUrl, requests) => {
    const result = await cli(["--base-url", baseUrl, "--session-token", "test-only", "--work-id", "test-work", "--manifest", manifestPath, "--skip-existing"]);
    assert.equal(result.code, existingStatus === 404 ? 0 : 1);
    assert.equal(requests.filter((req) => req.method === "PUT").length, existingStatus === 404 ? 1 : 0);
  }, existingStatus);
}));

test("dry-run performs no authentication or network request", async () => fixture(async (base) => {
  const manifestPath = path.join(base, "manifest.json");
  await writeFile(manifestPath, JSON.stringify([{ path: "missing.png", name: "test" }]));
  await serverFixture(async (baseUrl, requests) => {
    const result = await cli(["--base-url", baseUrl, "--manifest", manifestPath, "--dry-run"]);
    assert.equal(result.code, 0, result.stderr); assert.equal(requests.length, 0);
  });
}));
