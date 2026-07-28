export const STUDIO_P5_BRUSH_GOLDEN_TECHNIQUES = Object.freeze([
  "flow-field",
  "hatch",
  "mass",
  "watercolor-fill",
  "flat-wash",
] as const);

export type StudioP5BrushGoldenTechnique =
  (typeof STUDIO_P5_BRUSH_GOLDEN_TECHNIQUES)[number];

const MAX_RASTER_DIMENSION = 8_192;
const MAX_RASTER_PIXELS = 33_554_432;
const COLOR_BUCKET_WORDS = 128;
const PAINTED_RGB_FLOOR = 248;
const PAINTED_OPAQUE_ALPHA_FLOOR = 250;
const TEXTURE_TRANSITION_DELTA = 8;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;

export interface StudioP5BrushGoldenFrameInput {
  readonly rgba: Uint8Array | Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export interface StudioP5BrushGoldenDeterminismEvidence {
  readonly firstPixelHash: string;
  readonly replayPixelHash: string;
  readonly independentWorkerPixelHash: string;
  /** Byte equality observed before the same-Worker artifacts were released. */
  readonly exactPixelReplay: boolean;
}

export interface StudioP5BrushGoldenQualityPolicy {
  readonly technique: StudioP5BrushGoldenTechnique;
  readonly minimumPaintedPixels: number;
  readonly minimumNonTransparentCoverage: number;
  readonly minimumPaintedCoverage: number;
  readonly maximumPaintedCoverage: number;
  readonly minimumBoundsCanvasCoverage: number;
  readonly minimumBoundsOccupancy: number;
  readonly maximumBoundsOccupancy: number;
  readonly minimumColorBucketCount: number;
  readonly minimumAlphaBucketCount: number;
  readonly minimumLuminanceStandardDeviation: number;
  readonly minimumNeighborLinkRatio: number;
  readonly minimumEdgeDensity: number;
  readonly minimumTextureScore: number;
}

const COMMON_POLICY = Object.freeze({
  minimumNonTransparentCoverage: 0.001,
  maximumPaintedCoverage: 0.95,
  minimumBoundsOccupancy: 0.002,
  minimumColorBucketCount: 2,
  minimumAlphaBucketCount: 1,
  minimumLuminanceStandardDeviation: 0.4,
  minimumNeighborLinkRatio: 0.1,
  minimumEdgeDensity: 0.002,
  minimumTextureScore: 0.004,
});

/**
 * Broad renderer-quality floors, intentionally not exact image goldens.
 *
 * Exact bytes still have to replay within one Worker and across a fresh Worker,
 * while these metrics detect empty, flooded, flat, disconnected, or collapsed
 * output without pinning one browser/GPU-specific SHA as the only valid image.
 */
export const STUDIO_P5_BRUSH_GOLDEN_QUALITY_POLICIES: Readonly<
  Record<StudioP5BrushGoldenTechnique, StudioP5BrushGoldenQualityPolicy>
> = Object.freeze({
  "flow-field": Object.freeze({
    ...COMMON_POLICY,
    technique: "flow-field",
    minimumPaintedPixels: 64,
    minimumPaintedCoverage: 0.001,
    maximumPaintedCoverage: 0.3,
    minimumBoundsCanvasCoverage: 0.02,
    maximumBoundsOccupancy: 0.95,
  }),
  hatch: Object.freeze({
    ...COMMON_POLICY,
    technique: "hatch",
    minimumPaintedPixels: 256,
    minimumPaintedCoverage: 0.005,
    maximumPaintedCoverage: 0.75,
    minimumBoundsCanvasCoverage: 0.08,
    maximumBoundsOccupancy: 0.95,
    minimumNeighborLinkRatio: 0.14,
  }),
  mass: Object.freeze({
    ...COMMON_POLICY,
    technique: "mass",
    minimumPaintedPixels: 512,
    minimumPaintedCoverage: 0.03,
    minimumBoundsCanvasCoverage: 0.12,
    minimumBoundsOccupancy: 0.02,
    maximumBoundsOccupancy: 0.985,
    minimumNeighborLinkRatio: 0.2,
  }),
  "watercolor-fill": Object.freeze({
    ...COMMON_POLICY,
    technique: "watercolor-fill",
    minimumPaintedPixels: 512,
    minimumPaintedCoverage: 0.03,
    maximumPaintedCoverage: 0.9,
    minimumBoundsCanvasCoverage: 0.12,
    minimumBoundsOccupancy: 0.02,
    maximumBoundsOccupancy: 0.985,
    minimumColorBucketCount: 3,
    minimumNeighborLinkRatio: 0.2,
    minimumTextureScore: 0.008,
  }),
  "flat-wash": Object.freeze({
    ...COMMON_POLICY,
    technique: "flat-wash",
    minimumPaintedPixels: 512,
    minimumPaintedCoverage: 0.03,
    maximumPaintedCoverage: 0.85,
    minimumBoundsCanvasCoverage: 0.12,
    minimumBoundsOccupancy: 0.2,
    maximumBoundsOccupancy: 1,
    minimumColorBucketCount: 1,
    minimumLuminanceStandardDeviation: 0,
    minimumNeighborLinkRatio: 0.4,
    minimumTextureScore: 0,
  }),
});

export interface StudioP5BrushGoldenPaintedBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
  readonly area: number;
}

