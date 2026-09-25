import {
  mkdirSync,
  realpathSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  createReadStream,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, extname } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { REPO_ROOT, WEB_VITE_ALIASES } from "./lib/repo-paths.mjs";

const PRODUCTION_TILED_WORKER_PATH = "/__scene3d_tiled_worker__.js";
const PRODUCTION_PSD_WORKER_PATH = "/__scene3d_psd_worker__.js";
const scratch =
  process.env.TOONSPECTRUM_VERIFY_DIR ??
  join(tmpdir(), `scene3d-tiles-${Date.now()}`);
mkdirSync(scratch, { recursive: true });
const lane = process.env.SCENE3D_CAPTURE_GPU_LANE ?? "hardware";
const built =
  process.env.SCENE3D_TILED_PRODUCTION_WORKER === "1"
    ? readdirSync(join(REPO_ROOT, "dist/assets")).find((name) =>
        /^studio-bg3d-tiled-artifact\.worker-.*\.js$/.test(name),
      )
    : null;
if (process.env.SCENE3D_TILED_PRODUCTION_WORKER === "1" && !built)
  throw new Error("Build the real tile Worker first.");
const psdBuilt = built
  ? readdirSync(join(REPO_ROOT, "dist/assets")).find((name) =>
      /^studio-bg3d-shot-psd\.worker-.*\.js$/.test(name),
    )
  : null;
const csp = built
  ? readFileSync(join(REPO_ROOT, "dist/_headers"), "utf8")
      .split("\n")
      .find((line) => line.trim().startsWith("Content-Security-Policy:"))
      ?.split("Content-Security-Policy:")[1]
      ?.trim()
  : null;
if (built && !csp) throw new Error("Production CSP missing.");
const errors = [],
  warnings = [],
  downloads = [];
const vite = await createServer({
  root: REPO_ROOT,
  configFile: false,
  envFile: false,
  publicDir: false,
  cacheDir: process.env.SCENE3D_VERIFY_CACHE ?? join(scratch, "vite-cache"),
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
      "three/webgpu",
      "three/tsl",
      "zod",
      "react",
      "react-dom",
      "ag-psd",
      "three/examples/jsm/postprocessing/OutputPass.js",
    ],
  },
  plugins: [
    {
      name: "scene3d-tiled-proof",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = new URL(req.url ?? "/", "http://localhost");
          const aliasedWorker = url.pathname === PRODUCTION_TILED_WORKER_PATH
            ? built
            : url.pathname === PRODUCTION_PSD_WORKER_PATH
              ? psdBuilt
              : null;
          if (aliasedWorker) {
            const file = resolve(REPO_ROOT, "dist/assets", aliasedWorker);
            if (!existsSync(file)) {
              res.statusCode = 404;
              res.end();
              return;
            }
            res.setHeader("Content-Security-Policy", csp);
            res.setHeader("Content-Type", "application/javascript");
            createReadStream(file).pipe(res);
            return;
          }
          if (built && url.pathname.startsWith("/assets/")) {
            const assets = resolve(REPO_ROOT, "dist/assets"),
              file = resolve(REPO_ROOT, "dist", "." + url.pathname);
            if (!file.startsWith(assets + "/") || !existsSync(file)) {
              res.statusCode = 404;
              res.end();
              return;
            }
            res.setHeader("Content-Security-Policy", csp);
            res.setHeader(
              "Content-Type",
              extname(file) === ".wasm"
                ? "application/wasm"
                : "application/javascript",
            );
            createReadStream(file).pipe(res);
            return;
          }
          if (url.pathname !== "/__scene3d_tiles__") return next();
          res.setHeader("Content-Type", "text/html;charset=utf-8");
          res.end(
            '<!doctype html><html><head><link rel="icon" href="data:,"></head><body><h1>Bounded Scene3D tiled output</h1><script type="module" src="/apps/web/tools/browser-harnesses/studio-scene3d-tiled-output.ts"></script></body></html>',
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
  if (!address || typeof address === "string") throw new Error("No port");
  browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--enable-unsafe-webgpu",
      ...(lane === "swiftshader"
        ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
        : process.platform === "darwin"
          ? ["--use-gl=angle", "--use-angle=metal"]
          : []),
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1100, height: 900 },
  });
  page.on("download", (download) =>
    downloads.push(
      download.saveAs(join(scratch, `saved-shot-${downloads.length}.zip`)),
    ),
  );
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error(error.message);
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
  const productionWorkerQuery = built
    ? `?productionTiledWorker=1${psdBuilt ? "&productionPsdWorker=1" : ""}`
    : "";
  await page.goto(
    `http://127.0.0.1:${address.port}/__scene3d_tiles__${productionWorkerQuery}`,
  );
  await page.waitForFunction(
    () => window.__scene3dTiledProof !== undefined,
    undefined,
    { timeout: 240000 },
  );
  const proof = await page.evaluate(() => window.__scene3dTiledProof);
  if (
    proof.status === "ok" &&
    lane === "hardware" &&
    proof.actualDevice?.isFallbackAdapter !== false
  )
    errors.push("Hardware GPU not confirmed.");
  if (
    proof.status === "ok" &&
    lane === "swiftshader" &&
    !/swiftshader/i.test(proof.actualDevice?.architecture ?? "")
  )
    errors.push("SwiftShader not confirmed.");
  await Promise.all(downloads);
  const result = {
    ...proof,
    status: errors.length ? "failed" : proof.status,
    lane,
    browserVersion: browser.version(),
    workerCspApplied: Boolean(csp),
    errors,
    warnings,
  };
  writeFileSync(
    join(scratch, "summary.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  await page.screenshot({
    path: join(scratch, "tiled-output.png"),
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
