import type { RasterStrokeSample } from "./raster-compile";
import type { ModeledSampleIR } from "@toonspectrum/studio-project-model";

/**
 * Bristle-level brush model (손맛·질감 최우선 웨이브).
 *
 * Every brush lane we ship today stamps a dab per spacing step: the tip has a
 * radius and an alpha, but no *body*. A real brush is a tuft of hairs that
 * flattens under pressure, leans into an ellipse under tilt, splits into
 * clumps as it dries, and carries ink hair-by-hair. This module is that body.
 *
 * Algorithmic lineage (concepts only — no upstream code):
 * WetBrush (Chen et al., SIGGRAPH Asia 2015) simulates each 3D bristle as a
 * rigid-spring chain that splays under load and picks up/deposits paint
 * individually. That is far outside a realtime web budget, so this is the 2D
 * reduction the product owner asked for: the tuft collapses to a **1D
 * cross-section** of N bristles, and per step we advance
 *
 *   (a) spread     — an over-damped spring on the fan opening, driven by
 *                    pressure/tilt/speed, with an asymmetric loading rate so
 *                    unloading lags loading (measurable hysteresis = 손맛);
 *   (b) offsets    — per-bristle lateral offset: stiffness-scaled splay plus
 *                    seeded clump displacement (갈라짐 / dry-brush streaks);
 *   (c) ink        — per-bristle reservoir consumed along the path and
 *                    redistributed to neighbours by a conservative capillary
 *                    diffusion, so a drying tuft frays instead of fading flat.
 *
 * Contracts:
 * - Pure and deterministic. No `Math.random`, no clock, no `console`: every
 *   stochastic quantity comes from `mix32` of (seed, salt, index). Same seed +
 *   same samples → identical stamps. (Bit-identity is scoped to one JS engine
 *   build: `Math.exp`/`Math.pow` are not cross-engine bit-exact by spec.)
 * - Zero silent loss: `createBristleBrush` throws `BristleModelError` on any
 *   out-of-contract config value rather than clamping it behind the artist's
 *   back, and {@link bristleStrokeTracks} reports the radius modulation the
 *   fixed-radius Hokusai lane cannot carry instead of dropping it quietly.
 * - React 0. This file is engine-agnostic geometry + reservoir state.
 *
 * Import by direct path — like ./brush-composition and ./stabilizer-provider
 * this module is intentionally NOT re-exported from the package barrel; barrel
 * integration is a coordinator decision.
 */

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class BristleModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BristleModelError";
  }
}

// ---------------------------------------------------------------------------
// Deterministic hashing (seeded; never Math.random)
// ---------------------------------------------------------------------------

const UINT32_SPAN = 0x1_0000_0000;

