/**
 * Continuous carrier for oil/acrylic paint.
 *
 * `planOilBrushDabs` remains the deterministic pressure/material station planner, but rendering
 * every station as an ellipse exposes a row of beads on long strokes. This adapter converts those
 * stations into one variable-width, direction-following body and five continuous bristle lanes.
 * Canvas and SVG consume the same quantized geometry.
 */

import {
  planStudioBristlePhysicsOil,
  type StudioBristlePhysicsOilPlan,
} from "./studio-bristle-physics-oil-v1";
import {
  computeStudioImpastoReliefShading,
} from "./studio-impasto-relief-shading-v1";
import {
  planStudioOilBristleLoadDynamics,
  type StudioOilBristleLoadDynamicsPlan,
} from "./studio-oil-bristle-load-dynamics-v1";

import type { FxOilDab } from "./studio-fx-brush";

export const STUDIO_OIL_RIBBON_CARRIER_VERSION = "oil-ribbon-carrier-v1" as const;

const COORDINATE_LIMIT = 1_000_000;
const GEOMETRY_QUANTIZATION = 10_000;
const POINT_EPSILON = 1e-6;

export interface StudioOilRibbonPath {
  /** Flat `[x0,y0,x1,y1,…]` coordinate list. */
  readonly points: readonly number[];
}

/**
 * One deposit of bristle relief.
 *
 * A lane is a *band of equal load*, not a single hair: every run in `runs` — from any bristle and
 * any part of the path — is stroked in ONE `stroke()`/`<path>` operation. That is what keeps a
 * self-crossing honest. Per-run compositing made two arms of a figure-eight stack their ridges and
 * turned the crossing into a knot; a single paint pass rasterises the union of the band's coverage
 * once, so a ridge crossing another ridge of the same load deposits exactly once.
 */
export interface StudioOilRibbonBristleLane {
  readonly runs: readonly StudioOilRibbonPath[];
  readonly lineWidth: number;
  readonly opacity: number;
  /** Load band this deposit represents; `0` is the dry film, higher indices are loaded ridges. */
  readonly loadBand: number;
}

/**
 * One relief overlay deposit (impasto). Like a bristle lane, every run of a lane is painted in ONE
 * `stroke()`/`<path>` operation so a self-crossing never doubles its own glint or core shadow.
 * `kind` decides the paint contract both durable surfaces share: `"highlight"` is stroked in
 * {@link STUDIO_OIL_IMPASTO_RELIEF_HIGHLIGHT_COLOR} under `screen`, `"shadow"` in the stroke color
 * under `multiply` — dli composites an achromatic specular on top of diffuse-scaled pigment, and
 * this is that split expressed as vector geometry.
 */
export interface StudioOilRibbonImpastoReliefLane {
  readonly runs: readonly StudioOilRibbonPath[];
  readonly lineWidth: number;
  readonly opacity: number;
  readonly kind: StudioOilRibbonImpastoReliefKind;
}

export type StudioOilRibbonImpastoReliefKind = "highlight" | "shadow";

export interface StudioOilRibbonCarrierPlan {
  readonly version: typeof STUDIO_OIL_RIBBON_CARRIER_VERSION;
  readonly sourceStationCount: number;
  readonly body: StudioOilRibbonPath | null;
  readonly bodyOpacity: number;
  readonly bristleLanes: readonly StudioOilRibbonBristleLane[];
  /** The body is a single connected outline; it never emits a repeated round/ellipse stamp. */
  readonly repeatedBodyStampCount: 0;
  /**
   * dli/paint GGX relief overlay lanes (`brush--impasto-relief` program). The key is present iff
   * the `impastoRelief` option is enabled, so every legacy plan stays structurally and
   * byte-identical. Paint order is the array order: shadows first, glints last.
   */
  readonly impastoReliefLanes?: readonly StudioOilRibbonImpastoReliefLane[];
}

/**
 * Program flag for the v1 bristle load dynamics variant
 * (`brush--bristle-depletion`). The flag gates every behavioural change: with
 * the options object absent, or `enabled` false, the plan is byte-identical to
 * the legacy carrier so every shipped oil brush keeps its exact mark.
 */
export interface StudioOilRibbonCarrierBristleLoadDynamicsOptions {
  readonly enabled: boolean;
  /** Deterministic seed — pass the stroke's brush seed. Default 0. */
  readonly seed?: number;
  /**
   * Normalized 0..1 stylus pressure per station. When omitted, a proxy is
   * derived from each station's planned opacity (see
   * `pressureProxyFromStationOpacity`) — explicit pressures are preferred.
   */
  readonly pressures?: readonly number[];
  /** Normalized 0..1 speed per station; omitted → no speed-driven depletion. */
  readonly speeds?: readonly number[];
  /** Ink dip at stroke start, 0..1 (default 1 = fully loaded). */
  readonly initialLoad?: number;
  /** Depletion dial (default 1; 0 = pressure/footprint response only). */
  readonly depletionRate?: number;
}

/**
 * Program flag for the dli GGX relief overlay (`brush--impasto-relief`). Enabling it only APPENDS
 * `impastoReliefLanes` to the plan — body, bodyOpacity and bristleLanes stay byte-identical — and
 * every lane without the flag keeps a structurally identical plan (no key at all). The overlay is
 * a pure function of the settled base geometry; it deliberately reads the raw station/bristle
 * loads, not the depletion-modulated ones, so the two v1 programs stay independent.
 */
export interface StudioOilRibbonCarrierImpastoReliefOptions {
  readonly enabled: boolean;
}

/**
 * Program flag for the v1 WetBrush-2D physics variant (`brush--bristle-physics`).
 * Enabling it swaps the hashed per-station lane offsets for the simulated
 * tuft's contact trajectory and modulates lane load/width by the sim's contact
 * alpha and flattening (see studio-bristle-physics-oil-v1). The flag gates
 * every behavioural change: with the options object absent, or `enabled`
 * false, the plan is byte-identical to the legacy carrier.
 */
export interface StudioOilRibbonCarrierBristlePhysicsOptions {
  readonly enabled: boolean;
  /** Deterministic seed — pass the stroke's brush seed. Default 0. */
  readonly seed?: number;
  /** Normalized 0..1 stylus pressure per station; omitted → opacity proxy. */
  readonly pressures?: readonly number[];
  /** Normalized 0..1 speed per station; omitted → derived from geometry. */
  readonly speeds?: readonly number[];
  /** Canvas-plane tilt, each -1..1. Default untilted. */
  readonly tiltX?: number;
  readonly tiltY?: number;
  /** Simulated hair count, clamped into 16..32 by the physics module. */
  readonly bristleCount?: number;
  /** Ink dip at stroke start, 0..1 (default 1 = fully loaded). */
  readonly initialLoad?: number;
}

export interface StudioOilRibbonCarrierOptions {
  readonly bristleLoadDynamics?: StudioOilRibbonCarrierBristleLoadDynamicsOptions;
  readonly impastoRelief?: StudioOilRibbonCarrierImpastoReliefOptions;
  readonly bristlePhysics?: StudioOilRibbonCarrierBristlePhysicsOptions;
}

