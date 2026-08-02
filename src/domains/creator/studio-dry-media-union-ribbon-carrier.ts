/**
 * Stroke-local union carrier for the five built-in dry-media brushes.
 *
 * The anisotropic bridge still owns the pressure/material response and emits three or five
 * independent fibres per source station. This adapter changes only their transport: instead of
 * source-over stamping every fibre footprint, it sweeps each footprint from its immutable
 * `segmentStartFrame` and fills every contour in one operation. Consequently a self-crossing or
 * A→B→A retrace is covered once inside one stroke, while separate DrawEls still build pigment in
 * the ordinary destination compositor.
 */

import {
  studioDryMediaDynamicBridgeMarkMultiplier,
  type StudioDynamicBrushMaterialIdentity,
} from "./studio-dry-media-dynamic-bridge";

import type {
  NormalizedStudioBrushDynamicsSettings,
  StudioDynamicBrushDab,
  StudioDynamicBrushSegmentStartFrame,
} from "./studio-brush-dynamics";
import type { StudioBrushTipAlphaMap } from "./studio-brush-tip-stamp";

export const STUDIO_DRY_MEDIA_UNION_RIBBON_CARRIER_VERSION =
  "dry-media-union-ribbon-carrier-v1" as const;
export const STUDIO_DRY_MEDIA_UNION_RIBBON_MAX_MARKS = 524_288;

export interface StudioDryMediaUnionRibbonPolygon {
  readonly kind: "dry-media-union-ribbon-polygon";
  readonly version: typeof STUDIO_DRY_MEDIA_UNION_RIBBON_CARRIER_VERSION;
  readonly role: "stroke-union";
  /**
   * Positive-winding pigment contours followed by deterministic opposite-winding micro pores.
   * One non-zero fill therefore deposits a continuous bed while revealing paper tooth without
   * painting the background colour or source-over stacking transparent stamps.
   */
  readonly polygons: readonly (readonly number[])[];
}

export interface StudioDryMediaUnionRibbonSourceMark {
  readonly x: number;
  readonly y: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly angleRadians: number;
  readonly alpha: number;
  readonly color: string;
  readonly texture?: Readonly<{
    readonly kind: "alpha-map";
    readonly alphaMap: StudioBrushTipAlphaMap;
  }>;
  readonly falloff?: Readonly<{
    readonly kind: "analytic-radial";
    readonly exponent: number;
  }>;
}

export interface StudioDryMediaUnionRibbonCoverageMark
  extends Omit<StudioDryMediaUnionRibbonSourceMark, "falloff" | "texture"> {
  readonly ribbon: StudioDryMediaUnionRibbonPolygon;
}

export type StudioDryMediaUnionRibbonPlanResult =
  | Readonly<{
      readonly applied: true;
      readonly marks: readonly StudioDryMediaUnionRibbonCoverageMark[];
    }>
  | Readonly<{
      readonly applied: false;
      readonly reason:
        | "ineligible-material"
        | "invalid-geometry"
        | "mark-dab-mismatch"
        | "mark-budget";
      readonly marks: readonly StudioDryMediaUnionRibbonSourceMark[];
    }>;

const CORE_DRY_MEDIA_IDS = new Set([
  "crayon",
  "chalk",
  "charcoal",
  "pastel",
  "oil-pastel",
]);
const CORE_DRY_MEDIA_TIP_SHAPES = Object.freeze({
  crayon: "hard",
  chalk: "sponge",
  charcoal: "bristle",
  pastel: "sponge",
  "oil-pastel": "bristle",
} as const);
const COORDINATE_LIMIT = 1_000_000_000;
const QUANTIZATION = 10_000;
const EPSILON = 1e-6;
const TAU = Math.PI * 2;

type CoreDryMediaId =
  | "crayon"
  | "chalk"
  | "charcoal"
  | "pastel"
  | "oil-pastel";

