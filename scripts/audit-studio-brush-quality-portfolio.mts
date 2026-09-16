/** Static audit for the consolidated Studio brush product catalogue. */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  filterStudioBrushCatalogItems,
  STUDIO_ALL_BRUSH_CATALOG_ITEMS,
  STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS,
  STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS,
  studioBrushCatalogItemById,
} from "../apps/web/src/domains/creator/brush/studio-brush-catalog";
import {
  STUDIO_BRUSH_HAND_FEEL_PROFILES,
  STUDIO_BRUSH_LIVE_COMMIT_GATES,
  STUDIO_BRUSH_QUALITY_ENGINE_PINS,
  STUDIO_BRUSH_QUALITY_SCORE_WEIGHTS,
  STUDIO_BRUSH_TEXTURE_PROFILES,
} from "../apps/web/src/domains/creator/brush/studio-brush-quality-foundation";
import {
  STUDIO_BRUSH_QUALITY_ABSORBED_ID_OWNER,
  STUDIO_BRUSH_QUALITY_PORTFOLIO,
  STUDIO_BRUSH_QUALITY_PORTFOLIO_COUNTS,
} from "../apps/web/src/domains/creator/brush/studio-brush-quality-portfolio";
import { isStudioBrushQuarantinedPresetId } from "../apps/web/src/domains/creator/brush/studio-brush-quarantine";

const outputDirectory = join(
  process.env.TOONSPECTRUM_VERIFY_DIR ?? tmpdir(),
  "studio-brush-product-catalogue",
);
mkdirSync(outputDirectory, { recursive: true });

const failures: string[] = [];
const productIds = STUDIO_BRUSH_QUALITY_PORTFOLIO.map((entry) => entry.id);
const productIdSet = new Set(productIds);
const listedIds = STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.map((item) => item.id);
const listedIdSet = new Set(listedIds);
const expectedListedIds = STUDIO_ALL_BRUSH_CATALOG_ITEMS
  .filter((item) => !isStudioBrushQuarantinedPresetId(item.id))
  .map((item) => item.id);
const expectedListedIdSet = new Set(expectedListedIds);

if (productIds.length !== 88) failures.push(`product total is ${productIds.length}, expected 88`);
if (new Set(productIds).size !== productIds.length) failures.push("duplicate product ids");
if (STUDIO_BRUSH_QUALITY_PORTFOLIO_COUNTS.paint !== 86) failures.push("paint total is not 86");
if (STUDIO_BRUSH_QUALITY_PORTFOLIO_COUNTS.erase !== 2) failures.push("eraser total is not 2");

if (
  STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS.map((item) => item.id).join("\0")
  !== productIds.join("\0")
) {
  failures.push("default quality catalogue differs from the audited portfolio");
}
if (listedIds.slice(0, productIds.length).join("\0") !== productIds.join("\0")) {
  failures.push("complete catalogue does not keep the quality portfolio first");
}
if (listedIdSet.size !== listedIds.length) failures.push("duplicate complete catalogue ids");
if (
  listedIdSet.size !== expectedListedIdSet.size
  || [...expectedListedIdSet].some((id) => !listedIdSet.has(id))
) {
  failures.push("complete catalogue differs from the non-quarantined registry");
}

const rows = STUDIO_BRUSH_QUALITY_PORTFOLIO.map((entry) => {
  const item = studioBrushCatalogItemById(entry.id);
  if (!item) failures.push(`${entry.id}: representative is not registered`);
  if (item && item.source !== entry.source) {
    failures.push(`${entry.id}: source ${item.source} differs from ${entry.source}`);
  }
  if (isStudioBrushQuarantinedPresetId(entry.id)) {
    failures.push(`${entry.id}: representative is quarantined`);
  }
  if (!STUDIO_BRUSH_TEXTURE_PROFILES[entry.textureProfile]) {
    failures.push(`${entry.id}: missing texture profile`);
  }
  if (!STUDIO_BRUSH_HAND_FEEL_PROFILES[entry.handFeelProfile]) {
    failures.push(`${entry.id}: missing hand-feel profile`);
  }
  if (!STUDIO_BRUSH_LIVE_COMMIT_GATES[entry.liveCommitGate]) {
    failures.push(`${entry.id}: missing live/commit gate`);
  }
  const pin = STUDIO_BRUSH_QUALITY_ENGINE_PINS[entry.enginePin];
  if (!pin) failures.push(`${entry.id}: missing engine pin`);
  return {
    id: entry.id,
    label: entry.label,
    source: entry.source,
    tier: entry.tier,
    medium: entry.medium,
    textureProfile: entry.textureProfile,
    handFeelProfile: entry.handFeelProfile,
    liveCommitGate: entry.liveCommitGate,
    enginePin: entry.enginePin,
    liveBackend: pin?.liveBackend ?? "missing",
    commitBackend: pin?.commitBackend ?? "missing",
    signature: entry.signature,
    distinctness: entry.distinctness,
    excludedImplementationCount: entry.absorbedIds.length,
  };
});