/**
 * Which carrier programs a given oil/acrylic lane runs.
 *
 * This replaces an either/or `brush === ...` chain that was duplicated in the Canvas renderer and
 * the SVG exporter. The chain could only ever grant ONE program, so a lane could not be both
 * loaded and impasto, and every lane that was not one of the three demo ids fell through to the
 * plain carrier - which is why oil--filbert-ribbon, oil--impasto-ribbon and brush--oil-lanes all
 * painted the same bed. Returning the option object from one place makes combinations expressible
 * and keeps the two renderers from drifting into disagreeing about a stroke's programs.
 *
 * The matrix is physical, not decorative:
 * - a filbert is a loaded tuft, so it splays under pressure          -> bristlePhysics
 * - impasto is that same tuft leaving standing ridges                -> bristlePhysics + relief
 * - flat and acrylic-stiff declare a HARD tip: flat instruments whose mechanism is not tuft
 *   splay, so they stay off the sim (acrylic is already separated by its fast-setting body)
 * - brush--oil-lanes stays plain, which is what now distinguishes it from the filbert
 */
export function studioOilRibbonProgramsForBrush(
  brush: string,
  seed: number,
): StudioOilRibbonCarrierOptions | undefined {
  const bristlePhysics = { enabled: true, seed } as const;
  switch (brush) {
    case "brush--bristle-physics":
      // The mechanics showcase runs BOTH mechanical programs. It has to stay distinguishable from
      // oil--filbert-ribbon, which now also runs the sim: with the sim alone the two planned
      // identical beds (same lane widths, same opacities). Quarantining the demo instead is not
      // available - it is a pinned experimental lane and the governance audit keeps it through its
      // lab period - so it earns its own identity rather than losing its row.
      return { bristlePhysics, bristleLoadDynamics: { enabled: true, seed } };
    case "brush--bristle-depletion":
      return { bristleLoadDynamics: { enabled: true, seed } };
    case "brush--impasto-relief":
      return { impastoRelief: { enabled: true } };
    case "oil--filbert-ribbon":
      return { bristlePhysics };
    case "oil--impasto-ribbon":
      return { bristlePhysics, impastoRelief: { enabled: true } };
    default:
      return undefined;
  }
}


interface OilCarrierStation {
  readonly x: number;
  readonly y: number;
  readonly tangentX: number;
  readonly tangentY: number;
  readonly normalX: number;
  readonly normalY: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly opacity: number;
  readonly source: FxOilDab;
}

interface SmoothedOilCarrierGeometry {
  readonly x: number;
  readonly y: number;
  readonly radiusX: number;
  readonly radiusY: number;
}

export interface StudioOilRibbonPathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath?(): void;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function quantize(value: number): number {
  return Math.round(
    clamp(finite(value, 0), -COORDINATE_LIMIT, COORDINATE_LIMIT)
      * GEOMETRY_QUANTIZATION,
  ) / GEOMETRY_QUANTIZATION;
}

function quantizedPoints(points: readonly number[]): readonly number[] {
  return Object.freeze(points.map(quantize));
}

function accumulatedOpacity(opacity: number, overlapCount: number): number {
  const normalized = clamp(finite(opacity, 0), 0, 1);
  return clamp(1 - ((1 - normalized) ** overlapCount), 0, 0.96);
}

function normalizedDabs(dabs: readonly FxOilDab[]): readonly FxOilDab[] {
  const accepted: FxOilDab[] = [];
  for (const dab of dabs) {
    if (!Number.isFinite(dab.x) || !Number.isFinite(dab.y)) continue;
    accepted.push(dab);
  }
  return accepted;
}

