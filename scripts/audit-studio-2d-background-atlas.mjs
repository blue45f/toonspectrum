#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, access, mkdir, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const recipePath = path.resolve(ROOT, process.argv[2] || "scripts/data/studio-2d-background-atlas-v1.json");
const manifestPath = path.resolve(
  ROOT,
  process.argv[3] || "apps/web/src/domains/creator/studio-2d-generated-scene-manifest.json",
);
const reportPath = path.resolve(ROOT, process.argv[4] || ".tmp/studio-2d-background-atlas-audit.json");

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
async function exists(file) {
  try { await access(file, fsConstants.F_OK); return true; } catch { return false; }
}
function parsePngDimensions(bytes) {
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
function orientation(width, height) {
  if (width === height) return "square";
  return width > height ? "landscape" : "portrait";
}

const catalog = JSON.parse(await readFile(recipePath, "utf8"));
const manifest = await exists(manifestPath)
  ? JSON.parse(await readFile(manifestPath, "utf8"))
  : { assets: [] };
const recipes = new Map(catalog.recipes.map((recipe) => [recipe.id, recipe]));
const issues = [];
const hashes = new Map();
const audited = [];

for (const asset of manifest.assets) {
  const recipe = recipes.get(asset.id);
  if (!recipe) issues.push({ id: asset.id, code: "unknown-recipe" });
  const relative = asset.src.replace(/^\//u, "");
  const file = path.resolve(ROOT, "apps/web/public", relative);
  if (!(await exists(file))) {
    issues.push({ id: asset.id, code: "missing-file", file });
    continue;
  }
  const bytes = await readFile(file);
  const dimensions = parsePngDimensions(bytes);
  if (!dimensions) issues.push({ id: asset.id, code: "not-png" });
  if (bytes.length < 50_000) issues.push({ id: asset.id, code: "suspiciously-small", bytes: bytes.length });
  const digest = sha256(bytes);
  if (asset.sha256 !== digest) issues.push({ id: asset.id, code: "sha-mismatch" });
  if (dimensions && (asset.width !== dimensions.width || asset.height !== dimensions.height)) {
    issues.push({ id: asset.id, code: "dimension-mismatch", dimensions });
  }
  if (recipe && dimensions && orientation(dimensions.width, dimensions.height) !== recipe.orientation) {
    issues.push({ id: asset.id, code: "orientation-mismatch", expected: recipe.orientation, dimensions });
  }
  const duplicateOf = hashes.get(digest);
  if (duplicateOf) issues.push({ id: asset.id, code: "exact-duplicate", duplicateOf });
  else hashes.set(digest, asset.id);
  audited.push({
    id: asset.id,
    bytes: bytes.length,
    sha256: digest,
    ...(dimensions || {}),
    reviewStatus: asset.review?.status,
    recommended: asset.recommended,
  });
}

const report = {
  version: 1,
  auditedAt: new Date().toISOString(),
  recipeCount: catalog.recipes.length,
  installedCount: manifest.assets.length,
  validFileCount: audited.length,
  issueCount: issues.length,
  readyForManualReview: audited.filter((item) => item.reviewStatus === "small-panel-only").length,
  issues,
  assets: audited,
};
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
if (issues.length) process.exitCode = 1;
