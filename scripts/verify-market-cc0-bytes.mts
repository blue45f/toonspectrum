import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { validateStudioBg3dGlb, DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES } from "../apps/web/src/domains/creator/bg3d/studio-bg3d-glb-validation";
import { STUDIO_MARKETPLACE_CC0_ASSETS } from "../apps/web/src/domains/creator/studio-marketplace-cc0-catalog.generated";

import { summarizeVerifiedGlbAdmission } from "./lib/verified-glb-admission-report";

const { validateBytes } = createRequire(import.meta.url)("gltf-validator") as {
  validateBytes(bytes: Uint8Array, options: { uri: string; maxIssues: number }): Promise<{ issues: { numErrors: number; [key: string]: unknown } }>;
};

const directory = path.resolve("apps/web/public/assets/studio/cc0-20260906");
const results: unknown[] = [];
for (const asset of STUDIO_MARKETPLACE_CC0_ASSETS) {
  const file = path.resolve(directory, asset.path);
  assert(file.startsWith(directory + path.sep));
  const bytes = await readFile(file);
  assert.equal(bytes.length, asset.bytes);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
  if (asset.kind !== "model") {
    results.push({ id: asset.id, bytes: bytes.length, sha256: asset.sha256 });
    continue;
  }
  const admission = await validateStudioBg3dGlb(new Uint8Array(bytes), {
    declared: { byteSize: bytes.length, sha256: `sha256:${asset.sha256}` },
    cumulative: { usedBytes: 0, maximumBytes: 64 * 1024 * 1024 },
    profile: "mobile", budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
    digest: async value => createHash("sha256").update(value).digest("hex"),
  });
  assert(admission.ok, `${asset.id}: production mobile admission rejected`);
  const validation = await validateBytes(new Uint8Array(bytes), { uri: asset.path, maxIssues: 100 });
  assert.equal(validation.issues.numErrors, 0, `${asset.id}: invalid GLB`);
  results.push({ id: asset.id, sha256: asset.sha256, admission: summarizeVerifiedGlbAdmission(admission), issues: validation.issues });
}
await mkdir("artifacts/market-cc0", { recursive: true });
await writeFile("artifacts/market-cc0/verified-files.json", JSON.stringify({ checked: results.length, results }, null, 2));
console.log(`Verified ${results.length} pinned files and six production-admitted GLB models.`);
