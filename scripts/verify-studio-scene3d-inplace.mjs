import { verifyScene3dReview } from "./lib/scene3d-review-browser-proof.mjs";
import {
  mkdirSync,
  existsSync,
  realpathSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  createReadStream,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, extname } from "node:path";
import { chromium } from "playwright";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { REPO_ROOT, WEB_VITE_ALIASES } from "./lib/repo-paths.mjs";
const output =
  process.env.TOONSPECTRUM_VERIFY_DIR ??
  join(tmpdir(), `scene3d-inplace-${Date.now()}`);
mkdirSync(output, { recursive: true });
const operation = process.env.SCENE3D_INPLACE_OPERATION === "release" ? "release" : "lod";
const artifactName = operation === "release" ? "release-lod-2.glb" : "lod-2.glb";
const production = process.env.SCENE3D_SPECIALISTS_PRODUCTION_WORKER === "1";
const worker = production
  ? readdirSync(join(REPO_ROOT, "dist/assets")).find((name) =>
      /^specialist\.worker-.*\.js$/.test(name),
    )
  : null;
if (production && !worker)
  throw new Error("Build the production processing worker first.");
const csp = production
  ? readFileSync(join(REPO_ROOT, "dist/_headers"), "utf8")
      .split("\n")
      .find((line) => line.trim().startsWith("Content-Security-Policy:"))
      ?.split("Content-Security-Policy:")[1]
      ?.trim()
  : null;
if (production && !csp) throw new Error("Production CSP is missing.");
const errors = [];
const warnings = [];
const server = await createServer({
  root: REPO_ROOT,
  configFile: false,
  envFile: false,
  publicDir: false,
  cacheDir: join(output, "vite-cache"),
  appType: "custom",
  logLevel: "error",
  resolve: { alias: [...WEB_VITE_ALIASES] },
  server: {
    host: "127.0.0.1",
    port: 0,
    fs: {
      allow: [REPO_ROOT, realpathSync(join(REPO_ROOT, "node_modules")), output],
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
      "@gltf-transform/functions",
      "@gltf-transform/extensions",
      "meshoptimizer",
      "@sqlite.org/sqlite-wasm",
    ],
  },
  plugins: [
    react(),
    {
      name: "scene3d-inplace-verification",
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          const path = new URL(req.url ?? "/", "http://localhost").pathname;
          if (worker && path.startsWith("/assets/")) {
            const file = resolve(REPO_ROOT, "dist", "." + path);
            if (
              !file.startsWith(resolve(REPO_ROOT, "dist/assets") + "/") ||
              !existsSync(file)
            ) {
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
            res.setHeader("Content-Security-Policy", csp);
            createReadStream(file).pipe(res);
            return;
          }
          if (path !== "/__scene3d_inplace__") return next();
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(
            await vite.transformIndexHtml(
              req.url,
              '<!doctype html><html lang="ko"><head><link rel="icon" href="data:,"></head><body><script type="module" src="/apps/web/tools/browser-harnesses/studio-scene3d-inplace.tsx"></script></body></html>',
            ),
          );
        });
      },
    },
  ],
});
let browser;
let page;
try {
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === "string")
    throw new Error("No verifier port.");
  browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  page = await browser.newPage({ viewport: { width: 1000, height: 1100 } });
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error("PAGE", error.stack);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
      console.error("BROWSER", message.text());
    } else if (message.type() === "warning") warnings.push(message.text());
  });
  page.on("requestfailed", (request) =>
    errors.push(`${request.url()}: ${request.failure()?.errorText}`),
  );
  await page.goto(
    `http://127.0.0.1:${address.port}/__scene3d_inplace__?operation=${operation}${worker ? "&worker=" + encodeURIComponent("/assets/" + worker) : ""}`,
    { waitUntil: "commit", timeout: 120000 },
  );
  const ready = async () => {
    await page.waitForFunction(
      () => Boolean(window.__scene3dInplace || window.__scene3dInplaceError),
      undefined,
      { timeout: 120000 },
    );
    const error = await page.evaluate(() => window.__scene3dInplaceError);
    if (error) throw new Error(error);
  };
  console.log("Waiting for the real OPFS editor fixture");
  await ready();
  await page
    .getByRole("button", { name: "선택 모델에서 원본 가져오기" })
    .click();
  if (operation === "release") {
    await page.locator("summary").filter({ hasText: "KTX2 텍스처·LOD 릴리스 생성" }).click();
    await page.getByRole("button", { name: "LOD+KTX2 릴리스 생성", exact: true }).click();
  } else await page.getByRole("button", { name: "LOD 3단계 생성" }).click();
  await page
    .getByRole("button", { name: `${artifactName} 선택 객체에 적용`, exact: true })
    .waitFor({ timeout: 120000 });
  await page.getByRole("button", { name: /^미리보기$|^Preview$/ }).nth(2).click();
  await page.locator(`canvas[data-review-ready="true"][data-review-artifact="${artifactName}"]`).waitFor({ timeout: 60000 });
  const unchangedBeforeReview = await page.evaluate(() => window.__scene3dInplace.assertUnchanged());
  const comparison = await verifyScene3dReview(page, output, "inplace-comparison");
  const unchangedAfterReview = await page.evaluate(() => window.__scene3dInplace.assertUnchanged());
  await page
    .getByRole("button", { name: `${artifactName} 선택 객체에 적용`, exact: true })
    .click();
  await page.waitForFunction(() => document.body.innerText.includes("선택 객체에 적용했습니다") || document.querySelector('[role="alert"]'), undefined, { timeout: 120000 });
  const alert = await page.locator('[role="alert"]').allTextContents();
  if (alert.length) throw new Error("In-place apply failed: " + alert.join("; "));
  const applied = await page.evaluate(() => window.__scene3dInplace.check());
  await page.screenshot({
    path: join(output, "inplace-applied.png"),
    fullPage: true,
  });
  await page.reload({ waitUntil: "commit", timeout: 120000 });
  await ready();
  const reopened = await page.evaluate(
    (serialized) => window.__scene3dInplace.reopen(serialized),
    applied.serialized,
  );
  await page.screenshot({
    path: join(output, "inplace-reopened.png"),
    fullPage: true,
  });
  const proof = {
    status: errors.length ? "failed" : "ok",
    browserVersion: browser.version(),
    builtProcessingWorker: worker,
    productionWorkerCspApplied: Boolean(csp),
    comparison,
    unchangedBeforeReview,
    unchangedAfterReview,
    applied,
    reopened,
    errors,
    warnings,
  };
  writeFileSync(
    join(output, "summary.json"),
    JSON.stringify(proof, null, 2) + "\n",
  );
  console.log(JSON.stringify(proof, null, 2));
  process.exitCode = proof.status === "ok" ? 0 : 1;
} catch (error) {
  const stage = await page?.evaluate(() => window.__scene3dInplaceStage).catch(() => "page-unavailable");
  const failure = {
    stage,
    status: "failed",
    message: String(error),
    errors,
    warnings,
  };
  writeFileSync(join(output, "failure.json"), JSON.stringify(failure, null, 2));
  await page
    ?.screenshot({ path: join(output, "failure.png"), fullPage: true })
    .catch(() => {});
  console.error(error, failure);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
