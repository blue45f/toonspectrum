/**
 * One production-preview gate for the complete artist-critical drawing journey.
 *
 * This is deliberately an orchestrator, not another Playwright harness. It composes the existing
 * browser-owned oracles:
 *
 * - verify-studio-brushes.mts (long-only): pointer-down live pixels -> release -> settled commit
 *   -> autosave -> Undo, including live/commit quality measurements and screenshots.
 * - verify-studio-lifecycle.mts: pointer gesture -> committed pixels -> Undo/Redo -> autosave
 *   -> reload/recovery -> deterministic PNG export.
 *
 * Run after `pnpm run build`:
 *
 *   pnpm exec tsx scripts/verify-studio-artist-journey.mts
 *
 * Reuse an existing production preview with `TOONSPECTRUM_VERIFY_ORIGIN`. Evidence is isolated
 * beneath `TOONSPECTRUM_ARTIST_JOURNEY_VERIFY_DIR` (or a temporary directory by default).
 */
import { spawn, type ChildProcess } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { DIST_DIR, REPO_ROOT } from "./lib/repo-paths.mjs";
import { STUDIO_LONG_BRUSH_QUALITY_REPORT_SCHEMA_VERSION } from "./studio-brush-long-matrix-quality";
import {
  studioLifecycleVisualViolations,
  type PixelDiffEvidence,
  type StudioLifecycleVisualEvidence,
} from "./studio-lifecycle-verifier-policy";

const MAX_REPORT_BYTES = 128 * 1024 * 1024;
const SHA256 = /^[0-9a-f]{64}$/u;
const LIVE_CAPTURE_SEQUENCE = [
  "00-baseline",
  "01-live-pointer-down",
  "02-released-immediate",
  "03-settled-autosaved",
] as const;

export const STUDIO_ARTIST_JOURNEY_REPORT_SCHEMA_VERSION = 1 as const;

export interface StudioArtistJourneyChildPlan {
  readonly id: "lifecycle" | "live-commit";
  readonly script: string;
  readonly outputDirectory: string;
  readonly environment: Readonly<Record<string, string>>;
}

export interface StudioArtistJourneyAudit {
  readonly ok: boolean;
  readonly issues: readonly string[];
  readonly coverage: Readonly<{
    pointer: boolean;
    live: boolean;
    commit: boolean;
    undo: boolean;
    save: boolean;
    reload: boolean;
    export: boolean;
  }>;
  readonly liveCommit: Readonly<{
    expectedBrushes: number;
    analyzedBrushes: number;
    livePixelsVerifiedBrushes: number;
    settledPixelsVerifiedBrushes: number;
    qualityPassedBrushes: number;
  }>;
  readonly lifecycle: Readonly<{
    committedPixels: number;
    autosavedPointCount: number;
    reloadChangedPixels: number;
    exportChangedPixels: number;
    exportByteIdentical: boolean;
  }>;
  readonly evidenceTopology:
    "one-gate-overlapping-production-browser-oracles";
  readonly limitation:
    "Live/commit and persistence/export are overlapping real-browser oracles; they do not share one runtime stroke id.";
}

interface StudioArtistJourneyRunReport {
  readonly schemaVersion: typeof STUDIO_ARTIST_JOURNEY_REPORT_SCHEMA_VERSION;
  readonly ok: true;
  readonly generatedAt: string;
  readonly root: string;
  readonly artifacts: Readonly<{
    directory: string;
    log: string;
    lifecycleReport: string;
    liveCommitReport: string;
    report: string;
  }>;
  readonly childPlans: readonly StudioArtistJourneyChildPlan[];
  readonly audit: StudioArtistJourneyAudit;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) > 0
    ? value as number
    : null;
}

function stringArray(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every(entry => typeof entry === "string")
    ? value
    : null;
}

