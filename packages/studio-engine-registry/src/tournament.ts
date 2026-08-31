import type { SceneIR, SceneNodeIR } from "@toonspectrum/studio-project-model";

/**
 * Renderer Tournament (V12 §5).
 *
 * Evidence-only candidate comparison. It measures real render
 * timings per scene-complexity bucket, caches the winner per device, applies
 * hysteresis (<12% expected gain = no switch; never switch while pen-down),
 * verifies challengers through a visual equivalence gate, runs shadow renders
 * that can never affect production output, and gates promotion on evidence.
 * A remote kill switch removes a provider from candidacy immediately.
 *
 * This module never owns a product surface and cannot execute or replace a
 * renderer. `winnerId` and `switched` describe a cached recommendation for
 * QA/benchmark or an explicit future selection boundary only. Product code
 * must not treat a tournament result as permission to retry a failed operation
 * with another provider.
 */

/* ------------------------------------------------------------------ */
/* §5.1 SceneFingerprint                                               */
/* ------------------------------------------------------------------ */

export interface SceneFingerprint {
  /** Fingerprint trait schema. Bump only when bucket semantics change. */
  fingerprintVersion: 2 | 3;
  canvasWidth: number;
  canvasHeight: number;
  nodeCount: number;
  pathCount: number;
  pathSegmentCount: number;
  lineSegmentCount: number;
  curveSegmentCount: number;
  quadraticSegmentCount: number;
  cubicSegmentCount: number;
  closeCount: number;
  maxPathSegmentCount: number;
  strokeCount: number;
  fillCount: number;
  evenOddFillCount: number;
  gradientCount: number;
  linearGradientCount: number;
  radialGradientCount: number;
  sweepGradientCount: number;
  gradientStopCount: number;
  blendLayerCount: number;
  nonOpaqueNodeCount: number;
  groupDepth: number;
  maxGroupChildCount: number;
  clipPathCount: number;
  clipPathSegmentCount: number;
  textCount: number;
  /** Unicode scalar/code-point count; never presented as a shaped glyph count. */
  textCodePointCount: number;
  /** Changed paths / total paths, measured by the scene compiler. Null in legacy v2 mode. */
  changedPathRatio: number | null;
  /** Shaped glyph count supplied by the text layout provider. Never inferred from code points. */
  glyphCount: number | null;
  /** Unique shaped font faces used by the scene. Null when layout evidence is unavailable. */
  uniqueFontCount: number | null;
  imageCount: number | null;
  externalTextureCount: number | null;
  /** Semantic document layers, not renderer node/group count. */
  layerCount: number | null;
  maskDepth: number | null;
  filterNodeCount: number | null;
  maxFilterRadius: number | null;
  visibleBoundsRatio: number | null;
  animationRate: number | null;
  expectedOverdraw: number | null;
  canvasArea: number;
  /**
   * Quantized complexity key used by WinnerCache/ProviderCostModel. Same
   * scene always maps to the same bucket; scenes in the same power-of-two
   * complexity class intentionally share a bucket so measurements pool.
   */
  bucket: string;
}

/**
 * Dynamic V12 fingerprint observations that cannot be recovered faithfully
 * from the stable SceneIR alone. Supplying this complete object opts into the
 * v3 bucket. Omitting it deliberately preserves the persisted v2 bucket and
 * leaves these metrics null instead of inventing evidence.
 */
export interface SceneFingerprintV12Metrics {
  changedPathRatio: number;
  glyphCount: number;
  uniqueFontCount: number;
  imageCount: number;
  externalTextureCount: number;
  layerCount: number;
  maskDepth: number;
  filterNodeCount: number;
  maxFilterRadius: number;
  visibleBoundsRatio: number;
  animationRate: number;
  expectedOverdraw: number;
}

/**
 * Power-of-two quantizer: 0→0, 1→1, 2→2, 3..4→3, 5..8→4, … (deterministic).
 *
 * Exported so every bucket key in the studio quantizes identically — the
 * filter island's size/chain bucket (studio-filter-island-plan.ts) pools
 * cost samples the same way {@link computeSceneFingerprint} does, which is
 * what makes a `ProviderCostModel` estimate comparable to a seeded estimate
 * for the same bucket.
 */
export function quantizePow2Bucket(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(Math.log2(value)) + 1;
}

const pow2Bucket = quantizePow2Bucket;

function assertFingerprintCount(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer, got ${value}`);
  }
}

function assertFingerprintRange(
  label: string,
  value: number,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(
      `${label} must be finite and within [${minimum}, ${maximum}], got ${value}`,
    );
  }
}

function assertFingerprintNonNegative(label: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative number, got ${value}`);
  }
}

/** Sixteenth-step ratio bucket, inclusive 0..16. */
export function quantizeUnitRatioBucket(value: number): number {
  assertFingerprintRange("ratio", value, 0, 1);
  return Math.round(value * 16);
}

/** Fixed-resolution non-negative bucket used for rates and overdraw. */
export function quantizeFixedBucket(value: number, unitsPerOne: number): number {
  assertFingerprintNonNegative("value", value);
  if (!Number.isSafeInteger(unitsPerOne) || unitsPerOne <= 0) {
    throw new RangeError(`unitsPerOne must be a positive safe integer, got ${unitsPerOne}`);
  }
  const bucket = Math.round(value * unitsPerOne);
  if (!Number.isSafeInteger(bucket)) {
    throw new RangeError(`quantized value exceeds the safe integer range`);
  }
  return bucket;
}

function validateSceneFingerprintV12Metrics(metrics: SceneFingerprintV12Metrics): void {
  assertFingerprintRange("changedPathRatio", metrics.changedPathRatio, 0, 1);
  assertFingerprintCount("glyphCount", metrics.glyphCount);
  assertFingerprintCount("uniqueFontCount", metrics.uniqueFontCount);
  assertFingerprintCount("imageCount", metrics.imageCount);
  assertFingerprintCount("externalTextureCount", metrics.externalTextureCount);
  assertFingerprintCount("layerCount", metrics.layerCount);
  assertFingerprintCount("maskDepth", metrics.maskDepth);
  assertFingerprintCount("filterNodeCount", metrics.filterNodeCount);
  assertFingerprintNonNegative("maxFilterRadius", metrics.maxFilterRadius);
  assertFingerprintRange("visibleBoundsRatio", metrics.visibleBoundsRatio, 0, 1);
  assertFingerprintNonNegative("animationRate", metrics.animationRate);
  assertFingerprintNonNegative("expectedOverdraw", metrics.expectedOverdraw);
}