for (const [absorbedId, ownerId] of Object.entries(
  STUDIO_BRUSH_QUALITY_ABSORBED_ID_OWNER,
)) {
  if (productIdSet.has(absorbedId)) {
    failures.push(`${absorbedId}: excluded id is also a product`);
  }
  if (!productIdSet.has(ownerId)) {
    failures.push(`${absorbedId}: missing owner ${ownerId}`);
  }
  const registered = studioBrushCatalogItemById(absorbedId);
  const directlySearchable = filterStudioBrushCatalogItems({ query: absorbedId }).some(
    (item) => item.id === absorbedId,
  );
  if (registered && !isStudioBrushQuarantinedPresetId(absorbedId)) {
    if (!directlySearchable) {
      failures.push(`${absorbedId}: safe advanced identity is not directly searchable`);
    }
  } else if (directlySearchable) {
    failures.push(`${absorbedId}: quarantined or unknown identity became searchable`);
  }
}

const qualityWeight =
  STUDIO_BRUSH_QUALITY_SCORE_WEIGHTS.textureFidelity +
  STUDIO_BRUSH_QUALITY_SCORE_WEIGHTS.handFeel +
  STUDIO_BRUSH_QUALITY_SCORE_WEIGHTS.liveCommitConsistency +
  STUDIO_BRUSH_QUALITY_SCORE_WEIGHTS.geometryFidelity;
const performanceWeight =
  STUDIO_BRUSH_QUALITY_SCORE_WEIGHTS.performance +
  STUDIO_BRUSH_QUALITY_SCORE_WEIGHTS.memoryStability;
if (Math.abs(qualityWeight - 0.85) > 1e-9) failures.push("quality weight is not 85%");
if (Math.abs(performanceWeight - 0.15) > 1e-9) failures.push("performance weight is not 15%");

const report = {
  kind: "toonspectrum-studio-brush-product-catalogue-audit-v3",
  generatedAt: new Date().toISOString(),
  counts: {
    internalRegistry: STUDIO_ALL_BRUSH_CATALOG_ITEMS.length,
    qualityPortfolio: rows.length,
    listedCatalogue: listedIds.length,
    advancedListedRows: listedIds.length - rows.length,
    quarantinedReplayOnlyRows: STUDIO_ALL_BRUSH_CATALOG_ITEMS.length - listedIds.length,
    absorbedQualityEvidenceIds: Object.keys(STUDIO_BRUSH_QUALITY_ABSORBED_ID_OWNER).length,
  },
  weights: STUDIO_BRUSH_QUALITY_SCORE_WEIGHTS,
  rows,
  failures,
};

const csvEscape = (value: unknown): string => {
  const text = String(value ?? "");
  return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const headers = Object.keys(rows[0] ?? {});
const csv =
  [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => csvEscape(row[header as keyof typeof row])).join(","),
    ),
  ].join("\n") + "\n";
const markdown =
  [
    "# Studio brush product catalogue audit",
    "",
    `- Internal renderer rows: ${report.counts.internalRegistry}`,
    `- Quality-first brushes: ${report.counts.qualityPortfolio}`,
    `- Complete selectable brushes: ${report.counts.listedCatalogue}`,
    `- Advanced selectable rows: ${report.counts.advancedListedRows}`,
    `- Quarantined replay-only rows: ${report.counts.quarantinedReplayOnlyRows}`,
    `- Absorbed quality-evidence ids: ${report.counts.absorbedQualityEvidenceIds}`,
    `- Failures: ${failures.length}`,
    "",
    "| Brush | Medium | Live → commit | Distinctness |",
    "| --- | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${row.id} | ${row.medium} | ${row.liveBackend} → ${row.commitBackend} | ${row.distinctness} |`,
    ),
  ].join("\n") + "\n";

writeFileSync(join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(join(outputDirectory, "portfolio.csv"), csv);
writeFileSync(join(outputDirectory, "report.md"), markdown);

console.log(JSON.stringify(report.counts));
console.log(`product catalogue receipt: ${outputDirectory}`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`[product-catalogue-audit] ${failure}`);
  process.exitCode = 1;
}
