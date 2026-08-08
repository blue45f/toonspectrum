/**
 * ADR-0011 lane 11 full-size natural-media benchmark contract.
 *
 * The real benchmark lives in tests/benchmarks/harness rather than Vitest. This
 * module keeps its raw JSON evidence machine-checkable: every percentile,
 * pressure-fidelity score, parity comparison, memory verdict and promotion
 * decision is recomputed from committed primitive samples. A malformed or
 * hand-edited result therefore fails loudly instead of silently changing the
 * engine decision.
 */

export const NATURAL_MEDIA_FULLSIZE_SCHEMA_VERSION = 1 as const;
export const NATURAL_MEDIA_FULLSIZE_DAB_MIN_PX = 950;
export const NATURAL_MEDIA_FULLSIZE_DAB_MAX_PX = 1050;
export const NATURAL_MEDIA_FULLSIZE_MIN_PROFILE_CORRELATION = 0.98;
export const NATURAL_MEDIA_FULLSIZE_MIN_PRESSURE_CORRELATION = 0.95;
export const NATURAL_MEDIA_FULLSIZE_MIN_COVERAGE_RATIO = 0.9;
export const NATURAL_MEDIA_FULLSIZE_MAX_COVERAGE_RATIO = 1.1;
export const NATURAL_MEDIA_FULLSIZE_HOKUSAI_ADVANTAGE_GATE = 1.2;
export const NATURAL_MEDIA_FULLSIZE_MAX_FRAME_BYTES = 16 * 1024 * 1024;
export const NATURAL_MEDIA_FULLSIZE_MAX_PROCESS_RSS_BYTES = 768 * 1024 * 1024;

export type NaturalMediaBenchmarkEngine = "libmypaint" | "hokusai";

export interface NaturalMediaBenchmarkMemorySnapshot {
  readonly rssBytes: number;
  readonly heapUsedBytes: number;
  readonly externalBytes: number;
  readonly arrayBuffersBytes: number;
}

export interface NaturalMediaBenchmarkTiming {
  readonly warmupRuns: number;
  readonly measuredRuns: number;
  readonly samplesMs: readonly number[];
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly megapixelsPerSecondAtP50: number;
}

export interface NaturalMediaBenchmarkFrame {
  readonly sha256: string;
  readonly totalAlpha: number;
  readonly inkedPixels: number;
  readonly meanInkedAlpha: number;
  /** Raw per-column alpha mass; retained so parity is independently recomputable. */
  readonly columnInkProfile: readonly number[];
}

export interface NaturalMediaPressureSample {
  readonly pressure: number;
  readonly totalAlpha: number;
  readonly inkedPixels: number;
  readonly sha256: string;
}

export interface NaturalMediaPressureFidelity {
  readonly samples: readonly NaturalMediaPressureSample[];
  /** Descriptive linearity only; authored natural-media curves need not be linear. */
  readonly totalAlphaCorrelation: number;
  readonly inkedPixelCorrelation: number;
  readonly nonDecreasingAlphaSteps: number;
  readonly nonDecreasingInkedPixelSteps: number;
  readonly highPressureAddsInk: boolean;
  readonly pass: boolean;
}

export interface NaturalMediaNoSilentLoss {
  readonly sourceSettings: number;
  readonly sourceInputs: number;
  readonly engineSettings: number;
  readonly engineInputs: number;
  readonly applied: readonly string[];
  readonly unknownSettings: readonly string[];
  readonly unknownInputs: readonly string[];
  readonly unmapped: readonly string[];
  readonly warnings: readonly string[];
  /** Dimensions not applied and not named in unknown/unmapped/warnings. */
  readonly unaccountedDimensions: readonly string[];
  readonly pass: boolean;
}

