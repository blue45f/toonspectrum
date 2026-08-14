/**
 * ADR-0011 lane 11 — real full-size natural-media benchmark.
 *
 * This is deliberately NOT a unit test. It renders a 1000 px base-diameter
 * natural-media workload through the committed libmypaint v1.6.1 WASM and
 * Hokusai 0.3.0 WASM engines. Four isolated workers (two corpus brushes × two
 * engines) run sequentially with a 512 MiB V8 old-space ceiling. Each worker
 * performs warmups, nine timed fresh-brush/fresh-surface renders including
 * RGBA8 readback, deterministic double hashes and five pressure probes.
 *
 * Run from the repository root:
 *   pnpm exec tsx tests/benchmarks/harness/libmypaint-fullsize.ts
 *
 * The existing 180 px Vitest proxy remains the fast CI regression gate. This
 * harness writes the non-CI full-size evidence separately to
 * tests/benchmarks/results/libmypaint-fullsize.json.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import {
  arch,
  cpus,
  loadavg,
  platform,
  totalmem,
} from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import {
  applyMybSettings,
  columnInkProfile,
  frameInkStats,
  renderLibMypaintStroke,
} from "../../../packages/studio-brush-platform/src/libmypaint";
import { loadLibMypaint } from "../../../packages/studio-brush-platform/src/libmypaint/index";
import {
  NATURAL_MEDIA_FULLSIZE_MAX_FRAME_BYTES,
  NATURAL_MEDIA_FULLSIZE_MAX_PROCESS_RSS_BYTES,
  NATURAL_MEDIA_FULLSIZE_SCHEMA_VERSION,
  finalizeNaturalMediaFullsizeBenchmark,
  naturalMediaPercentile,
  parseNaturalMediaFullsizeBenchmarkResult,
  summarizeNaturalMediaPressureFidelity,
} from "../../../packages/studio-brush-platform/src/natural-media-fullsize-benchmark";
import {
  compileRasterBrush,
  renderCompiledBrushStroke,
} from "../../../packages/studio-brush-platform/src/raster-compile";
import { importMybBrush } from "../../../packages/studio-format-gateway/src/myb";

import type { LibMypaintBrushDocument } from "../../../packages/studio-brush-platform/src/libmypaint";
import type { LibMypaintRaw } from "../../../packages/studio-brush-platform/src/libmypaint/index";
import type {
  NaturalMediaBenchmarkEngine,
  NaturalMediaBenchmarkMemorySnapshot,
  NaturalMediaEngineEvidence,
  NaturalMediaFullsizeBenchmarkDraft,
  NaturalMediaNoSilentLoss,
} from "../../../packages/studio-brush-platform/src/natural-media-fullsize-benchmark";
import type {
  CompiledRasterBrush,
  HokusaiModuleLike,
  RasterStrokeSample,
} from "../../../packages/studio-brush-platform/src/raster-compile";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const RESULTS_PATH = join(
  REPO_ROOT,
  "tests",
  "benchmarks",
  "results",
  "libmypaint-fullsize.json",
);
const CORPUS_DIR = join(REPO_ROOT, "tests", "corpus", "brushes", "myb");
const HOKUSAI_PKG_DIR = join(REPO_ROOT, "packages", "studio-hokusai-wasm", "pkg");
const LIBMYPAINT_WASM = join(
  REPO_ROOT,
  "packages",
  "studio-brush-platform",
  "src",
  "libmypaint",
  "mypaint-wasm.wasm",
);
const HOKUSAI_WASM = join(HOKUSAI_PKG_DIR, "studio_hokusai_wasm_bg.wasm");

/**
 * Canvas and dab size are ONE coupled measurement point, not two independent knobs, and the
 * contract enforces that (parseNaturalMediaFullsizeBenchmarkResult rejects a dab outside
 * 950-1050px as "workload bounds drift"). Read this before retuning either.
 *
 * This artifact answers "does either engine survive an extreme full-size dab" - memory bound,
 * no silent loss, determinism. It is NOT a product-operating-point measurement: shipping brushes
 * are 8-40px. Do not quote its throughput ratio as a product verdict on its own.
 *
 * Measured 2026-08-15, because the obvious "just measure at 24px" is a trap. Shrinking the dab
 * while leaving this 1792x1536 canvas in place makes Hokusai look FASTER than libmypaint
 * (wash-soft 1.59x, ink-crisp 1.19x over 5 runs) - but that is the 11MiB frame allocation
 * dominating both engines, not brush work. Scale the canvas down with the dab (448x384, 0.69MiB)
 * and the ordering snaps back to libmypaint ahead (wash-soft 0.82x, ink-crisp 0.52x). A
 * product-scale profile must therefore scale canvas WITH dab, or it measures allocator throughput
 * and silently reverses its own conclusion.
 */
