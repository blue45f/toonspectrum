import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import { decodePng } from "image-js";

interface ArtifactPath {
  readonly absolute?: string;
  readonly relativeToScratch?: string;
}

interface QualityEntry {
  readonly id: string;
  readonly name: string;
  readonly source: "core" | "pro";
  readonly runtimeBrushId: string;
  readonly quality: {
    readonly ok: boolean;
    readonly policy: { readonly kind: string; readonly reason: string };
    readonly frames: {
      readonly live: Record<string, number | null>;
      readonly released: Record<string, number | null>;
      readonly settled: Record<string, number | null>;
    };
    readonly transitions: {
      readonly liveToReleased: Record<string, number | string | null>;
      readonly liveToSettled: Record<string, number | string | null>;
      readonly releasedToSettled: Record<string, number | string | null>;
    };
    readonly findings: ReadonlyArray<{
      readonly level: "error" | "warning";
      readonly code: string;
      readonly message: string;
    }>;
  };
  readonly artifacts: {
    readonly baseline: ArtifactPath;
    readonly live: ArtifactPath;
    readonly released: ArtifactPath;
    readonly settled: ArtifactPath;
  };
}

interface QualityReport {
  readonly completed: boolean;
  readonly expectedPresetCount: number;
  readonly analyzedPresetCount: number;
  readonly qualityFailureCount: number;
  readonly evidence: readonly QualityEntry[];
}

interface PhasePerformance {
  readonly durationMs: number;
  readonly frameCount: number;
  readonly frameP50Ms: number;
  readonly frameP95Ms: number;
  readonly frameP99Ms: number;
  readonly frameMaxMs: number;
  readonly longTaskCount: number;
  readonly longTaskTotalMs: number;
  readonly longTaskMaxMs: number;
  readonly pointerMoves: number;
  readonly coalescedSamples: number;
  readonly heapBeforeBytes: number | null;
  readonly heapAfterBytes: number | null;
  readonly gpu: Record<string, number>;
}

interface PerformanceEntry {
  readonly id: string;
  readonly name: string;
  readonly source: "core" | "pro";
  readonly runtimeBrushId: string;
  readonly operation: "paint" | "erase";
  readonly qualityPolicy: string;
  readonly qualityOk: boolean;
  readonly backendMode: "canvas2d" | "webgpu";
  readonly routeCssPx: number;
  readonly dispatchedMoves: number;
  readonly inputDeliveryRatio: number;
  readonly drawingWallMs: number;
  readonly pointerUpWallMs: number;
  readonly releaseToPersistedMs: number;
  readonly drawing: PhasePerformance;
  readonly pointerUp: PhasePerformance;
  readonly gpuUsed: boolean;
}

interface PerformanceReport {
  readonly completed: boolean;
  readonly backendMode: "canvas2d" | "webgpu";
  readonly expectedBrushCount: number;
  readonly measuredBrushCount: number;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly requestedDensePointerSteps: number;
  readonly evidence: readonly PerformanceEntry[];
}

interface BackendRun {
  readonly root: string;
  readonly performancePath: string;
  readonly qualityPath: string;
  readonly performance: PerformanceReport;
  readonly quality: QualityReport;
  readonly qualityById: ReadonlyMap<string, QualityEntry>;
  readonly performanceById: ReadonlyMap<string, PerformanceEntry>;
}

interface PixelComparison {
  readonly width: number;
  readonly height: number;
  readonly comparedPixels: number;
  readonly cpuInkPixels: number;
  readonly gpuInkPixels: number;
  readonly maskIntersectionPixels: number;
  readonly maskUnionPixels: number;
  readonly maskIou: number;
  readonly cpuInkCoveredByGpu: number;
  readonly gpuInkCoveredByCpu: number;
  readonly cpuInkEnergy: number;
  readonly gpuInkEnergy: number;
  readonly gpuToCpuInkEnergyRatio: number;
  readonly tolerance2ChangedPixels: number;
  readonly tolerance8ChangedPixels: number;
  readonly tolerance8ChangedRatio: number;
  readonly meanInkDeltaDifference: number;
  readonly maxInkDeltaDifference: number;
}