export function computeSceneFingerprint(
  scene: SceneIR,
  v12Metrics?: SceneFingerprintV12Metrics,
): SceneFingerprint {
  if (v12Metrics) validateSceneFingerprintV12Metrics(v12Metrics);
  let nodeCount = 0;
  let pathCount = 0;
  let pathSegmentCount = 0;
  let lineSegmentCount = 0;
  let curveSegmentCount = 0;
  let quadraticSegmentCount = 0;
  let cubicSegmentCount = 0;
  let closeCount = 0;
  let maxPathSegmentCount = 0;
  let strokeCount = 0;
  let fillCount = 0;
  let evenOddFillCount = 0;
  let gradientCount = 0;
  let linearGradientCount = 0;
  let radialGradientCount = 0;
  let sweepGradientCount = 0;
  let gradientStopCount = 0;
  let blendLayerCount = 0;
  let nonOpaqueNodeCount = 0;
  let groupDepth = 0;
  let maxGroupChildCount = 0;
  let clipPathCount = 0;
  let clipPathSegmentCount = 0;
  let textCount = 0;
  let textCodePointCount = 0;

  const countPath = (node: Extract<SceneNodeIR, { kind: "fill-path" | "stroke-path" }>): void => {
    let nodeSegments = 0;
    for (const verb of node.path.verbs) {
      switch (verb.v) {
        case "L":
          lineSegmentCount += 1;
          pathSegmentCount += 1;
          nodeSegments += 1;
          break;
        case "Q":
          quadraticSegmentCount += 1;
          curveSegmentCount += 1;
          pathSegmentCount += 1;
          nodeSegments += 1;
          break;
        case "C":
          cubicSegmentCount += 1;
          curveSegmentCount += 1;
          pathSegmentCount += 1;
          nodeSegments += 1;
          break;
        case "Z":
          closeCount += 1;
          break;
        case "M":
          break;
      }
    }
    maxPathSegmentCount = Math.max(maxPathSegmentCount, nodeSegments);
  };

  const countClipPath = (node: Extract<SceneNodeIR, { kind: "group" }>): void => {
    if (!node.clip) return;
    clipPathCount += 1;
    for (const verb of node.clip.verbs) {
      if (verb.v === "L" || verb.v === "Q" || verb.v === "C") {
        clipPathSegmentCount += 1;
      }
    }
  };

  const visit = (nodes: SceneNodeIR[], depth: number): void => {
    for (const node of nodes) {
      nodeCount += 1;
      if (node.blend !== "src-over") blendLayerCount += 1;
      if (node.opacity < 1) nonOpaqueNodeCount += 1;
      switch (node.kind) {
        case "fill-path":
        case "stroke-path": {
          pathCount += 1;
          if (node.kind === "stroke-path") strokeCount += 1;
          else {
            fillCount += 1;
            if (node.fillRule === "evenodd") evenOddFillCount += 1;
          }
          countPath(node);
          if (node.paint.kind !== "solid") {
            gradientCount += 1;
            gradientStopCount += node.paint.stops.length;
            if (node.paint.kind === "linear-gradient") linearGradientCount += 1;
            if (node.paint.kind === "radial-gradient") radialGradientCount += 1;
            if (node.paint.kind === "sweep-gradient") sweepGradientCount += 1;
          }
          break;
        }
        case "text":
          textCount += 1;
          textCodePointCount += Array.from(node.text).length;
          break;
        case "group":
          groupDepth = Math.max(groupDepth, depth + 1);
          maxGroupChildCount = Math.max(maxGroupChildCount, node.children.length);
          countClipPath(node);
          visit(node.children, depth + 1);
          break;
      }
    }
  };
  visit(scene.nodes, 0);

  const canvasArea = scene.width * scene.height;
  const bucketParts = [
    v12Metrics ? "v3" : "v2",
    `a${pow2Bucket(canvasArea)}`,
    `w${pow2Bucket(scene.width)}`,
    `h${pow2Bucket(scene.height)}`,
    `n${pow2Bucket(nodeCount)}`,
    `s${pow2Bucket(pathSegmentCount)}`,
    `l${pow2Bucket(lineSegmentCount)}`,
    `c${pow2Bucket(curveSegmentCount)}`,
    `x${pow2Bucket(clipPathSegmentCount)}`,
    `g${pow2Bucket(gradientCount)}`,
    `p${pow2Bucket(gradientStopCount)}`,
    `b${pow2Bucket(blendLayerCount)}`,
    `o${pow2Bucket(nonOpaqueNodeCount)}`,
    `t${pow2Bucket(textCount)}`,
    `u${pow2Bucket(textCodePointCount)}`,
    `d${groupDepth}`,
  ];
  if (v12Metrics) {
    bucketParts.push(
      `cp${quantizeUnitRatioBucket(v12Metrics.changedPathRatio)}`,
      `gl${pow2Bucket(v12Metrics.glyphCount)}`,
      `uf${pow2Bucket(v12Metrics.uniqueFontCount)}`,
      `im${pow2Bucket(v12Metrics.imageCount)}`,
      `xt${pow2Bucket(v12Metrics.externalTextureCount)}`,
      `ly${pow2Bucket(v12Metrics.layerCount)}`,
      `md${pow2Bucket(v12Metrics.maskDepth)}`,
      `fn${pow2Bucket(v12Metrics.filterNodeCount)}`,
      `fr${pow2Bucket(v12Metrics.maxFilterRadius)}`,
      `vb${quantizeUnitRatioBucket(v12Metrics.visibleBoundsRatio)}`,
      `ar${quantizeFixedBucket(v12Metrics.animationRate, 10)}`,
      `od${quantizeFixedBucket(v12Metrics.expectedOverdraw, 4)}`,
    );
  }
  const bucket = bucketParts.join("|");

  return {
    fingerprintVersion: v12Metrics ? 3 : 2,
    canvasWidth: scene.width,
    canvasHeight: scene.height,
    nodeCount,
    pathCount,
    pathSegmentCount,
    lineSegmentCount,
    curveSegmentCount,
    quadraticSegmentCount,
    cubicSegmentCount,
    closeCount,
    maxPathSegmentCount,
    strokeCount,
    fillCount,
    evenOddFillCount,
    gradientCount,
    linearGradientCount,
    radialGradientCount,
    sweepGradientCount,
    gradientStopCount,
    blendLayerCount,
    nonOpaqueNodeCount,
    groupDepth,
    maxGroupChildCount,
    clipPathCount,
    clipPathSegmentCount,
    textCount,
    textCodePointCount,
    changedPathRatio: v12Metrics?.changedPathRatio ?? null,
    glyphCount: v12Metrics?.glyphCount ?? null,
    uniqueFontCount: v12Metrics?.uniqueFontCount ?? null,
    imageCount: v12Metrics?.imageCount ?? null,
    externalTextureCount: v12Metrics?.externalTextureCount ?? null,
    layerCount: v12Metrics?.layerCount ?? null,
    maskDepth: v12Metrics?.maskDepth ?? null,
    filterNodeCount: v12Metrics?.filterNodeCount ?? null,
    maxFilterRadius: v12Metrics?.maxFilterRadius ?? null,
    visibleBoundsRatio: v12Metrics?.visibleBoundsRatio ?? null,
    animationRate: v12Metrics?.animationRate ?? null,
    expectedOverdraw: v12Metrics?.expectedOverdraw ?? null,
    canvasArea,
    bucket,
  };
}

/* ------------------------------------------------------------------ */
/* §5.2 DeviceWorkloadProfile                                          */
/* ------------------------------------------------------------------ */

export interface DeviceWorkloadProfile {
  /** Stable hash of device/browser identity (winner cache partition key). */
  deviceHash: string;
  gpu: boolean;
  /** Hash of the engine build set, so upgrades invalidate stale conclusions. */
  engineHash: string;
  /**
   * Opt in to the explicit partition schema. Omitted profiles retain the V12
   * legacy `deviceHash` partition so existing persisted winner keys still load.
   */
  profileVersion?: 1 | 2;
  runtime?: "browser-main" | "browser-worker" | "node" | "native" | null;
  workload?: "interactive" | "preview" | "final" | "shadow" | null;
  browserEngine?: string | null;
  browserVersion?: string | null;
  operatingSystem?: string | null;
  architecture?: string | null;
  logicalCpuCount?: number | null;
  deviceMemoryGiB?: number | null;
  gpuBackend?: "none" | "webgpu" | "webgl2" | "metal" | "vulkan" | "dx12" | "other" | null;
  gpuVendor?: string | null;
  gpuArchitecture?: string | null;
  maxTextureDimension2D?: number | null;
  devicePixelRatio?: number | null;
  colorSpace?: string | null;
  powerPreference?: "low-power" | "high-performance" | "default" | null;
  /** Hash of the complete shader package; required by the V12 v2 partition. */
  shaderPackageHash?: string | null;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
  qualityProfile?: string | null;
}

function assertProfileText(label: string, value: string): void {
  if (value.trim().length === 0) {
    throw new RangeError(`${label} must be non-empty`);
  }
}

