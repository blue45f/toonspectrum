import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  enableStudio3dHighAssetQuality,
  resetStudio3dAssetQualityMode,
} from "../../apps/web/src/domains/creator/studio-3d-asset-quality-session.ts";
import { resolveStudioBg3dDeviceQuality } from "../../apps/web/src/domains/creator/bg3d/studio-bg3d-device-quality.ts";
import { validateStudioBg3dGlb } from "../../apps/web/src/domains/creator/bg3d/studio-bg3d-glb-validation.ts";
import { createDefaultStudioBg3dSceneDocument } from "../../apps/web/src/domains/creator/bg3d/studio-bg3d-scene-document.ts";
import { deriveStudioBg3dSessionGlbValidationPolicy } from "../../apps/web/src/domains/creator/bg3d/studio-bg3d-session-glb-policy.ts";

const outputDirectory = dirname(fileURLToPath(import.meta.url));
const repository = resolve(outputDirectory, "../..");
const manifestPath = "apps/web/public/assets/studio/cc0-20260906/manifest.json";
const manifestBytes = await readFile(resolve(repository, manifestPath));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const expectedIds = [
  "polyhaven-brass-goblets",
  "polyhaven-cassette-player",
  "polyhaven-korean-fire-extinguisher-01",
];
const originals = manifest.assets.filter((asset: { original?: unknown }) => asset.original);
assert.deepEqual(originals.map((asset: { id: string }) => asset.id).sort(), expectedIds);

const MiB = 1024 * 1024;
const document = createDefaultStudioBg3dSceneDocument();
const quality = resolveStudioBg3dDeviceQuality({
  document,
  mode: "capture",
  preference: "mobile",
  signals: {
    cssWidth: 375,
    cssHeight: 812,
    devicePixelRatio: 2,
    pointer: "coarse",
    saveData: false,
    deviceMemoryGb: 6,
    hardwareConcurrency: 8,
  },
});
const documentBefore = structuredClone(document);
const qualityBefore = structuredClone(quality);
resetStudio3dAssetQualityMode();
const autoPolicy = deriveStudioBg3dSessionGlbValidationPolicy(document, quality);
enableStudio3dHighAssetQuality();
const highPolicy = deriveStudioBg3dSessionGlbValidationPolicy(document, quality);
resetStudio3dAssetQualityMode();
assert.equal(autoPolicy.profile, "mobile");
assert.equal(highPolicy.profile, "mobile");
assert.equal(autoPolicy.budgets.mobile.textures.maxTotalBytes, 128 * MiB);
assert.equal(highPolicy.budgets.mobile.textures.maxTotalBytes, 256 * MiB);
assert.deepEqual(highPolicy.budgets, {
  ...autoPolicy.budgets,
  mobile: {
    ...autoPolicy.budgets.mobile,
    textures: { ...autoPolicy.budgets.mobile.textures, maxTotalBytes: 256 * MiB },
  },
});
assert.deepEqual(document, documentBefore);
assert.deepEqual(quality, qualityBefore);

function summarize(result: Awaited<ReturnType<typeof validateStudioBg3dGlb>>) {
  if (!result.ok) return { ok: result.ok, code: result.code, message: result.message };
  return {
    ok: result.ok,
    code: result.code,
    profile: result.profile,
    verifiedSha256: result.verifiedSha256,
    cumulativeBytesAfter: result.cumulativeBytesAfter,
    metrics: result.metrics,
  };
}

const results = [];
for (const asset of originals) {
  const sourcePath = resolve(repository, dirname(manifestPath), asset.original.path);
  const bytes = new Uint8Array(await readFile(sourcePath));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const options = {
    declared: { byteSize: asset.original.bytes, sha256: `sha256:${asset.original.sha256}` },
    cumulative: { usedBytes: 0, maximumBytes: 64 * MiB },
    digest: async (input: Uint8Array) => createHash("sha256").update(input).digest("hex"),
  };
  const auto = await validateStudioBg3dGlb(bytes, { ...options, ...autoPolicy });
  const high = await validateStudioBg3dGlb(bytes, { ...options, ...highPolicy });
  const checks = {
    manifestBytesMatch: bytes.byteLength === asset.original.bytes,
    manifestSha256Matches: sha256 === asset.original.sha256,
    autoRejectsTextureBudget: !auto.ok && auto.code === "texture-byte-budget-exceeded",
    highPassesCompleteValidation: high.ok && high.code === "valid",
    actualDecodedTextureBytes144MiB: high.ok && high.metrics.estimatedDecodedImageBytes === 144 * MiB,
    embeddedImageDimensionsKnown: high.ok && high.metrics.undeterminedImageDimensions === 0,
  };
  results.push({
    id: asset.id,
    publicPath: `/${dirname(manifestPath).replace("apps/web/public/", "")}/${asset.original.path}`,
    bytes: bytes.byteLength,
    sha256,
    passed: Object.values(checks).every(Boolean),
    checks,
    auto: summarize(auto),
    high: summarize(high),
  });
}
const report = {
  schema: "toonstudio-original-high-quality-admission-v1",
  checkedAt: new Date().toISOString(),
  manifestPath,
  manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
  method: "Actual public GLB bytes, production session policy wrapper and production GLB validator; no mocks",
  policies: { auto: autoPolicy, high: highPolicy },
  unchangedConstraints: {
    allBudgetsExceptMobileTextureBytes: true,
    rendererQualityAndDocument: true,
    cumulativeMaximumBytes: 64 * MiB,
  },
  limitations: [
    "Decoded texture admission estimate is not a cap on total physical RAM or GPU memory.",
    "This verification performs structural and resource admission, not a new browser render.",
  ],
  passed: results.every((result) => result.passed),
  results,
};
await writeFile(resolve(outputDirectory, "original-high-quality-admission.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  passed: report.passed,
  results: results.map((result) => ({
    id: result.id,
    passed: result.passed,
    bytes: result.bytes,
    auto: result.auto.code,
    high: result.high.code,
    decodedTextureMiB: "metrics" in result.high ? result.high.metrics.estimatedDecodedImageBytes / MiB : null,
  })),
}, null, 2));
if (!report.passed) process.exitCode = 1;
