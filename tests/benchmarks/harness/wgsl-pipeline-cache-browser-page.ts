import {
  WgslPipelineKilledError,
  createWgslPipelineCache,
  createWgslWebGpuPipelineCompiler,
} from "../../../packages/studio-engine-registry/src/wgsl-pipeline-cache";
import {
  composeWgslVariant,
  identityWgslLut3,
} from "../../../packages/studio-engine-registry/src/wgsl-variants";

import type {
  WgslComputePipelineDeviceLike,
  WgslPipelineCompiler,
} from "../../../packages/studio-engine-registry/src/wgsl-pipeline-cache";
import type {
  ComposedWgslVariant,
  WgslFilterOpSpec,
} from "../../../packages/studio-engine-registry/src/wgsl-variants";

const RESULT_GLOBAL = "__TOONSPECTRUM_WGSL_PIPELINE_CACHE_RESULT__";
const SAMPLES = 61;
const WARMUP_PIPELINES = 5;
const FRAME_GAP_THRESHOLD_MS = 20;

interface TimedEntry {
  readonly startTime: number;
  readonly duration: number;
}

type BrowserPipeline = object;

interface BrowserGpuValidationError {
  readonly name: string;
  readonly message: string;
}

interface BrowserGpuDevice
  extends WgslComputePipelineDeviceLike<BrowserPipeline> {
  pushErrorScope(filter: "validation"): void;
  popErrorScope(): Promise<BrowserGpuValidationError | null>;
  destroy(): void;
}

interface BrowserGpuAdapter {
  readonly info: {
    readonly vendor: string;
    readonly architecture: string;
    readonly device: string;
    readonly description: string;
  };
  requestDevice(): Promise<BrowserGpuDevice>;
}

interface BrowserGpu {
  requestAdapter(options?: {
    readonly powerPreference?: "high-performance" | "low-power";
  }): Promise<BrowserGpuAdapter | null>;
}

interface Distribution {
  readonly sampleCount: number;
  readonly samplesMs: readonly number[];
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly meanMs: number;
  readonly percentileMethod: "nearest-rank-ceil";
}

interface PhaseMeasurement {
  readonly operation: Distribution;
  readonly frameGap: Distribution;
  readonly jank: {
    readonly frameGapThresholdMs: number;
    readonly frameGapsOverThreshold: number;
    readonly p99OverP50: number;
    readonly longTaskObserverSupported: boolean;
    readonly longTaskCount: number;
    readonly longestLongTaskMs: number;
    readonly totalBlockingTimeMs: number;
    readonly longTasks: readonly TimedEntry[];
  };
}

declare global {
  interface Window {
    __TOONSPECTRUM_WGSL_PIPELINE_CACHE_RESULT__?: unknown;
  }
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function summarize(values: readonly number[]): Distribution {
  if (values.length === 0) throw new Error("cannot summarize an empty sample set");
  const sorted = [...values].sort((left, right) => left - right);
  const at = (quantile: number): number => {
    const index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil(sorted.length * quantile) - 1),
    );
    return sorted[index]!;
  };
  return {
    sampleCount: values.length,
    samplesMs: values.map(round),
    p50Ms: round(at(0.5)),
    p95Ms: round(at(0.95)),
    p99Ms: round(at(0.99)),
    minMs: round(sorted[0]!),
    maxMs: round(sorted.at(-1)!),
    meanMs: round(values.reduce((sum, value) => sum + value, 0) / values.length),
    percentileMethod: "nearest-rank-ceil",
  };
}

function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function representativeOps(valueSeed: number): readonly WgslFilterOpSpec[] {
  return [
    {
      op: "brightness-contrast",
      brightness: ((valueSeed % 17) - 8) / 10,
      contrast: (valueSeed % 80) - 40,
    },
    {
      op: "hsl",
      hue: (valueSeed * 37) % 360,
      saturation: ((valueSeed % 11) - 5) / 5,
      luminance: ((valueSeed % 9) - 4) / 4,
    },
    { op: "levels", lut: identityWgslLut3() },
    { op: "curves", lut: identityWgslLut3() },
    {
      op: "color-balance",
      shadows: [valueSeed % 30, 0, -5],
      midtones: [0, valueSeed % 20, 0],
      highlights: [20, 8, -(valueSeed % 20)],
    },
  ];
}

