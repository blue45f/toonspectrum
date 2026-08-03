import type {
  StudioHokusaiNaturalMediaPresetId,
  StudioHokusaiNaturalMediaRenderPlan,
} from "./studio-hokusai-natural-media-contract";

export const STUDIO_HOKUSAI_NATURAL_MEDIA_TEXTURE_VERSION =
  "studio-hokusai-material-texture-v2" as const;

export const STUDIO_HOKUSAI_LOCAL_DIRECTION_INDEX_LIMITS = Object.freeze({
  maxRasterPixels: 4_194_304,
  maxSegments: 16_384,
  maxCellReferences: 65_536,
  maxCells: 16_384,
  maxCandidatesPerCell: 256,
} as const);

export interface StudioHokusaiNaturalMediaTextureMetrics {
  readonly version: typeof STUDIO_HOKUSAI_NATURAL_MEDIA_TEXTURE_VERSION;
  readonly presetId: StudioHokusaiNaturalMediaPresetId;
  readonly visiblePixels: number;
  readonly alphaChangedPixels: number;
  readonly colorChangedPixels: number;
  readonly dominantDirectionRadians: number;
  readonly directionIndexMode:
    | "not-applicable"
    | "local-grid"
    | "global-budget-fallback";
  readonly directionIndexSegments: number;
  readonly directionIndexCellReferences: number;
}

export interface StudioHokusaiNaturalMediaPixelLayout {
  /**
   * Raster-space rectangle represented by the tightly packed `pixels` buffer.
   * A full-frame caller uses `[0, 0, rasterWidth, rasterHeight]`; the Worker
   * uses the smaller Hokusai dirty rectangle.
   */
  readonly frameBounds: readonly [
    x: number,
    y: number,
    width: number,
    height: number,
  ];
  /** Raster-space rectangle that may be changed by this material pass. */
  readonly dirtyBounds: readonly [
    x: number,
    y: number,
    width: number,
    height: number,
  ];
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

/**
 * A stable integer hash. It is deliberately used as the control points of a
 * continuous value field, never as per-dab scatter.
 */
function hash01(coordinate: number, lane: number, seed: number): number {
  let value = (
    Math.imul(coordinate | 0, 0x45d9_f3b)
    ^ Math.imul(lane | 0, 0x27d4_eb2d)
    ^ (seed >>> 0)
  ) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb_352d) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x846c_a68b) >>> 0;
  value ^= value >>> 16;
  return (value >>> 0) / 0xffff_ffff;
}

function valueNoise1d(
  coordinate: number,
  lane: number,
  seed: number,
): number {
  const lower = Math.floor(coordinate);
  const fraction = coordinate - lower;
  const eased = fraction * fraction * (3 - 2 * fraction);
  return mix(
    hash01(lower, lane, seed),
    hash01(lower + 1, lane, seed),
    eased,
  );
}

function valueNoise2d(
  x: number,
  y: number,
  lane: number,
  seed: number,
): number {
  const lowerX = Math.floor(x);
  const lowerY = Math.floor(y);
  const fractionX = x - lowerX;
  const fractionY = y - lowerY;
  const easedX = fractionX * fractionX * (3 - 2 * fractionX);
  const easedY = fractionY * fractionY * (3 - 2 * fractionY);
  const rowStride = 0x1f12_3bb5;
  const top = mix(
    hash01(lowerX, lowerY + lane * rowStride, seed),
    hash01(lowerX + 1, lowerY + lane * rowStride, seed),
    easedX,
  );
  const bottom = mix(
    hash01(lowerX, lowerY + 1 + lane * rowStride, seed),
    hash01(lowerX + 1, lowerY + 1 + lane * rowStride, seed),
    easedX,
  );
  return mix(top, bottom, easedY);
}

function dominantStrokeDirection(
  samples: StudioHokusaiNaturalMediaRenderPlan["samples"],
): number {
  // Use doubled angles so a stroke travelling right-to-left has the same
  // bristle axis as one travelling left-to-right.
  let cosine = 0;
  let sine = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (!previous || !current) continue;
    const deltaX = current.x - previous.x;
    const deltaY = current.y - previous.y;
    const length = Math.hypot(deltaX, deltaY);
    if (length <= 0.001) continue;
    const angle = Math.atan2(deltaY, deltaX);
    cosine += Math.cos(angle * 2) * length;
    sine += Math.sin(angle * 2) * length;
  }
  return Math.abs(cosine) + Math.abs(sine) <= 0.000_001
    ? 0
    : canonicalAxisRadians(Math.atan2(sine, cosine) / 2);
}

