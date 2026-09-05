import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { access, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readBoundedHandle, readStableFile, stagePrivateBundle } from "./authorized-intake-io.mjs";
import { parseCliOptions, prepareAuthorizedImport } from "./import-authorized-assets.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const SCRIPT = fileURLToPath(new URL("./import-authorized-assets.mjs", import.meta.url));
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=", "base64");

async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "dontdraw-io-"));
  try { return await run(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}

function stat(size, extra = {}) {
  return { dev: 1n, ino: 2n, size: BigInt(size), mtimeNs: 3n, ctimeNs: 4n, isFile: () => true, ...extra };
}

function fakeHandle(bytes, { chunk = 65536, after = stat(bytes.length), readOverride } = {}) {
  let stats = 0;
  const calls = [];
  return {
    calls,
    async stat() { return ++stats === 1 ? stat(bytes.length) : after; },
    async read(buffer, offset, length, position) {
      calls.push({ length, position });
      if (readOverride) return { bytesRead: readOverride(buffer, offset, length, position) };
      const count = Math.min(length, chunk, Math.max(0, bytes.length - position));
      bytes.copy(buffer, offset, position, position + count);
      return { bytesRead: count };
    },
  };
}

function sourceManifest(files = [{ path: "asset.png", role: "asset" }]) {
  return { schema: "toonstudio.dontdraw-source.v1", authorization: { reference: "SYNTHETIC-TEST", scope: "private-workspace", redistributionAllowed: false },
    products: [{ id: "1", title: "Synthetic", sourceUrl: "https://dontdraw.com/itemDetail.html?pdIdx=1", category: "prop", files }] };
}

async function createSource(root, bytes = PNG) {
  const sourceDir = path.join(root, "source");
  await mkdir(sourceDir);
  await writeFile(path.join(sourceDir, "source.json"), JSON.stringify(sourceManifest()));
  await writeFile(path.join(sourceDir, "asset.png"), bytes);
  return { sourceDir, manifestPath: "source.json", outputDir: path.join(root, "output") };
}

function cli(args, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (text) => { stdout += text; });
    child.stderr.setEncoding("utf8").on("data", (text) => { stderr += text; });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, timedOut });
    });
  });
}

test("bounded reader handles real short reads without losing or duplicating bytes", async () => {
  const bytes = Buffer.from("original-content");
  const handle = fakeHandle(bytes, { chunk: 2 });
  assert.deepEqual(await readBoundedHandle(handle, 20), bytes);
  assert.equal(handle.calls.at(-1).length, 1);
  assert.equal(handle.calls.at(-1).position, bytes.length);
});

test("reader requests at most 64 KiB per read and only one EOF probe", async () => {
  const bytes = Buffer.alloc(150000, 7);
  const handle = fakeHandle(bytes);
  assert.deepEqual(await readBoundedHandle(handle, bytes.length), bytes);
  assert.equal(handle.calls.length, 4);
  assert.ok(handle.calls.every((call) => call.length <= 65536));
  assert.equal(handle.calls.reduce((sum, call) => sum + call.length, 0), bytes.length + 1);
});

for (const limit of [0, -1, Infinity, 1.5, NaN]) test(`invalid byte limit ${limit} fails before reading`, async () => {
  const handle = fakeHandle(Buffer.from("abc"));
  await assert.rejects(readBoundedHandle(handle, limit), /byte limit/u);
  assert.equal(handle.calls.length, 0);
});

test("oversized files fail before allocating their payload or reading", async () => {
  const handle = fakeHandle(Buffer.from("abc"));
  await assert.rejects(readBoundedHandle(handle, 2), /1 to 2 bytes/u);
  assert.equal(handle.calls.length, 0);
});

test("zero-byte files are rejected before reading", async () => {
  const handle = fakeHandle(Buffer.alloc(0));
  await assert.rejects(readBoundedHandle(handle, 10), /1 to 10 bytes/u);
  assert.equal(handle.calls.length, 0);
});

test("a growing file is rejected using a single bounded EOF probe", async () => {
  const handle = fakeHandle(Buffer.from("abc"), { readOverride: (buffer, offset, length) => { buffer.fill(7, offset, offset + length); return length; } });
  await assert.rejects(readBoundedHandle(handle, 3), /changed/u);
  assert.equal(handle.calls.length, 2);
  assert.equal(handle.calls.reduce((sum, call) => sum + call.length, 0), 4);
});

