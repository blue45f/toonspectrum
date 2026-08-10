/**
 * Long-session studio-engine soak harness (V12 release gate).
 *
 * Every cycle exercises command dispatch, snapshots, crash recovery, Vello
 * CPU/WASM, and CanvasKit. A release receipt is valid only when the exact
 * source/runtime identity remains clean and unchanged for the full run and
 * the post-warmup RSS curve converges. Short runs remain useful as smoke
 * checks, but cannot claim the 24-hour release gate.
 *
 * Release run:
 *   SOAK_MINUTES=1440 pnpm run soak:studio-engine
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { arch, cpus, platform } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { PaintIR, PathIR } from "@toonspectrum/studio-project-model";

const MIB = 1024 * 1024;
const HOUR_MS = 60 * 60 * 1_000;
const RELEASE_GATE_MINUTES = 24 * 60;
const MEMORY_GATE_MINUTES = 60;
const REPORT_SCHEMA_VERSION = 2;
const MAX_THEIL_SEN_POINTS = 256;

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const RESULTS_DIR = join(REPO_ROOT, "tests", "benchmarks", "results");
const HARNESS_PATH = fileURLToPath(import.meta.url);

export const SOURCE_SCOPE = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tests/benchmarks/harness/soak.ts",
  "tests/benchmarks/harness/soak.test.ts",
  "packages/studio-project-model",
  "packages/studio-engine-skia",
  "packages/studio-engine-vello",
  "crates/studio-engine-vello",
] as const;

const VELLO_PKG_DIRECTORY = "crates/studio-engine-vello/pkg";
const VELLO_INTEGRITY_PATH = `${VELLO_PKG_DIRECTORY}/INTEGRITY.sha256`;
const REQUIRED_EXECUTED_RUNTIME_FILES = [
  `${VELLO_PKG_DIRECTORY}/studio_engine_vello.js`,
  `${VELLO_PKG_DIRECTORY}/studio_engine_vello_bg.wasm`,
] as const;

export interface RssSample {
  readonly elapsedMs: number;
  readonly rssMiB: number;
  readonly renders: number;
}

export interface MemoryConvergenceThresholds {
  readonly warmupFraction: number;
  readonly lateWindowFraction: number;
  readonly minimumSamples: number;
  readonly maximumPostWarmupSlopeMiBPerHour: number;
  readonly maximumLateWindowSlopeMiBPerHour: number;
  readonly maximumLateWindowDeltaMiB: number;
  readonly maximumGrowthFromFirstMiB: number;
  readonly maximumSlopeKiBPerRender: number;
}

/**
 * Thresholds are pinned against the passing 8-hour evidence (225.1→344.8
 * MiB, one early 392.7 MiB allocator spike, ~5.4 MiB/hour post-warmup slope,
 * ~4.6 MiB/hour late slope). A 64 KiB/render linear leak exceeds the
 * per-render threshold by 128× and the time slopes by orders of magnitude.
 */
export const DEFAULT_MEMORY_THRESHOLDS: MemoryConvergenceThresholds = {
  warmupFraction: 0.25,
  lateWindowFraction: 0.25,
  minimumSamples: 12,
  maximumPostWarmupSlopeMiBPerHour: 8,
  maximumLateWindowSlopeMiBPerHour: 8,
  maximumLateWindowDeltaMiB: 32,
  maximumGrowthFromFirstMiB: 192,
  maximumSlopeKiBPerRender: 0.5,
};

export interface MemoryConvergenceAnalysis {
  readonly pass: boolean;
  readonly reasons: readonly string[];
  readonly slopeEstimator: "theil-sen-median-pairwise";
  readonly slopeEstimatorMaximumPoints: number;
  readonly lateWindowDeltaEstimator: "median-second-half-minus-median-first-half";
  readonly sampleCount: number;
  readonly warmupFraction: number;
  readonly warmupCutoffElapsedMs: number | null;
  readonly postWarmupSampleCount: number;
  readonly lateWindowFraction: number;
  readonly lateWindowSampleCount: number;
  readonly postWarmupSlopeMiBPerHour: number | null;
  readonly lateWindowSlopeMiBPerHour: number | null;
  readonly slopeKiBPerRender: number | null;
  readonly lateWindowDeltaMiB: number | null;
  readonly maximumGrowthFromFirstMiB: number | null;
  readonly firstRssMiB: number | null;
  readonly lastRssMiB: number | null;
  readonly peakRssMiB: number | null;
  readonly thresholds: MemoryConvergenceThresholds;
}