export interface StudioP5BrushGoldenFrameMetrics {
  readonly totalPixels: number;
  readonly nonTransparentPixels: number;
  readonly nonTransparentCoverage: number;
  readonly paintedPixels: number;
  readonly paintedCoverage: number;
  readonly paintedBounds: StudioP5BrushGoldenPaintedBounds | null;
  /** Painted bounding-box area divided by the full raster area. */
  readonly boundsCanvasCoverage: number;
  /** Painted pixels divided by their bounding-box area. */
  readonly boundsOccupancy: number;
  /** Fixed 4-bit RGB buckets; bounded to 4,096 without a per-pixel Set. */
  readonly colorBucketCount: number;
  /** Fixed 4-bit alpha buckets; bounded to 16. */
  readonly alphaBucketCount: number;
  readonly luminanceStandardDeviation: number;
  readonly alphaStandardDeviation: number;
  /** Painted left/up neighbor links per painted pixel, clamped to 0..1. */
  readonly neighborLinkRatio: number;
  /** Painted/unpainted four-neighbor boundary edges divided by 4 × painted pixels. */
  readonly edgeDensity: number;
  readonly paintedNeighborPairs: number;
  readonly toneTransitionRate: number;
  readonly meanNeighborToneDelta: number;
  /**
   * Interior tone variation only. Silhouette edges do not make a flat block
   * look textured, so the score combines neighboring tone transitions and
   * their normalized magnitude.
   */
  readonly textureScore: number;
  /**
   * Temporary memory allocated by the analyzer. It is O(width), never
   * O(width × height), and excludes the caller-owned RGBA input.
   */
  readonly scratchByteLength: number;
}

export type StudioP5BrushGoldenQualityFindingCode =
  | "invalid-policy"
  | "invalid-raster-dimensions"
  | "rgba-byte-length-mismatch"
  | "no-non-transparent-pixels"
  | "insufficient-painted-pixels"
  | "painted-coverage-too-low"
  | "painted-coverage-too-high"
  | "painted-bounds-missing"
  | "bounds-canvas-coverage-too-low"
  | "bounds-occupancy-too-low"
  | "bounds-occupancy-too-high"
  | "insufficient-color-diversity"
  | "insufficient-alpha-diversity"
  | "insufficient-luminance-variation"
  | "insufficient-connectivity"
  | "insufficient-edge-structure"
  | "insufficient-texture"
  | "invalid-determinism-evidence"
  | "same-worker-replay-mismatch"
  | "independent-worker-replay-mismatch";