interface DryMediaNegativeGrainPolicy {
  /** Probability that one causal lane segment exposes a paper-tooth slit. */
  readonly density: number;
  /** Slit length as a fraction of the causal segment, before the absolute fine-grain bound. */
  readonly lengthRatio: number;
  /** Slit width as a fraction of the narrowest connected pigment half-width. */
  readonly widthRatio: number;
  readonly maximumHalfLength: number;
  readonly maximumHalfWidth: number;
  readonly lateralWander: number;
}

const DRY_MEDIA_NEGATIVE_GRAIN_POLICY = Object.freeze({
  // Sparse, long wax scratches over a dense body.
  crayon: Object.freeze({
    density: 0.34,
    lengthRatio: 0.42,
    widthRatio: 0.12,
    maximumHalfLength: 0.72,
    maximumHalfWidth: 0.24,
    lateralWander: 0.42,
  }),
  // Many hairline carbon gaps preserve a fibrous stick texture.
  charcoal: Object.freeze({
    density: 0.68,
    lengthRatio: 0.58,
    widthRatio: 0.09,
    maximumHalfLength: 0.82,
    maximumHalfWidth: 0.2,
    lateralWander: 0.56,
  }),
  // Shorter mineral pores read as chalk tooth rather than square pigment flakes.
  chalk: Object.freeze({
    density: 0.6,
    lengthRatio: 0.3,
    widthRatio: 0.18,
    maximumHalfLength: 0.48,
    maximumHalfWidth: 0.34,
    lateralWander: 0.62,
  }),
  // Fine, moderately dense paper tooth under soft powder.
  pastel: Object.freeze({
    density: 0.5,
    lengthRatio: 0.34,
    widthRatio: 0.14,
    maximumHalfLength: 0.56,
    maximumHalfWidth: 0.3,
    lateralWander: 0.52,
  }),
  // Oil pastel is smoother and more occlusive, with only occasional wax grooves.
  "oil-pastel": Object.freeze({
    density: 0.24,
    lengthRatio: 0.5,
    widthRatio: 0.08,
    maximumHalfLength: 0.7,
    maximumHalfWidth: 0.18,
    lateralWander: 0.34,
  }),
} as const satisfies Readonly<Record<CoreDryMediaId, DryMediaNegativeGrainPolicy>>);

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function quantize(value: number): number {
  return Math.round(
    clamp(finite(value, 0), -COORDINATE_LIMIT, COORDINATE_LIMIT) * QUANTIZATION,
  ) / QUANTIZATION;
}

export function studioDryMediaUnionRibbonCarrierOwnsMaterial(
  materialIdentity: StudioDynamicBrushMaterialIdentity | undefined,
  dynamics: NormalizedStudioBrushDynamicsSettings,
): boolean {
  const color = dynamics.colorDynamics;
  const brushId = materialIdentity?.brushId;
  return materialIdentity?.dryMediaPresetId !== null
    && materialIdentity?.dryMediaPresetId !== undefined
    && typeof brushId === "string"
    && CORE_DRY_MEDIA_IDS.has(brushId)
    && dynamics.tip.shape === CORE_DRY_MEDIA_TIP_SHAPES[
      brushId as keyof typeof CORE_DRY_MEDIA_TIP_SHAPES
    ]
    && dynamics.tipLayers.length === 0
    && dynamics.dualBrush?.enabled !== true
    && color.backgroundColor === null
    && color.foregroundBackgroundMix === 0
    && color.foregroundBackgroundJitter === 0
    && color.hueJitter === 0
    && color.saturationJitter === 0
    && color.valueJitter === 0;
}

function validFrame(
  frame: StudioDynamicBrushSegmentStartFrame | undefined,
): frame is StudioDynamicBrushSegmentStartFrame {
  return frame !== undefined
    && Number.isSafeInteger(frame.index)
    && frame.index >= 0
    && Number.isFinite(frame.sourceX)
    && Number.isFinite(frame.sourceY)
    && Number.isFinite(frame.direction)
    && Number.isFinite(frame.size)
    && frame.size > 0
    && Number.isFinite(frame.roundness)
    && frame.roundness > 0;
}