for (const field of ["ino", "dev", "mtimeNs", "ctimeNs", "size"]) test(`reject concurrent ${field} change`, async () => {
  const handle = fakeHandle(Buffer.from("abc"), { after: stat(3, { [field]: 99n }) });
  await assert.rejects(readBoundedHandle(handle, 10), /changed/u);
});

test("a truncated source cannot yield a partially zero-filled successful buffer", async () => {
  const handle = fakeHandle(Buffer.from("abc"), { readOverride: () => 0 });
  await assert.rejects(readBoundedHandle(handle, 10), /ended/u);
});

test("readStableFile accepts actual regular-file bytes at the exact limit", async () => fixture(async (root) => {
  const source = path.join(root, "asset.bin");
  await writeFile(source, "abc");
  assert.equal((await readStableFile(source, 3)).toString(), "abc");
}));

test("directories and symlinks are rejected by the stable reader", async () => fixture(async (root) => {
  const source = path.join(root, "asset.bin");
  const link = path.join(root, "link.bin");
  await writeFile(source, "abc");
  await symlink(source, link);
  await assert.rejects(readStableFile(root, 10), /regular files/u);
  await assert.rejects(readStableFile(link, 10), /regular files/u);
}));

test("private staging exposes only a complete ready bundle", async () => fixture(async (root) => {
  const output = path.join(root, "output");
  await stagePrivateBundle(output, async (temporary) => {
    await assert.rejects(access(path.join(output, "ready")));
    await writeFile(path.join(temporary, "value"), "complete", { flag: "wx", mode: 0o600 });
  });
  assert.deepEqual(await readdir(output), ["ready"]);
  assert.equal(await readFile(path.join(output, "ready", "value"), "utf8"), "complete");
}));

test("failed staging removes its partial files and new empty reservation", async () => fixture(async (root) => {
  const output = path.join(root, "output");
  await assert.rejects(stagePrivateBundle(output, async (temporary) => {
    await writeFile(path.join(temporary, "partial"), "partial");
    throw new Error("simulated write failure");
  }), /simulated write failure/u);
  await assert.rejects(access(output));
}));

test("failed staging preserves independently added output files", async () => fixture(async (root) => {
  const output = path.join(root, "output");
  await assert.rejects(stagePrivateBundle(output, async (temporary) => {
    await writeFile(path.join(output, "keep.txt"), "user data");
    await writeFile(path.join(temporary, "partial"), "partial");
    throw new Error("simulated write failure");
  }), /simulated write failure/u);
  assert.deepEqual(await readdir(output), ["keep.txt"]);
  assert.equal(await readFile(path.join(output, "keep.txt"), "utf8"), "user data");
}));

test("staging refuses an existing ready directory, including an empty one", async () => fixture(async (root) => {
  const output = path.join(root, "output");
  await assert.rejects(stagePrivateBundle(output, async () => { await mkdir(path.join(output, "ready")); }), /already exists/u);
  assert.deepEqual(await readdir(output), ["ready"]);
  assert.deepEqual(await readdir(path.join(output, "ready")), []);
}));

test("directory substitution cannot redirect recursive cleanup into unrelated data", async () => fixture(async (root) => {
  const output = path.join(root, "output");
  const moved = path.join(root, "moved");
  await assert.rejects(stagePrivateBundle(output, async (temporary) => {
    await writeFile(path.join(temporary, "partial"), "partial");
    await rename(output, moved);
    await mkdir(output);
    await writeFile(path.join(output, "keep.txt"), "user data");
    throw new Error("changed output");
  }), /cleanup needs review/u);
  assert.equal(await readFile(path.join(output, "keep.txt"), "utf8"), "user data");
  assert.equal((await readdir(moved)).length, 1);
}));

test("staging never reuses an existing output", async () => fixture(async (root) => {
  const output = path.join(root, "output");
  await mkdir(output);
  await writeFile(path.join(output, "keep.txt"), "existing");
  let called = false;
  await assert.rejects(stagePrivateBundle(output, async () => { called = true; }), /EEXIST/u);
  assert.equal(called, false);
  assert.equal(await readFile(path.join(output, "keep.txt"), "utf8"), "existing");
}));

test("CLI invalid-file reports are JSON on stdout with failing exit status", async () => fixture(async (root) => {
  const options = await createSource(root, Buffer.from("not png"));
  const result = await cli(["--source-dir", options.sourceDir]);
  assert.equal(result.timedOut, false);
  assert.equal(result.code, 1);
  assert.equal(result.stderr, "");
  assert.equal(JSON.parse(result.stdout).counts.invalid, 1);
  await assert.rejects(access(options.outputDir));
}));

