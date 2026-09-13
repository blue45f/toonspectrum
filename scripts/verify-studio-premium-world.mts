import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { createServer } from "vite";

import { DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES, validateStudioBg3dGlb } from "../apps/web/src/domains/creator/bg3d/studio-bg3d-glb-validation";

import type { PremiumWorldRuntime } from "../apps/web/tools/browser-harnesses/premium-world-runtime";
import type { GltfValidatorApi } from "./types/gltf-validator";

type Candidate = { id: string; slug: string; kind: "scene" | "prop"; byteSize: number; sha256: string; bounds: number[] };
const root = fileURLToPath(new URL("../", import.meta.url));
const stage = path.resolve(process.argv[2] ?? "artifacts/studio-premium-world-v1");
assert(stage.startsWith(path.join(root, "artifacts") + path.sep), "Use an isolated repository artifacts directory");
const output = path.join(stage, "runtime-review");
await mkdir(output, { recursive: true });
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const validator = createRequire(import.meta.url)("gltf-validator") as GltfValidatorApi;
const entries: Candidate[] = [];
for (const name of (await readdir(path.join(stage, "assets"))).sort()) {
  const record = JSON.parse(await readFile(path.join(stage, "assets", name, "SOURCE.json"), "utf8")) as Candidate;
  assert(/^ts-world-[a-z0-9-]+$/u.test(record.id) && /^[a-z0-9-]+$/u.test(record.slug));
  assert.equal(name, record.id);
  entries.push(record);
}
assert.equal(entries.length, 24);
assert.equal(new Set(entries.map((entry) => entry.id)).size, 24);
const htmlPath = path.join(root, "apps/web/premium-world-verification.html");
await writeFile(htmlPath, '<!doctype html><html><head><link rel="icon" href="data:,"></head><body><script type="module" src="/tools/browser-harnesses/premium-world-runtime.ts"></script></body></html>');
const server = await createServer({ configFile: false, root: path.join(root, "apps/web"),
  resolve: { alias: { "@": path.join(root, "apps/web/src") } },
  server: { host: "127.0.0.1", port: 5297, strictPort: true, fs: { allow: [root] } }, logLevel: "warn" });
const results = [];
const failures: { id: string; error: string }[] = [];
await server.listen();
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 500, height: 500 } });
  page.setDefaultTimeout(180_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("http://127.0.0.1:5297/premium-world-verification.html");
  await page.waitForFunction(() => (window as unknown as { premiumWorld?: PremiumWorldRuntime }).premiumWorld?.ready === true);
  for (const entry of entries) {
    try {
      const file = path.join(stage, "assets", entry.id, `${entry.slug}.glb`);
      const bytes = await readFile(file);
      assert.equal(bytes.length, entry.byteSize);
      assert.equal(hash(bytes), entry.sha256);
      const validation = await validator.validateBytes(new Uint8Array(bytes), { uri: `${entry.slug}.glb`, maxIssues: 1000,
        externalResourceFunction: async (uri: string) => { throw new Error(`External resource forbidden: ${uri}`); } });
      assert.equal(validation.issues.numErrors, 0, JSON.stringify(validation.issues.messages));
      const budgets = [];
      for (const profile of ["mobile", "desktop"] as const) {
        const admission = await validateStudioBg3dGlb(new Uint8Array(bytes), {
          declared: { byteSize: bytes.length, sha256: entry.sha256 }, profile,
          cumulative: { usedBytes: 0, maximumBytes: 64 * 1024 * 1024 },
          budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES, digest: async (input) => hash(input),
        });
        assert(admission.ok, `${entry.id}: ${profile}: ${admission.code}`);
        budgets.push({ profile, ok: admission.ok, code: admission.code });
      }
      const errorsBefore = pageErrors.length;
      const result = await page.evaluate(async (input) => (window as unknown as { premiumWorld: PremiumWorldRuntime }).premiumWorld.verify(input),
        { id: entry.id, url: `/@fs/${file}` });
      assert.equal(pageErrors.length, errorsBefore, pageErrors.slice(errorsBefore).join("\n"));
      for (let i = 0; i < 3; i++) assert(Math.abs(result.bounds[i] - entry.bounds[i]) <= Math.max(.01, entry.bounds[i] * .005), "Declared and loaded bounds disagree");
      const frames = [];
      for (const frame of result.frames) {
        const png = Buffer.from(frame.png, "base64");
        const name = `${entry.id}-${frame.view}.png`;
        await writeFile(path.join(output, name), png);
        const { png: _png, ...metrics } = frame;
        frames.push({ ...metrics, file: name, sha256: hash(png) });
      }
      const { frames: _frames, ...runtime } = result;
      results.push({ ...runtime, sourceSha256: entry.sha256, sourceBytes: bytes.length, budgets,
        validator: { name: "Khronos glTF-Validator", version: validator.version(), errors: validation.issues.numErrors, warnings: validation.issues.numWarnings }, frames });
      console.log(`PASS ${entry.id}: mobile/desktop admission; ${result.execution}; 3 nonblank views; ${result.materialCount} materials`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ id: entry.id, error: message });
      console.error(`FAIL ${entry.id}: ${message}`);
    }
  }
  await writeFile(path.join(output, "report.json"), JSON.stringify({ schema: "toonspectrum.premium-world-runtime.v1", checkedAt: new Date().toISOString(),
    results, failures, allAnglesArtisticallyApproved: false, realDevicePerformanceVerified: false }, null, 2) + "\n");
  assert.equal(failures.length, 0, JSON.stringify(failures));
  assert.equal(results.length, 24);
} finally {
  await browser.close();
  await server.close();
  await rm(htmlPath, { force: true });
}