function weightedMovingAverage(
  values: readonly number[],
  index: number,
  radius: number,
): number {
  let weighted = 0;
  let totalWeight = 0;
  for (let offset = -radius; offset <= radius; offset += 1) {
    const sample = values[index + offset];
    if (sample === undefined) continue;
    const weight = radius + 1 - Math.abs(offset);
    weighted += sample * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weighted / totalWeight : values[index] ?? 0;
}

function smoothGeometry(dabs: readonly FxOilDab[]): readonly SmoothedOilCarrierGeometry[] {
  const xs = dabs.map(({ x }) => x);
  const ys = dabs.map(({ y }) => y);
  const radiusXs = dabs.map(({ radiusX }) => radiusX);
  const radiusYs = dabs.map(({ radiusY }) => radiusY);
  return Object.freeze(dabs.map((dab, index) => Object.freeze({
    // Normal-offset jitter belonged to the old overlapping-dab texture. Smooth it out of the
    // silhouette; the five explicit bristle lanes now own all high-frequency material detail.
    x: index === 0 || index === dabs.length - 1
      ? dab.x
      : weightedMovingAverage(xs, index, 3),
    y: index === 0 || index === dabs.length - 1
      ? dab.y
      : weightedMovingAverage(ys, index, 3),
    radiusX: weightedMovingAverage(radiusXs, index, 4),
    // Radius jitter is intentionally filtered more strongly than the centreline. Without this
    // separation a one-pixel sawtooth appears on both edges of an otherwise continuous ribbon.
    radiusY: weightedMovingAverage(radiusYs, index, 6),
  })));
}

function tangentAt(
  geometry: readonly SmoothedOilCarrierGeometry[],
  index: number,
  fallbackAngle: number,
): readonly [number, number] {
  const current = geometry[index]!;
  const before = geometry[Math.max(0, index - 2)] ?? current;
  const after = geometry[Math.min(geometry.length - 1, index + 2)] ?? current;
  let dx = after.x - before.x;
  let dy = after.y - before.y;
  let length = Math.hypot(dx, dy);
  if (length <= POINT_EPSILON) {
    dx = Math.cos(finite(fallbackAngle, 0));
    dy = Math.sin(finite(fallbackAngle, 0));
    length = Math.max(POINT_EPSILON, Math.hypot(dx, dy));
  }
  return [dx / length, dy / length];
}

function collectStations(dabs: readonly FxOilDab[]): readonly OilCarrierStation[] {
  const geometry = smoothGeometry(dabs);
  return Object.freeze(dabs.map((source, index) => {
    const planned = geometry[index]!;
    const [tangentX, tangentY] = tangentAt(geometry, index, source.angleRad);
    return Object.freeze({
      x: quantize(planned.x),
      y: quantize(planned.y),
      tangentX,
      tangentY,
      normalX: -tangentY,
      normalY: tangentX,
      radiusX: clamp(finite(planned.radiusX, 0.4), 0.05, COORDINATE_LIMIT / 4),
      radiusY: clamp(finite(planned.radiusY, 0.25), 0.05, COORDINATE_LIMIT / 4),
      opacity: clamp(finite(source.opacity, 0), 0, 1),
      source,
    });
  }));
}

function directionalTap(station: OilCarrierStation): StudioOilRibbonPath {
  const axis = Math.max(station.radiusX, station.radiusY * 1.25);
  const cross = station.radiusY;
  const diagonalAxis = axis * 0.68;
  const diagonalCross = cross * 0.72;
  const { x, y, tangentX: tx, tangentY: ty, normalX: nx, normalY: ny } = station;
  return Object.freeze({
    points: quantizedPoints([
      x + tx * axis,
      y + ty * axis,
      x + tx * diagonalAxis + nx * diagonalCross,
      y + ty * diagonalAxis + ny * diagonalCross,
      x + nx * cross,
      y + ny * cross,
      x - tx * diagonalAxis + nx * diagonalCross,
      y - ty * diagonalAxis + ny * diagonalCross,
      x - tx * axis,
      y - ty * axis,
      x - tx * diagonalAxis - nx * diagonalCross,
      y - ty * diagonalAxis - ny * diagonalCross,
      x - nx * cross,
      y - ny * cross,
      x + tx * diagonalAxis - nx * diagonalCross,
      y + ty * diagonalAxis - ny * diagonalCross,
    ]),
  });
}

/**
 * Directional cap the body overhangs its first and last station by.
 *
 * Shared with the bristle lanes on purpose. The body used to own these numbers privately and the
 * hairs stopped dead at the outermost station, so both ends of every oil stroke were up to 0.96
 * half-widths of smooth untextured pigment - a blunt blob stuck on a bed that is otherwise all
 * ridge and furrow, at exactly the two places a viewer looks first. Extracting the shoulder lets
 * `bristleCapPoint` place hair tips inside the same outline instead of guessing at it.
 */
const OIL_BODY_CAP_AXIS_SCALE = 0.56;
const OIL_BODY_CAP_RADIUS_SCALE = 0.96;
/** Where the cap's widest point sits, as a fraction of the cap, and its half-width there. */
const OIL_BODY_CAP_SHOULDER = 0.5;
const OIL_BODY_CAP_SHOULDER_WIDTH = 0.84;

function bodyCapLength(station: OilCarrierStation): number {
  return Math.min(
    station.radiusX * OIL_BODY_CAP_AXIS_SCALE,
    station.radiusY * OIL_BODY_CAP_RADIUS_SCALE,
  );
}

/**
 * Where a hair carrying `offset` reaches into the cap, one station past the end of the path.
 *
 * The tip stops at the cap's shoulder rather than its point, and its offset is scaled by the
 * shoulder's own half-width, so the hair lands just inside the body outline. Running it to the
 * point instead would push the outer hairs past the closing pigment and leave them hanging in
 * open space; leaving the last stretch to smooth body is also what a loaded brush does, since the
 * film closes over the hairs where they lift off.
 */
function bristleCapPoint(
  station: OilCarrierStation,
  offset: number,
  direction: 1 | -1,
): readonly [number, number] {
  const reach = bodyCapLength(station) * OIL_BODY_CAP_SHOULDER * direction;
  return [
    station.x + station.tangentX * reach + station.normalX * offset * OIL_BODY_CAP_SHOULDER_WIDTH,
    station.y + station.tangentY * reach + station.normalY * offset * OIL_BODY_CAP_SHOULDER_WIDTH,
  ];
}

function variableWidthBody(stations: readonly OilCarrierStation[]): StudioOilRibbonPath {
  const first = stations[0]!;
  const last = stations.at(-1)!;
  const firstCap = bodyCapLength(first);
  const lastCap = bodyCapLength(last);
  const points: number[] = [
    first.x - first.tangentX * firstCap,
    first.y - first.tangentY * firstCap,
    first.x - first.tangentX * firstCap * OIL_BODY_CAP_SHOULDER
      + first.normalX * first.radiusY * OIL_BODY_CAP_SHOULDER_WIDTH,
    first.y - first.tangentY * firstCap * OIL_BODY_CAP_SHOULDER
      + first.normalY * first.radiusY * OIL_BODY_CAP_SHOULDER_WIDTH,
  ];

  for (const station of stations) {
    points.push(
      station.x + station.normalX * station.radiusY,
      station.y + station.normalY * station.radiusY,
    );
  }
  const lastShoulder = lastCap * OIL_BODY_CAP_SHOULDER;
  const lastShoulderWidth = last.radiusY * OIL_BODY_CAP_SHOULDER_WIDTH;
  points.push(
    last.x + last.tangentX * lastShoulder + last.normalX * lastShoulderWidth,
    last.y + last.tangentY * lastShoulder + last.normalY * lastShoulderWidth,
    last.x + last.tangentX * lastCap,
    last.y + last.tangentY * lastCap,
    last.x + last.tangentX * lastShoulder - last.normalX * lastShoulderWidth,
    last.y + last.tangentY * lastShoulder - last.normalY * lastShoulderWidth,
  );
  for (let index = stations.length - 1; index >= 0; index -= 1) {
    const station = stations[index]!;
    points.push(
      station.x - station.normalX * station.radiusY,
      station.y - station.normalY * station.radiusY,
    );
  }
  points.push(
    first.x - first.tangentX * firstCap * OIL_BODY_CAP_SHOULDER
      - first.normalX * first.radiusY * OIL_BODY_CAP_SHOULDER_WIDTH,
    first.y - first.tangentY * firstCap * OIL_BODY_CAP_SHOULDER
      - first.normalY * first.radiusY * OIL_BODY_CAP_SHOULDER_WIDTH,
  );
  return Object.freeze({ points: quantizedPoints(points) });
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Stations per emitted bristle run.
 *
 * The planner already varies each bristle's tooth per station (`hash2(si, 31 + i*7, seed)` in
 * `planOilBrushDabs` drives `radiusYRatio` and `opacity`), but collapsing a whole stroke into one
 * `mean()` width and one `mean()` opacity erased every bit of that: a 770 px oil stroke measured a
 * length-axis coefficient of variation of 0.002, i.e. it was constant along its own travel. Cutting
 * each hair into short runs lets the load change as the brush travels. Runs share their boundary
 * station with the next run, so the hair stays continuous.
 */
const BRISTLE_RUN_STATIONS = 5;

/**
 * Load bands the runs of one width gauge are quantised into - the stroke's tonal resolution.
 *
 * This used to be pinned at three by self-crossings rather than by tone: each band was its own
 * multiply pass, so N bands folded N alphas wherever a stroke crossed itself and the figure-eight
 * knot probe went 0.038 -> 0.084 -> 0.123 -> 0.135 (3/6/12/16 bands) against a limit three passes
 * only just cleared. Raising it bought interior tone and paid for it in dark knots.
 *
 * The shells below untie the two: a band's cost at a crossing is now zero regardless of the count,
 * so the constant is set by tone alone. Measured on a rendered stroke, the share of ink in the two
 * most-occupied tone bins falls 0.507 (3) -> 0.321 (6) -> 0.280 (12) -> 0.237 (16) -> 0.250 (24),
 * with entropy 3.41 -> 4.03 -> 4.37 -> 4.55 -> 4.57 bits. Sixteen is the knee: past it bands start
 * coming up empty (24 requested, 23 populated) and tone stops improving while the shell count, and
 * with it the repainted geometry, keeps growing.
 */
const BRISTLE_LOAD_BANDS = 16;

/**
 * Virtual overlaps folded into one deposit. See `planStudioOilRibbonCarrier` for the body budget.
 *
 * Lowered 14 -> 6 because 14 put the fold deep in its own saturated regime, and that - not the load
 * signal - is what made every oil stroke read as two flat tones. `accumulatedOpacity` folds n
 * overlaps as `1 - (1-a)^n` clamped at 0.96, so at n=14 ANY per-dab alpha above about 0.2 lands on
 * the ceiling: two of the three load bands came out at exactly 0.96 and the whole loaded range
 * collapsed onto a single value.
 *
 * Measured on a rendered stroke - share of inked pixels in the two most-occupied tone bins, so
 * LOWER means more tonal range and less of the "단 2색" flatness that was reported:
 *   n=14 71.1% [0.574, 0.96, 0.96]    n=10 72.0% [0.456, 0.96, 0.96]    n=8 70.8%    n=7 70.6%
 *   n=6  54.6% [0.306, 0.902, 0.96]   n=5  58.0%                        n=3 60.3%
 * Six is the knee: above it the second band re-saturates onto the ceiling, below it the bands
 * start collapsing downward instead. Mean ink moves only 0.883 -> 0.847 and the ink standard
 * deviation is unchanged, so this buys tonal range without thinning the stroke.
 */
const BRISTLE_VIRTUAL_OVERLAPS = 6;

/**
 * Ridge-width classes the runs are split into before they are banded by load.
 *
 * Two jobs, one split. The first is texture: a run's width comes from its own hair
 * (`0.15 + radiusYRatio * 1.18`, a 9x range across hairs) but the emitted lane can only carry one
 * `lineWidth`, and the old code averaged that over a whole load band. Load and width are drawn
 * from independent hashes, so every band's width mean converged on the same global mean and the
 * bed rendered as hairs of one thickness - a bristle brush whose hairs are all identical is
 * exactly the "단 2색" flatness read from the other direction.
 *
 * The second is a precondition for the load shells below: a shell repaints its members' geometry,
 * so every run inside one gauge must stroke at the SAME width or a run would be laid down at two
 * different widths by two shells and halo. Splitting on width first makes each gauge homogeneous
 * and the shells exact.
 *
 * Three gauges, because gauges are the one axis that still folds at a self-crossing (shells remove
 * the fold inside a gauge but not between them), and three folds is the depth the knot gate is
 * already measured against.
 */
export const STUDIO_OIL_BRISTLE_WIDTH_GAUGES = 2;

/**
 * Smallest incremental deposit a shell may carry before it is folded into the next one.
 *
 * A shell that darkens what is under it by less than one 8-bit step cannot change the rendered
 * image, but it still costs a full repaint of every run at and above its band. 1/255 is that step;
 * the bands it absorbs are the ones whose mean loads landed close enough together that they were
 * going to render as one tone anyway.
 */
const BRISTLE_SHELL_VISIBLE_DEPOSIT = 1 / 255;

interface PlannedBristleRun {
  readonly points: readonly number[];
  readonly load: number;
  readonly width: number;
}

interface BristleWidthGauge {
  readonly runs: readonly PlannedBristleRun[];
  readonly lineWidth: number;
}

/** Equal-count width quantiles, so each gauge is a real population rather than an empty bucket. */
function widthGauges(planned: readonly PlannedBristleRun[]): readonly BristleWidthGauge[] {
  const ordered = [...planned].sort((left, right) => left.width - right.width);
  const gauges: BristleWidthGauge[] = [];
  const size = Math.ceil(ordered.length / STUDIO_OIL_BRISTLE_WIDTH_GAUGES);
  for (let start = 0; start < ordered.length; start += size) {
    const runs = ordered.slice(start, start + size);
    if (runs.length === 0) continue;
    gauges.push({ runs, lineWidth: mean(runs.map(({ width }) => width)) });
  }
  return gauges;
}

function planBristleLanes(
  stations: readonly OilCarrierStation[],
  dynamics?: StudioOilBristleLoadDynamicsPlan,
  physics?: StudioBristlePhysicsOilPlan,
): readonly StudioOilRibbonBristleLane[] {
  if (stations.length < 2) return [];
  const bristleCount = Math.min(
    ...stations.map((station) => station.source.bristles.length),
  );
  const planned: PlannedBristleRun[] = [];
  let minimumLoad = Number.POSITIVE_INFINITY;
  let maximumLoad = Number.NEGATIVE_INFINITY;
  for (let bristleIndex = 0; bristleIndex < bristleCount; bristleIndex += 1) {
    for (
      let runStart = 0;
      runStart < stations.length - 1;
      runStart += BRISTLE_RUN_STATIONS
    ) {
      const runEnd = Math.min(stations.length - 1, runStart + BRISTLE_RUN_STATIONS);
      const points: number[] = [];
      for (let index = runStart; index <= runEnd; index += 1) {
        const station = stations[index]!;
        const bristle = station.source.bristles[bristleIndex]!;
        // v1 bristle physics (flag-gated): the simulated tuft's contact
        // trajectory replaces the hashed per-station offset, in the same
        // radiusY units, so splay/hysteresis/clump-split drive the lane path.
        const offset = physics
          ? station.radiusY
            * physics.laneOffsetRatio[index * physics.laneCount + bristleIndex]!
          : station.radiusY * bristle.offsetRatio;
        // The body overhangs the outermost stations by a directional cap. A hair that stopped at
        // the station left that cap as smooth pigment, so every oil stroke began and ended with a
        // blunt untextured head. Reaching one point into the cap - at the same shoulder the body
        // outline turns on - carries the ridge and furrow all the way to the tip.
        if (index === 0) points.push(...bristleCapPoint(station, offset, -1));
        points.push(
          station.x + station.normalX * offset,
          station.y + station.normalY * offset,
        );
        if (index === stations.length - 1) points.push(...bristleCapPoint(station, offset, 1));
      }
      // One representative station per run rather than the run's mean. Averaging is what erased the
      // tooth: the per-station noise is independent, so a mean over six stations shrinks its
      // amplitude by √6 and a mean over a whole stroke annihilates it.
      const sampleIndex = Math.min(runEnd, runStart + (BRISTLE_RUN_STATIONS >> 1));
      const sample = stations[sampleIndex]!;
      const sampleBristle = sample.source.bristles[bristleIndex]!;
      let load = clamp(sample.opacity * sampleBristle.opacity, 0, 1);
      // Size ridges against lane pitch so seven hairs leave real furrows without repainting the
      // body. 0.15–0.28·radiusY keeps impasto readable at 1× while surviving the body opacity
      // headroom reserved below.
      let width = Math.max(0.38, sample.radiusY * (0.15 + sampleBristle.radiusYRatio * 1.18));
      if (dynamics) {
        // v1 load dynamics (flag-gated): the lane's evolving film strength
        // scales the deposit and the flattened footprint widens the ridge.
        load = clamp(
          load * dynamics.laneFilmStrength[sampleIndex * dynamics.laneCount + bristleIndex]!,
          0,
          1,
        );
        width *= dynamics.footprintScale[sampleIndex]!;
      }
      if (physics) {
        // v1 bristle physics (flag-gated): simulated contact alpha modulates
        // the deposit (lifted/starving hairs thin) and simulated contact
        // radius flattens/thins the ridge width per lane.
        load = clamp(
          load * physics.laneLoadMultiplier[sampleIndex * physics.laneCount + bristleIndex]!,
          0,
          1,
        );
        width *= physics.laneWidthScale[sampleIndex * physics.laneCount + bristleIndex]!;
      }
      minimumLoad = Math.min(minimumLoad, load);
      maximumLoad = Math.max(maximumLoad, load);
      planned.push({ points, load, width });
    }
  }
  if (planned.length === 0) return [];

  const span = maximumLoad - minimumLoad;
  const lanes: StudioOilRibbonBristleLane[] = [];
  for (const gauge of widthGauges(planned)) {
    const bands: PlannedBristleRun[][] = Array.from(
      { length: BRISTLE_LOAD_BANDS },
      () => [],
    );
    for (const run of gauge.runs) {
      const normalized = span > POINT_EPSILON ? (run.load - minimumLoad) / span : 0;
      const band = Math.min(
        BRISTLE_LOAD_BANDS - 1,
        Math.floor(normalized * BRISTLE_LOAD_BANDS),
      );
      bands[band]!.push(run);
    }

    // Target deposit per band, monotone in load. Flat overlap count, deliberately: the bands are
    // ALREADY ordered by load, so scaling the overlap count by the band index applied that
    // ordering a second time and pushed the top of the load range onto `accumulatedOpacity`'s
    // 0.96 clamp - measured across 288 planned strokes, 126 emitted only TWO distinct lane
    // opacities and none ever exceeded three.
    const occupied: { band: number; target: number; runs: PlannedBristleRun[] }[] = [];
    let previousTarget = 0;
    for (const [band, runs] of bands.entries()) {
      if (runs.length === 0) continue;
      const target = Math.max(
        previousTarget,
        accumulatedOpacity(mean(runs.map(({ load }) => load)), BRISTLE_VIRTUAL_OVERLAPS),
      );
      occupied.push({ band, target, runs });
      previousTarget = target;
    }

    // Cumulative shells, not one pass per band. Shell k carries every run in band >= k, so a
    // pixel in band m is painted by shells 0..m and its folded transmittance is the telescoping
    // product of (1 - delta), which is exactly 1 - target(m). Two arms crossing at bands i and m
    // are jointly covered by shells 0..max(i, m) and each shell is ONE paint, so the crossing
    // lands on max(target) instead of folding both - the knot cost of a band goes to zero and the
    // count stops being capped by self-crossings.
    let carried = 0;
    for (let index = 0; index < occupied.length; index += 1) {
      const entry = occupied[index]!;
      // Incremental deposit that lands the fold on this band's target given everything already
      // laid by the shells outside it.
      const delta = carried >= 1
        ? 0
        : clamp(1 - (1 - entry.target) / (1 - carried), 0, 1);
      // A shell repaints every run at and above its band, so it is the most expensive thing this
      // planner emits - measured, the shells raise an oil stroke's lane path data about 6x. One
      // whose deposit cannot survive 8-bit quantisation is pure cost, so it is absorbed rather
      // than emitted: `carried` is deliberately NOT advanced, which leaves the skipped band's
      // target to the next shell that IS worth painting, so tone stays exact instead of drifting.
      if (delta < BRISTLE_SHELL_VISIBLE_DEPOSIT) continue;
      carried = entry.target;
      const shell = occupied.slice(index).flatMap(({ runs }) => runs);
      lanes.push(Object.freeze({
        runs: Object.freeze(shell.map((run) => Object.freeze({
          points: quantizedPoints(run.points),
        }))),
        lineWidth: quantize(gauge.lineWidth),
        opacity: quantize(delta),
        loadBand: entry.band,
      }));
    }
  }
  return Object.freeze(lanes);
}

/**
 * Pressure proxy used when the dynamics flag is enabled without explicit
 * pressures: inverts the planner's non-tap station opacity map
 * (`0.16 + pressureFeel·0.38 + n2·0.045`, clamped to [0.14, 0.62]). A proxy —
 * programs that own the raw stylus samples should pass `pressures` instead.
 */
function pressureProxyFromStationOpacity(opacity: number): number {
  return clamp((opacity - 0.16) / 0.38, 0, 1);
}

/**
 * v1 bristle-physics adapter (`brush--bristle-physics`). Feeds the carrier's
 * own smoothed centreline and pressure proxy into the platform's WetBrush-2D
 * tuft; lane count and station count come from the exact same `stations` array
 * the band walker iterates, so the returned streams index it 1:1 by
 * construction.
 */
function planBristlePhysics(
  stations: readonly OilCarrierStation[],
  options: StudioOilRibbonCarrierBristlePhysicsOptions,
): StudioBristlePhysicsOilPlan | undefined {
  if (stations.length < 2) return undefined;
  const laneCount = Math.min(
    ...stations.map((station) => station.source.bristles.length),
  );
  if (laneCount <= 0) return undefined;
  const pressures = options.pressures && options.pressures.length > 0
    ? options.pressures
    : stations.map((station) => pressureProxyFromStationOpacity(station.opacity));
  return planStudioBristlePhysicsOil({
    stationXs: stations.map((station) => station.x),
    stationYs: stations.map((station) => station.y),
    laneCount,
    seed: Math.floor(finite(options.seed, 0)),
    // Tuft rest half-width — the offset stream's normalization radius.
    baseRadiusPx: mean(stations.map((station) => station.radiusY)),
    pressures,
    ...(options.speeds ? { speeds: options.speeds } : {}),
    ...(options.tiltX !== undefined ? { tiltX: options.tiltX } : {}),
    ...(options.tiltY !== undefined ? { tiltY: options.tiltY } : {}),
    ...(options.bristleCount !== undefined
      ? { bristleCount: options.bristleCount }
      : {}),
    ...(options.initialLoad !== undefined
      ? { initialLoad: options.initialLoad }
      : {}),
  });
}

function planLoadDynamics(
  stations: readonly OilCarrierStation[],
  options: StudioOilRibbonCarrierBristleLoadDynamicsOptions,
): StudioOilBristleLoadDynamicsPlan | undefined {
  if (stations.length < 2) return undefined;
  const laneCount = Math.min(
    ...stations.map((station) => station.source.bristles.length),
  );
  if (laneCount <= 0) return undefined;
  const pressures = options.pressures && options.pressures.length > 0
    ? options.pressures
    : stations.map((station) => pressureProxyFromStationOpacity(station.opacity));
  return planStudioOilBristleLoadDynamics({
    stationCount: stations.length,
    laneCount,
    seed: Math.floor(finite(options.seed, 0)),
    pressures,
    ...(options.speeds ? { speeds: options.speeds } : {}),
    ...(options.initialLoad !== undefined ? { initialLoad: options.initialLoad } : {}),
    ...(options.depletionRate !== undefined
      ? { depletionRate: options.depletionRate }
      : {}),
  });
}

// ---------------------------------------------------------------------------
// Impasto relief overlay (brush--impasto-relief) — dli/paint GGX on a
// stroke-local height field folded from the ribbon's own geometry.
// ---------------------------------------------------------------------------

export const STUDIO_OIL_IMPASTO_RELIEF_OVERLAY_VERSION =
  "oil-impasto-relief-overlay-v1" as const;

/**
 * Exact glint color both durable surfaces stroke under `screen`. dli adds the GGX specular as an
 * achromatic term on top of the pigment (`color·diffuse + specular`), so the vector expression of
 * "specular" is white-toward light, never a hue shift.
 */
export const STUDIO_OIL_IMPASTO_RELIEF_HIGHLIGHT_COLOR = "#ffffff" as const;

/**
 * Program budget: the stroke-local height grid never exceeds this long side (cells). Held at the
 * cap because the interior signal — corrugation between hairs pitched ~0.3·radiusY apart — needs
 * ≥3 cells per pitch before the Sobel window can see it; central differences are blind to
 * period-2 patterns, so a coarser tile silently flattens the whole bristle bed.
 */
const IMPASTO_RELIEF_GRID_LONG_SIDE = 256;
/**
 * Cell-count cap for blob-shaped strokes (a dense scribble is ~256² cells; a long stroke is a
 * thin strip). The cap coarsens only the pathological 2-D case — where self-crossing flattens
 * the interior field anyway — and keeps the plan inside its tested time budget.
 */
const IMPASTO_RELIEF_GRID_MAX_CELLS = 40_000;
/** Tiny strokes stop refining below this cell size so the Sobel window stays meaningful. */
const IMPASTO_RELIEF_MIN_CELL_PX = 0.75;
/** Wet film level deposited by the body (heights stay 0..1 like paint.js's alpha channel). */
const IMPASTO_RELIEF_FILM_HEIGHT = 0.5;
/** Extra standing-paint level a fully loaded bristle ridge adds on top of the film. */
const IMPASTO_RELIEF_RIDGE_HEIGHT = 0.55;
/**
 * Ridge cross-section radius in cells. Deliberately narrower than the hair pitch (~0.3·radiusY)
 * at typical grids: at 1.15 the neighbouring tents merged into one plateau and the whole bristle
 * bed shaded flat — the corrugation between hairs IS the interior impasto signal.
 */
const IMPASTO_RELIEF_RIDGE_REACH_CELLS = 0.8;
/** Film rim slope width in cells — the body edge is a paint cliff, not a hard alias step. */
const IMPASTO_RELIEF_EDGE_FEATHER_CELLS = 1.5;
/**
 * dli's normalScale 7 is tuned for a canvas whose alpha saturates under accumulated strokes; a
 * single stroke's tile at the coarse plan grid carries roughly half that paint, so the module's
 * own heightScale dial restores the reference slope response without touching the BRDF.
 */
const IMPASTO_RELIEF_HEIGHT_SCALE = 3;
/**
 * |shading − 1| below this is flat paint; no overlay geometry is emitted for it. The height field
 * is max-blended and fully deterministic, so flat film is EXACTLY 1.0 — the floor only needs to
 * reject true flatness, and it stays low so the dli lamp's continuous cues survive: a diagonal
 * upper rim earns ~2% wrapped-diffuse light (its in-plane normal cannot align with the half
 * vector, so no specular), and bilinear sampling halves the 1-texel bristle corrugation — both
 * genuine relief the reference shows continuously into the bright crest glints.
 */
const IMPASTO_RELIEF_MIN_STRENGTH = 0.01;
/**
 * Shading-multiplier distance → overlay opacity gains. The shadow gain is higher because dli's
 * wrapped diffuse (`d·0.15 + 0.85`) bounds how dark a back-facing flank can get (≈11% below
 * flat), while the GGX specular can push a lit crest several times brighter — without the
 * asymmetry one flank of every ridge would stay invisible.
 */
const IMPASTO_RELIEF_HIGHLIGHT_GAIN = 2.6;
const IMPASTO_RELIEF_SHADOW_GAIN = 3.6;
const IMPASTO_RELIEF_MAX_HIGHLIGHT_OPACITY = 0.44;
const IMPASTO_RELIEF_MAX_SHADOW_OPACITY = 0.34;
/** Like load bands: quantised buckets keep one paint pass per tone so crossings deposit once. */
const IMPASTO_RELIEF_OPACITY_BUCKETS = 3;
/**
 * Non-uniform bucket edges as fractions of the kind's opacity cap. Uniform thirds packed the
 * faint continuous relief AND the mid-tone flank accents into one bucket whose mean flattened
 * the whole overlay into a film; these edges keep whisper / accent / glint tonally apart.
 */
const IMPASTO_RELIEF_BUCKET_EDGE_LOW = 0.18;
const IMPASTO_RELIEF_BUCKET_EDGE_HIGH = 0.45;
/** Overlay geometry (centreline + half width) never leaves this fraction of the body half-width. */
const IMPASTO_RELIEF_MAX_OFFSET_RATIO = 0.94;

interface ImpastoReliefField {
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly cell: number;
  readonly originX: number;
  readonly originY: number;
  /** Flat-normalized dli shading multipliers (1 = flat paint). */
  readonly shading: Float32Array;
}

function impastoBristleCount(stations: readonly OilCarrierStation[]): number {
  let count = Number.POSITIVE_INFINITY;
  for (const station of stations) {
    count = Math.min(count, station.source.bristles.length);
  }
  return Number.isFinite(count) ? count : 0;
}

/**
 * Fold the ribbon's own band geometry into a coarse stroke-local height tile and relief-shade it
 * with the dli GGX port. Height is max-blended (paint level, not additive beading): the body film
 * is a capsule union along the centreline, each bristle hair raises a ridge proportional to its
 * planned load. Pure function of the stations — no clock, no randomness.
 */
function buildImpastoReliefField(
  stations: readonly OilCarrierStation[],
): ImpastoReliefField | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const station of stations) {
    const pad = Math.max(station.radiusY, station.radiusX * 0.62) + 2;
    minX = Math.min(minX, station.x - pad);
    minY = Math.min(minY, station.y - pad);
    maxX = Math.max(maxX, station.x + pad);
    maxY = Math.max(maxY, station.y + pad);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  const spanX = Math.max(1e-3, maxX - minX);
  const spanY = Math.max(1e-3, maxY - minY);
  let cell = Math.max(
    IMPASTO_RELIEF_MIN_CELL_PX,
    Math.max(spanX, spanY) / IMPASTO_RELIEF_GRID_LONG_SIDE,
  );
  const cellsAtLongSide = (spanX / cell) * (spanY / cell);
  if (cellsAtLongSide > IMPASTO_RELIEF_GRID_MAX_CELLS) {
    cell *= Math.sqrt(cellsAtLongSide / IMPASTO_RELIEF_GRID_MAX_CELLS);
  }
  const gridWidth = Math.max(4, Math.ceil(spanX / cell) + 1);
  const gridHeight = Math.max(4, Math.ceil(spanY / cell) + 1);
  const cellCount = gridWidth * gridHeight;
  const film = new Float32Array(cellCount);
  const feather = IMPASTO_RELIEF_EDGE_FEATHER_CELLS * cell;

  // Body film — capsule union of station discs. Striding by ~radiusY/3 keeps overlapping discs
  // from being rasterised hundreds of times; max-blend makes the stride invisible in the level.
  let travelled = Number.POSITIVE_INFINITY;
  let lastX = 0;
  let lastY = 0;
  for (let index = 0; index < stations.length; index += 1) {
    const station = stations[index]!;
    if (index > 0) travelled += Math.hypot(station.x - lastX, station.y - lastY);
    lastX = station.x;
    lastY = station.y;
    const stampGap = Math.max(cell, station.radiusY * 0.35);
    if (index !== 0 && index !== stations.length - 1 && travelled < stampGap) continue;
    travelled = 0;
    // Pressure loads more paint: heavier stations stand a little prouder of the canvas.
    const level = IMPASTO_RELIEF_FILM_HEIGHT * (0.72 + 0.28 * station.opacity);
    const radius = station.radiusY;
    const reach = radius + feather;
    const reachSquared = reach * reach;
    const minCellX = Math.max(0, Math.floor((station.x - reach - minX) / cell));
    const maxCellX = Math.min(gridWidth - 1, Math.ceil((station.x + reach - minX) / cell));
    const minCellY = Math.max(0, Math.floor((station.y - reach - minY) / cell));
    const maxCellY = Math.min(gridHeight - 1, Math.ceil((station.y + reach - minY) / cell));
    // Coverage saturates at 1 for `dist ≤ radius`; only the [radius, radius+feather] annulus
    // needs the sqrt falloff, which is what keeps a 2000-station film affordable.
    const innerSquared = radius * radius;
    for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
      const deltaY = minY + (cellY + 0.5) * cell - station.y;
      const deltaYSquared = deltaY * deltaY;
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        const deltaX = minX + (cellX + 0.5) * cell - station.x;
        const distanceSquared = deltaX * deltaX + deltaYSquared;
        if (distanceSquared > reachSquared) continue;
        const at = cellY * gridWidth + cellX;
        if (distanceSquared <= innerSquared) {
          if (level > film[at]!) film[at] = level;
          continue;
        }
        const coverage = clamp((radius - Math.sqrt(distanceSquared)) / feather + 1, 0, 1);
        if (coverage <= 0) continue;
        const value = level * coverage;
        if (value > film[at]!) film[at] = value;
      }
    }
  }

  // Bristle ridges — walk each hair's polyline (the exact geometry the lanes stroke) and raise a
  // load-proportional ridge. Max-blend per cell: a hair is a level of standing paint, and a
  // crossing of equal loads must not stack itself into a knot (mirrors the one-pass band rule).
  const ridge = new Float32Array(cellCount);
  const bristleCount = impastoBristleCount(stations);
  const ridgeReach = cell * IMPASTO_RELIEF_RIDGE_REACH_CELLS;
  const hairX = new Float64Array(stations.length);
  const hairY = new Float64Array(stations.length);
  const hairLoad = new Float64Array(stations.length);
  for (let bristleIndex = 0; bristleIndex < bristleCount; bristleIndex += 1) {
    for (let index = 0; index < stations.length; index += 1) {
      const station = stations[index]!;
      const hair = station.source.bristles[bristleIndex]!;
      const offset = station.radiusY * hair.offsetRatio;
      hairX[index] = station.x + station.normalX * offset;
      hairY[index] = station.y + station.normalY * offset;
      hairLoad[index] = clamp(station.opacity * hair.opacity, 0, 1);
    }
    for (let index = 0; index + 1 < stations.length; index += 1) {
      const fromX = hairX[index]!;
      const fromY = hairY[index]!;
      const toX = hairX[index + 1]!;
      const toY = hairY[index + 1]!;
      const fromLoad = hairLoad[index]!;
      const toLoad = hairLoad[index + 1]!;
      const segmentX = toX - fromX;
      const segmentY = toY - fromY;
      const steps = Math.max(
        1,
        Math.ceil(Math.sqrt(segmentX * segmentX + segmentY * segmentY) / (cell * 0.6)),
      );
      const ridgeReachSquared = ridgeReach * ridgeReach;
      // s = 0 duplicates the previous segment's endpoint sample; only the first segment needs it.
      for (let step = index === 0 ? 0 : 1; step <= steps; step += 1) {
        const t = step / steps;
        const pointX = fromX + segmentX * t;
        const pointY = fromY + segmentY * t;
        const level = IMPASTO_RELIEF_RIDGE_HEIGHT
          * (0.25 + 0.75 * (fromLoad + (toLoad - fromLoad) * t));
        const minCellX = Math.max(0, Math.floor((pointX - ridgeReach - minX) / cell));
        const maxCellX = Math.min(gridWidth - 1, Math.ceil((pointX + ridgeReach - minX) / cell));
        const minCellY = Math.max(0, Math.floor((pointY - ridgeReach - minY) / cell));
        const maxCellY = Math.min(gridHeight - 1, Math.ceil((pointY + ridgeReach - minY) / cell));
        for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
          const deltaY = minY + (cellY + 0.5) * cell - pointY;
          const deltaYSquared = deltaY * deltaY;
          for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
            const deltaX = minX + (cellX + 0.5) * cell - pointX;
            const distanceSquared = deltaX * deltaX + deltaYSquared;
            if (distanceSquared >= ridgeReachSquared) continue;
            const value = level * (1 - Math.sqrt(distanceSquared) / ridgeReach);
            const at = cellY * gridWidth + cellX;
            if (value > ridge[at]!) ridge[at] = value;
          }
        }
      }
    }
  }

  for (let at = 0; at < cellCount; at += 1) film[at]! += ridge[at]!;
  return {
    gridWidth,
    gridHeight,
    cell,
    originX: minX,
    originY: minY,
    // dli defaults verbatim (normalScale 7, roughness 0.075, F0 0.05, light (0,−1,1) image-space);
    // only heightScale compensates the single-stroke tile (see the constant above).
    shading: computeStudioImpastoReliefShading(film, {
      width: gridWidth,
      height: gridHeight,
      heightScale: IMPASTO_RELIEF_HEIGHT_SCALE,
    }),
  };
}