/** murmur-style 32-bit finalizer; integer in, integer out. */
function mix32(value: number): number {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb_352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846c_a68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

/** Stable value in [0, 1) for a (seed, salt, index) triple. */
function hashUnit(seed: number, salt: number, index: number): number {
  const identity =
    (seed >>> 0) ^
    Math.imul(salt + 1, 0x9e37_79b9) ^
    Math.imul(index + 1, 0x85eb_ca6b);
  return mix32(identity) / UINT32_SPAN;
}

/** Stable value in [-1, 1) for a (seed, salt, index) triple. */
function hashSigned(seed: number, salt: number, index: number): number {
  return hashUnit(seed, salt, index) * 2 - 1;
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Cross-section contact profile — how tip length falls off toward the edge. */
export type BristleTipProfile = "round" | "flat" | "irregular";

/**
 * Bristle brush configuration. Only the five fields the model cannot infer are
 * required; every tuning constant is optional and documented with its unit so
 * a preset override never becomes a silent behavioural change.
 */
export interface BristleBrushConfig {
  /** Number of hairs across the tuft cross-section (2..512). */
  bristleCount: number;
  /** Spring stiffness of the fan, 0..1 (1 = snaps back instantly). */
  stiffness: number;
  /** Fan opening at full pressure, as a fraction of the rest half-width (0..4). */
  spreadResponse: number;
  /** Ink units a fully loaded bristle carries (>0). */
  inkCapacity: number;
  /** Deterministic seed for layout + clump + lift noise. */
  seed: number;

  /** Rest half-width of the tuft in px (default 14). */
  baseRadiusPx?: number;
  /** Tip contact falloff across the cross-section (default "round"). */
  tipProfile?: BristleTipProfile;
  /** Bristle diameter as a multiple of rest spacing (default 1.7 = solid at rest). */
  coverage?: number;

  /** Spring rate scale in 1/s applied to `stiffness` (default 18). */
  springRateHz?: number;
  /**
   * Loading/unloading asymmetry, 0..0.9 (default 0.35). Loading runs at
   * `1 + hysteresis` and unloading at `1 - hysteresis` times the spring rate,
   * so the tuft stays open on the way down — the hysteresis loop is the
   * 손맛 signal the quality gate measures.
   */
  hysteresis?: number;
  /** Pressure exponent of the spread target (default 1.3). */
  spreadExponent?: number;
  /** Extra spread per unit tilt magnitude (default 0.35). */
  tiltSpreadGain?: number;
  /** Extra spread at `velocityRefPxPerMs` (default 0.12). */
  velocitySpread?: number;
  /** Velocity that saturates `velocitySpread`, px/ms (default 2). */
  velocityRefPxPerMs?: number;

  /** Contact centroid shift per unit tilt, in rest half-widths (default 0.45). */
  tiltShift?: number;
  /** Per-bristle contact asymmetry under tilt, 0..1.5 (default 0.6). */
  tiltContact?: number;
  /** Tip elongation at full tilt (default 0.25). */
  tiltElongation?: number;
  /** Tip flattening (radius growth) at spread 1 (default 0.8). */
  flattenGain?: number;

  /** Ink units drawn per px of travel at full contact pressure (default 0.005). */
  flowRate?: number;
  /** Ink drawn per step even when stationary, in px-equivalents (default 0.15). */
  idleFlowPx?: number;
  /** Ink ratio below which alpha starts fading, 0..1 (default 0.35). */
  inkFadeFraction?: number;
  /** Capillary exchange rate between neighbouring bristles, 1/s (default 0.35). */
  capillary?: number;
  /** Peak stamp alpha at full contact pressure, 0..1 (default 1). */
  opacity?: number;

  /** Dryness+speed drive below which the tuft never splits, 0..1 (default 0.35). */
  splitThreshold?: number;
  /** Weight of dryness in the split drive (default 0.85). */
  splitDrynessWeight?: number;
  /** Weight of speed in the split drive (default 0.5). */
  splitSpeedWeight?: number;
  /** Speed that saturates the split drive, px/ms (default 2.5). */
  splitSpeedRefPxPerMs?: number;
  /** Clump separation at full split drive, in rest half-widths (default 0.5). */
  splitAmplitude?: number;
  /** Fraction of bristles that lift off the surface at full split drive (default 0.55). */
  liftFraction?: number;
  /** Bristles per clump; clumps are what separate into streaks (default 4). */
  bristlesPerClump?: number;

  /** Rest-offset jitter as a fraction of spacing, 0..1 (default 0.25). */
  layoutJitter?: number;
  /** Per-bristle stiffness spread, 0..0.9 (default 0.25). */
  stiffnessVariation?: number;
  /** Per-bristle tip radius spread, 0..0.9 (default 0.15). */
  radiusVariation?: number;
  /** Per-bristle ink capacity spread, 0..0.9 (default 0.3). */
  capacityVariation?: number;

  /** Sample dt is clamped into [minDtMs, maxDtMs] before integration. */
  minDtMs?: number;
  maxDtMs?: number;
}

export type ResolvedBristleBrushConfig = Required<BristleBrushConfig>;

/** The five dimensions a tuft cannot be inferred from. */
type BristleRequiredField =
  | "bristleCount"
  | "stiffness"
  | "spreadResponse"
  | "inkCapacity"
  | "seed";

const DEFAULT_TIP_PROFILE: BristleTipProfile = "round";

const CONFIG_DEFAULTS = {
  baseRadiusPx: 14,
  coverage: 1.7,
  springRateHz: 18,
  hysteresis: 0.35,
  spreadExponent: 1.3,
  tiltSpreadGain: 0.35,
  velocitySpread: 0.12,
  velocityRefPxPerMs: 2,
  tiltShift: 0.45,
  tiltContact: 0.6,
  tiltElongation: 0.25,
  flattenGain: 0.8,
  flowRate: 0.005,
  idleFlowPx: 0.15,
  inkFadeFraction: 0.35,
  capillary: 0.35,
  opacity: 1,
  splitThreshold: 0.35,
  splitDrynessWeight: 0.85,
  splitSpeedWeight: 0.5,
  splitSpeedRefPxPerMs: 2.5,
  splitAmplitude: 0.5,
  liftFraction: 0.55,
  bristlesPerClump: 4,
  layoutJitter: 0.25,
  stiffnessVariation: 0.25,
  radiusVariation: 0.15,
  capacityVariation: 0.3,
  minDtMs: 1,
  maxDtMs: 40,
} as const satisfies Record<
  Exclude<BristleNumericField, BristleRequiredField>,
  number
>;

interface RangeSpec {
  readonly min: number;
  readonly max: number;
  readonly integer?: boolean;
}

/** Every field of the resolved config except the enum. */
type BristleNumericField = keyof Omit<ResolvedBristleBrushConfig, "tipProfile">;

/**
 * `satisfies Record<BristleNumericField, RangeSpec>` is load-bearing: adding a
 * config field without a range would fail the build instead of slipping
 * through validation as `undefined`.
 */
const CONFIG_RANGES = {
  bristleCount: { min: 2, max: 512, integer: true },
  stiffness: { min: 0.01, max: 1 },
  spreadResponse: { min: 0, max: 4 },
  inkCapacity: { min: 1e-6, max: 1e6 },
  seed: { min: 0, max: 0xffff_ffff, integer: true },
  baseRadiusPx: { min: 0.25, max: 512 },
  coverage: { min: 0.1, max: 8 },
  springRateHz: { min: 0.1, max: 1000 },
  hysteresis: { min: 0, max: 0.9 },
  spreadExponent: { min: 0.1, max: 6 },
  tiltSpreadGain: { min: 0, max: 4 },
  velocitySpread: { min: 0, max: 4 },
  velocityRefPxPerMs: { min: 1e-3, max: 100 },
  tiltShift: { min: 0, max: 4 },
  tiltContact: { min: 0, max: 1.5 },
  tiltElongation: { min: 0, max: 4 },
  flattenGain: { min: 0, max: 4 },
  flowRate: { min: 0, max: 10 },
  idleFlowPx: { min: 0, max: 100 },
  inkFadeFraction: { min: 1e-3, max: 1 },
  capillary: { min: 0, max: 40 },
  opacity: { min: 0, max: 1 },
  splitThreshold: { min: 0, max: 0.99 },
  splitDrynessWeight: { min: 0, max: 4 },
  splitSpeedWeight: { min: 0, max: 4 },
  splitSpeedRefPxPerMs: { min: 1e-3, max: 100 },
  splitAmplitude: { min: 0, max: 8 },
  liftFraction: { min: 0, max: 1 },
  bristlesPerClump: { min: 1, max: 512, integer: true },
  layoutJitter: { min: 0, max: 1 },
  stiffnessVariation: { min: 0, max: 0.9 },
  radiusVariation: { min: 0, max: 0.9 },
  capacityVariation: { min: 0, max: 0.9 },
  minDtMs: { min: 1e-3, max: 1000 },
  maxDtMs: { min: 1e-3, max: 1000 },
} as const satisfies Record<BristleNumericField, RangeSpec>;

const CONFIG_FIELDS = Object.keys(CONFIG_RANGES) as BristleNumericField[];

const TIP_PROFILES: ReadonlySet<string> = new Set<BristleTipProfile>([
  "round",
  "flat",
  "irregular",
]);

function requireInRange(name: BristleNumericField, value: number): number {
  const range: RangeSpec = CONFIG_RANGES[name];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BristleModelError(`config.${name} must be a finite number`);
  }
  if (range.integer && !Number.isInteger(value)) {
    throw new BristleModelError(`config.${name} must be an integer, got ${value}`);
  }
  if (value < range.min || value > range.max) {
    throw new BristleModelError(
      `config.${name} must be within [${range.min}, ${range.max}], got ${value}`,
    );
  }
  return value;
}

/** Validate loudly and fill defaults. Never clamps a caller's value silently. */
export function resolveBristleBrushConfig(
  config: BristleBrushConfig,
): ResolvedBristleBrushConfig {
  const tipProfile = config.tipProfile ?? DEFAULT_TIP_PROFILE;
  if (!TIP_PROFILES.has(tipProfile)) {
    throw new BristleModelError(
      `config.tipProfile must be one of round|flat|irregular, got ${String(tipProfile)}`,
    );
  }
  const defaults: Partial<Record<BristleNumericField, number>> = CONFIG_DEFAULTS;
  const merged = {} as Record<BristleNumericField, number>;
  for (const name of CONFIG_FIELDS) {
    const value = config[name] ?? defaults[name];
    if (value === undefined) {
      throw new BristleModelError(`config.${name} is required`);
    }
    merged[name] = requireInRange(name, value);
  }
  if (merged.minDtMs > merged.maxDtMs) {
    throw new BristleModelError(
      `config.minDtMs (${merged.minDtMs}) must not exceed config.maxDtMs (${merged.maxDtMs})`,
    );
  }
  if (merged.bristlesPerClump > merged.bristleCount) {
    throw new BristleModelError(
      `config.bristlesPerClump (${merged.bristlesPerClump}) must not exceed config.bristleCount (${merged.bristleCount})`,
    );
  }
  return { ...merged, tipProfile };
}

// ---------------------------------------------------------------------------
// Presets (둥근붓 / 평붓 / 갈필용 거친붓)
// ---------------------------------------------------------------------------

export type BristlePresetId = "round" | "flat" | "rough";

/**
 * Three tufts with genuinely different physics, not three colours of the same
 * brush: the round tip keeps a soft edge and holds ink, the flat tip is a wide
 * pre-splayed blade with a hard edge, the rough tip is a sparse stiff-and-
 * uneven tuft that starves early and frays on the first fast stroke (갈필).
 */
export const BRISTLE_PRESETS: Readonly<Record<BristlePresetId, BristleBrushConfig>> =
  Object.freeze({
    round: Object.freeze({
      bristleCount: 16,
      stiffness: 0.55,
      spreadResponse: 0.9,
      inkCapacity: 1,
      seed: 0x5eed_1001,
      baseRadiusPx: 14,
      tipProfile: "round",
      coverage: 1.7,
      hysteresis: 0.35,
      capacityVariation: 0.3,
      splitThreshold: 0.35,
    }),
    flat: Object.freeze({
      bristleCount: 24,
      stiffness: 0.75,
      spreadResponse: 0.45,
      inkCapacity: 1.25,
      seed: 0x5eed_2002,
      baseRadiusPx: 20,
      tipProfile: "flat",
      coverage: 1.9,
      hysteresis: 0.22,
      spreadExponent: 1.1,
      tiltShift: 0.55,
      tiltContact: 0.85,
      layoutJitter: 0.12,
      stiffnessVariation: 0.15,
      radiusVariation: 0.1,
      capacityVariation: 0.2,
      bristlesPerClump: 6,
      splitThreshold: 0.45,
    }),
    rough: Object.freeze({
      bristleCount: 12,
      stiffness: 0.85,
      spreadResponse: 1.35,
      inkCapacity: 0.55,
      seed: 0x5eed_3003,
      baseRadiusPx: 16,
      tipProfile: "irregular",
      coverage: 1.45,
      hysteresis: 0.5,
      flowRate: 0.008,
      capillary: 0.12,
      inkFadeFraction: 0.5,
      layoutJitter: 0.6,
      stiffnessVariation: 0.55,
      radiusVariation: 0.45,
      capacityVariation: 0.55,
      bristlesPerClump: 2,
      splitThreshold: 0.15,
      splitAmplitude: 0.7,
      liftFraction: 0.7,
    }),
  } satisfies Record<BristlePresetId, BristleBrushConfig>);

// ---------------------------------------------------------------------------
// Brush state
// ---------------------------------------------------------------------------

/** Immutable per-bristle layout, decided once at `createBristleBrush`. */
export interface BristleLayoutEntry {
  readonly index: number;
  /** Rest position across the tuft, -1 (one edge) .. +1 (the other). */
  readonly restOffset: number;
  /** Stiffness multiplier; stiffer hairs splay less. */
  readonly stiffness: number;
  /** Tip radius multiplier. */
  readonly radiusScale: number;
  /** Ink units this hair holds when fully loaded. */
  readonly capacity: number;
  /** Contact profile 0..1 from the tip shape (round tips shorten at the edge). */
  readonly profile: number;
  /** Clump id; clumps are what separate into dry-brush streaks. */
  readonly clump: number;
  /** Stable 0..1 rank deciding the order hairs lift off as the tuft dries. */
  readonly liftBias: number;
}

export interface BristleBrushState {
  readonly config: ResolvedBristleBrushConfig;
  readonly layout: readonly BristleLayoutEntry[];
  /** Signed lateral direction each clump travels at full split drive. */
  readonly clumpDirection: Float64Array;
  /** Per-bristle ink remaining (ink units). */
  readonly ink: Float64Array;
  /** Contact scratch — refreshed by every `stepBristles`. */
  readonly contactX: Float64Array;
  readonly contactY: Float64Array;
  readonly contactRadius: Float64Array;
  readonly contactAlpha: Float64Array;
  /** Fan opening, in rest half-widths. */
  spread: number;
  /** Current split drive 0..1 (dryness + speed above threshold). */
  splitDrive: number;
  /** Last sample position and unit tangent/normal. */
  x: number;
  y: number;
  tangentX: number;
  tangentY: number;
  normalX: number;
  normalY: number;
  tiltX: number;
  tiltY: number;
  pressure: number;
  arcLengthPx: number;
  tMs: number;
  stepCount: number;
  /** Ink units deposited by the most recent step. */
  lastDeposited: number;
  /** Ink units deposited since the brush was created or reset. */
  totalDeposited: number;
}

function tipProfileValue(
  profile: BristleTipProfile,
  offset: number,
  seed: number,
  index: number,
): number {
  if (profile === "round") {
    return Math.max(0.15, Math.sqrt(Math.max(0, 1 - offset * offset)));
  }
  if (profile === "flat") {
    const edge = Math.abs(offset);
    return 1 - 0.15 * edge * edge * edge * edge;
  }
  // "irregular": a beaten-up tuft — hair length is uneven all the way across.
  return 0.45 + 0.55 * hashUnit(seed, 0x1f, index);
}

/**
 * Build a bristle tuft: cross-section positions, per-hair stiffness/radius/ink
 * capacity, clump assignment and lift order. Pure — same config, same tuft.
 */
export function createBristleBrush(config: BristleBrushConfig): BristleBrushState {
  const resolved = resolveBristleBrushConfig(config);
  const count = resolved.bristleCount;
  const spacing = count > 1 ? 2 / (count - 1) : 0;
  const clumpCount = Math.max(1, Math.round(count / resolved.bristlesPerClump));
  const layout: BristleLayoutEntry[] = [];

  for (let index = 0; index < count; index += 1) {
    const uniform = count > 1 ? (index / (count - 1)) * 2 - 1 : 0;
    const jitter =
      hashSigned(resolved.seed, 0x01, index) * resolved.layoutJitter * spacing * 0.5;
    const restOffset = clamp(uniform + jitter, -1, 1);
    const stiffness =
      1 + hashSigned(resolved.seed, 0x02, index) * resolved.stiffnessVariation;
    const radiusScale =
      1 + hashSigned(resolved.seed, 0x03, index) * resolved.radiusVariation;
    const capacity =
      resolved.inkCapacity *
      (1 + hashSigned(resolved.seed, 0x04, index) * resolved.capacityVariation);
    const profile = tipProfileValue(
      resolved.tipProfile,
      restOffset,
      resolved.seed,
      index,
    );
    const clump = Math.min(
      clumpCount - 1,
      Math.floor(((restOffset + 1) / 2) * clumpCount),
    );
    layout.push({
      index,
      restOffset,
      stiffness: Math.max(0.05, stiffness),
      radiusScale: Math.max(0.05, radiusScale),
      capacity: Math.max(1e-9, capacity),
      profile: clamp(profile, 0.02, 1),
      clump,
      liftBias: hashUnit(resolved.seed, 0x05, index),
    });
  }

  // Clumps drift outward from the tuft centre (plus a seeded wobble) so the
  // streaks a dry brush leaves are stable, asymmetric and layout-correlated.
  const clumpCentre = new Float64Array(clumpCount);
  const clumpMembers = new Float64Array(clumpCount);
  for (const entry of layout) {
    clumpCentre[entry.clump] += entry.restOffset;
    clumpMembers[entry.clump] += 1;
  }
  const clumpDirection = new Float64Array(clumpCount);
  for (let clump = 0; clump < clumpCount; clump += 1) {
    const members = clumpMembers[clump];
    const centre = members > 0 ? clumpCentre[clump] / members : 0;
    clumpDirection[clump] =
      0.7 * centre + 0.3 * hashSigned(resolved.seed, 0x06, clump);
  }

  const ink = new Float64Array(count);
  for (let index = 0; index < count; index += 1) {
    ink[index] = layout[index].capacity;
  }

  return {
    config: resolved,
    layout,
    clumpDirection,
    ink,
    contactX: new Float64Array(count),
    contactY: new Float64Array(count),
    contactRadius: new Float64Array(count),
    contactAlpha: new Float64Array(count),
    spread: 0,
    splitDrive: 0,
    x: 0,
    y: 0,
    tangentX: 1,
    tangentY: 0,
    normalX: 0,
    normalY: 1,
    tiltX: 0,
    tiltY: 0,
    pressure: 0,
    arcLengthPx: 0,
    tMs: 0,
    stepCount: 0,
    lastDeposited: 0,
    totalDeposited: 0,
  };
}

/** Preset constructor; `overrides` are validated exactly like a raw config. */
export function createBristleBrushFromPreset(
  preset: BristlePresetId,
  overrides: Partial<BristleBrushConfig> = {},
): BristleBrushState {
  const base = BRISTLE_PRESETS[preset];
  if (!base) {
    throw new BristleModelError(`unknown bristle preset ${String(preset)}`);
  }
  return createBristleBrush({ ...base, ...overrides });
}

/** Re-dip the brush. `load` 1 = full, 0.5 = half-loaded. */
export function reloadBristleBrush(state: BristleBrushState, load = 1): void {
  if (!Number.isFinite(load) || load < 0 || load > 1) {
    throw new BristleModelError(`reload load must be within [0, 1], got ${load}`);
  }
  for (let index = 0; index < state.layout.length; index += 1) {
    state.ink[index] = state.layout[index].capacity * load;
  }
}

/** Lift the brush: fan relaxes, contact clears, ink is kept. */
export function resetBristleStroke(state: BristleBrushState): void {
  state.spread = 0;
  state.splitDrive = 0;
  state.pressure = 0;
  state.arcLengthPx = 0;
  state.stepCount = 0;
  state.lastDeposited = 0;
  state.contactAlpha.fill(0);
  state.contactRadius.fill(0);
}

// ---------------------------------------------------------------------------
// Stepping
// ---------------------------------------------------------------------------

export interface BristleSample {
  readonly x: number;
  readonly y: number;
  /** Normalized pen pressure, 0..1. */
  readonly pressure: number;
  /** Tilt projected onto the canvas plane, each component -1..1. */
  readonly tiltX?: number;
  readonly tiltY?: number;
  /** px/ms; derived from the path when omitted. */
  readonly velocity?: number;
  /** ms since the previous sample; derived from `tMs` when omitted. */
  readonly dtMs?: number;
  /** Absolute timestamp in ms. */
  readonly tMs?: number;
}

export interface BristleStepReport {
  /** Fan opening after this step, in rest half-widths. */
  readonly spread: number;
  /** Spread the spring is chasing (the un-lagged target). */
  readonly spreadTarget: number;
  /** 0..1 dryness+speed drive that separates clumps and lifts hairs. */
  readonly splitDrive: number;
  /** Hairs touching the surface this step. */
  readonly contactCount: number;
  /** Hairs lifted off by splitting this step. */
  readonly liftedCount: number;
  /** Ink units deposited this step. */
  readonly deposited: number;
  /** Mean ink ratio across the tuft, 0..1. */
  readonly inkRatio: number;
  /** Travel this step, px. */
  readonly stepLengthPx: number;
}

const CONTACT_EPSILON = 1e-4;

/**
 * Advance the tuft by one input sample.
 *
 * State equations (dt in seconds, P = pressure, T = tilt vector, v = px/ms):
 *
 *   S* = spreadResponse · P^spreadExponent · (1 + tiltSpreadGain·|T|)
 *        + velocitySpread · min(1, v/vRef)                            (target)
 *   k  = stiffness · springRateHz · (S* > S ? 1+h : 1−h)              (asymmetric)
 *   S ← S + (S* − S)·(1 − e^(−k·dt))                                  (over-damped)
 *
 *   D  = clamp((wDry·dryness + wSpd·min(1, v/vSplit) − θ) / (wDry+wSpd−θ), 0, 1)
 *   ℓ_i = restOffset_i · R · (1 + S/stiffness_i) + D·splitAmplitude·R·dir_clump(i)
 *   w_i = profile_i · clamp(1 + tiltContact·(T·n)·restOffset_i, 0.05, 2)
 *   p_i = clamp(P·w_i, 0, 1.5)
 *
 *   demand_i  = flowRate·p_i·(ds + idleFlowPx)
 *   release_i = min(ink_i, demand_i);  ink_i ← ink_i − release_i
 *   α_i       = opacity · p_i · (release_i/demand_i) · min(1, ink_i⁻/(cap_i·fade))
 *   ink       ← ink + capillary·dt·∇²ink            (conservative, Neumann)
 *
 * Hairs with `liftBias_i < D·liftFraction` lift off (α = 0) — that plus the
 * per-hair reservoir running dry is what opens the 갈필 streaks.
 */
export function stepBristles(
  state: BristleBrushState,
  sample: BristleSample,
): BristleStepReport {
  const config = state.config;
  if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y)) {
    throw new BristleModelError("sample.x and sample.y must be finite");
  }
  if (
    !Number.isFinite(sample.pressure) ||
    sample.pressure < 0 ||
    sample.pressure > 1
  ) {
    throw new BristleModelError(
      `sample.pressure must be within [0, 1], got ${sample.pressure}`,
    );
  }
  const tiltX = sample.tiltX ?? 0;
  const tiltY = sample.tiltY ?? 0;
  if (!Number.isFinite(tiltX) || !Number.isFinite(tiltY)) {
    throw new BristleModelError("sample.tiltX and sample.tiltY must be finite");
  }
  const tMs = sample.tMs ?? state.tMs + (sample.dtMs ?? config.minDtMs);
  const rawDtMs = sample.dtMs ?? (state.stepCount === 0 ? config.minDtMs : tMs - state.tMs);
  if (!Number.isFinite(rawDtMs)) {
    throw new BristleModelError("sample dt could not be derived (non-finite tMs)");
  }
  const dtMs = clamp(rawDtMs, config.minDtMs, config.maxDtMs);
  const dtSec = dtMs / 1000;

  const first = state.stepCount === 0;
  const dx = first ? 0 : sample.x - state.x;
  const dy = first ? 0 : sample.y - state.y;
  const stepLengthPx = Math.sqrt(dx * dx + dy * dy);
  if (stepLengthPx > 1e-9) {
    state.tangentX = dx / stepLengthPx;
    state.tangentY = dy / stepLengthPx;
    state.normalX = -state.tangentY;
    state.normalY = state.tangentX;
  }
  const velocity =
    sample.velocity !== undefined
      ? sample.velocity
      : rawDtMs > 0
        ? stepLengthPx / rawDtMs
        : 0;
  if (!Number.isFinite(velocity) || velocity < 0) {
    throw new BristleModelError(
      `sample.velocity must be a finite non-negative px/ms value, got ${velocity}`,
    );
  }

  // --- (a) spread: over-damped spring with loading/unloading asymmetry -----
  const pressure = sample.pressure;
  const tiltMagnitude = clamp(Math.sqrt(tiltX * tiltX + tiltY * tiltY), 0, 1);
  const spreadTarget =
    config.spreadResponse *
      Math.pow(pressure, config.spreadExponent) *
      (1 + config.tiltSpreadGain * tiltMagnitude) +
    config.velocitySpread * clamp(velocity / config.velocityRefPxPerMs, 0, 1);
  const loading = spreadTarget > state.spread;
  const rate =
    config.stiffness *
    config.springRateHz *
    (loading ? 1 + config.hysteresis : 1 - config.hysteresis);
  state.spread += (spreadTarget - state.spread) * (1 - Math.exp(-rate * dtSec));

  // --- (b) split drive: dryness + speed above threshold --------------------
  let inkTotal = 0;
  let capacityTotal = 0;
  for (let index = 0; index < state.layout.length; index += 1) {
    inkTotal += state.ink[index];
    capacityTotal += state.layout[index].capacity;
  }
  const inkRatio = capacityTotal > 0 ? clamp(inkTotal / capacityTotal, 0, 1) : 0;
  const dryness = 1 - inkRatio;
  const speedTerm = clamp(velocity / config.splitSpeedRefPxPerMs, 0, 1);
  const driveSpan = Math.max(
    1e-6,
    config.splitDrynessWeight + config.splitSpeedWeight - config.splitThreshold,
  );
  const splitDrive = clamp(
    (config.splitDrynessWeight * dryness +
      config.splitSpeedWeight * speedTerm -
      config.splitThreshold) /
      driveSpan,
    0,
    1,
  );
  state.splitDrive = splitDrive;

  // --- (c) contact + ink ---------------------------------------------------
  const radius = config.baseRadiusPx;
  const bristleRadiusPx =
    (config.coverage * config.baseRadiusPx) / Math.max(1, config.bristleCount - 1);
  const tiltAlongNormal = tiltX * state.normalX + tiltY * state.normalY;
  const shiftX = config.tiltShift * radius * (1 + state.spread) * tiltX;
  const shiftY = config.tiltShift * radius * (1 + state.spread) * tiltY;
  const flattening = 1 + config.flattenGain * state.spread;
  const elongation = 1 + config.tiltElongation * tiltMagnitude;
  const liftCut = splitDrive * config.liftFraction;
  const travel = stepLengthPx + config.idleFlowPx;

  let deposited = 0;
  let contactCount = 0;
  let liftedCount = 0;

  for (let index = 0; index < state.layout.length; index += 1) {
    const entry = state.layout[index];
    if (entry.liftBias < liftCut) {
      state.contactAlpha[index] = 0;
      state.contactRadius[index] = 0;
      liftedCount += 1;
      continue;
    }
    const splay = 1 + state.spread / entry.stiffness;
    const lateral =
      entry.restOffset * radius * splay +
      splitDrive * config.splitAmplitude * radius * state.clumpDirection[entry.clump];
    const contactWeight =
      entry.profile *
      clamp(1 + config.tiltContact * tiltAlongNormal * entry.restOffset, 0.05, 2);
    const contactPressure = clamp(pressure * contactWeight, 0, 1.5);

    state.contactX[index] = sample.x + state.normalX * lateral + shiftX;
    state.contactY[index] = sample.y + state.normalY * lateral + shiftY;

    if (contactPressure <= CONTACT_EPSILON) {
      state.contactAlpha[index] = 0;
      state.contactRadius[index] = 0;
      continue;
    }

    const inkBefore = state.ink[index];
    const demand = config.flowRate * contactPressure * travel;
    const release = demand > 0 ? Math.min(inkBefore, demand) : 0;
    state.ink[index] = inkBefore - release;
    deposited += release;

    const satisfaction = demand > 1e-12 ? release / demand : inkBefore > 0 ? 1 : 0;
    const loadFactor = clamp(
      inkBefore / (entry.capacity * config.inkFadeFraction),
      0,
      1,
    );
    const alpha = clamp(
      config.opacity * contactPressure * satisfaction * loadFactor,
      0,
      1,
    );
    state.contactAlpha[index] = alpha;
    state.contactRadius[index] =
      alpha > 0
        ? bristleRadiusPx *
          entry.radiusScale *
          (0.55 + 0.45 * contactPressure) *
          flattening *
          elongation
        : 0;
    if (alpha > 0) contactCount += 1;
  }

  // --- capillary redistribution (conservative, neighbours only) ------------
  const exchange = clamp(config.capillary * dtSec, 0, 0.4);
  if (exchange > 0 && state.layout.length > 1) {
    const count = state.layout.length;
    const flux = new Float64Array(count - 1);
    for (let index = 0; index < count - 1; index += 1) {
      flux[index] = exchange * (state.ink[index + 1] - state.ink[index]);
    }
    for (let index = 0; index < count - 1; index += 1) {
      state.ink[index] += flux[index];
      state.ink[index + 1] -= flux[index];
    }
  }

  state.x = sample.x;
  state.y = sample.y;
  state.tiltX = tiltX;
  state.tiltY = tiltY;
  state.pressure = pressure;
  state.arcLengthPx += stepLengthPx;
  state.tMs = tMs;
  state.stepCount += 1;
  state.lastDeposited = deposited;
  state.totalDeposited += deposited;

  return {
    spread: state.spread,
    spreadTarget,
    splitDrive,
    contactCount,
    liftedCount,
    deposited,
    inkRatio,
    stepLengthPx,
  };
}