function pixelEvidence(value: unknown): PixelDiffEvidence | null {
  const candidate = record(value);
  const changedPixels = finiteNumber(candidate?.changedPixels);
  const totalPixels = finiteNumber(candidate?.totalPixels);
  const maxChannelDelta = finiteNumber(candidate?.maxChannelDelta);
  if (
    changedPixels === null
    || totalPixels === null
    || maxChannelDelta === null
    || changedPixels < 0
    || totalPixels <= 0
    || maxChannelDelta < 0
  ) {
    return null;
  }
  return { changedPixels, totalPixels, maxChannelDelta };
}

function lifecycleVisualEvidence(
  value: unknown
): StudioLifecycleVisualEvidence | null {
  const candidate = record(value);
  if (!candidate) return null;
  const blankToCommitted = pixelEvidence(candidate.blankToCommitted);
  const blankToUndone = pixelEvidence(candidate.blankToUndone);
  const committedToRedone = pixelEvidence(candidate.committedToRedone);
  const redoneToReloaded = pixelEvidence(candidate.redoneToReloaded);
  const beforeToAfterReloadExport = pixelEvidence(
    candidate.beforeToAfterReloadExport
  );
  if (
    !blankToCommitted
    || !blankToUndone
    || !committedToRedone
    || !redoneToReloaded
    || !beforeToAfterReloadExport
  ) {
    return null;
  }
  return {
    blankToCommitted,
    blankToUndone,
    committedToRedone,
    redoneToReloaded,
    beforeToAfterReloadExport,
  };
}

function reportBrowserIssues(
  value: unknown,
  label: string,
  issues: string[]
): boolean {
  const browserErrors = record(value);
  const messages = stringArray(browserErrors?.messages);
  const failedResponses = stringArray(browserErrors?.failedResponses);
  if (!messages || !failedResponses) {
    issues.push(`${label}: browser diagnostics envelope is missing`);
    return false;
  }
  if (messages.length > 0) {
    issues.push(`${label}: ${messages.length} unexpected console/page errors`);
  }
  if (failedResponses.length > 0) {
    issues.push(`${label}: ${failedResponses.length} unexpected 5xx responses`);
  }
  return messages.length === 0 && failedResponses.length === 0;
}

