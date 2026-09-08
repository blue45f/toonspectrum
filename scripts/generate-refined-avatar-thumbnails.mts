/** Render original bundled VRMs through their MToon materials on an asserted Apple/Metal GPU.
 * Usage: node --import tsx scripts/generate-refined-avatar-thumbnails.mts http://127.0.0.1:5229
 * Run the repository Vite dev server first. Original model and thumbnail bytes are never replaced.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import type { RefinedAvatarThumbnailRuntime } from "../apps/web/tools/browser-harnesses/refined-avatar-thumbnails";

type ThumbnailWindow = Window & { __refinedAvatarThumbnails?: RefinedAvatarThumbnailRuntime };

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = resolve(root, "apps/web/public");
const outputRoot = resolve(publicRoot, "assets/3d/characters/thumbnails/refined-v1");
const origin = process.argv[2] ?? "http://127.0.0.1:5229";
assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/u, "Only an explicitly local dev server is accepted");
const ids = ["mega-angel", "alicia", "rubin", "unicorn-person", "vivi"] as const;
const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 768, height: 768 }, deviceScaleFactor: 1 });
const diagnostics: string[] = [];
page.on("pageerror", (error) => diagnostics.push(error.message));
page.on("console", (message) => { if (message.type() === "error") diagnostics.push(message.text()); });
const receipts: Record<string, unknown>[] = [];
try {
  await page.goto(`${origin}/tools/browser-harnesses/refined-avatar-thumbnails.html`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForFunction(() => Boolean((window as ThumbnailWindow).__refinedAvatarThumbnails?.ready), undefined, { timeout: 60_000 });
  await mkdir(outputRoot, { recursive: true });
  for (const id of ids) {
    const result = await page.evaluate(async (assetId) => {
      const runtime = (window as ThumbnailWindow).__refinedAvatarThumbnails;
      if (!runtime) throw new Error("Original VRM renderer is unavailable");
      return runtime.render(assetId);
    }, id);
    assert.equal(result.id, id);
    assert.equal(result.width, 768);
    assert.equal(result.height, 768);
    assert.ok(result.renderedTriangles > 0);
    assert.deepEqual(diagnostics, [], `${id}: renderer reported errors`);
    const png = Buffer.from(result.pngBase64, "base64");
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(png.readUInt32BE(16), 768);
    assert.equal(png.readUInt32BE(20), 768);
    const source = await readFile(resolve(publicRoot, result.sourceUrl.slice(1)));
    const original = await readFile(resolve(publicRoot, `assets/3d/characters/thumbnails/${id}.png`));
    await writeFile(resolve(outputRoot, `${id}.png`), png);
    const { pngBase64: _png, ...evidence } = result;
    receipts.push({ ...evidence, sourceSha256: hash(source), originalThumbnailSha256: hash(original), thumbnailSha256: hash(png), thumbnailBytes: png.byteLength });
    process.stdout.write(`${id}: ${png.byteLength} bytes, ${result.renderedTriangles} rendered triangles, ${result.gpu.renderer}\n`);
  }
  const manifest = { version: 1, generator: "generate-refined-avatar-thumbnails.mts", browser: browser.version(), sourceMaterialsPreserved: true, entries: receipts };
  await writeFile(resolve(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const comparison = await page.evaluate(async (assetIds) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1800;
    canvas.height = 880;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#e9e5df";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = "bold 22px sans-serif";
    context.fillStyle = "#262a2e";
    context.fillText("ORIGINAL PREVIEWS", 18, 30);
    context.fillText("ORIGINAL VRMS / REFINED CAMERA AND BACKGROUND", 18, 467);
    for (let index = 0; index < assetIds.length; index += 1) {
      for (const refined of [false, true]) {
        const img = new Image();
        img.src = `/assets/3d/characters/thumbnails/${refined ? "refined-v1/" : ""}${assetIds[index]}.png`;
        await img.decode();
        const x = index * 360 + 12;
        const y = refined ? 482 : 45;
        context.fillStyle = "#f9f7f2";
        context.fillRect(x, y, 336, 336);
        context.drawImage(img, x, y, 336, 336);
        context.font = "18px sans-serif";
        context.fillStyle = "#262a2e";
        context.fillText(assetIds[index], x + 8, y + 365);
      }
    }
    return canvas.toDataURL("image/png").slice("data:image/png;base64,".length);
  }, [...ids]);
  await writeFile("/tmp/toonstudio-avatar-thumbnails-before-after.png", Buffer.from(comparison, "base64"));
  assert.deepEqual(diagnostics, []);
} finally {
  await browser.close();
}