interface FileReceipt {
  readonly path: string;
  readonly sizeBytes: number | null;
  readonly sha256: string | null;
  readonly error: string | null;
}

interface RuntimeFileReceipt extends FileReceipt {
  readonly executedByHarness: boolean;
  readonly integrityManifestSha256: string | null;
  readonly integrityMatch: boolean | null;
}

interface GitStatusReceipt {
  readonly format: "porcelain-v2-z";
  readonly untrackedFiles: "all";
  readonly clean: boolean;
  readonly records: readonly string[];
  readonly trackedRecordCount: number;
  readonly untrackedRecordCount: number;
}

interface SourceSnapshot {
  readonly revision: string;
  readonly scope: typeof SOURCE_SCOPE;
  readonly status: GitStatusReceipt;
  readonly digestAlgorithm: "sha256-over-sorted-path-size-content-sha256-receipts";
  readonly sourceFileCount: number;
  readonly sourceDigestSha256: string;
  readonly sourceReceiptErrors: readonly string[];
  readonly runtimeFiles: readonly RuntimeFileReceipt[];
  readonly runtimeDigestSha256: string;
  readonly runtimeIntegrityErrors: readonly string[];
  readonly combinedSourceRuntimeDigestSha256: string;
}

interface SoakConfig {
  readonly soakMinutes: number;
  readonly durationMs: number;
  readonly sampleIntervalMs: number;
  readonly snapshotEvery: number;
  readonly strokesPerCycle: number;
  readonly memoryGateEnforced: boolean;
}

interface SoakReport {
  readonly schemaVersion: number;
  readonly harness: string;
  readonly status: "pass" | "smoke-pass" | "fail";
  readonly pass: boolean;
  readonly releaseGate: {
    readonly requiredMinutes: number;
    readonly eligible: boolean;
    readonly durationSatisfied: boolean;
    readonly pass: boolean;
  };
  readonly generatedAt: string;
  readonly startedAt: string;
  readonly workloadStartedAt: string | null;
  readonly workloadCompletedAt: string | null;
  readonly completedAt: string;
  readonly source: {
    readonly atStart: SourceSnapshot | null;
    readonly atEnd: SourceSnapshot | null;
    readonly revisionStable: boolean;
    readonly sourceDigestStable: boolean;
    readonly runtimeDigestStable: boolean;
    readonly combinedDigestStable: boolean;
    readonly harnessSha256: string;
  };
  readonly host: {
    readonly platform: string;
    readonly arch: string;
    readonly cpu: string | undefined;
    readonly node: string;
  };
  readonly config: SoakConfig | null;
  readonly elapsedMs: number;
  readonly elapsedMinutes: number;
  readonly totalWallElapsedMs: number;
  readonly totals: {
    readonly cycles: number;
    readonly commands: number;
    readonly renders: number;
    readonly errors: number;
  };
  readonly rssSamples: readonly RssSample[];
  readonly memoryConvergence: MemoryConvergenceAnalysis;
  readonly errors: readonly string[];
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const left = sorted[middle - 1];
  const right = sorted[middle];
  return left === undefined || right === undefined ? null : (left + right) / 2;
}

function evenlyDownsample<T>(values: readonly T[], maximumPoints: number): readonly T[] {
  if (values.length <= maximumPoints) return values;
  return Array.from({ length: maximumPoints }, (_, index) => {
    const sourceIndex = Math.round((index * (values.length - 1)) / (maximumPoints - 1));
    return values[sourceIndex] as T;
  });
}

function theilSenSlope(
  samples: readonly RssSample[],
  x: (sample: RssSample) => number,
): number | null {
  const bounded = evenlyDownsample(samples, MAX_THEIL_SEN_POINTS);
  const slopes: number[] = [];
  for (let left = 0; left < bounded.length; left += 1) {
    const leftSample = bounded[left];
    if (!leftSample) continue;
    for (let right = left + 1; right < bounded.length; right += 1) {
      const rightSample = bounded[right];
      if (!rightSample) continue;
      const deltaX = x(rightSample) - x(leftSample);
      if (deltaX <= 0) continue;
      slopes.push((rightSample.rssMiB - leftSample.rssMiB) / deltaX);
    }
  }
  return median(slopes);
}

export function theilSenSlopeMiBPerHour(samples: readonly RssSample[]): number | null {
  const slopePerMillisecond = theilSenSlope(samples, (sample) => sample.elapsedMs);
  return slopePerMillisecond === null ? null : slopePerMillisecond * HOUR_MS;
}