export interface NaturalMediaBenchmarkMemory {
  readonly nodeOldSpaceLimitMiB: number;
  readonly baseline: NaturalMediaBenchmarkMemorySnapshot;
  readonly peakObserved: NaturalMediaBenchmarkMemorySnapshot;
  /** process.resourceUsage().maxRSS, normalized from KiB to bytes. */
  readonly processPeakRssBytes: number;
  readonly rssIncreaseFromBaselineBytes: number;
  readonly wasmHeapBytes: number | null;
  readonly withinBound: boolean;
  readonly note: string;
}

export interface NaturalMediaEngineEvidence {
  readonly engine: NaturalMediaBenchmarkEngine;
  readonly version: string;
  readonly brushId: string;
  readonly timing: NaturalMediaBenchmarkTiming;
  readonly determinism: {
    readonly hashes: readonly [string, string];
    readonly pass: boolean;
  };
  readonly frame: NaturalMediaBenchmarkFrame;
  readonly pressureFidelity: NaturalMediaPressureFidelity;
  readonly noSilentLoss: NaturalMediaNoSilentLoss;
  readonly memory: NaturalMediaBenchmarkMemory;
}

export interface NaturalMediaBrushComparison {
  readonly brushId: string;
  readonly columnProfileCorrelation: number;
  readonly coverageRatioLibmypaintOverHokusai: number;
  readonly inkedPixelRatioLibmypaintOverHokusai: number;
  readonly pressureTotalAlphaCorrelation: number;
  readonly pressureInkedPixelCorrelation: number;
  readonly hokusaiThroughputOverLibmypaint: number;
  readonly qualityParityPass: boolean;
  readonly hokusaiPasses20pctGate: boolean;
}

export interface NaturalMediaFullsizeBenchmarkDraft {
  readonly schemaVersion: typeof NATURAL_MEDIA_FULLSIZE_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly gitCommit: string;
  readonly command: string;
  readonly host: {
    readonly platform: string;
    readonly arch: string;
    readonly node: string;
    readonly cpuModel: string;
    readonly logicalCpus: number;
    readonly totalMemoryBytes: number;
    readonly loadAverage: readonly number[];
  };
  readonly pins: {
    readonly libmypaint: string;
    readonly hokusai: string;
    readonly libmypaintWasmBytes: number;
    readonly hokusaiWasmBytes: number;
  };
  readonly workload: {
    readonly canvasWidth: number;
    readonly canvasHeight: number;
    readonly rgbaFrameBytes: number;
    readonly rgbaFrameByteLimit: number;
    readonly baseDabDiameterPx: number;
    readonly radiusLogarithmic: number;
    readonly strokeSamples: number;
    readonly warmupRuns: number;
    readonly measuredRuns: number;
    readonly pressureLevels: readonly number[];
    readonly sequentialWorkers: boolean;
    readonly workerTimeoutMs: number;
    readonly description: string;
  };
  readonly brushes: Readonly<
    Record<
      string,
      {
        readonly libmypaint: NaturalMediaEngineEvidence;
        readonly hokusai: NaturalMediaEngineEvidence;
      }
    >
  >;
  readonly notes: readonly string[];
}

export interface NaturalMediaFullsizeBenchmarkResult
  extends NaturalMediaFullsizeBenchmarkDraft {
  readonly comparisons: readonly NaturalMediaBrushComparison[];
  readonly gate: {
    readonly rule: string;
    readonly allDeterministic: boolean;
    readonly allPressureFidelityPass: boolean;
    readonly allNoSilentLossPass: boolean;
    readonly allMemoryWithinBound: boolean;
    readonly allQualityParityPass: boolean;
    readonly hokusaiThroughputAdvantageMin: number;
    readonly hokusaiPasses20pctGate: boolean;
    readonly verdict:
      | "retain-libmypaint-reference"
      | "hokusai-qualified-to-demote-libmypaint";
  };
}

