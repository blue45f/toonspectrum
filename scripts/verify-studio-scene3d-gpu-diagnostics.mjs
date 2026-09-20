import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { build } from "vite";
import { REPO_ROOT, WEB_VITE_ALIASES } from "./lib/repo-paths.mjs";

const scratch = process.env.TOONSPECTRUM_VERIFY_DIR ?? join(tmpdir(), `scene3d-gpu-proof-${Date.now()}`);
const lane = process.env.SCENE3D_GPU_LANE ?? "hardware";
if (!["hardware", "swiftshader"].includes(lane)) throw new Error("Unknown GPU lane");
const dist = join(scratch, "bundle");
mkdirSync(dist, { recursive: true });
await build({ root: REPO_ROOT, configFile: false, envFile: false, publicDir: false,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  logLevel: "warn", resolve: { alias: [...WEB_VITE_ALIASES] },
  build: { outDir: dist, emptyOutDir: true, minify: false,
    lib: { entry: join(REPO_ROOT, "apps/web/tools/browser-harnesses/studio-scene3d-gpu-diagnostics.tsx"),
      formats: ["es"], fileName: () => "proof.js" } } });
const errors = [];
const server = createServer((req, res) => {
  res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; img-src 'self' data:; style-src 'self'; connect-src 'self'");
  if (req.url === "/proof.js") { res.setHeader("Content-Type", "text/javascript"); res.end(readFileSync(join(dist, "proof.js"))); }
  else if (req.url === "/") { res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end('<!doctype html><html><head><link rel="icon" href="data:,"></head><body><h1>GPU diagnostics proof</h1><script type="module" src="/proof.js"></script></body></html>'); }
  else { res.statusCode = 404; res.end(); }
});
let browser;
try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({ headless: true, args: ["--enable-unsafe-webgpu", "--no-sandbox",
    ...(lane === "swiftshader" ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [])] });
  const page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("requestfailed", (req) => errors.push(`${req.url()}: ${req.failure()?.errorText}`));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.__scene3dGpuProof !== undefined, undefined, { timeout: 30_000 });
  const proof = await page.evaluate(() => ({ ...window.__scene3dGpuProof, trace: window.__gpuTrace }));
  if (proof.status === "ok" && lane === "swiftshader"
    && !/swiftshader/i.test(JSON.stringify(proof.actualDevice))) errors.push("Actual device is not SwiftShader");
  const result = { ...proof, status: errors.length ? "failed" : proof.status, lane,
    browserVersion: browser.version(), errors, scope: "built isolated diagnostics UI and real Three renderer; not the full application route" };
  writeFileSync(join(scratch, "summary.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === "ok" ? 0 : result.status === "unsupported" ? 2 : 1;
} catch (error) {
  const result = { status: "failed", lane, errors, error: String(error) };
  writeFileSync(join(scratch, "summary.json"), JSON.stringify(result, null, 2) + "\n");
  console.error(JSON.stringify(result, null, 2)); process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
