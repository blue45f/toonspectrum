/**
 * Stroke-local coverage carrier for the legacy velocity-reactive `ink-brush`.
 *
 * The stamp walker remains the canonical pressure/velocity sampler. Its circular dabs are converted
 * into one variable-radius ribbon and submitted as one non-zero fill, preventing translucent ink
 * from accumulating at every carrier overlap, exact retrace and self-crossing.
 *
 * The walker samples far denser than the ribbon needs: ink spacing is 0.32 of a dab diameter, so
 * consecutive stations sit 0.64 radii apart and every station used to contribute a 24-gon join
 * disc. Those discs were 88% of the submitted path vertices while the bodies around them already
 * covered the same pixels. `planStudioStampInkRibbon` now proves that containment per station and
 * omits only the joins that cannot change coverage by more than `INK_RIBBON_JOIN_TOLERANCE`
 * document pixels — bodies, caps, opacity and determinism are untouched.
 */

import type {
  StudioStampBrushDab,
  StudioStampBrushStyle,
} from "./studio-brush-stamp-engine";

export const STUDIO_STAMP_INK_RIBBON_VERSION =
  "stamp-ink-ribbon-v1" as const;

export type StudioStampInkRibbonPolygonRole =
  | "body"
  | "join"
  | "start-cap"
  | "end-cap"
  | "tap";

export interface StudioStampInkRibbonPolygon {
  readonly role: StudioStampInkRibbonPolygonRole;
  readonly points: readonly number[];
}

export interface StudioStampInkRibbonPlan {
  readonly kind: "studio-stamp-ink-ribbon";
  readonly version: typeof STUDIO_STAMP_INK_RIBBON_VERSION;
  readonly coverageOperation: "stroke-local-single-fill";
  readonly fillRule: "nonzero";
  readonly cap: "round";
  readonly sourceDabCount: number;
  readonly acceptedDabCount: number;
  /** Document-pixel bound on how far omitting a join may move the filled boundary. */
  readonly joinTolerance: number;
  /** Interior stations whose join disc was proven redundant at `joinTolerance`. */
  readonly omittedJoinCount: number;
  readonly opacity: number;
  /** Exponent applied to recover the union's deposit, or `null` when the plan kept the raw alpha. */
  readonly depositAccumulation: number | null;
  readonly polygons: readonly StudioStampInkRibbonPolygon[];
}

export interface StudioStampInkRibbonOptions {
  /**
   * Document-pixel budget for join omission. Zero reproduces the historical carrier that emitted
   * one join disc per interior station, which is what the coverage-parity contract compares to.
   */
  readonly joinTolerance?: number;
  /**
   * How many dabs the walker laid on one covered pixel — libmypaint's `dabs_per_pixel` after the
   * preset's `opaque_linearize` interpolation, i.e. the exponent its per-dab alpha was solved
   * against. Absent (the default) keeps the historical union opacity untouched.
   *
   * The ribbon exists to fill the union of those dabs ONCE, which is exactly the accumulation the
   * linearization assumed would happen and then cancelled: `alpha_dab = 1 − (1 − opaque)^(1/L)`.
   * Painting the union at `alpha_dab` therefore ships the pre-accumulation alpha as if it were the
   * finished deposit. Measured on `mypaint-cc0--knife` that is a 7.8x under-deposit — the preset
   * asks for a saturation of 0.5 and the exported slab came out at 0.064, a ghost rather than
   * paint. See `accumulatedOpacity`.
   */
  readonly depositAccumulation?: number;
}

export interface StudioStampInkRibbonPathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
}

interface InkStation {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly alpha: number;
  /** Flat-nib minor axis. Absent (the default) means a round nib and the historical geometry. */
  readonly radiusY?: number;
  /** Major-axis direction of the nib, radians. Present only with `radiusY`. */
  readonly angleRadians?: number;
}

/**
 * Half-width of the nib measured along `(nx, ny)`.
 *
 * A round nib answers `radius` in every direction, which is why the ribbon was previously able to
 * ignore direction entirely. A flat nib does not: this is the ellipse support function
 * `sqrt(a²(u·n)² + b²(v·n)²)` for semi-axes `a` along the nib and `b` across it, so a stroke that
 * travels ACROSS the nib is laid down at full width while one travelling ALONG it thins to `b`.
 * That direction-dependent swelling is what makes a calligraphy nib legible as calligraphy, and
 * without it CC0 calligraphy (ratio 5.46) and the fat marker (ratio 10.0) rendered 0.186 apart -
 * effectively the same brush - despite obviously different upstream files.
 */