// ---------------------------------------------------------------------------
// Footprint
// ---------------------------------------------------------------------------

/**
 * One bristle's contact disc. Shape-compatible with the analytic dab the
 * raster/WebGPU stamp lanes consume (centre, radius, alpha) — see
 * {@link bristleStrokeTracks} for the Hokusai `addSample` join.
 */
export interface BristleStamp {
  readonly bristleIndex: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly alpha: number;
  /** Ink left in this hair after the step that produced the stamp. */
  readonly ink: number;
}

export interface BristleFootprint {
  readonly stamps: readonly BristleStamp[];
  readonly contactCount: number;
  /** Alpha-weighted contact centroid — moves with tilt. */
  readonly centroidX: number;
  readonly centroidY: number;
  /** Contact extent measured along the cross-section normal, px. */
  readonly contactWidthPx: number;
  readonly spread: number;
  readonly splitDrive: number;
  readonly inkRatio: number;
  readonly normalX: number;
  readonly normalY: number;
  readonly tangentX: number;
  readonly tangentY: number;
}

const EMPTY_FOOTPRINT_STAMPS: readonly BristleStamp[] = Object.freeze([]);

/**
 * Project the current contact state into a dab-stamp list. Pure: calling it
 * twice without stepping returns identical stamps.
 */