export class NaturalMediaBenchmarkResultError extends Error {
  constructor(message: string) {
    super(`natural-media full-size result invalid: ${message}`);
    this.name = "NaturalMediaBenchmarkResultError";
  }
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new NaturalMediaBenchmarkResultError(`${path} must be finite`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, path: string): number {
  const result = finite(value, path);
  if (!Number.isInteger(result) || result < 0) {
    throw new NaturalMediaBenchmarkResultError(
      `${path} must be a non-negative integer`,
    );
  }
  return result;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new NaturalMediaBenchmarkResultError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringArray(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new NaturalMediaBenchmarkResultError(`${path} must be a string array`);
  }
  return value as readonly string[];
}

function numberArray(value: unknown, path: string): readonly number[] {
  if (!Array.isArray(value) || value.some((entry) => !Number.isFinite(entry))) {
    throw new NaturalMediaBenchmarkResultError(`${path} must be a finite number array`);
  }
  return value as readonly number[];
}

/** Nearest-rank percentile over raw samples; p95 remains the actual tail sample. */
export function naturalMediaPercentile(
  samples: readonly number[],
  fraction: number,
): number {
  if (samples.length === 0) {
    throw new NaturalMediaBenchmarkResultError("percentile requires samples");
  }
  if (!(fraction > 0 && fraction <= 1)) {
    throw new NaturalMediaBenchmarkResultError(
      "percentile fraction must be in (0, 1]",
    );
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index] ?? Number.NaN;
}

/** NaN-free Pearson correlation used for pressure and cross-engine profiles. */
export function naturalMediaCorrelation(
  a: readonly number[],
  b: readonly number[],
): number {
  if (a.length !== b.length || a.length < 2) return 0;
  const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const da = (a[index] ?? 0) - meanA;
    const db = (b[index] ?? 0) - meanB;
    covariance += da * db;
    varianceA += da * da;
    varianceB += db * db;
  }
  if (varianceA === 0 || varianceB === 0) return 0;
  return covariance / Math.sqrt(varianceA * varianceB);
}

export function summarizeNaturalMediaPressureFidelity(
  samples: readonly NaturalMediaPressureSample[],
): Omit<NaturalMediaPressureFidelity, "samples"> {
  const pressures = samples.map((sample) => sample.pressure);
  const totalAlpha = samples.map((sample) => sample.totalAlpha);
  const inkedPixels = samples.map((sample) => sample.inkedPixels);
  const totalAlphaCorrelation = round(
    naturalMediaCorrelation(pressures, totalAlpha),
  );
  const inkedPixelCorrelation = round(
    naturalMediaCorrelation(pressures, inkedPixels),
  );
  const first = samples[0];
  const last = samples.at(-1);
  let nonDecreasingAlphaSteps = 0;
  let nonDecreasingInkedPixelSteps = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (previous && current && current.totalAlpha >= previous.totalAlpha) {
      nonDecreasingAlphaSteps += 1;
    }
    if (previous && current && current.inkedPixels >= previous.inkedPixels) {
      nonDecreasingInkedPixelSteps += 1;
    }
  }
  const highPressureAddsInk =
    first !== undefined &&
    last !== undefined &&
    last.totalAlpha > first.totalAlpha &&
    last.inkedPixels > first.inkedPixels;
  return {
    totalAlphaCorrelation,
    inkedPixelCorrelation,
    nonDecreasingAlphaSteps,
    nonDecreasingInkedPixelSteps,
    highPressureAddsInk,
    pass:
      highPressureAddsInk &&
      nonDecreasingAlphaSteps >= Math.max(1, samples.length - 2) &&
      nonDecreasingInkedPixelSteps >= Math.max(1, samples.length - 2),
  };
}

