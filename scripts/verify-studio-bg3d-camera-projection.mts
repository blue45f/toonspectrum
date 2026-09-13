/** Standalone, serialized five-pass camera proof; defaults to production preview. */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium, type Browser } from "playwright";

import { runStudioBg3dCameraGpuProof } from "./lib/studio-bg3d-camera-gpu-proof";
import { runStudioBg3dTextureGpuProof } from "./lib/studio-bg3d-texture-gpu-proof";
import { findFreePort, stopChildProcess, waitForServer } from "./lib/studio-verify-preview-harness.mjs";

const source = process.argv.includes("--source");
const outDir = process.env.TOONSPECTRUM_BG3D_CAMERA_VERIFY_DIR ?? "/private/tmp/shaper-remaining-camera-gpu";
mkdirSync(outDir, { recursive: true });
const port = await findFreePort();
const origin = `http://127.0.0.1:${port}/`;
let server: ChildProcess | undefined;
let browser: Browser | undefined;
try {
  server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", ...(source ? [] : ["preview"]),
    "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: process.cwd(), env: process.env, stdio: "ignore" });
  await waitForServer(origin);
  const find = (pattern: RegExp) => {
    const files = readdirSync(join(process.cwd(), "dist/assets")).filter((name) => pattern.test(name));
    if (files.length !== 1) throw new Error(`Expected one production ${pattern}, found ${files.length}`);
    return new URL(`assets/${files[0]}`, origin).href;
  };
  const urls = source ? {
    three: new URL("tools/browser-harnesses/studio-bg3d-camera-proof-deps.ts", origin).href,
    gltfLoader: new URL("tools/browser-harnesses/studio-bg3d-camera-proof-deps.ts", origin).href,
    babylon: new URL("src/domains/creator/bg3d/studio-bg3d-babylon-specialist-entry.ts", origin).href,
  } : {
    three: find(/^three\.module-[A-Za-z0-9_-]+\.js$/u),
    gltfLoader: find(/^GLTFLoader-[A-Za-z0-9_-]+\.js$/u),
    babylon: find(/^studio-bg3d-babylon-specialist-entry-[A-Za-z0-9_-]+\.js$/u),
  };
  // Full Chromium preserves native Metal WebGPU; a software lane is not native evidence.
  browser = await chromium.launch({ channel: "chromium", headless: false, args: ["--no-sandbox"] });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  // Isolate actual production rendering modules from the unrelated homepage API requests.
  // This is an engine capture proof, not a production editor UI or backend test.
  const proofUrl = new URL("__studio_bg3d_camera_proof__", origin).href;
  await page.route(proofUrl, (route) => route.fulfill({ contentType: "text/html",
    body: "<!doctype html><html><head><title>Production BG3D capture proof</title></head><body></body></html>" }));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const result = await runStudioBg3dCameraGpuProof(page, proofUrl, urls);
  const textures = process.argv.includes("--textures")
    ? await runStudioBg3dTextureGpuProof(page, proofUrl, urls) : undefined;
  if (errors.length) throw new Error(`Projection page errors: ${JSON.stringify(errors)}`);
  if (/swiftshader|llvmpipe|software/iu.test(result.webglRenderer)) throw new Error("Expected native GPU renderer");
  for (const capture of result.results.filter((item) => item.backend === "webgpu")) {
    const nativeAdapter = capture.diagnostics.some((diagnostic) => {
      if (!diagnostic || typeof diagnostic !== "object" || Reflect.get(diagnostic, "kind") !== "adapter-ready") return false;
      const adapter = Reflect.get(diagnostic, "adapter");
      return adapter && typeof adapter === "object" && Reflect.get(adapter, "isFallbackAdapter") === false;
    });
    if (!nativeAdapter) throw new Error(`Native WebGPU adapter was not confirmed for ${capture.label}`);
  }
  writeFileSync(join(outDir, "camera-projection.json"), JSON.stringify({ source, origin, texturesVerified: process.argv.includes("--textures"),
    browser: browser.version(), errors, textures, ...result }, null, 2));
} finally {
  await browser?.close();
  if (server) await stopChildProcess(server);
}