function canonicalAxisRadians(angle: number): number {
  return ((angle % Math.PI) + Math.PI) % Math.PI;
}

interface StrokeSegment {
  readonly startX: number;
  readonly startY: number;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly lengthSquared: number;
  readonly axisRadians: number;
}

interface LocalStrokeDirectionResolver {
  readonly resolve: (x: number, y: number) => number;
  readonly mode: "local-grid" | "global-budget-fallback";
  readonly indexedSegments: number;
  readonly cellReferences: number;
}

function globalDirectionFallback(
  fallback: number,
  indexedSegments = 0,
  cellReferences = 0,
): LocalStrokeDirectionResolver {
  return {
    resolve: () => fallback,
    mode: "global-budget-fallback",
    indexedSegments,
    cellReferences,
  };
}

function localStrokeDirectionResolver(
  plan: StudioHokusaiNaturalMediaRenderPlan,
  fallback: number,
): LocalStrokeDirectionResolver {
  const limits = STUDIO_HOKUSAI_LOCAL_DIRECTION_INDEX_LIMITS;
  if (
    plan.raster.width * plan.raster.height > limits.maxRasterPixels
    || plan.samples.length - 1 > limits.maxSegments
  ) {
    return globalDirectionFallback(fallback);
  }
  const cellSize = Math.max(
    8,
    Math.min(64, plan.raster.radiusPixels * 1.5),
  );
  const columns = Math.max(1, Math.ceil(plan.raster.width / cellSize));
  const rows = Math.max(1, Math.ceil(plan.raster.height / cellSize));
  const influence = Math.max(12, plan.raster.radiusPixels * 4);
  const segments: StrokeSegment[] = [];
  const cells = new Map<number, number[]>();
  let cellReferences = 0;
  for (let index = 1; index < plan.samples.length; index += 1) {
    const previous = plan.samples[index - 1];
    const current = plan.samples[index];
    if (!previous || !current) continue;
    const deltaX = current.x - previous.x;
    const deltaY = current.y - previous.y;
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;
    if (lengthSquared <= 0.000_001) continue;
    const segmentIndex = segments.length;
    segments.push({
      startX: previous.x,
      startY: previous.y,
      deltaX,
      deltaY,
      lengthSquared,
      axisRadians: canonicalAxisRadians(Math.atan2(deltaY, deltaX)),
    });
    const minimumCellX = Math.max(
      0,
      Math.floor((Math.min(previous.x, current.x) - influence) / cellSize),
    );
    const maximumCellX = Math.min(
      columns - 1,
      Math.floor((Math.max(previous.x, current.x) + influence) / cellSize),
    );
    const minimumCellY = Math.max(
      0,
      Math.floor((Math.min(previous.y, current.y) - influence) / cellSize),
    );
    const maximumCellY = Math.min(
      rows - 1,
      Math.floor((Math.max(previous.y, current.y) + influence) / cellSize),
    );
    const segmentCellReferences =
      (maximumCellX - minimumCellX + 1)
      * (maximumCellY - minimumCellY + 1);
    if (
      segmentCellReferences <= 0
      || cellReferences + segmentCellReferences > limits.maxCellReferences
    ) {
      return globalDirectionFallback(
        fallback,
        segments.length,
        cellReferences,
      );
    }
    for (let cellY = minimumCellY; cellY <= maximumCellY; cellY += 1) {
      for (let cellX = minimumCellX; cellX <= maximumCellX; cellX += 1) {
        const key = cellY * columns + cellX;
        const bucket = cells.get(key);
        if (bucket) {
          if (bucket.length >= limits.maxCandidatesPerCell) {
            return globalDirectionFallback(
              fallback,
              segments.length,
              cellReferences,
            );
          }
          bucket.push(segmentIndex);
        } else {
          if (cells.size >= limits.maxCells) {
            return globalDirectionFallback(
              fallback,
              segments.length,
              cellReferences,
            );
          }
          cells.set(key, [segmentIndex]);
        }
        cellReferences += 1;
      }
    }
  }
  return {
    mode: "local-grid",
    indexedSegments: segments.length,
    cellReferences,
    resolve: (x, y) => {
      const cellX = Math.max(
        0,
        Math.min(columns - 1, Math.floor(x / cellSize)),
      );
      const cellY = Math.max(
        0,
        Math.min(rows - 1, Math.floor(y / cellSize)),
      );
      const candidates = cells.get(cellY * columns + cellX);
      if (!candidates || candidates.length === 0) return fallback;
      let bestDistanceSquared = Number.POSITIVE_INFINITY;
      let bestAngle = fallback;
      for (const segmentIndex of candidates) {
        const segment = segments[segmentIndex];
        if (!segment) continue;
        const relativeX = x - segment.startX;
        const relativeY = y - segment.startY;
        const station = Math.max(
          0,
          Math.min(
            1,
            (
              relativeX * segment.deltaX
              + relativeY * segment.deltaY
            ) / segment.lengthSquared,
          ),
        );
        const closestX = segment.startX + segment.deltaX * station;
        const closestY = segment.startY + segment.deltaY * station;
        const distanceSquared =
          (x - closestX) ** 2 + (y - closestY) ** 2;
        if (distanceSquared < bestDistanceSquared) {
          bestDistanceSquared = distanceSquared;
          bestAngle = segment.axisRadians;
        }
      }
      return bestAngle;
    },
  };
}