function assertOptionalPositive(label: string, value: number | null | undefined): void {
  if (value === null || value === undefined) return;
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a finite positive number, got ${value}`);
  }
}

function assertRequiredPositive(label: string, value: number | null | undefined): number {
  assertOptionalPositive(label, value);
  if (value === null || value === undefined) {
    throw new RangeError(`${label} is required by DeviceWorkloadProfile v2`);
  }
  return value;
}

function assertRequiredPositiveInteger(
  label: string,
  value: number | null | undefined,
): number {
  const resolved = assertRequiredPositive(label, value);
  if (!Number.isSafeInteger(resolved)) {
    throw new RangeError(`${label} must be a positive safe integer, got ${resolved}`);
  }
  return resolved;
}

function assertRequiredProfileText(
  label: string,
  value: string | null | undefined,
): string {
  if (value === null || value === undefined) {
    throw new RangeError(`${label} is required by DeviceWorkloadProfile v2`);
  }
  assertProfileText(label, value);
  return value;
}

function encodePartitionValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "?";
  return encodeURIComponent(String(value));
}

/**
 * Stable device/browser/engine/workload partition. Unknown traits remain `?`;
 * values are never guessed from unrelated signals. Legacy profiles deliberately
 * resolve to `deviceHash` so the existing cache and SQLite rows remain valid.
 */
export function deviceWorkloadPartitionKey(profile: DeviceWorkloadProfile): string {
  assertProfileText("deviceHash", profile.deviceHash);
  assertProfileText("engineHash", profile.engineHash);
  const hasV2Traits =
    profile.shaderPackageHash !== undefined ||
    profile.viewportWidth !== undefined ||
    profile.viewportHeight !== undefined ||
    profile.qualityProfile !== undefined;
  if (profile.profileVersion === undefined) {
    if (hasV2Traits) {
      throw new RangeError(`V12 shader/viewport/quality traits require profileVersion 2`);
    }
    return profile.deviceHash;
  }
  if (profile.profileVersion !== 1 && profile.profileVersion !== 2) {
    throw new RangeError(`unsupported DeviceWorkloadProfile version ${String(profile.profileVersion)}`);
  }
  assertOptionalPositive("logicalCpuCount", profile.logicalCpuCount);
  assertOptionalPositive("deviceMemoryGiB", profile.deviceMemoryGiB);
  assertOptionalPositive("maxTextureDimension2D", profile.maxTextureDimension2D);
  assertOptionalPositive("devicePixelRatio", profile.devicePixelRatio);
  const traits: Array<[string, string | number | boolean | null | undefined]> = [
    ["v", profile.profileVersion],
    ["device", profile.deviceHash],
    ["engine", profile.engineHash],
    ["gpu", profile.gpu],
    ["runtime", profile.runtime],
    ["workload", profile.workload],
    ["browser", profile.browserEngine],
    ["browserVersion", profile.browserVersion],
    ["os", profile.operatingSystem],
    ["arch", profile.architecture],
    ["cpu", profile.logicalCpuCount],
    ["memoryGiB", profile.deviceMemoryGiB],
    ["gpuBackend", profile.gpuBackend],
    ["gpuVendor", profile.gpuVendor],
    ["gpuArchitecture", profile.gpuArchitecture],
    ["maxTexture2D", profile.maxTextureDimension2D],
    ["dpr", profile.devicePixelRatio],
    ["colorSpace", profile.colorSpace],
    ["power", profile.powerPreference],
  ];
  if (profile.profileVersion === 2) {
    traits.push(
      ["shader", assertRequiredProfileText("shaderPackageHash", profile.shaderPackageHash)],
      ["viewportWidth", assertRequiredPositiveInteger("viewportWidth", profile.viewportWidth)],
      ["viewportHeight", assertRequiredPositiveInteger("viewportHeight", profile.viewportHeight)],
      ["quality", assertRequiredProfileText("qualityProfile", profile.qualityProfile)],
    );
  } else if (hasV2Traits) {
    throw new RangeError(`V12 shader/viewport/quality traits require profileVersion 2`);
  }
  return traits.map(([label, value]) => `${label}=${encodePartitionValue(value)}`).join("|");
}

/* ------------------------------------------------------------------ */
/* §5.3 ProviderCostModel — measured timings only, no fabrication      */
/* ------------------------------------------------------------------ */

export interface CostSample {
  coldMs?: number;
  warmMs?: number;
  cpuPreparationMs?: number;
  gpuPassMs?: number;
  memory?: MemoryObservation;
}

export interface MemoryObservation {
  peakCpuBytes?: number;
  peakGpuBytes?: number;
  peakWasmBytes?: number;
  peakTextureBytes?: number;
  peakBufferBytes?: number;
  atlasOccupancyPct?: number;
  atlasFragmentationPct?: number;
}

export interface MeasuredPercentiles {
  p50: number;
  p95: number;
  p99: number;
  samples: number;
}

export interface ProviderCostEvidence {
  warmMs: MeasuredPercentiles | null;
  coldMs: MeasuredPercentiles | null;
  cpuPreparationMs: MeasuredPercentiles | null;
  gpuPassMs: MeasuredPercentiles | null;
  memory: {
    peakCpuBytes: MeasuredPercentiles | null;
    peakGpuBytes: MeasuredPercentiles | null;
    peakWasmBytes: MeasuredPercentiles | null;
    peakTextureBytes: MeasuredPercentiles | null;
    peakBufferBytes: MeasuredPercentiles | null;
    atlasOccupancyPct: MeasuredPercentiles | null;
    atlasFragmentationPct: MeasuredPercentiles | null;
  };
  /** Number of accepted `record` calls, independent of axes present per call. */
  observations: number;
}

export interface CostEstimate {
  /** Median of measured warm renders, or null when none were measured. */
  warmP50Ms: number | null;
  /** Median of measured cold renders, or null when none were measured. */
  coldP50Ms: number | null;
  samples: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid] ?? 0;
  if (sorted.length % 2 === 1) return upper;
  return ((sorted[mid - 1] ?? 0) + upper) / 2;
}

function nearestRank(values: number[], percentile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1);
  return sorted[index] ?? null;
}

function measuredPercentiles(values: number[]): MeasuredPercentiles | null {
  const p50 = median(values);
  const p95 = nearestRank(values, 95);
  const p99 = nearestRank(values, 99);
  if (p50 === null || p95 === null || p99 === null) return null;
  return { p50, p95, p99, samples: values.length };
}

function assertValidMs(label: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative number, got ${value}`);
  }
}

