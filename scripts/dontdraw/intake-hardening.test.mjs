import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readBoundedFile, readBoundedHandle } from "./bounded-file.mjs";
import { prepareAuthorizedImport, SOURCE_SCHEMA, validateSourceManifest } from "./import-authorized-assets.mjs";
import { buildIntakeReviewQueue, intakeExitCode, REVIEW_QUEUE_SCHEMA } from "./intake-review-queue.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=", "base64");
const cli = fileURLToPath(new URL("./import-authorized-assets.mjs", import.meta.url));
const authorization = { reference: "SYNTHETIC-TEST-ONLY", scope: "private-workspace", redistributionAllowed: false };
const asset = { path: "asset.png", role: "asset" };
function source(files = [asset]) {
  return { schema: SOURCE_SCHEMA, authorization, products: [{ id: "1444", title: "테스트", sourceUrl: "https://dontdraw.com/itemDetail.html?pdIdx=1444", category: "prop", files }] };
}
async function fixture(run, input = source()) {
  const base = await mkdtemp(path.join(os.tmpdir(), "dontdraw-hardening-"));
  const sourceDir = path.join(base, "originals");
  const outputDir = path.join(base, "staged");
  await mkdir(sourceDir);
  await writeFile(path.join(sourceDir, "source.json"), JSON.stringify(input));
  await writeFile(path.join(sourceDir, "asset.png"), PNG);
  try { return await run({ sourceDir, outputDir, options: { sourceDir, outputDir, manifestPath: "source.json" } }); }
  finally { await rm(base, { recursive: true, force: true }); }
}
function invoke(sourceDir, extra = []) {
  const env = { ...process.env };
  delete env.VITEST;
  return spawnSync(process.execPath, [cli, "--source-dir", sourceDir, ...extra], { encoding: "utf8", timeout: 5000, env });
}

test("CLI returns failure for invalid files instead of a false-green inspection", async () => fixture(async ({ sourceDir }) => {
  await writeFile(path.join(sourceDir, "asset.png"), "broken");
  const result = invoke(sourceDir);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).counts.invalid, 1);
}));

test("CLI reports a partial staged batch with exit 2 and preserves conversion work", async () => fixture(async ({ sourceDir, outputDir }) => {
  await writeFile(path.join(sourceDir, "native.skp"), "synthetic source");
  const result = invoke(sourceDir, ["--output", outputDir, "--write"]);
  assert.equal(result.status, 2);
  const report = JSON.parse(result.stdout);
  assert.equal(report.counts.ready, 1);
  assert.equal(report.counts.conversionRequired, 1);
  assert.deepEqual(report.reviewQueue.tasks.map((task) => task.action).sort(), ["convert-source", "visual-review"]);
  const persisted = JSON.parse(await readFile(path.join(outputDir, "ready", "review-queue.json"), "utf8"));
  assert.deepEqual(persisted, report.reviewQueue);
}, source([asset, { path: "native.skp", role: "source" }])));

test("CLI returns exit 2 for zero assets rather than successful acquisition", async () => fixture(async ({ sourceDir }) => {
  const result = invoke(sourceDir);
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).counts.ready, 0);
}, { ...source(), products: [] }));

test("CLI returns exit 2 for unsupported format", async () => fixture(async ({ sourceDir }) => {
  const result = invoke(sourceDir);
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).counts.unsupported, 1);
}, source([{ path: "archive.zip", role: "asset" }])));

test("previews and duplicates do not make a ready CLI batch incomplete", async () => fixture(async ({ sourceDir }) => {
  await writeFile(path.join(sourceDir, "duplicate.png"), PNG);
  const result = invoke(sourceDir);
  assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.counts.duplicates, 1);
  assert.equal(report.counts.excludedPreviews, 1);
  assert.equal(report.reviewQueue.counts.pending, 1);
}, source([asset, { path: "duplicate.png", role: "asset" }, { path: "preview.png", role: "preview" }])));

test("help exits successfully without inspecting a source directory", () => {
  const result = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8", timeout: 5000 });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /read-only/u);
});

test("exit precedence does not conceal invalid files behind pending conversions", () => {
  assert.equal(intakeExitCode({ counts: { invalid: 1, ready: 1, conversionRequired: 1, unsupported: 1 } }), 1);
});