function pencilTexture(
  x: number,
  y: number,
  seed: number,
): Readonly<{ alpha: number; color: number; lift: number }> {
  // Low-frequency coordinate warping prevents independent fibre/tooth fields
  // from locking into a visible weave. The graphite fibre is itself a 2-D
  // anisotropic field rather than a 1-D stripe, so it stays irregular while
  // retaining a subtle paper direction at high zoom.
  const warpX = valueNoise2d(
    x * 0.018,
    y * 0.018,
    8,
    seed ^ 0x6ab3_91e5,
  );
  const warpY = valueNoise2d(
    x * -0.015 + y * 0.009,
    x * 0.009 + y * 0.015,
    9,
    seed ^ 0x381d_e72b,
  );
  const warpedX = x + (warpX - 0.5) * 5.2;
  const warpedY = y + (warpY - 0.5) * 5.2;
  const fibre = valueNoise2d(
    warpedX * 0.31 + warpedY * 0.08,
    warpedX * -0.014 + warpedY * 0.052,
    11,
    seed ^ 0x50a3_7e91,
  );
  const paper = valueNoise2d(
    warpedX * 0.44,
    warpedY * 0.44,
    12,
    seed ^ 0x8dc4_5a13,
  );
  const tooth = valueNoise2d(
    warpedX * -0.15 + warpedY * 0.12,
    warpedX * 0.12 + warpedY * 0.15,
    13,
    seed ^ 0x2f6e_2b1d,
  );
  const graphite = 0.34 * fibre + 0.39 * paper + 0.27 * tooth;
  return {
    alpha: 0.39 + graphite * 0.61,
    color: 0.69 + graphite * 0.41,
    lift: 0,
  };
}

function charcoalTexture(
  x: number,
  y: number,
  seed: number,
): Readonly<{ alpha: number; color: number; lift: number }> {
  // Warp the paper domain before sampling the pigment fields. Sampling a
  // coarse value-noise lattice directly made its square interpolation cells
  // readable at high zoom and amplified Hokusai's circular dab joints on long
  // strokes. The oblique, independently warped fields below remain continuous
  // in document coordinates, but no longer expose an axis-aligned cell grid.
  const domainWarp = valueNoise2d(
    x * 0.014 + y * 0.005,
    x * -0.005 + y * 0.014,
    19,
    seed ^ 0x4dc8_72a1,
  );
  const warpOffset = domainWarp - 0.5;
  // One shared low-frequency sample is deliberately projected on two
  // different axes. That keeps the live Worker pass bounded at four noise
  // samples per visible pixel while still breaking the square source lattice.
  const warpedX = x + warpOffset * 7.4;
  const warpedY = y - warpOffset * 5.6;
  const coarseA = valueNoise2d(
    warpedX * 0.077 + warpedY * 0.051,
    warpedX * -0.035 + warpedY * 0.083,
    21,
    seed ^ 0x1c35_7d9b,
  );
  const coarseB = valueNoise2d(
    warpedX * -0.049 + warpedY * 0.071,
    warpedX * 0.063 + warpedY * 0.044,
    22,
    seed ^ 0xa46f_28c7,
  );
  const fine = valueNoise2d(
    warpedX * 0.29 + warpedY * 0.17,
    warpedX * -0.14 + warpedY * 0.31,
    23,
    seed ^ 0x73bd_14e5,
  );
  const broadPigment = 0.56 * coarseA + 0.44 * coarseB;
  const carbonGrain = broadPigment * 0.78 + fine * 0.22;
  return {
    // Keep the material floor high enough that continuous source coverage is
    // never broken into a train of isolated circular stamps. Fine paper tooth
    // remains visible through colour variation instead of destructive holes.
    alpha: 0.38 + carbonGrain * 0.56,
    color: 0.61 + carbonGrain * 0.43,
    lift: 0,
  };
}

