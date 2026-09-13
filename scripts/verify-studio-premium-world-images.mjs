import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const webRoot = path.join(root, "apps/web");
const fixture = path.join(webRoot, ".premium-world-image-verification");
const manifest = JSON.parse(await readFile(path.join(webRoot, "public/assets/studio/cc0-20260906/manifest.json"), "utf8"));
const images = manifest.assets.filter((asset) => asset.id.startsWith("ts-world-") && asset.kind === "illustration");
assert.equal(images.length, 24);
await mkdir(fixture, { recursive: true });
await writeFile(path.join(fixture, "index.html"), '<!doctype html><html lang="ko"><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>');
await writeFile(path.join(fixture, "entry.tsx"), `
import React from "react";
import { createRoot } from "react-dom/client";
import { StudioCc0AssetLibraryPanel } from "../src/domains/creator/StudioCc0AssetLibraryPanel";
import { createCanvasImageElement } from "../src/domains/creator/studio-image-placement";
window.__worldImageInsertions = [];
createRoot(document.getElementById("root")!).render(<StudioCc0AssetLibraryPanel onUseAsset={(asset) => {
  const placed = createCanvasImageElement({ id: asset.id, src: asset.dataUrl, canvasWidth: 720,
    canvasHeight: 1080, sourceWidth: asset.width, sourceHeight: asset.height, horizontalInset: 0, minY: 0 });
  window.__worldImageInsertions.push({ id: asset.id, width: asset.width, height: asset.height,
    placedWidth: placed.width, placedHeight: placed.height, rights: asset.rights, contentHash: asset.contentHash });
  return true;
}} />);
`);
const server = await createServer({ configFile: false, root: webRoot,
  resolve: { alias: { "@": path.join(webRoot, "src") } },
  esbuild: { jsx: "automatic" },
  server: { host: "127.0.0.1", port: 5298, strictPort: true, fs: { allow: [root] } }, logLevel: "warn" });
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(90_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:5298/.premium-world-image-verification/index.html");
  await page.locator("summary").filter({ hasText: "CC0 원본 에셋 라이브러리" }).click();
  await page.getByRole("button", { name: "2D 배경 · 소품", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-cc0-asset-id^='ts-world-']").length === 24);
  for (let index = 0; index < images.length; index++) {
    const image = images[index];
    const card = page.locator(`[data-cc0-asset-id="${image.id}"]`);
    await card.getByRole("button", { name: "캔버스에 삽입", exact: true }).click();
    await page.waitForFunction((count) => window.__worldImageInsertions.length === count, index + 1);
    const last = await page.evaluate(() => window.__worldImageInsertions.at(-1));
    assert.equal(last.id, `cc0:${image.id}`);
    assert.equal(last.contentHash, `sha256:${image.sha256}`);
    assert.equal(last.width, image.width);
    assert.equal(last.height, image.height);
    assert.equal(last.rights.rightsConfirmed, true);
    assert(Math.abs(last.placedHeight - last.placedWidth * image.height / image.width) <= 1);
  }
  // Corrupted bytes must not reach the canvas, even for a first-party licensed entry.
  const first = images[0];
  const urlPath = "/assets/studio/cc0-20260906/" + first.path;
  await page.route(`**${urlPath}`, async (route) => {
    const response = await route.fetch();
    const bytes = await response.body();
    const corrupt = Buffer.from(bytes);
    corrupt[corrupt.length - 1] ^= 1;
    await route.fulfill({ response, body: corrupt });
  });
  await page.locator(`[data-cc0-asset-id="${first.id}"]`).getByRole("button", { name: "캔버스에 삽입", exact: true }).click();
  await page.getByText("에셋 무결성 검증에 실패했습니다.", { exact: true }).waitFor();
  const inserted = await page.evaluate(() => window.__worldImageInsertions);
  assert.equal(inserted.length, 24);
  assert.deepEqual(errors, []);
  const output = path.join(root, "docs/reports/studio-premium-world-v1");
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "image-insertion-verification.json"), JSON.stringify({ checkedAt: new Date().toISOString(),
    harness: "isolated real StudioCc0AssetLibraryPanel and createCanvasImageElement; not a deployed editor end-to-end test",
    inserted, corruptAssetRejected: true, pageErrors: errors }, null, 2) + "\n");
  console.log("PASS: 24 actual library image insertions, preserved source ratios/rights/hashes, corrupted bytes rejected");
} finally {
  await browser.close();
  await server.close();
  await rm(fixture, { recursive: true, force: true });
}