/** Bilinear shading sample at a canvas-space point (clamped to the tile like the shader). */
function sampleImpastoReliefShading(field: ImpastoReliefField, x: number, y: number): number {
  const gridX = clamp((x - field.originX) / field.cell - 0.5, 0, field.gridWidth - 1);
  const gridY = clamp((y - field.originY) / field.cell - 0.5, 0, field.gridHeight - 1);
  const x0 = Math.floor(gridX);
  const y0 = Math.floor(gridY);
  const x1 = Math.min(field.gridWidth - 1, x0 + 1);
  const y1 = Math.min(field.gridHeight - 1, y0 + 1);
  const tx = gridX - x0;
  const ty = gridY - y0;
  const top = field.shading[y0 * field.gridWidth + x0]! * (1 - tx)
    + field.shading[y0 * field.gridWidth + x1]! * tx;
  const bottom = field.shading[y1 * field.gridWidth + x0]! * (1 - tx)
    + field.shading[y1 * field.gridWidth + x1]! * tx;
  return top * (1 - ty) + bottom * ty;
}

interface PlannedImpastoReliefRun {
  readonly points: readonly number[];
  /** Mean signed shading distance from flat (positive = lit flank). */
  readonly strength: number;
  readonly width: number;
}

/**
 * Express the shaded height field as extra deterministic geometry both surfaces can render
 * identically: flank sub-bands along every bristle ridge plus a rim band along the body edge,
 * each classified by the shading buffer sampled where that flank lives at grid resolution.
 * Ridge orientation therefore FOLLOWS the light — with dli's (0, −1, 1) a horizontal ridge is
 * lit on its upper flank and shadowed on the lower one, and a ridge crossing (locally flat top)
 * emits nothing, exactly like the raster reference.
 */
