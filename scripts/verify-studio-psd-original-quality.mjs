/** Real Canvas + ag-psd verification. Local synthetic pixels only; never calls AI or deployment APIs. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = process.env.TOONSPECTRUM_VERIFY_DIR ?? join(tmpdir(), "toonspectrum-psd-original-quality");
mkdirSync(output, { recursive: true });
const server = await createServer({ configFile: false, envFile: false, root: join(root, "apps/web"),
  publicDir: false, cacheDir: join(root, "node_modules/.cache/psd-original-quality"),
  resolve: { alias: { "@": join(root, "apps/web/src") } },
  optimizeDeps: { noDiscovery: true, include: ["ag-psd"] },
  server: { host: "127.0.0.1", port: 0, hmr: false }, logLevel: "error" });
let browser;
const failures = [];
try {
  await server.listen();
  const address = server.httpServer?.address();
  assert(address && typeof address === "object", "Local verification server did not bind");
  const origin = `http://127.0.0.1:${address.port}`;
  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === "data:" || url.origin === origin) return route.continue();
    failures.push(`Unexpected external request: ${url.origin}`);
    return route.abort();
  });
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`HTTP ${response.status()}: ${response.url()}`); });
  await page.goto(`${origin}/tools/browser-harnesses/studio-psd-original-quality.html`);
  await page.waitForFunction(() => document.documentElement.dataset.verification, null, { timeout: 60_000 });
  const report = JSON.parse(await page.locator("#result").innerText());
  const hashes = Object.fromEntries([
    "apps/web/src/domains/creator/studio-psd-import.ts",
    "apps/web/src/domains/creator/studio-lossless-canvas-source.ts",
    "apps/web/tools/browser-harnesses/studio-psd-original-quality.ts",
  ].map((path) => [path, createHash("sha256").update(readFileSync(join(root, path))).digest("hex")]));
  writeFileSync(join(output, "report.json"), JSON.stringify({ ...report, failures, browser: browser.version(), hashes }, null, 2));
  await page.screenshot({ path: join(output, "verification.png"), fullPage: true });
  assert.equal(report.status, "passed", report.error);
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({ ...report, failures, evidenceDirectory: output }, null, 2));
} catch (error) {
  const path = join(output, "failure.txt");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, error instanceof Error ? error.stack ?? error.message : String(error));
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
