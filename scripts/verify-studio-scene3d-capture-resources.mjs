/** Real browser HDR, pooled-resource ownership and 2K/4K capture proof. No API server required. */
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { REPO_ROOT, WEB_VITE_ALIASES } from "./lib/repo-paths.mjs";

const scratch = process.env.TOONSPECTRUM_VERIFY_DIR ?? join(tmpdir(), `scene3d-capture-${Date.now()}`);
const lane = process.env.SCENE3D_CAPTURE_GPU_LANE ?? "hardware";
if (!["hardware", "swiftshader"].includes(lane)) throw new Error("Unknown capture proof lane.");
mkdirSync(scratch, { recursive: true });
const errors = [];
const vite = await createServer({
  root: REPO_ROOT, configFile: false, envFile: false, publicDir: false,
  cacheDir: join(scratch, "vite-cache"), appType: "custom", logLevel: "error",
  resolve: { alias: [...WEB_VITE_ALIASES] },
  server: { host: "127.0.0.1", port: 0,
    fs: { allow: [REPO_ROOT, scratch, realpathSync(join(REPO_ROOT, "node_modules"))] } },
  optimizeDeps: { noDiscovery: true, include: ["three", "three/webgpu", "three/tsl",
    "three/examples/jsm/postprocessing/OutputPass.js"] },
  plugins: [{ name: "scene3d-capture-proof", configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url !== "/__scene3d_capture__") return next();
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end('<!doctype html><html><head><link rel="icon" href="data:,"></head><body><h1>Scene3D HDR capture proof</h1><script type="module" src="/apps/web/tools/browser-harnesses/studio-scene3d-capture-resources.ts"></script></body></html>');
    });
  } }],
});
let browser;
try {
  await vite.listen();
  const address = vite.httpServer.address();
  if (!address || typeof address === "string") throw new Error("No verifier port.");
  browser = await chromium.launch({ headless: true, executablePath: chromium.executablePath(),
    args: ["--no-sandbox", "--enable-unsafe-webgpu", ...(lane === "swiftshader"
      ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [])] });
  const page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("requestfailed", (request) => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  await page.goto(`http://127.0.0.1:${address.port}/__scene3d_capture__`);
  await page.waitForFunction(() => window.__scene3dCaptureProof !== undefined, undefined, { timeout: 120_000 });
  const proof = await page.evaluate(() => window.__scene3dCaptureProof);
  if (lane === "hardware" && proof.status === "ok" && proof.actualDevice?.isFallbackAdapter !== false) {
    errors.push("The actual renderer did not prove a hardware adapter; no hardware performance claim is allowed.");
  }
  if (lane === "swiftshader" && proof.status === "ok" && !/swiftshader/i.test(proof.actualDevice?.architecture ?? "")) {
    errors.push("The requested SwiftShader lane was not the actual renderer device.");
  }
  const result = { ...proof, status: errors.length ? "failed" : proof.status,
    lane, browserVersion: browser.version(), errors };
  writeFileSync(join(scratch, "summary.json"), JSON.stringify(result, null, 2) + "\n");
  await page.screenshot({ path: join(scratch, "capture-proof.png"), fullPage: true });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === "ok" ? 0 : result.status === "unsupported" ? 2 : 1;
} finally {
  await browser?.close(); await vite.close();
}