export interface StudioP5BrushGoldenQualityFinding {
  readonly code: StudioP5BrushGoldenQualityFindingCode;
  readonly message: string;
}

export interface StudioP5BrushGoldenDeterminismMetrics {
  readonly hashesWellFormed: boolean;
  readonly exactPixelReplay: boolean;
  readonly sameWorkerHashEqual: boolean;
  readonly independentWorkerHashEqual: boolean;
}

export interface StudioP5BrushGoldenQualityResult {
  readonly ok: boolean;
  readonly technique: StudioP5BrushGoldenTechnique;
  readonly metrics: StudioP5BrushGoldenFrameMetrics | null;
  readonly determinism: StudioP5BrushGoldenDeterminismMetrics;
  readonly findings: readonly StudioP5BrushGoldenQualityFinding[];
}

type FrameAnalysis =
  | Readonly<{
      ok: true;
      metrics: StudioP5BrushGoldenFrameMetrics;
    }>
  | Readonly<{
      ok: false;
      finding: StudioP5BrushGoldenQualityFinding;
    }>;

function finding(
  code: StudioP5BrushGoldenQualityFindingCode,
  message: string,
): StudioP5BrushGoldenQualityFinding {
  return Object.freeze({ code, message });
}

function isRatio(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function policyIsValid(policy: StudioP5BrushGoldenQualityPolicy): boolean {
  return (
    STUDIO_P5_BRUSH_GOLDEN_TECHNIQUES.includes(policy.technique)
    && Number.isSafeInteger(policy.minimumPaintedPixels)
    && policy.minimumPaintedPixels >= 0
    && isRatio(policy.minimumNonTransparentCoverage)
    && isRatio(policy.minimumPaintedCoverage)
    && isRatio(policy.maximumPaintedCoverage)
    && policy.minimumPaintedCoverage <= policy.maximumPaintedCoverage
    && isRatio(policy.minimumBoundsCanvasCoverage)
    && isRatio(policy.minimumBoundsOccupancy)
    && isRatio(policy.maximumBoundsOccupancy)
    && policy.minimumBoundsOccupancy <= policy.maximumBoundsOccupancy
    && Number.isSafeInteger(policy.minimumColorBucketCount)
    && policy.minimumColorBucketCount >= 1
    && policy.minimumColorBucketCount <= 4_096
    && Number.isSafeInteger(policy.minimumAlphaBucketCount)
    && policy.minimumAlphaBucketCount >= 1
    && policy.minimumAlphaBucketCount <= 16
    && Number.isFinite(policy.minimumLuminanceStandardDeviation)
    && policy.minimumLuminanceStandardDeviation >= 0
    && isRatio(policy.minimumNeighborLinkRatio)
    && isRatio(policy.minimumEdgeDensity)
    && isRatio(policy.minimumTextureScore)
  );
}

function markColorBucket(
  buckets: Uint32Array,
  bucketIndex: number,
): boolean {
  const wordIndex = bucketIndex >>> 5;
  const mask = 1 << (bucketIndex & 31);
  const previous = buckets[wordIndex] ?? 0;
  if ((previous & mask) !== 0) return false;
  buckets[wordIndex] = previous | mask;
  return true;
}

function paintedPixel(
  red: number,
  green: number,
  blue: number,
  alpha: number,
): boolean {
  return (
    alpha > 0
    && (
      alpha < PAINTED_OPAQUE_ALPHA_FLOOR
      || red < PAINTED_RGB_FLOOR
      || green < PAINTED_RGB_FLOOR
      || blue < PAINTED_RGB_FLOOR
    )
  );
}

function luminance(red: number, green: number, blue: number): number {
  return (77 * red + 150 * green + 29 * blue) >>> 8;
}

function finiteRatio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function analyzeFrame(
  input: StudioP5BrushGoldenFrameInput,
): FrameAnalysis {
  const { width, height, rgba } = input;
  if (
    !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width <= 0
    || height <= 0
    || width > MAX_RASTER_DIMENSION
    || height > MAX_RASTER_DIMENSION
  ) {
    return Object.freeze({
      ok: false,
      finding: finding(
        "invalid-raster-dimensions",
        `Raster dimensions must be safe positive integers no larger than `
          + `${MAX_RASTER_DIMENSION}×${MAX_RASTER_DIMENSION}.`,
      ),
    });
  }
  const totalPixels = width * height;
  const expectedByteLength = totalPixels * 4;
  if (
    !Number.isSafeInteger(totalPixels)
    || totalPixels > MAX_RASTER_PIXELS
  ) {
    return Object.freeze({
      ok: false,
      finding: finding(
        "invalid-raster-dimensions",
        `Raster pixel count ${String(totalPixels)} exceeds the bounded `
          + `${String(MAX_RASTER_PIXELS)}-pixel quality-analysis budget.`,
      ),
    });
  }
  if (rgba.byteLength !== expectedByteLength) {
    return Object.freeze({
      ok: false,
      finding: finding(
        "rgba-byte-length-mismatch",
        `Expected ${String(expectedByteLength)} RGBA bytes for `
          + `${String(width)}×${String(height)}, received `
          + `${String(rgba.byteLength)}.`,
      ),
    });
  }

  // All scratch storage is proportional to one scanline plus fixed histograms.
  const previousPainted = new Uint8Array(width);
  const previousLuminance = new Uint8Array(width);
  const previousAlpha = new Uint8Array(width);
  const colorBuckets = new Uint32Array(COLOR_BUCKET_WORDS);
  const scratchByteLength =
    previousPainted.byteLength
    + previousLuminance.byteLength
    + previousAlpha.byteLength
    + colorBuckets.byteLength;

  let nonTransparentPixels = 0;
  let paintedPixels = 0;
  let leftBound = width;
  let topBound = height;
  let rightBound = -1;
  let bottomBound = -1;
  let colorBucketCount = 0;
  let alphaBucketMask = 0;
  let alphaBucketCount = 0;
  let luminanceMean = 0;
  let luminanceM2 = 0;
  let alphaMean = 0;
  let alphaM2 = 0;
  let neighborLinks = 0;
  let paintedNeighborPairs = 0;
  let toneTransitions = 0;
  let neighborToneDelta = 0;
  let boundaryEdges = 0;

  for (let y = 0; y < height; y += 1) {
    let leftIsPainted = false;
    let leftLuminance = 0;
    let leftAlpha = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const red = rgba[offset] ?? 0;
      const green = rgba[offset + 1] ?? 0;
      const blue = rgba[offset + 2] ?? 0;
      const alpha = rgba[offset + 3] ?? 0;
      if (alpha > 0) nonTransparentPixels += 1;

      const isPainted = paintedPixel(red, green, blue, alpha);
      const aboveIsPainted = previousPainted[x] === 1;
      if (x === 0) {
        if (isPainted) boundaryEdges += 1;
      } else if (isPainted !== leftIsPainted) {
        boundaryEdges += 1;
      }
      if (y === 0) {
        if (isPainted) boundaryEdges += 1;
      } else if (isPainted !== aboveIsPainted) {
        boundaryEdges += 1;
      }

      if (isPainted) {
        paintedPixels += 1;
        leftBound = Math.min(leftBound, x);
        topBound = Math.min(topBound, y);
        rightBound = Math.max(rightBound, x);
        bottomBound = Math.max(bottomBound, y);

        const colorBucket = (
          ((red >>> 4) << 8)
          | ((green >>> 4) << 4)
          | (blue >>> 4)
        );
        if (markColorBucket(colorBuckets, colorBucket)) {
          colorBucketCount += 1;
        }
        const alphaBucketBit = 1 << (alpha >>> 4);
        if ((alphaBucketMask & alphaBucketBit) === 0) {
          alphaBucketMask |= alphaBucketBit;
          alphaBucketCount += 1;
        }

        const pixelLuminance = luminance(red, green, blue);
        const luminanceDelta = pixelLuminance - luminanceMean;
        luminanceMean += luminanceDelta / paintedPixels;
        luminanceM2 += luminanceDelta * (pixelLuminance - luminanceMean);
        const alphaDelta = alpha - alphaMean;
        alphaMean += alphaDelta / paintedPixels;
        alphaM2 += alphaDelta * (alpha - alphaMean);

        if (leftIsPainted) {
          neighborLinks += 1;
          paintedNeighborPairs += 1;
          const toneDelta =
            Math.abs(pixelLuminance - leftLuminance)
            + Math.abs(alpha - leftAlpha);
          neighborToneDelta += toneDelta / 510;
          if (toneDelta >= TEXTURE_TRANSITION_DELTA) toneTransitions += 1;
        }
        if (aboveIsPainted) {
          neighborLinks += 1;
          paintedNeighborPairs += 1;
          const toneDelta =
            Math.abs(pixelLuminance - (previousLuminance[x] ?? 0))
            + Math.abs(alpha - (previousAlpha[x] ?? 0));
          neighborToneDelta += toneDelta / 510;
          if (toneDelta >= TEXTURE_TRANSITION_DELTA) toneTransitions += 1;
        }
        previousLuminance[x] = pixelLuminance;
        previousAlpha[x] = alpha;
        leftLuminance = pixelLuminance;
        leftAlpha = alpha;
      } else {
        previousLuminance[x] = 0;
        previousAlpha[x] = 0;
        leftLuminance = 0;
        leftAlpha = 0;
      }
      previousPainted[x] = isPainted ? 1 : 0;
      leftIsPainted = isPainted;
      if (x === width - 1 && isPainted) boundaryEdges += 1;
    }
  }
  for (let x = 0; x < width; x += 1) {
    if (previousPainted[x] === 1) boundaryEdges += 1;
  }

  const paintedBounds = paintedPixels > 0
    ? (() => {
        const boundsWidth = rightBound - leftBound + 1;
        const boundsHeight = bottomBound - topBound + 1;
        return Object.freeze({
          left: leftBound,
          top: topBound,
          right: rightBound,
          bottom: bottomBound,
          width: boundsWidth,
          height: boundsHeight,
          area: boundsWidth * boundsHeight,
        });
      })()
    : null;
  const toneTransitionRate = finiteRatio(
    toneTransitions,
    paintedNeighborPairs,
  );
  const meanNeighborToneDelta = finiteRatio(
    neighborToneDelta,
    paintedNeighborPairs,
  );
  const textureScore = Math.min(
    1,
    toneTransitionRate * 0.65 + meanNeighborToneDelta * 0.35,
  );
  const metrics: StudioP5BrushGoldenFrameMetrics = Object.freeze({
    totalPixels,
    nonTransparentPixels,
    nonTransparentCoverage: nonTransparentPixels / totalPixels,
    paintedPixels,
    paintedCoverage: paintedPixels / totalPixels,
    paintedBounds,
    boundsCanvasCoverage: paintedBounds
      ? paintedBounds.area / totalPixels
      : 0,
    boundsOccupancy: paintedBounds
      ? paintedPixels / paintedBounds.area
      : 0,
    colorBucketCount,
    alphaBucketCount,
    luminanceStandardDeviation: paintedPixels > 0
      ? Math.sqrt(luminanceM2 / paintedPixels)
      : 0,
    alphaStandardDeviation: paintedPixels > 0
      ? Math.sqrt(alphaM2 / paintedPixels)
      : 0,
    neighborLinkRatio: Math.min(
      1,
      finiteRatio(neighborLinks, paintedPixels),
    ),
    edgeDensity: finiteRatio(boundaryEdges, paintedPixels * 4),
    paintedNeighborPairs,
    toneTransitionRate,
    meanNeighborToneDelta,
    textureScore,
    scratchByteLength,
  });
  return Object.freeze({ ok: true, metrics });
}

