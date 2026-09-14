import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createServer } from "vite";

import { buildMarketCc0ReleaseManifests } from "./seed/market-cc0-release-manifests.mts";
import type { CreatorMarketplaceResourceRecord } from "../apps/web/src/shared/lib/creator-marketplace-resource-contract";

const server = await createServer({ server: { host: "127.0.0.1", port: 5237, strictPort: true }, mode: "test" });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ["--enable-unsafe-swiftshader"] });
const out = "artifacts/market-cc0";
await mkdir(out, { recursive: true });
const results: unknown[] = [], errors: string[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  page.on("pageerror", error => errors.push(error.message));
  const url = "http://127.0.0.1:5237/tools/browser-harnesses/market-cc0-handoff.html";
  await page.goto(url);
  for (const manifest of buildMarketCc0ReleaseManifests()) {
    const result = await page.evaluate(async (record) => {
      const modulePath = "/tools/browser-harnesses/market-cc0-handoff.tsx";
      const harness = await import(/* @vite-ignore */ modulePath);
      return harness.verifyMarketCc0BrowserCase(record);
    }, manifest as unknown as CreatorMarketplaceResourceRecord);
    results.push(result);
    await page.screenshot({ path: `${out}/${manifest.entries[0].id}.png`, fullPage: true });
    if (manifest.kind === "3d-asset") {
      assert(result.serializedScene);
      await page.reload();
      const reopened = await page.evaluate(async ({ record, serialized }) => {
        const modulePath = "/tools/browser-harnesses/market-cc0-handoff.tsx";
        const harness = await import(/* @vite-ignore */ modulePath);
        return harness.verifyMarketCc0BrowserCase(record, serialized);
      }, { record: manifest as unknown as CreatorMarketplaceResourceRecord, serialized: result.serializedScene });
      assert.equal(reopened.reopened, true);
      assert.equal(reopened.hash, result.hash);
      results.push(reopened);
    }
  }
  assert.equal(errors.length, 0, errors.join("\n"));
} finally {
  await writeFile(`${out}/browser.json`, JSON.stringify({ results, errors }, null, 2));
  await browser.close();
  await server.close();
}
console.log(`Verified ${results.length} actual raster/model and durable-reopen browser cases.`);