export function bristleFootprint(state: BristleBrushState): BristleFootprint {
  const stamps: BristleStamp[] = [];
  let weight = 0;
  let centroidX = 0;
  let centroidY = 0;
  let minProjection = Number.POSITIVE_INFINITY;
  let maxProjection = Number.NEGATIVE_INFINITY;
  let inkTotal = 0;
  let capacityTotal = 0;

  for (let index = 0; index < state.layout.length; index += 1) {
    inkTotal += state.ink[index];
    capacityTotal += state.layout[index].capacity;
    const alpha = state.contactAlpha[index];
    if (alpha <= 0) continue;
    const x = state.contactX[index];
    const y = state.contactY[index];
    const radius = state.contactRadius[index];
    stamps.push({
      bristleIndex: index,
      x,
      y,
      radius,
      alpha,
      ink: state.ink[index],
    });
    weight += alpha;
    centroidX += x * alpha;
    centroidY += y * alpha;
    const projection = (x - state.x) * state.normalX + (y - state.y) * state.normalY;
    if (projection - radius < minProjection) minProjection = projection - radius;
    if (projection + radius > maxProjection) maxProjection = projection + radius;
  }

  const hasContact = stamps.length > 0;
  return {
    stamps: hasContact ? stamps : EMPTY_FOOTPRINT_STAMPS,
    contactCount: stamps.length,
    centroidX: hasContact && weight > 0 ? centroidX / weight : state.x,
    centroidY: hasContact && weight > 0 ? centroidY / weight : state.y,
    contactWidthPx: hasContact ? maxProjection - minProjection : 0,
    spread: state.spread,
    splitDrive: state.splitDrive,
    inkRatio: capacityTotal > 0 ? clamp(inkTotal / capacityTotal, 0, 1) : 0,
    normalX: state.normalX,
    normalY: state.normalY,
    tangentX: state.tangentX,
    tangentY: state.tangentY,
  };
}