function assertValidBytes(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer, got ${value}`);
  }
}

function assertValidPct(label: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new RangeError(`${label} must be within [0, 100], got ${value}`);
  }
}

type MemoryAxis = keyof MemoryObservation;

const MEMORY_AXES = [
  "peakCpuBytes",
  "peakGpuBytes",
  "peakWasmBytes",
  "peakTextureBytes",
  "peakBufferBytes",
  "atlasOccupancyPct",
  "atlasFragmentationPct",
] as const satisfies readonly MemoryAxis[];

interface ProviderCostEntry {
  cold: number[];
  warm: number[];
  cpuPreparation: number[];
  gpuPass: number[];
  memory: Record<MemoryAxis, number[]>;
  observations: number;
}

function createCostEntry(): ProviderCostEntry {
  return {
    cold: [],
    warm: [],
    cpuPreparation: [],
    gpuPass: [],
    memory: {
      peakCpuBytes: [],
      peakGpuBytes: [],
      peakWasmBytes: [],
      peakTextureBytes: [],
      peakBufferBytes: [],
      atlasOccupancyPct: [],
      atlasFragmentationPct: [],
    },
    observations: 0,
  };
}

type CostPartition = DeviceWorkloadProfile | string | undefined;

function costPartitionKey(partition: CostPartition): string {
  if (partition === undefined) return "";
  if (typeof partition === "string") return partition;
  return partition.profileVersion === undefined ? "" : deviceWorkloadPartitionKey(partition);
}

export class ProviderCostModel {
  private readonly samples = new Map<string, ProviderCostEntry>();

  private static key(providerId: string, bucket: string, partition?: CostPartition): string {
    const suffix = costPartitionKey(partition);
    return suffix.length === 0
      ? `${providerId}::${bucket}`
      : `${providerId}::${bucket}::${suffix}`;
  }

  record(
    providerId: string,
    bucket: string,
    sample: CostSample,
    partition?: CostPartition,
  ): void {
    const timingValues = [
      ["coldMs", sample.coldMs],
      ["warmMs", sample.warmMs],
      ["cpuPreparationMs", sample.cpuPreparationMs],
      ["gpuPassMs", sample.gpuPassMs],
    ] as const;
    const memoryValues = MEMORY_AXES.flatMap((axis) => {
      const value = sample.memory?.[axis];
      return value === undefined ? [] : [[axis, value] as const];
    });
    if (timingValues.every(([, value]) => value === undefined) && memoryValues.length === 0) {
      throw new RangeError("cost sample must carry at least one measured observation");
    }
    for (const [label, value] of timingValues) {
      if (value !== undefined) assertValidMs(label, value);
    }
    for (const [axis, value] of memoryValues) {
      if (axis === "atlasOccupancyPct" || axis === "atlasFragmentationPct") {
        assertValidPct(axis, value);
      } else {
        assertValidBytes(axis, value);
      }
    }

    const key = ProviderCostModel.key(providerId, bucket, partition);
    const entry = this.samples.get(key) ?? createCostEntry();
    if (sample.coldMs !== undefined) entry.cold.push(sample.coldMs);
    if (sample.warmMs !== undefined) entry.warm.push(sample.warmMs);
    if (sample.cpuPreparationMs !== undefined) {
      entry.cpuPreparation.push(sample.cpuPreparationMs);
    }
    if (sample.gpuPassMs !== undefined) entry.gpuPass.push(sample.gpuPassMs);
    for (const [axis, value] of memoryValues) entry.memory[axis].push(value);
    entry.observations += 1;
    this.samples.set(key, entry);
  }

  /** Returns null when nothing was measured — estimates are never invented. */
  estimate(
    providerId: string,
    bucket: string,
    partition?: CostPartition,
  ): CostEstimate | null {
    const entry = this.samples.get(ProviderCostModel.key(providerId, bucket, partition));
    if (!entry) return null;
    const samples = entry.cold.length + entry.warm.length;
    if (samples === 0) return null;
    return {
      warmP50Ms: median(entry.warm),
      coldP50Ms: median(entry.cold),
      samples,
    };
  }

  /** Full measured evidence. Every unobserved axis is explicitly `null`. */
  evidence(
    providerId: string,
    bucket: string,
    partition?: CostPartition,
  ): ProviderCostEvidence | null {
    const entry = this.samples.get(ProviderCostModel.key(providerId, bucket, partition));
    if (!entry) return null;
    return {
      warmMs: measuredPercentiles(entry.warm),
      coldMs: measuredPercentiles(entry.cold),
      cpuPreparationMs: measuredPercentiles(entry.cpuPreparation),
      gpuPassMs: measuredPercentiles(entry.gpuPass),
      memory: {
        peakCpuBytes: measuredPercentiles(entry.memory.peakCpuBytes),
        peakGpuBytes: measuredPercentiles(entry.memory.peakGpuBytes),
        peakWasmBytes: measuredPercentiles(entry.memory.peakWasmBytes),
        peakTextureBytes: measuredPercentiles(entry.memory.peakTextureBytes),
        peakBufferBytes: measuredPercentiles(entry.memory.peakBufferBytes),
        atlasOccupancyPct: measuredPercentiles(entry.memory.atlasOccupancyPct),
        atlasFragmentationPct: measuredPercentiles(entry.memory.atlasFragmentationPct),
      },
      observations: entry.observations,
    };
  }

  sampleCount(providerId: string, bucket: string, partition?: CostPartition): number {
    const entry = this.samples.get(ProviderCostModel.key(providerId, bucket, partition));
    return entry ? entry.cold.length + entry.warm.length : 0;
  }


  observationCount(providerId: string, bucket: string, partition?: CostPartition): number {
    return this.samples.get(ProviderCostModel.key(providerId, bucket, partition))?.observations ?? 0;
  }
}

/* ------------------------------------------------------------------ */
/* §5.4 WinnerCache                                                    */
/* ------------------------------------------------------------------ */

export interface WinnerCacheEntry {
  providerId: string;
  expectedWarmMs: number;
  /** Cost-model sample count for the winner at decision time (audit trail). */
  decidedAtSample: number;
}

export class WinnerCache {
  private readonly entries = new Map<string, WinnerCacheEntry>();

  private static key(
    bucket: string,
    device: string | DeviceWorkloadProfile,
  ): string {
    const partition = typeof device === "string" ? device : deviceWorkloadPartitionKey(device);
    return `${bucket}::${partition}`;
  }

  get(
    bucket: string,
    device: string | DeviceWorkloadProfile,
  ): WinnerCacheEntry | null {
    return this.entries.get(WinnerCache.key(bucket, device)) ?? null;
  }

  set(
    bucket: string,
    device: string | DeviceWorkloadProfile,
    entry: WinnerCacheEntry,
  ): void {
    this.entries.set(WinnerCache.key(bucket, device), entry);
  }

  delete(bucket: string, device: string | DeviceWorkloadProfile): boolean {
    return this.entries.delete(WinnerCache.key(bucket, device));
  }

  /** Drops every cached decision won by `providerId` (kill-switch cleanup). */
  evictProvider(providerId: string): number {
    let evicted = 0;
    for (const [key, entry] of this.entries) {
      if (entry.providerId === providerId) {
        this.entries.delete(key);
        evicted += 1;
      }
    }
    return evicted;
  }

  get size(): number {
    return this.entries.size;
  }
}

/* ------------------------------------------------------------------ */
/* §5.5 HysteresisPolicy — gain + frame/scene/texture boundary gates   */
/* ------------------------------------------------------------------ */

export const DEFAULT_HYSTERESIS_MIN_GAIN_PCT = 12;
export const DEFAULT_HYSTERESIS_MIN_OBSERVED_FRAMES = 120;

export type SwitchHoldReason =
  | "pen-down"
  | "no-gain"
  | "below-hysteresis-threshold"
  | "eligibility-evidence-missing"
  | "different-texture-boundary"
  | "insufficient-observed-frames-or-scene-boundary"
  | "gain-above-threshold";

export interface SwitchDecision {
  allow: boolean;
  expectedGainPct: number;
  reason: SwitchHoldReason;
}

export interface HysteresisPerformanceInput {
  incumbentWarmMs: number;
  challengerWarmMs: number;
  penDown: boolean;
}

export interface HysteresisSwitchEligibility {
  /** Frames observed since the incumbent became primary for this scene bucket. */
  observedFrames: number;
  /** True only at an explicit scene/island ownership boundary. */
  sceneBoundary: boolean;
  /** Both providers consume and produce the same texture boundary contract. */
  sameTextureBoundary: boolean;
}

export interface HysteresisPolicyOptions {
  minObservedFrames?: number;
}

export class HysteresisPolicy {
  readonly minObservedFrames: number;

  constructor(
    readonly minGainPct: number = DEFAULT_HYSTERESIS_MIN_GAIN_PCT,
    options: HysteresisPolicyOptions = {},
  ) {
    if (!Number.isFinite(minGainPct) || minGainPct <= 0) {
      throw new RangeError(`minGainPct must be positive, got ${minGainPct}`);
    }
    this.minObservedFrames =
      options.minObservedFrames ?? DEFAULT_HYSTERESIS_MIN_OBSERVED_FRAMES;
    if (!Number.isSafeInteger(this.minObservedFrames) || this.minObservedFrames <= 0) {
      throw new RangeError(
        `minObservedFrames must be a positive safe integer, got ${this.minObservedFrames}`,
      );
    }
  }

  private performanceDecision(input: HysteresisPerformanceInput): SwitchDecision | null {
    if (!Number.isFinite(input.incumbentWarmMs) || input.incumbentWarmMs <= 0) {
      throw new RangeError(
        `incumbentWarmMs must be a finite positive number, got ${input.incumbentWarmMs}`,
      );
    }
    if (!Number.isFinite(input.challengerWarmMs) || input.challengerWarmMs < 0) {
      throw new RangeError(
        `challengerWarmMs must be a finite non-negative number, got ${input.challengerWarmMs}`,
      );
    }
    const expectedGainPct =
      ((input.incumbentWarmMs - input.challengerWarmMs) / input.incumbentWarmMs) * 100;
    // Pen-down is the absolute first blocker, independent of timing evidence.
    if (input.penDown) {
      return { allow: false, expectedGainPct, reason: "pen-down" };
    }
    if (expectedGainPct <= 0) {
      return { allow: false, expectedGainPct, reason: "no-gain" };
    }
    if (expectedGainPct < this.minGainPct) {
      return { allow: false, expectedGainPct, reason: "below-hysteresis-threshold" };
    }
    return null;
  }

  /**
   * Full V12 switch contract. A challenger may switch after 120 observed
   * frames OR at an explicit scene boundary, and only across an equivalent
   * texture boundary. Missing evidence fails closed.
   */
  evaluateV12(
    input: HysteresisPerformanceInput & Partial<HysteresisSwitchEligibility>,
  ): SwitchDecision {
    const performance = this.performanceDecision(input);
    if (performance) return performance;
    const expectedGainPct =
      ((input.incumbentWarmMs - input.challengerWarmMs) / input.incumbentWarmMs) * 100;
    if (
      input.observedFrames === undefined ||
      input.sceneBoundary === undefined ||
      input.sameTextureBoundary === undefined
    ) {
      return { allow: false, expectedGainPct, reason: "eligibility-evidence-missing" };
    }
    if (!Number.isSafeInteger(input.observedFrames) || input.observedFrames < 0) {
      throw new RangeError(
        `observedFrames must be a non-negative safe integer, got ${input.observedFrames}`,
      );
    }
    if (typeof input.sceneBoundary !== "boolean") {
      throw new TypeError(`sceneBoundary must be boolean`);
    }
    if (typeof input.sameTextureBoundary !== "boolean") {
      throw new TypeError(`sameTextureBoundary must be boolean`);
    }
    if (!input.sameTextureBoundary) {
      return { allow: false, expectedGainPct, reason: "different-texture-boundary" };
    }
    if (input.observedFrames < this.minObservedFrames && !input.sceneBoundary) {
      return {
        allow: false,
        expectedGainPct,
        reason: "insufficient-observed-frames-or-scene-boundary",
      };
    }
    return { allow: true, expectedGainPct, reason: "gain-above-threshold" };
  }

  /**
   * Explicit compatibility override for bounded corpora and deterministic
   * microbenchmarks that do not own a 120-frame lifecycle or texture surface.
   * Production callers should use evaluateV12.
   */
  evaluateBounded(input: HysteresisPerformanceInput): SwitchDecision {
    const performance = this.performanceDecision(input);
    if (performance) return performance;
    const expectedGainPct =
      ((input.incumbentWarmMs - input.challengerWarmMs) / input.incumbentWarmMs) * 100;
    return { allow: true, expectedGainPct, reason: "gain-above-threshold" };
  }

  /** @deprecated Use evaluateV12 in product code or evaluateBounded in bounded tests. */
  evaluate(input: HysteresisPerformanceInput): SwitchDecision {
    return this.evaluateBounded(input);
  }
}

/* ------------------------------------------------------------------ */
/* §5.6 VisualEquivalenceGate                                          */
/* ------------------------------------------------------------------ */

export interface VisualGateResult {
  pass: boolean;
  mismatchPct: number;
}

export type VisualEquivalenceGate = (
  candidatePixels: Uint8Array,
  referencePixels: Uint8Array,
  width: number,
  height: number,
) => VisualGateResult;

export const DEFAULT_GATE_FUZZY_DELTA = 48;
export const DEFAULT_GATE_MISMATCH_PCT = 0.5;

/**
 * Same algorithm as tests/visual/cross-renderer-diff.test.ts: a pixel matches
 * if any pixel of the other image within Chebyshev radius 1 agrees within
 * `fuzzyDelta` per channel, checked in both directions so extra ink and
 * missing ink both fail. AA phase shifts pass; structural divergence trips.
 */
function directionalMismatches(
  from: Uint8Array,
  to: Uint8Array,
  width: number,
  height: number,
  fuzzyDelta: number,
): number {
  let mismatches = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const base = (y * width + x) * 4;
      let matched = false;
      for (let dy = -1; dy <= 1 && !matched; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1 && !matched; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const other = (ny * width + nx) * 4;
          let channelMax = 0;
          for (let c = 0; c < 4; c += 1) {
            const delta = Math.abs((from[base + c] ?? 0) - (to[other + c] ?? 0));
            if (delta > channelMax) channelMax = delta;
          }
          if (channelMax <= fuzzyDelta) matched = true;
        }
      }
      if (!matched) mismatches += 1;
    }
  }
  return mismatches;
}

export function createFuzzyNeighborhoodGate(options?: {
  fuzzyDelta?: number;
  mismatchPctGate?: number;
}): VisualEquivalenceGate {
  const fuzzyDelta = options?.fuzzyDelta ?? DEFAULT_GATE_FUZZY_DELTA;
  const mismatchPctGate = options?.mismatchPctGate ?? DEFAULT_GATE_MISMATCH_PCT;
  return (candidatePixels, referencePixels, width, height) => {
    const expected = width * height * 4;
    if (candidatePixels.length !== expected || referencePixels.length !== expected) {
      throw new Error(
        `pixel buffer size mismatch: expected ${expected}, got candidate=${candidatePixels.length} reference=${referencePixels.length}`,
      );
    }
    const worst = Math.max(
      directionalMismatches(candidatePixels, referencePixels, width, height, fuzzyDelta),
      directionalMismatches(referencePixels, candidatePixels, width, height, fuzzyDelta),
    );
    const mismatchPct = (worst / (width * height)) * 100;
    return { pass: mismatchPct <= mismatchPctGate, mismatchPct };
  };
}

/* ------------------------------------------------------------------ */
/* §5.7 ShadowRenderer orchestration — production output untouchable   */
/* ------------------------------------------------------------------ */

export interface ShadowComparisonReport {
  /** Gate verdict when the shadow render completed, null on shadow failure. */
  gate: VisualGateResult | null;
  /** Shadow failure message — surfaced, never swallowed silently. */
  error: string | null;
}

export interface ShadowComparisonOptions {
  winnerRender: () => Uint8Array | Promise<Uint8Array>;
  shadowRender: () => Uint8Array | Promise<Uint8Array>;
  gate: VisualEquivalenceGate;
  width: number;
  height: number;
  onReport: (report: ShadowComparisonReport) => void;
  /** Optional evidence sink for automatic shadow-failure quarantine. */
  quarantine?: ProviderQuarantineRegistry;
  shadowProviderId?: string;
}

/**
 * Returns the winner's pixels untouched (production contract). The shadow
 * render and comparison run asynchronously and report only via `onReport`;
 * shadow exceptions become `report.error` and can never affect the winner.
 */
export async function runShadowComparison(
  options: ShadowComparisonOptions,
): Promise<Uint8Array> {
  const winnerPixels = await options.winnerRender();
  void (async () => {
    let report: ShadowComparisonReport;
    try {
      const shadowPixels = await options.shadowRender();
      report = {
        gate: options.gate(shadowPixels, winnerPixels, options.width, options.height),
        error: null,
      };
    } catch (error) {
      report = {
        gate: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    if (options.quarantine && options.shadowProviderId) {
      try {
        options.quarantine.recordShadowReport(options.shadowProviderId, report);
      } catch {
        // Health telemetry must never be able to alter production output.
      }
    }
    try {
      options.onReport(report);
    } catch {
      // A throwing report sink must not surface as an unhandled rejection —
      // the production-unaffected contract outranks observer hygiene.
    }
  })();
  return winnerPixels;
}

/* ------------------------------------------------------------------ */
/* §5.7.1 Deterministic shadow sampling policy                         */
/* ------------------------------------------------------------------ */

export type ShadowSamplingChannel = "development" | "canary" | "general";

export interface ShadowSamplingPolicy {
  minProbability: number;
  defaultProbability: number;
  maxProbability: number;
  requiresIdle: boolean;
  requiresUserOptIn: boolean;
}

export const SHADOW_SAMPLING_POLICIES: Readonly<
  Record<ShadowSamplingChannel, Readonly<ShadowSamplingPolicy>>
> = Object.freeze({
  development: Object.freeze({
    minProbability: 0.1,
    defaultProbability: 0.1,
    maxProbability: 1,
    requiresIdle: false,
    requiresUserOptIn: false,
  }),
  canary: Object.freeze({
    minProbability: 0.05,
    defaultProbability: 0.05,
    maxProbability: 0.05,
    requiresIdle: false,
    requiresUserOptIn: false,
  }),
  general: Object.freeze({
    minProbability: 0.001,
    defaultProbability: 0.001,
    maxProbability: 0.01,
    requiresIdle: true,
    requiresUserOptIn: true,
  }),
});

export interface ShadowSamplingRequest {
  channel: ShadowSamplingChannel;
  /** Stable scene/provider/frame identity. The same key always returns the same decision. */
  sampleKey: string;
  probability?: number;
  idle?: boolean;
  userOptIn?: boolean;
}

/** Deterministic FNV-1a projection into the half-open unit interval [0, 1). */
export function shadowSamplingUnitInterval(sampleKey: string): number {
  assertProfileText("sampleKey", sampleKey);
  let hash = 0x811c9dc5;
  for (let index = 0; index < sampleKey.length; index += 1) {
    const codeUnit = sampleKey.charCodeAt(index);
    hash ^= codeUnit & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= codeUnit >>> 8;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash / 0x1_0000_0000;
}

export function shouldSampleShadowRender(request: ShadowSamplingRequest): boolean {
  const policy = SHADOW_SAMPLING_POLICIES[request.channel];
  if (!policy) {
    throw new RangeError(`unknown shadow sampling channel ${String(request.channel)}`);
  }
  const probability = request.probability ?? policy.defaultProbability;
  if (
    !Number.isFinite(probability) ||
    probability < policy.minProbability ||
    probability > policy.maxProbability
  ) {
    throw new RangeError(
      `${request.channel} shadow probability must be within [${policy.minProbability}, ${policy.maxProbability}], got ${probability}`,
    );
  }
  if (policy.requiresIdle && request.idle !== true) return false;
  if (policy.requiresUserOptIn && request.userOptIn !== true) return false;
  return shadowSamplingUnitInterval(`${request.channel}:${request.sampleKey}`) < probability;
}

/* ------------------------------------------------------------------ */
/* §5.8 PromotionRegistry + RemoteKillSwitch                           */
/* ------------------------------------------------------------------ */

export interface PromotionEvidence {
  /** Visual equivalence gate passed against the reference renderer. */
  visualGate: boolean;
  /** Measured expected gain (percent) that beat the hysteresis threshold. */
  hysteresisGain: number;
  /** Shadow soak completed without divergence or errors. */
  soakPassed: boolean;
}

export type PromotionOutcome =
  | { promoted: true }
  | { promoted: false; reasons: string[] };

export class PromotionRegistry {
  private readonly promoted = new Map<string, PromotionEvidence>();

  constructor(readonly minGainPct: number = DEFAULT_HYSTERESIS_MIN_GAIN_PCT) {}

  promote(providerId: string, evidence: PromotionEvidence): PromotionOutcome {
    const reasons: string[] = [];
    if (!evidence.visualGate) {
      reasons.push("visual equivalence gate not passed");
    }
    if (!Number.isFinite(evidence.hysteresisGain) || evidence.hysteresisGain < this.minGainPct) {
      reasons.push(
        `hysteresis gain ${evidence.hysteresisGain}% is below the required ${this.minGainPct}%`,
      );
    }
    if (!evidence.soakPassed) {
      reasons.push("shadow soak not passed");
    }
    if (reasons.length > 0) {
      return { promoted: false, reasons };
    }
    this.promoted.set(providerId, evidence);
    return { promoted: true };
  }

  isPromoted(providerId: string): boolean {
    return this.promoted.has(providerId);
  }

  evidenceFor(providerId: string): PromotionEvidence | null {
    return this.promoted.get(providerId) ?? null;
  }

  demote(providerId: string): boolean {
    return this.promoted.delete(providerId);
  }
}

export interface ProviderQuarantinePolicy {
  visualFailureThreshold: number;
  shadowFailureThreshold: number;
  revivalVisualPasses: number;
  revivalShadowPasses: number;
}

export const DEFAULT_PROVIDER_QUARANTINE_POLICY: Readonly<ProviderQuarantinePolicy> =
  Object.freeze({
    // A visual mismatch is a correctness blocker, not a performance warning.
    visualFailureThreshold: 1,
    shadowFailureThreshold: 3,
    revivalVisualPasses: 3,
    revivalShadowPasses: 3,
  });

export interface ProviderHealthSnapshot {
  providerId: string;
  visualPasses: number;
  visualFailures: number;
  consecutiveVisualFailures: number;
  shadowPasses: number;
  shadowFailures: number;
  consecutiveShadowFailures: number;
  /** Passing observations recorded after the current quarantine began. */
  recoveryVisualPasses: number;
  recoveryShadowPasses: number;
  quarantined: boolean;
  quarantineReason: string | null;
  /** Monotonic token that prevents evidence from an older quarantine being reused. */
  quarantineEpoch: number;
}

export interface QuarantineRevivalEvidence {
  quarantineEpoch: number;
  visualPasses: number;
  shadowPasses: number;
  soakPassed: boolean;
}

export type QuarantineRevivalOutcome =
  | { revived: true }
  | { revived: false; reasons: string[] };

type MutableProviderHealth = ProviderHealthSnapshot;

function assertPositiveInteger(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer, got ${value}`);
  }
}