function compareBrush(
  brushId: string,
  libmypaint: NaturalMediaEngineEvidence,
  hokusai: NaturalMediaEngineEvidence,
): NaturalMediaBrushComparison {
  const columnProfileCorrelation = round(
    naturalMediaCorrelation(
      libmypaint.frame.columnInkProfile,
      hokusai.frame.columnInkProfile,
    ),
  );
  const coverageRatio = round(
    libmypaint.frame.totalAlpha / hokusai.frame.totalAlpha,
  );
  const inkedPixelRatio = round(
    libmypaint.frame.inkedPixels / hokusai.frame.inkedPixels,
  );
  const throughputRatio = round(
    libmypaint.timing.p50Ms / hokusai.timing.p50Ms,
  );
  const pressureTotalAlphaCorrelation = round(
    naturalMediaCorrelation(
      libmypaint.pressureFidelity.samples.map((sample) => sample.totalAlpha),
      hokusai.pressureFidelity.samples.map((sample) => sample.totalAlpha),
    ),
  );
  const pressureInkedPixelCorrelation = round(
    naturalMediaCorrelation(
      libmypaint.pressureFidelity.samples.map((sample) => sample.inkedPixels),
      hokusai.pressureFidelity.samples.map((sample) => sample.inkedPixels),
    ),
  );
  const qualityParityPass =
    columnProfileCorrelation >= NATURAL_MEDIA_FULLSIZE_MIN_PROFILE_CORRELATION &&
    coverageRatio >= NATURAL_MEDIA_FULLSIZE_MIN_COVERAGE_RATIO &&
    coverageRatio <= NATURAL_MEDIA_FULLSIZE_MAX_COVERAGE_RATIO &&
    libmypaint.pressureFidelity.pass &&
    hokusai.pressureFidelity.pass &&
    pressureTotalAlphaCorrelation >=
      NATURAL_MEDIA_FULLSIZE_MIN_PRESSURE_CORRELATION &&
    pressureInkedPixelCorrelation >=
      NATURAL_MEDIA_FULLSIZE_MIN_PRESSURE_CORRELATION;
  return {
    brushId,
    columnProfileCorrelation,
    coverageRatioLibmypaintOverHokusai: coverageRatio,
    inkedPixelRatioLibmypaintOverHokusai: inkedPixelRatio,
    pressureTotalAlphaCorrelation,
    pressureInkedPixelCorrelation,
    hokusaiThroughputOverLibmypaint: throughputRatio,
    qualityParityPass,
    hokusaiPasses20pctGate:
      qualityParityPass &&
      throughputRatio >= NATURAL_MEDIA_FULLSIZE_HOKUSAI_ADVANTAGE_GATE,
  };
}

/** Add comparisons and the promotion verdict from primitive worker evidence. */
export function finalizeNaturalMediaFullsizeBenchmark(
  draft: NaturalMediaFullsizeBenchmarkDraft,
): NaturalMediaFullsizeBenchmarkResult {
  const comparisons = Object.entries(draft.brushes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([brushId, engines]) =>
      compareBrush(brushId, engines.libmypaint, engines.hokusai),
    );
  const engineRuns = Object.values(draft.brushes).flatMap((engines) => [
    engines.libmypaint,
    engines.hokusai,
  ]);
  const allDeterministic = engineRuns.every((run) => run.determinism.pass);
  const allPressureFidelityPass = engineRuns.every(
    (run) => run.pressureFidelity.pass,
  );
  const allNoSilentLossPass = engineRuns.every((run) => run.noSilentLoss.pass);
  const allMemoryWithinBound = engineRuns.every((run) => run.memory.withinBound);
  const allQualityParityPass = comparisons.every(
    (comparison) => comparison.qualityParityPass,
  );
  const advantages = comparisons.map(
    (comparison) => comparison.hokusaiThroughputOverLibmypaint,
  );
  const hokusaiThroughputAdvantageMin =
    advantages.length === 0 ? 0 : Math.min(...advantages);
  const hokusaiPasses20pctGate =
    comparisons.length > 0 &&
    comparisons.every((comparison) => comparison.hokusaiPasses20pctGate) &&
    allDeterministic &&
    allNoSilentLossPass &&
    allMemoryWithinBound;
  return {
    ...draft,
    comparisons,
    gate: {
      rule:
        "ADR-0011 lane 11: Hokusai may demote libmypaint only when every 1000px corpus case is deterministic, explicitly accounts for every source dimension, stays within the memory bound, meets pressure/profile/coverage quality parity, and renders at least 1.2x faster",
      allDeterministic,
      allPressureFidelityPass,
      allNoSilentLossPass,
      allMemoryWithinBound,
      allQualityParityPass,
      hokusaiThroughputAdvantageMin: round(hokusaiThroughputAdvantageMin),
      hokusaiPasses20pctGate,
      verdict: hokusaiPasses20pctGate
        ? "hokusai-qualified-to-demote-libmypaint"
        : "retain-libmypaint-reference",
    },
  };
}