interface ComparisonRow {
  readonly id: string;
  readonly name: string;
  readonly source: string;
  readonly operation: string;
  readonly runtimeBrushId: string;
  readonly policy: string;
  readonly cpuQualityOk: boolean;
  readonly gpuQualityOk: boolean;
  readonly qualityParityPassed: boolean;
  readonly actualGpuUsed: boolean;
  readonly recommendation: string;
  readonly recommendationReason: string;
  readonly routeCssPx: number;
  readonly densePointerSteps: number;
  readonly cpuInputDeliveryRatio: number;
  readonly gpuInputDeliveryRatio: number;
  readonly cpuDrawP50Ms: number;
  readonly gpuDrawP50Ms: number;
  readonly cpuDrawP95Ms: number;
  readonly gpuDrawP95Ms: number;
  readonly cpuDrawP99Ms: number;
  readonly gpuDrawP99Ms: number;
  readonly cpuDrawMaxMs: number;
  readonly gpuDrawMaxMs: number;
  readonly cpuLongTaskCount: number;
  readonly gpuLongTaskCount: number;
  readonly cpuPointerUpP95Ms: number;
  readonly gpuPointerUpP95Ms: number;
  readonly cpuReleaseToPersistedMs: number;
  readonly gpuReleaseToPersistedMs: number;
  readonly gpuVsCpuDrawP95Speedup: number | null;
  readonly pixel: PixelComparison | null;
  readonly cpuLiveToSettled: Record<string, number | string | null>;
  readonly gpuLiveToSettled: Record<string, number | string | null>;
  readonly cpuFindings: readonly string[];
  readonly gpuFindings: readonly string[];
  readonly cpuArtifacts: QualityEntry["artifacts"];
  readonly gpuArtifacts: QualityEntry["artifacts"];
}

const root = resolve(process.env.TOONSPECTRUM_FULLSCREEN_ARTIFACT_ROOT ?? process.argv[2] ?? ".");
const output = resolve(process.env.TOONSPECTRUM_FULLSCREEN_SUMMARY_DIR ?? process.argv[3] ?? root);

function walk(directory: string): string[] {
  const result: string[] = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) result.push(...walk(path));
    else result.push(path);
  }
  return result;
}

function readJson<Value>(path: string): Value {
  return JSON.parse(readFileSync(path, "utf8")) as Value;
}

const files = walk(root);
const performancePaths = files.filter((path) => basename(path) === "fullscreen-performance.json");
if (performancePaths.length < 2) {
  throw new Error(`expected canvas2d and webgpu performance reports, found ${performancePaths.length}`);
}

function findQualityPath(performancePath: string): string {
  const directory = resolve(performancePath, "..");
  const exact = join(directory, "long-brush-quality-report.json");
  if (files.includes(exact)) return exact;
  const candidates = files.filter((path) =>
    basename(path) === "long-brush-quality-report.json"
      && path.startsWith(directory));
  if (candidates.length !== 1) {
    throw new Error(`quality report for ${performancePath} is ambiguous: ${candidates.join(", ")}`);
  }
  return candidates[0]!;
}

function loadRun(path: string): BackendRun {
  const performance = readJson<PerformanceReport>(path);
  const qualityPath = findQualityPath(path);
  const quality = readJson<QualityReport>(qualityPath);
  return {
    root: resolve(path, "../.."),
    performancePath: path,
    qualityPath,
    performance,
    quality,
    qualityById: new Map(quality.evidence.map((entry) => [entry.id, entry])),
    performanceById: new Map(performance.evidence.map((entry) => [entry.id, entry])),
  };
}

const runs = performancePaths.map(loadRun);
const cpu = runs.find((run) => run.performance.backendMode === "canvas2d");
const gpu = runs.find((run) => run.performance.backendMode === "webgpu");
if (!cpu || !gpu) throw new Error("missing canvas2d or webgpu benchmark run");

function locateArtifact(run: BackendRun, artifact: ArtifactPath): string | null {
  const suffix = artifact.relativeToScratch?.replaceAll("\\", "/");
  if (!suffix) return null;
  const matches = files.filter((path) =>
    path.replaceAll("\\", "/").endsWith(`/${suffix}`)
      && path.startsWith(run.root));
  return matches.length === 1 ? matches[0]! : null;
}

