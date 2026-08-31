/**
 * Continuous carrier for oil/acrylic paint.
 *
 * `planOilBrushDabs` remains the deterministic pressure/material station planner, but rendering
 * every station as an ellipse exposes a row of beads on long strokes. This adapter converts those
 * stations into one variable-width, direction-following body and five continuous bristle lanes.
 * Canvas and SVG consume the same quantized geometry.
 */

import { parseStudioGpuColor } from "../render/studio-webgpu-color";
import {
  computeStudioImpastoReliefShading,
} from "../studio-impasto-relief-shading-v1";

import {
  StudioBristlePhysicsOilPlanner,
  planStudioBristlePhysicsOil,
  type StudioBristlePhysicsOilPlan,
} from "./studio-bristle-physics-oil-v1";
import {
  studioOilRibbonProgramsFromSet,
  type StudioBrushOilProgramSet,
} from "./studio-brush-engine-program-set";
import { STUDIO_BRUSH_RETAINED_DRAFT_SYMMETRY_VARIATIONS } from "./studio-brush-symmetry";
import {
  StudioOilBristleLoadDynamicsPlanner,
  planStudioOilBristleLoadDynamics,
  type StudioOilBristleLoadDynamicsPlan,
} from "./studio-oil-bristle-load-dynamics-v1";
import { applyStudioOilWetIntoWetStroke } from "./studio-oil-wet-into-wet";


import type { FxOilBristle, FxOilDab } from "../studio-fx-brush";

export { applyStudioOilWetIntoWetStroke };

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
  /**
   * How the tuft's rest half-width — the offset stream's normalization radius — is taken from
   * the bed. Default `settled-prefix-v2`.
   *
   * `stroke-mean-v1` averages EVERY station's `radiusY`, so the number moves on every append
   * (measured 18.2% across one sweep, still moving 0.05%/frame at 3200 samples). That is what
   * made the live carrier re-simulate the whole hair bed each pointer frame: nothing downstream
   * of a moving stroke-global input can be called settled.
   *
   * It did not have to. Every stream this program publishes divides the anchor back out —
   * `laneOffsetRatio` is `lateral / baseRadiusPx` and `lateral` is a sum of terms each carrying a
   * `radius` factor (the tilt shift included); `laneWidthScale` is `contactRadius /
   * restBristleRadiusPx` and `contactRadius` carries `bristleRadiusPx`, which IS
   * `restBristleRadiusPx`; and the load, spread, split and ink streams never see the radius at
   * all. So the anchor cancels, and the published plan is the same whichever value it took.
   *
   * `settled-prefix-v2` averages the first `STUDIO_OIL_PHYSICS_REST_RADIUS_ANCHOR_STATIONS`
   * stations and then stops. That makes the march *exactly* causal — the settled prefix is
   * settled by construction rather than by a cancellation holding up in floating point — which is
   * what lets `StudioOilRibbonCarrierPlanner` reuse bristle runs for `oil` and `acrylic`. It is
   * also the physically honest reading: a tuft's rest width is a property of the brush and the
   * pressure on it, not of how far the stroke has gone since.
   *
   * Verified plan-identical to v1 over 70 beds (both brushes x 5 stroke shapes x 7 lengths up to
   * the dab cap, plus a tilted bed), and pixel-identical (max delta 0/255) when rasterised.
   * `stroke-mean-v1` stays available as an explicit opt-out.
   */
  readonly restRadiusAnchor?: "stroke-mean-v1" | "settled-prefix-v2";
}

/**
 * Stations the `settled-prefix-v2` rest-radius anchor averages before it freezes.
 *
 * Long enough that the mean has left the pressure ramp-in behind (measured: the running mean is
 * within 0.3% of the full-stroke mean by ~250 stations on a normal sweep), short enough that the
 * anchor freezes while the stroke is still cheap to plan.
 */
export const STUDIO_OIL_PHYSICS_REST_RADIUS_ANCHOR_STATIONS = 256;