function validPair(
  dab: StudioDynamicBrushDab,
  mark: StudioDryMediaUnionRibbonSourceMark,
): boolean {
  return Number.isFinite(dab.sourceX)
    && Number.isFinite(dab.sourceY)
    && Number.isFinite(dab.size)
    && dab.size > 0
    && Number.isFinite(dab.direction)
    && Number.isFinite(dab.distanceFromPrevious)
    && finite(mark.x, Number.NaN) === mark.x
    && finite(mark.y, Number.NaN) === mark.y
    && finite(mark.radiusX, Number.NaN) === mark.radiusX
    && mark.radiusX > 0
    && finite(mark.radiusY, Number.NaN) === mark.radiusY
    && mark.radiusY > 0
    && Number.isFinite(mark.alpha)
    && mark.alpha >= 0
    && mark.alpha <= 1
    && typeof mark.color === "string"
    && mark.color.length > 0;
}

function signedArea(points: readonly number[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 2) {
    const next = (index + 2) % points.length;
    area += points[index]! * points[next + 1]!
      - points[next]! * points[index + 1]!;
  }
  return area / 2;
}

function sameWinding(points: readonly number[]): readonly number[] {
  const quantized = points.map(quantize);
  if (signedArea(quantized) >= 0) return Object.freeze(quantized);
  const reversed: number[] = [];
  for (let index = quantized.length - 2; index >= 0; index -= 2) {
    reversed.push(quantized[index]!, quantized[index + 1]!);
  }
  return Object.freeze(reversed);
}

function oppositeWinding(points: readonly number[]): readonly number[] {
  const positive = sameWinding(points);
  const reversed: number[] = [];
  for (let index = positive.length - 2; index >= 0; index -= 2) {
    reversed.push(positive[index]!, positive[index + 1]!);
  }
  return Object.freeze(reversed);
}

function deterministicUnit(
  seed: number,
  stationIndex: number,
  laneIndex: number,
  channel: number,
): number {
  let value = (
    (seed >>> 0)
    ^ Math.imul((stationIndex + 1) >>> 0, 0x9e37_79b1)
    ^ Math.imul((laneIndex + 1) >>> 0, 0x85eb_ca77)
    ^ Math.imul((channel + 1) >>> 0, 0xc2b2_ae3d)
  ) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb_352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846c_a68b) >>> 0;
  value ^= value >>> 16;
  return (value >>> 0) / 0x1_0000_0000;
}

function ellipsePolygon(
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  angle: number,
): readonly number[] {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const points: number[] = [];
  for (let index = 0; index < 12; index += 1) {
    const theta = index / 12 * TAU;
    const localX = Math.cos(theta) * radiusX;
    const localY = Math.sin(theta) * radiusY;
    points.push(
      centerX + localX * cosine - localY * sine,
      centerY + localX * sine + localY * cosine,
    );
  }
  return sameWinding(points);
}

function coverageHalfWidth(
  mark: StudioDryMediaUnionRibbonSourceMark,
): number {
  // Pigment/grain alpha becomes edge density instead of repeated transparent stamp opacity.
  // This keeps paper-tooth variation without allowing overlaps inside one DrawEl to darken.
  return Math.max(
    0.18,
    mark.radiusY * (0.52 + Math.sqrt(clamp(mark.alpha, 0, 1)) * 0.48),
  );
}

function previousFiberCenter(
  dab: StudioDynamicBrushDab,
  mark: StudioDryMediaUnionRibbonSourceMark,
  frame: StudioDynamicBrushSegmentStartFrame,
): Readonly<{ x: number; y: number; halfWidth: number }> {
  const currentDirection = finite(dab.direction, 0) * Math.PI / 180;
  const previousDirection = frame.direction * Math.PI / 180;
  const delta = previousDirection - currentDirection;
  const cosine = Math.cos(delta);
  const sine = Math.sin(delta);
  const scale = clamp(frame.size / Math.max(EPSILON, dab.size), 0.2, 5);
  const offsetX = mark.x - dab.sourceX;
  const offsetY = mark.y - dab.sourceY;
  return Object.freeze({
    x: frame.sourceX + (offsetX * cosine - offsetY * sine) * scale,
    y: frame.sourceY + (offsetX * sine + offsetY * cosine) * scale,
    halfWidth: coverageHalfWidth(mark) * scale,
  });
}