function theilSenSlopeKiBPerRender(samples: readonly RssSample[]): number | null {
  const slopeMiBPerRender = theilSenSlope(samples, (sample) => sample.renders);
  return slopeMiBPerRender === null ? null : slopeMiBPerRender * 1024;
}

function validateThresholds(thresholds: MemoryConvergenceThresholds): void {
  if (!(thresholds.warmupFraction > 0 && thresholds.warmupFraction < 0.75)) {
    throw new RangeError("warmupFraction must be greater than 0 and less than 0.75");
  }
  if (!(thresholds.lateWindowFraction > 0 && thresholds.lateWindowFraction <= 0.5)) {
    throw new RangeError("lateWindowFraction must be greater than 0 and at most 0.5");
  }
  if (!Number.isInteger(thresholds.minimumSamples) || thresholds.minimumSamples < 4) {
    throw new RangeError("minimumSamples must be an integer of at least 4");
  }
  for (const [name, value] of Object.entries(thresholds)) {
    if (name.endsWith("Fraction") || name === "minimumSamples") continue;
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${name} must be a finite non-negative number`);
    }
  }
}

/** Pure, deterministic RSS convergence analysis used by the release harness and tests. */
export function analyzeMemoryConvergence(
  samples: readonly RssSample[],
  thresholds: MemoryConvergenceThresholds = DEFAULT_MEMORY_THRESHOLDS,
): MemoryConvergenceAnalysis {
  validateThresholds(thresholds);
  const reasons: string[] = [];
  const validSamples = samples.every(
    (sample, index) =>
      Number.isFinite(sample.elapsedMs) &&
      sample.elapsedMs >= 0 &&
      Number.isFinite(sample.rssMiB) &&
      sample.rssMiB > 0 &&
      Number.isFinite(sample.renders) &&
      sample.renders >= 0 &&
      (index === 0 ||
        (sample.elapsedMs > (samples[index - 1]?.elapsedMs ?? -1) &&
          sample.renders >= (samples[index - 1]?.renders ?? 0))),
  );
  if (!validSamples) reasons.push("RSS samples must be finite and monotonic in elapsed time/renders");
  if (samples.length < thresholds.minimumSamples) {
    reasons.push(
      `memory sample count ${samples.length} is below ${thresholds.minimumSamples}`,
    );
  }

  const usable = validSamples ? samples : [];
  const first = usable[0];
  const last = usable[usable.length - 1];
  const durationMs = first && last ? last.elapsedMs - first.elapsedMs : 0;
  const warmupCutoffElapsedMs =
    first && durationMs > 0
      ? first.elapsedMs + durationMs * thresholds.warmupFraction
      : null;
  const postWarmup =
    warmupCutoffElapsedMs === null
      ? []
      : usable.filter((sample) => sample.elapsedMs >= warmupCutoffElapsedMs);
  const lateWindowStart =
    first && durationMs > 0
      ? first.elapsedMs + durationMs * (1 - thresholds.lateWindowFraction)
      : null;
  const lateWindow =
    lateWindowStart === null
      ? []
      : usable.filter((sample) => sample.elapsedMs >= lateWindowStart);
  const lateWindowMidpoint =
    lateWindowStart === null || !last
      ? null
      : lateWindowStart + (last.elapsedMs - lateWindowStart) / 2;
  const lateFirstHalf =
    lateWindowMidpoint === null
      ? []
      : lateWindow.filter((sample) => sample.elapsedMs < lateWindowMidpoint);
  const lateSecondHalf =
    lateWindowMidpoint === null
      ? []
      : lateWindow.filter((sample) => sample.elapsedMs >= lateWindowMidpoint);
  const lateFirstMedian = median(lateFirstHalf.map((sample) => sample.rssMiB));
  const lateSecondMedian = median(lateSecondHalf.map((sample) => sample.rssMiB));
  const lateWindowDeltaMiB =
    lateFirstMedian === null || lateSecondMedian === null
      ? null
      : lateSecondMedian - lateFirstMedian;
  const postWarmupSlopeMiBPerHour = theilSenSlopeMiBPerHour(postWarmup);
  const lateWindowSlopeMiBPerHour = theilSenSlopeMiBPerHour(lateWindow);
  const slopeKiBPerRender = theilSenSlopeKiBPerRender(postWarmup);
  const peakRssMiB = usable.reduce<number | null>(
    (peak, sample) => (peak === null ? sample.rssMiB : Math.max(peak, sample.rssMiB)),
    null,
  );
  const maximumGrowthFromFirstMiB =
    first && peakRssMiB !== null ? peakRssMiB - first.rssMiB : null;

  if (postWarmup.length < 2 || postWarmupSlopeMiBPerHour === null) {
    reasons.push("post-warmup window does not contain enough samples for a robust slope");
  } else if (
    postWarmupSlopeMiBPerHour > thresholds.maximumPostWarmupSlopeMiBPerHour
  ) {
    reasons.push(
      `post-warmup RSS slope ${postWarmupSlopeMiBPerHour.toFixed(3)} MiB/hour exceeds ${thresholds.maximumPostWarmupSlopeMiBPerHour}`,
    );
  }
  if (lateWindow.length < 4 || lateWindowSlopeMiBPerHour === null) {
    reasons.push("late window does not contain enough samples for a robust slope");
  } else if (lateWindowSlopeMiBPerHour > thresholds.maximumLateWindowSlopeMiBPerHour) {
    reasons.push(
      `late-window RSS slope ${lateWindowSlopeMiBPerHour.toFixed(3)} MiB/hour exceeds ${thresholds.maximumLateWindowSlopeMiBPerHour}`,
    );
  }
  if (lateWindowDeltaMiB === null) {
    reasons.push("late window cannot be split into two populated plateau windows");
  } else if (lateWindowDeltaMiB > thresholds.maximumLateWindowDeltaMiB) {
    reasons.push(
      `late-window RSS delta ${lateWindowDeltaMiB.toFixed(3)} MiB exceeds ${thresholds.maximumLateWindowDeltaMiB}`,
    );
  }
  if (maximumGrowthFromFirstMiB === null) {
    reasons.push("absolute RSS growth cannot be computed");
  } else if (maximumGrowthFromFirstMiB > thresholds.maximumGrowthFromFirstMiB) {
    reasons.push(
      `maximum RSS growth ${maximumGrowthFromFirstMiB.toFixed(3)} MiB exceeds ${thresholds.maximumGrowthFromFirstMiB}`,
    );
  }
  if (slopeKiBPerRender === null) {
    reasons.push("post-warmup per-render RSS slope cannot be computed");
  } else if (slopeKiBPerRender > thresholds.maximumSlopeKiBPerRender) {
    reasons.push(
      `post-warmup RSS slope ${slopeKiBPerRender.toFixed(3)} KiB/render exceeds ${thresholds.maximumSlopeKiBPerRender}`,
    );
  }

  return {
    pass: reasons.length === 0,
    reasons,
    slopeEstimator: "theil-sen-median-pairwise",
    slopeEstimatorMaximumPoints: MAX_THEIL_SEN_POINTS,
    lateWindowDeltaEstimator: "median-second-half-minus-median-first-half",
    sampleCount: samples.length,
    warmupFraction: thresholds.warmupFraction,
    warmupCutoffElapsedMs,
    postWarmupSampleCount: postWarmup.length,
    lateWindowFraction: thresholds.lateWindowFraction,
    lateWindowSampleCount: lateWindow.length,
    postWarmupSlopeMiBPerHour,
    lateWindowSlopeMiBPerHour,
    slopeKiBPerRender,
    lateWindowDeltaMiB,
    maximumGrowthFromFirstMiB,
    firstRssMiB: first?.rssMiB ?? null,
    lastRssMiB: last?.rssMiB ?? null,
    peakRssMiB,
    thresholds,
  };
}

export function parseSoakMinutes(raw: string | undefined): number {
  const value = Number(raw ?? "0.25");
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError("SOAK_MINUTES must be a finite number greater than zero");
  }
  return value;
}

export function parseGitStatusReceipt(raw: string): GitStatusReceipt {
  const records = raw.split("\0").filter((record) => record.length > 0);
  const untrackedRecordCount = records.filter((record) => record.startsWith("? ")).length;
  return {
    format: "porcelain-v2-z",
    untrackedFiles: "all",
    clean: records.length === 0,
    records,
    trackedRecordCount: records.length - untrackedRecordCount,
    untrackedRecordCount,
  };
}

function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function git(args: readonly string[]): string {
  const result = spawnSync("git", [...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 16 * MIB,
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${String(result.stderr || result.stdout).trim()}`,
    );
  }
  return String(result.stdout);
}

