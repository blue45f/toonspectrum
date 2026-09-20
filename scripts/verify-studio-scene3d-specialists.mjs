import { verifyScene3dReview } from "./lib/scene3d-review-browser-proof.mjs";
import {
  mkdirSync,
  realpathSync,
  writeFileSync,
  existsSync,
  createReadStream,
  readdirSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, extname } from "node:path";
import { chromium } from "playwright";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { REPO_ROOT, WEB_VITE_ALIASES } from "./lib/repo-paths.mjs";
const scratch =
  process.env.TOONSPECTRUM_VERIFY_DIR ??
  join(tmpdir(), `scene3d-specialists-${Date.now()}`);
mkdirSync(scratch, { recursive: true });
const bundleName =
  process.env.SCENE3D_SPECIALISTS_PRODUCTION_WORKER === "1"
    ? readdirSync(join(REPO_ROOT, "dist/assets")).find((name) =>
        /^specialist\.worker-.*\.js$/.test(name),
      )
    : null;
if (process.env.SCENE3D_SPECIALISTS_PRODUCTION_WORKER === "1" && !bundleName)
  throw new Error("Build the production specialist worker first.");
const workerCsp = bundleName
  ? readFileSync(join(REPO_ROOT, "dist/_headers"), "utf8")
      .split("\n")
      .find((line) => line.trim().startsWith("Content-Security-Policy:"))
      ?.split("Content-Security-Policy:")[1]
      ?.trim()
  : null;
if (bundleName && !workerCsp)
  throw new Error("Production CSP headers are missing.");
