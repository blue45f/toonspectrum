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
  join(tmpdir(), `scene3d-recipe-reuse-${Date.now()}`);
mkdirSync(scratch, { recursive: true });
const bundleName = readdirSync(join(REPO_ROOT, "dist/assets")).find((name) =>
  /^specialist\.worker-.*\.js$/.test(name),
);
if (!bundleName)
  throw new Error("Build the real production processing Worker first.");
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
      name: "scene3d-recipe-proof",
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
          if (pathname !== "/__scene3d_recipe_reuse__") return next();
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(
            await server.transformIndexHtml(
              req.url,
              '<!doctype html><html lang="ko"><head><link rel="icon" href="data:,"></head><body><script type="module" src="/apps/web/tools/browser-harnesses/studio-scene3d-recipe-reuse.tsx"></script></body></html>',
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
    viewport: { width: 1000, height: 1100 },
    acceptDownloads: true,
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error(error);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
      console.error(message.text());
    }
    if (message.type() === "warning") warnings.push(message.text());
  });
  page.on("requestfailed", (request) =>
    errors.push(`${request.url()}: ${request.failure()?.errorText}`),
  );
  await page.goto(
    `http://127.0.0.1:${address.port}/__scene3d_recipe_reuse__?worker=${encodeURIComponent("/assets/" + bundleName)}`,
  );
  await page.waitForFunction(
    () => window.__scene3dRecipeProof !== undefined,
    undefined,
    { timeout: 180000 },
  );
  const proof = await page.evaluate(() => window.__scene3dRecipeProof);
  if (proof.status === "ok") {
    const source = await page.evaluate(() => window.__scene3dRecipeFixture);
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: "sphere.glb",
        mimeType: "model/gltf-binary",
        buffer: Buffer.from(source),
      });
    const before = await page.evaluate(() => window.__scene3dRecipeMetrics());
    await page
      .getByRole("button", { name: /LOD 3단계 생성|Generate 3 LODs/ })
      .click();
    await page
      .getByRole("link", { name: "lod-2.glb", exact: true })
      .waitFor({ timeout: 120000 });
    await page.locator("canvas").waitFor({ timeout: 30000 });
    const afterFirst = await page.evaluate(() =>
      window.__scene3dRecipeMetrics(),
    );
    if (afterFirst.started !== before.started + 1)
      throw new Error("First UI job did not use the actual Worker.");
    await page
      .getByRole("button", { name: /LOD 3단계 생성|Generate 3 LODs/ })
      .click();
    await page
      .getByText(/검증된 가공 결과 재사용|Verified processing result reused/)
      .waitFor({ timeout: 30000 });
    await page.getByRole("link", { name: "lod-2.glb", exact: true }).waitFor();
    await page.locator("canvas").waitFor({ timeout: 30000 });
    const afterSecond = await page.evaluate(() =>
      window.__scene3dRecipeMetrics(),
    );
    if (
      afterSecond.started !== afterFirst.started ||
      afterSecond.cache.hits !== afterFirst.cache.hits + 1
    )
      throw new Error("UI repeated job did not reuse the verified result.");
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "lod-2.glb", exact: true }).click();
    await (await download).saveAs(join(scratch, "reused-lod-2.glb"));
    await page
      .locator("canvas")
      .screenshot({ path: join(scratch, "reused-artifact.png") });
    await page.screenshot({
      path: join(scratch, "reuse-panel.png"),
      fullPage: true,
    });
    // BFCache-style lifecycle event: product cache must drop all private references.
    await page.evaluate(() =>
      window.dispatchEvent(
        new PageTransitionEvent("pagehide", { persisted: true }),
      ),
    );
    const afterHide = await page.evaluate(() =>
      window.__scene3dRecipeMetrics(),
    );
    if (
      afterHide.cache.entries !== 0 ||
      afterHide.cache.bytes !== 0 ||
      afterHide.active !== 0 ||
      afterHide.queue.snapshotBytes !== 0
    )
      throw new Error(
        "Page departure retained results or running Worker leases.",
      );
    proof.ui = {
      first: afterFirst,
      second: afterSecond,
      afterPagehide: afterHide,
      reusedWithoutWorker: true,
      previewMounted: true,
      fileDownloaded: true,
    };
  }
  const result = {
    ...proof,
    status: errors.length ? "failed" : proof.status,
    browserVersion: browser.version(),
    productionWorker: bundleName,
    productionWorkerCspApplied: Boolean(workerCsp),
    errors,
    warnings,
    requestedGpuLane: process.env.SCENE3D_SPECIALISTS_GPU_LANE ?? "default",
  };
  writeFileSync(
    join(scratch, "summary.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
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