const CANVAS_WIDTH = 1792;
const CANVAS_HEIGHT = 1536;
const BASE_DAB_DIAMETER_PX = 1000;
const RADIUS_LOGARITHMIC = Math.log(BASE_DAB_DIAMETER_PX / 2);
const STROKE_SAMPLE_COUNT = 32;
const WARMUP_RUNS = 2;
const MEASURED_RUNS = 9;
const PRESSURE_LEVELS = [0.2, 0.4, 0.6, 0.8, 1] as const;
const WORKER_TIMEOUT_MS = 15 * 60 * 1000;
const NODE_OLD_SPACE_LIMIT_MIB = 512;
const SEED = 7;
const CORPUS_BRUSHES = ["wash-soft", "ink-crisp"] as const;

type CorpusBrush = (typeof CORPUS_BRUSHES)[number];
type HokusaiModule = typeof import("../../../packages/studio-hokusai-wasm/pkg/studio_hokusai_wasm.js");

interface PreparedBrush {
  readonly document: LibMypaintBrushDocument;
  readonly compiled: CompiledRasterBrush;
  readonly sourceSettings: readonly string[];
  readonly sourceInputs: readonly string[];
}

interface EngineRuntime {
  readonly version: string;
  readonly noSilentLoss: NaturalMediaNoSilentLoss;
  render(samples: readonly RasterStrokeSample[]): Uint8Array;
  wasmHeapBytes(): number | null;
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function forceGc(): void {
  const target = globalThis as typeof globalThis & { gc?: () => void };
  target.gc?.();
}

function memorySnapshot(): NaturalMediaBenchmarkMemorySnapshot {
  const memory = process.memoryUsage();
  return {
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    externalBytes: memory.external,
    arrayBuffersBytes: memory.arrayBuffers,
  };
}

function mergeMemoryPeak(
  peak: NaturalMediaBenchmarkMemorySnapshot,
  next: NaturalMediaBenchmarkMemorySnapshot,
): NaturalMediaBenchmarkMemorySnapshot {
  return {
    rssBytes: Math.max(peak.rssBytes, next.rssBytes),
    heapUsedBytes: Math.max(peak.heapUsedBytes, next.heapUsedBytes),
    externalBytes: Math.max(peak.externalBytes, next.externalBytes),
    arrayBuffersBytes: Math.max(peak.arrayBuffersBytes, next.arrayBuffersBytes),
  };
}

function workloadSamples(): RasterStrokeSample[] {
  const samples: RasterStrokeSample[] = [];
  for (let index = 0; index < STROKE_SAMPLE_COUNT; index += 1) {
    const t = index / (STROKE_SAMPLE_COUNT - 1);
    samples.push({
      // At wash-soft's maximum authored radius delta (+0.4), the final dab
      // remains inside the bounded canvas: 1024 + exp(ln(500)+0.4) < 1792.
      x: 512 + 512 * t,
      y: CANVAS_HEIGHT / 2 + Math.sin(t * Math.PI * 4) * 4,
      pressure: 0.2 + 0.8 * t,
      tiltX: 0,
      tiltY: 0,
      tMs: index * 8,
    });
  }
  return samples;
}

function pressureDabSamples(pressure: number): RasterStrokeSample[] {
  const centerX = CANVAS_WIDTH / 2;
  const centerY = CANVAS_HEIGHT / 2;
  const probeSamples = 16;
  return Array.from({ length: probeSamples }, (_, index) => {
    const t = index / (probeSamples - 1);
    return {
    // A real short stroke, not repeated stationary events: some authored MYB
    // brushes have stroke_threshold/dab-distance gates and correctly emit no
      // ink until the pointer moves. All probes start at a realistic light
      // contact and ramp to the named target; geometry/time stay identical.
      x: centerX - 64 + 128 * t,
      y: centerY,
      pressure: 0.05 + (pressure - 0.05) * t,
      tiltX: 0,
      tiltY: 0,
      tMs: index * 8,
    };
  });
}

function prepareBrush(id: CorpusBrush): PreparedBrush {
  const sourceBytes = readFileSync(join(CORPUS_DIR, `${id}.myb`));
  const source = importMybBrush(new Uint8Array(sourceBytes), id, id).document;
  const radius = source.settings["radius_logarithmic"];
  if (!radius) {
    throw new Error(`${id}: radius_logarithmic is required for full-size gate`);
  }
  const fullsizeDocument = {
    ...source,
    settings: {
      ...source.settings,
      radius_logarithmic: {
        ...radius,
        base_value: RADIUS_LOGARITHMIC,
      },
    },
  };
  const fullsizeBytes = new TextEncoder().encode(JSON.stringify(fullsizeDocument));
  const imported = importMybBrush(
    fullsizeBytes,
    `${id}-1000px`,
    `${id}-1000px`,
  );
  const compiled = compileRasterBrush(imported.preset);
  const sourceSettings = Object.keys(imported.document.settings).sort();
  const sourceInputs = sourceSettings.flatMap((settingName) =>
    Object.keys(imported.document.settings[settingName]?.inputs ?? {})
      .sort()
      .map((inputName) => `${settingName}.inputs.${inputName}`),
  );
  return {
    document: imported.document,
    compiled,
    sourceSettings,
    sourceInputs,
  };
}

function libmypaintLossReport(
  lmp: LibMypaintRaw,
  prepared: PreparedBrush,
): NaturalMediaNoSilentLoss {
  const brush = lmp.brushNew();
  try {
    const injection = applyMybSettings(lmp, brush, prepared.document);
    const applied = new Set(injection.applied);
    const unknownSettings = new Set(injection.unknownSettings);
    const unknownInputs = new Set(injection.unknownInputs);
    const unaccountedDimensions: string[] = [];
    for (const settingName of prepared.sourceSettings) {
      if (!applied.has(settingName) && !unknownSettings.has(settingName)) {
        unaccountedDimensions.push(settingName);
      }
    }
    for (const inputName of prepared.sourceInputs) {
      const settingName = inputName.slice(0, inputName.indexOf(".inputs."));
      if (!applied.has(settingName) && !unknownSettings.has(settingName)) {
        unaccountedDimensions.push(inputName);
      } else if (!unknownSettings.has(settingName) && !unknownInputs.has(inputName)) {
        // The injection contract reports only rejected inputs; a known input
        // under an applied setting reached set_mapping_n/set_mapping_point.
      }
    }
    return {
      sourceSettings: prepared.sourceSettings.length,
      sourceInputs: prepared.sourceInputs.length,
      engineSettings: injection.applied.length,
      engineInputs:
        prepared.sourceInputs.length -
        injection.unknownInputs.length -
        prepared.sourceInputs.filter((input) =>
          injection.unknownSettings.includes(input.slice(0, input.indexOf(".inputs."))),
        ).length,
      applied: injection.applied,
      unknownSettings: injection.unknownSettings,
      unknownInputs: injection.unknownInputs,
      unmapped: [],
      warnings: [],
      unaccountedDimensions: [...new Set(unaccountedDimensions)].sort(),
      pass: unaccountedDimensions.length === 0,
    };
  } finally {
    lmp.brushFree(brush);
  }
}

function hokusaiLossReport(prepared: PreparedBrush): NaturalMediaNoSilentLoss {
  const engineSettings = prepared.compiled.hokusaiSettings.settings;
  const unmapped = new Set(prepared.compiled.unmapped);
  const unaccountedDimensions: string[] = [];
  for (const settingName of prepared.sourceSettings) {
    if (!(settingName in engineSettings) && !unmapped.has(settingName)) {
      unaccountedDimensions.push(settingName);
    }
  }
  for (const inputName of prepared.sourceInputs) {
    const marker = ".inputs.";
    const markerIndex = inputName.indexOf(marker);
    const settingName = inputName.slice(0, markerIndex);
    const axis = inputName.slice(markerIndex + marker.length);
    const engineInput = engineSettings[settingName]?.inputs[axis];
    if (!engineInput && !unmapped.has(inputName) && !unmapped.has(settingName)) {
      unaccountedDimensions.push(inputName);
    }
  }
  const applied = Object.keys(engineSettings).sort();
  const engineInputCount = Object.values(engineSettings).reduce(
    (sum, setting) => sum + Object.keys(setting.inputs).length,
    0,
  );
  return {
    sourceSettings: prepared.sourceSettings.length,
    sourceInputs: prepared.sourceInputs.length,
    engineSettings: applied.length,
    engineInputs: engineInputCount,
    applied,
    unknownSettings: [],
    unknownInputs: [],
    unmapped: prepared.compiled.unmapped,
    warnings: prepared.compiled.warnings,
    unaccountedDimensions: [...new Set(unaccountedDimensions)].sort(),
    pass: unaccountedDimensions.length === 0,
  };
}

async function loadRuntime(
  engine: NaturalMediaBenchmarkEngine,
  prepared: PreparedBrush,
): Promise<EngineRuntime> {
  if (engine === "libmypaint") {
    const lmp = await loadLibMypaint();
    return {
      version: lmp.version(),
      noSilentLoss: libmypaintLossReport(lmp, prepared),
      render: (samples) =>
        renderLibMypaintStroke(lmp, prepared.document, {
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          seed: SEED,
          samples,
        }).frame,
      wasmHeapBytes: () => lmp.module.HEAPU8.buffer.byteLength,
    };
  }

  const module = (await import(
    join(HOKUSAI_PKG_DIR, "studio_hokusai_wasm.js")
  )) as HokusaiModule;
  const wasmBytes = readFileSync(HOKUSAI_WASM);
  await module.default({ module_or_path: wasmBytes });
  const hokusai = module as unknown as HokusaiModuleLike;
  return {
    version: "hokusai-core 0.3.0 / studio-hokusai-wasm 0.1.0",
    noSilentLoss: hokusaiLossReport(prepared),
    render: (samples) =>
      renderCompiledBrushStroke(hokusai, prepared.compiled, {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        seed: SEED,
        samples,
      }).frame,
    // wasm-bindgen does not expose its WebAssembly.Memory object. The worker's
    // OS maxRSS includes that heap; report null rather than inventing a value.
    wasmHeapBytes: () => null,
  };
}

async function runWorker(
  engine: NaturalMediaBenchmarkEngine,
  brushId: CorpusBrush,
): Promise<NaturalMediaEngineEvidence> {
  const prepared = prepareBrush(brushId);
  const runtime = await loadRuntime(engine, prepared);
  if (!runtime.noSilentLoss.pass) {
    throw new Error(
      `${engine}/${brushId}: unaccounted dimensions: ${runtime.noSilentLoss.unaccountedDimensions.join(
        ", ",
      )}`,
    );
  }
  forceGc();
  const baseline = memorySnapshot();
  let peakObserved = baseline;
  const observeMemory = (): void => {
    peakObserved = mergeMemoryPeak(peakObserved, memorySnapshot());
  };
  const samples = workloadSamples();

  for (let index = 0; index < WARMUP_RUNS; index += 1) {
    const frame = runtime.render(samples);
    if (frame.byteLength !== CANVAS_WIDTH * CANVAS_HEIGHT * 4) {
      throw new Error(`${engine}/${brushId}: warmup returned truncated frame`);
    }
    observeMemory();
    forceGc();
  }

  const rawTimings: number[] = [];
  const hashes: string[] = [];
  let referenceFrame:
    | {
        sha256: string;
        totalAlpha: number;
        inkedPixels: number;
        meanInkedAlpha: number;
        columnInkProfile: number[];
      }
    | undefined;
  for (let index = 0; index < MEASURED_RUNS; index += 1) {
    const start = performance.now();
    const frame = runtime.render(samples);
    rawTimings.push(performance.now() - start);
    observeMemory();
    if (index < 2) hashes.push(sha256(frame));
    if (index === 0) {
      const stats = frameInkStats(frame);
      referenceFrame = {
        sha256: hashes[0] ?? sha256(frame),
        totalAlpha: stats.totalAlpha,
        inkedPixels: stats.inkedPixels,
        meanInkedAlpha: stats.meanInkedAlpha,
        columnInkProfile: columnInkProfile(frame, CANVAS_WIDTH, CANVAS_HEIGHT),
      };
    }
    forceGc();
  }
  if (!referenceFrame || hashes.length !== 2) {
    throw new Error(`${engine}/${brushId}: incomplete deterministic evidence`);
  }

  const pressureSamples = PRESSURE_LEVELS.map((pressure) => {
    const frame = runtime.render(pressureDabSamples(pressure));
    observeMemory();
    const stats = frameInkStats(frame);
    const row = {
      pressure,
      totalAlpha: stats.totalAlpha,
      inkedPixels: stats.inkedPixels,
      sha256: sha256(frame),
    };
    forceGc();
    return row;
  });
  const pressureFidelity = summarizeNaturalMediaPressureFidelity(pressureSamples);

  const timings = rawTimings.map((value) => round(value, 3));
  const p50Ms = round(naturalMediaPercentile(timings, 0.5), 3);
  const p95Ms = round(naturalMediaPercentile(timings, 0.95), 3);
  const processPeakRssBytes = process.resourceUsage().maxRSS * 1024;
  return {
    engine,
    version: runtime.version,
    brushId,
    timing: {
      warmupRuns: WARMUP_RUNS,
      measuredRuns: MEASURED_RUNS,
      samplesMs: timings,
      p50Ms,
      p95Ms,
      megapixelsPerSecondAtP50: round(
        (CANVAS_WIDTH * CANVAS_HEIGHT) / p50Ms / 1000,
        3,
      ),
    },
    determinism: {
      hashes: [hashes[0]!, hashes[1]!],
      pass: hashes[0] === hashes[1],
    },
    frame: referenceFrame,
    pressureFidelity: {
      samples: pressureSamples,
      ...pressureFidelity,
    },
    noSilentLoss: runtime.noSilentLoss,
    memory: {
      nodeOldSpaceLimitMiB: NODE_OLD_SPACE_LIMIT_MIB,
      baseline,
      peakObserved,
      processPeakRssBytes,
      rssIncreaseFromBaselineBytes: Math.max(
        0,
        peakObserved.rssBytes - baseline.rssBytes,
      ),
      wasmHeapBytes: runtime.wasmHeapBytes(),
      withinBound:
        processPeakRssBytes <= NATURAL_MEDIA_FULLSIZE_MAX_PROCESS_RSS_BYTES &&
        CANVAS_WIDTH * CANVAS_HEIGHT * 4 <= NATURAL_MEDIA_FULLSIZE_MAX_FRAME_BYTES,
      note:
        engine === "libmypaint"
          ? "process.resourceUsage maxRSS captures synchronous native/WASM peaks; wasmHeapBytes is the exposed Emscripten HEAPU8 buffer after all runs"
          : "process.resourceUsage maxRSS captures synchronous native/WASM peaks; wasm-bindgen does not expose WebAssembly.Memory, so wasmHeapBytes is null rather than estimated",
    },
  };
}

function workerResultLine(stdout: string): string {
  const prefix = "NATURAL_MEDIA_WORKER_RESULT=";
  let line: string | undefined;
  for (const candidate of stdout.split(/\r?\n/u)) {
    if (candidate.startsWith(prefix)) line = candidate;
  }
  if (!line) throw new Error(`worker emitted no result line:\n${stdout}`);
  return line.slice(prefix.length);
}

function runIsolatedWorker(
  engine: NaturalMediaBenchmarkEngine,
  brushId: CorpusBrush,
): NaturalMediaEngineEvidence {
  const existingNodeOptions = process.env["NODE_OPTIONS"]?.trim() ?? "";
  const nodeOptions = [
    existingNodeOptions,
    `--max-old-space-size=${NODE_OLD_SPACE_LIMIT_MIB}`,
    "--expose-gc",
  ]
    .filter(Boolean)
    .join(" ");
  const child = spawnSync(
    "pnpm",
    ["exec", "tsx", SCRIPT_PATH, "--worker", engine, brushId],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: WORKER_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
      env: {
        ...process.env,
        NODE_OPTIONS: nodeOptions,
        NO_COLOR: "1",
      },
    },
  );
  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(
      `${engine}/${brushId} worker failed (${String(child.status)}):\n${child.stderr}\n${child.stdout}`,
    );
  }
  return JSON.parse(workerResultLine(child.stdout)) as NaturalMediaEngineEvidence;
}

