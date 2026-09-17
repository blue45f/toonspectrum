import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import { SAMPLE_VRMS } from "../apps/web/src/domains/creator/vrm/vrm-library";

import type { RefinedAvatarThumbnailRuntime } from "../apps/web/tools/browser-harnesses/refined-avatar-thumbnails";

type ThumbnailWindow = Window & { __refinedAvatarThumbnails?: RefinedAvatarThumbnailRuntime };

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = resolve(root, "apps/web/public");
const outputRoot = resolve(publicRoot, "assets/3d/characters/thumbnails/refined-v2");
const origin = process.argv[2] ?? "http://127.0.0.1:5229";
const writeCatalog = process.argv.includes("--write-catalog");
const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/u, "Only an explicitly local dev server is accepted");

function readPngSize(bytes: Buffer) {
  if (bytes.length < 24 || bytes.subarray(1, 4).toString() !== "PNG") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const targets = [] as Array<(typeof SAMPLE_VRMS)[number]>;
for (const model of SAMPLE_VRMS) {
  if (!model.thumbnailUrl?.startsWith("/assets/3d/characters/thumbnails/")) continue;
  if (!model.url?.startsWith("/vrm/") || !model.url.endsWith(".vrm")) continue;
  if (model.thumbnailUrl.includes("/refined-v1/") || model.thumbnailUrl.includes("/refined-v2/")) continue;
  const source = await readFile(resolve(publicRoot, model.thumbnailUrl.slice(1)));
  const size = readPngSize(source);
  if (!size || Math.min(size.width, size.height) >= 768) continue;
  targets.push(model);
}

assert.ok(targets.length > 0, "No low-resolution production VRM thumbnails found");
await mkdir(outputRoot, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 768, height: 768 }, deviceScaleFactor: 1 });
const diagnostics: string[] = [];
page.on("pageerror", (error) => diagnostics.push(error.message));
page.on("console", (message) => { if (message.type() === "error") diagnostics.push(message.text()); });
const receipts: Record<string, unknown>[] = [];
const failures: Array<{ id: string; error: string }> = [];

try {
  await page.goto(`${origin}/tools/browser-harnesses/refined-avatar-thumbnails.html`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForFunction(() => Boolean((window as ThumbnailWindow).__refinedAvatarThumbnails?.ready), undefined, { timeout: 60_000 });
  for (const model of targets) {
    try {
      diagnostics.length = 0;
      const result = await page.evaluate(async ({ id, url }) => {
        const runtime = (window as ThumbnailWindow).__refinedAvatarThumbnails;
        if (!runtime) throw new Error("VRM thumbnail renderer is unavailable");
        return runtime.render({ id, url, crop: 0.12, fitWings: true });
      }, { id: model.id, url: model.url });
      assert.equal(result.id, model.id);
      assert.equal(result.width, 768);
      assert.equal(result.height, 768);
      assert.ok(result.renderedTriangles > 0);
      assert.deepEqual(diagnostics, [], `${model.id}: renderer reported errors`);
      const png = Buffer.from(result.pngBase64, "base64");
      assert.equal(png.subarray(1, 4).toString(), "PNG");
      const source = await readFile(resolve(publicRoot, model.url.slice(1)));
      const original = await readFile(resolve(publicRoot, model.thumbnailUrl!.slice(1)));
      await writeFile(resolve(outputRoot, `${model.id}.png`), png);
      const { pngBase64: _png, ...evidence } = result;
      receipts.push({ ...evidence, sourceSha256: hash(source), originalThumbnailSha256: hash(original), thumbnailSha256: hash(png), thumbnailBytes: png.byteLength });
      process.stdout.write(`OK ${model.id}: ${png.byteLength} bytes, ${result.renderedTriangles} triangles\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ id: model.id, error: message });
      process.stderr.write(`FAIL ${model.id}: ${message}\n`);
    }
  }
  const manifest = {
    version: 2,
    generator: "generate-studio-vrm-catalog-thumbnails.mts",
    browser: browser.version(),
    sourceMaterialsPreserved: true,
    requested: targets.length,
    succeeded: receipts.length,
    failed: failures.length,
    entries: receipts,
    failures,
  };
  await writeFile(resolve(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  if (writeCatalog && receipts.length > 0) {
    const cataloguePath = resolve(root, "apps/web/src/domains/creator/vrm/vrm-library.ts");
    let catalogue = await readFile(cataloguePath, "utf8");
    for (const receipt of receipts) {
      const id = String(receipt.id);
      const model = targets.find((entry) => entry.id === id);
      if (!model?.thumbnailUrl) continue;
      catalogue = catalogue.replace(
        `thumbnailUrl: "${model.thumbnailUrl}"`,
        `thumbnailUrl: "/assets/3d/characters/thumbnails/refined-v2/${id}.png"`,
      );
    }
    await writeFile(cataloguePath, catalogue);
  }

  process.stdout.write(`Rendered ${receipts.length}/${targets.length}; failed ${failures.length}.\n`);
  if (failures.length > 0) process.exitCode = 2;
} finally {
  await browser.close();
}