// ---------------------------------------------------------------------------
// Whole-stroke helpers
// ---------------------------------------------------------------------------

/**
 * Per-bristle sample track, byte-compatible with {@link RasterStrokeSample}:
 * feed `samples` straight to `renderCompiledBrushStroke(..., { samples })` and
 * the existing Hokusai/libmypaint dab engine paints that single hair.
 */
export interface BristleTrack {
  readonly bristleIndex: number;
  readonly samples: readonly RasterStrokeSample[];
  /** Mean contact radius of this hair, px (see `radiusLog2`). */
  readonly meanRadiusPx: number;
  /** Peak contact radius, px. */
  readonly maxRadiusPx: number;
  /**
   * `brush.setRadiusLog()` argument reproducing `meanRadiusPx`.
   * Honesty: a Hokusai stroke carries ONE radius, so the per-step radius
   * modulation in `radiusModulation` is what that lane cannot express —
   * it must be lowered into the brush's pressure→radius curve instead.
   */
  readonly radiusLog2: number;
  /** max/mean radius ratio; 1 means the fixed-radius lane is exact. */
  readonly radiusModulation: number;
}

export interface BristleStrokeRun {
  readonly footprints: readonly BristleFootprint[];
  readonly reports: readonly BristleStepReport[];
  readonly steps: number;
  /** Ink units laid down across the whole stroke. */
  readonly deposited: number;
}