function assertSha(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new NaturalMediaBenchmarkResultError(`${path} must be sha256 hex`);
  }
  return value;
}

function assertMemorySnapshot(value: unknown, path: string): void {
  const snapshot = record(value, path);
  for (const key of ["rssBytes", "heapUsedBytes", "externalBytes", "arrayBuffersBytes"]) {
    nonNegativeInteger(snapshot[key], `${path}.${key}`);
  }
}

function assertEngineEvidence(
  value: unknown,
  path: string,
  expectedEngine: NaturalMediaBenchmarkEngine,
  brushId: string,
  workload: NaturalMediaFullsizeBenchmarkDraft["workload"],
): void {
  const run = record(value, path);
  if (run["engine"] !== expectedEngine || run["brushId"] !== brushId) {
    throw new NaturalMediaBenchmarkResultError(
      `${path} engine/brush identity mismatch`,
    );
  }
  if (typeof run["version"] !== "string" || run["version"].length === 0) {
    throw new NaturalMediaBenchmarkResultError(`${path}.version is required`);
  }

  const timing = record(run["timing"], `${path}.timing`);
  const warmupRuns = nonNegativeInteger(
    timing["warmupRuns"],
    `${path}.timing.warmupRuns`,
  );
  const measuredRuns = nonNegativeInteger(
    timing["measuredRuns"],
    `${path}.timing.measuredRuns`,
  );
  const samples = numberArray(timing["samplesMs"], `${path}.timing.samplesMs`);
  if (
    warmupRuns !== workload.warmupRuns ||
    measuredRuns !== workload.measuredRuns ||
    measuredRuns !== samples.length ||
    measuredRuns < 7 ||
    samples.some((sample) => sample <= 0)
  ) {
    throw new NaturalMediaBenchmarkResultError(`${path}.timing run contract drift`);
  }
  const expectedP50 = round(naturalMediaPercentile(samples, 0.5), 3);
  const expectedP95 = round(naturalMediaPercentile(samples, 0.95), 3);
  const expectedThroughput = round(
    (workload.canvasWidth * workload.canvasHeight) / expectedP50 / 1000,
    3,
  );
  if (
    finite(timing["p50Ms"], `${path}.timing.p50Ms`) !== expectedP50 ||
    finite(timing["p95Ms"], `${path}.timing.p95Ms`) !== expectedP95 ||
    finite(
      timing["megapixelsPerSecondAtP50"],
      `${path}.timing.megapixelsPerSecondAtP50`,
    ) !== expectedThroughput
  ) {
    throw new NaturalMediaBenchmarkResultError(
      `${path}.timing percentiles are not recomputable`,
    );
  }

  const determinism = record(run["determinism"], `${path}.determinism`);
  if (!Array.isArray(determinism["hashes"]) || determinism["hashes"].length !== 2) {
    throw new NaturalMediaBenchmarkResultError(
      `${path}.determinism.hashes must contain two hashes`,
    );
  }
  const firstHash = assertSha(determinism["hashes"][0], `${path}.determinism.hashes[0]`);
  const secondHash = assertSha(determinism["hashes"][1], `${path}.determinism.hashes[1]`);
  if (determinism["pass"] !== (firstHash === secondHash)) {
    throw new NaturalMediaBenchmarkResultError(`${path}.determinism.pass drift`);
  }

  const frame = record(run["frame"], `${path}.frame`);
  if (assertSha(frame["sha256"], `${path}.frame.sha256`) !== firstHash) {
    throw new NaturalMediaBenchmarkResultError(`${path}.frame hash drift`);
  }
  const totalAlpha = nonNegativeInteger(frame["totalAlpha"], `${path}.frame.totalAlpha`);
  const inkedPixels = nonNegativeInteger(
    frame["inkedPixels"],
    `${path}.frame.inkedPixels`,
  );
  const profile = numberArray(
    frame["columnInkProfile"],
    `${path}.frame.columnInkProfile`,
  );
  if (
    totalAlpha === 0 ||
    inkedPixels === 0 ||
    inkedPixels > workload.canvasWidth * workload.canvasHeight ||
    profile.length !== workload.canvasWidth
  ) {
    throw new NaturalMediaBenchmarkResultError(`${path}.frame coverage invalid`);
  }
  const profileTotal = profile.reduce((sum, value) => sum + value, 0);
  if (profileTotal !== totalAlpha) {
    throw new NaturalMediaBenchmarkResultError(
      `${path}.frame profile does not sum to totalAlpha`,
    );
  }
  const expectedMean = totalAlpha / (inkedPixels * 255);
  if (
    Math.abs(
      finite(frame["meanInkedAlpha"], `${path}.frame.meanInkedAlpha`) -
        expectedMean,
    ) > 1e-12
  ) {
    throw new NaturalMediaBenchmarkResultError(`${path}.frame mean alpha drift`);
  }

  const pressure = record(run["pressureFidelity"], `${path}.pressureFidelity`);
  if (!Array.isArray(pressure["samples"])) {
    throw new NaturalMediaBenchmarkResultError(
      `${path}.pressureFidelity.samples must be an array`,
    );
  }
  const pressureSamples = pressure["samples"].map((sample, index) => {
    const row = record(sample, `${path}.pressureFidelity.samples[${index}]`);
    return {
      pressure: finite(
        row["pressure"],
        `${path}.pressureFidelity.samples[${index}].pressure`,
      ),
      totalAlpha: nonNegativeInteger(
        row["totalAlpha"],
        `${path}.pressureFidelity.samples[${index}].totalAlpha`,
      ),
      inkedPixels: nonNegativeInteger(
        row["inkedPixels"],
        `${path}.pressureFidelity.samples[${index}].inkedPixels`,
      ),
      sha256: assertSha(
        row["sha256"],
        `${path}.pressureFidelity.samples[${index}].sha256`,
      ),
    };
  });
  if (
    pressureSamples.length !== workload.pressureLevels.length ||
    pressureSamples.some(
      (sample, index) => sample.pressure !== workload.pressureLevels[index],
    )
  ) {
    throw new NaturalMediaBenchmarkResultError(`${path}.pressure levels drift`);
  }
  const recomputedPressure = summarizeNaturalMediaPressureFidelity(pressureSamples);
  for (const key of [
    "totalAlphaCorrelation",
    "inkedPixelCorrelation",
    "nonDecreasingAlphaSteps",
    "nonDecreasingInkedPixelSteps",
    "highPressureAddsInk",
    "pass",
  ] as const) {
    if (pressure[key] !== recomputedPressure[key]) {
      throw new NaturalMediaBenchmarkResultError(
        `${path}.pressureFidelity.${key} drift`,
      );
    }
  }

  const loss = record(run["noSilentLoss"], `${path}.noSilentLoss`);
  for (const key of [
    "sourceSettings",
    "sourceInputs",
    "engineSettings",
    "engineInputs",
  ]) {
    nonNegativeInteger(loss[key], `${path}.noSilentLoss.${key}`);
  }
  for (const key of [
    "applied",
    "unknownSettings",
    "unknownInputs",
    "unmapped",
    "warnings",
    "unaccountedDimensions",
  ]) {
    stringArray(loss[key], `${path}.noSilentLoss.${key}`);
  }
  const noSilentLossPass =
    (loss["unaccountedDimensions"] as readonly string[]).length === 0;
  if (loss["pass"] !== noSilentLossPass) {
    throw new NaturalMediaBenchmarkResultError(`${path}.noSilentLoss.pass drift`);
  }

  const memory = record(run["memory"], `${path}.memory`);
  assertMemorySnapshot(memory["baseline"], `${path}.memory.baseline`);
  assertMemorySnapshot(memory["peakObserved"], `${path}.memory.peakObserved`);
  const processPeakRssBytes = nonNegativeInteger(
    memory["processPeakRssBytes"],
    `${path}.memory.processPeakRssBytes`,
  );
  const baselineMemory = memory["baseline"] as Record<string, number>;
  const peakMemory = memory["peakObserved"] as Record<string, number>;
  const rssIncrease = nonNegativeInteger(
    memory["rssIncreaseFromBaselineBytes"],
    `${path}.memory.rssIncreaseFromBaselineBytes`,
  );
  if (
    nonNegativeInteger(
      memory["nodeOldSpaceLimitMiB"],
      `${path}.memory.nodeOldSpaceLimitMiB`,
    ) > 512 ||
    rssIncrease !==
      Math.max(0, (peakMemory["rssBytes"] ?? 0) - (baselineMemory["rssBytes"] ?? 0)) ||
    processPeakRssBytes < (peakMemory["rssBytes"] ?? 0) ||
    (memory["wasmHeapBytes"] !== null &&
      (!Number.isInteger(memory["wasmHeapBytes"]) ||
        (memory["wasmHeapBytes"] as number) <= 0)) ||
    typeof memory["note"] !== "string"
  ) {
    throw new NaturalMediaBenchmarkResultError(`${path}.memory evidence drift`);
  }
  const expectedWithinBound =
    processPeakRssBytes <= NATURAL_MEDIA_FULLSIZE_MAX_PROCESS_RSS_BYTES &&
    workload.rgbaFrameBytes <= workload.rgbaFrameByteLimit;
  if (memory["withinBound"] !== expectedWithinBound) {
    throw new NaturalMediaBenchmarkResultError(`${path}.memory.withinBound drift`);
  }
}