function decode(path: string) {
  const buffer = readFileSync(path);
  const image = decodePng(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
  return image.getRawImage();
}

function comparePixels(
  cpuBaselinePath: string,
  cpuSettledPath: string,
  gpuBaselinePath: string,
  gpuSettledPath: string,
): PixelComparison | null {
  const cpuBaseline = decode(cpuBaselinePath);
  const cpuSettled = decode(cpuSettledPath);
  const gpuBaseline = decode(gpuBaselinePath);
  const gpuSettled = decode(gpuSettledPath);
  if (
    cpuBaseline.width !== cpuSettled.width
    || cpuBaseline.height !== cpuSettled.height
    || cpuBaseline.width !== gpuBaseline.width
    || cpuBaseline.height !== gpuBaseline.height
    || cpuBaseline.width !== gpuSettled.width
    || cpuBaseline.height !== gpuSettled.height
  ) return null;

  const comparedPixels = cpuBaseline.width * cpuBaseline.height;
  let cpuInkPixels = 0;
  let gpuInkPixels = 0;
  let maskIntersectionPixels = 0;
  let maskUnionPixels = 0;
  let cpuInkEnergy = 0;
  let gpuInkEnergy = 0;
  let tolerance2ChangedPixels = 0;
  let tolerance8ChangedPixels = 0;
  let totalInkDeltaDifference = 0;
  let maxInkDeltaDifference = 0;

  for (let pixel = 0; pixel < comparedPixels; pixel += 1) {
    const cpuBaseOffset = pixel * cpuBaseline.channels;
    const cpuSettleOffset = pixel * cpuSettled.channels;
    const gpuBaseOffset = pixel * gpuBaseline.channels;
    const gpuSettleOffset = pixel * gpuSettled.channels;
    let cpuDelta = 0;
    let gpuDelta = 0;
    let deltaDifference = 0;
    for (let channel = 0; channel < 3; channel += 1) {
      const cpuInk = (cpuSettled.data[cpuSettleOffset + channel] ?? 0)
        - (cpuBaseline.data[cpuBaseOffset + channel] ?? 0);
      const gpuInk = (gpuSettled.data[gpuSettleOffset + channel] ?? 0)
        - (gpuBaseline.data[gpuBaseOffset + channel] ?? 0);
      cpuDelta = Math.max(cpuDelta, Math.abs(cpuInk));
      gpuDelta = Math.max(gpuDelta, Math.abs(gpuInk));
      deltaDifference = Math.max(deltaDifference, Math.abs(cpuInk - gpuInk));
    }
    const cpuMask = cpuDelta > 8;
    const gpuMask = gpuDelta > 8;
    if (cpuMask) cpuInkPixels += 1;
    if (gpuMask) gpuInkPixels += 1;
    if (cpuMask && gpuMask) maskIntersectionPixels += 1;
    if (cpuMask || gpuMask) {
      maskUnionPixels += 1;
      totalInkDeltaDifference += deltaDifference;
      maxInkDeltaDifference = Math.max(maxInkDeltaDifference, deltaDifference);
    }
    cpuInkEnergy += cpuDelta;
    gpuInkEnergy += gpuDelta;
    if (deltaDifference > 2) tolerance2ChangedPixels += 1;
    if (deltaDifference > 8) tolerance8ChangedPixels += 1;
  }
  return {
    width: cpuBaseline.width,
    height: cpuBaseline.height,
    comparedPixels,
    cpuInkPixels,
    gpuInkPixels,
    maskIntersectionPixels,
    maskUnionPixels,
    maskIou: maskUnionPixels > 0 ? maskIntersectionPixels / maskUnionPixels : 1,
    cpuInkCoveredByGpu: cpuInkPixels > 0 ? maskIntersectionPixels / cpuInkPixels : 1,
    gpuInkCoveredByCpu: gpuInkPixels > 0 ? maskIntersectionPixels / gpuInkPixels : 1,
    cpuInkEnergy,
    gpuInkEnergy,
    gpuToCpuInkEnergyRatio: cpuInkEnergy > 0 ? gpuInkEnergy / cpuInkEnergy : 1,
    tolerance2ChangedPixels,
    tolerance8ChangedPixels,
    tolerance8ChangedRatio: maskUnionPixels > 0 ? tolerance8ChangedPixels / maskUnionPixels : 0,
    meanInkDeltaDifference: maskUnionPixels > 0 ? totalInkDeltaDifference / maskUnionPixels : 0,
    maxInkDeltaDifference,
  };
}

function numeric(record: Record<string, number | string | null>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function qualityParity(
  policy: string,
  cpuQuality: QualityEntry,
  gpuQuality: QualityEntry,
  pixel: PixelComparison | null,
): { passed: boolean; reason: string } {
  if (!cpuQuality.quality.ok || !gpuQuality.quality.ok) {
    return {
      passed: false,
      reason: `intrinsic quality gate failed (CPU=${cpuQuality.quality.ok}, GPU=${gpuQuality.quality.ok})`,
    };
  }
  if (!pixel) return { passed: false, reason: "settled image comparison unavailable" };
  const liveToSettled = gpuQuality.quality.transitions.liveToSettled;
  const shapeDrift = numeric(liveToSettled, "shapeDifferenceRatio") ?? 1;
  const centerlineDrift = numeric(liveToSettled, "centerlineDriftPx") ?? 0;
  const softWet = policy === "soft-wet-continuous";
  const discrete = policy === "record-only-discrete";
  const transparent = policy === "record-only-transparent";
  const iouMinimum = softWet ? 0.95 : discrete ? 0.93 : transparent ? 0.99 : 0.985;
  const changedMaximum = softWet ? 0.08 : discrete ? 0.12 : transparent ? 0.01 : 0.025;
  const energyMinimum = softWet ? 0.85 : discrete ? 0.78 : transparent ? 0.95 : 0.94;
  const energyMaximum = softWet ? 1.15 : discrete ? 1.22 : transparent ? 1.05 : 1.06;
  const passed = pixel.maskIou >= iouMinimum
    && pixel.tolerance8ChangedRatio <= changedMaximum
    && pixel.gpuToCpuInkEnergyRatio >= energyMinimum
    && pixel.gpuToCpuInkEnergyRatio <= energyMaximum
    && shapeDrift <= (softWet ? 0.12 : discrete ? 0.18 : 0.06)
    && centerlineDrift <= (softWet ? 2.5 : discrete ? 4 : 1.5);
  return {
    passed,
    reason: passed
      ? `mask IoU ${(pixel.maskIou * 100).toFixed(2)}%, perceptible delta ${(pixel.tolerance8ChangedRatio * 100).toFixed(2)}%, energy ×${pixel.gpuToCpuInkEnergyRatio.toFixed(3)}`
      : `quality mismatch: IoU ${(pixel.maskIou * 100).toFixed(2)}% (min ${(iouMinimum * 100).toFixed(1)}%), perceptible ${(pixel.tolerance8ChangedRatio * 100).toFixed(2)}% (max ${(changedMaximum * 100).toFixed(1)}%), energy ×${pixel.gpuToCpuInkEnergyRatio.toFixed(3)}`,
  };
}

function finiteRatio(numerator: number, denominator: number): number | null {
  return denominator > 0 && Number.isFinite(numerator) && Number.isFinite(denominator)
    ? numerator / denominator
    : null;
}

const ids = [...new Set([
  ...cpu.performance.evidence.map(({ id }) => id),
  ...gpu.performance.evidence.map(({ id }) => id),
])].sort();

const rows: ComparisonRow[] = [];
for (const id of ids) {
  const cpuPerf = cpu.performanceById.get(id);
  const gpuPerf = gpu.performanceById.get(id);
  const cpuQuality = cpu.qualityById.get(id);
  const gpuQuality = gpu.qualityById.get(id);
  if (!cpuPerf || !gpuPerf || !cpuQuality || !gpuQuality) continue;
  const cpuBaselinePath = locateArtifact(cpu, cpuQuality.artifacts.baseline);
  const cpuSettledPath = locateArtifact(cpu, cpuQuality.artifacts.settled);
  const gpuBaselinePath = locateArtifact(gpu, gpuQuality.artifacts.baseline);
  const gpuSettledPath = locateArtifact(gpu, gpuQuality.artifacts.settled);
  const pixel = cpuBaselinePath && cpuSettledPath && gpuBaselinePath && gpuSettledPath
    ? comparePixels(cpuBaselinePath, cpuSettledPath, gpuBaselinePath, gpuSettledPath)
    : null;
  const parity = qualityParity(cpuPerf.qualityPolicy, cpuQuality, gpuQuality, pixel);
  const speedup = finiteRatio(cpuPerf.drawing.frameP95Ms, gpuPerf.drawing.frameP95Ms);
  const inputHealthy = cpuPerf.inputDeliveryRatio >= 0.98 && gpuPerf.inputDeliveryRatio >= 0.98;
  let recommendation: string;
  let recommendationReason: string;
  if (!parity.passed) {
    recommendation = "retain-cpu-quality";
    recommendationReason = parity.reason;
  } else if (!inputHealthy) {
    recommendation = "retain-current-input-delivery";
    recommendationReason = `input delivery CPU ${(cpuPerf.inputDeliveryRatio * 100).toFixed(2)}%, GPU ${(gpuPerf.inputDeliveryRatio * 100).toFixed(2)}%`;
  } else if (!gpuPerf.gpuUsed) {
    recommendation = "gpu-not-routed";
    recommendationReason = `quality parity passed, but the shipped stroke emitted no observed GPU queue submission in the forced-WebGPU build`;
  } else {
    const faster = speedup !== null && speedup >= 1.05;
    const noPointerUpRegression = gpuPerf.pointerUp.frameMaxMs
      <= Math.max(cpuPerf.pointerUp.frameMaxMs * 1.15, cpuPerf.pointerUp.frameMaxMs + 8);
    recommendation = faster && noPointerUpRegression
      ? "native-gpu-promotion-candidate"
      : "quality-parity-native-gpu-benchmark-required";
    recommendationReason = `${parity.reason}; hosted SwiftShader draw p95 speedup ${speedup?.toFixed(3) ?? "n/a"}× — native Metal/Vulkan evidence required before production promotion`;
  }
  rows.push({
    id,
    name: cpuPerf.name,
    source: cpuPerf.source,
    operation: cpuPerf.operation,
    runtimeBrushId: cpuPerf.runtimeBrushId,
    policy: cpuPerf.qualityPolicy,
    cpuQualityOk: cpuQuality.quality.ok,
    gpuQualityOk: gpuQuality.quality.ok,
    qualityParityPassed: parity.passed,
    actualGpuUsed: gpuPerf.gpuUsed,
    recommendation,
    recommendationReason,
    routeCssPx: cpuPerf.routeCssPx,
    densePointerSteps: cpuPerf.dispatchedMoves,
    cpuInputDeliveryRatio: cpuPerf.inputDeliveryRatio,
    gpuInputDeliveryRatio: gpuPerf.inputDeliveryRatio,
    cpuDrawP50Ms: cpuPerf.drawing.frameP50Ms,
    gpuDrawP50Ms: gpuPerf.drawing.frameP50Ms,
    cpuDrawP95Ms: cpuPerf.drawing.frameP95Ms,
    gpuDrawP95Ms: gpuPerf.drawing.frameP95Ms,
    cpuDrawP99Ms: cpuPerf.drawing.frameP99Ms,
    gpuDrawP99Ms: gpuPerf.drawing.frameP99Ms,
    cpuDrawMaxMs: cpuPerf.drawing.frameMaxMs,
    gpuDrawMaxMs: gpuPerf.drawing.frameMaxMs,
    cpuLongTaskCount: cpuPerf.drawing.longTaskCount,
    gpuLongTaskCount: gpuPerf.drawing.longTaskCount,
    cpuPointerUpP95Ms: cpuPerf.pointerUp.frameP95Ms,
    gpuPointerUpP95Ms: gpuPerf.pointerUp.frameP95Ms,
    cpuReleaseToPersistedMs: cpuPerf.releaseToPersistedMs,
    gpuReleaseToPersistedMs: gpuPerf.releaseToPersistedMs,
    gpuVsCpuDrawP95Speedup: speedup,
    pixel,
    cpuLiveToSettled: cpuQuality.quality.transitions.liveToSettled,
    gpuLiveToSettled: gpuQuality.quality.transitions.liveToSettled,
    cpuFindings: cpuQuality.quality.findings.map(({ level, code }) => `${level}:${code}`),
    gpuFindings: gpuQuality.quality.findings.map(({ level, code }) => `${level}:${code}`),
    cpuArtifacts: cpuQuality.artifacts,
    gpuArtifacts: gpuQuality.artifacts,
  });
}

const recommendationCounts = Object.fromEntries(
  [...new Set(rows.map(({ recommendation }) => recommendation))]
    .map((recommendation) => [
      recommendation,
      rows.filter((row) => row.recommendation === recommendation).length,
    ]),
);
const p95 = (values: readonly number[]): number => {
  const sorted = [...values].filter(Number.isFinite).sort((left, right) => left - right);
  return sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
};
const summary = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  environment:
    "GitHub-hosted Ubuntu Chromium; forced WebGPU uses Dawn SwiftShader. Quality evidence is valid; native-hardware speed promotion remains blocked.",
  qualityFirstPolicy: {
    noQualityDowngradeForPerformance: true,
    gpuRequiresCrossBackendSettledParity: true,
    gpuRequiresIntrinsicLiveCommitQualityPass: true,
    gpuRequiresObservedQueueSubmission: true,
    hostedSwiftShaderCannotAutoPromoteProduction: true,
  },
  cpu: {
    completed: cpu.performance.completed && cpu.quality.completed,
    expected: cpu.performance.expectedBrushCount,
    measured: cpu.performance.measuredBrushCount,
    qualityFailures: cpu.quality.qualityFailureCount,
  },
  gpu: {
    completed: gpu.performance.completed && gpu.quality.completed,
    expected: gpu.performance.expectedBrushCount,
    measured: gpu.performance.measuredBrushCount,
    qualityFailures: gpu.quality.qualityFailureCount,
    observedGpuRoutedBrushes: rows.filter(({ actualGpuUsed }) => actualGpuUsed).length,
  },
  comparedBrushCount: rows.length,
  qualityParityPassedCount: rows.filter(({ qualityParityPassed }) => qualityParityPassed).length,
  recommendationCounts,
  aggregatePerformance: {
    cpuDrawP95OfBrushP95Ms: p95(rows.map(({ cpuDrawP95Ms }) => cpuDrawP95Ms)),
    gpuDrawP95OfBrushP95Ms: p95(rows.map(({ gpuDrawP95Ms }) => gpuDrawP95Ms)),
    cpuDrawP95OfBrushMaxMs: p95(rows.map(({ cpuDrawMaxMs }) => cpuDrawMaxMs)),
    gpuDrawP95OfBrushMaxMs: p95(rows.map(({ gpuDrawMaxMs }) => gpuDrawMaxMs)),
    minimumCpuInputDelivery: Math.min(1, ...rows.map(({ cpuInputDeliveryRatio }) => cpuInputDeliveryRatio)),
    minimumGpuInputDelivery: Math.min(1, ...rows.map(({ gpuInputDeliveryRatio }) => gpuInputDeliveryRatio)),
  },
};

const result = { summary, rows };
writeFileSync(join(output, "fullscreen-all-brush-comparison.json"), `${JSON.stringify(result, null, 2)}\n`);

const csvEscape = (value: unknown): string => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const csvColumns: ReadonlyArray<[string, (row: ComparisonRow) => unknown]> = [
  ["id", (row) => row.id],
  ["name", (row) => row.name],
  ["source", (row) => row.source],
  ["operation", (row) => row.operation],
  ["policy", (row) => row.policy],
  ["quality_parity_passed", (row) => row.qualityParityPassed],
  ["actual_gpu_used", (row) => row.actualGpuUsed],
  ["recommendation", (row) => row.recommendation],
  ["route_css_px", (row) => row.routeCssPx],
  ["dense_pointer_steps", (row) => row.densePointerSteps],
  ["cpu_input_delivery", (row) => row.cpuInputDeliveryRatio],
  ["gpu_input_delivery", (row) => row.gpuInputDeliveryRatio],
  ["cpu_draw_p95_ms", (row) => row.cpuDrawP95Ms],
  ["gpu_draw_p95_ms", (row) => row.gpuDrawP95Ms],
  ["cpu_draw_max_ms", (row) => row.cpuDrawMaxMs],
  ["gpu_draw_max_ms", (row) => row.gpuDrawMaxMs],
  ["gpu_vs_cpu_draw_p95_speedup", (row) => row.gpuVsCpuDrawP95Speedup],
  ["mask_iou", (row) => row.pixel?.maskIou],
  ["perceptible_delta_ratio", (row) => row.pixel?.tolerance8ChangedRatio],
  ["gpu_to_cpu_ink_energy", (row) => row.pixel?.gpuToCpuInkEnergyRatio],
  ["reason", (row) => row.recommendationReason],
];
const csv = [
  csvColumns.map(([name]) => csvEscape(name)).join(","),
  ...rows.map((row) => csvColumns.map(([, read]) => csvEscape(read(row))).join(",")),
].join("\n");
writeFileSync(join(output, "fullscreen-all-brush-comparison.csv"), `${csv}\n`);

const escapeHtml = (value: unknown): string => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");
const percent = (value: number | null | undefined): string =>
  value === null || value === undefined ? "—" : `${(value * 100).toFixed(2)}%`;
const number = (value: number | null | undefined, digits = 2): string =>
  value === null || value === undefined ? "—" : value.toFixed(digits);
const sortedRows = [...rows].sort((left, right) => {
  if (left.qualityParityPassed !== right.qualityParityPassed) return left.qualityParityPassed ? 1 : -1;
  if (left.actualGpuUsed !== right.actualGpuUsed) return left.actualGpuUsed ? -1 : 1;
  return (right.gpuVsCpuDrawP95Speedup ?? -Infinity) - (left.gpuVsCpuDrawP95Speedup ?? -Infinity);
});
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>ToonStudio 전체 브러시 풀스크린 품질·성능 비교</title>
<style>
body{font-family:system-ui,sans-serif;margin:24px;background:#f7f7f8;color:#18181b}h1,h2{letter-spacing:-.03em}
.card{background:white;border:1px solid #ddd;border-radius:12px;padding:18px;margin:14px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}
.metric{background:#f4f4f5;border-radius:8px;padding:12px}.metric b{display:block;font-size:1.45rem}table{border-collapse:collapse;width:100%;font-size:12px;background:white}
th,td{border:1px solid #ddd;padding:6px 7px;text-align:right;white-space:nowrap}th:first-child,td:first-child,th:nth-child(2),td:nth-child(2),th:nth-child(3),td:nth-child(3){text-align:left}
th{position:sticky;top:0;background:#27272a;color:white}.bad{background:#fee2e2}.candidate{background:#dcfce7}.muted{color:#666}.scroll{overflow:auto;max-height:72vh}
</style></head><body>
<h1>ToonStudio 전체 브러시 풀스크린 품질·성능 비교</h1>
<div class="card"><p><b>품질 우선 원칙:</b> 성능 때문에 질감·손맛·라이브/커밋 일관성을 낮추지 않습니다. GPU는 실제 queue 제출이 관찰되고 CPU 대비 정착 화질이 통과한 경우만 후보가 됩니다. 이 실행의 WebGPU 성능은 GitHub Ubuntu의 SwiftShader이므로 실제 제품 승격에는 Mac Metal/Windows Vulkan 재측정이 필요합니다.</p></div>
<div class="grid">
<div class="metric"><span>비교 브러시</span><b>${summary.comparedBrushCount}</b></div>
<div class="metric"><span>화질 동등성 통과</span><b>${summary.qualityParityPassedCount}</b></div>
<div class="metric"><span>실제 GPU 제출 관찰</span><b>${summary.gpu.observedGpuRoutedBrushes}</b></div>
<div class="metric"><span>CPU 입력 전달 최저</span><b>${percent(summary.aggregatePerformance.minimumCpuInputDelivery)}</b></div>
<div class="metric"><span>GPU 입력 전달 최저</span><b>${percent(summary.aggregatePerformance.minimumGpuInputDelivery)}</b></div>
</div>
<div class="card"><h2>권고 분류</h2><pre>${escapeHtml(JSON.stringify(recommendationCounts, null, 2))}</pre></div>
<div class="card"><h2>브러시별 상세</h2><div class="scroll"><table><thead><tr>
<th>ID</th><th>이름</th><th>권고</th><th>화질</th><th>GPU실사용</th><th>경로px</th><th>CPU입력</th><th>GPU입력</th><th>CPU p95</th><th>GPU p95</th><th>속도비</th><th>CPU max</th><th>GPU max</th><th>Mask IoU</th><th>지각차이</th><th>잉크에너지비</th></tr></thead><tbody>
${sortedRows.map((row) => `<tr class="${row.qualityParityPassed ? row.actualGpuUsed ? "candidate" : "" : "bad"}">
<td>${escapeHtml(row.id)}</td><td>${escapeHtml(row.name)}</td><td title="${escapeHtml(row.recommendationReason)}">${escapeHtml(row.recommendation)}</td><td>${row.qualityParityPassed ? "PASS" : "FAIL"}</td><td>${row.actualGpuUsed ? "yes" : "no"}</td><td>${number(row.routeCssPx, 0)}</td><td>${percent(row.cpuInputDeliveryRatio)}</td><td>${percent(row.gpuInputDeliveryRatio)}</td><td>${number(row.cpuDrawP95Ms)}</td><td>${number(row.gpuDrawP95Ms)}</td><td>${number(row.gpuVsCpuDrawP95Speedup, 3)}</td><td>${number(row.cpuDrawMaxMs)}</td><td>${number(row.gpuDrawMaxMs)}</td><td>${percent(row.pixel?.maskIou)}</td><td>${percent(row.pixel?.tolerance8ChangedRatio)}</td><td>${number(row.pixel?.gpuToCpuInkEnergyRatio, 3)}</td></tr>`).join("\n")}
</tbody></table></div></div>
<p class="muted">Generated ${escapeHtml(summary.generatedAt)}</p></body></html>`;
writeFileSync(join(output, "fullscreen-all-brush-comparison.html"), html);

const markdown = [
  "# ToonStudio 전체 브러시 풀스크린 품질·성능 비교",
  "",
  `- 비교 브러시: **${summary.comparedBrushCount}**`,
  `- 화질 동등성 통과: **${summary.qualityParityPassedCount}**`,
  `- forced-WebGPU 빌드에서 실제 GPU queue 제출 관찰: **${summary.gpu.observedGpuRoutedBrushes}**`,
  `- CPU 브러시별 draw p95의 p95: **${summary.aggregatePerformance.cpuDrawP95OfBrushP95Ms.toFixed(2)}ms**`,
  `- GPU 브러시별 draw p95의 p95: **${summary.aggregatePerformance.gpuDrawP95OfBrushP95Ms.toFixed(2)}ms**`,
  "",
  "## 판정 원칙",
  "",
  "성능 때문에 품질을 낮추지 않습니다. intrinsic live/commit 품질, CPU↔GPU 정착 픽셀 동등성, 입력 전달률, 실제 GPU queue 제출을 순서대로 통과해야 GPU 후보입니다. GitHub SwiftShader 속도는 제품 승격 근거가 아니므로 native GPU 재검증 전에는 자동 라우팅을 바꾸지 않습니다.",
  "",
  "## 권고 분류",
  "",
  "```json",
  JSON.stringify(recommendationCounts, null, 2),
  "```",
  "",
  "## 화질 실패 상위",
  "",
  ...sortedRows.filter((row) => !row.qualityParityPassed).slice(0, 30).map((row) =>
    `- \`${row.id}\` ${row.name}: ${row.recommendationReason}`),
  "",
  "## Native GPU 후보 상위",
  "",
  ...sortedRows.filter((row) => row.recommendation === "native-gpu-promotion-candidate")
    .slice(0, 30)
    .map((row) => `- \`${row.id}\` ${row.name}: p95 speedup ${row.gpuVsCpuDrawP95Speedup?.toFixed(3)}×, IoU ${percent(row.pixel?.maskIou)}`),
];
writeFileSync(join(output, "fullscreen-all-brush-comparison.md"), `${markdown.join("\n")}\n`);

console.log(JSON.stringify(summary, null, 2));