function auditLifecycleReport(
  value: unknown,
  issues: string[]
): StudioArtistJourneyAudit["lifecycle"] & Readonly<{
  pointer: boolean;
  commit: boolean;
  undo: boolean;
  save: boolean;
  reload: boolean;
  export: boolean;
}> {
  const report = record(value);
  if (!report || report.ok !== true) {
    issues.push("lifecycle: verifier did not return ok=true");
  }
  reportBrowserIssues(report?.browserErrors, "lifecycle", issues);

  const visual = lifecycleVisualEvidence(report?.visual);
  if (!visual) {
    issues.push("lifecycle: visual transition evidence is incomplete");
  }
  const visualIssues = visual ? studioLifecycleVisualViolations(visual) : [];
  for (const issue of visualIssues) issues.push(`lifecycle: ${issue}`);

  const autosave = record(report?.autosave);
  const stroke = record(autosave?.stroke);
  const drawCount = positiveInteger(autosave?.drawCount);
  const pointCount = positiveInteger(stroke?.pointCount);
  const fingerprint =
    typeof stroke?.fingerprint === "string" ? stroke.fingerprint : "";
  const save =
    drawCount === 1
    && pointCount !== null
    && pointCount >= 8
    && SHA256.test(fingerprint);
  if (!save) {
    issues.push(
      "lifecycle: autosave does not contain exactly one non-degenerate hashed stroke"
    );
  }

  const exportReport = record(report?.export);
  const before = record(exportReport?.beforeReload);
  const after = record(exportReport?.afterReload);
  const expectedWidth = positiveInteger(exportReport?.expectedWidth);
  const expectedHeight = positiveInteger(exportReport?.expectedHeight);
  const beforeWidth = positiveInteger(before?.width);
  const beforeHeight = positiveInteger(before?.height);
  const afterWidth = positiveInteger(after?.width);
  const afterHeight = positiveInteger(after?.height);
  const beforeBytes = positiveInteger(before?.bytes);
  const afterBytes = positiveInteger(after?.bytes);
  const beforeVisible = positiveInteger(before?.backgroundDifferentPixels);
  const afterVisible = positiveInteger(after?.backgroundDifferentPixels);
  const beforeHash = typeof before?.sha256 === "string" ? before.sha256 : "";
  const afterHash = typeof after?.sha256 === "string" ? after.sha256 : "";
  const exportEnvelope =
    expectedWidth !== null
    && expectedHeight !== null
    && beforeWidth === expectedWidth
    && afterWidth === expectedWidth
    && beforeHeight === expectedHeight
    && afterHeight === expectedHeight
    && beforeBytes !== null
    && afterBytes !== null
    && beforeVisible !== null
    && beforeVisible >= 8
    && afterVisible !== null
    && afterVisible >= 8
    && SHA256.test(beforeHash)
    && SHA256.test(afterHash);
  if (!exportEnvelope) {
    issues.push("lifecycle: PNG export integrity/dimension/visible-pixel evidence is incomplete");
  }
  const exportPixelIdentical =
    visual?.beforeToAfterReloadExport.changedPixels === 0;
  if (!exportPixelIdentical) {
    issues.push("lifecycle: pre/post reload PNG exports are not pixel-identical");
  }
  const exportByteIdentical =
    SHA256.test(beforeHash)
    && beforeHash === afterHash
    && beforeBytes === afterBytes;
  if (!exportByteIdentical) {
    issues.push("lifecycle: deterministic PNG exports are not byte-identical");
  }

  const pointer = Boolean(
    visual
    && visual.blankToCommitted.changedPixels >= 8
    && visual.blankToCommitted.maxChannelDelta >= 8
  );
  const undo = Boolean(
    visual
    && !visualIssues.includes("undo did not restore the blank canvas")
  );
  const reload = Boolean(
    visual
    && !visualIssues.includes("reload did not restore the saved stroke")
  );
  return {
    committedPixels: visual?.blankToCommitted.changedPixels ?? 0,
    autosavedPointCount: pointCount ?? 0,
    reloadChangedPixels: visual?.redoneToReloaded.changedPixels ?? -1,
    exportChangedPixels:
      visual?.beforeToAfterReloadExport.changedPixels ?? -1,
    exportByteIdentical,
    pointer,
    commit: pointer,
    undo,
    save,
    reload,
    export: exportEnvelope && exportPixelIdentical && exportByteIdentical,
  };
}