function determinismMetrics(
  evidence: StudioP5BrushGoldenDeterminismEvidence,
): StudioP5BrushGoldenDeterminismMetrics {
  const hashesWellFormed = (
    SHA256_PATTERN.test(evidence.firstPixelHash)
    && SHA256_PATTERN.test(evidence.replayPixelHash)
    && SHA256_PATTERN.test(evidence.independentWorkerPixelHash)
  );
  return Object.freeze({
    hashesWellFormed,
    exactPixelReplay: evidence.exactPixelReplay === true,
    sameWorkerHashEqual: (
      hashesWellFormed
      && evidence.firstPixelHash === evidence.replayPixelHash
    ),
    independentWorkerHashEqual: (
      hashesWellFormed
      && evidence.firstPixelHash === evidence.independentWorkerPixelHash
    ),
  });
}

function pushMetricFindings(
  findings: StudioP5BrushGoldenQualityFinding[],
  policy: StudioP5BrushGoldenQualityPolicy,
  metrics: StudioP5BrushGoldenFrameMetrics,
): void {
  if (
    metrics.nonTransparentCoverage
      < policy.minimumNonTransparentCoverage
  ) {
    findings.push(finding(
      "no-non-transparent-pixels",
      `Non-transparent coverage ${metrics.nonTransparentCoverage.toFixed(6)} `
        + `is below ${policy.minimumNonTransparentCoverage.toFixed(6)}.`,
    ));
  }
  if (metrics.paintedPixels < policy.minimumPaintedPixels) {
    findings.push(finding(
      "insufficient-painted-pixels",
      `Painted pixel count ${String(metrics.paintedPixels)} is below `
        + `${String(policy.minimumPaintedPixels)}.`,
    ));
  }
  if (metrics.paintedCoverage < policy.minimumPaintedCoverage) {
    findings.push(finding(
      "painted-coverage-too-low",
      `Painted coverage ${metrics.paintedCoverage.toFixed(6)} is below `
        + `${policy.minimumPaintedCoverage.toFixed(6)}.`,
    ));
  }
  if (metrics.paintedCoverage > policy.maximumPaintedCoverage) {
    findings.push(finding(
      "painted-coverage-too-high",
      `Painted coverage ${metrics.paintedCoverage.toFixed(6)} exceeds `
        + `${policy.maximumPaintedCoverage.toFixed(6)}.`,
    ));
  }
  if (!metrics.paintedBounds) {
    findings.push(finding(
      "painted-bounds-missing",
      "No painted bounds could be measured from the RGBA frame.",
    ));
  } else {
    if (
      metrics.boundsCanvasCoverage
        < policy.minimumBoundsCanvasCoverage
    ) {
      findings.push(finding(
        "bounds-canvas-coverage-too-low",
        `Painted bounds cover ${metrics.boundsCanvasCoverage.toFixed(6)} `
          + `of the canvas, below `
          + `${policy.minimumBoundsCanvasCoverage.toFixed(6)}.`,
      ));
    }
    if (metrics.boundsOccupancy < policy.minimumBoundsOccupancy) {
      findings.push(finding(
        "bounds-occupancy-too-low",
        `Painted bounds occupancy ${metrics.boundsOccupancy.toFixed(6)} `
          + `is below ${policy.minimumBoundsOccupancy.toFixed(6)}.`,
      ));
    }
    if (metrics.boundsOccupancy > policy.maximumBoundsOccupancy) {
      findings.push(finding(
        "bounds-occupancy-too-high",
        `Painted bounds occupancy ${metrics.boundsOccupancy.toFixed(6)} `
          + `exceeds ${policy.maximumBoundsOccupancy.toFixed(6)}.`,
      ));
    }
  }
  if (metrics.colorBucketCount < policy.minimumColorBucketCount) {
    findings.push(finding(
      "insufficient-color-diversity",
      `Observed ${String(metrics.colorBucketCount)} quantized RGB buckets; `
        + `${String(policy.minimumColorBucketCount)} are required.`,
    ));
  }
  if (metrics.alphaBucketCount < policy.minimumAlphaBucketCount) {
    findings.push(finding(
      "insufficient-alpha-diversity",
      `Observed ${String(metrics.alphaBucketCount)} alpha buckets; `
        + `${String(policy.minimumAlphaBucketCount)} are required.`,
    ));
  }
  if (
    metrics.luminanceStandardDeviation
      < policy.minimumLuminanceStandardDeviation
  ) {
    findings.push(finding(
      "insufficient-luminance-variation",
      `Luminance deviation `
        + `${metrics.luminanceStandardDeviation.toFixed(6)} is below `
        + `${policy.minimumLuminanceStandardDeviation.toFixed(6)}.`,
    ));
  }
  if (metrics.neighborLinkRatio < policy.minimumNeighborLinkRatio) {
    findings.push(finding(
      "insufficient-connectivity",
      `Neighbor-link ratio ${metrics.neighborLinkRatio.toFixed(6)} is below `
        + `${policy.minimumNeighborLinkRatio.toFixed(6)}.`,
    ));
  }
  if (metrics.edgeDensity < policy.minimumEdgeDensity) {
    findings.push(finding(
      "insufficient-edge-structure",
      `Edge density ${metrics.edgeDensity.toFixed(6)} is below `
        + `${policy.minimumEdgeDensity.toFixed(6)}.`,
    ));
  }
  if (metrics.textureScore < policy.minimumTextureScore) {
    findings.push(finding(
      "insufficient-texture",
      `Interior texture score ${metrics.textureScore.toFixed(6)} is below `
        + `${policy.minimumTextureScore.toFixed(6)}.`,
    ));
  }
}