function scopedPaths(): readonly string[] {
  const tracked = git(["ls-files", "-z", "--", ...SOURCE_SCOPE])
    .split("\0")
    .filter(Boolean);
  const untracked = git([
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
    "--",
    ...SOURCE_SCOPE,
  ])
    .split("\0")
    .filter(Boolean);
  return [...new Set([...tracked, ...untracked])].sort();
}

function fileReceipt(path: string): FileReceipt {
  try {
    const absolutePath = resolve(REPO_ROOT, path);
    const repoPrefix = `${resolve(REPO_ROOT)}${sep}`;
    if (absolutePath !== resolve(REPO_ROOT) && !absolutePath.startsWith(repoPrefix)) {
      throw new Error("path escapes repository root");
    }
    const bytes = readFileSync(absolutePath);
    return {
      path,
      sizeBytes: bytes.byteLength,
      sha256: sha256(bytes),
      error: null,
    };
  } catch (error) {
    return {
      path,
      sizeBytes: null,
      sha256: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function digestReceipts(receipts: readonly FileReceipt[]): string {
  const hash = createHash("sha256");
  for (const receipt of [...receipts].sort((left, right) => left.path.localeCompare(right.path))) {
    hash.update(receipt.path);
    hash.update("\0");
    hash.update(receipt.sizeBytes === null ? "missing" : String(receipt.sizeBytes));
    hash.update("\0");
    hash.update(receipt.sha256 ?? `error:${receipt.error ?? "unknown"}`);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function runtimeReceipts(): {
  readonly files: readonly RuntimeFileReceipt[];
  readonly integrityErrors: readonly string[];
} {
  const integrityErrors: string[] = [];
  const manifestReceipt = fileReceipt(VELLO_INTEGRITY_PATH);
  const expectedByPath = new Map<string, string>();
  if (manifestReceipt.error === null) {
    const manifest = readFileSync(resolve(REPO_ROOT, VELLO_INTEGRITY_PATH), "utf8");
    for (const [index, line] of manifest.split(/\r?\n/u).entries()) {
      if (line.trim().length === 0) continue;
      const match = /^([a-f0-9]{64}) {2}([^/\\]+)$/u.exec(line);
      if (!match?.[1] || !match[2]) {
        integrityErrors.push(`invalid Vello integrity manifest line ${index + 1}`);
        continue;
      }
      if (match[2] === "." || match[2] === "..") {
        integrityErrors.push(`invalid Vello integrity manifest filename on line ${index + 1}`);
        continue;
      }
      const path = `${VELLO_PKG_DIRECTORY}/${match[2]}`;
      if (expectedByPath.has(path)) {
        integrityErrors.push(`duplicate Vello integrity manifest entry: ${path}`);
      }
      expectedByPath.set(path, match[1]);
    }
  } else {
    integrityErrors.push(`cannot read ${VELLO_INTEGRITY_PATH}: ${manifestReceipt.error}`);
  }

  for (const required of REQUIRED_EXECUTED_RUNTIME_FILES) {
    if (!expectedByPath.has(required)) {
      integrityErrors.push(`executed Vello runtime missing from integrity manifest: ${required}`);
    }
  }

  const artifactPaths = [...new Set([...expectedByPath.keys(), ...REQUIRED_EXECUTED_RUNTIME_FILES])];
  const artifactReceipts = artifactPaths
    .sort((left, right) => left.localeCompare(right))
    .map((path): RuntimeFileReceipt => {
      const expectedSha256 = expectedByPath.get(path) ?? null;
      const receipt = fileReceipt(path);
      const integrityMatch = expectedSha256 !== null && receipt.sha256 === expectedSha256;
      if (expectedSha256 !== null && !integrityMatch) {
        integrityErrors.push(
          `${path} integrity mismatch: expected ${expectedSha256}, got ${receipt.sha256 ?? receipt.error}`,
        );
      }
      return {
        ...receipt,
        executedByHarness: REQUIRED_EXECUTED_RUNTIME_FILES.includes(
          path as (typeof REQUIRED_EXECUTED_RUNTIME_FILES)[number],
        ),
        integrityManifestSha256: expectedSha256,
        integrityMatch,
      };
    });
  const manifestRuntimeReceipt: RuntimeFileReceipt = {
    ...manifestReceipt,
    executedByHarness: false,
    integrityManifestSha256: null,
    integrityMatch: manifestReceipt.error === null,
  };
  return {
    files: [...artifactReceipts, manifestRuntimeReceipt],
    integrityErrors,
  };
}

function captureSourceSnapshot(): SourceSnapshot {
  const revision = git(["rev-parse", "HEAD"]).trim();
  const status = parseGitStatusReceipt(
    git(["status", "--porcelain=v2", "-z", "--untracked-files=all", "--", ...SOURCE_SCOPE]),
  );
  const sourceReceipts = scopedPaths().map(fileReceipt);
  const sourceReceiptErrors = sourceReceipts
    .filter((receipt) => receipt.error !== null)
    .map((receipt) => `${receipt.path}: ${receipt.error}`);
  const sourceDigestSha256 = digestReceipts(sourceReceipts);
  const runtime = runtimeReceipts();
  const runtimeDigestSha256 = digestReceipts(runtime.files);
  return {
    revision,
    scope: SOURCE_SCOPE,
    status,
    digestAlgorithm: "sha256-over-sorted-path-size-content-sha256-receipts",
    sourceFileCount: sourceReceipts.length,
    sourceDigestSha256,
    sourceReceiptErrors,
    runtimeFiles: runtime.files,
    runtimeDigestSha256,
    runtimeIntegrityErrors: runtime.integrityErrors,
    combinedSourceRuntimeDigestSha256: sha256(
      `source:${sourceDigestSha256}\nruntime:${runtimeDigestSha256}\n`,
    ),
  };
}

function sourceSnapshotErrors(snapshot: SourceSnapshot, phase: "start" | "end"): string[] {
  const errors: string[] = [];
  if (!snapshot.status.clean) {
    errors.push(
      `soak source scope is dirty at ${phase}: ${snapshot.status.records.join(" | ")}`,
    );
  }
  errors.push(...snapshot.sourceReceiptErrors.map((error) => `${phase} source receipt: ${error}`));
  errors.push(...snapshot.runtimeIntegrityErrors.map((error) => `${phase} runtime: ${error}`));
  return errors;
}

function sampleIntervalForDuration(durationMs: number): number {
  return Math.min(30_000, Math.max(250, Math.floor(durationMs / 240)));
}

function strokeNode(
  id: string,
  phase: number,
  polylineToPath: (points: ReadonlyArray<readonly [number, number]>) => PathIR,
  solidPaint: (red: number, green: number, blue: number) => PaintIR,
) {
  const points: Array<[number, number]> = [];
  for (let index = 0; index < 24; index += 1) {
    const t = index / 23;
    points.push([8 + t * 112, 64 + Math.sin(phase + t * Math.PI * 2) * 40]);
  }
  return {
    id,
    kind: "stroke-path" as const,
    path: polylineToPath(points),
    paint: solidPaint(0.1, 0.1, 0.15),
    strokeWidth: 3,
    cap: "round" as const,
    join: "round" as const,
    miterLimit: 4,
    opacity: 1,
    blend: "src-over" as const,
  };
}

function emptyMemoryAnalysis(): MemoryConvergenceAnalysis {
  return analyzeMemoryConvergence([], DEFAULT_MEMORY_THRESHOLDS);
}

function identityStable(
  start: SourceSnapshot | null,
  end: SourceSnapshot | null,
  field:
    | "revision"
    | "sourceDigestSha256"
    | "runtimeDigestSha256"
    | "combinedSourceRuntimeDigestSha256",
): boolean {
  return start !== null && end !== null && start[field] === end[field];
}

async function writeReport(path: string, report: SoakReport): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
}

async function runSoak(soakMinutes: number, resultPath: string): Promise<SoakReport> {
  const durationMs = soakMinutes * 60_000;
  const config: SoakConfig = {
    soakMinutes,
    durationMs,
    sampleIntervalMs: sampleIntervalForDuration(durationMs),
    snapshotEvery: 16,
    strokesPerCycle: 40,
    memoryGateEnforced: soakMinutes >= MEMORY_GATE_MINUTES,
  };
  const startedAt = new Date();
  const reportStarted = performance.now();
  let workloadStartedAt: Date | null = null;
  let workloadCompletedAt: Date | null = null;
  let workloadStarted = 0;
  let workloadElapsedMs = 0;
  let sourceAtStart: SourceSnapshot | null = null;
  let sourceAtEnd: SourceSnapshot | null = null;
  let cycles = 0;
  let commands = 0;
  let renders = 0;
  const errors: string[] = [];
  const rssSamples: RssSample[] = [];
  let lastSampleAt = Number.NEGATIVE_INFINITY;

  try {
    sourceAtStart = captureSourceSnapshot();
    errors.push(...sourceSnapshotErrors(sourceAtStart, "start"));
    if (errors.length === 0) {
      const [skia, skiaNode, vello, velloNode, projectModel] = await Promise.all([
        import("@toonspectrum/studio-engine-skia"),
        import("@toonspectrum/studio-engine-skia/node"),
        import("@toonspectrum/studio-engine-vello"),
        import("@toonspectrum/studio-engine-vello/node"),
        import("@toonspectrum/studio-project-model"),
      ]);
      const [ck] = await Promise.all([skiaNode.loadCanvasKitNode(), velloNode.loadVelloNode()]);
      workloadStartedAt = new Date();
      workloadStarted = performance.now();
      const sampleRss = (force = false): void => {
        const elapsedMs = performance.now() - workloadStarted;
        if (!force && elapsedMs - lastSampleAt < config.sampleIntervalMs) return;
        rssSamples.push({
          elapsedMs: Number(elapsedMs.toFixed(3)),
          rssMiB: Number((process.memoryUsage().rss / MIB).toFixed(3)),
          renders,
        });
        lastSampleAt = elapsedMs;
      };
      sampleRss(true);
      while (performance.now() - workloadStarted < durationMs) {
        try {
          const store = new projectModel.MemoryJournalStore();
          const { bus } = await projectModel.CommandBus.open(store, {
            snapshotEvery: config.snapshotEvery,
          });
          await bus.dispatch({
            type: "scene/init",
            scene: projectModel.createEmptyScene(128, 128),
          });
          for (let index = 0; index < config.strokesPerCycle; index += 1) {
            await bus.dispatch({
              type: "scene/add-node",
              node: strokeNode(
                `s${cycles}-${index}`,
                cycles + index * 0.37,
                projectModel.polylineToPath,
                projectModel.solidPaint,
              ),
            });
            commands += 1;
          }
          const liveDigest = projectModel.sceneDigest(bus.getScene());
          const { bus: reopened, recovery } = await projectModel.CommandBus.open(store);
          if (recovery.issues.length > 0) {
            errors.push(`cycle ${cycles}: recovery issues ${recovery.issues.join(",")}`);
          }
          if (projectModel.sceneDigest(reopened.getScene()) !== liveDigest) {
            errors.push(`cycle ${cycles}: digest divergence after recovery`);
          }
          const scene = reopened.getScene();
          if (scene) {
            const velloPixels = vello.renderSceneToPixels(scene);
            const skiaPixels = skia.renderSceneToPixels(ck, scene);
            renders += 2;
            if (velloPixels.length !== skiaPixels.length) {
              errors.push(`cycle ${cycles}: renderer buffer size mismatch`);
            }
          }
          cycles += 1;
          sampleRss();
        } catch (error) {
          errors.push(`cycle ${cycles}: ${error instanceof Error ? error.message : String(error)}`);
          if (errors.length > 10) break;
        }
      }
      sampleRss(true);
      workloadElapsedMs = performance.now() - workloadStarted;
      workloadCompletedAt = new Date();
    }
  } catch (error) {
    if (workloadStartedAt !== null) {
      workloadElapsedMs = performance.now() - workloadStarted;
      workloadCompletedAt = new Date();
    }
    errors.push(`soak execution failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    sourceAtEnd = captureSourceSnapshot();
    errors.push(...sourceSnapshotErrors(sourceAtEnd, "end"));
  } catch (error) {
    errors.push(
      `end source identity capture failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!identityStable(sourceAtStart, sourceAtEnd, "revision")) {
    errors.push(
      `source revision changed during soak: ${sourceAtStart?.revision ?? "unavailable"} -> ${sourceAtEnd?.revision ?? "unavailable"}`,
    );
  }
  if (!identityStable(sourceAtStart, sourceAtEnd, "sourceDigestSha256")) {
    errors.push("source digest changed during soak");
  }
  if (!identityStable(sourceAtStart, sourceAtEnd, "runtimeDigestSha256")) {
    errors.push("executed Vello runtime digest changed during soak");
  }
  if (!identityStable(sourceAtStart, sourceAtEnd, "combinedSourceRuntimeDigestSha256")) {
    errors.push("combined source/runtime digest changed during soak");
  }

  const completedAt = new Date();
  const totalWallElapsedMs = performance.now() - reportStarted;
  const memoryConvergence =
    rssSamples.length > 0
      ? analyzeMemoryConvergence(rssSamples, DEFAULT_MEMORY_THRESHOLDS)
      : emptyMemoryAnalysis();
  if (config.memoryGateEnforced && !memoryConvergence.pass) {
    errors.push(...memoryConvergence.reasons.map((reason) => `memory convergence: ${reason}`));
  }
  const durationSatisfied = workloadElapsedMs >= durationMs;
  if (soakMinutes >= RELEASE_GATE_MINUTES && !durationSatisfied) {
    errors.push(
      `release duration ${workloadElapsedMs.toFixed(0)}ms is below requested ${durationMs.toFixed(0)}ms`,
    );
  }
  const pass = errors.length === 0;
  const releaseEligible = soakMinutes >= RELEASE_GATE_MINUTES;
  const report: SoakReport = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    harness: relative(REPO_ROOT, HARNESS_PATH),
    status: pass ? (releaseEligible ? "pass" : "smoke-pass") : "fail",
    pass,
    releaseGate: {
      requiredMinutes: RELEASE_GATE_MINUTES,
      eligible: releaseEligible,
      durationSatisfied,
      pass: pass && releaseEligible && durationSatisfied && memoryConvergence.pass,
    },
    generatedAt: completedAt.toISOString(),
    startedAt: startedAt.toISOString(),
    workloadStartedAt: workloadStartedAt?.toISOString() ?? null,
    workloadCompletedAt: workloadCompletedAt?.toISOString() ?? null,
    completedAt: completedAt.toISOString(),
    source: {
      atStart: sourceAtStart,
      atEnd: sourceAtEnd,
      revisionStable: identityStable(sourceAtStart, sourceAtEnd, "revision"),
      sourceDigestStable: identityStable(
        sourceAtStart,
        sourceAtEnd,
        "sourceDigestSha256",
      ),
      runtimeDigestStable: identityStable(
        sourceAtStart,
        sourceAtEnd,
        "runtimeDigestSha256",
      ),
      combinedDigestStable: identityStable(
        sourceAtStart,
        sourceAtEnd,
        "combinedSourceRuntimeDigestSha256",
      ),
      harnessSha256: sha256(readFileSync(HARNESS_PATH)),
    },
    host: {
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model,
      node: process.version,
    },
    config,
    elapsedMs: workloadElapsedMs,
    elapsedMinutes: workloadElapsedMs / 60_000,
    totalWallElapsedMs,
    totals: { cycles, commands, renders, errors: errors.length },
    rssSamples,
    memoryConvergence,
    errors,
  };
  await writeReport(resultPath, report);
  return report;
}

async function writeConfigurationFailure(
  resultPath: string,
  startedAt: Date,
  error: unknown,
): Promise<void> {
  const completedAt = new Date();
  const message = error instanceof Error ? error.message : String(error);
  const report: SoakReport = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    harness: relative(REPO_ROOT, HARNESS_PATH),
    status: "fail",
    pass: false,
    releaseGate: {
      requiredMinutes: RELEASE_GATE_MINUTES,
      eligible: false,
      durationSatisfied: false,
      pass: false,
    },
    generatedAt: completedAt.toISOString(),
    startedAt: startedAt.toISOString(),
    workloadStartedAt: null,
    workloadCompletedAt: null,
    completedAt: completedAt.toISOString(),
    source: {
      atStart: null,
      atEnd: null,
      revisionStable: false,
      sourceDigestStable: false,
      runtimeDigestStable: false,
      combinedDigestStable: false,
      harnessSha256: sha256(readFileSync(HARNESS_PATH)),
    },
    host: {
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model,
      node: process.version,
    },
    config: null,
    elapsedMs: completedAt.getTime() - startedAt.getTime(),
    elapsedMinutes: (completedAt.getTime() - startedAt.getTime()) / 60_000,
    totalWallElapsedMs: completedAt.getTime() - startedAt.getTime(),
    totals: { cycles: 0, commands: 0, renders: 0, errors: 1 },
    rssSamples: [],
    memoryConvergence: emptyMemoryAnalysis(),
    errors: [`configuration: ${message}`],
  };
  await writeReport(resultPath, report);
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const resultPath = process.env.SOAK_RESULT_PATH
    ? resolve(REPO_ROOT, process.env.SOAK_RESULT_PATH)
    : join(RESULTS_DIR, "soak.json");
  try {
    const soakMinutes = parseSoakMinutes(process.env.SOAK_MINUTES);
    const report = await runSoak(soakMinutes, resultPath);
    console.log(
      `soak: ${report.totals.cycles} cycles, ${report.totals.commands} commands, ${report.totals.renders} renders, ${report.totals.errors} errors`,
    );
    console.log(
      `rss ${report.memoryConvergence.firstRssMiB ?? "n/a"} MiB → ${report.memoryConvergence.lastRssMiB ?? "n/a"} MiB; ` +
        `post-warmup ${report.memoryConvergence.postWarmupSlopeMiBPerHour?.toFixed(3) ?? "n/a"} MiB/hour`,
    );
    console.log(`written: ${resultPath}`);
    if (!report.pass) {
      console.error(report.errors.join("\n"));
      process.exitCode = 1;
    }
  } catch (error) {
    await writeConfigurationFailure(resultPath, startedAt, error);
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`written: ${resultPath}`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  await main();
}