function auditLiveCommitReport(
  value: unknown,
  issues: string[]
): StudioArtistJourneyAudit["liveCommit"] & Readonly<{
  pointer: boolean;
  live: boolean;
  commit: boolean;
  undo: boolean;
  save: boolean;
}> {
  const report = record(value);
  if (
    !report
    || report.schemaVersion !== STUDIO_LONG_BRUSH_QUALITY_REPORT_SCHEMA_VERSION
  ) {
    issues.push("live/commit: unsupported or missing quality report schema");
  }
  if (report?.completed !== true) {
    issues.push("live/commit: long-brush browser verifier did not complete");
  }
  const expectedBrushes = positiveInteger(report?.expectedPresetCount) ?? 0;
  const analyzedBrushes = positiveInteger(report?.analyzedPresetCount) ?? 0;
  const declaredFailureCount = report?.qualityFailureCount;
  const failureCount =
    Number.isSafeInteger(declaredFailureCount)
    && (declaredFailureCount as number) >= 0
      ? declaredFailureCount as number
      : -1;
  const evidence = Array.isArray(report?.evidence) ? report.evidence : [];
  if (
    expectedBrushes === 0
    || analyzedBrushes !== expectedBrushes
    || evidence.length !== analyzedBrushes
  ) {
    issues.push("live/commit: analyzed brush count does not match the complete core matrix");
  }
  if (failureCount !== 0) {
    issues.push(`live/commit: ${failureCount < 0 ? "unknown" : failureCount} quality failures`);
  }

  const measurement = record(report?.measurementContract);
  const captures = stringArray(measurement?.capturesPerBrush);
  if (
    !captures
    || captures.length !== LIVE_CAPTURE_SEQUENCE.length
    || captures.some((entry, index) => entry !== LIVE_CAPTURE_SEQUENCE[index])
    || measurement?.identicalCropWithinBrush !== true
  ) {
    issues.push("live/commit: exact baseline/live/released/settled capture contract is missing");
  }

  let livePixelsVerifiedBrushes = 0;
  let settledPixelsVerifiedBrushes = 0;
  let policyScopedBrushCount = 0;
  let qualityPassedBrushes = 0;
  const ids = new Set<string>();
  let everySave = evidence.length > 0;
  for (const [index, raw] of evidence.entries()) {
    const entry = record(raw);
    const id = typeof entry?.id === "string" ? entry.id : "";
    if (!id || ids.has(id)) {
      issues.push(`live/commit: evidence ${index} has a missing or duplicate brush id`);
    } else {
      ids.add(id);
    }
    const quality = record(entry?.quality);
    const policyKind = record(quality?.policy)?.kind;
    const isRecordOnlyDiscrete = policyKind === "record-only-discrete";
    if (!isRecordOnlyDiscrete) {
      policyScopedBrushCount += 1;
    }
    const frames = record(quality?.frames);
    const live = record(frames?.live);
    const released = record(frames?.released);
    const settled = record(frames?.settled);
    const livePixels = positiveInteger(live?.visiblePixels) ?? 0;
    const releasedPixels = positiveInteger(released?.visiblePixels) ?? 0;
    const settledPixels = positiveInteger(settled?.visiblePixels) ?? 0;
    if (!isRecordOnlyDiscrete) {
      if (livePixels > 0) livePixelsVerifiedBrushes += 1;
      if (settledPixels > 0) settledPixelsVerifiedBrushes += 1;
    }
    if (quality?.ok === true) qualityPassedBrushes += 1;
    if (
      releasedPixels === 0
      || (!isRecordOnlyDiscrete && (livePixels === 0 || settledPixels === 0))
    ) {
      issues.push(`live/commit: ${id || index} has a missing rendered phase`);
    }
    if (quality?.ok !== true) {
      issues.push(`live/commit: ${id || index} failed its carrier quality policy`);
    }
    const transitions = record(quality?.transitions);
    const liveToReleased = record(transitions?.liveToReleased);
    const liveToSettled = record(transitions?.liveToSettled);
    const releasedToSettled = record(transitions?.releasedToSettled);
    if (
      liveToReleased?.from !== "live"
      || liveToReleased.to !== "released"
      || liveToSettled?.from !== "live"
      || liveToSettled.to !== "settled"
      || releasedToSettled?.from !== "released"
      || releasedToSettled.to !== "settled"
    ) {
      issues.push(`live/commit: ${id || index} transition evidence is incomplete`);
    }
    const artifacts = record(entry?.artifacts);
    for (const phase of ["baseline", "live", "released", "settled"] as const) {
      const artifact = record(artifacts?.[phase]);
      if (
        typeof artifact?.absolute !== "string"
        || typeof artifact.relativeToScratch !== "string"
      ) {
        issues.push(`live/commit: ${id || index} has no ${phase} artifact`);
      }
    }
    everySave &&=
      typeof entry?.runtimeBrushId === "string"
      && entry.runtimeBrushId.length > 0;
  }

  const transitionSummary = record(report?.transitionSummary);
  for (const key of [
    "liveToReleased",
    "liveToSettled",
    "releasedToSettled",
  ] as const) {
    const summary = record(transitionSummary?.[key]);
    if (summary?.analyzedBrushCount !== analyzedBrushes) {
      issues.push(`live/commit: ${key} summary does not cover every analyzed brush`);
    }
  }

  const complete =
    expectedBrushes > 0
    && analyzedBrushes === expectedBrushes
    && evidence.length === analyzedBrushes;
  return {
    expectedBrushes,
    analyzedBrushes,
    livePixelsVerifiedBrushes,
    settledPixelsVerifiedBrushes,
    qualityPassedBrushes,
    pointer: complete,
    live:
      complete
      && livePixelsVerifiedBrushes === policyScopedBrushCount,
    commit:
      complete
      && settledPixelsVerifiedBrushes === policyScopedBrushCount
      && qualityPassedBrushes === analyzedBrushes,
    // A completed long-brush report is emitted only after every per-brush Undo assertion passes.
    undo: complete && report?.completed === true,
    save: complete && everySave,
  };
}