function planImpastoReliefOverlayLanes(
  stations: readonly OilCarrierStation[],
): readonly StudioOilRibbonImpastoReliefLane[] {
  if (stations.length < 2) return Object.freeze([]);
  const field = buildImpastoReliefField(stations);
  if (!field) return Object.freeze([]);
  const planned: PlannedImpastoReliefRun[] = [];
  const bristleCount = impastoBristleCount(stations);

  const collectRun = (
    runStart: number,
    runEnd: number,
    pointAt: (station: OilCarrierStation, side: 1 | -1) => {
      readonly geomOffset: number;
      readonly sampleOffset: number;
      readonly width: number;
    },
    side: 1 | -1,
  ): void => {
    const points: number[] = [];
    let strengthSum = 0;
    let widthSum = 0;
    let samples = 0;
    for (let index = runStart; index <= runEnd; index += 1) {
      const station = stations[index]!;
      const at = pointAt(station, side);
      points.push(
        station.x + station.normalX * at.geomOffset,
        station.y + station.normalY * at.geomOffset,
      );
      strengthSum += sampleImpastoReliefShading(
        field,
        station.x + station.normalX * at.sampleOffset,
        station.y + station.normalY * at.sampleOffset,
      ) - 1;
      widthSum += at.width;
      samples += 1;
    }
    if (samples < 2) return;
    planned.push({
      points,
      strength: strengthSum / samples,
      width: widthSum / samples,
    });
  };

  for (let runStart = 0; runStart < stations.length - 1; runStart += BRISTLE_RUN_STATIONS) {
    const runEnd = Math.min(stations.length - 1, runStart + BRISTLE_RUN_STATIONS);
    for (const side of [-1, 1] as const) {
      // Ridge flanks — one lit and one shaded band per hair, clamped inside the body silhouette
      // so a screen-blended glint can never halo outside the paint.
      for (let bristleIndex = 0; bristleIndex < bristleCount; bristleIndex += 1) {
        collectRun(runStart, runEnd, (station, flankSide) => {
          const hair = station.source.bristles[bristleIndex]!;
          const ridgeWidth = Math.max(
            0.38,
            station.radiusY * (0.15 + hair.radiusYRatio * 1.18),
          );
          const width = Math.max(0.4, ridgeWidth * 0.85);
          const offset = station.radiusY * hair.offsetRatio;
          const flankDelta = Math.max(ridgeWidth * 0.5, field.cell * 0.4);
          const maxOffset =
            station.radiusY * IMPASTO_RELIEF_MAX_OFFSET_RATIO - width * 0.5;
          return {
            geomOffset: clamp(offset + flankSide * flankDelta, -maxOffset, maxOffset),
            // The flank stripe hugs the crest within one grid texel, and the next hair sits only
            // ~0.3·radiusY away — sample exactly one texel off the crest, never further, or the
            // probe lands on the neighbouring ridge's OPPOSITE flank and cancels the signal.
            sampleOffset: offset + flankSide * field.cell * 0.9,
            width,
          };
        }, side);
      }
      // Body rim — thick paint catches light along its own silhouette cliff.
      collectRun(runStart, runEnd, (station, rimSide) => {
        const width = clamp(station.radiusY * 0.26, 0.4, 2.6);
        const inset = Math.min(
          station.radiusY * 0.9,
          Math.max(station.radiusY * 0.7, station.radiusY - 1.6 * field.cell),
        );
        return {
          geomOffset: rimSide * inset,
          sampleOffset: rimSide * Math.max(station.radiusY - 0.9 * field.cell, station.radiusY * 0.5),
          width,
        };
      }, side);
    }
  }

  // Quantise into a bounded set of (kind, tone) lanes: one paint pass per lane keeps
  // self-crossings honest exactly like the load bands above.
  const buckets = new Map<string, {
    kind: StudioOilRibbonImpastoReliefKind;
    order: number;
    runs: PlannedImpastoReliefRun[];
    opacities: number[];
  }>();
  for (const run of planned) {
    const magnitude = Math.abs(run.strength);
    if (magnitude < IMPASTO_RELIEF_MIN_STRENGTH) continue;
    const kind: StudioOilRibbonImpastoReliefKind = run.strength > 0 ? "highlight" : "shadow";
    const maxOpacity = kind === "highlight"
      ? IMPASTO_RELIEF_MAX_HIGHLIGHT_OPACITY
      : IMPASTO_RELIEF_MAX_SHADOW_OPACITY;
    const gain = kind === "highlight"
      ? IMPASTO_RELIEF_HIGHLIGHT_GAIN
      : IMPASTO_RELIEF_SHADOW_GAIN;
    const opacity = Math.min(maxOpacity, magnitude * gain);
    const bucket = opacity < maxOpacity * IMPASTO_RELIEF_BUCKET_EDGE_LOW
      ? 0
      : opacity < maxOpacity * IMPASTO_RELIEF_BUCKET_EDGE_HIGH
        ? 1
        : IMPASTO_RELIEF_OPACITY_BUCKETS - 1;
    // Shadows first, glints last: paint order is the plan order on both surfaces.
    const order = (kind === "shadow" ? 0 : IMPASTO_RELIEF_OPACITY_BUCKETS) + bucket;
    const key = `${kind}:${bucket}`;
    const entry = buckets.get(key) ?? { kind, order, runs: [], opacities: [] };
    entry.runs.push(run);
    entry.opacities.push(opacity);
    buckets.set(key, entry);
  }

  const lanes = [...buckets.values()]
    .sort((left, right) => left.order - right.order)
    .map((entry) => Object.freeze({
      runs: Object.freeze(entry.runs.map((run) => Object.freeze({
        points: quantizedPoints(run.points),
      }))),
      lineWidth: quantize(mean(entry.runs.map(({ width }) => width))),
      opacity: quantize(mean(entry.opacities)),
      kind: entry.kind,
    }));
  return Object.freeze(lanes);
}