function createProviderHealth(providerId: string): MutableProviderHealth {
  return {
    providerId,
    visualPasses: 0,
    visualFailures: 0,
    consecutiveVisualFailures: 0,
    shadowPasses: 0,
    shadowFailures: 0,
    consecutiveShadowFailures: 0,
    recoveryVisualPasses: 0,
    recoveryShadowPasses: 0,
    quarantined: false,
    quarantineReason: null,
    quarantineEpoch: 0,
  };
}

function assertVisualGateResult(result: VisualGateResult): void {
  if (
    typeof result.pass !== "boolean" ||
    !Number.isFinite(result.mismatchPct) ||
    result.mismatchPct < 0 ||
    result.mismatchPct > 100
  ) {
    throw new RangeError(`visual gate result must carry pass:boolean and mismatchPct within [0, 100]`);
  }
}

/**
 * Evidence-only automatic quarantine. Failures accumulate deterministically;
 * passes reset consecutive counters but never auto-revive a quarantined
 * provider. Revival requires post-quarantine evidence and a pen-up boundary.
 */
export class ProviderQuarantineRegistry {
  readonly policy: Readonly<ProviderQuarantinePolicy>;
  private readonly health = new Map<string, MutableProviderHealth>();

  constructor(policy: Partial<ProviderQuarantinePolicy> = {}) {
    this.policy = Object.freeze({ ...DEFAULT_PROVIDER_QUARANTINE_POLICY, ...policy });
    assertPositiveInteger("visualFailureThreshold", this.policy.visualFailureThreshold);
    assertPositiveInteger("shadowFailureThreshold", this.policy.shadowFailureThreshold);
    assertPositiveInteger("revivalVisualPasses", this.policy.revivalVisualPasses);
    assertPositiveInteger("revivalShadowPasses", this.policy.revivalShadowPasses);
  }