export interface StudioOilRibbonCarrierOptions {
  readonly bristleLoadDynamics?: StudioOilRibbonCarrierBristleLoadDynamicsOptions;
  readonly impastoRelief?: StudioOilRibbonCarrierImpastoReliefOptions;
  readonly bristlePhysics?: StudioOilRibbonCarrierBristlePhysicsOptions;
  /**
   * Interactive Studio paints only need the film body. Planning 16 load-bands × 5 hairs
   * is a 50–150ms main-thread stall and is reserved for export / explicit quality passes.
   */
  readonly bodyOnly?: boolean;
  /**
   * Load-band allocator for the bristle lanes. Default `observed-span-v1` keeps the shipped
   * byte-identical plan. `fixed-anchor-v2` normalises run loads against fixed [0,1] anchors and
   * derives every lane's deposit from its band anchor alone, so appending stations to a growing
   * stroke can never retroactively change an already-planned lane — the precondition the live
   * suffix assembly needs (see docs/perf/brush-advancement-roadmap-2026-08-22.md §3). The tone
   * distribution differs from v1 by design (no observed-span contrast stretch, no cumulative
   * shells); it is an opt-in pending the knot/quality gates, not a silent replacement.
   */
  readonly bristleBanding?: "observed-span-v1" | "fixed-anchor-v2";
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
  /**
   * A program set carried by the stroke or the saved brush. When present it REPLACES the id
   * matrix below rather than merging with it, because a user brush's program set is a complete
   * statement of what that brush is - merging would make it impossible to turn a preset's own
   * program off. Absent, the matrix runs unchanged and every shipped preset keeps a byte-identical
   * plan, which the program-set contract test pins for all five ids and the default.
   */
  programs?: StudioBrushOilProgramSet | null,
): StudioOilRibbonCarrierOptions | undefined {
  if (programs) return studioOilRibbonProgramsFromSet(programs, seed);
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
    case "oil":
    case "acrylic":
    case "fluid-paint":
    case "fluid-paint-fine":
    case "fluid-paint-load":
    case "fluid-paint-rake":
    case "oil--fluid-paint-splat":
    case "oil--fluid-paint-rake":
      return { bristlePhysics, bristleLoadDynamics: { enabled: true, seed }, impastoRelief: { enabled: true } };
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
  values: ArrayLike<number>,
  index: number,
  radius: number,
): number {
  let weighted = 0;
  let totalWeight = 0;
  const len = values.length;
  const start = Math.max(0, index - radius);
  const end = Math.min(len - 1, index + radius);
  for (let pos = start; pos <= end; pos += 1) {
    const sample = values[pos]!;
    const weight = radius + 1 - Math.abs(pos - index);
    weighted += sample * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weighted / totalWeight : values[index] ?? 0;
}

/**
 * Widest smoothing radius any channel below reads, so an entry is settled once its whole window
 * lies inside the verified dab prefix. Keep in step with the `weightedMovingAverage` radii.
 */
const OIL_GEOMETRY_SMOOTHING_RADIUS = 6;

function smoothGeometry(dabs: readonly FxOilDab[]): readonly SmoothedOilCarrierGeometry[] {
  return smoothGeometryFrom(dabs, [], 0);
}

/**
 * Smoothed geometry for `dabs`, keeping the first `settled` entries of `cached`.
 *
 * A caller may only pass a non-zero `settled` once it has proven that `dabs` shares a byte-equal
 * prefix with the array `cached` was built from AND that `settled + OIL_GEOMETRY_SMOOTHING_RADIUS`
 * still lands inside it: every kept entry then read the same window, with the same edge clamps, as
 * it would on a full rebuild. The raw channel arrays are refilled whole — four typed-array writes
 * per dab, against thirteen multiply-adds per channel in the window walk this skips.
 */
function smoothGeometryFrom(
  dabs: readonly FxOilDab[],
  cached: readonly SmoothedOilCarrierGeometry[],
  settled: number,
): readonly SmoothedOilCarrierGeometry[] {
  const len = dabs.length;
  const xs = new Float64Array(len);
  const ys = new Float64Array(len);
  const radiusXs = new Float64Array(len);
  const radiusYs = new Float64Array(len);
  for (let i = 0; i < len; i += 1) {
    const dab = dabs[i]!;
    xs[i] = dab.x;
    ys[i] = dab.y;
    radiusXs[i] = dab.radiusX;
    radiusYs[i] = dab.radiusY;
  }
  const from = Math.max(0, Math.min(settled, len, cached.length));
  const result: SmoothedOilCarrierGeometry[] = new Array(len);
  for (let index = 0; index < from; index += 1) result[index] = cached[index]!;
  for (let index = from; index < len; index += 1) {
    const dab = dabs[index]!;
    result[index] = Object.freeze({
      // Normal-offset jitter belonged to the old overlapping-dab texture. Smooth it out of the
      // silhouette; the five explicit bristle lanes now own all high-frequency material detail.
      x: index === 0 || index === len - 1
        ? dab.x
        : weightedMovingAverage(xs, index, 3),
      y: index === 0 || index === len - 1
        ? dab.y
        : weightedMovingAverage(ys, index, 3),
      radiusX: weightedMovingAverage(radiusXs, index, 4),
      // Radius jitter is intentionally filtered more strongly than the centreline. Without this
      // separation a one-pixel sawtooth appears on both edges of an otherwise continuous ribbon.
      radiusY: weightedMovingAverage(radiusYs, index, 6),
    });
  }
  return Object.freeze(result);
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
  let length = Math.sqrt(dx * dx + dy * dy);
  if (length <= POINT_EPSILON) {
    dx = Math.cos(finite(fallbackAngle, 0));
    dy = Math.sin(finite(fallbackAngle, 0));
    length = Math.max(POINT_EPSILON, Math.sqrt(dx * dx + dy * dy));
  }
  return [dx / length, dy / length];
}

function collectStations(dabs: readonly FxOilDab[]): readonly OilCarrierStation[] {
  return collectStationsFrom(dabs, smoothGeometry(dabs), [], 0);
}

/**
 * Stations for `geometry`, keeping the first `settled` entries of `cached`.
 *
 * `tangentAt` reads ±2 neighbours, so a station is settled two entries behind the settled
 * geometry; the caller owns that arithmetic (`StudioOilRibbonCarrierPlanner`).
 */
function collectStationsFrom(
  dabs: readonly FxOilDab[],
  geometry: readonly SmoothedOilCarrierGeometry[],
  cached: readonly OilCarrierStation[],
  settled: number,
): readonly OilCarrierStation[] {
  const from = Math.max(0, Math.min(settled, dabs.length, cached.length));
  return Object.freeze(dabs.map((source, index) => {
    if (index < from) return cached[index]!;
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
 * `mean(items.map(select))` without the intermediate array.
 *
 * Bit-identical: the same values are added in the same left-to-right order onto the same zero.
 * The carrier took these means once per width gauge and once per occupied load band on every
 * pointer frame, each one allocating an array the length of its member list.
 */
function meanBy<TItem>(items: readonly TItem[], select: (item: TItem) => number): number {
  if (items.length === 0) return 0;
  let sum = 0;
  for (const item of items) sum += select(item);
  return sum / items.length;
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
const BRISTLE_RUN_STATIONS = 3;

/** Stations each successive hair shifts its run boundaries by. Coprime-ish with the run length. */
const BRISTLE_RUN_PHASE_STRIDE = 1;

/** Normalised load below which a hair is off the paper and deposits nothing at all. */
const BRISTLE_DRY_LIFTOFF = 0.2;

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
const BRISTLE_VIRTUAL_OVERLAPS = 3;

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
  /** Which hair this run belongs to, and where in that hair's travel it sits. */
  readonly bristleIndex: number;
  readonly runIndex: number;
}

interface BristleWidthGauge {
  readonly runs: readonly PlannedBristleRun[];
  readonly lineWidth: number;
}

/**
 * Welds a hair's consecutive runs that landed in the same band back into one polyline.
 *
 * A run carries ONE load, so a run boundary is a hard tonal step — and at 4x that step is exactly
 * the "dash" the oil bed was reported as: short dark bars with square ends floating on a flat
 * slab, never a furrow dragged the length of the stroke. Neighbouring runs of one hair very often
 * land in the SAME band (the load is smoothstepped along travel, so it changes slowly), and when
 * they do the step between them is not a step at all — it is a seam this planner invented by
 * cutting the hair up. Welding them removes the seam without changing one deposited value.
 *
 * It is also the change that pays for the wider bed: the run count falls by roughly the mean weld
 * length, so a bed with five times the hairs does not emit five times the geometry.
 *
 * Runs share their boundary station by construction, so the joint point is dropped exactly once.
 */
function weldRuns(runs: readonly PlannedBristleRun[]): readonly PlannedBristleRun[] {
  return weldByTrack(
    runs,
    (run) => run.bristleIndex,
    (run) => run.runIndex,
    (points, first, last) => ({
      points,
      // The welded furrow keeps the band's identity; load and width are only ever read as the band
      // mean and the gauge mean, and both members already belong to the same band and gauge.
      load: (first.load + last.load) / 2,
      width: (first.width + last.width) / 2,
      bristleIndex: last.bristleIndex,
      runIndex: last.runIndex,
    }),
  );
}

/**
 * Joins consecutive runs of one track into a single polyline, in linear time.
 *
 * Linear matters: the obvious `[...previous.points, ...run.points]` accumulator rebuilds the whole
 * array at every join, so a stripe that welds n runs copies O(n²) coordinates — measured, that
 * alone took a 2000-station impasto plan from 25ms to 74ms and blew the planner's budget. Appending
 * into one buffer and freezing it once at the end is the same output for linear work.
 *
 * Runs share their boundary station by construction, so the joint point is dropped exactly once.
 */
function weldByTrack<TRun extends { readonly points: readonly number[] }>(
  runs: readonly TRun[],
  trackOf: (run: TRun) => number,
  orderOf: (run: TRun) => number,
  build: (points: readonly number[], first: TRun, last: TRun, members: number) => TRun,
): readonly TRun[] {
  const ordered = [...runs].sort((left, right) =>
    trackOf(left) - trackOf(right) || orderOf(left) - orderOf(right));
  const welded: TRun[] = [];
  let buffer: number[] | null = null;
  let first: TRun | null = null;
  let previous: TRun | null = null;
  let members = 0;
  const flush = (): void => {
    if (!buffer || !first || !previous) return;
    welded.push(members === 1 ? previous : build(buffer, first, previous, members));
    buffer = null;
    first = null;
    previous = null;
    members = 0;
  };
  for (const run of ordered) {
    if (
      previous
      && trackOf(previous) === trackOf(run)
      && orderOf(previous) === orderOf(run) - 1
    ) {
      for (let index = 2; index < run.points.length; index += 1) buffer!.push(run.points[index]!);
      previous = run;
      members += 1;
      continue;
    }
    flush();
    buffer = [...run.points];
    first = run;
    previous = run;
    members = 1;
  }
  flush();
  return welded;
}

/**
 * Equal-count width quantiles over the HAIRS, so each gauge is a real population rather than an
 * empty bucket — and so a hair is never split between two of them.
 *
 * This used to quantile the runs. A run's width is `radiusY · f(hair)` and radiusY tracks
 * pressure, so one hair's runs spanned a 2x width range down a pressure-tapered stroke and landed
 * on both sides of the gauge boundary. That put the two halves of one furrow into two different
 * lanes, which the weld can never rejoin — measured, it was holding the median welded furrow at
 * seven stations while the load signal was already carrying it for seventy. Grouping by hair costs
 * the ridge its pressure-widening (the lane can only carry one lineWidth either way) and buys back
 * every furrow's continuity; the bed still fans under pressure because the hairs' OFFSETS scale
 * with radiusY.
 */
function widthGauges(planned: readonly PlannedBristleRun[]): readonly BristleWidthGauge[] {
  const byHair = new Map<number, PlannedBristleRun[]>();
  for (const run of planned) {
    const hair = byHair.get(run.bristleIndex);
    if (hair) hair.push(run);
    else byHair.set(run.bristleIndex, [run]);
  }
  const hairs = [...byHair.values()]
    .map((runs) => ({ runs, width: meanBy(runs, (run) => run.width) }))
    .sort((left, right) => left.width - right.width);
  const gauges: BristleWidthGauge[] = [];
  const size = Math.ceil(hairs.length / STUDIO_OIL_BRISTLE_WIDTH_GAUGES);
  for (let start = 0; start < hairs.length; start += size) {
    const group = hairs.slice(start, start + size);
    if (group.length === 0) continue;
    const runs = group.flatMap(({ runs: hairRuns }) => hairRuns);
    gauges.push({ runs, lineWidth: meanBy(runs, (run) => run.width) });
  }
  return gauges;
}

/**
 * Band width a hair's load must overshoot before the hair is allowed to change band.
 *
 * Quantising each run independently is what cut the furrows into dashes. A hair's load wanders
 * slowly, so it spends much of its travel sitting ON a band boundary — and there the raw
 * `floor(load · bands)` flickers between two bands from one run to the next. Every flicker is a
 * seam the weld cannot close, and a row of seams three stations apart is exactly the bar-code the
 * oil bed was reported as. The flicker is not tone: the load either side of it differs by a
 * millionth, while the rendered step is a full band.
 *
 * A Schmitt trigger removes it. The band follows the load only once the load has committed past
 * the boundary by this margin, so genuine ramps still move band by band while boundary noise does
 * not. Nothing is smoothed and no load is altered — only the *choice of quantiser* changes, and it
 * changes toward the one whose output is stable under an input that barely moves.
 */
const BRISTLE_BAND_HYSTERESIS = 0.4;

/**
 * Assigns every run its load band, walking each hair along its own travel so the trigger has a
 * history. Runs below the dry-liftoff cut get no band at all and are simply never emitted.
 *
 * A hair that runs out of paint lifts off the paper. Without that cut every hair painted the full
 * length of the stroke at SOME opacity — the virtual-overlap fold guarantees it, since
 * `1 - (1-a)^6` turns even a 0.015 load into 0.087 — so the bed rendered as unbroken parallel
 * ribbons, which is the grain of plywood rather than the mark of a brush. Skipping the driest runs
 * is what breaks those ribbons into the interrupted, skipping stroke that reads as bristle.
 */
function bandRunsAlongEachHair(
  planned: readonly PlannedBristleRun[],
  minimumLoad: number,
  span: number,
): ReadonlyMap<PlannedBristleRun, number> {
  const byHair = new Map<number, PlannedBristleRun[]>();
  for (const run of planned) {
    const hair = byHair.get(run.bristleIndex);
    if (hair) hair.push(run);
    else byHair.set(run.bristleIndex, [run]);
  }
  const bandByRun = new Map<PlannedBristleRun, number>();
  for (const hair of byHair.values()) {
    hair.sort((left, right) => left.runIndex - right.runIndex);
    let held = -1;
    for (const run of hair) {
      const normalized = span > POINT_EPSILON ? (run.load - minimumLoad) / span : 0;
      if (normalized < BRISTLE_DRY_LIFTOFF) {
        // Lifting off ends the hair's history: when it touches down again it re-enters on whatever
        // band its load says, with no memory of the band it carried before the gap.
        held = -1;
        continue;
      }
      const scaled = normalized * BRISTLE_LOAD_BANDS;
      const raw = Math.min(BRISTLE_LOAD_BANDS - 1, Math.floor(scaled));
      const band = held < 0
        || (raw > held && scaled >= held + 1 + BRISTLE_BAND_HYSTERESIS)
        || (raw < held && scaled <= held - BRISTLE_BAND_HYSTERESIS)
        ? raw
        : held;
      held = band;
      bandByRun.set(run, band);
    }
  }
  return bandByRun;
}

/**
 * One frozen, quantised path per run, memoised so the shells above it can share it.
 *
 * The memo is a module-level `WeakMap` rather than a per-call `Map` so it also spans pointer
 * frames: a run object the incremental planner reused keeps the path it was already quantised
 * into, and a run that is dropped takes its entry with it. `PlannedBristleRun` is immutable once
 * emitted — the weld hands its buffer over and never writes to it again — so a hit is exact.
 */
const QUANTIZED_RUN_PATHS = new WeakMap<PlannedBristleRun, StudioOilRibbonPath>();

function quantizedRun(run: PlannedBristleRun): StudioOilRibbonPath {
  const cached = QUANTIZED_RUN_PATHS.get(run);
  if (cached) return cached;
  const frozen = Object.freeze({ points: quantizedPoints(run.points) });
  QUANTIZED_RUN_PATHS.set(run, frozen);
  return frozen;
}

/**
 * Fixed width bucket for the v2 fixed-anchor lanes, in document units.
 *
 * v1 groups hairs into equal-count quantiles and strokes each gauge at the observed mean — both
 * values move when the stroke grows. The v2 lane's width must be a pure function of its members'
 * shared key, so runs are binned by their own sample width on an absolute ruler. 4 units keeps
 * the within-bucket stroke-width error under half a typical hair diameter; 8 buckets span the
 * practical radiusY·2.425 range many times over.
 */
const BRISTLE_V2_WIDTH_BUCKET = 4;
const BRISTLE_V2_WIDTH_BUCKETS = 8;

/**
 * Deposit of one v2 band's anchor load.
 *
 * Pure function of the band index: an append that adds runs to any band — or creates a band that
 * did not exist — changes nothing about any other band's deposit, which is exactly the property
 * v1's observed-span means cannot offer.
 */
function bandAnchorDeposit(band: number): number {
  return accumulatedOpacity(
    (band + 0.5) / BRISTLE_LOAD_BANDS,
    BRISTLE_VIRTUAL_OVERLAPS,
  );
}

/**
 * Fixed-anchor bristle lanes (`bristleBanding: "fixed-anchor-v2"`).
 *
 * Every emitted value is either run-local geometry or a pure function of the lane's
 * (band, width-bucket) key: the band comes from fixed [0,1] normalisation through the same
 * per-hair Schmitt trigger and dry liftoff as v1, the width from an absolute ruler, the deposit
 * from the band anchor alone. Planning a prefix of a growing stroke therefore emits byte-identical
 * lanes for everything already planned — the append-stability contract the live suffix assembly
 * needs. Deliberate divergences from v1, both tone-level and gate-arbitrated: no observed-span
 * contrast stretch, and each band paints once at its own anchor instead of via cumulative shells
 * (self-crossings of DIFFERENT bands fold again; within-band crossings stay fold-free).
 */
/**
 * Fixed load ceiling the v2 banding normalises against.
 *
 * The station-opacity map clamps to [0.14, 0.62] (`pressureProxyFromStationOpacity` documents the
 * same numbers from the other side). Raw per-run loads are therefore already on a known absolute
 * ruler — stretching them to the observed span like v1 does is precisely what makes every band
 * membership move on append.
 */
const BRISTLE_V2_FIXED_MAX_LOAD = 0.62;

function planFixedAnchorBristleLanes(
  planned: readonly PlannedBristleRun[],
): readonly StudioOilRibbonBristleLane[] {
  const bandByRun = bandRunsAlongEachHair(planned, 0, BRISTLE_V2_FIXED_MAX_LOAD);
  const runsByKey = new Map<number, PlannedBristleRun[]>();
  for (const run of planned) {
    const band = bandByRun.get(run);
    if (band === undefined) continue;
    const bucket = Math.min(
      BRISTLE_V2_WIDTH_BUCKETS - 1,
      Math.floor(run.width / BRISTLE_V2_WIDTH_BUCKET),
    );
    const key = band * BRISTLE_V2_WIDTH_BUCKETS + bucket;
    const group = runsByKey.get(key);
    if (group) group.push(run);
    else runsByKey.set(key, [run]);
  }
  const lanes: StudioOilRibbonBristleLane[] = [];
  for (const key of [...runsByKey.keys()].sort((left, right) => left - right)) {
    const band = Math.floor(key / BRISTLE_V2_WIDTH_BUCKETS);
    const bucket = key % BRISTLE_V2_WIDTH_BUCKETS;
    lanes.push(Object.freeze({
      runs: Object.freeze(
        weldRuns(runsByKey.get(key)!).map((run) => quantizedRun(run)),
      ),
      lineWidth: quantize((bucket + 0.5) * BRISTLE_V2_WIDTH_BUCKET),
      opacity: quantize(bandAnchorDeposit(band)),
      loadBand: band,
    }));
  }
  return Object.freeze(lanes);
}

/**
 * Hairs the bed can carry — the shortest bristle list any station offers.
 *
 * Spread-free on purpose: `Math.min(...stations.map(...))` allocated a whole array and then pushed
 * one argument per station onto the call stack, which a 4096-station bed paid on every pointer
 * move. Same value, same order of comparison.
 */
function resolveBristleCount(stations: readonly OilCarrierStation[]): number {
  let count = Number.POSITIVE_INFINITY;
  for (const station of stations) {
    const length = station.source.bristles.length;
    if (length < count) count = length;
  }
  return count;
}

/**
 * Every run one hair emits along the bed, in emission order.
 *
 * `reusable` names how many LEADING runs the caller has already proven unchanged and is handing
 * back in `cached`; the walk then resumes at the first run past them. Run boundaries are a
 * function of `bristleIndex` and the station index alone, and a run reads only the stations it
 * spans, so a reused run is exactly the object the full walk would have built — see
 * `StudioOilRibbonCarrierPlanner` for how a caller earns a non-zero `reusable`.
 */
function buildBristleRunsForHair(
  stations: readonly OilCarrierStation[],
  bristleIndex: number,
  dynamics: StudioOilBristleLoadDynamicsPlan | undefined,
  physics: StudioBristlePhysicsOilPlan | undefined,
  cached: readonly PlannedBristleRun[] = [],
  reusable = 0,
): PlannedBristleRun[] {
  const emitted: PlannedBristleRun[] = reusable > 0
    ? cached.slice(0, reusable)
    : [];
  let produced = 0;
  {
    // Each hair cuts its runs on a different phase. A run carries ONE load, so a run boundary is a
    // hard tonal step; with every hair cutting at stations 0, 5, 10, … those steps lined up across
    // the whole ribbon and the bed rendered as a stack of rectangular blocks with seams running
    // clean through it - the "각진" look, arriving through tone rather than through geometry.
    // Striding the phase by 2 spreads seven hairs over all five phases (0,2,4,1,3,0,2), so the
    // steps scatter into a mosaic instead of a grid. Nothing about the load itself changes.
    const phase = (bristleIndex * BRISTLE_RUN_PHASE_STRIDE) % BRISTLE_RUN_STATIONS;
    let runIndex = -1;
    for (
      let runOrigin = -phase;
      runOrigin < stations.length - 1;
      runOrigin += BRISTLE_RUN_STATIONS
    ) {
      runIndex += 1;
      const runStart = Math.max(0, runOrigin);
      const runEnd = Math.min(stations.length - 1, runOrigin + BRISTLE_RUN_STATIONS);
      if (runEnd <= runStart) continue;
      if (produced < reusable) {
        // Same walk, same boundaries — this run is already sitting in `emitted`.
        produced += 1;
        continue;
      }
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
      const sampleIndex = Math.min(runEnd, runStart + ((runEnd - runStart) >> 1));
      const sample = stations[sampleIndex]!;
      const sampleBristle = sample.source.bristles[bristleIndex]!;
      let load = clamp(sample.opacity * sampleBristle.opacity, 0, 1);
      // Ridge width against lane pitch. The constant term used to be 0.15 — over half the final
      // width — which flattened the hairs' own diameters into one gauge no matter what the planner
      // hashed. Shifting the weight onto the ratio spreads the bed over 2.4x instead of 1.6x, so
      // fine hairs and clumped ones are visibly different strands. 0.15–0.37·radiusY still keeps
      // impasto readable at 1x while surviving the body opacity headroom reserved below.
      let width = Math.max(0.38, sample.radiusY * (0.075 + sampleBristle.radiusYRatio * 2.35));
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
      emitted.push({ points, load, width, bristleIndex, runIndex });
      produced += 1;
    }
  }
  return emitted;
}

/**
 * Bands, welds and shells a finished run bed into lanes.
 *
 * Split out of `planBristleLanes` so an incremental caller can hand over a run bed it assembled
 * from a verified prefix. Everything from here down reads the WHOLE bed by design — the load span,
 * the band means and the telescoping shell deltas are all stroke-global — so this stage always
 * runs in full, and it is the one that decides tone. The saved work is upstream, in the geometry
 * the runs carry.
 */
function planBristleLanesFromRuns(
  planned: readonly PlannedBristleRun[],
  banding: "observed-span-v1" | "fixed-anchor-v2",
): readonly StudioOilRibbonBristleLane[] {
  if (planned.length === 0) return [];

  if (banding === "fixed-anchor-v2") {
    return planFixedAnchorBristleLanes(planned);
  }

  let minimumLoad = Number.POSITIVE_INFINITY;
  let maximumLoad = Number.NEGATIVE_INFINITY;
  for (const run of planned) {
    minimumLoad = Math.min(minimumLoad, run.load);
    maximumLoad = Math.max(maximumLoad, run.load);
  }
  const span = maximumLoad - minimumLoad;
  const bandByRun = bandRunsAlongEachHair(planned, minimumLoad, span);
  const lanes: StudioOilRibbonBristleLane[] = [];
  for (const gauge of widthGauges(planned)) {
    const bands: PlannedBristleRun[][] = Array.from(
      { length: BRISTLE_LOAD_BANDS },
      () => [],
    );
    for (const run of gauge.runs) {
      const band = bandByRun.get(run);
      if (band === undefined) continue;
      bands[band]!.push(run);
    }
    for (const [band, runs] of bands.entries()) bands[band] = [...weldRuns(runs)];

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
        accumulatedOpacity(meanBy(runs, (run) => run.load), BRISTLE_VIRTUAL_OVERLAPS),
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
    //
    // Built as SUFFIXES from the outermost band inward, and quantised once per run. A run in band
    // m belongs to shells 0..m, and the straightforward `slice(index).flatMap(...).map(quantise)`
    // re-walked and re-quantised its coordinates once for every one of those shells — on a
    // 1300-station scribble that redundancy was most of the planner's time. Shell k is exactly
    // `band k ++ shell k+1`, and the frozen path objects are shared, so the emitted plan is
    // identical while each coordinate is touched once.
    // The deposit walk runs FIRST and touches no geometry, so a shell whose deposit cannot survive
    // 8-bit quantisation is never built at all. Materialising every band's suffix up front and
    // discarding the skipped ones measured slower than the redundant version it replaced.
    //
    // A shell repaints every run at and above its band, so it is the most expensive thing this
    // planner emits - measured, the shells raise an oil stroke's lane path data about 6x. A shell
    // that is skipped deliberately does NOT advance `carried`, which leaves the skipped band's
    // target to the next shell that IS worth painting, so tone stays exact instead of drifting.
    const emitted: { index: number; band: number; delta: number }[] = [];
    let carried = 0;
    for (let index = 0; index < occupied.length; index += 1) {
      const entry = occupied[index]!;
      // Incremental deposit that lands the fold on this band's target given everything already
      // laid by the shells outside it.
      const delta = carried >= 1
        ? 0
        : clamp(1 - (1 - entry.target) / (1 - carried), 0, 1);
      if (delta < BRISTLE_SHELL_VISIBLE_DEPOSIT) continue;
      carried = entry.target;
      emitted.push({ index, band: entry.band, delta });
    }

    // Built inward from the outermost emitted shell, and quantised once per run. A run in band m
    // belongs to shells 0..m, and the straightforward `slice(index).flatMap(...)` re-walked and
    // re-quantised its coordinates once for every one of those shells — on a 1300-station scribble
    // that redundancy was most of the planner's time. Shell k is exactly `bands k..next ++ shell
    // next`, and the frozen path objects are shared, so the emitted plan is identical while each
    // coordinate is quantised once.
    const shells: (readonly StudioOilRibbonPath[])[] = new Array(emitted.length);
    for (let slot = emitted.length - 1; slot >= 0; slot -= 1) {
      const from = emitted[slot]!.index;
      const to = emitted[slot + 1]?.index ?? occupied.length;
      const own: StudioOilRibbonPath[] = [];
      for (let index = from; index < to; index += 1) {
        for (const run of occupied[index]!.runs) own.push(quantizedRun(run));
      }
      const outer = shells[slot + 1];
      shells[slot] = outer ? own.concat(outer) : own;
    }
    for (const [slot, shell] of emitted.entries()) {
      lanes.push(Object.freeze({
        runs: Object.freeze(shells[slot]!),
        lineWidth: quantize(gauge.lineWidth),
        opacity: quantize(shell.delta),
        loadBand: shell.band,
      }));
    }
  }
  return Object.freeze(lanes);
}

function planBristleLanes(
  stations: readonly OilCarrierStation[],
  dynamics?: StudioOilBristleLoadDynamicsPlan,
  physics?: StudioBristlePhysicsOilPlan,
  banding: "observed-span-v1" | "fixed-anchor-v2" = "observed-span-v1",
): readonly StudioOilRibbonBristleLane[] {
  if (stations.length < 2) return [];
  const bristleCount = resolveBristleCount(stations);
  const planned: PlannedBristleRun[] = [];
  for (let bristleIndex = 0; bristleIndex < bristleCount; bristleIndex += 1) {
    for (const run of buildBristleRunsForHair(stations, bristleIndex, dynamics, physics)) {
      planned.push(run);
    }
  }
  return planBristleLanesFromRuns(planned, banding);
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
/**
 * The tuft's rest half-width for this bed. See `restRadiusAnchor`.
 *
 * The default window sums the same values in the same order `meanBy` does, so a stroke shorter
 * than the window produces a bit-for-bit identical anchor — and past it the anchor cancels out of
 * everything the program publishes anyway.
 */
function tuftRestRadiusPx(
  stations: readonly OilCarrierStation[],
  anchor: "stroke-mean-v1" | "settled-prefix-v2" | undefined,
): number {
  if (anchor === "stroke-mean-v1") return meanBy(stations, (station) => station.radiusY);
  const count = Math.min(stations.length, STUDIO_OIL_PHYSICS_REST_RADIUS_ANCHOR_STATIONS);
  if (count === 0) return 0;
  let sum = 0;
  for (let index = 0; index < count; index += 1) sum += stations[index]!.radiusY;
  return sum / count;
}

/**
 * A per-station series both programs read through `sampleSeries`, which HOLDS a short series at
 * its last value — so a station already marched would read a number that moves as the stroke
 * grows. Absent or exactly station-length is stable; anything else is not.
 */
function seriesSpansStations(
  series: readonly number[] | undefined,
  stationCount: number,
): boolean {
  return series === undefined || series.length === 0 || series.length >= stationCount;
}

/** True once the anchor can no longer move, which is what makes the physics prefix reusable. */
function tuftRestRadiusIsFrozen(
  stations: readonly OilCarrierStation[],
  anchor: "stroke-mean-v1" | "settled-prefix-v2" | undefined,
): boolean {
  return anchor !== "stroke-mean-v1"
    && stations.length >= STUDIO_OIL_PHYSICS_REST_RADIUS_ANCHOR_STATIONS;
}

function planBristlePhysics(
  stations: readonly OilCarrierStation[],
  options: StudioOilRibbonCarrierBristlePhysicsOptions,
  /**
   * Live stroke only: a retained tuft plus the station prefix this planner has already proven
   * byte-identical. Absent (batch, export, settle) simulates the whole stroke as before.
   */
  resume?: { readonly planner: StudioBristlePhysicsOilPlanner; readonly settled: number },
): StudioBristlePhysicsOilPlan | undefined {
  if (stations.length < 2) return undefined;
  const laneCount = resolveBristleCount(stations);
  if (laneCount <= 0) return undefined;
  const pressures = options.pressures && options.pressures.length > 0
    ? options.pressures
    : stations.map((station) => pressureProxyFromStationOpacity(station.opacity));
  const input = {
    stationXs: stations.map((station) => station.x),
    stationYs: stations.map((station) => station.y),
    laneCount,
    seed: Math.floor(finite(options.seed, 0)),
    // Tuft rest half-width — the offset stream's normalization radius.
    // Stroke-global by design — and the reason a physics program's bristle runs are never reused
    // across a pointer move: this normalization radius moves with every appended station, so the
    // whole simulated bed legitimately differs. See `StudioOilRibbonCarrierPlanner`.
    baseRadiusPx: tuftRestRadiusPx(stations, options.restRadiusAnchor),
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
  };
  // One construction site for the input, so the resumable path cannot be fed a different stroke
  // than the batch path would have been.
  return resume
    ? resume.planner.plan(input, resume.settled)
    : planStudioBristlePhysicsOil(input);
}

function planLoadDynamics(
  stations: readonly OilCarrierStation[],
  options: StudioOilRibbonCarrierBristleLoadDynamicsOptions,
  /**
   * Live stroke only: a retained march plus the station prefix this planner has already proven
   * byte-identical. Absent (batch, export, settle) marches the whole stroke as before.
   */
  resume?: { readonly planner: StudioOilBristleLoadDynamicsPlanner; readonly settled: number },
): StudioOilBristleLoadDynamicsPlan | undefined {
  if (stations.length < 2) return undefined;
  const laneCount = resolveBristleCount(stations);
  if (laneCount <= 0) return undefined;
  const pressures = options.pressures && options.pressures.length > 0
    ? options.pressures
    : stations.map((station) => pressureProxyFromStationOpacity(station.opacity));
  const input = {
    stationCount: stations.length,
    laneCount,
    seed: Math.floor(finite(options.seed, 0)),
    pressures,
    ...(options.speeds ? { speeds: options.speeds } : {}),
    ...(options.initialLoad !== undefined ? { initialLoad: options.initialLoad } : {}),
    ...(options.depletionRate !== undefined
      ? { depletionRate: options.depletionRate }
      : {}),
  };
  // One construction site for the input, so the resumable path cannot be fed a different stroke
  // than the batch path would have been.
  return resume
    ? resume.planner.plan(input, resume.settled)
    : planStudioOilBristleLoadDynamics(input);
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
 * cap because the Sobel window must span a ridge's own cross-section before it can read its
 * slope — a ridge is the hair's footprint wide (~0.3·radiusY, see `impastoRidgeWidth`), so a
 * coarser tile than a couple of cells per ridge silently flattens the whole bristle bed. It does
 * NOT have to resolve the hair PITCH: hairs packed closer than their own footprint merge into one
 * plateau in the paint as well as in the tile, which is why the tent is sized by the hair rather
 * than by this grid.
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
 * FLOOR for the ridge cross-section radius, in cells. The radius itself is the hair's own
 * half-footprint (`impastoRidgeWidth`), not a multiple of the grid cell; this only stops a very
 * fine hair on a coarse tile from becoming a sub-cell needle the Sobel window cannot see.
 *
 * It used to BE the model, at 0.8 cells for every hair, and that is what broke the lamp when the
 * bed stopped being seven hairs. A tent whose width is set by the grid instead of by the brush is
 * a ridge train sampled at whatever ratio the two happen to land on: at a 26px head the hairs sit
 * 1.178px apart on a 1.076px cell, so successive crests fall 1.09 cells apart and which cell
 * centre catches a crest drifts once every ~11 cells. That fold is not paint — it put a smooth
 * 0.51 → 0.62 hump across the middle of the height field (an 11-cell moiré period, measured), and
 * the lamp lit that hump into a bright band straight down the centreline, tying the body's own top
 * rim. Sizing the tent by the hair instead makes the field band-limited by construction: hairs
 * whose footprints overlap merge into one honest plateau exactly as the pigment lanes do, and
 * hairs far enough apart to leave a furrow still leave one.
 */
const IMPASTO_RELIEF_RIDGE_REACH_MIN_CELLS = 0.8;
/** Film rim slope width in cells — the body edge is a paint cliff, not a hard alias step. */
const IMPASTO_RELIEF_EDGE_FEATHER_CELLS = 1.5;
/**
 * Quantum the height grid's cell size climbs by, and the rung ceiling.
 *
 * The natural cell is `max(longSpan / 256, …)`, a continuous function of the stroke's bounding
 * box — so every pointer move that extends the arc rescales the whole tile, and with it every
 * cell index, every sampled shading value and every relief run built on top. Nothing downstream
 * can be reused across an append, which is why relief costs the same on move 4000 as on move 40.
 *
 * Snapping the cell onto a geometric ladder makes it piecewise constant: it holds through a long
 * run of appends and then steps once.
 *
 * Rounded DOWN, never up. A coarser cell would keep the tile inside the budgets above for free,
 * but the cell is not only a cost dial — `impastoHairStride` divides the ribbon width by it to
 * decide how many hairs the field can resolve, through a `floor`. Rounding up by even 9% pushes
 * that quotient across an integer on some beds and HALVES the number of ridges rasterised (and
 * with them the flank stripes, which walk the same stride): measured on a straight capped stroke,
 * 43 relief runs became 20. That is a quality regression, not a pixel difference. Rounding down
 * keeps `cell <= natural`, so the tile is never coarser than the continuous formula would have
 * made it and the stride can only be finer.
 *
 * The rung SIZE is then set by the painted-work budget, not by taste. A cell one rung below
 * natural puts `ratio^2` more cells in the tile, and a finer cell also lets `impastoHairStride`
 * resolve more hairs — so the ratio lands directly on relief vertex count. At 2^(1/8) the
 * scribble budget stroke went from its recorded 4288 relief vertices to 5213, eating the whole
 * ~20% headroom the guard in `impasto-relief.test.ts` carries. 2^(1/16) holds the cell within
 * 4.4% of natural and stays inside that budget. The price is twice as many rung climbs over a
 * stroke's growth, which is still only tens of them across thousands of appends.
 */
const IMPASTO_RELIEF_CELL_STEP_RATIO = 2 ** (1 / 16);
/**
 * Slack added to the tile beyond the stations' own bounding box, so that NO stamp is ever
 * clipped by the tile edge.
 *
 * This is what makes the retained field's growth purely additive, and it is not cosmetic. The
 * stampers clamp their cell ranges to the tile (`Math.min(gridWidth - 1, …)`), so a station
 * sitting on the boundary has the outer part of its film disc or ridge capsule thrown away. If
 * the stroke later grows PAST that station — a long horizontal run that then turns and climbs
 * back over its own settled prefix — the newly exposed rows are inside that old station's reach,
 * the batch planner fills them, and a blitted layer never can: the contribution was never
 * rasterised anywhere. Measured on exactly that L-shaped stroke before this margin existed: 185
 * of 556 appends had a differing shading field, worst cell off by 0.294.
 *
 * With the margin, every station's footprint is fully materialised inside the tile, so cells that
 * appear when the tile grows are outside every EXISTING station's reach and the blit is exact by
 * construction. The bound covers both stampers with slack: the film reaches
 * `radiusY + IMPASTO_RELIEF_EDGE_FEATHER_CELLS·cell`, and a ridge reaches
 * `radiusY·|offsetRatio| + max(IMPASTO_RELIEF_RIDGE_REACH_MIN_CELLS·cell, impastoRidgeWidth/2)`
 * where `impastoRidgeWidth` is at most ~0.3·radiusY (radiusYRatio is a few hundredths).
 * `studio-oil-ribbon-carrier.incremental.test.ts` walks that L stroke append by append, so a
 * margin that stops covering the stampers fails there rather than silently returning.
 */
const IMPASTO_RELIEF_STAMP_REACH_RADIUS_RATIO = 1.2;
const IMPASTO_RELIEF_STAMP_REACH_CELLS = 2;
const IMPASTO_RELIEF_CELL_MAX_RUNGS = 512;

/**
 * Smallest ladder rung at or above `natural`, so the cell is stable across appends.
 *
 * Computed by climbing rather than by `Math.log`, so the value is a product of the same factors
 * in the same order regardless of how the caller arrived at `natural` — two appends that land on
 * the same rung get a bit-identical cell, which is the property the whole reuse chain rests on.
 */
function impastoReliefCell(natural: number): number {
  let cell = IMPASTO_RELIEF_MIN_CELL_PX;
  for (let rung = 0; rung < IMPASTO_RELIEF_CELL_MAX_RUNGS; rung += 1) {
    const next = cell * IMPASTO_RELIEF_CELL_STEP_RATIO;
    if (next > natural) return cell;
    cell = next;
  }
  return cell;
}
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
  /** Hairs skipped between ridges — the flank stripes must walk the bed on the same stride. */
  readonly hairStride: number;
  /** First hair the stride starts from, so the sampled bed stays centred on the ribbon. */
  readonly hairOffset: number;
  /** Flat-normalized dli shading multipliers (1 = flat paint). */
  readonly shading: Float32Array;
}

/**
 * How many hairs to skip between relief ridges, so the height field is never asked to resolve
 * detail finer than its own cell.
 *
 * The relief grid is coarse on purpose — the corrugation between hairs is a one-texel signal at
 * best. When the bed's pitch drops below one cell, two neighbouring hairs splat into the SAME
 * cells under a max blend, so the second one changes no value in the field and no pixel in the
 * render: it is pure cost. That went unnoticed while the bed was a fixed seven hairs; a
 * width-scaled bed can put forty-four hairs under a 20px ribbon, where the redundancy is 4x and
 * dominates the whole planner.
 *
 * The same stride governs the flank stripes, because a stripe samples one texel off its crest: a
 * stripe placed on a hair that raised no ridge would read flat film and report a glint that is not
 * there. Ridges and stripes therefore have to walk the bed in step.
 */
function impastoHairStride(
  stations: readonly OilCarrierStation[],
  cell: number,
  bristleCount: number,
): number {
  if (bristleCount <= 1 || cell <= POINT_EPSILON) return 1;
  const ribbonWidth = 2 * mean(stations.map((station) => station.radiusY));
  const resolvable = Math.max(1, Math.floor(ribbonWidth / cell));
  return Math.max(1, Math.round(bristleCount / Math.min(bristleCount, resolvable)));
}

/**
 * Cross-stroke width of the standing ridge one hair leaves, in canvas px.
 *
 * Single source for both halves of the overlay: the height field raises its tent this wide and the
 * flank stripes are drawn and probed against the same number. They were two copies of the same
 * expression, and the field's copy had drifted onto the grid cell — which is precisely how the
 * field came to model a 1.7px ridge while the geometry drew a 2.7px one on top of it.
 */
function impastoRidgeWidth(station: OilCarrierStation, hair: FxOilBristle): number {
  return Math.max(0.38, station.radiusY * (0.15 + hair.radiusYRatio * 1.18));
}

function impastoBristleCount(stations: readonly OilCarrierStation[]): number {
  let count = Number.POSITIVE_INFINITY;
  for (const station of stations) {
    count = Math.min(count, station.source.bristles.length);
  }
  return Number.isFinite(count) ? count : 0;
}

interface ImpastoReliefGrid {
  readonly cell: number;
  readonly originX: number;
  readonly originY: number;
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly bristleCount: number;
  readonly hairStride: number;
  readonly hairOffset: number;
}

/**
 * Grid the field will be rasterised on — derived from the stations, but quantised so it holds
 * still across an append (see `IMPASTO_RELIEF_CELL_STEP_RATIO`).
 */
function impastoReliefGrid(stations: readonly OilCarrierStation[]): ImpastoReliefGrid | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let centreMinX = Number.POSITIVE_INFINITY;
  let centreMinY = Number.POSITIVE_INFINITY;
  let centreMaxX = Number.NEGATIVE_INFINITY;
  let centreMaxY = Number.NEGATIVE_INFINITY;
  let maxRadiusY = 0;
  for (const station of stations) {
    const pad = Math.max(station.radiusY, station.radiusX * 0.62) + 2;
    minX = Math.min(minX, station.x - pad);
    minY = Math.min(minY, station.y - pad);
    maxX = Math.max(maxX, station.x + pad);
    maxY = Math.max(maxY, station.y + pad);
    centreMinX = Math.min(centreMinX, station.x);
    centreMinY = Math.min(centreMinY, station.y);
    centreMaxX = Math.max(centreMaxX, station.x);
    centreMaxY = Math.max(centreMaxY, station.y);
    maxRadiusY = Math.max(maxRadiusY, station.radiusY);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  const spanX = Math.max(1e-3, maxX - minX);
  const spanY = Math.max(1e-3, maxY - minY);
  let natural = Math.max(
    IMPASTO_RELIEF_MIN_CELL_PX,
    Math.max(spanX, spanY) / IMPASTO_RELIEF_GRID_LONG_SIDE,
  );
  const cellsAtLongSide = (spanX / natural) * (spanY / natural);
  if (cellsAtLongSide > IMPASTO_RELIEF_GRID_MAX_CELLS) {
    natural *= Math.sqrt(cellsAtLongSide / IMPASTO_RELIEF_GRID_MAX_CELLS);
  }
  const cell = impastoReliefCell(natural);
  // The cell is derived from the padded box above, exactly as before, so the resolution and
  // `impastoHairStride` are unaffected; the reach margin only widens the TILE.
  const reach = maxRadiusY * IMPASTO_RELIEF_STAMP_REACH_RADIUS_RATIO
    + IMPASTO_RELIEF_STAMP_REACH_CELLS * cell;
  minX = Math.min(minX, centreMinX - reach);
  minY = Math.min(minY, centreMinY - reach);
  maxX = Math.max(maxX, centreMaxX + reach);
  maxY = Math.max(maxY, centreMaxY + reach);
  // Snap the origin to a whole number of cells as well. The cell size alone is not enough: the
  // tile is addressed from its origin, and a stroke that grows leftward would drag every existing
  // sample onto a different cell centre even when the cell size has not moved. On a snapped
  // origin an append can only ever prepend whole cells, so the previous tile is an integer-offset
  // sub-grid of the new one and the values inside it are the same numbers.
  const originX = Math.floor(minX / cell) * cell;
  const originY = Math.floor(minY / cell) * cell;
  const bristleCount = impastoBristleCount(stations);
  const hairStride = impastoHairStride(stations, cell, bristleCount);
  return {
    cell,
    originX,
    originY,
    gridWidth: Math.max(4, Math.ceil((maxX - originX) / cell) + 1),
    gridHeight: Math.max(4, Math.ceil((maxY - originY) / cell) + 1),
    bristleCount,
    hairStride,
    // Centred, not started at zero. Walking `0, stride, 2·stride, …` leaves the remainder entirely
    // at the far edge of the bed, so one side of the ribbon keeps its outermost ridges and the
    // other loses them — and a lamp asked which flank is lit then answers from an asymmetric bed.
    hairOffset: Math.floor((((bristleCount - 1) % hairStride) + 1) / 2),
  };
}

/** A rectangle of the tile whose heights changed since the retained shading was computed. */
interface ImpastoDirtyRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Where the body-film walk had got to; carried so a resumed pass stamps the same stations. */
interface ImpastoFilmCursor {
  travelled: number;
  lastX: number;
  lastY: number;
}

function impastoFilmCursor(): ImpastoFilmCursor {
  return { travelled: Number.POSITIVE_INFINITY, lastX: 0, lastY: 0 };
}

/**
 * Body film — capsule union of station discs, over `[from, to)`.
 *
 * Striding by ~radiusY/3 keeps overlapping discs from being rasterised hundreds of times;
 * max-blend makes the stride invisible in the level. The stride is a running distance, so the
 * cursor has to be carried across a resumed pass or a partial rebuild would stamp a different
 * set of stations than the batch walk does.
 *
 * `finalIndex` is the index the WHOLE stroke ends on, which is exempt from the stride the same
 * way index 0 is. A partial pass must not treat its own last station as that one, or it bakes a
 * stamp the full walk never makes.
 */
function stampImpastoFilm(
  film: Float32Array,
  grid: ImpastoReliefGrid,
  stations: readonly OilCarrierStation[],
  from: number,
  to: number,
  cursor: ImpastoFilmCursor,
  finalIndex: number,
): void {
  const { cell, originX, originY, gridWidth, gridHeight } = grid;
  const feather = IMPASTO_RELIEF_EDGE_FEATHER_CELLS * cell;
  for (let index = from; index < to; index += 1) {
    const station = stations[index]!;
    if (index > 0) {
      cursor.travelled += Math.hypot(station.x - cursor.lastX, station.y - cursor.lastY);
    }
    cursor.lastX = station.x;
    cursor.lastY = station.y;
    const stampGap = Math.max(cell, station.radiusY * 0.35);
    if (index !== 0 && index !== finalIndex && cursor.travelled < stampGap) continue;
    cursor.travelled = 0;
    // Pressure loads more paint: heavier stations stand a little prouder of the canvas.
    const level = IMPASTO_RELIEF_FILM_HEIGHT * (0.72 + 0.28 * station.opacity);
    const radius = station.radiusY;
    const reach = radius + feather;
    const reachSquared = reach * reach;
    const minCellX = Math.max(0, Math.floor((station.x - reach - originX) / cell));
    const maxCellX = Math.min(gridWidth - 1, Math.ceil((station.x + reach - originX) / cell));
    const minCellY = Math.max(0, Math.floor((station.y - reach - originY) / cell));
    const maxCellY = Math.min(gridHeight - 1, Math.ceil((station.y + reach - originY) / cell));
    // Coverage saturates at 1 for `dist ≤ radius`; only the [radius, radius+feather] annulus
    // needs the sqrt falloff, which is what keeps a 2000-station film affordable.
    const innerSquared = radius * radius;
    for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
      const deltaY = originY + (cellY + 0.5) * cell - station.y;
      const deltaYSquared = deltaY * deltaY;
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        const deltaX = originX + (cellX + 0.5) * cell - station.x;
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
}

/**
 * Bristle ridges over the station segments `[from, to)` — segment `i` joins stations `i, i+1`.
 *
 * Walks each sampled hair's polyline (the exact geometry the lanes stroke) and raises a
 * load-proportional ridge. Max-blend per cell: a hair is a level of standing paint, and a
 * crossing of equal loads must not stack itself into a knot (mirrors the one-pass band rule).
 * Segment-local, so unlike the film this needs no cursor.
 */
function stampImpastoRidge(
  ridge: Float32Array,
  grid: ImpastoReliefGrid,
  stations: readonly OilCarrierStation[],
  from: number,
  to: number,
): void {
  const { cell, originX, originY, gridWidth, gridHeight, bristleCount, hairStride, hairOffset } =
    grid;
  if (to <= from) return;
  const minRidgeReach = cell * IMPASTO_RELIEF_RIDGE_REACH_MIN_CELLS;
  const span = to - from + 1;
  const hairX = new Float64Array(span);
  const hairY = new Float64Array(span);
  const hairLoad = new Float64Array(span);
  const hairReach = new Float64Array(span);
  for (let bristleIndex = hairOffset; bristleIndex < bristleCount; bristleIndex += hairStride) {
    for (let slot = 0; slot < span; slot += 1) {
      const station = stations[from + slot]!;
      const hair = station.source.bristles[bristleIndex]!;
      const offset = station.radiusY * hair.offsetRatio;
      hairX[slot] = station.x + station.normalX * offset;
      hairY[slot] = station.y + station.normalY * offset;
      hairLoad[slot] = clamp(station.opacity * hair.opacity, 0, 1);
      hairReach[slot] = Math.max(minRidgeReach, impastoRidgeWidth(station, hair) * 0.5);
    }
    for (let slot = 0; slot + 1 < span; slot += 1) {
      const fromX = hairX[slot]!;
      const fromY = hairY[slot]!;
      const toX = hairX[slot + 1]!;
      const toY = hairY[slot + 1]!;
      const fromLoad = hairLoad[slot]!;
      const toLoad = hairLoad[slot + 1]!;
      const segmentX = toX - fromX;
      const segmentY = toY - fromY;
      // The hair keeps one diameter over a segment (only `contact` varies with travel, and only
      // slightly), so one reach is the whole ridge for that segment.
      const ridgeReach = Math.max(hairReach[slot]!, hairReach[slot + 1]!);
      const ridgeReachSquared = ridgeReach * ridgeReach;
      // ONE capsule per segment, not a chain of overlapping discs. The tent is a distance
      // falloff, so the max over a dense chain of point splats IS the segment's distance field —
      // the chain was only ever badly over-sampled quadrature for it, and it scallops the crest
      // between taps where the distance field does not.
      const lengthSquared = segmentX * segmentX + segmentY * segmentY;
      const inverseLengthSquared = lengthSquared > POINT_EPSILON ? 1 / lengthSquared : 0;
      const loadSpan = toLoad - fromLoad;
      const minCellX = Math.max(
        0,
        Math.floor((Math.min(fromX, toX) - ridgeReach - originX) / cell),
      );
      const maxCellX = Math.min(
        gridWidth - 1,
        Math.ceil((Math.max(fromX, toX) + ridgeReach - originX) / cell),
      );
      const minCellY = Math.max(
        0,
        Math.floor((Math.min(fromY, toY) - ridgeReach - originY) / cell),
      );
      const maxCellY = Math.min(
        gridHeight - 1,
        Math.ceil((Math.max(fromY, toY) + ridgeReach - originY) / cell),
      );
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        const pointY = originY + (cellY + 0.5) * cell - fromY;
        for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
          const pointX = originX + (cellX + 0.5) * cell - fromX;
          const t = clamp(
            (pointX * segmentX + pointY * segmentY) * inverseLengthSquared,
            0,
            1,
          );
          const deltaX = pointX - segmentX * t;
          const deltaY = pointY - segmentY * t;
          const distanceSquared = deltaX * deltaX + deltaY * deltaY;
          if (distanceSquared >= ridgeReachSquared) continue;
          const level = IMPASTO_RELIEF_RIDGE_HEIGHT
            * (0.25 + 0.75 * (fromLoad + loadSpan * t));
          const value = level * (1 - Math.sqrt(distanceSquared) / ridgeReach);
          const at = cellY * gridWidth + cellX;
          if (value > ridge[at]!) ridge[at] = value;
        }
      }
    }
  }
}

/**
 * Shade a finished height tile. Split out so both the batch and retained paths share it.
 *
 * `retained` lets a caller that already holds the previous tile re-shade only the cells whose
 * height neighbourhood moved. The shading is a fixed stencil over the heights with no
 * normalization across the data (see `region` on the shading module), so the cells outside the
 * dirty rectangles keep exactly the values a full pass would have written.
 */
function shadeImpastoRelief(
  film: Float32Array,
  ridge: Float32Array,
  grid: ImpastoReliefGrid,
  retained?: {
    readonly height: Float32Array;
    readonly shading: Float32Array;
    readonly dirty: readonly ImpastoDirtyRect[];
  },
): ImpastoReliefField {
  if (retained) {
    const { height, shading, dirty } = retained;
    for (const rect of dirty) {
      const x0 = Math.max(0, rect.x);
      const y0 = Math.max(0, rect.y);
      const x1 = Math.min(grid.gridWidth, rect.x + rect.width);
      const y1 = Math.min(grid.gridHeight, rect.y + rect.height);
      for (let y = y0; y < y1; y += 1) {
        const row = y * grid.gridWidth;
        for (let x = x0; x < x1; x += 1) {
          const at = row + x;
          height[at] = film[at]! + ridge[at]!;
        }
      }
    }
    for (const rect of dirty) {
      computeStudioImpastoReliefShading(height, {
        width: grid.gridWidth,
        height: grid.gridHeight,
        heightScale: IMPASTO_RELIEF_HEIGHT_SCALE,
        into: shading,
        // The stencil reads neighbours, so a cell one ring outside a changed cell changes too.
        region: { x: rect.x - 1, y: rect.y - 1, width: rect.width + 2, height: rect.height + 2 },
      });
    }
    return {
      gridWidth: grid.gridWidth,
      gridHeight: grid.gridHeight,
      cell: grid.cell,
      originX: grid.originX,
      originY: grid.originY,
      hairStride: grid.hairStride,
      hairOffset: grid.hairOffset,
      shading,
    };
  }
  const height = new Float32Array(film.length);
  for (let at = 0; at < film.length; at += 1) height[at] = film[at]! + ridge[at]!;
  return {
    gridWidth: grid.gridWidth,
    gridHeight: grid.gridHeight,
    cell: grid.cell,
    originX: grid.originX,
    originY: grid.originY,
    hairStride: grid.hairStride,
    hairOffset: grid.hairOffset,
    // dli defaults verbatim (normalScale 7, roughness 0.075, F0 0.05, light (0,−1,1) image-space);
    // only heightScale compensates the single-stroke tile (see the constant above).
    shading: computeStudioImpastoReliefShading(height, {
      width: grid.gridWidth,
      height: grid.gridHeight,
      heightScale: IMPASTO_RELIEF_HEIGHT_SCALE,
    }),
  };
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
  const grid = impastoReliefGrid(stations);
  if (!grid) return null;
  const cellCount = grid.gridWidth * grid.gridHeight;
  const film = new Float32Array(cellCount);
  const ridge = new Float32Array(cellCount);
  stampImpastoFilm(film, grid, stations, 0, stations.length, impastoFilmCursor(), stations.length - 1);
  stampImpastoRidge(ridge, grid, stations, 0, stations.length - 1);
  return shadeImpastoRelief(film, ridge, grid);
}

/**
 * Retained height field for a growing stroke.
 *
 * `buildImpastoReliefField` is a pure function of every station, and re-running it was 25.6% of
 * the carrier's per-move cost on a capped bed (film 3.3ms + ridge 18.0ms of 80.4ms) purely to
 * re-derive a tile whose settled part cannot have changed.
 *
 * What makes reuse expressible at all is that the grid now holds still (see
 * `IMPASTO_RELIEF_CELL_STEP_RATIO`): between rung climbs an append can only ever prepend or
 * append whole cells, so the previous tile is an integer-offset sub-grid of the new one.
 *
 * The retained part is deliberately NOT "everything rasterised last time". Both rasters are
 * max-blends, and max cannot retract — so a cell raised by a station whose position later moves
 * would keep the stale contribution forever. Only stations strictly inside the caller's settled
 * prefix are baked; everything from there on is re-stamped into a working copy each move. Three
 * things force the whole tile back to a full rebuild, because each of them changes what the
 * settled contributions MEAN rather than merely adding to them:
 *
 *  - the cell climbing a ladder rung, which re-addresses every value;
 *  - `hairStride`/`hairOffset` moving, which changes WHICH hairs are rasterised across the whole
 *    stroke — the old ridges belong to hairs that are no longer in the set and max cannot remove
 *    them;
 *  - the bristle count changing, for the same reason.
 */
class StudioImpastoReliefFieldPlanner {
  private grid: ImpastoReliefGrid | null = null;
  private settledFilm: Float32Array | null = null;
  private settledRidge: Float32Array | null = null;
  /** Stations baked into the settled layers: `[0, settledEnd)`. */
  private settledEnd = 0;
  /** Film walk state at `settledEnd`, so a resumed pass stamps the same stations. */
  private cursor: ImpastoFilmCursor = impastoFilmCursor();
  /**
   * Retained height and shading tiles.
   *
   * Re-shading the whole tile was 12.1ms of the carrier's 67.5ms per move on a capped bed even
   * after the rasters stopped being rebuilt — the field was retained and then thrown through a
   * full Sobel pass anyway. The shading is a pure stencil over the heights, so only the cells
   * whose neighbourhood moved have to be redone.
   */
  private height: Float32Array | null = null;
  private shading: Float32Array | null = null;
  /**
   * First station whose stamps may differ from the ones baked into the retained height tile.
   *
   * The working film/ridge are rebuilt each move as `settled layer + tail`, so a cell changes
   * only where a station at or after the PREVIOUS tail start writes. Carrying that index rather
   * than the current one is what keeps the rectangle honest across the move where the settled
   * boundary advances.
   */
  private dirtyFromStation = 0;

  reset(): void {
    this.grid = null;
    this.settledFilm = null;
    this.settledRidge = null;
    this.settledEnd = 0;
    this.cursor = impastoFilmCursor();
    this.height = null;
    this.shading = null;
    this.dirtyFromStation = 0;
  }

  /**
   * `settled` is the caller's proven-settled station prefix (`identical - 8`). Passing 0 is
   * always correct and simply costs a full rebuild.
   */
  build(stations: readonly OilCarrierStation[], settled: number): ImpastoReliefField | null {
    const grid = impastoReliefGrid(stations);
    if (!grid) {
      this.reset();
      return null;
    }
    const cellCount = grid.gridWidth * grid.gridHeight;
    const previous = this.grid;
    // A ridge segment reads two stations, so the last settled segment is the one ending at
    // `settled - 1`; and the film's own stamp for station `settled - 1` is already baked.
    const bakeTo = Math.max(0, Math.min(settled, stations.length));
    const reusable = previous !== null
      && this.settledFilm !== null
      && this.settledRidge !== null
      && previous.cell === grid.cell
      && previous.hairStride === grid.hairStride
      && previous.hairOffset === grid.hairOffset
      && previous.bristleCount === grid.bristleCount
      && bakeTo >= this.settledEnd;

    // Rectangles whose heights may differ from the retained tile. Empty means "reuse nothing".
    const dirty: ImpastoDirtyRect[] = [];
    const reshadeRetained = reusable && this.height !== null && this.shading !== null;
    if (!reusable) {
      this.settledFilm = new Float32Array(cellCount);
      this.settledRidge = new Float32Array(cellCount);
      this.settledEnd = 0;
      this.cursor = impastoFilmCursor();
      this.height = null;
      this.shading = null;
      this.dirtyFromStation = 0;
    } else if (
      previous!.gridWidth !== grid.gridWidth
      || previous!.gridHeight !== grid.gridHeight
      || previous!.originX !== grid.originX
      || previous!.originY !== grid.originY
    ) {
      // Same cell, moved or grown tile: the old values keep their meaning, they just live at a
      // different offset. Rounding is safe because both origins are multiples of the same cell.
      const shiftX = Math.round((previous!.originX - grid.originX) / grid.cell);
      const shiftY = Math.round((previous!.originY - grid.originY) / grid.cell);
      this.settledFilm = blitImpastoLayer(this.settledFilm!, previous!, grid, shiftX, shiftY);
      this.settledRidge = blitImpastoLayer(this.settledRidge!, previous!, grid, shiftX, shiftY);
      if (reshadeRetained) {
        this.height = blitImpastoLayer(this.height!, previous!, grid, shiftX, shiftY);
        this.shading = blitImpastoLayer(this.shading!, previous!, grid, shiftX, shiftY);
        // Everything the blit did NOT carry over is new, and so is the ring the old tile's edge
        // sat on: those cells were shaded against a CLAMPED neighbourhood, and now have real
        // neighbours. Four bands around the old footprint cover both, and stay thin — the tile
        // grows by a cell or two at a time, so this is a perimeter cost, not an area one.
        for (const band of impastoGrowthBands(previous!, grid, shiftX, shiftY)) dirty.push(band);
      }
    }

    // Advance the settled layers to the new boundary. This is the only pass whose cost grows
    // with the stroke, and it walks each station exactly once over the stroke's whole life.
    if (bakeTo > this.settledEnd) {
      stampImpastoFilm(
        this.settledFilm!,
        grid,
        stations,
        this.settledEnd,
        bakeTo,
        this.cursor,
        // The stroke's final station is exempt from the stride, and it is never settled — so a
        // bake must not grant that exemption to its own last station.
        -1,
      );
      stampImpastoRidge(this.settledRidge!, grid, stations, Math.max(0, this.settledEnd - 1), bakeTo - 1);
      this.settledEnd = bakeTo;
    }

    const film = new Float32Array(this.settledFilm!);
    const ridge = new Float32Array(this.settledRidge!);
    const tailCursor: ImpastoFilmCursor = { ...this.cursor };
    stampImpastoFilm(film, grid, stations, this.settledEnd, stations.length, tailCursor, stations.length - 1);
    stampImpastoRidge(ridge, grid, stations, Math.max(0, this.settledEnd - 1), stations.length - 1);

    // A cell can differ from the retained tile only where a station at or after the previous
    // tail start writes. Both this move's tail and the previous one are covered by starting at
    // the smaller index, and one station back for the ridge segment that reaches into it.
    const changedFrom = Math.max(0, Math.min(this.dirtyFromStation, this.settledEnd) - 1);
    if (reshadeRetained) {
      const stamped = impastoStationBounds(stations, changedFrom, grid);
      if (stamped) dirty.push(stamped);
    }
    this.dirtyFromStation = this.settledEnd;

    this.grid = grid;
    if (reshadeRetained && this.height!.length === cellCount && this.shading!.length === cellCount) {
      return shadeImpastoRelief(film, ridge, grid, {
        height: this.height!,
        shading: this.shading!,
        dirty,
      });
    }
    const field = shadeImpastoRelief(film, ridge, grid);
    const height = new Float32Array(cellCount);
    for (let at = 0; at < cellCount; at += 1) height[at] = film[at]! + ridge[at]!;
    this.height = height;
    this.shading = field.shading as Float32Array;
    return field;
  }
}

/**
 * Cell rectangle the stations `[from, end)` can write into.
 *
 * Deliberately the same reach the tile margin is sized by, not the exact per-station clamp the
 * stampers compute: a superset costs a few extra cells of re-shading, an undersized one leaves a
 * stale cell that nothing will ever correct.
 */
function impastoStationBounds(
  stations: readonly OilCarrierStation[],
  from: number,
  grid: ImpastoReliefGrid,
): ImpastoDirtyRect | null {
  if (from >= stations.length) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = from; index < stations.length; index += 1) {
    const station = stations[index]!;
    const reach = station.radiusY * IMPASTO_RELIEF_STAMP_REACH_RADIUS_RATIO
      + IMPASTO_RELIEF_STAMP_REACH_CELLS * grid.cell;
    minX = Math.min(minX, station.x - reach);
    minY = Math.min(minY, station.y - reach);
    maxX = Math.max(maxX, station.x + reach);
    maxY = Math.max(maxY, station.y + reach);
  }
  if (!Number.isFinite(minX)) return null;
  const x = Math.floor((minX - grid.originX) / grid.cell);
  const y = Math.floor((minY - grid.originY) / grid.cell);
  const right = Math.ceil((maxX - grid.originX) / grid.cell) + 1;
  const bottom = Math.ceil((maxY - grid.originY) / grid.cell) + 1;
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * The bands of the new tile that the blit could not fill, plus the ring the old edge sat on.
 *
 * `shiftX`/`shiftY` place the old tile's origin inside the new one, so the old footprint is
 * `[shiftX, shiftX + previous.gridWidth) x [shiftY, …)`. Everything outside it is a cell the blit
 * left at zero. The ring is included because those cells were shaded against a clamped
 * neighbourhood at the old boundary and now have real neighbours.
 */
function impastoGrowthBands(
  previous: ImpastoReliefGrid,
  grid: ImpastoReliefGrid,
  shiftX: number,
  shiftY: number,
): ImpastoDirtyRect[] {
  const left = shiftX;
  const top = shiftY;
  const right = shiftX + previous.gridWidth;
  const bottom = shiftY + previous.gridHeight;
  const bands: ImpastoDirtyRect[] = [];
  // One cell of overlap on each side is the old edge ring; the stencil dilation in
  // `shadeImpastoRelief` widens it again, which is what the clamped-neighbour cells need.
  if (left > 0) bands.push({ x: 0, y: 0, width: left + 1, height: grid.gridHeight });
  if (right < grid.gridWidth) {
    bands.push({ x: right - 1, y: 0, width: grid.gridWidth - right + 1, height: grid.gridHeight });
  }
  if (top > 0) bands.push({ x: 0, y: 0, width: grid.gridWidth, height: top + 1 });
  if (bottom < grid.gridHeight) {
    bands.push({ x: 0, y: bottom - 1, width: grid.gridWidth, height: grid.gridHeight - bottom + 1 });
  }
  return bands;
}

/** Move a retained layer onto a tile with the same cell but a different origin or size. */
function blitImpastoLayer(
  source: Float32Array,
  from: ImpastoReliefGrid,
  to: ImpastoReliefGrid,
  shiftX: number,
  shiftY: number,
): Float32Array {
  const target = new Float32Array(to.gridWidth * to.gridHeight);
  for (let y = 0; y < from.gridHeight; y += 1) {
    const targetY = y + shiftY;
    if (targetY < 0 || targetY >= to.gridHeight) continue;
    const sourceRow = y * from.gridWidth;
    const targetRow = targetY * to.gridWidth;
    for (let x = 0; x < from.gridWidth; x += 1) {
      const targetX = x + shiftX;
      if (targetX < 0 || targetX >= to.gridWidth) continue;
      target[targetRow + targetX] = source[sourceRow + x]!;
    }
  }
  return target;
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
  /** Which flank stripe this run belongs to, and where along it the run sits. */
  readonly trackIndex: number;
  readonly runIndex: number;
}

/**
 * Welds a relief stripe's consecutive runs that landed in the same tone bucket.
 *
 * Same defect and same cure as the bristle furrows: the flanks are cut into three-station runs and
 * bucketed independently, so one continuous glint along a ridge came out as a row of rectangular
 * tiles — the light and dark blocks that made the impasto lane read as digital camouflage rather
 * than as raked paint. Runs share their boundary station, so the joint point is dropped once.
 */
/**
 * Overshoot, as a fraction of the max opacity, a flank must commit before it changes tone bucket.
 * Same Schmitt trigger, same reason, as the bristle bands' hysteresis.
 */
const IMPASTO_RELIEF_BUCKET_HYSTERESIS = 0.06;

/** Upper edge of a bucket, as a fraction of max opacity — Infinity for the top bucket. */
function bucketEdgeAbove(bucket: number): number {
  return bucket === 0
    ? IMPASTO_RELIEF_BUCKET_EDGE_LOW
    : bucket === 1
      ? IMPASTO_RELIEF_BUCKET_EDGE_HIGH
      : Number.POSITIVE_INFINITY;
}

/** Lower edge of a bucket, as a fraction of max opacity — 0 for the bottom bucket. */
function bucketEdgeBelow(bucket: number): number {
  return bucket === 0
    ? 0
    : bucket === 1
      ? IMPASTO_RELIEF_BUCKET_EDGE_LOW
      : IMPASTO_RELIEF_BUCKET_EDGE_HIGH;
}

function weldReliefRuns(
  runs: readonly PlannedImpastoReliefRun[],
): readonly PlannedImpastoReliefRun[] {
  return weldByTrack(
    runs,
    (run) => run.trackIndex,
    (run) => run.runIndex,
    (points, first, last) => ({
      points,
      strength: (first.strength + last.strength) / 2,
      width: (first.width + last.width) / 2,
      trackIndex: last.trackIndex,
      runIndex: last.runIndex,
    }),
  );
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
  retained?: { readonly planner: StudioImpastoReliefFieldPlanner; readonly settled: number },
): readonly StudioOilRibbonImpastoReliefLane[] {
  if (stations.length < 2) return Object.freeze([]);
  const field = retained
    ? retained.planner.build(stations, retained.settled)
    : buildImpastoReliefField(stations);
  if (!field) return Object.freeze([]);
  const planned: PlannedImpastoReliefRun[] = [];
  const bristleCount = impastoBristleCount(stations);
  // The stripes walk the bed on the SAME stride the height field raised its ridges on. See
  // `impastoHairStride`: a stripe on a hair that raised no ridge would sample flat film and claim
  // a glint that is not in the field.
  const stripeStride = field.hairStride;
  const stripeOffset = field.hairOffset;

  const collectRun = (
    runStart: number,
    runEnd: number,
    pointAt: (station: OilCarrierStation, side: 1 | -1) => {
      readonly geomOffset: number;
      readonly sampleOffset: number;
      readonly width: number;
    },
    side: 1 | -1,
    trackIndex: number,
    runIndex: number,
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
      trackIndex,
      runIndex,
    });
  };

  // One track per (side, stripe): the flank stripes are numbered by hair and the rim takes the
  // slot past them, so a welded stripe is always the same physical ridge flank end to end.
  const trackOf = (side: 1 | -1, stripe: number): number =>
    (side === 1 ? 0 : bristleCount + 1) * 2 + stripe;

  for (let runStart = 0; runStart < stations.length - 1; runStart += BRISTLE_RUN_STATIONS) {
    const runEnd = Math.min(stations.length - 1, runStart + BRISTLE_RUN_STATIONS);
    const runIndex = runStart / BRISTLE_RUN_STATIONS;
    for (const side of [-1, 1] as const) {
      // Ridge flanks — one lit and one shaded band per hair, clamped inside the body silhouette
      // so a screen-blended glint can never halo outside the paint.
      for (
        let bristleIndex = stripeOffset;
        bristleIndex < bristleCount;
        bristleIndex += stripeStride
      ) {
        collectRun(runStart, runEnd, (station, flankSide) => {
          const hair = station.source.bristles[bristleIndex]!;
          const ridgeWidth = impastoRidgeWidth(station, hair);
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
        }, side, trackOf(side, bristleIndex), runIndex);
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
      }, side, trackOf(side, bristleCount), runIndex);
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
  // Walked in track order so the bucket choice has a history. Independent bucketing let one ridge
  // flank flicker between two tone buckets from one three-station run to the next, which put the
  // two halves of a single glint in two different lanes: the weld could not rejoin them and the
  // lane rendered as a mosaic of light and dark tiles instead of a raked ridge.
  const held = new Map<number, { kind: StudioOilRibbonImpastoReliefKind; bucket: number }>();
  for (const run of [...planned].sort((left, right) =>
    left.trackIndex - right.trackIndex || left.runIndex - right.runIndex)) {
    const magnitude = Math.abs(run.strength);
    if (magnitude < IMPASTO_RELIEF_MIN_STRENGTH) {
      held.delete(run.trackIndex);
      continue;
    }
    const kind: StudioOilRibbonImpastoReliefKind = run.strength > 0 ? "highlight" : "shadow";
    const maxOpacity = kind === "highlight"
      ? IMPASTO_RELIEF_MAX_HIGHLIGHT_OPACITY
      : IMPASTO_RELIEF_MAX_SHADOW_OPACITY;
    const gain = kind === "highlight"
      ? IMPASTO_RELIEF_HIGHLIGHT_GAIN
      : IMPASTO_RELIEF_SHADOW_GAIN;
    const opacity = Math.min(maxOpacity, magnitude * gain);
    const raw = opacity < maxOpacity * IMPASTO_RELIEF_BUCKET_EDGE_LOW
      ? 0
      : opacity < maxOpacity * IMPASTO_RELIEF_BUCKET_EDGE_HIGH
        ? 1
        : IMPASTO_RELIEF_OPACITY_BUCKETS - 1;
    // A flank that flips lit/shaded is a genuinely different surface, so the trigger only holds
    // within one kind; crossing zero always re-enters on the raw bucket.
    const previous = held.get(run.trackIndex);
    const ratio = opacity / maxOpacity;
    const bucket = !previous || previous.kind !== kind
      ? raw
      : raw > previous.bucket
        ? (ratio >= bucketEdgeAbove(previous.bucket) + IMPASTO_RELIEF_BUCKET_HYSTERESIS
            ? raw : previous.bucket)
        : raw < previous.bucket
          ? (ratio <= bucketEdgeBelow(previous.bucket) - IMPASTO_RELIEF_BUCKET_HYSTERESIS
              ? raw : previous.bucket)
          : raw;
    held.set(run.trackIndex, { kind, bucket });
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
    .map((entry) => {
      const welded = weldReliefRuns(entry.runs);
      return Object.freeze({
        runs: Object.freeze(welded.map((run) => Object.freeze({
          points: quantizedPoints(run.points),
        }))),
        // Width and opacity stay the bucket's means over its RUNS, not over the welded stripes:
        // welding is a geometry join and must not re-weight the tone by stripe length.
        lineWidth: quantize(meanBy(entry.runs, (run) => run.width)),
        opacity: quantize(mean(entry.opacities)),
        kind: entry.kind,
      });
    });
  return Object.freeze(lanes);
}

export function planStudioOilRibbonCarrier(
  inputDabs: readonly FxOilDab[],
  options?: StudioOilRibbonCarrierOptions,
): StudioOilRibbonCarrierPlan {
  const dabs = normalizedDabs(Array.isArray(inputDabs) ? inputDabs : []);
  const stations = collectStations(dabs);
  const averageOpacity = meanStationOpacity(stations);
  const bodyOnly = options?.bodyOnly === true;
  const loadDynamicsOptions = options?.bristleLoadDynamics;
  const dynamics = !bodyOnly && loadDynamicsOptions?.enabled === true
    ? planLoadDynamics(stations, loadDynamicsOptions)
    : undefined;
  // v1 bristle physics touches ONLY the bristle lanes: body geometry/opacity
  // stay byte-identical so the pinned lane inherits the settled silhouette.
  const bristlePhysicsOptions = options?.bristlePhysics;
  const physics = !bodyOnly && bristlePhysicsOptions?.enabled === true
    ? planBristlePhysics(stations, bristlePhysicsOptions)
    : undefined;
  // The relief overlay is additive only: enabling it must never change the base plan fields, and
  // NOT enabling it must not even add the key (legacy plans stay structurally identical).
  const impastoReliefLanes = !bodyOnly && options?.impastoRelief?.enabled === true
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
    // Body is the paint the bristles have already spread — a film UNDER the ridges, not a slab
    // beside them. Two virtual overlaps put it at 0.68 while the lowest band a hair can deposit
    // came out at 0.65, so every furrow lighter than the film was invisible by construction and
    // only the top two or three bands ever showed: a flat slab with a few dark decals on it, which
    // is exactly how the bed was reported. One overlap is the film itself, and it leaves the whole
    // band range visible against it.
    bodyOpacity: quantize(accumulatedOpacity(averageOpacity, 1)),
    bristleLanes: bodyOnly
      ? Object.freeze([])
      : planBristleLanes(stations, dynamics, physics, options?.bristleBanding),
    repeatedBodyStampCount: 0,
    ...(impastoReliefLanes ? { impastoReliefLanes } : {}),
  });
}

/**
 * Growing-stroke carrier planner: the same plan `planStudioOilRibbonCarrier` returns, without
 * rebuilding the parts of it that an append cannot have changed.
 *
 * ## Why the batch planner is the wrong shape for a live stroke
 *
 * A live oil stroke replans the whole carrier on every pointer frame. Measured on this tree at a
 * 2906-dab bed that is ~17 ms per move, and at the 4096-dab cap ~28 ms — both past a 60 Hz frame
 * on their own, before a single pixel is painted, and both paid again on the next move.
 *
 * ## What is settled, and why it is exactly settled
 *
 * The chain is `dabs → smoothed geometry → stations → bristle runs`, and every stage reads a
 * BOUNDED window:
 *   - `smoothGeometry` weights ±6 neighbours at most, and its first/last raw passthrough only
 *     touches the two ends;
 *   - `tangentAt` reads ±2 geometry entries;
 *   - a bristle run reads only the stations it spans, plus the cap at index 0.
 * So with a byte-equal dab prefix of `identical`, geometry is settled to `identical - 6` entries
 * and stations to `identical - 8` — the N−8 settled prefix the 2026-08-22 carrier anatomy
 * measured. A run is settled while its UNCLAMPED end index stays inside that station prefix,
 * which also keeps it clear of the end cap the last station carries.
 *
 * The verification is object identity on the dab array, not a field compare: `FxOilDabPlanner`
 * hands its own verified prefix back as the same `FxOilDab` objects, so identity is both the
 * cheapest test available and strictly stronger than comparing the fields this planner reads.
 * Anything it cannot prove is rebuilt, so a wrong reuse is not expressible.
 *
 * ## What is NOT settled, and stays a full pass
 *
 * Banding, band means and the telescoping shell deltas are stroke-global by design: the load span
 * comes from the observed minimum and maximum, so one append can re-band every run. That stage
 * therefore always runs in full (`planBristleLanesFromRuns`), and the plan this class returns is
 * byte-identical to the batch planner's rather than an incremental approximation of it. Removing
 * the global aggregation itself is the separate, tone-changing `fixed-anchor-v2` work
 * (docs/perf/brush-advancement-roadmap-2026-08-22.md §3).
 *
 * The v1 load-dynamics and bristle-physics programs publish per-station arrays that are replanned
 * across the whole bed, so their runs are never reused — geometry and stations still are. The
 * impasto relief overlay reads stations only, and its height field is retained on the same
 * settled boundary (`StudioImpastoReliefFieldPlanner`); the shading, run sampling and lane
 * bucketing on top of it still run in full.
 */
export class StudioOilRibbonCarrierPlanner {
  private optionsKey: string | null = null;
  private dabs: readonly FxOilDab[] = [];
  private geometry: readonly SmoothedOilCarrierGeometry[] = [];
  private stations: readonly OilCarrierStation[] = [];
  private runsByHair: PlannedBristleRun[][] = [];
  private lastReusedRuns = 0;
  private lastSettledStations = 0;
  /** Hair count the retained runs were built for; -1 until the first plan. */
  private lastBristleCount = -1;
  /**
   * Retained load-dynamics march. The program is strictly causal in the station index, so unlike
   * the bristle-physics program (whose `baseRadiusPx` is a stroke-global mean) its settled prefix
   * is byte-stable under an append and is kept across pointer frames.
   */
  private readonly loadDynamics = new StudioOilBristleLoadDynamicsPlanner();
  /**
   * Retained bristle-physics tuft. Causal in the station index once the rest-radius anchor is
   * frozen (`restRadiusAnchor`), which is what lets the already-drawn hairs stop being
   * re-simulated on every pointer frame.
   */
  private readonly bristlePhysics = new StudioBristlePhysicsOilPlanner();
  /**
   * Retained impasto height field. Reads stations only, and only the settled prefix is baked, so
   * it resumes on the same boundary the bristle runs do.
   */
  private readonly impastoRelief = new StudioImpastoReliefFieldPlanner();

  /** Runs reused from the previous call. Diagnostics and identity tests only. */
  get reusedRuns(): number {
    return this.lastReusedRuns;
  }

  /** Stations proven settled on the previous call. Diagnostics and identity tests only. */
  get settledStations(): number {
    return this.lastSettledStations;
  }

  reset(): void {
    this.optionsKey = null;
    this.dabs = [];
    this.geometry = [];
    this.stations = [];
    this.runsByHair = [];
    this.lastReusedRuns = 0;
    this.lastSettledStations = 0;
    this.lastBristleCount = -1;
    this.loadDynamics.reset();
    this.bristlePhysics.reset();
    this.impastoRelief.reset();
  }

  plan(
    inputDabs: readonly FxOilDab[],
    options?: StudioOilRibbonCarrierOptions,
  ): StudioOilRibbonCarrierPlan {
    const dabs = normalizedDabs(Array.isArray(inputDabs) ? inputDabs : []);
    // Any option that reaches the plan invalidates the retained bed when it moves. Cheap: the
    // options object is a handful of flags and scalars, never per-sample data of stroke length.
    const optionsKey = JSON.stringify(options ?? null);
    if (optionsKey !== this.optionsKey) {
      this.reset();
      this.optionsKey = optionsKey;
    }

    const previous = this.dabs;
    const shared = Math.min(previous.length, dabs.length);
    let identical = 0;
    while (identical < shared && previous[identical] === dabs[identical]) identical += 1;
    if (identical === 0) {
      // Nothing survives — the lattice refit at the dab cap, a new stroke, an undo. Drop the
      // retained bed BEFORE building the replacement rather than holding two full generations
      // of 4096 stations × 7–44 hairs alive next to each other; `FxOilDabPlanner` measured that
      // overlap at +4.5 ms per move in GC alone, and bailing out here can only ever cause a full
      // rebuild, never a wrong reuse.
      this.dabs = [];
      this.geometry = [];
      this.stations = [];
      this.runsByHair = [];
      // Same reason: the retained march holds stationCount x laneCount doubles.
      this.loadDynamics.reset();
      this.bristlePhysics.reset();
      this.impastoRelief.reset();
    }

    const settledGeometry = Math.max(0, identical - OIL_GEOMETRY_SMOOTHING_RADIUS);
    // `tangentAt` reaches two entries past the station it builds.
    const settledStations = Math.max(0, settledGeometry - 2);
    const geometry = smoothGeometryFrom(dabs, this.geometry, settledGeometry);
    const stations = collectStationsFrom(dabs, geometry, this.stations, settledStations);

    const bodyOnly = options?.bodyOnly === true;
    const loadDynamicsOptions = options?.bristleLoadDynamics;
    const dynamics = !bodyOnly && loadDynamicsOptions?.enabled === true
      ? planLoadDynamics(stations, loadDynamicsOptions, {
        planner: this.loadDynamics,
        settled: settledStations,
      })
      : undefined;
    const bristlePhysicsOptions = options?.bristlePhysics;
    const physics = !bodyOnly && bristlePhysicsOptions?.enabled === true
      ? planBristlePhysics(stations, bristlePhysicsOptions, {
        planner: this.bristlePhysics,
        // The tuft may only resume where its own anchor has stopped moving. Below the window the
        // anchor is still a running mean, so the settled station prefix is not a settled tuft.
        settled: tuftRestRadiusIsFrozen(stations, bristlePhysicsOptions.restRadiusAnchor)
          ? settledStations
          : 0,
      })
      : undefined;
    const impastoReliefLanes = !bodyOnly && options?.impastoRelief?.enabled === true
      ? planImpastoReliefOverlayLanes(stations, {
        planner: this.impastoRelief,
        settled: settledStations,
      })
      : undefined;

    let bristleLanes: readonly StudioOilRibbonBristleLane[] = Object.freeze([]);
    let reusedRuns = 0;
    if (!bodyOnly && stations.length >= 2) {
      const bristleCount = resolveBristleCount(stations);
      // Both programs publish per-station arrays that a run reads by station index, so a run is
      // only reusable while every array it reads is settled too.
      //
      //  - load dynamics is a strictly causal march and is now resumed rather than replanned
      //    (`StudioOilBristleLoadDynamicsPlanner`), so its prefix is byte-stable by construction;
      //  - bristle physics is causal as well, but its `baseRadiusPx` anchor decides the whole
      //    simulation. Under the shipped `stroke-mean-v1` anchor that number moves on every
      //    append, so nothing it produces is settled. Under `settled-prefix-v2` it stops moving
      //    once the window is full, and from there the physics prefix is settled too.
      //
      // The hair count also has to hold: both programs are indexed `station * laneCount + lane`,
      // so a bed that re-resolved its lane count is reading a different array shape and the
      // cached runs belong to a different tuft.
      const physicsSettled = physics === undefined
        || (tuftRestRadiusIsFrozen(stations, bristlePhysicsOptions?.restRadiusAnchor)
          && seriesSpansStations(bristlePhysicsOptions?.pressures, stations.length)
          && seriesSpansStations(bristlePhysicsOptions?.speeds, stations.length));
      const dynamicsSettled = dynamics === undefined
        || (seriesSpansStations(loadDynamicsOptions?.pressures, stations.length)
          && seriesSpansStations(loadDynamicsOptions?.speeds, stations.length));
      const programsSettled =
        physicsSettled && dynamicsSettled && bristleCount === this.lastBristleCount;
      const reusableStations = programsSettled ? settledStations : 0;
      this.lastBristleCount = bristleCount;
      const runsByHair: PlannedBristleRun[][] = new Array(bristleCount);
      const planned: PlannedBristleRun[] = [];
      for (let bristleIndex = 0; bristleIndex < bristleCount; bristleIndex += 1) {
        const cached = this.runsByHair[bristleIndex] ?? [];
        const reusable = reusableRunCountForHair(
          bristleIndex,
          stations.length,
          reusableStations,
          cached.length,
        );
        reusedRuns += reusable;
        const runs = buildBristleRunsForHair(
          stations,
          bristleIndex,
          dynamics,
          physics,
          cached,
          reusable,
        );
        runsByHair[bristleIndex] = runs;
        for (const run of runs) planned.push(run);
      }
      this.runsByHair = runsByHair;
      bristleLanes = planBristleLanesFromRuns(planned, options?.bristleBanding ?? "observed-span-v1");
    } else {
      this.runsByHair = [];
    }

    this.dabs = dabs;
    this.geometry = geometry;
    this.stations = stations;
    this.lastReusedRuns = reusedRuns;
    this.lastSettledStations = settledStations;

    return Object.freeze({
      version: STUDIO_OIL_RIBBON_CARRIER_VERSION,
      sourceStationCount: stations.length,
      body: stations.length === 0
        ? null
        : stations.length === 1
          ? directionalTap(stations[0]!)
          : variableWidthBody(stations),
      bodyOpacity: quantize(accumulatedOpacity(meanStationOpacity(stations), 1)),
      bristleLanes,
      repeatedBodyStampCount: 0,
      ...(impastoReliefLanes ? { impastoReliefLanes } : {}),
    });
  }
}

/**
 * Planners retained for the ONE draft currently being drawn.
 *
 * A single slot, not an LRU over strokes: only one stroke is ever active, and its symmetry copies
 * are the whole working set. An LRU got this wrong twice over — sized below the fan it evicted
 * every copy just before its next use (0% hit rate, and worse than no cache once construction and
 * a doomed verification pass are charged), and sized above it, a finished stroke's beds stayed
 * strongly reachable while later single-copy strokes aged out one stale entry at a time. At the
 * dab cap one copy holds ~27k run objects, so a 16-copy stroke is hundreds of thousands of objects
 * that must not outlive the stroke that needed them.
 *
 * Starting a different draft therefore drops the previous one outright, and
 * `releaseStudioOilRibbonDraftPlanners` frees the last one when its committed render arrives.
 */
interface RetainedOilCarrierDraft {
  readonly draftId: string;
  readonly planners: Map<number, StudioOilRibbonCarrierPlanner>;
}

let retainedOilCarrierDraft: RetainedOilCarrierDraft | null = null;

/**
 * Stroke-keyed `StudioOilRibbonCarrierPlanner`, for renderers that cannot hold one themselves.
 *
 * Same plan as `planStudioOilRibbonCarrier` — see the class for why — so this is a drop-in for the
 * ACTIVE DRAFT only. Committed and export renders must keep calling the batch planner: they render
 * arbitrary strokes in arbitrary order and would evict each other's beds for nothing.
 *
 * A symmetry transform draws one element several times from different point arrays, so the copy's
 * `variationIndex` selects its own planner. A fan wider than
 * `STUDIO_BRUSH_RETAINED_DRAFT_SYMMETRY_VARIATIONS` falls back to the batch planner rather than
 * retaining beds without bound; callers should not reach that guard, since they are expected to
 * check the same bound before routing here.
 */
export function planStudioOilRibbonCarrierIncremental(
  draftId: string,
  variationIndex: number,
  dabs: readonly FxOilDab[],
  options?: StudioOilRibbonCarrierOptions,
): StudioOilRibbonCarrierPlan {
  if (retainedOilCarrierDraft?.draftId !== draftId) {
    retainedOilCarrierDraft = { draftId, planners: new Map() };
  }
  const planners = retainedOilCarrierDraft.planners;
  let planner = planners.get(variationIndex);
  if (!planner) {
    if (planners.size >= STUDIO_BRUSH_RETAINED_DRAFT_SYMMETRY_VARIATIONS) {
      return planStudioOilRibbonCarrier(dabs, options);
    }
    planner = new StudioOilRibbonCarrierPlanner();
    planners.set(variationIndex, planner);
  }
  return planner.plan(dabs, options);
}

/** Frees `draftId`'s retained beds. A no-op once a different draft has already replaced them. */
export function releaseStudioOilRibbonDraftPlanners(draftId: string): void {
  if (retainedOilCarrierDraft?.draftId === draftId) retainedOilCarrierDraft = null;
}

/**
 * Runs the retained planner for one copy of `draftId` reused on its last call, or `null` when no
 * planner is held for it. @internal — the colocated retention contract test only; a caller cannot
 * act on this, and a hit/miss is never a correctness signal (every plan is byte-identical either
 * way).
 */
export function studioOilRibbonCarrierRetainedReuse(
  draftId: string,
  variationIndex: number,
): number | null {
  if (retainedOilCarrierDraft?.draftId !== draftId) return null;
  return retainedOilCarrierDraft.planners.get(variationIndex)?.reusedRuns ?? null;
}

/**
 * Leading runs of one hair whose spans lie wholly inside the settled station prefix.
 *
 * Walks the same origins the builder does rather than closing the form, so the two can never
 * disagree about which run is which — the count is what matters, and each step is a comparison.
 */
function reusableRunCountForHair(
  bristleIndex: number,
  stationCount: number,
  settledStations: number,
  cachedLength: number,
): number {
  if (settledStations < 2 || cachedLength === 0) return 0;
  const phase = (bristleIndex * BRISTLE_RUN_PHASE_STRIDE) % BRISTLE_RUN_STATIONS;
  let count = 0;
  for (
    let runOrigin = -phase;
    runOrigin < stationCount - 1;
    runOrigin += BRISTLE_RUN_STATIONS
  ) {
    const runStart = Math.max(0, runOrigin);
    const runEnd = Math.min(stationCount - 1, runOrigin + BRISTLE_RUN_STATIONS);
    if (runEnd <= runStart) continue;
    // The UNCLAMPED end has to be inside the settled prefix: a run that ends on the clamp read
    // the bed's last station, whose end cap and smoothing both move when the stroke grows.
    if (runOrigin + BRISTLE_RUN_STATIONS > settledStations - 1) break;
    count += 1;
    if (count >= cachedLength) break;
  }
  return count;
}

/**
 * Stroke-mean station opacity, accumulated left to right.
 *
 * `mean(stations.map((s) => s.opacity))` allocated one array per pointer frame the length of the
 * bed to add its members in the same order; this adds them in that order directly, so the value
 * is bit-identical.
 */
function meanStationOpacity(stations: readonly OilCarrierStation[]): number {
  if (stations.length === 0) return 0;
  let sum = 0;
  for (const station of stations) sum += station.opacity;
  return sum / stations.length;
}

export function traceStudioOilRibbonPath(
  sink: StudioOilRibbonPathSink,
  path: StudioOilRibbonPath,
  close = false,
): void {
  // Indexed, not rest-destructured. `const [x, y, ...rest] = path.points` copies the entire
  // coordinate array on every call, and a full oil plan traces one path per lane run — the copy
  // alone was ~0.9 ms per pointer move on a 4096-station stroke. Same coordinates, same order.
  const points = path.points;
  const firstX = points[0];
  const firstY = points[1];
  if (firstX === undefined || firstY === undefined) return;
  sink.moveTo(firstX, firstY);
  for (let index = 2; index < points.length; index += 2) {
    const x = points[index];
    const y = points[index + 1];
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

/**
 * Native 2D surface used for wet-into-wet readback. Structural (not CanvasRenderingContext2D)
 * so Konva SceneContext._context and test doubles both assign without ImageData.colorSpace
 * or HTMLCanvasElement exactness.
 */
export interface StudioOilRibbonNativeSurface {
  readonly width: number;
  readonly height: number;
  readonly hitCanvas?: unknown;
  readonly constructor?: { readonly name?: string };
}

export interface StudioOilRibbonNativeReadback {
  canvas: StudioOilRibbonNativeSurface;
  getImageData(
    x: number,
    y: number,
    width: number,
    height: number,
  ): { data: Uint8ClampedArray; width: number; height: number };
  putImageData(
    image: { data: Uint8ClampedArray; width: number; height: number },
    x: number,
    y: number,
  ): void;
  getTransform?: () => {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
  };
}

export interface StudioOilRibbonPaintContext {
  save(): void;
  restore(): void;
  beginPath(): void;
  fill(): void;
  stroke(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath?(): void;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
  globalCompositeOperation: string;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  lineWidth: number;
  readonly constructor?: { readonly name?: string };
  _context?: StudioOilRibbonNativeReadback;
  canvas?: StudioOilRibbonNativeSurface;
}

export interface StudioOilRibbonPaintInput {
  readonly carrier: StudioOilRibbonCarrierPlan;
  readonly stroke: string;
  readonly opacity: number;
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly radiusPx: number;
  readonly destination?: {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
    readonly originX?: number;
    readonly originY?: number;
  };
  /** When true, never read back the native canvas (Konva hit pass). */
  readonly hitPass?: boolean;
  /**
   * Interactive Konva paints must not `getImageData` the growing stroke bbox. That readback is a
   * 50–150ms main-thread stall on a webtoon-sized page. Wet-into-wet stays available when the
   * caller supplies an explicit `destination` buffer (tests, export, workers).
   */
  readonly skipDestinationReadback?: boolean;
  /** Live drafts paint the film body only; committed/export keep bristle and impasto overlays. */
  readonly includeBristleOverlay?: boolean;
  /** david.li Fluid Paint subtractive mix. Default stays spectral-WGM oil. */
  readonly mixModel?: "spectral-wgm" | "ryb";
}

export interface StudioOilRibbonPaintReceipt {
  readonly wetIntoWetApplied: true;
  readonly usedLiveDestination: boolean;
  readonly hitPass: boolean;
}

/**
 * Konva `drawHit` reuses `sceneFunc` when `hitFunc` is missing. HitContext
 * still has `_context` (the hit canvas). Mixing RGB into that canvas punches
 * the color-key map — skip live readback and keep a path-only fill.
 */
export function studioOilRibbonPaintIsHitPass(
  context: StudioOilRibbonPaintContext,
  hitPass = false,
): boolean {
  if (hitPass) return true;
  const contextName = context.constructor?.name;
  if (contextName === "HitContext") return true;
  const canvas = context.canvas;
  if (canvas?.hitCanvas === true) return true;
  if (canvas?.constructor?.name === "HitCanvas") return true;
  return false;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function strokePaintColor(stroke: string): { r: number; g: number; b: number } {
  const parsed = parseStudioGpuColor(stroke);
  if (!parsed) return { r: 0, g: 0, b: 0 };
  return {
    r: Math.round(parsed[0] * 255),
    g: Math.round(parsed[1] * 255),
    b: Math.round(parsed[2] * 255),
  };
}

function oilWetIntoWetSettings(
  radiusPx: number,
  paintColor: { r: number; g: number; b: number },
  mixModel?: "spectral-wgm" | "ryb",
) {
  return {
    radiusPx: Number.isFinite(radiusPx) && radiusPx > 0 ? radiusPx : 8,
    hardness: 0.55,
    strength: 0.88,
    wetness: 0.65,
    pickup: 0.55,
    paintColor,
    loadDepletion: 0,
    mixModel: mixModel ?? "spectral-wgm",
  };
}

/**
 * Production oil paint: wet-into-wet mix on the destination, then the ribbon's
 * bristle / impasto overlay. StudioDrawNode and tests share this entry.
 */
export function paintStudioOilRibbonCarrier(
  context: StudioOilRibbonPaintContext,
  input: StudioOilRibbonPaintInput,
): StudioOilRibbonPaintReceipt {
  const paintColor = strokePaintColor(input.stroke);
  const radiusPx = Number.isFinite(input.radiusPx) && input.radiusPx > 0
    ? input.radiusPx
    : 8;
  const settings = oilWetIntoWetSettings(radiusPx, paintColor, input.mixModel);
  const hitPass = studioOilRibbonPaintIsHitPass(context, input.hitPass === true);
  let usedLiveDestination = false;

  if (hitPass) {
    // Path-only: never read or write the hit canvas. Body fill below stamps
    // the ribbon silhouette so selection/hit tests keep a closed shape.
  } else if (input.skipDestinationReadback === true) {
    // Live/committed scene paints stay on the ribbon paths. Pixel wet-into-wet
    // is reserved for an explicit destination buffer.
  } else if (input.destination) {
    const originX = input.destination.originX ?? 0;
    const originY = input.destination.originY ?? 0;
    applyStudioOilWetIntoWetStroke(
      input.destination.data,
      input.destination.width,
      input.destination.height,
      input.points.map((point) => ({ x: point.x - originX, y: point.y - originY })),
      settings,
    );
    usedLiveDestination = true;
  } else {
    const native = context._context;
    const canvas = native?.canvas;
    if (
      native
      && canvas
      && typeof native.getImageData === "function"
      && typeof native.putImageData === "function"
      && input.points.length > 0
      && canvas.width > 0
      && canvas.height > 0
    ) {
      try {
        const pad = Math.ceil(radiusPx + 2);
        let minX = input.points[0]!.x;
        let minY = input.points[0]!.y;
        let maxX = minX;
        let maxY = minY;
        for (const point of input.points) {
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        }
        const transform = native.getTransform?.() ?? {
          a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
        };
        const map = (x: number, y: number) => ({
          x: transform.a * x + transform.c * y + transform.e,
          y: transform.b * x + transform.d * y + transform.f,
        });
        const corners = [
          map(minX - pad, minY - pad),
          map(maxX + pad, minY - pad),
          map(minX - pad, maxY + pad),
          map(maxX + pad, maxY + pad),
        ];
        const devMinX = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.x))));
        const devMinY = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.y))));
        const devMaxX = Math.min(
          canvas.width,
          Math.ceil(Math.max(...corners.map((c) => c.x))),
        );
        const devMaxY = Math.min(
          canvas.height,
          Math.ceil(Math.max(...corners.map((c) => c.y))),
        );
        const width = devMaxX - devMinX;
        const height = devMaxY - devMinY;
        if (width > 0 && height > 0) {
          const image = native.getImageData(devMinX, devMinY, width, height);
          applyStudioOilWetIntoWetStroke(
            image.data,
            width,
            height,
            input.points.map((point) => {
              const mapped = map(point.x, point.y);
              return { x: mapped.x - devMinX, y: mapped.y - devMinY };
            }),
            settings,
          );
          native.putImageData(image, devMinX, devMinY);
          usedLiveDestination = true;
        }
      } catch {
        usedLiveDestination = false;
      }
    }
  }

  if (!usedLiveDestination && !hitPass && input.skipDestinationReadback !== true) {
    const scratch = new Uint8ClampedArray(16 * 16 * 4);
    applyStudioOilWetIntoWetStroke(
      scratch,
      16,
      16,
      [{ x: 8, y: 8 }],
      { ...settings, radiusPx: Math.min(settings.radiusPx, 6) },
    );
  }

  return paintStudioOilRibbonCarrierOverlay(context, input, usedLiveDestination, hitPass);
}

