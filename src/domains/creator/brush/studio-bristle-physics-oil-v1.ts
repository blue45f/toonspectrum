/**
 * Bristle-physics oil v1 — WetBrush-2D 물리 시뮬로 유화 리본 캐리어의 밴드 궤적을 구동한다.
 *
 * The oil ribbon carrier's bristle lanes today follow per-station hashed offsets
 * (`FxOilBristle.offsetRatio`): plausible tooth, but no *mechanics* — the tuft never
 * splays under pressure, never lags the stylus, never frays at speed. This module runs
 * the benchmarked bristle model (packages/studio-brush-platform/src/bristle-model.ts,
 * the WetBrush SIGGRAPH Asia 2015 2D reduction) along the carrier's own station
 * centreline and lowers the simulated tuft into three per-(station, lane) streams the
 * carrier multiplies into its band computation behind the `bristlePhysics` program key:
 *
 *   (a) laneOffsetRatio  — alpha-weighted lateral contact position of each lane's hair
 *                          group, in `radiusY` units (the exact `offsetRatio` currency
 *                          the carrier already consumes). Carries splay, spring
 *                          hysteresis, tilt shift and clump splitting.
 *   (b) laneLoadMultiplier — lane contact alpha against a reference-pressure contact,
 *                          so pressure, per-hair reservoir depletion and speed lift-off
 *                          modulate deposit exactly like the film-strength stream of
 *                          studio-oil-bristle-load-dynamics-v1.
 *   (c) laneWidthScale   — simulated contact radius against the rest hair radius:
 *                          pressure flattens the tuft into wider ridges, starving hairs
 *                          thin before they cut out.
 *
 * Verified-kernel policy: the physics live in the READ-ONLY platform module (imported by
 * direct path, exactly like its own doc prescribes); this file only maps carrier inputs
 * onto sim samples and aggregates footprints into lane streams — no re-implementation.
 *
 * Determinism: fixed 8 ms per station (the platform's own `bristleStrokeTracks` step),
 * seeded tuft layout, no clock and no Math.random. Same input → identical typed arrays.
 * The module never throws on malformed product input: every field is normalized into
 * the sim's validated ranges before `createBristleBrush` runs.
 */

import {
  createBristleBrush,
  stepBristles,
  type BristleBrushConfig,
  type BristleBrushState,
} from "../../../packages/studio-brush-platform/src/bristle-model";

export const STUDIO_BRISTLE_PHYSICS_OIL_V1_VERSION =
  "studio-bristle-physics-oil-v1" as const;

export const STUDIO_BRISTLE_PHYSICS_OIL_PROVENANCE = Object.freeze({
  model:
    "packages/studio-brush-platform bristle-model (WetBrush, Chen et al. SIGGRAPH Asia 2015 — 2D reduction, concepts only)",
  damping:
    "dli/paint brush.js BRUSH_DAMPING 0.75 lineage — the model's asymmetric spread spring supersedes the EMA variant",
  behaviour:
    "pressure→splay/flatten, speed→clump split + hair lift, travel→per-hair reservoir depletion; carrier consumes streams only",
} as const);

/** Brief contract: the physics lane simulates a 16..32 hair cross-section. */
export const STUDIO_BRISTLE_PHYSICS_OIL_BRISTLE_RANGE = Object.freeze({
  min: 16,
  max: 32,
} as const);

/** Fixed integration step — the platform's own whole-stroke helper uses 8 ms. */
export const STUDIO_BRISTLE_PHYSICS_OIL_STEP_MS = 8 as const;

/**
 * Normalized 0..1 station speed maps to px/ms against the tuft's split-speed
 * reference, so `speeds: [1, …]` is exactly a flat-out flick for the sim.
 */
export const STUDIO_BRISTLE_PHYSICS_OIL_SPEED_REF_PX_PER_MS = 2.5 as const;

/**
 * Lane offsets are clamped inside the ribbon body (the carrier's own hashed
 * offsets stay within ±0.92 of `radiusY`); a tuft fanned past the silhouette
 * would poke bristle ridges outside the paint.
 */
const MAX_OFFSET_RATIO = 0.92;

/**
 * Contact alpha of a reference-pressure (0.6), untilted round-tuft hair:
 * `opacity 1 × contactPressure (0.6 × mean round profile ≈ 0.78) × satisfaction 1`.
 * Dividing lane alpha by it makes the stream an absolute multiplier where a
 * mid-pressure wet stroke sits near 1 — the same convention as laneFilmStrength.
 */