function oilTexture(
  x: number,
  y: number,
  seed: number,
  directionRadians: number,
): Readonly<{ alpha: number; color: number; lift: number }> {
  const tangentX = Math.cos(directionRadians);
  const tangentY = Math.sin(directionRadians);
  const normalX = -tangentY;
  const normalY = tangentX;
  const across = x * normalX + y * normalY;
  const along = x * tangentX + y * tangentY;
  // Long, coherent ridges vary mostly across the stroke. A much slower
  // along-stroke field prevents ruler-straight bands while keeping the bristle
  // direction readable through curves and at high zoom.
  const fineBristle = valueNoise1d(
    across * 1.15 + along * 0.018,
    31,
    seed ^ 0x9e57_41b3,
  );
  const broadBristle = valueNoise1d(
    across * 0.21 - along * 0.007,
    32,
    seed ^ 0x4b16_f2d9,
  );
  const ridge = 0.68 * fineBristle + 0.32 * broadBristle;
  return {
    alpha: 0.75 + ridge * 0.25,
    color: 0.69 + ridge * 0.45,
    lift: Math.max(0, ridge - 0.48) * 0.24,
  };
}

function materialCoverage(
  alpha: number,
  presetId: "pencil" | "charcoal" | "oil",
): number {
  const normalized = alpha / 255;
  // A monotonic contrast transfer suppresses Hokusai's low-alpha circular
  // halo without a blur/median pass. It keeps partial paper tooth inside the
  // body and cannot invert one-pass/retrace coverage ordering.
  switch (presetId) {
    case "pencil":
      // A sub-3px graphite stroke is dominated by antialias coverage rather
      // than a fully opaque core. A gamma below one raises those legitimate
      // edge/core samples without painting transparent pixels, so the same
      // material transfer remains deterministic for packed live patches and
      // the canonical crop. Larger pencils still saturate naturally.
      return Math.min(1, normalized ** 0.72 * 1.35);
    case "charcoal":
      // The previous super-linear curve suppressed antialiased overlap between
      // neighbouring Hokusai dabs much more than their centres. That converted
      // a continuous carrier into visible beads during a long stroke. A
      // monotonic sub-linear transfer lifts legitimate overlap coverage while
      // preserving pressure order and never painting transparent pixels.
      return Math.min(1, normalized ** 0.86 * 1.28);
    case "oil":
      return Math.min(1, normalized ** 1.18 * 1.28);
  }
}

/**
 * Applies a deterministic material transfer to Hokusai's transparent frame.
 *
 * The coverage curve is monotonic and every texture factor is positive; both
 * depend only on source alpha, document coordinates, preset and seed.
 * Therefore a retraced Hokusai stroke whose source alpha is non-decreasing
 * remains non-decreasing after this pass. The pass cannot punch a new
 * centreline hole and it never paints transparent pixels.
 */