export interface RunBristleStrokeOptions {
  /** Collect a footprint per step (default true). Off = simulation only. */
  readonly collectFootprints?: boolean;
  /** Collect a step report per step (default true). */
  readonly collectReports?: boolean;
}

/** Step a whole stroke. The brush state is advanced in place. */
export function runBristleStroke(
  state: BristleBrushState,
  samples: readonly BristleSample[],
  options: RunBristleStrokeOptions = {},
): BristleStrokeRun {
  if (samples.length === 0) {
    throw new BristleModelError("runBristleStroke needs at least one sample");
  }
  const collectFootprints = options.collectFootprints ?? true;
  const collectReports = options.collectReports ?? true;
  const footprints: BristleFootprint[] = [];
  const reports: BristleStepReport[] = [];
  let deposited = 0;
  for (const sample of samples) {
    const report = stepBristles(state, sample);
    deposited += report.deposited;
    if (collectReports) reports.push(report);
    if (collectFootprints) footprints.push(bristleFootprint(state));
  }
  return { footprints, reports, steps: samples.length, deposited };
}

/**
 * Split a stroke's footprints into one `RasterStrokeSample[]` per bristle —
 * the join to the existing dab pipeline. Alpha lowers to the sample's
 * `pressure` so the dab engine's own pressure dynamics carry the fade, and
 * hairs that never touched the surface are omitted entirely.
 */