  private state(providerId: string): MutableProviderHealth {
    const existing = this.health.get(providerId);
    if (existing) return existing;
    const created = createProviderHealth(providerId);
    this.health.set(providerId, created);
    return created;
  }

  private quarantine(state: MutableProviderHealth, reason: string): void {
    if (state.quarantined) return;
    state.quarantined = true;
    state.quarantineReason = reason;
    state.quarantineEpoch += 1;
    state.recoveryVisualPasses = 0;
    state.recoveryShadowPasses = 0;
  }

  /** Immediately quarantines a provider after one verified correctness failure. */
  recordCorrectnessFailure(providerId: string, detail: string): ProviderHealthSnapshot {
    assertProfileText("providerId", providerId);
    assertProfileText("correctness failure detail", detail);
    const state = this.state(providerId);
    state.visualFailures += 1;
    state.consecutiveVisualFailures += 1;
    this.quarantine(state, `correctness blocker: ${detail}`);
    return { ...state };
  }

  recordVisualGate(providerId: string, result: VisualGateResult): ProviderHealthSnapshot {
    assertProfileText("providerId", providerId);
    assertVisualGateResult(result);
    const state = this.state(providerId);
    if (result.pass) {
      state.visualPasses += 1;
      state.consecutiveVisualFailures = 0;
      if (state.quarantined) state.recoveryVisualPasses += 1;
    } else {
      state.visualFailures += 1;
      state.consecutiveVisualFailures += 1;
      if (state.consecutiveVisualFailures >= this.policy.visualFailureThreshold) {
        this.quarantine(
          state,
          `correctness blocker: visual gate failed ${state.consecutiveVisualFailures} consecutive times`,
        );
      }
    }
    return { ...state };
  }