function actualPreviousFiberCenter(
  dabs: readonly StudioDynamicBrushDab[],
  marks: readonly StudioDryMediaUnionRibbonSourceMark[],
  index: number,
  laneCount: number,
  frame: StudioDynamicBrushSegmentStartFrame,
): Readonly<{ x: number; y: number; halfWidth: number }> | null {
  const previousIndex = index - laneCount;
  if (previousIndex < 0) return null;
  const previousDab = dabs[previousIndex];
  const previousMark = marks[previousIndex];
  if (!previousDab || !previousMark || !validPair(previousDab, previousMark)) {
    return null;
  }

  // The bridge emits every physical lane in a stable station-major order. A full-prefix replay
  // therefore has the exact previous footprint at `index - laneCount`; use that authored geometry
  // instead of rotating the current station's freshly seeded offset backwards. The reconstruction
  // remains the causal-suffix fallback when the preceding station is intentionally not supplied.
  if (
    Math.abs(previousDab.sourceX - frame.sourceX) > EPSILON
    || Math.abs(previousDab.sourceY - frame.sourceY) > EPSILON
  ) {
    return null;
  }
  if (
    Number.isFinite(previousDab.distanceFromStrokeStart)
    && Number.isFinite(frame.distanceFromStrokeStart)
    && Math.abs(
      previousDab.distanceFromStrokeStart! - frame.distanceFromStrokeStart!,
    ) > EPSILON
  ) {
    return null;
  }
  return Object.freeze({
    x: previousMark.x,
    y: previousMark.y,
    halfWidth: coverageHalfWidth(previousMark),
  });
}

function segmentPolygon(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  startHalfWidth: number,
  endHalfWidth: number,
): readonly number[] | null {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const length = Math.hypot(deltaX, deltaY);
  if (length <= EPSILON) return null;
  const normalX = -deltaY / length;
  const normalY = deltaX / length;
  return sameWinding([
    startX - normalX * startHalfWidth,
    startY - normalY * startHalfWidth,
    endX - normalX * endHalfWidth,
    endY - normalY * endHalfWidth,
    endX + normalX * endHalfWidth,
    endY + normalY * endHalfWidth,
    startX + normalX * startHalfWidth,
    startY + normalY * startHalfWidth,
  ]);
}

