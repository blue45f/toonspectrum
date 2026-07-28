import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { BRUSH_PRESETS } from "../src/domains/creator/studio-brush";
import { STUDIO_BRUSH_PACK_DESCRIPTORS } from "../src/domains/creator/studio-brush-pack-index";
import { materializeAllStudioBrushPackSelections } from "../src/domains/creator/studio-brush-pack-runtime";
import {
  auditStudioBrushPlannerQualityCatalogue,
  type StudioBrushPlannerQualityCandidate,
} from "../src/domains/creator/studio-brush-planner-quality-audit";
import { studioCoreBrushCatalogSelection } from "../src/domains/creator/studio-brush-selection";

const OUTPUT_ROOT = resolve(
  process.env.TOONSPECTRUM_BRUSH_QUALITY_VERIFY_DIR?.trim()
    || join(tmpdir(), `toonspectrum-brush-planner-quality-${Date.now()}`),
);
const REPORT_PATH = join(OUTPUT_ROOT, "studio-brush-planner-quality-report.json");

function log(message: string): void {
  process.stdout.write(`[verify-studio-brush-planner-quality] ${message}\n`);
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function shippedCandidates(): StudioBrushPlannerQualityCandidate[] {
  const core = BRUSH_PRESETS.map(studioCoreBrushCatalogSelection);
  const professional = materializeAllStudioBrushPackSelections();
  return [
    ...core,
    ...professional.map((selection, index) => ({
      ...selection,
      category: STUDIO_BRUSH_PACK_DESCRIPTORS[index]!.category,
      previewStyle: STUDIO_BRUSH_PACK_DESCRIPTORS[index]!.previewStyle,
    })),
  ];
}

function main(): void {
  mkdirSync(OUTPUT_ROOT, { recursive: true });
  const started = performance.now();
  const candidates = shippedCandidates();
  const audit = auditStudioBrushPlannerQualityCatalogue(candidates);
  const report = {
    kind: "toonspectrum-studio-brush-planner-quality-v1",
    generatedAt: new Date().toISOString(),
    runtimeMs: performance.now() - started,
    outputRoot: OUTPUT_ROOT,
    policy: {
      shippedPresetCount: 214,
      firstTapPeakChannelDeltaFloor: 4.5,
      continuousFirstTapPeakChannelDeltaFloor: 12,
      continuousCurveGapRatioMaximum: 1,
      continuousDensitySpanMaximum: 2.5,
      minimumMeanEffectiveAlpha: 0.05,
      exactFingerprintGroupsMaximum: 0,
      perceptualFingerprintGroupsMaximum: 0,
      warningCountMaximum: 0,
    },
    summary: {
      presetCount: audit.results.length,
      errorCount: audit.errorCount,
      warningCount: audit.warningCount,
      exactFingerprintGroupCount: audit.exactFingerprintGroups.length,
      perceptualFingerprintGroupCount: audit.perceptualFingerprintGroups.length,
    },
    worstOffenders: audit.rankedWorst.slice(0, 32),
    ...audit,
    ok:
      candidates.length === 214
      && audit.results.length === 214
      && audit.ok
      && audit.warningCount === 0
      && audit.exactFingerprintGroups.length === 0
      && audit.perceptualFingerprintGroups.length === 0,
  };
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  log(
    `${report.summary.presetCount} presets · `
    + `${report.summary.errorCount} errors · `
    + `${report.summary.warningCount} warnings · `
    + `${report.summary.exactFingerprintGroupCount} exact collisions · `
    + `${report.summary.perceptualFingerprintGroupCount} perceptual collisions`,
  );
  for (const result of report.worstOffenders.slice(0, 12)) {
    log(
      `${result.catalogId}: risk ${result.riskScore.toFixed(2)} · `
      + `tap Δ${result.tap.peakChannelDelta.toFixed(2)} · `
      + `gap ${result.curve.worstGapRatio.toFixed(3)}× · `
      + `spacing ${result.curve.spacingDiameterRatio.toFixed(3)}× · `
      + `density ${result.speed.densitySpan.toFixed(2)}× · `
      + `alpha ${result.opacity.minimumMeanEffectiveAlpha.toFixed(3)}`,
    );
  }
  log(`report ${REPORT_PATH}`);
  invariant(report.ok, "Studio brush planner quality gate failed; inspect its JSON report");
  log("ALL 214 SHIPPED BRUSH PLANNER QUALITY GATES OK");
}

try {
  main();
} catch (error) {
  log(`FATAL: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exit(1);
}