function gitCommit(): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`git rev-parse failed: ${result.stderr}`);
  return result.stdout.trim();
}

function runParent(): void {
  const brushes: Record<
    string,
    {
      libmypaint: NaturalMediaEngineEvidence;
      hokusai: NaturalMediaEngineEvidence;
    }
  > = {};
  for (const brushId of CORPUS_BRUSHES) {
    console.log(`${brushId}: libmypaint full-size worker`);
    const libmypaint = runIsolatedWorker("libmypaint", brushId);
    console.log(
      `  libmypaint p50 ${libmypaint.timing.p50Ms}ms p95 ${libmypaint.timing.p95Ms}ms ` +
        `maxRSS ${(libmypaint.memory.processPeakRssBytes / 1048576).toFixed(1)}MiB`,
    );
    console.log(`${brushId}: hokusai full-size worker`);
    const hokusai = runIsolatedWorker("hokusai", brushId);
    console.log(
      `  hokusai p50 ${hokusai.timing.p50Ms}ms p95 ${hokusai.timing.p95Ms}ms ` +
        `maxRSS ${(hokusai.memory.processPeakRssBytes / 1048576).toFixed(1)}MiB`,
    );
    brushes[brushId] = { libmypaint, hokusai };
  }

  const cpuList = cpus();
  const draft: NaturalMediaFullsizeBenchmarkDraft = {
    schemaVersion: NATURAL_MEDIA_FULLSIZE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    gitCommit: gitCommit(),
    command: "pnpm exec tsx tests/benchmarks/harness/libmypaint-fullsize.ts",
    host: {
      platform: platform(),
      arch: arch(),
      node: process.version,
      cpuModel: cpuList[0]?.model ?? "unknown",
      logicalCpus: cpuList.length,
      totalMemoryBytes: totalmem(),
      loadAverage: loadavg().map((value) => round(value, 3)),
    },
    pins: {
      libmypaint: "v1.6.1 (2768251dacce3939136c839aeca413f4aa4241d0)",
      hokusai: "hokusai-core 0.3.0 via studio-hokusai-wasm 0.1.0",
      libmypaintWasmBytes: statSync(LIBMYPAINT_WASM).size,
      hokusaiWasmBytes: statSync(HOKUSAI_WASM).size,
    },
    workload: {
      canvasWidth: CANVAS_WIDTH,
      canvasHeight: CANVAS_HEIGHT,
      rgbaFrameBytes: CANVAS_WIDTH * CANVAS_HEIGHT * 4,
      rgbaFrameByteLimit: NATURAL_MEDIA_FULLSIZE_MAX_FRAME_BYTES,
      baseDabDiameterPx: BASE_DAB_DIAMETER_PX,
      radiusLogarithmic: RADIUS_LOGARITHMIC,
      strokeSamples: STROKE_SAMPLE_COUNT,
      warmupRuns: WARMUP_RUNS,
      measuredRuns: MEASURED_RUNS,
      pressureLevels: PRESSURE_LEVELS,
      sequentialWorkers: true,
      workerTimeoutMs: WORKER_TIMEOUT_MS,
      description:
        "fresh brush + fresh bounded surface; authored MYB dynamics over a 512px horizontal pressure-ramp stroke; timing includes engine brush construction, surface allocation, all samples, finish tail and full RGBA8 readback; MYB file parse/compile is setup and excluded",
    },
    brushes,
    notes: [
      "The 180px libmypaint-parity Vitest proxy remains unchanged as CI; this is separate full-size non-unit evidence.",
      "Each engine/brush runs in a fresh sequential process with V8 old-space capped at 512MiB; no two 10.5MiB frames are benchmarked concurrently.",
      "process.resourceUsage().maxRSS is the OS high-water mark and captures synchronous WASM work that heap sampling cannot observe mid-call; peakObserved heap/external/arrayBuffers are snapshots taken with each returned frame alive.",
      "The host is not reserved: committed loadAverage and every raw timing sample expose concurrent build/test load. The promotion ratio uses p50; p95 remains the objective observed tail and is not discarded when the host is busy.",
      "Alpha is the cross-engine parity axis. RGB remains in each engine's native channel space, matching the established lane-11 parity contract.",
      "Pressure fidelity probes use identical 128px/16-sample strokes that ramp from light contact (0.05) to each recorded target pressure; fixed-pressure stroke starts are intentionally excluded because they exercise engine stroke-threshold initialization rather than normal pen pressure response.",
      "Timing is host-specific raw evidence. SHA, coverage/profile, pressure fidelity, no-silent-loss accounting and every gate field are deterministic/recomputable.",
    ],
  };
  const result = finalizeNaturalMediaFullsizeBenchmark(draft);
  parseNaturalMediaFullsizeBenchmarkResult(result);
  writeFileSync(RESULTS_PATH, `${JSON.stringify(result, null, 2)}\n`);
  for (const comparison of result.comparisons) {
    console.log(
      `${comparison.brushId}: profile r=${comparison.columnProfileCorrelation} ` +
        `coverage=${comparison.coverageRatioLibmypaintOverHokusai} ` +
        `hokusai throughput=${comparison.hokusaiThroughputOverLibmypaint}x`,
    );
  }
  console.log(`verdict: ${result.gate.verdict}`);
  console.log(`wrote ${RESULTS_PATH}`);
}

const workerIndex = process.argv.indexOf("--worker");
if (workerIndex >= 0) {
  const engine = process.argv[workerIndex + 1];
  const brushId = process.argv[workerIndex + 2];
  if (engine !== "libmypaint" && engine !== "hokusai") {
    throw new Error(`unknown worker engine: ${String(engine)}`);
  }
  if (!CORPUS_BRUSHES.includes(brushId as CorpusBrush)) {
    throw new Error(`unknown worker brush: ${String(brushId)}`);
  }
  const evidence = await runWorker(engine, brushId as CorpusBrush);
  console.log(`NATURAL_MEDIA_WORKER_RESULT=${JSON.stringify(evidence)}`);
} else {
  runParent();
}
