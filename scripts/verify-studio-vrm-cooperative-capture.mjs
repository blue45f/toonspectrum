import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright";
import { createServer } from "vite";

import { REPO_ROOT, WEB_PUBLIC, WEB_VITE_ALIASES } from "./lib/repo-paths.mjs";

const output = process.env.TOONSPECTRUM_VERIFY_DIR ?? join(tmpdir(), "studio-vrm-cooperative-capture");
const lane = process.env.TOONSPECTRUM_CHARACTER_GPU_LANE ?? "native";
if (!["native", "swiftshader"].includes(lane)) throw new Error("Unknown GPU lane");
mkdirSync(output, { recursive: true });
const server = await createServer({
  root: REPO_ROOT, publicDir: WEB_PUBLIC, cacheDir: join(output, "vite-cache"),
  configFile: false, envFile: false, appType: "custom", logLevel: "error",
  resolve: { alias: [...WEB_VITE_ALIASES] },
  server: { host: "127.0.0.1", port: 0,
    fs: { allow: [REPO_ROOT, realpathSync(join(REPO_ROOT, "node_modules"))] } },
  optimizeDeps: { include: ["three", "@pixiv/three-vrm", "three/examples/jsm/loaders/GLTFLoader.js"] },
  plugins: [{ name: "vrm-cooperative-capture-verifier", configureServer(vite) {
    vite.middlewares.use((request, response, next) => {
      if (request.url !== "/__vrm_capture__") { next(); return; }
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end('<!doctype html><html><head><title>VRM cooperative capture</title></head><body><script type="module" src="/apps/web/tools/browser-harnesses/vrm-cooperative-capture.ts"></script></body></html>');
    });
  } }],
});
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === "string") throw new Error("Verifier port unavailable");
  browser = await chromium.launch({ headless: true, executablePath: chromium.executablePath(),
    args: lane === "native" ? ["--no-sandbox"] : ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${address.port}/__vrm_capture__`);
  await page.waitForFunction(() => Boolean(window.__vrmCaptureResult), undefined, { timeout: 180_000 });
  const result = await page.evaluate(() => window.__vrmCaptureResult);
  const rendererName = String(result.gpu?.renderer ?? "");
  const software = /swiftshader|llvmpipe|software/iu.test(rendererName);
  const gpuLaneMatches = rendererName.length > 0 && software === (lane === "swiftshader")
    && (lane !== "native" || /apple|nvidia|amd|intel|radeon/iu.test(rendererName));
  const evidence = { ...result, status: result.status === "passed" && errors.length === 0 && gpuLaneMatches ? "passed" : "failed",
    lane, gpuLaneMatches, browserVersion: browser.version(), errors };
  writeFileSync(join(output, "result.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  await page.screenshot({ path: join(output, "scene.png") });
  if (evidence.status !== "passed") throw new Error(JSON.stringify(evidence));
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