export function auditStudioArtistJourneyReports(
  lifecycleReport: unknown,
  liveCommitReport: unknown
): StudioArtistJourneyAudit {
  const issues: string[] = [];
  const lifecycle = auditLifecycleReport(lifecycleReport, issues);
  const liveCommit = auditLiveCommitReport(liveCommitReport, issues);
  const coverage = Object.freeze({
    pointer: lifecycle.pointer && liveCommit.pointer,
    live: liveCommit.live,
    commit: lifecycle.commit && liveCommit.commit,
    undo: lifecycle.undo && liveCommit.undo,
    save: lifecycle.save && liveCommit.save,
    reload: lifecycle.reload,
    export: lifecycle.export,
  });
  if (Object.values(coverage).some(value => !value)) {
    issues.push("journey: one or more pointer/live/commit/undo/save/reload/export phases failed");
  }
  return Object.freeze({
    ok: issues.length === 0,
    issues: Object.freeze(issues),
    coverage,
    liveCommit: Object.freeze({
      expectedBrushes: liveCommit.expectedBrushes,
      analyzedBrushes: liveCommit.analyzedBrushes,
      livePixelsVerifiedBrushes: liveCommit.livePixelsVerifiedBrushes,
      settledPixelsVerifiedBrushes: liveCommit.settledPixelsVerifiedBrushes,
      qualityPassedBrushes: liveCommit.qualityPassedBrushes,
    }),
    lifecycle: Object.freeze({
      committedPixels: lifecycle.committedPixels,
      autosavedPointCount: lifecycle.autosavedPointCount,
      reloadChangedPixels: lifecycle.reloadChangedPixels,
      exportChangedPixels: lifecycle.exportChangedPixels,
      exportByteIdentical: lifecycle.exportByteIdentical,
    }),
    evidenceTopology: "one-gate-overlapping-production-browser-oracles",
    limitation:
      "Live/commit and persistence/export are overlapping real-browser oracles; they do not share one runtime stroke id.",
  });
}

export function createStudioArtistJourneyVerifierPlan(
  root: string,
  artifactDirectory: string
): readonly StudioArtistJourneyChildPlan[] {
  const resolvedRoot = resolve(root);
  const resolvedArtifacts = resolve(artifactDirectory);
  return Object.freeze([
    Object.freeze({
      id: "lifecycle",
      script: join(resolvedRoot, "scripts", "verify-studio-lifecycle.mts"),
      outputDirectory: join(resolvedArtifacts, "lifecycle"),
      environment: Object.freeze({
        TOONSPECTRUM_LIFECYCLE_VERIFY_DIR: join(
          resolvedArtifacts,
          "lifecycle"
        ),
      }),
    }),
    Object.freeze({
      id: "live-commit",
      script: join(resolvedRoot, "scripts", "verify-studio-brushes.mts"),
      outputDirectory: join(resolvedArtifacts, "live-commit"),
      environment: Object.freeze({
        TOONSPECTRUM_BRUSH_VERIFY_DIR: join(
          resolvedArtifacts,
          "live-commit"
        ),
        TOONSPECTRUM_BRUSH_LONG_ONLY: "1",
        TOONSPECTRUM_ALL_BRUSH_LONG_MATRIX: "0",
        TOONSPECTRUM_DRAWING_ONLY: "0",
        TOONSPECTRUM_SHAPES_ONLY: "0",
      }),
    }),
  ]);
}

function appendBoundedTail(current: string, chunk: string): string {
  const next = current + chunk;
  return next.length <= 32_768 ? next : next.slice(-32_768);
}