function nibSupport(station: InkStation, nx: number, ny: number): number {
  const minor = station.radiusY;
  if (minor === undefined || !(minor > 0)) return station.radius;
  const angle = station.angleRadians ?? 0;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const alongNib = ux * nx + uy * ny;
  const acrossNib = -uy * nx + ux * ny;
  return Math.hypot(station.radius * alongNib, minor * acrossNib);
}

const COORDINATE_LIMIT = 1_000_000_000;
const RADIUS_LIMIT = 65_536;
const POINT_EPSILON = 1e-6;
const ROUND_STEPS = 24;
const QUANTIZE_SCALE = 10_000;
const TAU = Math.PI * 2;
/**
 * Sub-pixel budget for omitting a join disc. A shipped stroke is drawn under the viewport
 * transform, so this stays far below one document pixel to remain sub-pixel at the 500% zoom
 * ceiling as well.
 */
export const INK_RIBBON_JOIN_TOLERANCE = 0.03;
/**
 * A join disc reaches one radius along the path in each direction. Walking more stations than this
 * to prove that reach keeps the analysis linear even for a degenerate spacing/radius ratio.
 */
const MAX_JOIN_WINDOW_STATIONS = 64;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function quantize(value: number): number {
  const result = Math.round(value * QUANTIZE_SCALE) / QUANTIZE_SCALE;
  return Object.is(result, -0) ? 0 : result;
}

function sanitizeInkStations(
  dabs: readonly StudioStampBrushDab[],
): readonly InkStation[] {
  const stations: InkStation[] = [];
  for (const dab of dabs) {
    if (
      !Number.isFinite(dab.x)
      || !Number.isFinite(dab.y)
      || !Number.isFinite(dab.radius)
      || !Number.isFinite(dab.alpha)
      || dab.radius <= 0
    ) continue;
    const chiselMinor = typeof dab.radiusY === "number"
        && Number.isFinite(dab.radiusY)
        && dab.radiusY > 0
      ? clamp(dab.radiusY, 0.25, RADIUS_LIMIT)
      : null;
    const station = Object.freeze({
      x: clamp(dab.x, -COORDINATE_LIMIT, COORDINATE_LIMIT),
      y: clamp(dab.y, -COORDINATE_LIMIT, COORDINATE_LIMIT),
      radius: clamp(dab.radius, 0.25, RADIUS_LIMIT),
      alpha: clamp(dab.alpha, 0, 1),
      ...(chiselMinor !== null
        ? {
            radiusY: chiselMinor,
            angleRadians: Number.isFinite(dab.angleRadians) ? dab.angleRadians! : 0,
          }
        : {}),
    });
    const previous = stations.at(-1);
    if (
      previous
      && Math.hypot(station.x - previous.x, station.y - previous.y)
        <= POINT_EPSILON
    ) {
      stations[stations.length - 1] = Object.freeze({
        ...station,
        radius: Math.max(previous.radius, station.radius),
        alpha: Math.max(previous.alpha, station.alpha),
      });
    } else {
      stations.push(station);
    }
  }
  return Object.freeze(stations);
}

function bodyPolygon(
  from: InkStation,
  to: InkStation,
): readonly number[] | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length <= POINT_EPSILON) return null;
  const normalX = -dy / length;
  const normalY = dx / length;
  // Emitted right-side-forward: with a strictly positive length and radius the left-side-forward
  // order is always negatively wound, so this is the re-wound result without measuring it.
  const fromHalf = nibSupport(from, normalX, normalY);
  const toHalf = nibSupport(to, normalX, normalY);
  return Object.freeze([
    quantize(from.x - normalX * fromHalf),
    quantize(from.y - normalY * fromHalf),
    quantize(to.x - normalX * toHalf),
    quantize(to.y - normalY * toHalf),
    quantize(to.x + normalX * toHalf),
    quantize(to.y + normalY * toHalf),
    quantize(from.x + normalX * fromHalf),
    quantize(from.y + normalY * fromHalf),
  ]);
}

function roundPolygon(station: InkStation): readonly number[] {
  const points: number[] = [];
  for (let step = 0; step < ROUND_STEPS; step += 1) {
    const angle = TAU * step / ROUND_STEPS;
    // Round nib: nibSupport answers `radius` in every direction, so this is the original circle.
    const support = nibSupport(station, Math.cos(angle), Math.sin(angle));
    points.push(
      quantize(station.x + Math.cos(angle) * support),
      quantize(station.y + Math.sin(angle) * support),
    );
  }
  // Ascending angles are already positively wound, so the generic re-winding copy is skipped.
  return Object.freeze(points);
}