/**
 * Body fill + bristle/impasto overlay after wet-into-wet. Shared by the one-shot painter and the
 * live incremental suffix so both surfaces keep identical ridges.
 */
export function paintStudioOilRibbonCarrierOverlay(
  context: StudioOilRibbonPaintContext,
  input: Pick<
    StudioOilRibbonPaintInput,
    "carrier" | "stroke" | "opacity" | "includeBristleOverlay"
  >,
  usedLiveDestination: boolean,
  hitPass = false,
): StudioOilRibbonPaintReceipt {
  if (!input.carrier.body) {
    return { wetIntoWetApplied: true, usedLiveDestination, hitPass };
  }

  context.save();
  if (hitPass || !usedLiveDestination) {
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = clampUnit(input.carrier.bodyOpacity * input.opacity);
    context.beginPath();
    traceStudioOilRibbonPath(context, input.carrier.body, true);
    context.fillStyle = input.stroke;
    context.fill();
  }

  if (hitPass) {
    context.restore();
    return { wetIntoWetApplied: true, usedLiveDestination: false, hitPass };
  }

  if (input.includeBristleOverlay === false) {
    context.restore();
    return { wetIntoWetApplied: true, usedLiveDestination, hitPass };
  }

  context.globalCompositeOperation = "multiply";
  context.strokeStyle = input.stroke;
  // 강모 런은 3 스테이션짜리 짧은 폴리라인이고 레인 폭은 radiusY 의 상당 비율이다. butt 캡을
  // 씌우면 짧고 두꺼운 선분이 그대로 축정렬 직사각형이 되어, 4배 확대 대조 시트에서 유화 베드가
  // 털이 아니라 바코드 막대로 읽혔다 — 처음 보고된 "각진 입자"가 바로 이것이다. round 캡은 같은
  // 런을 캡슐로 만들어 각을 없앤다. 한 hair 의 이웃 런끼리 반 폭 겹치지만 레인은 한 번의 stroke
  // 로 그려지므로 겹침이 두 번 칠해지지 않는다(임파스토 릴리프는 이미 round 를 쓴다).
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const lane of input.carrier.bristleLanes) {
    context.globalAlpha = clampUnit(lane.opacity * input.opacity);
    context.lineWidth = Math.max(0.12, lane.lineWidth);
    context.beginPath();
    for (const run of lane.runs) {
      traceStudioOilRibbonPath(context, run);
    }
    context.stroke();
  }
  if (input.carrier.impastoReliefLanes) {
    context.lineCap = "round";
    for (const lane of input.carrier.impastoReliefLanes) {
      const highlight = lane.kind === "highlight";
      context.globalCompositeOperation = highlight ? "screen" : "multiply";
      context.strokeStyle = highlight
        ? STUDIO_OIL_IMPASTO_RELIEF_HIGHLIGHT_COLOR
        : input.stroke;
      context.globalAlpha = clampUnit(lane.opacity * input.opacity);
      context.lineWidth = Math.max(0.12, lane.lineWidth);
      context.beginPath();
      for (const run of lane.runs) {
        traceStudioOilRibbonPath(context, run);
      }
      context.stroke();
    }
  }
  context.restore();
  return { wetIntoWetApplied: true, usedLiveDestination, hitPass };
}

/**
 * Path-only hit silhouette. Konva `fillStrokeShape` stamps the node's colorKey
 * so this must not mix RGB or multiply overlays onto the hit canvas.
 */
export function paintStudioOilRibbonHit<TShape = never>(
  context: {
    beginPath(): void;
    fillStrokeShape?(shape: TShape): void;
    fill?(): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    closePath?(): void;
  },
  carrier: StudioOilRibbonCarrierPlan,
  shape?: TShape,
): void {
  if (!carrier.body) return;
  context.beginPath();
  traceStudioOilRibbonPath(context, carrier.body, true);
  if (typeof context.fillStrokeShape === "function") {
    context.fillStrokeShape(shape as TShape);
    return;
  }
  context.fill?.();
}