function negativeGrainSlitPolygon(
  input: Readonly<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    startHalfWidth: number;
    endHalfWidth: number;
    seed: number;
    stationIndex: number;
    laneIndex: number;
    policy: DryMediaNegativeGrainPolicy;
  }>,
): readonly number[] | null {
  if (
    deterministicUnit(
      input.seed,
      input.stationIndex,
      input.laneIndex,
      0,
    ) >= input.policy.density
  ) return null;
  const deltaX = input.endX - input.startX;
  const deltaY = input.endY - input.startY;
  const length = Math.hypot(deltaX, deltaY);
  const minimumHalfWidth = Math.min(
    input.startHalfWidth,
    input.endHalfWidth,
  );
  if (length <= 0.45 || minimumHalfWidth <= 0.18) return null;

  const tangentX = deltaX / length;
  const tangentY = deltaY / length;
  const normalX = -tangentY;
  const normalY = tangentX;
  const along = 0.24 + deterministicUnit(
    input.seed,
    input.stationIndex,
    input.laneIndex,
    1,
  ) * 0.52;
  const lateral = (
    deterministicUnit(
      input.seed,
      input.stationIndex,
      input.laneIndex,
      2,
    ) * 2 - 1
  ) * minimumHalfWidth * input.policy.lateralWander;
  const centerX = input.startX + deltaX * along + normalX * lateral;
  const centerY = input.startY + deltaY * along + normalY * lateral;
  const halfLength = Math.max(
    0.12,
    Math.min(
      length * 0.31,
      input.policy.maximumHalfLength,
      length * input.policy.lengthRatio * (
        0.72 + deterministicUnit(
          input.seed,
          input.stationIndex,
          input.laneIndex,
          3,
        ) * 0.4
      ),
    ),
  );
  const halfWidth = Math.max(
    0.055,
    Math.min(
      minimumHalfWidth * 0.32,
      input.policy.maximumHalfWidth,
      minimumHalfWidth * input.policy.widthRatio * (
        0.78 + deterministicUnit(
          input.seed,
          input.stationIndex,
          input.laneIndex,
          4,
        ) * 0.38
      ),
    ),
  );
  if (halfLength * 2 >= length * 0.68 || halfWidth >= minimumHalfWidth * 0.4) {
    return null;
  }
  return oppositeWinding([
    centerX - tangentX * halfLength - normalX * halfWidth,
    centerY - tangentY * halfLength - normalY * halfWidth,
    centerX + tangentX * halfLength - normalX * halfWidth,
    centerY + tangentY * halfLength - normalY * halfWidth,
    centerX + tangentX * halfLength + normalX * halfWidth,
    centerY + tangentY * halfLength + normalY * halfWidth,
    centerX - tangentX * halfLength + normalX * halfWidth,
    centerY - tangentY * halfLength + normalY * halfWidth,
  ]);
}

