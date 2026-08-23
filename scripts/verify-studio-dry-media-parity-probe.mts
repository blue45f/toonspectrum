/**
 * Dry-media live/commit compositing parity probe — runner.
 *
 * 패턴 출처: verify-studio-gpu-committed-parity.mts (vite dev server + middleware harness +
 * playwright). 결정 실험 본체는 scripts/dry-media-parity-browser.ts.
 *
 * 실행: pnpm exec tsx scripts/verify-studio-dry-media-parity-probe.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright";
import { createServer as createViteServer } from "vite";

import { WEB_ROOT, WEB_VITE_CONFIG } from "./lib/repo-paths.mjs";
import { findFreePort } from "./lib/studio-verify-preview-harness.mjs";

const HARNESS_PATH = "/__dry_media_parity__";

const HTML = `<!doctype html>
<html><body style="margin:0;background:#fff">
<script type="module" src="/scripts/dry-media-parity-browser-entry.ts"></script>
</body></html>`;

const server = await createViteServer({
  root: WEB_ROOT,
  configFile: WEB_VITE_CONFIG,
  appType: "custom",
  server: { port: await findFreePort(), strictPort: true },
  logLevel: "error",
});
server.middlewares.use((req, res, next) => {
  if (req.url !== HARNESS_PATH) {
    next();
    return;
  }
  res.setHeader("content-type", "text/html");
  res.end(HTML);
});
await server.listen();

try {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-angle=swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 300 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${server.config.server.port}${HARNESS_PATH}`, {
    waitUntil: "load",
  });
  await page.waitForFunction("window.__probeDone === true", null, { timeout: 60_000 });
  const result = await page.evaluate("window.__probeResult");
  const outDir = join(tmpdir(), "toonspectrum-dry-media-parity");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "parity-probe-result.json"), JSON.stringify({ result, errors }, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (errors.length) console.error("page errors:", errors);
  await browser.close();
} finally {
  await server.close().catch(() => undefined);
}