export function bristleStrokeTracks(
  footprints: readonly BristleFootprint[],
  options: { readonly tiltX?: number; readonly tiltY?: number; readonly stepMs?: number } = {},
): BristleTrack[] {
  const stepMs = options.stepMs ?? 8;
  if (!Number.isFinite(stepMs) || stepMs <= 0) {
    throw new BristleModelError(`stepMs must be a positive number, got ${stepMs}`);
  }
  const tiltX = options.tiltX ?? 0;
  const tiltY = options.tiltY ?? 0;
  const byBristle = new Map<number, { samples: RasterStrokeSample[]; radii: number[] }>();

  footprints.forEach((footprint, step) => {
    for (const stamp of footprint.stamps) {
      let track = byBristle.get(stamp.bristleIndex);
      if (!track) {
        track = { samples: [], radii: [] };
        byBristle.set(stamp.bristleIndex, track);
      }
      track.samples.push({
        x: stamp.x,
        y: stamp.y,
        pressure: clamp(stamp.alpha, 0, 1),
        tiltX,
        tiltY,
        tMs: step * stepMs,
      });
      track.radii.push(stamp.radius);
    }
  });

  const tracks: BristleTrack[] = [];
  for (const bristleIndex of [...byBristle.keys()].sort((a, b) => a - b)) {
    const track = byBristle.get(bristleIndex);
    if (!track || track.radii.length === 0) continue;
    let sum = 0;
    let max = 0;
    for (const radius of track.radii) {
      sum += radius;
      if (radius > max) max = radius;
    }
    const mean = sum / track.radii.length;
    tracks.push({
      bristleIndex,
      samples: track.samples,
      meanRadiusPx: mean,
      maxRadiusPx: max,
      radiusLog2: Math.log2(Math.max(mean, 1e-6)),
      radiusModulation: mean > 0 ? max / mean : 1,
    });
  }
  return tracks;
}