/**
 * Depth by which a disc of `radius` escapes two adjacent bodies whose directions differ by the
 * turn with cosine `turnCosine`.
 *
 * The two bodies end and start on their own perpendicular cross-sections through the station, so
 * the pair leaves a sector of exactly the turn angle uncovered. The point of that sector furthest
 * from either bounding cross-section sits on the rim, `radius * sin(turn / 2)` away.
 */
function turnGapDepth(radius: number, turnCosine: number): number {
  return radius * Math.sqrt(Math.max(0, (1 - turnCosine) / 2));
}

/**
 * Depth by which a disc of `radius` escapes a body whose half-width falls away at `shrinkSlope`
 * document pixels per document pixel travelled. Solving `radius - slope*u >= sqrt(radius^2 - u^2)`
 * puts the worst violation at `radius * (sqrt(1 + slope^2) - 1)`.
 */
function shrinkPinchDepth(radius: number, shrinkSlope: number): number {
  return radius * (Math.sqrt(1 + shrinkSlope * shrinkSlope) - 1);
}

function segmentLength(from: InkStation, to: InkStation): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function unitTurnCosine(
  previous: InkStation,
  station: InkStation,
  next: InkStation,
): number {
  const inX = station.x - previous.x;
  const inY = station.y - previous.y;
  const outX = next.x - station.x;
  const outY = next.y - station.y;
  const inLength = Math.hypot(inX, inY);
  const outLength = Math.hypot(outX, outY);
  if (inLength <= POINT_EPSILON || outLength <= POINT_EPSILON) return -1;
  return (inX * outX + inY * outY) / (inLength * outLength);
}

/**
 * Proves that the bodies within one radius of `index` already cover its join disc.
 *
 * The scan walks outward until it has travelled the disc's own radius on that side. Every station
 * it passes contributes two ways the disc could still escape: the outer wedge left by that
 * station's turn, and the taper of the strip as the radius falls away from the disc's centre.
 * Both are bounded, and the walk fails closed when the stroke ends before a full radius.
 */
function joinDiscIsCovered(
  stations: readonly InkStation[],
  index: number,
  tolerance: number,
): boolean {
  const station = stations[index]!;
  const radius = station.radius;
  for (const stride of [-1, 1] as const) {
    let travelled = 0;
    let cursor = index;
    let steps = 0;
    while (travelled < radius) {
      const nextIndex = cursor + stride;
      if (nextIndex < 0 || nextIndex >= stations.length) return false;
      steps += 1;
      if (steps > MAX_JOIN_WINDOW_STATIONS) return false;
      const from = stations[cursor]!;
      const to = stations[nextIndex]!;
      const length = segmentLength(from, to);
      if (length <= POINT_EPSILON) return false;
      travelled += length;
      if (shrinkPinchDepth(radius, Math.max(0, radius - to.radius) / travelled) > tolerance) {
        return false;
      }
      // The turn at every station between the disc and the reach of its own radius opens another
      // wedge in the strip that carries it, so those turns are budgeted here too.
      const beyondIndex = nextIndex + stride;
      if (travelled < radius && beyondIndex >= 0 && beyondIndex < stations.length) {
        const turnCosine = stride === 1
          ? unitTurnCosine(from, to, stations[beyondIndex]!)
          : unitTurnCosine(stations[beyondIndex]!, to, from);
        if (turnGapDepth(Math.max(radius, to.radius), turnCosine) > tolerance) return false;
      }
      cursor = nextIndex;
    }
  }
  const turnCosine = unitTurnCosine(
    stations[index - 1]!,
    station,
    stations[index + 1]!,
  );
  return turnGapDepth(radius, turnCosine) <= tolerance;
}

function weightedOpacity(stations: readonly InkStation[]): number {
  if (stations.length === 0) return 0;
  if (stations.length === 1) return stations[0]!.alpha;
  let weighted = 0;
  let totalLength = 0;
  for (let index = 1; index < stations.length; index += 1) {
    const previous = stations[index - 1]!;
    const current = stations[index]!;
    const length = Math.hypot(
      current.x - previous.x,
      current.y - previous.y,
    );
    weighted += (previous.alpha + current.alpha) * 0.5 * length;
    totalLength += length;
  }
  return totalLength <= POINT_EPSILON
    ? stations.reduce((sum, station) => sum + station.alpha, 0) / stations.length
    : weighted / totalLength;
}