export function applyStudioHokusaiNaturalMediaTextureV2(
  pixels: Uint8Array,
  plan: StudioHokusaiNaturalMediaRenderPlan,
  layout: StudioHokusaiNaturalMediaPixelLayout,
): StudioHokusaiNaturalMediaTextureMetrics {
  const [frameX, frameY, frameWidth, frameHeight] = layout.frameBounds;
  const [dirtyX, dirtyY, dirtyWidth, dirtyHeight] = layout.dirtyBounds;
  if (
    ![
      frameX,
      frameY,
      frameWidth,
      frameHeight,
      dirtyX,
      dirtyY,
      dirtyWidth,
      dirtyHeight,
    ].every(Number.isSafeInteger)
    || frameX < 0
    || frameY < 0
    || frameWidth <= 0
    || frameHeight <= 0
    || dirtyX < frameX
    || dirtyY < frameY
    || dirtyWidth <= 0
    || dirtyHeight <= 0
    || dirtyX + dirtyWidth > frameX + frameWidth
    || dirtyY + dirtyHeight > frameY + frameHeight
    || frameX + frameWidth > plan.raster.width
    || frameY + frameHeight > plan.raster.height
    || pixels.byteLength !== frameWidth * frameHeight * 4
  ) {
    throw new RangeError("Hokusai material texture pixel layout is invalid.");
  }
  const directionRadians = dominantStrokeDirection(plan.samples);
  if (
    plan.presetId !== "pencil"
    && plan.presetId !== "charcoal"
    && plan.presetId !== "oil"
  ) {
    let visiblePixels = 0;
    for (let y = dirtyY; y < dirtyY + dirtyHeight; y += 1) {
      let index = (
        (y - frameY) * frameWidth
        + dirtyX
        - frameX
      ) * 4 + 3;
      for (let x = 0; x < dirtyWidth; x += 1, index += 4) {
        if ((pixels[index] ?? 0) > 0) visiblePixels += 1;
      }
    }
    return Object.freeze({
      version: STUDIO_HOKUSAI_NATURAL_MEDIA_TEXTURE_VERSION,
      presetId: plan.presetId,
      visiblePixels,
      alphaChangedPixels: 0,
      colorChangedPixels: 0,
      dominantDirectionRadians: directionRadians,
      directionIndexMode: "not-applicable",
      directionIndexSegments: 0,
      directionIndexCellReferences: 0,
    });
  }

  let visiblePixels = 0;
  let alphaChangedPixels = 0;
  let colorChangedPixels = 0;
  const inverseScale = 1 / plan.raster.scale;
  const localOilDirection = plan.presetId === "oil"
    ? localStrokeDirectionResolver(plan, directionRadians)
    : null;
  for (let y = dirtyY; y < dirtyY + dirtyHeight; y += 1) {
    const documentY = plan.logicalBounds.y + y * inverseScale;
    let index = (
      (y - frameY) * frameWidth
      + dirtyX
      - frameX
    ) * 4;
    for (let x = dirtyX; x < dirtyX + dirtyWidth; x += 1, index += 4) {
      const alpha = pixels[index + 3] ?? 0;
      if (alpha <= 0) continue;
      visiblePixels += 1;
      const documentX = plan.logicalBounds.x + x * inverseScale;
      const texture = plan.presetId === "pencil"
        ? pencilTexture(documentX, documentY, plan.seed)
        : plan.presetId === "charcoal"
          ? charcoalTexture(documentX, documentY, plan.seed)
          : oilTexture(
              documentX,
              documentY,
              plan.seed,
              localOilDirection?.resolve(x, y) ?? directionRadians,
            );
      const coverage = materialCoverage(alpha, plan.presetId);
      const materialAlpha = plan.presetId === "charcoal"
        ? texture.alpha ** (1 + (1 - coverage) * 0.55)
        : texture.alpha;
      const texturedAlpha = Math.max(
        1,
        clampByte(255 * coverage * materialAlpha),
      );
      if (texturedAlpha !== alpha) alphaChangedPixels += 1;
      pixels[index + 3] = texturedAlpha;

      for (let channel = 0; channel < 3; channel += 1) {
        const source = pixels[index + channel] ?? 0;
        const textured = clampByte(
          source * texture.color + (255 - source) * texture.lift,
        );
        if (textured !== source) colorChangedPixels += 1;
        pixels[index + channel] = textured;
      }
    }
  }
  return Object.freeze({
    version: STUDIO_HOKUSAI_NATURAL_MEDIA_TEXTURE_VERSION,
    presetId: plan.presetId,
    visiblePixels,
    alphaChangedPixels,
    colorChangedPixels,
    dominantDirectionRadians: directionRadians,
    directionIndexMode: localOilDirection?.mode ?? "not-applicable",
    directionIndexSegments: localOilDirection?.indexedSegments ?? 0,
    directionIndexCellReferences: localOilDirection?.cellReferences ?? 0,
  });
}