test("CLI success means completed inspection, never publication", async () => fixture(async (root) => {
  const options = await createSource(root);
  const result = await cli(["--source-dir", options.sourceDir]);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  const report = JSON.parse(result.stdout);
  assert.equal(report.counts.ready, 1);
  assert.equal(report.counts.published, 0);
  assert.equal(report.visualReview, "not-performed");
}));

test("invalid UTF-8 in source manifests is not silently replaced", async () => fixture(async (root) => {
  const options = await createSource(root);
  const json = Buffer.from(JSON.stringify(sourceManifest()));
  json[json.indexOf(Buffer.from("Synthetic"))] = 0xff;
  await writeFile(path.join(options.sourceDir, "source.json"), json);
  await assert.rejects(prepareAuthorizedImport(options), /encoded data/u);
}));

test("manifest size is enforced by the bounded descriptor reader", async () => fixture(async (root) => {
  const options = await createSource(root);
  await writeFile(path.join(options.sourceDir, "source.json"), Buffer.alloc(8 * 1024 * 1024 + 1, 32));
  await assert.rejects(prepareAuthorizedImport(options), /8388608/u);
}));

for (const args of [
  ["--source-dir", "one", "--source-dir", "two"],
  ["--source-dir", "one", "--write", "--write", "--output", "two"],
  ["--source-dir", "one", "--manifest", "one.json", "--manifest", "two.json"],
  ["--source-dir", "one", "--output", "two", "--output", "three"],
]) test(`ambiguous duplicate options are rejected: ${args.join(" ")}`, () => {
  assert.throws(() => parseCliOptions(args), /Duplicate option/u);
});

test("prototype-like positional options, whitespace paths and write without output are rejected", () => {
  assert.throws(() => parseCliOptions(["--source-dir", "one", "toString", "x"]), /Unknown option/u);
  assert.throws(() => parseCliOptions(["--source-dir", "   "]), /missing value/u);
  assert.throws(() => parseCliOptions(["--source-dir", "one", "--write"]), /output/u);
});

test("pnpm argument separator and source paths containing spaces still work", () => {
  assert.deepEqual(parseCliOptions(["--", "--source-dir", "/private/한글 originals", "--manifest", "source.json"]),
    { sourceDir: "/private/한글 originals", manifestPath: "source.json", write: false });
});

test("standalone help returns success but cannot mask a broken write command", async () => {
  assert.equal((await cli(["--help"])).code, 0);
  assert.equal((await cli(["--write", "--help"])).code, 1);
});

// Both repository CI and this Linux workspace run these OS-specific contracts.
// Windows has no POSIX mkfifo or meaningful Unix permission mode bits.
if (process.platform !== "win32") {
  test("named-pipe asset is rejected without waiting for a writer", async () => fixture(async (root) => {
    const options = await createSource(root);
    const asset = path.join(options.sourceDir, "asset.png");
    await rm(asset);
    assert.equal(spawnSync("mkfifo", [asset]).status, 0);
    const result = await cli(["--source-dir", options.sourceDir]);
    assert.equal(result.timedOut, false, "FIFO must not block the CLI");
    assert.equal(result.code, 1);
    assert.match(JSON.parse(result.stdout).records[0].reason, /regular files/u);
  }));

  test("named-pipe manifest is rejected before opening", async () => fixture(async (root) => {
    const options = await createSource(root);
    const source = path.join(options.sourceDir, "source.json");
    await rm(source);
    assert.equal(spawnSync("mkfifo", [source]).status, 0);
    const result = await cli(["--source-dir", options.sourceDir]);
    assert.equal(result.timedOut, false);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /regular files/u);
  }));

  test("staged originals, reports and directories are private even under permissive umask", async () => fixture(async (root) => {
    const options = await createSource(root);
    const harness = `import {prepareAuthorizedImport} from ${JSON.stringify(new URL("./import-authorized-assets.mjs", import.meta.url).href)};process.umask(0);await prepareAuthorizedImport(${JSON.stringify({ ...options, write: true })});`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", harness], { encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
    const ready = path.join(options.outputDir, "ready");
    for (const directory of [options.outputDir, ready, path.join(ready, "files")]) {
      assert.equal((await lstat(directory)).mode & 0o777, 0o700);
    }
    const manifest = JSON.parse(await readFile(path.join(ready, "manifest.json"), "utf8"));
    for (const file of ["manifest.json", "intake-report.json", manifest[0].path]) {
      assert.equal((await lstat(path.join(ready, file))).mode & 0o777, 0o600);
    }
    assert.deepEqual(await readFile(path.join(ready, manifest[0].path)), PNG);
  }));
}