/**
 * Lift `ModeledSampleIR` (the studio input pipeline's currency) into bristle
 * samples, mapping altitude/azimuth onto the same [-1, 1] tilt plane
 * brush-composition's `toRasterSamples` uses.
 */
export function bristleSamplesFromModeled(
  samples: readonly ModeledSampleIR[],
): BristleSample[] {
  return samples.map((sample, index) => {
    const altitudeRad = (sample.altitudeDeg * Math.PI) / 180;
    const azimuthRad = (sample.azimuthDeg * Math.PI) / 180;
    const magnitude = Math.cos(altitudeRad);
    const previous = index > 0 ? samples[index - 1] : undefined;
    return {
      x: sample.x,
      y: sample.y,
      pressure: sample.pressure,
      tiltX: magnitude * Math.cos(azimuthRad),
      tiltY: magnitude * Math.sin(azimuthRad),
      velocity: sample.velocity,
      ...(previous ? { dtMs: sample.tMs - previous.tMs } : {}),
      tMs: sample.tMs,
    };
  });
}

// ---------------------------------------------------------------------------
// Pure alpha rasterization (engine-free, for gates and previews)
// ---------------------------------------------------------------------------

export interface BristleRasterTarget {
  readonly width: number;
  readonly height: number;
  /** Scene-space coordinate that maps to pixel (0, 0). Default (0, 0). */
  readonly originX?: number;
  readonly originY?: number;
}

/**
 * Composite bristle stamps into a straight-alpha coverage buffer with
 * `dst = dst + cov·(1 − dst)`. Analytic 1px edge AA; sub-half-pixel discs are
 * attenuated by their radius so a thinning hair fades instead of popping.
 */
export function rasterizeBristleStamps(
  stamps: Iterable<BristleStamp>,
  target: BristleRasterTarget,
  into?: Float32Array,
): Float32Array {
  const { width, height } = target;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new BristleModelError("raster target width/height must be positive integers");
  }
  const originX = target.originX ?? 0;
  const originY = target.originY ?? 0;
  const buffer = into ?? new Float32Array(width * height);
  if (buffer.length !== width * height) {
    throw new BristleModelError(
      `raster buffer length ${buffer.length} does not match ${width}x${height}`,
    );
  }
  for (const stamp of stamps) {
    if (stamp.alpha <= 0 || stamp.radius <= 0) continue;
    const centerX = stamp.x - originX;
    const centerY = stamp.y - originY;
    const reach = stamp.radius + 1;
    const minX = Math.max(0, Math.floor(centerX - reach));
    const maxX = Math.min(width - 1, Math.ceil(centerX + reach));
    const minY = Math.max(0, Math.floor(centerY - reach));
    const maxY = Math.min(height - 1, Math.ceil(centerY + reach));
    const thin = stamp.radius < 0.5 ? stamp.radius / 0.5 : 1;
    for (let py = minY; py <= maxY; py += 1) {
      const dy = py + 0.5 - centerY;
      const row = py * width;
      for (let px = minX; px <= maxX; px += 1) {
        const dx = px + 0.5 - centerX;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const edge = clamp(stamp.radius + 0.5 - distance, 0, 1);
        if (edge <= 0) continue;
        const coverage = stamp.alpha * edge * thin;
        const target_ = row + px;
        buffer[target_] = buffer[target_] + coverage * (1 - buffer[target_]);
      }
    }
  }
  return buffer;
}

/** Composite every footprint of a stroke into one coverage buffer. */
export function rasterizeBristleStroke(
  footprints: readonly BristleFootprint[],
  target: BristleRasterTarget,
): Float32Array {
  const buffer = new Float32Array(target.width * target.height);
  for (const footprint of footprints) {
    rasterizeBristleStamps(footprint.stamps, target, buffer);
  }
  return buffer;
}