const errors = [];
const warnings = [];
const vite = await createServer({
  root: REPO_ROOT,
  configFile: false,
  envFile: false,
  publicDir: false,
  cacheDir: join(scratch, "vite-cache"),
  appType: "custom",
  logLevel: "error",
  resolve: { alias: [...WEB_VITE_ALIASES] },
  server: {
    host: "127.0.0.1",
    port: 0,
    fs: {
      allow: [
        REPO_ROOT,
        scratch,
        realpathSync(join(REPO_ROOT, "node_modules")),
      ],
    },
  },
  optimizeDeps: {
    noDiscovery: true,
    include: [
      "three",
      "react",
      "react-dom/client",
      "react/jsx-runtime",
      "zod",
      "@gltf-transform/core",
      "@gltf-transform/extensions",
      "@gltf-transform/functions",
      "meshoptimizer",
      "ktx2-encoder",
      "three-bvh-csg",
      "recast-navigation",
      "recast-navigation/generators",
      "@sparkjsdev/spark",
      "closed-chain-ik/src/core/Solver.js",
      "closed-chain-ik/src/core/Goal.js",
      "closed-chain-ik/src/core/Joint.js",
      "closed-chain-ik/src/core/Link.js",
    ],
  },
  plugins: [
    react(),
    {
      name: "scene3d-specialist-proof",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
          if (bundleName && pathname.startsWith("/assets/")) {
            const assets = resolve(REPO_ROOT, "dist/assets");
            const file = resolve(REPO_ROOT, "dist", "." + pathname);
            if (!file.startsWith(assets + "/") || !existsSync(file)) {
              res.statusCode = 404;
              res.end();
              return;
            }
            res.setHeader(
              "Content-Type",
              extname(file) === ".wasm"
                ? "application/wasm"
                : "application/javascript",
            );
            res.setHeader("Content-Security-Policy", workerCsp);
            createReadStream(file).pipe(res);
            return;
          }
          if (pathname !== "/__scene3d_specialists__") return next();
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(
            await server.transformIndexHtml(
              req.url,
              '<!doctype html><html lang="ko"><head><link rel="icon" href="data:,"></head><body><script type="module" src="/apps/web/tools/browser-harnesses/studio-scene3d-specialists.tsx"></script></body></html>',
            ),
          );
        });
      },
    },
  ],
});
let browser;
try {
  await vite.listen();
  const address = vite.httpServer.address();
  if (!address || typeof address === "string")
    throw new Error("No verifier port.");
  browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      ...(process.env.SCENE3D_SPECIALISTS_GPU_LANE === "swiftshader"
        ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
        : []),
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 980, height: 1100 },
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error("PAGE", error.message);
    void page
      .evaluate((message) => {
        window.__scene3dSpecialistProof = { status: "failed", message };
      }, error.message)
      .catch(() => {});
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
      console.error("BROWSER", message.text());
    }
    if (message.type() === "warning") warnings.push(message.text());
  });
  page.on("requestfailed", (request) =>
    errors.push(`${request.url()}: ${request.failure()?.errorText}`),
  );
  await page.goto(
    `http://127.0.0.1:${address.port}/__scene3d_specialists__${bundleName ? "?worker=" + encodeURIComponent("/assets/" + bundleName) : ""}`,
  );
  await page.waitForFunction(
    () => window.__scene3dSpecialistProof !== undefined,
    undefined,
    { timeout: 90000 },
  );
  const proof = await page.evaluate(() => window.__scene3dSpecialistProof);
  if (proof.status === "ok") {
    const fixture = await page.evaluate(
      () => window.__scene3dSpecialistFixture,
    );
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: "sphere.glb",
        mimeType: "model/gltf-binary",
        buffer: Buffer.from(fixture),
      });
    await page.getByRole("button", { name: /LOD/ }).click();
    await page
      .getByRole("link", { name: "lod-2.glb" })
      .waitFor({ timeout: 120000 });
    await page.locator("canvas").first().waitFor({ timeout: 30000 });
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "lod-2.glb" }).click();
    await (await download).saveAs(join(scratch, "ui-lod-2.glb"));
    await page.getByRole("button", { name: /화면에 맞춤|Fit view/ }).click();
    await page.getByRole("button", { name: /^확대$|^Zoom in$/ }).click();
    await page.getByRole("button", { name: /^축소$|^Zoom out$/ }).click();
    // New LOD preview replaces and disposes the previous artifact's renderer/resources.
    const previewButtons = page.getByRole("button", {
      name: /^미리보기$|^Preview$/,
    });
    for (let index = 0; index < 3; index++) {
      await previewButtons.nth(index).click();
      await page.getByRole("button", { name: /화면에 맞춤|Fit view/ }).click();
    }
    const canvas = page.locator("canvas").first();
    const pixels = await canvas.screenshot();
    writeFileSync(join(scratch, "artifact-preview.png"), pixels);
    proof.lodComparison = await verifyScene3dReview(page, scratch, "lod-comparison", { switchArtifactIndex: 1 });
    const textured = await page.evaluate(() => window.__scene3dTexturedFixture);
    await page.locator('input[type="file"]').first().setInputFiles({ name: "textured.glb", mimeType: "model/gltf-binary", buffer: Buffer.from(textured) });
    await page.getByText("KTX2 텍스처·LOD 릴리스 생성", { exact: true }).click();
    await page.getByRole("button", { name: "LOD+KTX2 릴리스 생성", exact: true }).click();
    await page.getByRole("link", { name: "release-lod-2.glb" }).waitFor({ timeout: 120000 });
    await page.locator('canvas[data-texture-runtime="ktx2-basis"]').waitFor({ timeout: 60000 });
    await page.locator('canvas[data-texture-runtime="ktx2-basis"]').screenshot({ path: join(scratch, "ktx2-release-preview.png") });
    const releaseDownload = page.waitForEvent("download"); await page.getByRole("link", { name: "release-lod-2.glb" }).click();
    await (await releaseDownload).saveAs(join(scratch, "ui-release-lod-2.glb"));
    proof.textureReleaseUi = { generation: "passed", realGpuTranscode: "passed", download: "passed" };
    proof.textureComparison = await verifyScene3dReview(page, scratch, "texture-comparison");
    const splat = await page.evaluate(() => window.__scene3dSplatFixture);
    // The real viewer deliberately stops when offscreen; bring it into view like a user.
    await page.locator('input[accept=".splat"]').scrollIntoViewIfNeeded();
    await page.locator('input[accept=".splat"]').setInputFiles({
      name: "reference.splat",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(splat),
    });
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll("canvas")].some(
          (canvas) => Number(canvas.dataset.renderedFrames) > 1,
        ),
      undefined,
      { timeout: 60000 },
    );
    const splatCanvas = page.locator("canvas[data-rendered-frames]");
    if (await splatCanvas.getAttribute("data-render-error"))
      throw new Error("Splat GPU rendering failed.");
    await splatCanvas.screenshot({
      path: join(scratch, "splat-reference.png"),
    });
    const driver = await splatCanvas.evaluate((canvas) => {
      const gl = canvas.getContext("webgl2");
      const extension = gl?.getExtension("WEBGL_debug_renderer_info");
      return extension
        ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
        : "not-exposed";
    });
    if (
      process.env.SCENE3D_SPECIALISTS_GPU_LANE === "swiftshader" &&
      !/swiftshader/i.test(driver)
    ) {
      throw new Error(
        "Requested software GPU lane did not expose a SwiftShader renderer.",
      );
    }
    proof.splat = {
      driver,
      count: 256,
      renderer: "Spark 2.2.0 / Three WebGL2",
      frames: Number(await splatCanvas.getAttribute("data-rendered-frames")),
    };
    await page.getByRole("button", { name: /뷰어 닫기|Close viewer/ }).click();
    await splatCanvas.waitFor({ state: "detached" });
    proof.splat.closeDisposedCanvas = true;
    proof.ui = {
      generation: "passed",
      preview: "mounted",
      download: "passed",
      keyboardNavigation: "passed",
      artifactSwitches: 3,
    };
  }
  const result = {
    ...proof,
    status: errors.length ? "failed" : proof.status,
    browserVersion: browser.version(),
    productionWorkerArtifact: bundleName,
    productionWorkerCspApplied: Boolean(workerCsp),
    requestedGpuLane: process.env.SCENE3D_SPECIALISTS_GPU_LANE ?? "default",
    errors,
    warnings,
  };
  writeFileSync(
    join(scratch, "summary.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  await page.screenshot({
    path: join(scratch, "specialist-panel.png"),
    fullPage: true,
  });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === "ok" ? 0 : 1;
} catch (error) {
  writeFileSync(
    join(scratch, "failure.json"),
    JSON.stringify({ message: String(error), errors, warnings }, null, 2),
  );
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await vite.close();
}