const REFERENCE_CONTACT_ALPHA = 0.47;
/** Ceiling mirrors the load-dynamics MAX_FILM_DRIVE headroom (≈ ×1.5). */
const MAX_LOAD_MULTIPLIER = 1.6;
const WIDTH_SCALE_RANGE = Object.freeze({ min: 0.4, max: 2.2 });
/** Used when `pressures` is missing — the carrier's reference station feel. */
const FALLBACK_PRESSURE = 0.6;

/**
 * The physics tuft (16..32 hairs, deterministic seeding). Values are chosen for
 * an oil rake with real hand-feel, each against the platform's documented units:
 * - stiffness 0.62 / hysteresis 0.38: the loop the reversal gate measures — the
 *   fan opens ×1.38 faster than it closes, so unloading visibly lags.
 * - spreadResponse 1.15 / velocitySpread 0.35: pressure fans the tuft past its
 *   rest width and speed alone opens it measurably (streak precondition).
 * - splitThreshold 0.15 / splitSpeedWeight 0.9 / splitAmplitude 0.7 /
 *   liftFraction 0.6: the rough-preset family — fast strokes shear the tuft
 *   into clumps and lift hairs, which is what decorrelates lane offsets.
 * - inkCapacity 5 / flowRate 0.004: at the carrier's ~1.8 px station spacing a
 *   full dip lasts ≈ 1k stations at reference pressure, so ordinary strokes
 *   stay wet while a 2048-station pull dries into 갈필 streaks.
 * - stiffnessVariation 0.45 / layoutJitter 0.35 / capacityVariation 0.4: per-
 *   hair spread so lanes splay and starve at different arc lengths.
 */
export const STUDIO_BRISTLE_PHYSICS_OIL_TUFT = Object.freeze({
  stiffness: 0.62,
  spreadResponse: 1.15,
  inkCapacity: 5,
  tipProfile: "round",
  hysteresis: 0.38,
  velocitySpread: 0.35,
  splitThreshold: 0.15,
  splitSpeedWeight: 0.9,
  splitSpeedRefPxPerMs: STUDIO_BRISTLE_PHYSICS_OIL_SPEED_REF_PX_PER_MS,
  splitAmplitude: 0.7,
  liftFraction: 0.6,
  bristlesPerClump: 3,
  layoutJitter: 0.35,
  stiffnessVariation: 0.45,
  radiusVariation: 0.3,
  capacityVariation: 0.4,
  flowRate: 0.004,
} as const satisfies Partial<BristleBrushConfig>);

export const STUDIO_BRISTLE_PHYSICS_OIL_DEFAULT_BRISTLE_COUNT = 24 as const;

export interface StudioBristlePhysicsOilInput {
  /** Carrier station centreline, in travel order (px). */
  readonly stationXs: readonly number[];
  readonly stationYs: readonly number[];
  /** Bristle lane count of the carrier head (its shared bristle count). */
  readonly laneCount: number;
  /** Deterministic seed — reuse the stroke's brush seed. */
  readonly seed: number;
  /** Tuft rest half-width in px — pass the mean station `radiusY`. */
  readonly baseRadiusPx: number;
  /** Normalized 0..1 pressure per station; shorter arrays hold their last value. */
  readonly pressures?: readonly number[];
  /** Normalized 0..1 speed per station (1 = flat-out flick). Missing → derived from geometry. */
  readonly speeds?: readonly number[];
  /** Canvas-plane tilt, each -1..1. Missing → untilted. */
  readonly tiltX?: number;
  readonly tiltY?: number;
  /** Simulated hair count, clamped into 16..32. Default 24. */
  readonly bristleCount?: number;
  /** Used when `pressures` is absent/empty. Default 0.6. */
  readonly fallbackPressure?: number;
  /** Ink dip at stroke start, 0..1. Default 1 (fully loaded). */
  readonly initialLoad?: number;
}