export function planStudioOilRibbonCarrier(
  inputDabs: readonly FxOilDab[],
  options?: StudioOilRibbonCarrierOptions,
): StudioOilRibbonCarrierPlan {
  const dabs = normalizedDabs(Array.isArray(inputDabs) ? inputDabs : []);
  const stations = collectStations(dabs);
  const averageOpacity = mean(stations.map((station) => station.opacity));
  const loadDynamicsOptions = options?.bristleLoadDynamics;
  const dynamics = loadDynamicsOptions?.enabled === true
    ? planLoadDynamics(stations, loadDynamicsOptions)
    : undefined;
  // v1 bristle physics touches ONLY the bristle lanes: body geometry/opacity
  // stay byte-identical so the pinned lane inherits the settled silhouette.
  const bristlePhysicsOptions = options?.bristlePhysics;
  const physics = bristlePhysicsOptions?.enabled === true
    ? planBristlePhysics(stations, bristlePhysicsOptions)
    : undefined;
  // The relief overlay is additive only: enabling it must never change the base plan fields, and
  // NOT enabling it must not even add the key (legacy plans stay structurally identical).
  const impastoReliefLanes = options?.impastoRelief?.enabled === true
    ? planImpastoReliefOverlayLanes(stations)
    : undefined;
  return Object.freeze({
    version: STUDIO_OIL_RIBBON_CARRIER_VERSION,
    sourceStationCount: stations.length,
    body: stations.length === 0
      ? null
      : stations.length === 1
        ? directionalTap(stations[0]!)
        : variableWidthBody(stations),
    // Body is the paint the bristles have already spread. Two virtual overlaps leave clear headroom
    // so multi-band ridges can still carve tonal relief on top of a continuous wet film.
    bodyOpacity: quantize(accumulatedOpacity(averageOpacity, 2)),
    bristleLanes: planBristleLanes(stations, dynamics, physics),
    repeatedBodyStampCount: 0,
    ...(impastoReliefLanes ? { impastoReliefLanes } : {}),
  });
}