async function runChildVerifier(
  plan: StudioArtistJourneyChildPlan,
  root: string,
  logPath: string
): Promise<void> {
  mkdirSync(plan.outputDirectory, { recursive: true });
  const tsxCli = join(root, "node_modules", "tsx", "dist", "cli.mjs");
  if (!existsSync(tsxCli)) throw new Error(`tsx CLI is missing: ${tsxCli}`);
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child: ChildProcess = spawn(
      process.execPath,
      [tsxCli, plan.script],
      {
        cwd: root,
        env: {
          ...process.env,
          ...plan.environment,
        },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    let tail = "";
    const capture = (chunk: Buffer | string) => {
      const text = String(chunk);
      appendFileSync(logPath, text);
      tail = appendBoundedTail(tail, text);
    };
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(
        `${plan.id} verifier failed with code=${String(code)} signal=${String(signal)}\n${tail}`
      ));
    });
  });
}

function findReport(root: string, fileName: string): string {
  const matches: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name === fileName) matches.push(path);
    }
  };
  visit(root);
  if (matches.length !== 1) {
    throw new Error(
      `expected exactly one ${fileName} below ${root}, found ${matches.length}`
    );
  }
  return matches[0]!;
}

function readJsonReport(path: string): unknown {
  const size = statSync(path).size;
  if (size <= 0 || size > MAX_REPORT_BYTES) {
    throw new Error(`report size is outside the verifier budget: ${path} (${size})`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

async function main(): Promise<void> {
  const root = REPO_ROOT;
  if (!existsSync(join(DIST_DIR, "index.html"))) {
    throw new Error(
      "dist/index.html is missing; run `pnpm run build` before the artist journey verifier"
    );
  }
  const artifactDirectory = resolve(
    process.env.TOONSPECTRUM_ARTIST_JOURNEY_VERIFY_DIR
    ?? process.env.TOONSPECTRUM_VERIFY_DIR
    ?? join(tmpdir(), "toonspectrum-studio-artist-journey")
  );
  mkdirSync(artifactDirectory, { recursive: true });
  const logPath = join(artifactDirectory, "studio-artist-journey.log");
  const reportPath = join(
    artifactDirectory,
    "studio-artist-journey-report.json"
  );
  writeFileSync(logPath, "");

  const plans = createStudioArtistJourneyVerifierPlan(root, artifactDirectory);
  for (const plan of plans) {
    appendFileSync(logPath, `[artist-journey] START ${plan.id}\n`);
    await runChildVerifier(plan, root, logPath);
    appendFileSync(logPath, `[artist-journey] PASS ${plan.id}\n`);
  }

  const lifecycleReportPath = findReport(
    plans[0]!.outputDirectory,
    "studio-lifecycle-report.json"
  );
  const liveCommitReportPath = findReport(
    plans[1]!.outputDirectory,
    "long-brush-quality-report.json"
  );
  const audit = auditStudioArtistJourneyReports(
    readJsonReport(lifecycleReportPath),
    readJsonReport(liveCommitReportPath)
  );
  if (!audit.ok) {
    throw new Error(
      `artist journey evidence audit failed:\n${audit.issues.join("\n")}`
    );
  }
  const report: StudioArtistJourneyRunReport = {
    schemaVersion: STUDIO_ARTIST_JOURNEY_REPORT_SCHEMA_VERSION,
    ok: true,
    generatedAt: new Date().toISOString(),
    root,
    artifacts: {
      directory: artifactDirectory,
      log: logPath,
      lifecycleReport: lifecycleReportPath,
      liveCommitReport: liveCommitReportPath,
      report: reportPath,
    },
    childPlans: plans,
    audit,
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `[verify-studio-artist-journey] POINTER → LIVE → COMMIT → UNDO → SAVE → RELOAD → EXPORT OK`
  );
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    console.error(
      `[verify-studio-artist-journey] FATAL: ${
        error instanceof Error ? error.stack ?? error.message : String(error)
      }`
    );
    process.exitCode = 1;
  });
}