/** Strictly parse and recompute every derived decision in committed JSON. */
export function parseNaturalMediaFullsizeBenchmarkResult(
  value: unknown,
): NaturalMediaFullsizeBenchmarkResult {
  const result = record(value, "result");
  if (result["schemaVersion"] !== NATURAL_MEDIA_FULLSIZE_SCHEMA_VERSION) {
    throw new NaturalMediaBenchmarkResultError("schemaVersion unsupported");
  }
  for (const key of ["generatedAt", "gitCommit", "command"] as const) {
    if (typeof result[key] !== "string" || result[key].length === 0) {
      throw new NaturalMediaBenchmarkResultError(`${key} is required`);
    }
  }
  if (Number.isNaN(Date.parse(result["generatedAt"] as string))) {
    throw new NaturalMediaBenchmarkResultError("generatedAt is not ISO-like");
  }
  if (!/^[a-f0-9]{40}$/.test(result["gitCommit"] as string)) {
    throw new NaturalMediaBenchmarkResultError("gitCommit must be full sha1 hex");
  }
  const host = record(result["host"], "host");
  for (const key of ["platform", "arch", "node", "cpuModel"] as const) {
    if (typeof host[key] !== "string" || host[key].length === 0) {
      throw new NaturalMediaBenchmarkResultError(`host.${key} is required`);
    }
  }
  nonNegativeInteger(host["logicalCpus"], "host.logicalCpus");
  nonNegativeInteger(host["totalMemoryBytes"], "host.totalMemoryBytes");
  numberArray(host["loadAverage"], "host.loadAverage");
  const pins = record(result["pins"], "pins");
  if (
    typeof pins["libmypaint"] !== "string" ||
    typeof pins["hokusai"] !== "string"
  ) {
    throw new NaturalMediaBenchmarkResultError("engine pins are required");
  }
  nonNegativeInteger(pins["libmypaintWasmBytes"], "pins.libmypaintWasmBytes");
  nonNegativeInteger(pins["hokusaiWasmBytes"], "pins.hokusaiWasmBytes");
  stringArray(result["notes"], "notes");

  const workload = record(result["workload"], "workload");
  const canvasWidth = nonNegativeInteger(workload["canvasWidth"], "workload.canvasWidth");
  const canvasHeight = nonNegativeInteger(
    workload["canvasHeight"],
    "workload.canvasHeight",
  );
  const rgbaFrameBytes = nonNegativeInteger(
    workload["rgbaFrameBytes"],
    "workload.rgbaFrameBytes",
  );
  const rgbaFrameByteLimit = nonNegativeInteger(
    workload["rgbaFrameByteLimit"],
    "workload.rgbaFrameByteLimit",
  );
  const baseDabDiameterPx = finite(
    workload["baseDabDiameterPx"],
    "workload.baseDabDiameterPx",
  );
  if (
    canvasWidth * canvasHeight * 4 !== rgbaFrameBytes ||
    rgbaFrameByteLimit !== NATURAL_MEDIA_FULLSIZE_MAX_FRAME_BYTES ||
    rgbaFrameBytes > rgbaFrameByteLimit ||
    baseDabDiameterPx < NATURAL_MEDIA_FULLSIZE_DAB_MIN_PX ||
    baseDabDiameterPx > NATURAL_MEDIA_FULLSIZE_DAB_MAX_PX ||
    workload["sequentialWorkers"] !== true ||
    Math.abs(
      finite(workload["radiusLogarithmic"], "workload.radiusLogarithmic") -
        Math.log(baseDabDiameterPx / 2),
    ) > 1e-12 ||
    nonNegativeInteger(workload["strokeSamples"], "workload.strokeSamples") < 2 ||
    nonNegativeInteger(workload["warmupRuns"], "workload.warmupRuns") < 2 ||
    nonNegativeInteger(workload["measuredRuns"], "workload.measuredRuns") < 7 ||
    nonNegativeInteger(workload["workerTimeoutMs"], "workload.workerTimeoutMs") === 0 ||
    typeof workload["description"] !== "string"
  ) {
    throw new NaturalMediaBenchmarkResultError("workload bounds drift");
  }
  const typedWorkload = workload as unknown as NaturalMediaFullsizeBenchmarkDraft["workload"];
  const pressureLevels = numberArray(
    typedWorkload.pressureLevels,
    "workload.pressureLevels",
  );
  if (
    pressureLevels.length < 5 ||
    pressureLevels.some(
      (pressure, index) =>
        pressure <= 0 ||
        pressure > 1 ||
        (index > 0 && pressure <= (pressureLevels[index - 1] ?? 0)),
    )
  ) {
    throw new NaturalMediaBenchmarkResultError(
      "workload.pressureLevels must be strictly increasing in (0, 1]",
    );
  }

  const brushes = record(result["brushes"], "brushes");
  if (Object.keys(brushes).length === 0) {
    throw new NaturalMediaBenchmarkResultError("brushes must not be empty");
  }
  for (const [brushId, engineValue] of Object.entries(brushes)) {
    const engines = record(engineValue, `brushes.${brushId}`);
    assertEngineEvidence(
      engines["libmypaint"],
      `brushes.${brushId}.libmypaint`,
      "libmypaint",
      brushId,
      typedWorkload,
    );
    assertEngineEvidence(
      engines["hokusai"],
      `brushes.${brushId}.hokusai`,
      "hokusai",
      brushId,
      typedWorkload,
    );
  }

  const typed = result as unknown as NaturalMediaFullsizeBenchmarkResult;
  const recomputed = finalizeNaturalMediaFullsizeBenchmark(typed);
  if (JSON.stringify(typed.comparisons) !== JSON.stringify(recomputed.comparisons)) {
    throw new NaturalMediaBenchmarkResultError("comparisons are not recomputable");
  }
  if (JSON.stringify(typed.gate) !== JSON.stringify(recomputed.gate)) {
    throw new NaturalMediaBenchmarkResultError("gate is not recomputable");
  }
  return typed;
}