export function traceStudioOilRibbonPath(
  sink: StudioOilRibbonPathSink,
  path: StudioOilRibbonPath,
  close = false,
): void {
  const [firstX, firstY, ...remaining] = path.points;
  if (firstX === undefined || firstY === undefined) return;
  sink.moveTo(firstX, firstY);
  for (let index = 0; index < remaining.length; index += 2) {
    const x = remaining[index];
    const y = remaining[index + 1];
    if (x === undefined || y === undefined) break;
    sink.lineTo(x, y);
  }
  if (close) sink.closePath?.();
}

function formatPathNumber(value: number): string {
  if (Object.is(value, -0)) return "0";
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(4).replace(/0+$/u, "").replace(/\.$/u, "");
}

/** SVG serializes the exact coordinates consumed by the retained Canvas renderer. */
export function studioOilRibbonPathData(
  path: StudioOilRibbonPath,
  close = false,
): string {
  const [firstX, firstY, ...remaining] = path.points;
  if (firstX === undefined || firstY === undefined) return "";
  let data = `M${formatPathNumber(firstX)} ${formatPathNumber(firstY)}`;
  for (let index = 0; index < remaining.length; index += 2) {
    const x = remaining[index];
    const y = remaining[index + 1];
    if (x === undefined || y === undefined) break;
    data += `L${formatPathNumber(x)} ${formatPathNumber(y)}`;
  }
  return close ? `${data}Z` : data;
}