function structuralVariants(): readonly ComposedWgslVariant[] {
  return [
    composeWgslVariant([{ op: "brightness-contrast", brightness: 0.2 }]),
    composeWgslVariant([
      { op: "brightness-contrast", brightness: 0.2, contrast: 15 },
    ]),
    composeWgslVariant([{ op: "hsl", hue: 30 }]),
  ];
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function measurePhase(
  operation: (sampleIndex: number) => Promise<void>,
  longTasks: readonly TimedEntry[],
  longTaskObserverSupported: boolean,
): Promise<PhaseMeasurement> {
  const operationSamples: number[] = [];
  const frameGaps: number[] = [];
  const phaseStart = performance.now();
  let previousFrame = await nextFrame();
  for (let index = 0; index < SAMPLES; index += 1) {
    const started = performance.now();
    await operation(index);
    operationSamples.push(performance.now() - started);
    const frame = await nextFrame();
    frameGaps.push(frame - previousFrame);
    previousFrame = frame;
  }
  const phaseEnd = performance.now();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const phaseLongTasks = longTasks.filter(
    (entry) =>
      entry.startTime < phaseEnd &&
      entry.startTime + entry.duration > phaseStart,
  );
  const operationDistribution = summarize(operationSamples);
  const frameDistribution = summarize(frameGaps);
  return {
    operation: operationDistribution,
    frameGap: frameDistribution,
    jank: {
      frameGapThresholdMs: FRAME_GAP_THRESHOLD_MS,
      frameGapsOverThreshold: frameGaps.filter(
        (duration) => duration > FRAME_GAP_THRESHOLD_MS,
      ).length,
      p99OverP50: round(
        frameDistribution.p50Ms === 0
          ? 0
          : frameDistribution.p99Ms / frameDistribution.p50Ms,
      ),
      longTaskObserverSupported,
      longTaskCount: phaseLongTasks.length,
      longestLongTaskMs: round(
        Math.max(0, ...phaseLongTasks.map((entry) => entry.duration)),
      ),
      totalBlockingTimeMs: round(
        phaseLongTasks.reduce(
          (sum, entry) => sum + Math.max(0, entry.duration - 50),
          0,
        ),
      ),
      longTasks: phaseLongTasks.map((entry) => ({
        startTime: round(entry.startTime),
        duration: round(entry.duration),
      })),
    },
  };
}

async function run(): Promise<unknown> {
  const gpu = (navigator as unknown as { readonly gpu?: BrowserGpu }).gpu;
  if (!gpu) {
    return {
      schemaVersion: 1,
      status: "unsupported",
      pass: false,
      reason: "navigator.gpu is unavailable",
    };
  }
  const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) {
    return {
      schemaVersion: 1,
      status: "unsupported",
      pass: false,
      reason: "no WebGPU adapter",
    };
  }
  const device = await adapter.requestDevice();
  const rawCompiler = createWgslWebGpuPipelineCompiler(device);
  const representative = composeWgslVariant(representativeOps(0));
  const valueVariantKeys = Array.from(
    { length: SAMPLES },
    (_, index) => composeWgslVariant(representativeOps(index)).variantKey,
  );
  const longTasks: TimedEntry[] = [];
  const longTaskObserverSupported = PerformanceObserver.supportedEntryTypes.includes(
    "longtask",
  );
  const observer = longTaskObserverSupported
    ? new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTasks.push({ startTime: entry.startTime, duration: entry.duration });
        }
      })
    : null;
  observer?.observe({ entryTypes: ["longtask"] });
  device.pushErrorScope("validation");
  try {
    for (let index = 0; index < WARMUP_PIPELINES; index += 1) {
      await rawCompiler(representative, { signal: new AbortController().signal });
    }

    let uncachedPipelineCreations = 0;
    const uncached = await measurePhase(
      async (index) => {
        const variant = composeWgslVariant(representativeOps(index));
        await rawCompiler(variant, { signal: new AbortController().signal });
        uncachedPipelineCreations += 1;
      },
      longTasks,
      longTaskObserverSupported,
    );

    let cachedCompileInvocations = 0;
    const cachedCompiler: WgslPipelineCompiler<BrowserPipeline> = async (
      variant,
      context,
    ) => {
      cachedCompileInvocations += 1;
      return rawCompiler(variant, context);
    };
    const cache = createWgslPipelineCache({
      maxEntries: 4,
      maxEstimatedBytes: 2 * 1024 * 1024,
      compile: cachedCompiler,
    });
    const retainedPipeline = await cache.getOrCompile(representative);
    let samePipelineReference = true;
    const cached = await measurePhase(
      async (index) => {
        const pipeline = await cache.getOrCompile(
          composeWgslVariant(representativeOps(index + 100)),
        );
        samePipelineReference &&= pipeline === retainedPipeline;
      },
      longTasks,
      longTaskObserverSupported,
    );

    let dedupCompileInvocations = 0;
    const dedupCache = createWgslPipelineCache<BrowserPipeline>({
      maxEntries: 2,
      maxEstimatedBytes: 1_000_000,
      compile: async (variant, context) => {
        dedupCompileInvocations += 1;
        return rawCompiler(variant, context);
      },
    });
    const dedupPipelines = await Promise.all(
      Array.from({ length: 16 }, () => dedupCache.getOrCompile(representative)),
    );

    const structures = structuralVariants();
    const controlCache = createWgslPipelineCache<BrowserPipeline>({
      maxEntries: 2,
      maxEstimatedBytes: 25,
      compile: rawCompiler,
      estimateBytes: () => 10,
    });
    for (const variant of structures) await controlCache.getOrCompile(variant);
    const beforeControl = controlCache.stats();
    const killedKey = structures[2]!.variantKey;
    const invalidatedKey = structures[1]!.variantKey;
    const controlReceipt = controlCache.applyRemoteControl({
      revision: 41,
      killed: [{ variantKey: killedKey, reason: "benchmark remote kill" }],
      invalidate: [
        { variantKey: invalidatedKey, reason: "benchmark remote invalidate" },
      ],
    });
    let killedRequestRejected = false;
    try {
      await controlCache.getOrCompile(structures[2]!);
    } catch (error) {
      killedRequestRejected = error instanceof WgslPipelineKilledError;
    }
    const reviveReceipt = controlCache.applyRemoteControl({
      revision: 42,
      killed: [],
    });
    await controlCache.getOrCompile(structures[2]!);

    const validationError = await device.popErrorScope();
    const adapterInfo = adapter.info;
    const sourceSha256 = await sha256(representative.wgsl);
    const cacheStats = cache.stats();
    const dedupStats = dedupCache.stats();
    const afterControl = controlCache.stats();
    const gates = {
      valueOnlyKeyStable:
        new Set(valueVariantKeys).size === 1 &&
        valueVariantKeys[0] === representative.variantKey,
      valueOnlySingleCompile:
        cachedCompileInvocations === 1 &&
        cacheStats.hits === SAMPLES &&
        samePipelineReference,
      structureKeysDistinct:
        new Set(structures.map((variant) => variant.variantKey)).size ===
        structures.length,
      boundedLru:
        beforeControl.entries === 2 &&
        beforeControl.estimatedBytes === 20 &&
        beforeControl.evictions === 1,
      inFlightDeduplicated:
        dedupCompileInvocations === 1 &&
        dedupStats.inFlightHits === 15 &&
        new Set(dedupPipelines).size === 1,
      remoteControl:
        killedRequestRejected &&
        controlReceipt.applied &&
        controlReceipt.newlyKilled.includes(killedKey) &&
        controlReceipt.invalidated.includes(invalidatedKey) &&
        reviveReceipt.revived.includes(killedKey) &&
        afterControl.remoteRevision === 42,
      noValidationError: validationError === null,
      cacheP95Faster: cached.operation.p95Ms < uncached.operation.p95Ms,
      pipelineCreationEliminated:
        uncachedPipelineCreations === SAMPLES && cachedCompileInvocations === 1,
    };
    const pass = Object.values(gates).every(Boolean);
    return {
      schemaVersion: 1,
      status: pass ? "ok" : "failed",
      pass,
      execution: "vite-production-build-chromium-metal-webgpu",
      measuredAt: new Date().toISOString(),
      adapter: {
        vendor: adapterInfo.vendor,
        architecture: adapterInfo.architecture,
        device: adapterInfo.device,
        description: adapterInfo.description,
      },
      workload: {
        generator: "composeWgslVariant",
        representativeVariantKey: representative.variantKey,
        representativeShaderId: representative.shaderId,
        representativeStructure: representative.structure,
        representativeWgslSha256: sourceSha256,
        stages: representative.stages.map((stage) => stage.op),
        sampleCountPerApproach: SAMPLES,
        warmupPipelinesExcluded: WARMUP_PIPELINES,
        scheduling: "one operation followed by one requestAnimationFrame per sample",
        percentileMethod: "nearest-rank-ceil",
      },
      approaches: {
        uncachedRepeatedCreation: {
          pipelineCreations: uncachedPipelineCreations,
          ...uncached,
        },
        cachedValueUpdates: {
          pipelineCompileInvocations: cachedCompileInvocations,
          samePipelineReference,
          cacheStats,
          ...cached,
        },
      },
      comparison: {
        operationP50Speedup: round(
          uncached.operation.p50Ms / Math.max(cached.operation.p50Ms, 0.000001),
        ),
        operationP95Speedup: round(
          uncached.operation.p95Ms / Math.max(cached.operation.p95Ms, 0.000001),
        ),
        operationP99Speedup: round(
          uncached.operation.p99Ms / Math.max(cached.operation.p99Ms, 0.000001),
        ),
        pipelineCreationReduction: `${SAMPLES} -> 1`,
        longTaskCountDelta:
          cached.jank.longTaskCount - uncached.jank.longTaskCount,
        frameGapP99RatioCachedOverUncached: round(
          cached.frameGap.p99Ms / Math.max(uncached.frameGap.p99Ms, 0.000001),
        ),
      },
      controls: {
        structureVariantKeys: structures.map((variant) => variant.variantKey),
        boundedLruBeforeControl: beforeControl,
        remoteControlReceipt: controlReceipt,
        killedRequestRejected,
        reviveReceipt,
        afterControl,
        inFlight: {
          requests: 16,
          compileInvocations: dedupCompileInvocations,
          samePipelineReference: new Set(dedupPipelines).size === 1,
          stats: dedupStats,
        },
      },
      validationError:
        validationError === null
          ? null
          : { name: validationError.name, message: validationError.message },
      gates,
    };
  } finally {
    observer?.disconnect();
    device.destroy();
  }
}

void run()
  .then((result) => {
    window[RESULT_GLOBAL] = result;
  })
  .catch((error: unknown) => {
    window[RESULT_GLOBAL] = {
      schemaVersion: 1,
      status: "error",
      pass: false,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack ?? null }
          : { name: "NonError", message: String(error) },
    };
  });