test("review queue hashes the exact staged manifest bytes and preserves operator-attested status", async () => fixture(async ({ options, outputDir }) => {
  const result = await prepareAuthorizedImport({ ...options, write: true });
  const bytes = await readFile(path.join(outputDir, "ready", "manifest.json"));
  assert.equal(result.reviewQueue.schema, REVIEW_QUEUE_SCHEMA);
  assert.equal(result.reviewQueue.manifestSha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(result.reviewQueue.authorizationVerification, "operator-attested");
  assert.equal(result.reviewQueue.scope, "private-workspace");
  assert.deepEqual(result.reviewQueue.counts, { pending: 1, approved: 0, rejected: 0, published: 0 });
  assert.equal(result.reviewQueue.tasks[0].sha256, result.manifest[0].provenance.sha256);
  assert.equal(result.reviewQueue.tasks[0].status, "pending");
}));

test("review task IDs are deterministic and do not change when a file is repaired", async () => fixture(async ({ options, sourceDir }) => {
  await writeFile(path.join(sourceDir, "asset.png"), "invalid");
  const before = await prepareAuthorizedImport(options);
  await writeFile(path.join(sourceDir, "asset.png"), PNG);
  const after = await prepareAuthorizedImport(options);
  assert.equal(before.reviewQueue.tasks[0].reviewId, after.reviewQueue.tasks[0].reviewId);
  assert.equal(before.reviewQueue.tasks[0].action, "repair-source");
  assert.equal(after.reviewQueue.tasks[0].action, "visual-review");
}));

test("unknown statuses cannot become review actions through Object.prototype", () => {
  const queue = buildIntakeReviewQueue({ authorization: {}, records: [{ status: "constructor" }, { status: "__proto__" }] }, []);
  assert.equal(queue.tasks.length, 0);
});

test("duplicate source path-role pairs are rejected before producing duplicate review IDs", () => {
  assert.throws(() => validateSourceManifest(source([asset, { ...asset }])), /Duplicate source path/u);
});

test("same file with different declared roles retains distinct review IDs", async () => fixture(async ({ options }) => {
  const result = await prepareAuthorizedImport(options);
  assert.equal(new Set(result.reviewQueue.tasks.map((task) => task.reviewId)).size, 2);
}, source([asset, { path: "asset.png", role: "source" }])));

test("staged content and reports use private POSIX permissions", async () => fixture(async ({ options, outputDir }) => {
  const result = await prepareAuthorizedImport({ ...options, write: true });
  if (process.platform === "win32") return;
  for (const relative of ["manifest.json", "intake-report.json", "review-queue.json", result.manifest[0].path]) {
    assert.equal((await lstat(path.join(outputDir, "ready", relative))).mode & 0o077, 0);
  }
  assert.equal((await lstat(outputDir)).mode & 0o077, 0);
}));

function fileStat(overrides = {}) {
  return { dev: 1n, ino: 1n, size: 4n, mtimeNs: 1n, ctimeNs: 1n, isFile: () => true, ...overrides };
}
function fakeHandle({ first = fileStat(), second = first, data = Buffer.from("test"), partial = 2 } = {}) {
  let stats = 0;
  let reads = 0;
  return {
    stat: async () => (++stats === 1 ? first : second),
    read: async (buffer, offset, length, position) => {
      reads++;
      const count = Math.min(length, partial, Math.max(0, data.length - position));
      data.copy(buffer, offset, position, position + count);
      return { bytesRead: count };
    },
    get reads() { return reads; },
  };
}

test("bounded reader handles short reads and returns only initialized bytes", async () => {
  assert.deepEqual(await readBoundedHandle(fakeHandle(), 4), Buffer.from("test"));
});

test("oversized file is rejected before allocating or reading", async () => {
  const handle = fakeHandle({ first: fileStat({ size: 1000000000000n }) });
  await assert.rejects(readBoundedHandle(handle, 8), /within 8 bytes/u);
  assert.equal(handle.reads, 0);
});

test("growth past the initial size is detected with a one-byte probe", async () => {
  await assert.rejects(readBoundedHandle(fakeHandle({ data: Buffer.from("test-grow") }), 8), /changed/u);
});

test("truncation is rejected instead of accepting zero-filled tails", async () => {
  await assert.rejects(readBoundedHandle(fakeHandle({ data: Buffer.from("t") }), 8), /truncated/u);
});

for (const key of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
  test(`detect concurrent ${key} change even when bytes have the same length`, async () => {
    await assert.rejects(readBoundedHandle(fakeHandle({ second: fileStat({ [key]: 99n }) }), 8), /changed/u);
  });
}

for (const limit of [0, -1, 1.5, Infinity, NaN]) {
  test(`reject unsafe allocation limit ${limit}`, async () => {
    await assert.rejects(readBoundedHandle(fakeHandle(), limit), /byte limit/u);
  });
}

test("reject empty files, special handles and nonregular replacements", async () => {
  await assert.rejects(readBoundedHandle(fakeHandle({ first: fileStat({ size: 0n }) }), 8), /nonempty/u);
  await assert.rejects(readBoundedHandle(fakeHandle({ first: fileStat({ isFile: () => false }) }), 8), /regular/u);
  await assert.rejects(readBoundedHandle(fakeHandle({ second: fileStat({ isFile: () => false }) }), 8), /changed/u);
});

test("bounded filesystem reader rejects directories and symlinks", async () => fixture(async ({ sourceDir }) => {
  await assert.rejects(readBoundedFile(sourceDir, 1024), /regular/u);
  await symlink(path.join(sourceDir, "asset.png"), path.join(sourceDir, "alias.png"));
  await assert.rejects(readBoundedFile(path.join(sourceDir, "alias.png"), 1024), /regular/u);
  assert.deepEqual(await readBoundedFile(path.join(sourceDir, "asset.png"), PNG.length), PNG);
  await assert.rejects(readBoundedFile(path.join(sourceDir, "asset.png"), PNG.length - 1), /within/u);
}));

test("source manifests obey the byte limit before JSON parsing", async () => fixture(async ({ options, sourceDir }) => {
  await writeFile(path.join(sourceDir, "source.json"), " ".repeat(8 * 1024 * 1024 + 1));
  await assert.rejects(prepareAuthorizedImport(options), /8 MiB/u);
}));
