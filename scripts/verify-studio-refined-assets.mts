import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import type { GltfValidatorApi } from "./types/gltf-validator";
import type { RefinedAssetVerifierRuntime } from "../apps/web/tools/browser-harnesses/refined-assets-runtime";

type StageEntry = Record<string, unknown> & { id: string; kind?: string; path?: string; url?: string; group?: string; sha256?: string };
type SourceAsset = { id: string; group: string; url: string; sourcePath: string; stageEntry?: StageEntry };
type RuntimeResult = Awaited<ReturnType<RefinedAssetVerifierRuntime["verify"]>>;
type SavedFrame = Omit<RuntimeResult["frames"][number], "pngBase64"> & { path: string; sha256: string };
type AssetResult = Omit<RuntimeResult, "frames"> & { group: string; sourcePath: string; sourceSha256: string; sourceBytes: number; frames: SavedFrame[]; validation: Record<string, unknown> };

const { validateBytes, version: validatorVersion } = createRequire(import.meta.url)("gltf-validator") as GltfValidatorApi;
const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const publicRoot = path.join(repoRoot, "apps/web/public");
const args = process.argv.slice(2);
let origin = "http://127.0.0.1:5229";
let manifestPath: string | undefined;
let outputRoot = process.env.STUDIO_REFINED_REPORT_ROOT ?? "/tmp/toonstudio-refined-runtime";
const positional: string[] = [];
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === "--help") {
    process.stdout.write("Usage: node --import tsx scripts/verify-studio-refined-assets.mts [origin] [asset-list.json] [--origin URL] [--manifest acquisition/manifest.json] [--output DIR]\n");
    process.exit(0);
  }
  if (["--origin", "--manifest", "--output"].includes(argument)) {
    const value = args[++index];
    assert(value, `Missing value for ${argument}`);
    if (argument === "--origin") origin = value;
    else if (argument === "--manifest") manifestPath = path.resolve(value);
    else outputRoot = path.resolve(value);
  } else {
    assert(!argument.startsWith("--"), `Unknown option ${argument}`);
    positional.push(argument);
  }
}
if (positional[0]) origin = positional[0];
if (positional[1]) manifestPath = path.resolve(positional[1]);
assert(positional.length <= 2, "Too many positional arguments");
const originUrl = new URL(origin);
assert(["127.0.0.1", "localhost", "[::1]"].includes(originUrl.hostname), "Only an isolated localhost Vite server is allowed");
assert(originUrl.protocol === "http:" || originUrl.protocol === "https:");
origin = originUrl.origin;
outputRoot = path.resolve(outputRoot);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const isWithin = (root: string, target: string) => target.startsWith(`${root}${path.sep}`);
const assets: SourceAsset[] = [];
let stageManifest: { assets: StageEntry[]; [key: string]: unknown } | undefined;
let initialManifestHash: string | undefined;
let stageRoot: string | undefined;
if (manifestPath) {
  const manifestBytes = await readFile(manifestPath);
  initialManifestHash = sha256(manifestBytes);
  const parsed = JSON.parse(manifestBytes.toString("utf8")) as StageEntry[] | { assets: StageEntry[] };
  if (!Array.isArray(parsed)) {
    assert(Array.isArray(parsed.assets), "Acquisition manifest must have an assets array");
    stageManifest = parsed;
    stageRoot = path.dirname(manifestPath);
  }
  for (const entry of Array.isArray(parsed) ? parsed : parsed.assets.filter((asset) => asset.kind === "model")) {
    let sourcePath: string;
    let url: string;
    if (stageRoot) {
      assert(typeof entry.path === "string" && !path.isAbsolute(entry.path), `${entry.id}: expected a stage-relative path`);
      sourcePath = path.resolve(stageRoot, entry.path);
      assert(isWithin(stageRoot, sourcePath), `${entry.id}: source escapes the acquisition stage`);
      url = `/@fs/${sourcePath}`;
    } else {
      assert(typeof entry.url === "string" && entry.url.startsWith("/assets/") && !entry.url.includes(".."), `${entry.id}: expected /assets/...glb`);
      sourcePath = path.resolve(publicRoot, entry.url.slice(1));
      assert(isWithin(publicRoot, sourcePath));
      url = entry.url;
    }
    assets.push({ id: entry.id, group: entry.group ?? (stageRoot ? "models" : "assets"), url, sourcePath, stageEntry: stageRoot ? entry : undefined });
  }
} else {
  for (const id of ["hanging_sign", "traffic_light", "mailbox", "blackboard", "desk", "chair", "sofa", "bubble_tea", "ice_cream_cone", "fox_mask", "robot_pet"]) {
    const url = `/assets/3d/refined-v8/${id}.glb`;
    assets.push({ id, group: "props", url, sourcePath: path.join(publicRoot, url) });
  }
  const environmentRoot = path.join(publicRoot, "assets/3d/environments/refined-v6");
  const environmentFiles = (await readdir(environmentRoot)).filter((name) => name.endsWith(".glb")).sort();
  assert.equal(environmentFiles.length, 12, "Expected the final 12 refined-v6 environments");
  for (const file of environmentFiles) assets.push({ id: path.basename(file, ".glb"), group: "environments", url: `/assets/3d/environments/refined-v6/${file}`, sourcePath: path.join(environmentRoot, file) });
}
assert(assets.length > 0 && assets.length <= 200, "Expected 1 to 200 model assets");
for (const asset of assets) {
  assert(/^[a-z0-9_-]+$/iu.test(asset.id) && /^[a-z0-9_-]+$/iu.test(asset.group), "Unsafe asset id/group");
  assert(asset.sourcePath.endsWith(".glb"), `${asset.id}: expected a GLB model source`);
}
assert.equal(new Set(assets.map((asset) => asset.id)).size, assets.length, "Duplicate model IDs");
await mkdir(outputRoot, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors: string[] = [];
const warnings: string[] = [];
const failures: { id: string; error: string }[] = [];
const results: AssetResult[] = [];
const contactSheets: string[] = [];
const startedAt = new Date().toISOString();
let gpu: unknown;
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 640 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(180_000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
    if (message.type() === "warning") warnings.push(message.text());
  });
  await page.goto(`${origin}/tools/browser-harnesses/refined-assets-runtime.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => (window as unknown as { __refinedAssetVerifier?: RefinedAssetVerifierRuntime }).__refinedAssetVerifier?.ready === true);
  gpu = await page.evaluate(() => (window as unknown as { __refinedAssetVerifier: RefinedAssetVerifierRuntime }).__refinedAssetVerifier.gpu);
  for (const asset of assets) {
    try {
      const bytes = await readFile(asset.sourcePath);
      assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${asset.id}: invalid GLB magic`);
      assert.equal(bytes.readUInt32LE(4), 2, `${asset.id}: invalid GLB version`);
      assert.equal(bytes.readUInt32LE(8), bytes.byteLength, `${asset.id}: invalid GLB byte length`);
      const sourceSha256 = sha256(bytes);
      if (asset.stageEntry?.sha256) assert.equal(sourceSha256, asset.stageEntry.sha256, `${asset.id}: acquired source checksum changed`);
      const validationReport = await validateBytes(new Uint8Array(bytes), { uri: path.basename(asset.sourcePath), maxIssues: 1000, externalResourceFunction: async (uri: string) => { throw new Error(`External GLB resource: ${uri}`); } });
      const validation = { validator: "Khronos glTF-Validator", version: validatorVersion(), numErrors: validationReport.issues.numErrors, numWarnings: validationReport.issues.numWarnings, numInfos: validationReport.issues.numInfos, messages: validationReport.issues.messages };
      if (validationReport.issues.numErrors) failures.push({ id: asset.id, error: `glTF-Validator: ${validationReport.issues.numErrors} errors` });
      const beforeErrors = errors.length;
      const rendered = await page.evaluate(async (input) => (window as unknown as { __refinedAssetVerifier: RefinedAssetVerifierRuntime }).__refinedAssetVerifier.verify(input), { id: asset.id, url: asset.url });
      assert.equal(errors.length, beforeErrors, `${asset.id}: renderer errors: ${errors.slice(beforeErrors).join("; ")}`);
      assert(/Apple.*Metal/iu.test(rendered.gpu.renderer), "Software rendering is not GPU verification");
      const destination = path.join(outputRoot, asset.group);
      await mkdir(destination, { recursive: true });
      const frames: SavedFrame[] = [];
      for (const frame of rendered.frames) {
        const { pngBase64, ...evidence } = frame;
        const png = Buffer.from(pngBase64, "base64");
        const framePath = path.join(destination, `${asset.id}-${frame.view}.png`);
        await writeFile(framePath, png);
        frames.push({ ...evidence, path: framePath, sha256: sha256(png) });
      }
      const { frames: _frames, ...runtimeEvidence } = rendered;
      results.push({ ...runtimeEvidence, group: asset.group, sourcePath: asset.sourcePath, sourceSha256, sourceBytes: bytes.length, frames, validation });
      const anchorPass = !rendered.anchor || (rendered.anchor.insideModelBounds && rendered.anchor.withinRadiusTolerance);
      if (!anchorPass) failures.push({ id: asset.id, error: `Attachment point is not on/in the model: ${JSON.stringify(rendered.anchor)}` });
      if (asset.stageEntry && stageRoot) {
        const preview = rendered.frames.find((frame) => frame.view === "three-quarter")!;
        const previewPath = `previews/${asset.id}.png`;
        await mkdir(path.join(stageRoot, "previews"), { recursive: true });
        await writeFile(path.join(stageRoot, previewPath), Buffer.from(preview.pngBase64, "base64"));
        Object.assign(asset.stageEntry, {
          browserRenderVerified: true,
          studioRuntimeVerified: validationReport.issues.numErrors === 0 && anchorPass,
          sourceBounds: rendered.bounds,
          previewPath,
          browserVerification: { checkedAt: new Date().toISOString(), sourceSha256, gpu: rendered.gpu, lighting: rendered.lighting, helper: "applyStudioBg3dRuntimeAssetQuality", decodedTextures: rendered.textures.length, views: frames.map(({ view, renderedTriangles, foregroundPixels, sha256: pngSha256 }) => ({ view, renderedTriangles, foregroundPixels, pngSha256 })), gltfValidator: validation },
        });
      }
      process.stdout.write(`${asset.id}: ${rendered.meshes} meshes, ${rendered.textures.length} decoded textures, 3 GPU views, glTF errors=${validationReport.issues.numErrors}${rendered.anchor ? `, anchor=${rendered.anchor.nearestSurfaceDistance.toFixed(5)}m` : ""}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ id: asset.id, error: message });
      if (asset.stageEntry) Object.assign(asset.stageEntry, { browserRenderVerified: false, studioRuntimeVerified: false, browserVerification: { checkedAt: new Date().toISOString(), error: message } });
      process.stderr.write(`${asset.id}: FAILED ${message}\n`);
    }
  }
  for (const group of new Set(results.map((result) => result.group))) {
    const grouped = results.filter((result) => result.group === group);
    for (let start = 0; start < grouped.length; start += 6) {
      const rows = await Promise.all(grouped.slice(start, start + 6).map(async (result) => ({ id: result.id, frames: await Promise.all(result.frames.map(async (frame) => ({ view: frame.view, url: `data:image/png;base64,${(await readFile(frame.path)).toString("base64")}` }))) })));
      const sheetData = await page.evaluate(async (input) => {
        const canvas = document.createElement("canvas");
        canvas.width = 960;
        canvas.height = input.length * 350 + 44;
        const context = canvas.getContext("2d")!;
        context.fillStyle = "#202b34";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.font = "bold 16px sans-serif";
        context.fillStyle = "#ffffff";
        context.fillText("Actual GLB / Apple Metal / authored PBR / RoomEnvironment IBL", 12, 27);
        for (let row = 0; row < input.length; row += 1) {
          const asset = input[row];
          for (let column = 0; column < asset.frames.length; column += 1) {
            const frame = asset.frames[column];
            const image = new Image();
            image.src = frame.url;
            await image.decode();
            context.drawImage(image, column * 320, row * 350 + 44, 320, 320);
            context.fillStyle = "#ffffff";
            context.font = "12px sans-serif";
            context.fillText(`${asset.id} / ${frame.view}`, column * 320 + 6, row * 350 + 380, 308);
          }
        }
        return canvas.toDataURL("image/png").split(",")[1];
      }, rows);
      const destination = path.join(outputRoot, `${group}-contact-${Math.floor(start / 6) + 1}.png`);
      await writeFile(destination, Buffer.from(sheetData, "base64"));
      contactSheets.push(destination);
    }
  }
  if (manifestPath && stageManifest) {
    assert.equal(sha256(await readFile(manifestPath)), initialManifestHash, "Manifest changed during verification; refusing to overwrite concurrent edits");
    await writeFile(manifestPath, `${JSON.stringify(stageManifest, null, 2)}\n`);
  }
} finally {
  const report = { schema: "toonstudio-actual-gpu-asset-verification/v2", startedAt, completedAt: new Date().toISOString(), origin, manifestPath, chromeVersion: browser.version(), gpu, lighting: "RoomEnvironment PMREM IBL + hemisphere + three directional lights; authored materials preserved", helper: "applyStudioBg3dRuntimeAssetQuality", expectedAssets: assets.length, renderedAssets: results.length, passedAssets: results.filter((result) => !failures.some((failure) => failure.id === result.id)).length, failures, rendererErrors: errors, warnings, contactSheets, results };
  await writeFile(path.join(outputRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  process.stdout.write(`Report: ${path.join(outputRoot, "report.json")}\n`);
}
if (failures.length || errors.length) process.exitCode = 1;
