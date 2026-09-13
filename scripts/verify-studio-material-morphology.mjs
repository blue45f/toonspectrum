/** Browser pixels and measured CPU submission on the real shared product renderer. */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(process.env.TOONSPECTRUM_MATERIAL_VERIFY_DIR || join(tmpdir(), "studio-material-morphology"));
mkdirSync(output, { recursive: true });
const harness = "/__material_morphology_audit__";
const vite = await createServer({
  configFile: false, root,
  resolve: { alias: { "@": join(root, "apps/web/src") } },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
  plugins: [{ name: "material-morphology-audit", configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url !== harness) { next(); return; }
      res.setHeader("Content-Type", "text/html");
      res.end('<!doctype html><meta charset="utf-8"><title>Material renderer audit</title><body>Material renderer audit</body>');
    });
  } }],
});
let browser;
const diagnostics = [];
try {
  await vite.listen();
  const address = vite.httpServer.address();
  if (!address || typeof address === "string") throw new Error("Missing audit server port");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  page.on("pageerror", (error) => diagnostics.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}${harness}`);
  const result = await page.evaluate(async () => {
    const entry = await import("/scripts/studio-material-morphology-browser.ts");
    return entry.auditStudioMaterialMorphology();
  });
  for (const [index, png] of result.sheets.entries()) {
    writeFileSync(join(output, `materials-${index + 1}.png`), Buffer.from(png.split(",")[1], "base64"));
  }
  delete result.sheets;
  writeFileSync(join(output, "report.json"), `${JSON.stringify({ ...result, diagnostics }, null, 2)}\n`);
  if (diagnostics.length) throw new Error(diagnostics.join("\n"));
  console.log(JSON.stringify({ count: result.cases.length, ...result.performance, output }));
} catch (error) {
  writeFileSync(join(output, "failure.json"), JSON.stringify({ error: String(error), diagnostics }, null, 2));
  throw error;
} finally {
  await browser?.close();
  await vite.close();
}