  recordShadowReport(
    providerId: string,
    report: ShadowComparisonReport,
  ): ProviderHealthSnapshot {
    assertProfileText("providerId", providerId);
    if (report.gate) assertVisualGateResult(report.gate);
    const state = this.state(providerId);
    const passed = report.error === null && report.gate?.pass === true;
    if (passed) {
      state.shadowPasses += 1;
      state.consecutiveShadowFailures = 0;
      if (state.quarantined) state.recoveryShadowPasses += 1;
    } else {
      state.shadowFailures += 1;
      state.consecutiveShadowFailures += 1;
      // A completed visual comparison that diverges is one correctness
      // blocker and quarantines immediately. Runtime/performance failures may
      // retain the configured consecutive threshold.
      if (report.gate?.pass === false) {
        this.quarantine(
          state,
          `correctness blocker: shadow visual divergence (${report.gate.mismatchPct}%)`,
        );
      } else if (state.consecutiveShadowFailures >= this.policy.shadowFailureThreshold) {
        const detail = report.error ?? "visual divergence";
        this.quarantine(
          state,
          `shadow failed ${state.consecutiveShadowFailures} consecutive times: ${detail}`,
        );
      }
    }
    return { ...state };
  }

  isQuarantined(providerId: string): boolean {
    return this.health.get(providerId)?.quarantined ?? false;
  }

  reasonFor(providerId: string): string | null {
    return this.health.get(providerId)?.quarantineReason ?? null;
  }

  snapshot(providerId: string): ProviderHealthSnapshot | null {
    const state = this.health.get(providerId);
    return state ? { ...state } : null;
  }

  listQuarantined(): ProviderHealthSnapshot[] {
    return [...this.health.values()]
      .filter((state) => state.quarantined)
      .map((state) => ({ ...state }));
  }

  revive(
    providerId: string,
    evidence: QuarantineRevivalEvidence,
    options: { penDown?: boolean } = {},
  ): QuarantineRevivalOutcome {
    assertPositiveInteger("quarantineEpoch", evidence.quarantineEpoch);
    if (!Number.isSafeInteger(evidence.visualPasses) || evidence.visualPasses < 0) {
      throw new RangeError(`visualPasses must be a non-negative safe integer`);
    }
    if (!Number.isSafeInteger(evidence.shadowPasses) || evidence.shadowPasses < 0) {
      throw new RangeError(`shadowPasses must be a non-negative safe integer`);
    }
    const state = this.health.get(providerId);
    const reasons: string[] = [];
    if (!state?.quarantined) reasons.push("provider is not quarantined");
    if (options.penDown) reasons.push("revival is forbidden while pen-down");
    if (state && evidence.quarantineEpoch !== state.quarantineEpoch) {
      reasons.push(
        `quarantine epoch ${evidence.quarantineEpoch} does not match ${state.quarantineEpoch}`,
      );
    }
    if (state && evidence.visualPasses !== state.recoveryVisualPasses) {
      reasons.push(
        `visual evidence ${evidence.visualPasses} does not match ${state.recoveryVisualPasses} recorded post-quarantine passes`,
      );
    }
    if (state && evidence.shadowPasses !== state.recoveryShadowPasses) {
      reasons.push(
        `shadow evidence ${evidence.shadowPasses} does not match ${state.recoveryShadowPasses} recorded post-quarantine passes`,
      );
    }
    if (evidence.visualPasses < this.policy.revivalVisualPasses) {
      reasons.push(
        `visual passes ${evidence.visualPasses} below ${this.policy.revivalVisualPasses}`,
      );
    }
    if (evidence.shadowPasses < this.policy.revivalShadowPasses) {
      reasons.push(
        `shadow passes ${evidence.shadowPasses} below ${this.policy.revivalShadowPasses}`,
      );
    }
    if (!evidence.soakPassed) reasons.push("post-quarantine soak not passed");
    if (reasons.length > 0 || !state) return { revived: false, reasons };
    state.quarantined = false;
    state.quarantineReason = null;
    state.consecutiveVisualFailures = 0;
    state.consecutiveShadowFailures = 0;
    state.recoveryVisualPasses = 0;
    state.recoveryShadowPasses = 0;
    return { revived: true };
  }
}

export class RemoteKillSwitch {
  private readonly killed = new Map<string, string>();

  kill(providerId: string, reason: string): void {
    this.killed.set(providerId, reason);
  }

  revive(providerId: string, options: { penDown?: boolean } = {}): boolean {
    if (options.penDown) return false;
    return this.killed.delete(providerId);
  }

  isKilled(providerId: string): boolean {
    return this.killed.has(providerId);
  }

  reasonFor(providerId: string): string | null {
    return this.killed.get(providerId) ?? null;
  }

  listKilled(): Array<{ providerId: string; reason: string }> {
    return [...this.killed.entries()].map(([providerId, reason]) => ({
      providerId,
      reason,
    }));
  }
}

/* ------------------------------------------------------------------ */
/* §5.9 runTournament                                                  */
/* ------------------------------------------------------------------ */

export interface TournamentCandidate {
  providerId: string;
  render: () => Uint8Array;
}

/** `switched` means the evidence cache changed; no renderer is switched here. */
export type TournamentDecision = "cached" | "cold-race" | "hysteresis-hold" | "switched";

export interface RaceTiming {
  providerId: string;
  warmMs: number;
  gate: VisualGateResult | null;
}

export interface TournamentStats {
  fingerprint: SceneFingerprint;
  bucket: string;
  excludedByKillSwitch: string[];
  excludedByQuarantine: string[];
  /** Non-empty only on cold races (cached decisions never re-render). */
  raceTimings: RaceTiming[];
  /** Candidates disqualified by the visual equivalence gate this run. */
  gateFailures: string[];
  challengerId: string | null;
  expectedGainPct: number | null;
}

