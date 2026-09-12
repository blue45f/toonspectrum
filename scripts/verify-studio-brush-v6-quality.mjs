/** Actual V6 Canvas2D recipe/input evidence. Run: pnpm exec node scripts/verify-studio-brush-v6-quality.mjs */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright";
import { createServer } from "vite";

import { REPO_ROOT, WEB_VITE_ALIASES } from "./lib/repo-paths.mjs";

const OUTPUT = process.env.TOONSPECTRUM_BRUSH_V6_VERIFY_DIR
  ?? join(tmpdir(), `toonspectrum-brush-v6-quality-${Date.now()}`);
const ENTRY = "/scripts/studio-brush-v6-quality-browser.ts";
const diagnostics = { consoleErrors: [], pageErrors: [], failedRequests: [] };

function writeReviewIndex(report) {
  const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
  const cards = report.results.map((entry) => `<section id="${escape(entry.id)}"><h2>${escape(entry.name ?? entry.label)}</h2>`
    + `<p>${escape(entry.id)} · ${entry.production.markCount.toLocaleString()} contacts · live/commit maximum channel error ${entry.production.liveCommitted.maximumChannelError}`
    + ` · SVG mean channel error ${(entry.production.svgPixels.meanChannelError * 100).toFixed(4)}%</p>`
    + (entry.shortStarts ? `<p>Short first segments: ${entry.shortStarts.cases.map(item => `${escape(item.label)} · ${item.markCount} contacts · native/commit max ${item.liveCommitted.maximumChannelError}`).join("; ")}</p>` : "")
    + (entry.relief ? `<p>Bristle relief 0 versus 1: normalized deposited-material distance ${entry.relief.distance.toFixed(6)} (minimum ${entry.relief.minimumDistance})</p>` : "")
    + `<img src="${escape(entry.id)}.png" alt="${escape(entry.label)} reference, live input, Studio settled, committed and SVG comparison" loading="lazy"></section>`).join("");
  writeFileSync(join(OUTPUT, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">`
    + "<title>Studio brush material verification</title><style>body{font:15px/1.6 system-ui;margin:32px auto;padding:0 20px;max-width:1050px;color:#172334;background:#f4f6f9}h1{font-size:30px}h2{margin-bottom:0}section{border-top:1px solid #ccd6e0;margin-top:30px;padding-top:16px}img{display:block;max-width:100%;height:auto}a{color:#245b8a}.metadata{padding:18px;background:white;border:1px solid #ccd6e0}</style></head><body>"
    + `<h1>Studio brush material verification</h1><div class="metadata"><p>${report.results.length} recipes · ${report.failures.length} failures · ${escape(report.generatedAt)}</p>`
    + `<p>${escape(report.scope)}</p><p>Normalized size, colors, opacity and seed; paper removed from pairwise comparison. Native overlay and committed contacts are compared exactly; SVG antialias differences are measured.</p>`
    + `<p>10,000-sample stress: early mean ${report.longStroke.early.meanMs.toFixed(3)} ms, late mean ${report.longStroke.late.meanMs.toFixed(3)} ms; peak ${report.longStroke.maximumMarksPerAppend} contacts per append.</p>`
    + `<p>Whole-stroke Canvas: ${report.longStroke.committed.totalMs.toFixed(1)} ms; ${report.longStroke.committed.totalMarks.toLocaleString()} contacts, peak ${report.longStroke.committed.maxBatchMarks} per submitted batch; exact incremental pixels. Product SVG budget rejected: ${report.longStroke.svg.productBudgetRejected}. Fullpath SVG discarding sink: ${report.longStroke.svg.fullStreaming.serializedUtf16Bytes.toLocaleString()} UTF-16 bytes; largest chunk ${report.longStroke.svg.fullStreaming.largestChunkUtf16Bytes.toLocaleString()} bytes.</p>`
    + `<p><a href="report.json">Full observations and raw timing samples</a> · <a href="contact-sheet.png">Complete contact sheet</a></p></div>${cards}</body></html>`);
}

async function drawPen(page, session, replay = false) {
  const rect = await page.evaluate(() => window.__studioBrushV6Quality.location());
  const samplesMs = [];
  for (let index = 0; index <= 60; index += 1) {
    const progress = index / 60;
    const start = performance.now();
    await session.send("Input.dispatchMouseEvent", {
      type: index === 0 ? "mousePressed" : "mouseMoved",
      x: rect.x + rect.width * (0.08 + progress * 0.84),
      y: rect.y + rect.height * (0.52 + Math.sin(progress * Math.PI * 2.15) * 0.25),
      button: "left", buttons: 1, clickCount: index === 0 ? 1 : 0,
      pointerType: "pen", force: 0.12 + Math.sin(progress * Math.PI) * 0.86,
      tiltX: Math.round(35 * Math.sin(progress * Math.PI)), tiltY: 15,
      twist: Math.round(progress * 120),
    });
    samplesMs.push(performance.now() - start);
  }
  const live = await page.evaluate((isReplay) => window.__studioBrushV6Quality.capture(isReplay), replay);
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseReleased", x: rect.x + rect.width * 0.92,
    y: rect.y + rect.height * (0.52 + Math.sin(Math.PI * 2.15) * 0.25),
    button: "left", buttons: 0, clickCount: 1, pointerType: "pen", force: 0,
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return { samplesMs, live };
}

async function main() {
  mkdirSync(OUTPUT, { recursive: true });
  const server = await createServer({
    root: REPO_ROOT, configFile: false, envFile: false, appType: "custom", logLevel: "warn",
    resolve: { alias: [...WEB_VITE_ALIASES] },
    optimizeDeps: { entries: [ENTRY.slice(1)] },
    // Freeze loaded modules during evidence capture; another checkout task's edits must not reload a mid-stroke page.
    server: { host: "127.0.0.1", port: 0, hmr: false },
    plugins: [{
      name: "studio-brush-v6-quality",
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url !== "/") return next();
          response.setHeader("Content-Type", "text/html; charset=utf-8");
          response.end("<!doctype html><html><head><meta charset=\"utf-8\"><title>Studio material comparison</title>"
            + "<style>body{font:13px system-ui;margin:24px;background:#e8edf3;color:#172334}h1{font-size:24px}h2{font-size:16px;margin-bottom:4px}p{margin:6px 0}section{margin:0 0 22px}</style>"
            + "</head><body><h1>V6 material comparison</h1><p>Same size, colors, opacity and seed. Real Chromium pen input. Canvas2D execution.</p>"
            + `<script type=\"module\" src=\"${ENTRY}\"></script></body></html>`);
        });
      },
    }],
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 940, height: 920 }, deviceScaleFactor: 1 });
    page.on("console", (entry) => { if (entry.type() === "error") diagnostics.consoleErrors.push(entry.text()); });
    page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
    page.on("requestfailed", (request) => diagnostics.failedRequests.push(`${request.url()} ${request.failure()?.errorText}`));
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(() => Boolean(window.__studioBrushV6Quality));
    const session = await page.context().newCDPSession(page);
    const recipes = await page.evaluate(() => window.__studioBrushV6Quality.recipes);
    const results = [];
    for (const recipe of recipes) {
      const preview = await page.evaluate((id) => window.__studioBrushV6Quality.select(id), recipe.id);
      const first = await drawPen(page, session);
      const settled = await page.evaluate(() => window.__studioBrushV6Quality.capture(true));
      await page.evaluate(() => window.__studioBrushV6Quality.clear());
      await drawPen(page, session, true);
      const replay = await page.evaluate(() => window.__studioBrushV6Quality.capture(true));
      await page.locator(`#recipe-${recipe.id}`).screenshot({ path: join(OUTPUT, `${recipe.id}.png`) });
      results.push({ ...recipe, ...preview, live: first.live, settled, replay, inputRoundtripSamplesMs: first.samplesMs });
      console.log(`${recipe.id}: ${settled.paintedPixels} painted pixels`);
    }
    const observations = await page.evaluate(() => window.__studioBrushV6Quality.finish());
    const longStroke = await page.evaluate(() => window.__studioBrushV6Quality.stress());
    const failures = [...observations.failures, ...longStroke.failures];
    for (const [kind, errors] of Object.entries(diagnostics)) {
      if (errors.length > 0) failures.push(`${kind}: ${errors.join("; ")}`);
    }
    await page.screenshot({ path: join(OUTPUT, "contact-sheet.png"), fullPage: true });
    const report = {
      kind: "studio-brush-v6-material-quality-v1", generatedAt: new Date().toISOString(),
      backend: observations.backend, browserVersion: browser.version(),
      dimensions: { width: observations.width, height: observations.height },
      scope: "V6 reference and native pen input, actual saved config, main Studio native retained overlay and committed contacts, full SVG document export, JSON roundtrip and PNG decode; vertical/diagonal bristle and wet starts plus bristle relief output. No WebGPU, physical stylus latency or full editor UI automation.",
      normalization: { size: 26, opacity: 0.8, primaryColor: "#243c56", secondaryColor: "#76532f", seed: 912_2026 },
      minimumMaterialDistance: 0.025, results, longStroke, distances: observations.distances,
      diagnostics, failures, artifactDirectory: OUTPUT,
    };
    writeFileSync(join(OUTPUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    writeReviewIndex(report);
    console.log(`V6 material quality: ${results.length} recipes, ${failures.length} failures. ${OUTPUT}`);
    if (failures.length > 0) {
      console.error(failures.join("\n"));
      process.exitCode = 1;
    }
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  writeFileSync(join(OUTPUT, "failure.json"), `${JSON.stringify({ error: String(error), diagnostics }, null, 2)}\n`);
  process.exitCode = 1;
});
