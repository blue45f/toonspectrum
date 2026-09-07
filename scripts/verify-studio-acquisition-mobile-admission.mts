import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES, validateStudioBg3dGlb } from "../apps/web/src/domains/creator/bg3d/studio-bg3d-glb-validation";

const manifestPath = path.resolve(process.argv[2] ?? "artifacts/studio-asset-expansion/pbr-20260908/manifest.json");
const stage = path.dirname(manifestPath);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const overridePath = process.argv.slice(3).find((argument) => !argument.startsWith("--"));
const runtimeVerifiedOnly = process.argv.includes("--runtime-verified-only");
const overrides = overridePath ? JSON.parse(await readFile(path.resolve(overridePath), "utf8")) : { assets: [] };
const allModels = manifest.assets.filter((asset: { kind: string }) => asset.kind === "model");
const models = runtimeVerifiedOnly
  ? allModels.filter((asset: { browserRenderVerified?: boolean; studioRuntimeVerified?: boolean }) => asset.browserRenderVerified === true && asset.studioRuntimeVerified === true)
  : allModels;
const skipped = allModels.filter((asset: { id: string }) => !models.some((candidate: { id: string }) => candidate.id === asset.id))
  .map((asset: { id: string }) => ({ id: asset.id, reason: "not-runtime-verified; retained outside the admitted-model gate" }));
const results = [];
for (const source of models) {
  const asset = overrides.assets.find((entry: { id: string }) => entry.id === source.id) ?? source;
  const sourcePath = path.resolve(stage, asset.path);
  assert(sourcePath.startsWith(`${stage}${path.sep}`), "Model path escapes acquisition stage");
  const bytes = await readFile(sourcePath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  assert.equal(sha256, asset.sha256, `${asset.id}: acquired checksum mismatch`);
  const admission = await validateStudioBg3dGlb(new Uint8Array(bytes), {
    declared: { byteSize: bytes.byteLength, sha256: `sha256:${sha256}` },
    cumulative: { usedBytes: 0, maximumBytes: 64 * 1024 * 1024 },
    profile: "mobile",
    budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
    digest: async (input) => createHash("sha256").update(input).digest("hex"),
  });
  const evidence = Object.fromEntries(Object.entries(admission).filter(([key, value]) =>
    key === "metrics" || typeof value === "string" || typeof value === "number" || typeof value === "boolean"));
  results.push({ id: asset.id, path: asset.path, bytes: bytes.length, sha256, admission: evidence });
  process.stdout.write(`${asset.id}: ${admission.ok ? "PASS" : "FAIL"} ${admission.code}\n`);
}
const report = { checkedAt: new Date().toISOString(), helper: "validateStudioBg3dGlb", profile: "mobile", runtimeVerifiedOnly, skipped, cumulative: { usedBytes: 0, maximumBytes: 64 * 1024 * 1024 }, modelCount: models.length, passed: results.filter((result) => result.admission.ok).length, failed: results.filter((result) => !result.admission.ok).length, results };
const reportPath = path.join(stage, "mobile-admission-report.json");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`Report: ${reportPath}\n`);
if (report.failed) process.exitCode = 1;