export interface TournamentRequest {
  scene: SceneIR;
  profile: DeviceWorkloadProfile;
  candidates: TournamentCandidate[];
  costModel: ProviderCostModel;
  winnerCache: WinnerCache;
  killSwitch: RemoteKillSwitch;
  quarantine?: ProviderQuarantineRegistry;
  /** Optional visual gate; requires `referenceRender` to take effect. */
  gate?: VisualEquivalenceGate;
  referenceRender?: () => Uint8Array;
  penDown?: boolean;
  hysteresis?: HysteresisPolicy;
  /**
   * Enables the full V12 120-frame/scene-boundary/texture-boundary gate.
   * Omission preserves the bounded-corpus behavior of pre-contract callers.
   */
  switchEligibility?: HysteresisSwitchEligibility;
  /** Explicit legacy/test escape hatch for corpora without a frame lifecycle. */
  boundedImmediateSwitchEvaluation?: boolean;
  /** Clock injection for deterministic measurement in tests. */
  now?: () => number;
}

export interface TournamentResult {
  winnerId: string;
  decision: TournamentDecision;
  stats: TournamentStats;
}

export class TournamentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TournamentError";
  }
}

function runColdRace(
  request: TournamentRequest,
  eligible: TournamentCandidate[],
  fingerprint: SceneFingerprint,
  excludedByKillSwitch: string[],
  excludedByQuarantine: string[],
  now: () => number,
): TournamentResult {
  const { bucket } = fingerprint;
  const referencePixels =
    request.gate && request.referenceRender ? request.referenceRender() : null;
  const raceTimings: RaceTiming[] = [];
  const gateFailures: string[] = [];
  let winner: { providerId: string; warmMs: number } | null = null;

  for (const candidate of eligible) {
    const start = now();
    const pixels = candidate.render();
    const warmMs = Math.max(0, now() - start);
    // Measurements accumulate whether or not the candidate wins — the cached
    // path later compares challengers using exactly these real samples.
    request.costModel.record(candidate.providerId, bucket, { warmMs }, request.profile);
    let gateResult: VisualGateResult | null = null;
    if (referencePixels && request.gate) {
      gateResult = request.gate(
        pixels,
        referencePixels,
        request.scene.width,
        request.scene.height,
      );
      request.quarantine?.recordVisualGate(candidate.providerId, gateResult);
    }
    raceTimings.push({ providerId: candidate.providerId, warmMs, gate: gateResult });
    if (gateResult && !gateResult.pass) {
      gateFailures.push(candidate.providerId);
      continue;
    }
    if (!winner || warmMs < winner.warmMs) {
      winner = { providerId: candidate.providerId, warmMs };
    }
  }

  if (!winner) {
    throw new TournamentError(
      `bucket ${bucket}: every candidate failed the visual equivalence gate [${gateFailures.join(", ")}]`,
    );
  }

  request.winnerCache.set(bucket, request.profile, {
    providerId: winner.providerId,
    expectedWarmMs: winner.warmMs,
    decidedAtSample: request.costModel.sampleCount(
      winner.providerId,
      bucket,
      request.profile,
    ),
  });

  return {
    winnerId: winner.providerId,
    decision: "cold-race",
    stats: {
      fingerprint,
      bucket,
      excludedByKillSwitch,
      excludedByQuarantine,
      raceTimings,
      gateFailures,
      challengerId: null,
      expectedGainPct: null,
    },
  };
}

/**
 * Runs a synchronous evidence tournament. The returned winner is advisory and
 * must never replace a selected provider for an operation already in flight.
 */
export function runTournament(request: TournamentRequest): TournamentResult {
  const penDown = request.penDown ?? false;
  const hysteresis = request.hysteresis ?? new HysteresisPolicy();
  const now = request.now ?? ((): number => performance.now());
  const fingerprint = computeSceneFingerprint(request.scene);
  const { bucket } = fingerprint;

  const excludedByKillSwitch = request.candidates
    .filter((candidate) => request.killSwitch.isKilled(candidate.providerId))
    .map((candidate) => candidate.providerId);
  const excludedByQuarantine = request.candidates
    .filter((candidate) => request.quarantine?.isQuarantined(candidate.providerId) === true)
    .map((candidate) => candidate.providerId);
  const eligible = request.candidates.filter(
    (candidate) =>
      !request.killSwitch.isKilled(candidate.providerId) &&
      request.quarantine?.isQuarantined(candidate.providerId) !== true,
  );
  if (eligible.length === 0) {
    throw new TournamentError(
      `bucket ${bucket}: no eligible candidates (kill switch removed [${excludedByKillSwitch.join(", ")}], quarantine removed [${excludedByQuarantine.join(", ")}])`,
    );
  }

  const cached = request.winnerCache.get(bucket, request.profile);
  const incumbent =
    cached && eligible.some((candidate) => candidate.providerId === cached.providerId)
      ? cached
      : null;

  // A remote kill, quarantine, or provider withdrawal cannot silently hand a
  // live stroke to a different primary surface owner. Fail closed and let the
  // caller retry at pen-up; neither exclusion mechanism is auto-revived here.
  if (penDown && cached && !incumbent) {
    throw new TournamentError(
      `bucket ${bucket}: primary provider ${cached.providerId} unavailable while pen-down; switch deferred until pen-up`,
    );
  }

  // No usable cached winner (first sight of this bucket/device, or the cached
  // winner was killed/withdrawn) → cold race with real measurements.
  if (!incumbent) {
    return runColdRace(
      request,
      eligible,
      fingerprint,
      excludedByKillSwitch,
      excludedByQuarantine,
      now,
    );
  }

  const baseStats: TournamentStats = {
    fingerprint,
    bucket,
    excludedByKillSwitch,
    excludedByQuarantine,
    raceTimings: [],
    gateFailures: [],
    challengerId: null,
    expectedGainPct: null,
  };

  // Challengers compete only with real accumulated measurements; a candidate
  // without samples in this bucket has no estimate and cannot challenge.
  const incumbentWarmMs =
    request.costModel.estimate(incumbent.providerId, bucket, request.profile)?.warmP50Ms ??
    incumbent.expectedWarmMs;
  let challenger: { providerId: string; warmMs: number } | null = null;
  for (const candidate of eligible) {
    if (candidate.providerId === incumbent.providerId) continue;
    const warmP50Ms = request.costModel.estimate(
      candidate.providerId,
      bucket,
      request.profile,
    )?.warmP50Ms;
    if (warmP50Ms === null || warmP50Ms === undefined) continue;
    if (!challenger || warmP50Ms < challenger.warmMs) {
      challenger = { providerId: candidate.providerId, warmMs: warmP50Ms };
    }
  }

  if (!challenger) {
    return { winnerId: incumbent.providerId, decision: "cached", stats: baseStats };
  }

  const performanceInput: HysteresisPerformanceInput = {
    incumbentWarmMs,
    challengerWarmMs: challenger.warmMs,
    penDown,
  };
  if (request.switchEligibility && request.boundedImmediateSwitchEvaluation) {
    throw new TournamentError(
      `switchEligibility and boundedImmediateSwitchEvaluation are mutually exclusive`,
    );
  }
  const decision = request.boundedImmediateSwitchEvaluation
    ? hysteresis.evaluateBounded(performanceInput)
    : hysteresis.evaluateV12({ ...performanceInput, ...request.switchEligibility });
  const stats: TournamentStats = {
    ...baseStats,
    challengerId: challenger.providerId,
    expectedGainPct: decision.expectedGainPct,
  };

  if (decision.allow) {
    request.winnerCache.set(bucket, request.profile, {
      providerId: challenger.providerId,
      expectedWarmMs: challenger.warmMs,
      decidedAtSample: request.costModel.sampleCount(
        challenger.providerId,
        bucket,
        request.profile,
      ),
    });
    return { winnerId: challenger.providerId, decision: "switched", stats };
  }

  // Not switching. A challenger that is not actually faster is just the
  // cached steady state; a faster-but-held challenger is a hysteresis hold
  // (either <12% expected gain or pen-down).
  if (decision.reason === "no-gain") {
    return { winnerId: incumbent.providerId, decision: "cached", stats };
  }
  return { winnerId: incumbent.providerId, decision: "hysteresis-hold", stats };
}
