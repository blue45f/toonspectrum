import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseStudioCc0Catalog } from "../apps/web/src/domains/creator/studio-cc0-asset-delivery";
import {
  getStudioCc0ReviewStatus,
  isStudioCc0AssemblyComponent,
  isStudioCc0EligibleForNewSelection,
  isStudioCc0MarketplaceReady,
  isStudioCc0Quarantined,
} from "../apps/web/src/domains/creator/studio-cc0-curation";

const root = resolve(import.meta.dirname, "..");
const manifestPath = resolve(root, "apps/web/public/assets/studio/cc0-20260906/manifest.json");
const catalog = parseStudioCc0Catalog(JSON.parse(readFileSync(manifestPath, "utf8")) as unknown);

type Bucket =
  | "marketplace-ready"
  | "studio-finished"
  | "studio-component"
  | "runtime-pending-model"
  | "review-pending"
  | "excluded";

const buckets = new Map<Bucket, string[]>([
  ["marketplace-ready", []],
  ["studio-finished", []],
  ["studio-component", []],
  ["runtime-pending-model", []],
  ["review-pending", []],
  ["excluded", []],
]);
for (const asset of catalog) {
  let bucket: Bucket;
  if (isStudioCc0Quarantined(asset)) {
    bucket = "excluded";
  } else if (isStudioCc0MarketplaceReady(asset)) {
    bucket = "marketplace-ready";
  } else if (getStudioCc0ReviewStatus(asset) === "unreviewed") {
    bucket = "review-pending";
  } else if (isStudioCc0AssemblyComponent(asset)) {
    bucket = "studio-component";
  } else if (
    asset.kind === "model"
    && (!asset.browserRenderVerified || !asset.studioRuntimeVerified)
  ) {
    bucket = "runtime-pending-model";
  } else if (isStudioCc0EligibleForNewSelection(asset)) {
    bucket = "studio-finished";
  } else {
    bucket = "excluded";
  }
  buckets.get(bucket)!.push(asset.id);
}

const counts = Object.fromEntries(
  [...buckets].map(([bucket, ids]) => [bucket, ids.length]),
) as Record<Bucket, number>;
const classified = Object.values(counts).reduce((sum, value) => sum + value, 0);
const report = {
  schema: "toonspectrum.studio-cc0-classification.v1",
  total: catalog.length,
  classified,
  counts,
  ids: Object.fromEntries([...buckets].map(([bucket, ids]) => [bucket, ids.toSorted()])),
};
console.log(JSON.stringify(report, null, 2));

if (process.argv.includes("--strict")) {
  if (classified !== catalog.length) throw new Error("Not every CC0 asset was classified.");
  if (counts["marketplace-ready"] !== 334) {
    throw new Error(`Expected 334 marketplace-ready assets, got ${counts["marketplace-ready"]}.`);
  }
  if (Object.values(counts).some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error("Classification counts must be non-negative integers.");
  }
}
