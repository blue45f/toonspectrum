/** Native actual-VRM skirt matrix; isolated source harness, not a production editor UI test. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type Browser } from "playwright";
import { createServer } from "vite";

import { REPO_ROOT, WEB_PUBLIC, WEB_VITE_ALIASES } from "./lib/repo-paths.mjs";

const output = process.env.TOONSPECTRUM_SKIRT_QUALITY_OUT ?? join(tmpdir(), "studio-skirt-quality");
const expectedRenderer = process.env.TOONSPECTRUM_SKIRT_EXPECT_RENDERER ?? "apple|nvidia|amd|intel|radeon|adreno|mali";
new RegExp(expectedRenderer, "iu");
mkdirSync(output, { recursive: true });
const sourcePaths = [
  "apps/web/tools/browser-harnesses/studio-skirt-quality.ts",
  "apps/web/src/domains/creator/vrm/StudioVrmXpbdSkirtAttachment.tsx",
  "apps/web/src/domains/creator/vrm/studio-vrm-xpbd-skirt.ts",
  "apps/web/src/domains/creator/vrm/studio-vrm-skirt-body-profile.ts",
  "apps/web/src/domains/creator/vrm/studio-vrm-skirt-contact-projection.ts",
  "apps/web/src/domains/creator/vrm/studio-vrm-skirt-surface-contact.ts",
  "apps/web/src/domains/creator/vrm/studio-vrm-skirt-triangle-distance.ts",
  "apps/web/src/domains/creator/vrm/studio-vrm-skirt-waist-clearance.ts",
  "apps/web/src/domains/creator/vrm/studio-vrm-skirt-surface-escape.ts",
  "apps/web/src/domains/creator/vrm/studio-vrm-wardrobe.ts",
  "apps/web/src/domains/creator/vrm/StudioVrmWardrobePropsProjection.tsx",
];
const provenance = {
  head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim(),
  sourceSha256: Object.fromEntries(sourcePaths.map((path) => [path,
    createHash("sha256").update(readFileSync(join(REPO_ROOT, path))).digest("hex")])),
  assetSha256: Object.fromEntries(["sample.vrm", "AvatarSample_B.vrm"].map((name) => [name,
    createHash("sha256").update(readFileSync(join(WEB_PUBLIC, "vrm", name))).digest("hex")])),
  buildKind: "isolated-vite-source-harness", executablePath: chromium.executablePath(),
  expectedRenderer, physicalMobile: false, capsuleResidualLimitM: 0.001,
  limitation: "Capsule residual does not prove zero skin-mesh penetration. No cloth self-collision support or physical-mobile performance claim.",
};
const server = await createServer({
  root: REPO_ROOT, publicDir: WEB_PUBLIC, cacheDir: join(output, "vite-cache"),
  configFile: false, envFile: false, appType: "custom", logLevel: "error",
  resolve: { alias: [...WEB_VITE_ALIASES] },
  server: { host: "127.0.0.1", port: 0,
    fs: { allow: [REPO_ROOT, realpathSync(join(REPO_ROOT, "node_modules"))] } },
  optimizeDeps: { include: ["three", "@pixiv/three-vrm", "three/examples/jsm/loaders/GLTFLoader.js", "react", "react/jsx-runtime", "@react-three/fiber"] },
  plugins: [{ name: "studio-skirt-quality", configureServer(vite) {
    vite.middlewares.use((request, response, next) => {
      response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      response.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
      response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      if (request.url !== "/__studio_skirt_quality__") { next(); return; }
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end('<!doctype html><html><head><title>Native VRM skirt quality</title><style>body{margin:0;background:#e6ebef}</style></head><body><script type="module" src="/apps/web/tools/browser-harnesses/studio-skirt-quality.ts"></script></body></html>');
    });
  } }],
});
let browser: Browser | undefined;
let browserVersion = "";
const errors: string[] = [];
const screenshots: string[] = [];
let result: Record<string, unknown> = {};
const saveReport = (status: string) => writeFileSync(join(output, "result.json"), `${JSON.stringify({
  ...provenance, status, observedAt: new Date().toISOString(), browserVersion, result, errors, screenshots,
}, null, 2)}\n`);
try {
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("Harness server unavailable");
  browser = await chromium.launch({ headless: true, executablePath: chromium.executablePath() });
  browserVersion = browser.version();
  const page = await browser.newPage({ viewport: { width: 800, height: 900 } });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("crash", () => errors.push("Browser renderer crashed"));
  await page.exposeFunction("__saveSkirtEvidence", (id: unknown, png: unknown) => {
    if (typeof id !== "string" || !/^(sample|AvatarSample_B)-(pleated|longskirt)-(standing|sitting|stride)-(front|side)$/u.test(id)
      || typeof png !== "string" || !png.startsWith("data:image/png;base64,") || png.length > 12 * 1024 * 1024) {
      throw new Error("Invalid native PNG evidence payload");
    }
    if (screenshots.includes(`${id}.png`)) throw new Error(`Duplicate evidence ${id}`);
    const bytes = Buffer.from(png.slice("data:image/png;base64,".length), "base64");
    if (bytes.length < 24 || bytes.toString("hex", 0, 8) !== "89504e470d0a1a0a"
      || bytes.readUInt32BE(16) !== 800 || bytes.readUInt32BE(20) !== 900) throw new Error("Invalid PNG signature/dimensions");
    writeFileSync(join(output, `${id}.png`), bytes);
    screenshots.push(`${id}.png`);
  });
  await page.goto(`http://127.0.0.1:${address.port}/__studio_skirt_quality__`);
  await page.waitForFunction(() => typeof Reflect.get(window, "runStudioSkirtQuality") === "function", undefined, { timeout: 90000 });
  await page.evaluate((expected) => { void Reflect.get(window, "runStudioSkirtQuality")(expected); }, expectedRenderer);
  const deadline = Date.now() + 8 * 60000;
  let lastCount = -1;
  while (Date.now() < deadline) {
    result = await page.evaluate(() => ({ ...Reflect.get(window, "__studioSkirtQuality") }));
    if (result.cleanupComplete) break;
    const count = Array.isArray(result.cases) ? result.cases.length : 0;
    if (count !== lastCount) {
      lastCount = count;
      console.log(`[studio-skirt-quality] ${String(result.status)} cases=${count}/48 pngs=${screenshots.length}/24`);
      saveReport("running");
    }
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: join(output, "final-page.png") });
  if (!["passed", "completed-with-quality-rejections"].includes(String(result.status))
    || !result.cleanupComplete || errors.length > 0 || screenshots.length !== 24) {
    throw new Error(`Native skirt matrix failed/incomplete after ${Array.isArray(result.cases) ? result.cases.length : 0} cases: ${JSON.stringify(result.failures)}; errors=${JSON.stringify(errors)}`);
  }
  saveReport(String(result.status));
  if (result.status === "completed-with-quality-rejections") {
    // A complete audit with held cases is deliberately not a successful all-pose quality gate.
    process.exitCode = 2;
    console.warn(`[studio-skirt-quality] QUALITY REJECTIONS ${join(output, "result.json")}`);
  } else console.log(`[studio-skirt-quality] PASS ${join(output, "result.json")}`);
} catch (error) {
  errors.push(error instanceof Error ? error.stack ?? error.message : String(error));
  saveReport("failed");
  process.exitCode = 1;
  console.error(errors.at(-1));
} finally {
  await browser?.close();
  await server.close();
}