export interface StudioBristlePhysicsOilPlan {
  readonly version: typeof STUDIO_BRISTLE_PHYSICS_OIL_V1_VERSION;
  readonly stationCount: number;
  readonly laneCount: number;
  readonly bristleCount: number;
  /**
   * Row-major `[station * laneCount + lane]` lateral lane position in `radiusY`
   * units (signed, clamped to ±0.92). Replaces the hashed `offsetRatio` for the
   * pinned lane; lanes with no touching hair hold their last position.
   */
  readonly laneOffsetRatio: Float64Array;
  /** Row-major deposit multiplier in [0, 1.6]; ≈ 1 at reference pressure. */
  readonly laneLoadMultiplier: Float64Array;
  /** Row-major ridge width multiplier in [0.4, 2.2]. */
  readonly laneWidthScale: Float64Array;
  /** Per-station fan opening (rest half-widths) — hysteresis diagnostics. */
  readonly spread: Float64Array;
  /** Per-station 0..1 dryness+speed split drive — streak diagnostics. */
  readonly splitDrive: Float64Array;
  /** Per-station 0..1 mean ink remaining across the tuft. */
  readonly inkRatio: Float64Array;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function finite01(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? clamp(value, 0, 1)
    : fallback;
}

function sampleSeries(
  series: readonly number[] | undefined,
  index: number,
  fallback: number,
): number {
  if (!series || series.length === 0) return fallback;
  const raw = series[Math.min(index, series.length - 1)];
  return finite01(raw, fallback);
}

function normalizedBristleCount(value: unknown): number {
  const { min, max } = STUDIO_BRISTLE_PHYSICS_OIL_BRISTLE_RANGE;
  return Math.floor(clamp(
    finiteNumber(value, STUDIO_BRISTLE_PHYSICS_OIL_DEFAULT_BRISTLE_COUNT),
    min,
    max,
  ));
}

function emptyPlan(laneCount: number, bristleCount: number): StudioBristlePhysicsOilPlan {
  return Object.freeze({
    version: STUDIO_BRISTLE_PHYSICS_OIL_V1_VERSION,
    stationCount: 0,
    laneCount,
    bristleCount,
    laneOffsetRatio: new Float64Array(0),
    laneLoadMultiplier: new Float64Array(0),
    laneWidthScale: new Float64Array(0),
    spread: new Float64Array(0),
    splitDrive: new Float64Array(0),
    inkRatio: new Float64Array(0),
  });
}

function createPhysicsTuft(
  bristleCount: number,
  seed: number,
  baseRadiusPx: number,
  initialLoad: number,
): BristleBrushState {
  const state = createBristleBrush({
    ...STUDIO_BRISTLE_PHYSICS_OIL_TUFT,
    bristleCount,
    // The sim contract requires an integer seed in [0, 2^32); studio seeds are
    // small ints, and `>>> 0` folds any negative/overflowing caller safely.
    seed: Math.floor(finiteNumber(seed, 0)) >>> 0,
    baseRadiusPx: clamp(finiteNumber(baseRadiusPx, 14), 0.25, 512),
  });
  // Partial dips are part of the program surface (dry-brush start), mirroring
  // the load-dynamics `initialLoad` dial.
  if (initialLoad < 1) {
    for (let index = 0; index < state.layout.length; index += 1) {
      state.ink[index] = state.layout[index]!.capacity * initialLoad;
    }
  }
  return state;
}

/**
 * Plan one stroke's physics streams. Pure and deterministic — the sim state is
 * local to the call; identical input produces identical typed arrays.
 *
 * Lane aggregation: sim hairs are index-ordered across the cross-section, so
 * the contiguous index group `floor(hair * laneCount / bristleCount)` is a
 * contiguous band of the tuft and maps 1:1 onto the carrier's ordered lanes
 * (lane 0 = most negative offsets). Offsets are projected onto the sim's own
 * path normal — the same centreline polyline the carrier walks — and re-applied
 * by the carrier along its smoothed normal, so the scalar stream transfers.
 */
export function planStudioBristlePhysicsOil(
  input: StudioBristlePhysicsOilInput,
): StudioBristlePhysicsOilPlan {
  const laneCount = Number.isInteger(input.laneCount) && input.laneCount > 0
    ? input.laneCount
    : 0;
  const bristleCount = Math.max(laneCount, normalizedBristleCount(input.bristleCount));
  const stationCount = Math.min(
    Array.isArray(input.stationXs) ? input.stationXs.length : 0,
    Array.isArray(input.stationYs) ? input.stationYs.length : 0,
  );
  if (stationCount === 0 || laneCount === 0 || bristleCount > 512) {
    return emptyPlan(laneCount, bristleCount);
  }

  const fallbackPressure = finite01(input.fallbackPressure, FALLBACK_PRESSURE);
  const initialLoad = finite01(input.initialLoad, 1);
  const tiltX = clamp(finiteNumber(input.tiltX, 0), -1, 1);
  const tiltY = clamp(finiteNumber(input.tiltY, 0), -1, 1);
  const baseRadiusPx = clamp(finiteNumber(input.baseRadiusPx, 14), 0.25, 512);
  const state = createPhysicsTuft(bristleCount, input.seed, baseRadiusPx, initialLoad);
  const explicitSpeeds = Array.isArray(input.speeds) && input.speeds.length > 0;

  // Rest bristle radius — the width stream's unit (see bristle-model stepping).
  const restBristleRadiusPx =
    (state.config.coverage * state.config.baseRadiusPx)
    / Math.max(1, state.config.bristleCount - 1);

  const laneOffsetRatio = new Float64Array(stationCount * laneCount);
  const laneLoadMultiplier = new Float64Array(stationCount * laneCount);
  const laneWidthScale = new Float64Array(stationCount * laneCount);
  const spread = new Float64Array(stationCount);
  const splitDrive = new Float64Array(stationCount);
  const inkRatio = new Float64Array(stationCount);

  // Hold-last lane state so a fully lifted lane keeps its geometry instead of
  // snapping to the centreline; initialized at each group's rest centroid.
  const heldOffset = new Float64Array(laneCount);
  const heldWidth = new Float64Array(laneCount).fill(1);
  const groupOf = new Int32Array(bristleCount);
  const groupSize = new Float64Array(laneCount);
  for (let hair = 0; hair < bristleCount; hair += 1) {
    const lane = Math.min(laneCount - 1, Math.floor((hair * laneCount) / bristleCount));
    groupOf[hair] = lane;
    groupSize[lane]! += 1;
    heldOffset[lane]! += state.layout[hair]!.restOffset;
  }
  for (let lane = 0; lane < laneCount; lane += 1) {
    heldOffset[lane] = groupSize[lane]! > 0
      ? clamp(heldOffset[lane]! / groupSize[lane]!, -MAX_OFFSET_RATIO, MAX_OFFSET_RATIO)
      : 0;
  }

  const offsetSum = new Float64Array(laneCount);
  const alphaSum = new Float64Array(laneCount);
  const radiusSum = new Float64Array(laneCount);
  const touchCount = new Float64Array(laneCount);

  let previousX = finiteNumber(input.stationXs[0], 0);
  let previousY = finiteNumber(input.stationYs[0], 0);
  for (let station = 0; station < stationCount; station += 1) {
    // Carrier stations are finite by construction; a malformed caller value
    // deterministically reuses the previous position instead of throwing.
    const x = finiteNumber(input.stationXs[station], previousX);
    const y = finiteNumber(input.stationYs[station], previousY);
    previousX = x;
    previousY = y;
    const pressure = sampleSeries(input.pressures, station, fallbackPressure);
    const report = stepBristles(state, {
      x,
      y,
      pressure,
      tiltX,
      tiltY,
      dtMs: STUDIO_BRISTLE_PHYSICS_OIL_STEP_MS,
      ...(explicitSpeeds
        ? {
          velocity: sampleSeries(input.speeds, station, 0)
            * STUDIO_BRISTLE_PHYSICS_OIL_SPEED_REF_PX_PER_MS,
        }
        : {}),
    });
    spread[station] = report.spread;
    splitDrive[station] = report.splitDrive;
    inkRatio[station] = report.inkRatio;

    offsetSum.fill(0);
    alphaSum.fill(0);
    radiusSum.fill(0);
    touchCount.fill(0);
    for (let hair = 0; hair < bristleCount; hair += 1) {
      const alpha = state.contactAlpha[hair]!;
      if (alpha <= 0) continue;
      const lane = groupOf[hair]!;
      const lateral = (state.contactX[hair]! - x) * state.normalX
        + (state.contactY[hair]! - y) * state.normalY;
      offsetSum[lane]! += lateral * alpha;
      alphaSum[lane]! += alpha;
      radiusSum[lane]! += state.contactRadius[hair]!;
      touchCount[lane]! += 1;
    }

    const rowOffset = station * laneCount;
    for (let lane = 0; lane < laneCount; lane += 1) {
      const touching = touchCount[lane]!;
      if (touching > 0 && alphaSum[lane]! > 0) {
        heldOffset[lane] = clamp(
          offsetSum[lane]! / alphaSum[lane]! / baseRadiusPx,
          -MAX_OFFSET_RATIO,
          MAX_OFFSET_RATIO,
        );
        heldWidth[lane] = clamp(
          radiusSum[lane]! / touching / restBristleRadiusPx,
          WIDTH_SCALE_RANGE.min,
          WIDTH_SCALE_RANGE.max,
        );
      }
      laneOffsetRatio[rowOffset + lane] = heldOffset[lane]!;
      laneWidthScale[rowOffset + lane] = heldWidth[lane]!;
      // Lifted/dry hairs count as zero deposit: a starving lane thins honestly.
      laneLoadMultiplier[rowOffset + lane] = clamp(
        (alphaSum[lane]! / groupSize[lane]!) / REFERENCE_CONTACT_ALPHA,
        0,
        MAX_LOAD_MULTIPLIER,
      );
    }
  }

  return Object.freeze({
    version: STUDIO_BRISTLE_PHYSICS_OIL_V1_VERSION,
    stationCount,
    laneCount,
    bristleCount,
    laneOffsetRatio,
    laneLoadMultiplier,
    laneWidthScale,
    spread,
    splitDrive,
    inkRatio,
  });
}