function polygonBounds(
  polygons: readonly (readonly number[])[],
): Readonly<{ x: number; y: number; radiusX: number; radiusY: number }> | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const polygon of polygons) {
    if (polygon.length < 6 || polygon.length % 2 !== 0) return null;
    for (let index = 0; index < polygon.length; index += 2) {
      const x = polygon[index]!;
      const y = polygon[index + 1]!;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (!(maxX > minX) || !(maxY > minY)) return null;
  return Object.freeze({
    x: quantize((minX + maxX) / 2),
    y: quantize((minY + maxY) / 2),
    radiusX: quantize(Math.max(0.25, (maxX - minX) / 2)),
    radiusY: quantize(Math.max(0.25, (maxY - minY) / 2)),
  });
}

/**
 * Replaces the complete built-in dry-media mark sequence with one opaque geometry mask.
 *
 * Opaque here is stroke-local only: the caller still composites the complete mask with the
 * DrawEl opacity once, so two independently authored strokes retain normal pigment build-up.
 */
export function planStudioDryMediaUnionRibbonCarrier(
  input: Readonly<{
    dabs: readonly StudioDynamicBrushDab[];
    marks: readonly StudioDryMediaUnionRibbonSourceMark[];
    materialIdentity?: StudioDynamicBrushMaterialIdentity;
    dynamics: NormalizedStudioBrushDynamicsSettings;
  }>,
): StudioDryMediaUnionRibbonPlanResult {
  if (
    !studioDryMediaUnionRibbonCarrierOwnsMaterial(
      input.materialIdentity,
      input.dynamics,
    )
  ) {
    return Object.freeze({
      applied: false,
      reason: "ineligible-material",
      marks: input.marks,
    });
  }
  if (input.dabs.length !== input.marks.length) {
    return Object.freeze({
      applied: false,
      reason: "mark-dab-mismatch",
      marks: input.marks,
    });
  }
  if (input.marks.length > STUDIO_DRY_MEDIA_UNION_RIBBON_MAX_MARKS) {
    return Object.freeze({
      applied: false,
      reason: "mark-budget",
      marks: input.marks,
    });
  }
  if (input.marks.length === 0) {
    return Object.freeze({ applied: true, marks: Object.freeze([]) });
  }
  const laneCount = studioDryMediaDynamicBridgeMarkMultiplier(
    input.materialIdentity,
  );
  if (laneCount === 1 || input.dabs.length % laneCount !== 0) {
    return Object.freeze({
      applied: false,
      reason: "mark-dab-mismatch",
      marks: input.marks,
    });
  }
  const firstColor = input.marks[0]!.color;
  if (
    input.marks.some((mark, index) => (
      mark.color !== firstColor || !validPair(input.dabs[index]!, mark)
    ))
  ) {
    return Object.freeze({
      applied: false,
      reason: "invalid-geometry",
      marks: input.marks,
    });
  }

  const polygons: Array<readonly number[]> = [];
  const brushId = input.materialIdentity?.brushId as CoreDryMediaId;
  const grainPolicy = DRY_MEDIA_NEGATIVE_GRAIN_POLICY[brushId];
  const grainSeed = Math.trunc(finite(input.dynamics.seed, 0)) >>> 0;
  for (let index = 0; index < input.dabs.length; index += 1) {
    const dab = input.dabs[index]!;
    const mark = input.marks[index]!;
    const travel = Math.max(0, finite(dab.distanceFromPrevious, 0));
    const frame = dab.segmentStartFrame;
    if (travel > EPSILON) {
      if (!validFrame(frame)) {
        return Object.freeze({
          applied: false,
          reason: "invalid-geometry",
          marks: input.marks,
        });
      }
      const start = actualPreviousFiberCenter(
        input.dabs,
        input.marks,
        index,
        laneCount,
        frame,
      ) ?? previousFiberCenter(dab, mark, frame);
      const segment = segmentPolygon(
        start.x,
        start.y,
        mark.x,
        mark.y,
        start.halfWidth,
        coverageHalfWidth(mark),
      );
      if (!segment) {
        return Object.freeze({
          applied: false,
          reason: "invalid-geometry",
          marks: input.marks,
        });
      }
      polygons.push(segment);
      const grain = negativeGrainSlitPolygon({
        startX: start.x,
        startY: start.y,
        endX: mark.x,
        endY: mark.y,
        startHalfWidth: start.halfWidth,
        endHalfWidth: coverageHalfWidth(mark),
        seed: grainSeed,
        stationIndex: Math.floor(index / laneCount),
        laneIndex: index % laneCount,
        policy: grainPolicy,
      });
      if (grain) polygons.push(grain);
    } else {
      polygons.push(ellipsePolygon(
        mark.x,
        mark.y,
        Math.max(
          0.25,
          Math.min(mark.radiusX * 0.28, coverageHalfWidth(mark) * 1.8),
        ),
        coverageHalfWidth(mark),
        mark.angleRadians,
      ));
    }

    // Only immutable document endpoints receive caps. A moving live suffix never leaves a
    // temporary circular stamp behind, while retained/SVG endpoints stay softly rounded.
    if (dab.progress >= 1 - EPSILON) {
      polygons.push(ellipsePolygon(
        mark.x,
        mark.y,
        Math.max(
          0.25,
          Math.min(mark.radiusX * 0.24, coverageHalfWidth(mark) * 1.65),
        ),
        coverageHalfWidth(mark),
        mark.angleRadians,
      ));
    }
  }
  const bounds = polygonBounds(polygons);
  if (!bounds) {
    return Object.freeze({
      applied: false,
      reason: "invalid-geometry",
      marks: input.marks,
    });
  }
  return Object.freeze({
    applied: true,
    marks: Object.freeze([
      Object.freeze({
        ...bounds,
        angleRadians: 0,
        // The DrawEl/stroke opacity is applied exactly once by the coverage compositor.
        alpha: 1,
        color: firstColor,
        ribbon: Object.freeze({
          kind: "dry-media-union-ribbon-polygon",
          version: STUDIO_DRY_MEDIA_UNION_RIBBON_CARRIER_VERSION,
          role: "stroke-union",
          polygons: Object.freeze(polygons),
        }),
      }),
    ]),
  });
}