export function evaluateStudioP5BrushGoldenQuality(
  policy: StudioP5BrushGoldenQualityPolicy,
  frame: StudioP5BrushGoldenFrameInput,
  evidence: StudioP5BrushGoldenDeterminismEvidence,
): StudioP5BrushGoldenQualityResult {
  const findings: StudioP5BrushGoldenQualityFinding[] = [];
  const determinism = determinismMetrics(evidence);
  let metrics: StudioP5BrushGoldenFrameMetrics | null = null;

  if (!policyIsValid(policy)) {
    findings.push(finding(
      "invalid-policy",
      "The p5.brush golden-quality policy is malformed or contradictory.",
    ));
  } else {
    const analysis = analyzeFrame(frame);
    if (analysis.ok) {
      metrics = analysis.metrics;
      pushMetricFindings(findings, policy, metrics);
    } else {
      findings.push(analysis.finding);
    }
  }

  if (!determinism.hashesWellFormed) {
    findings.push(finding(
      "invalid-determinism-evidence",
      "All replay hashes must be lowercase sha256:<64 hex characters> values.",
    ));
  } else {
    if (
      !determinism.exactPixelReplay
      || !determinism.sameWorkerHashEqual
    ) {
      findings.push(finding(
        "same-worker-replay-mismatch",
        "The same Worker did not reproduce byte-identical seeded pixels.",
      ));
    }
    if (!determinism.independentWorkerHashEqual) {
      findings.push(finding(
        "independent-worker-replay-mismatch",
        "A fresh Worker did not reproduce the primary seeded pixel hash.",
      ));
    }
  }

  return Object.freeze({
    ok: findings.length === 0,
    technique: policy.technique,
    metrics,
    determinism,
    findings: Object.freeze(findings),
  });
}