/**
 * Deposit of `accumulation` coincident dabs of alpha `alpha`, over-compositing: `1 − (1 − a)^L`.
 *
 * This is the exact inverse of the linearization the CC0 presets solve their per-dab alpha with
 * (`studioLibmypaintLinearizedDabAlpha`), so a preset whose stroke saturation target is `opaque`
 * gets `opaque` back — the union fill lands where the dab chain would have landed instead of one
 * dab below it.
 */
function accumulatedOpacity(alpha: number, accumulation: number): number {
  if (!(accumulation > 1) || !(alpha > 0)) return alpha;
  return 1 - (1 - alpha) ** accumulation;
}

/**
 * The ribbon options a stamp style implies, so the SVG serializer and the Canvas2D fallback cannot
 * drift apart on the union's deposit. A style with no `opaque_linearize` pin (every non-cc0 lane)
 * yields an empty object and the historical plan.
 */
export function studioStampInkRibbonOptions(
  style: Pick<StudioStampBrushStyle, "mypaintCc0Dynamics">,
): StudioStampInkRibbonOptions {
  const accumulation = style.mypaintCc0Dynamics?.linearizeDabsPerPixel;
  return typeof accumulation === "number" && accumulation > 1
    ? { depositAccumulation: accumulation }
    : {};
}

export function planStudioStampInkRibbon(
  dabs: readonly StudioStampBrushDab[],
  options?: StudioStampInkRibbonOptions | null,
): StudioStampInkRibbonPlan {
  const joinTolerance = typeof options?.joinTolerance === "number"
      && Number.isFinite(options.joinTolerance)
    ? Math.max(0, options.joinTolerance)
    : INK_RIBBON_JOIN_TOLERANCE;
  const depositAccumulation = typeof options?.depositAccumulation === "number"
      && Number.isFinite(options.depositAccumulation)
      && options.depositAccumulation > 1
    ? options.depositAccumulation
    : null;
  const stations = sanitizeInkStations(dabs);
  const polygons: StudioStampInkRibbonPolygon[] = [];
  let omittedJoinCount = 0;
  if (stations.length === 1) {
    polygons.push(Object.freeze({
      role: "tap",
      points: roundPolygon(stations[0]!),
    }));
  } else if (stations.length > 1) {
    for (let index = 1; index < stations.length; index += 1) {
      const body = bodyPolygon(stations[index - 1]!, stations[index]!);
      if (!body) continue;
      polygons.push(Object.freeze({
        role: "body",
        points: body,
      }));
    }
    for (let index = 1; index < stations.length - 1; index += 1) {
      if (
        joinTolerance > 0
        && joinDiscIsCovered(stations, index, joinTolerance)
      ) {
        omittedJoinCount += 1;
        continue;
      }
      polygons.push(Object.freeze({
        role: "join",
        points: roundPolygon(stations[index]!),
      }));
    }
    polygons.push(
      Object.freeze({
        role: "start-cap",
        points: roundPolygon(stations[0]!),
      }),
      Object.freeze({
        role: "end-cap",
        points: roundPolygon(stations.at(-1)!),
      }),
    );
  }
  return Object.freeze({
    kind: "studio-stamp-ink-ribbon",
    version: STUDIO_STAMP_INK_RIBBON_VERSION,
    coverageOperation: "stroke-local-single-fill",
    fillRule: "nonzero",
    cap: "round",
    sourceDabCount: dabs.length,
    acceptedDabCount: stations.length,
    joinTolerance,
    omittedJoinCount,
    opacity: clamp(
      depositAccumulation === null
        ? weightedOpacity(stations)
        : accumulatedOpacity(weightedOpacity(stations), depositAccumulation),
      0,
      1,
    ),
    depositAccumulation,
    polygons: Object.freeze(polygons),
  });
}

export function traceStudioStampInkRibbon(
  sink: StudioStampInkRibbonPathSink,
  plan: StudioStampInkRibbonPlan,
): void {
  for (const polygon of plan.polygons) {
    if (polygon.points.length < 6) continue;
    sink.moveTo(polygon.points[0]!, polygon.points[1]!);
    for (let index = 2; index + 1 < polygon.points.length; index += 2) {
      sink.lineTo(polygon.points[index]!, polygon.points[index + 1]!);
    }
    sink.closePath();
  }
}
