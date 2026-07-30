/**
 * Studio professional brush dynamics core.
 *
 * This file deliberately has no DOM, Canvas, Konva or React dependency. It forms three reusable
 * layers for a future dynamic/particle brush renderer:
 *
 * 1. normalize PointerEvent-compatible samples,
 * 2. map pressure/speed/tilt/twist/direction to a deterministic dab recipe,
 * 3. resample a polyline by arc length into a bounded list of render-ready dabs,
 * 4. apply shared start/end taper and attach PNG-alpha tip stamp settings for consumers.
 *
 * Every public input/output type contains only JSON-compatible data. Random variation never uses
 * Math.random: a stroke seed and dab index fully determine jitter and scatter, so reopening,
 * collaboration replay and export all reproduce the same stroke.
 */

import {
  normalizeStudioBrushColorDynamicsSettings,
  normalizeStudioBrushGrainSettings,
  type NormalizedStudioBrushColorDynamicsSettings,
  type NormalizedStudioBrushGrainSettings,
  type StudioBrushColorDynamicsSettings,
  type StudioBrushGrainSettings,
} from "./studio-brush-material-dynamics";
import {
  normalizeStudioBrushDualBrushSettings,
  normalizeStudioBrushTipLayers,
  studioBrushDualBrushSettingsAreIdentity,
  type NormalizedStudioBrushDualBrushSettings,
  type NormalizedStudioBrushTipLayerSettings,
  type StudioBrushDualBrushSettings,
  type StudioBrushTipLayerSettings,
} from "./studio-brush-tip-composition";
import {
  normalizeStudioBrushTipSettings,
  type NormalizedStudioBrushTipSettings,
  type StudioBrushTipSettings,
} from "./studio-brush-tip-stamp";

export const STUDIO_BRUSH_DYNAMICS_SETTINGS_VERSION = 1 as const;
export const STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V2 =
  "causal-deposit-v2" as const;
/**
 * Prefix-stable causal deposits with bounded continuation segments.
 *
 * V2 intentionally freezes the first accepted 65,536-dab prefix. V3 preserves that exact prefix
 * and continues the same residual-spacing cursor in additional deterministic segments, allowing
 * live, retained, SVG and CRDT replay to keep the complete authored path without reallocating or
 * renumbering any already accepted dab.
 */
export const STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V3 =
  "causal-deposit-v3-segmented" as const;
export type StudioDynamicBrushDepositPipeline =
  | typeof STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V2
  | typeof STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V3;

export function isStudioDynamicBrushCausalDepositPipeline(
  value: unknown,
): value is StudioDynamicBrushDepositPipeline {
  return value === STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V2
    || value === STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V3;
}

export function studioDynamicBrushDepositPipelineUsesContinuation(
  value: unknown,
): value is typeof STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V3 {
  return value === STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V3;
}

export const STUDIO_BRUSH_DYNAMICS_PROPERTY_LIMITS = {
  width: { min: 0.05, max: 4096 },
  opacity: { min: 0, max: 1 },
  flow: { min: 0, max: 1 },
  spacing: { min: 0.25, max: 4096 },
  scatter: { min: 0, max: 4096 },
  angle: { min: -180, max: 180 },
  roundness: { min: 0.08, max: 1 },
} as const;

export const STUDIO_DYNAMIC_BRUSH_DAB_CAP_RANGE = { min: 1, max: 4096 } as const;
export const DEFAULT_STUDIO_DYNAMIC_BRUSH_MAX_DABS = 1024;
export const STUDIO_BRUSH_DYNAMICS_RATIO_LIMITS = {
  spacing: { min: 0.01, max: 16 },
  scatter: { min: 0, max: 16 },
} as const;

export type StudioDynamicBrushMinimumDiameterRatio = number;

export function isStudioDynamicBrushMinimumDiameterRatio(
  value: unknown
): value is StudioDynamicBrushMinimumDiameterRatio {
  return typeof value === "number"
    && Number.isFinite(value)
    && value >= 0
    && value <= 1;
}

/**
 * Applies the persisted dynamic-brush floor to geometry only.
 *
 * Callers intentionally resolve pressure mappings and taper before this boundary. Returning the
 * mapped value unchanged for an omitted/invalid ratio preserves old documents and lets the
 * planner's existing finite-value guard fail closed on malformed geometry.
 */
export function applyStudioDynamicBrushMinimumDiameterRatio(
  mappedDiameter: number,
  baseDiameter: number,
  minimumDiameterRatio: unknown
): number {
  return isStudioDynamicBrushMinimumDiameterRatio(minimumDiameterRatio)
    ? Math.max(mappedDiameter, baseDiameter * minimumDiameterRatio)
    : mappedDiameter;
}

/** Shared stroke-start / stroke-end taper (CSP / Procreate style tip thinning). */
export const STUDIO_BRUSH_TAPER_LIMITS = {
  length: { min: 0, max: 0.5 },
  minSizeRatio: { min: 0, max: 1 },
  minOpacityRatio: { min: 0, max: 1 },
  curve: { min: 0.05, max: 8 },
} as const;

const MAX_POINTER_SPEED = 64;
const MAX_MAPPING_COUNT = 24;
const MAX_ADDITIVE_MAPPING = 8192;
const MAX_UINT32 = 0xffff_ffff;
const MAX_COORDINATE_ABS = 1_000_000;
const POINT_EPSILON = 1e-6;
const TAU = Math.PI * 2;

export type StudioBrushDynamicsSource =
  | "pressure"
  | "tangential-pressure"
  | "speed"
  | "tilt"
  | "tilt-magnitude"
  | "tilt-azimuth"
  | "twist"
  | "direction";

export type StudioBrushDynamicsMappingMode = "multiply" | "add";

/**
 * One serializable input-to-property mapping.
 *
 * `from` and `to` describe either a multiplier or an additive physical value. `amount` blends the
 * mapping with the value accumulated so far; mappings are evaluated in their serialized order.
 */
export interface StudioBrushDynamicsMappingSettings {
  source: StudioBrushDynamicsSource;
  mode?: StudioBrushDynamicsMappingMode;
  from?: number;
  to?: number;
  amount?: number;
  curve?: number;
  invert?: boolean;
}

export interface StudioBrushDynamicsJitterSettings {
  mode?: StudioBrushDynamicsMappingMode;
  /** multiply: fractional variation 0..1, add: physical property units. */
  amount?: number;
}

export interface StudioBrushDynamicsPropertySettings {
  base?: number;
  min?: number;
  max?: number;
  mappings?: readonly StudioBrushDynamicsMappingSettings[];
  jitter?: StudioBrushDynamicsJitterSettings | null;
}

/** Shared start/end taper along stroke arc length (progress 0..1). */
export interface StudioBrushTaperSettings {
  enabled?: boolean;
  /** Fraction of stroke length for the start taper zone (0..0.5). */
  startLength?: number;
  /** Fraction of stroke length for the end taper zone (0..0.5). */
  endLength?: number;
  /** Size multiplier at a fully tapered tip. */
  minSizeRatio?: number;
  /** Opacity multiplier at a fully tapered tip. */
  minOpacityRatio?: number;
  /** Power curve for taper falloff (>1 = longer thin tip, <1 = faster recovery). */
  curve?: number;
}

export interface NormalizedStudioBrushTaperSettings {
  enabled: boolean;
  startLength: number;
  endLength: number;
  minSizeRatio: number;
  minOpacityRatio: number;
  curve: number;
}

/** JSON-persistable user settings. `size` is accepted as an alias for `width`. */
export interface StudioBrushDynamicsSettings {
  version?: number;
  /**
   * Versioned authored-stroke deposit order. Omitted snapshots retain the historical whole-stroke
   * progress/taper resampler and therefore preserve existing document pixels.
   */
  depositPipeline?: StudioDynamicBrushDepositPipeline;
  seed?: number;
  fallbackPressure?: number;
  /** CSS px/ms at which the normalized speed source reaches 1. */
  maxSpeed?: number;
  /**
   * Stroke-local minimum rendered diameter as a ratio of the selected base width.
   *
   * This is geometry-only: canonical pressure still reaches zero so opacity, flow, grain and
   * colour deposition retain the full stylus range. Omitted legacy snapshots keep their exact
   * historical replay; newly authored strokes persist the stricter artist/family/pack floor.
   */
  minimumDiameterRatio?: number;
  /** Dab spacing as a tip-width ratio. Set null to use spacing.base as legacy absolute px. */
  spacingRatio?: number | null;
  /** Scatter radius as a tip-width ratio. Set null to use scatter.base as absolute px. */
  scatterRatio?: number | null;
  /** Shared start/end taper applied after property mappings. */
  taper?: StudioBrushTaperSettings | null;
  /** PNG-alpha tip stamp shape (procedural or custom alpha map). */
  tip?: StudioBrushTipSettings | null;
  /** Deterministic foreground/background and HSV colour variation. */
  colorDynamics?: StudioBrushColorDynamicsSettings | null;
  /** Document-space texture pinned either to the canvas or to the stroke origin. */
  grain?: StudioBrushGrainSettings | null;
  /** Up to two extra transformed tips; the legacy `tip` remains the primary. */
  tipLayers?: readonly StudioBrushTipLayerSettings[] | null;
  /** Secondary tip texture that modulates the primary tip at composition time (dual brush). */
  dualBrush?: StudioBrushDualBrushSettings | null;
  width?: StudioBrushDynamicsPropertySettings;
  size?: StudioBrushDynamicsPropertySettings;
  opacity?: StudioBrushDynamicsPropertySettings;
  flow?: StudioBrushDynamicsPropertySettings;
  spacing?: StudioBrushDynamicsPropertySettings;
  scatter?: StudioBrushDynamicsPropertySettings;
  angle?: StudioBrushDynamicsPropertySettings;
  roundness?: StudioBrushDynamicsPropertySettings;
}

export type StudioBrushDynamicsPresetId = "ink-particle" | "airbrush" | "dry-media";

export type StudioBrushDynamicsBrushId = StudioBrushDynamicsPresetId
  | "soft-brush"
  | "spray"
  | "crayon"
  | "chalk"
  | "charcoal"
  | "pastel"
  | "oil-pastel";

/** Runtime/type guard shared by the editor, persistence and export paths. */
export function isStudioBrushDynamicsPresetId(value: unknown): value is StudioBrushDynamicsPresetId {
  return value === "ink-particle" || value === "airbrush" || value === "dry-media";
}

/**
 * Map commercial brush aliases (spray/crayon/chalk/…) onto a dynamics engine preset.
 * Keeps saved stroke `brush` ids stable while reusing airbrush/dry-media/ink pipelines.
 */
export function resolveStudioBrushDynamicsPresetId(
  brushId: unknown
): StudioBrushDynamicsPresetId | null {
  if (isStudioBrushDynamicsPresetId(brushId)) return brushId;
  if (typeof brushId !== "string") return null;
  if (brushId === "spray" || brushId === "soft-brush" || brushId === "splatter") return "airbrush";
  if (
    brushId === "crayon"
    || brushId === "chalk"
    || brushId === "charcoal"
    || brushId === "pastel"
    || brushId === "oil-pastel"
  ) return "dry-media";
  return null;
}

export interface StudioBrushDynamicsPreset {
  id: StudioBrushDynamicsPresetId;
  name: string;
  description: string;
  settings: StudioBrushDynamicsSettings;
}

export interface NormalizedStudioBrushDynamicsMapping {
  source: StudioBrushDynamicsSource;
  mode: StudioBrushDynamicsMappingMode;
  from: number;
  to: number;
  amount: number;
  curve: number;
  invert: boolean;
}

export interface NormalizedStudioBrushDynamicsJitter {
  mode: StudioBrushDynamicsMappingMode;
  amount: number;
}

export interface NormalizedStudioBrushDynamicsProperty {
  base: number;
  min: number;
  max: number;
  mappings: readonly NormalizedStudioBrushDynamicsMapping[];
  jitter: NormalizedStudioBrushDynamicsJitter | null;
}

export interface NormalizedStudioBrushDynamicsSettings {
  version: typeof STUDIO_BRUSH_DYNAMICS_SETTINGS_VERSION;
  /** Omitted for legacy snapshots so their canonical serialization remains byte-stable. */
  depositPipeline?: StudioDynamicBrushDepositPipeline;
  seed: number;
  fallbackPressure: number;
  maxSpeed: number;
  /** Omitted for legacy snapshots; renderers interpret absence as a zero geometry floor. */
  minimumDiameterRatio?: number;
  spacingRatio: number | null;
  scatterRatio: number | null;
  taper: NormalizedStudioBrushTaperSettings;
  tip: NormalizedStudioBrushTipSettings;
  colorDynamics: NormalizedStudioBrushColorDynamicsSettings;
  grain: NormalizedStudioBrushGrainSettings;
  tipLayers: readonly NormalizedStudioBrushTipLayerSettings[];
  /**
   * Omitted while it equals the no-op identity (disabled + untouched secondary tip), keeping the
   * canonical serialization of pre-dual-brush snapshots byte-stable. Consumers treat a missing
   * value as identity via `normalizeStudioBrushDualBrushSettings`/`composeStudioBrushDualTipAlphaMap`.
   */
  dualBrush?: NormalizedStudioBrushDualBrushSettings;
  width: NormalizedStudioBrushDynamicsProperty;
  opacity: NormalizedStudioBrushDynamicsProperty;
  flow: NormalizedStudioBrushDynamicsProperty;
  spacing: NormalizedStudioBrushDynamicsProperty;
  scatter: NormalizedStudioBrushDynamicsProperty;
  angle: NormalizedStudioBrushDynamicsProperty;
  roundness: NormalizedStudioBrushDynamicsProperty;
}

/** PointerEvent fields plus renderer-derived speed, direction and stable dab index. */
export interface StudioBrushDynamicsSample {
  pressure?: number;
  /** Pointer Events barrel pressure range (-1..1). */
  tangentialPressure?: number;
  /** CSS px/ms. */
  speed?: number;
  tiltX?: number;
  tiltY?: number;
  /** Pointer Events barrel rotation in degrees (0..359). */
  twist?: number;
  /** Stroke travel direction in degrees. */
  direction?: number;
  /** Stable per-stroke dab index used by the seeded random channels. */
  stampIndex?: number;
}

export interface NormalizedStudioBrushDynamicsSample {
  pressure: number;
  tangentialPressure: number;
  /** tangentialPressure remapped from -1..1 to 0..1 for property mappings. */
  tangentialPressureNormalized: number;
  speed: number;
  speedNormalized: number;
  tiltX: number;
  tiltY: number;
  tiltMagnitude: number;
  tiltAzimuth: number;
  twist: number;
  direction: number;
  hasTilt: boolean;
  hasDirection: boolean;
  stampIndex: number;
}

/** Fully resolved, finite recipe for one particle/dab. */
export interface StudioBrushDynamicsRecipe {
  /** `size` and `width` are identical aliases for particle and line renderers respectively. */
  size: number;
  width: number;
  opacity: number;
  flow: number;
  spacing: number;
  /** Maximum scatter radius before the deterministic offset is sampled. */
  scatter: number;
  scatterOffsetX: number;
  scatterOffsetY: number;
  scatterAngle: number;
  angle: number;
  roundness: number;
}

export interface StudioDynamicBrushPlanInput {
  /** Flat `[x0, y0, x1, y1, ...]` coordinates. Invalid pairs are ignored. */
  points: readonly number[];
  pressures?: readonly number[] | null;
  tangentialPressures?: readonly number[] | null;
  speeds?: readonly number[] | null;
  tiltXs?: readonly number[] | null;
  tiltYs?: readonly number[] | null;
  twists?: readonly number[] | null;
  /** Optional direction override in degrees; otherwise the path tangent is used. */
  directions?: readonly number[] | null;
  baseWidth: number;
  baseOpacity: number;
  settings?: StudioBrushDynamicsSettings | null;
  /** Overrides settings.seed for this stroke. */
  seed?: number;
  maxDabs?: number;
}

/**
 * Immutable geometry receipt for the station immediately preceding one dynamic dab.
 *
 * It is runtime-only metadata: DrawEl persistence still stores source points and dynamics, then
 * regenerates dabs. Connected carriers use the receipt so a suffix can reproduce the exact start
 * cross-section without reading a discarded live prefix or deriving it from the current tangent.
 */
export interface StudioDynamicBrushSegmentStartFrame {
  readonly index: number;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly direction: number;
  readonly size: number;
  readonly roundness: number;
}

export interface StudioDynamicBrushDab {
  index: number;
  progress: number;
  /** Exact unscattered arc-length station, useful for editing and endpoint checks. */
  sourceX: number;
  sourceY: number;
  /**
   * Travel tangent at this station, in degrees. New planners persist it on the ephemeral dab so a
   * connected carrier can reproduce a suffix without looking behind the accepted live prefix.
   */
  direction?: number;
  /** Arc-length travelled from the preceding dab; zero for the initial tap. */
  distanceFromPrevious?: number;
  /**
   * Exact previous-station frame for a non-initial segment. New canonical and causal planners
   * populate it; absence is retained only for legacy/manual dab fixtures and the initial tap.
   */
  segmentStartFrame?: StudioDynamicBrushSegmentStartFrame;
  x: number;
  y: number;
  size: number;
  opacity: number;
  flow: number;
  spacing: number;
  scatter: number;
  angle: number;
  roundness: number;
}

export interface StudioDynamicBrushPlan {
  dabs: StudioDynamicBrushDab[];
  sourcePointCount: number;
  totalLength: number;
  capped: boolean;
  settings: NormalizedStudioBrushDynamicsSettings;
}

type DynamicsPropertyName = keyof typeof STUDIO_BRUSH_DYNAMICS_PROPERTY_LIMITS;

const PROPERTY_NAMES: readonly DynamicsPropertyName[] = [
  "width",
  "opacity",
  "flow",
  "spacing",
  "scatter",
  "angle",
  "roundness",
];

const PROPERTY_SALTS: Record<DynamicsPropertyName, number> = {
  width: 0x91e1_0da5,
  opacity: 0x6a09_e667,
  flow: 0xbb67_ae85,
  spacing: 0x3c6e_f372,
  scatter: 0xa54f_f53a,
  angle: 0x510e_527f,
  roundness: 0x9b05_688c,
};

const INTERNAL_DEFAULT_TAPER: NormalizedStudioBrushTaperSettings = {
  enabled: false,
  startLength: 0.12,
  endLength: 0.18,
  minSizeRatio: 0.2,
  minOpacityRatio: 0.55,
  curve: 1,
};

const INTERNAL_DEFAULT_SETTINGS: NormalizedStudioBrushDynamicsSettings = {
  version: STUDIO_BRUSH_DYNAMICS_SETTINGS_VERSION,
  seed: 1,
  fallbackPressure: 0.5,
  maxSpeed: 1.6,
  spacingRatio: 0.34,
  scatterRatio: null,
  taper: { ...INTERNAL_DEFAULT_TAPER },
  tip: normalizeStudioBrushTipSettings(),
  colorDynamics: normalizeStudioBrushColorDynamicsSettings(),
  grain: normalizeStudioBrushGrainSettings(),
  tipLayers: [],
  width: {
    base: 6,
    min: STUDIO_BRUSH_DYNAMICS_PROPERTY_LIMITS.width.min,
    max: STUDIO_BRUSH_DYNAMICS_PROPERTY_LIMITS.width.max,
    // Existing G-pen behavior: p=0 -> 0.3x, p=.5 -> 1x, p=1 -> 1.7x.
    mappings: [
      { source: "pressure", mode: "multiply", from: 0.3, to: 1.7, amount: 1, curve: 1, invert: false },
    ],
    jitter: null,
  },
  opacity: { base: 1, min: 0, max: 1, mappings: [], jitter: null },
  flow: { base: 1, min: 0, max: 1, mappings: [], jitter: null },
  spacing: { base: 2.04, min: 0.25, max: 4096, mappings: [], jitter: null },
  scatter: { base: 0, min: 0, max: 4096, mappings: [], jitter: null },
  angle: {
    base: 0,
    min: -180,
    max: 180,
    // Particle tips follow the stroke tangent unless the caller explicitly supplies mappings: [].
    mappings: [
      { source: "direction", mode: "add", from: 0, to: 360, amount: 1, curve: 1, invert: false },
    ],
    jitter: null,
  },
  roundness: { base: 1, min: 0.08, max: 1, mappings: [], jitter: null },
};

/**
 * A detached, directly JSON-serializable input value. Normalization uses a private copy so external
 * mutation cannot affect renderer defaults.
 */
export const DEFAULT_STUDIO_BRUSH_DYNAMICS_SETTINGS:
  NormalizedStudioBrushDynamicsSettings & StudioBrushDynamicsSettings = cloneNormalizedSettings(INTERNAL_DEFAULT_SETTINGS);

/** Commercial-style starting points; consumers should request a detached copy with the helper below. */
export const STUDIO_BRUSH_DYNAMICS_PRESETS: readonly StudioBrushDynamicsPreset[] = [
  {
    id: "ink-particle",
    name: "잉크 입자",
    description: "필압과 속도에 반응하는 미세 잉크 입자와 방향성 펜촉",
    settings: {
      depositPipeline: STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V3,
      seed: 101,
      taper: {
        enabled: true,
        startLength: 0.1,
        endLength: 0.16,
        minSizeRatio: 0.18,
        minOpacityRatio: 0.5,
        curve: 1.05,
      },
      tip: { shape: "hard", softness: 0.22 },
      width: {
        base: 8,
        mappings: [{ source: "pressure", from: 0.22, to: 1.55 }],
        jitter: { mode: "multiply", amount: 0.08 },
      },
      opacity: { base: 0.95, mappings: [{ source: "pressure", from: 0.55, to: 1 }] },
      flow: { base: 0.85, mappings: [{ source: "pressure", from: 0.7, to: 1 }] },
      spacingRatio: 0.2,
      spacing: { mappings: [{ source: "speed", from: 0.8, to: 1.35 }] },
      scatterRatio: 0.08,
      scatter: {
        mappings: [{ source: "speed", from: 0.5, to: 1.4 }],
        jitter: { mode: "add", amount: 0.2 },
      },
      angle: {
        base: 0,
        mappings: [
          { source: "direction", mode: "add", from: 0, to: 360 },
          { source: "twist", mode: "add", from: 0, to: 360, amount: 0.25 },
        ],
        jitter: { mode: "add", amount: 6 },
      },
      roundness: { base: 0.42, mappings: [{ source: "tilt-magnitude", from: 1, to: 0.45 }] },
    },
  },
  {
    id: "airbrush",
    name: "소프트 에어브러시",
    description: "짧은 입력도 보이면서 여러 번 부드럽게 쌓이는 제어된 분사",
    settings: {
      depositPipeline: STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V3,
      seed: 202,
      taper: {
        enabled: true,
        startLength: 0.06,
        endLength: 0.1,
        minSizeRatio: 0.45,
        minOpacityRatio: 0.35,
        curve: 0.9,
      },
      // Keep a broad analytic shoulder instead of raising only the centre valve. A narrower
      // carrier made a moving stroke read as pale circular puffs even though its centre alpha was
      // technically visible. The centre remains normalized to one; opacity/flow still own density.
      tip: { shape: "soft", softness: 0.42 },
      width: {
        base: 32,
        mappings: [{ source: "pressure", from: 0.7, to: 1.25 }],
        jitter: { mode: "multiply", amount: 0.1 },
      },
      // Mouse fallback pressure is 0.5. Even with a normalized centre, the soft radial shoulder has
      // far lower mean alpha than a solid tip, so opacity/flow must keep a single pass legible.
      // Keep physical cadence independent of pointer speed: the same geometry must receive the
      // same continuous material density without opening gaps on fast pointer samples.
      opacity: { base: 0.65, mappings: [{ source: "pressure", from: 0.4, to: 1 }] },
      flow: { base: 0.5, mappings: [{ source: "pressure", from: 0.45, to: 1 }] },
      spacingRatio: 0.145,
      spacing: { mappings: [] },
      // Soft spray is one continuous envelope. Wide independent centre scatter belongs to the
      // dedicated spray/splatter variants; here it exposed the round dab lattice while moving.
      scatterRatio: 0.04,
      scatter: {
        mappings: [{ source: "pressure", from: 1, to: 0.7 }],
        jitter: null,
      },
      angle: { base: 0, mappings: [] },
      roundness: { base: 1, mappings: [] },
    },
  },
  {
    id: "dry-media",
    name: "드라이 미디어",
    description: "크레용·목탄처럼 압력과 속도에 따라 끊기고 거칠어지는 마른 획",
    settings: {
      depositPipeline: STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V3,
      seed: 303,
      taper: {
        enabled: true,
        startLength: 0.08,
        endLength: 0.14,
        minSizeRatio: 0.28,
        minOpacityRatio: 0.4,
        curve: 1.15,
      },
      tip: { shape: "grain", softness: 0.4 },
      width: {
        base: 6,
        mappings: [{ source: "pressure", from: 0.15, to: 1.45 }],
        jitter: { mode: "multiply", amount: 0.14 },
      },
      opacity: {
        base: 0.85,
        mappings: [{ source: "pressure", from: 0.35, to: 1 }],
        jitter: { mode: "multiply", amount: 0.16 },
      },
      flow: { base: 0.55, mappings: [{ source: "pressure", from: 0.5, to: 1 }] },
      // Stroke-fixed tooth follows the mark when it is transformed instead of appearing to slide
      // through the pigment. The modest amount preserves the existing opaque dry-media baseline.
      grain: {
        space: "stroke-fixed",
        amount: 0.18,
        scale: 5.5,
        contrast: 0.55,
        seed: 303,
      },
      spacingRatio: 0.16,
      // Keep a restrained velocity tooth, but cap it below one quarter of the nominal tip width.
      // Roughness comes primarily from grain/scatter rather than discontinuous high-speed gaps.
      spacing: {
        mappings: [{ source: "speed", from: 0.95, to: 1.12 }],
        jitter: null,
      },
      // Paper tooth and the textured tip create the broken edge. Large white-noise displacement
      // moved complete oval carriers apart and revealed them as beads during long strokes.
      scatterRatio: 0.08,
      scatter: {
        mappings: [{ source: "speed", from: 0.8, to: 1.15 }],
        jitter: null,
      },
      angle: {
        base: 0,
        mappings: [{ source: "direction", mode: "add", from: 0, to: 360 }],
        jitter: { mode: "add", amount: 8 },
      },
      roundness: {
        base: 0.32,
        mappings: [{ source: "tilt-magnitude", from: 1, to: 0.35 }],
        jitter: { mode: "multiply", amount: 0.1 },
      },
    },
  },
];

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeSignedDegrees(value: number): number {
  const wrapped = ((value + 180) % 360 + 360) % 360;
  return wrapped - 180;
}

function normalizeUnsignedDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function normalizedAngle(value: number): number {
  return ((value % 360) + 360) % 360 / 360;
}

function uint32(value: unknown, fallback: number): number {
  return Math.trunc(clamp(finiteNumber(value, fallback), 0, MAX_UINT32));
}

function cloneMapping(mapping: NormalizedStudioBrushDynamicsMapping): NormalizedStudioBrushDynamicsMapping {
  return { ...mapping };
}

function cloneProperty(property: NormalizedStudioBrushDynamicsProperty): NormalizedStudioBrushDynamicsProperty {
  return {
    ...property,
    mappings: property.mappings.map(cloneMapping),
    jitter: property.jitter ? { ...property.jitter } : null,
  };
}

function cloneTaper(taper: NormalizedStudioBrushTaperSettings): NormalizedStudioBrushTaperSettings {
  return { ...taper };
}

function cloneTip(tip: NormalizedStudioBrushTipSettings): NormalizedStudioBrushTipSettings {
  return { ...tip };
}

function cloneTipLayers(
  layers: readonly NormalizedStudioBrushTipLayerSettings[]
): readonly NormalizedStudioBrushTipLayerSettings[] {
  return layers.map((layer) => ({ ...layer, tip: cloneTip(layer.tip) }));
}

function cloneDualBrush(
  dualBrush: NormalizedStudioBrushDualBrushSettings
): NormalizedStudioBrushDualBrushSettings {
  return { ...dualBrush, tip: cloneTip(dualBrush.tip) };
}

function cloneNormalizedSettings(
  settings: NormalizedStudioBrushDynamicsSettings
): NormalizedStudioBrushDynamicsSettings {
  return {
    version: STUDIO_BRUSH_DYNAMICS_SETTINGS_VERSION,
    ...(settings.depositPipeline
      ? { depositPipeline: settings.depositPipeline }
      : {}),
    seed: settings.seed,
    fallbackPressure: settings.fallbackPressure,
    maxSpeed: settings.maxSpeed,
    ...(settings.minimumDiameterRatio !== undefined
      ? { minimumDiameterRatio: settings.minimumDiameterRatio }
      : {}),
    spacingRatio: settings.spacingRatio,
    scatterRatio: settings.scatterRatio,
    taper: cloneTaper(settings.taper),
    tip: cloneTip(settings.tip),
    colorDynamics: { ...settings.colorDynamics },
    grain: { ...settings.grain },
    tipLayers: cloneTipLayers(settings.tipLayers),
    ...(settings.dualBrush ? { dualBrush: cloneDualBrush(settings.dualBrush) } : {}),
    width: cloneProperty(settings.width),
    opacity: cloneProperty(settings.opacity),
    flow: cloneProperty(settings.flow),
    spacing: cloneProperty(settings.spacing),
    scatter: cloneProperty(settings.scatter),
    angle: cloneProperty(settings.angle),
    roundness: cloneProperty(settings.roundness),
  };
}

function normalizeTaper(value: unknown): NormalizedStudioBrushTaperSettings {
  if (value === null) return cloneTaper(INTERNAL_DEFAULT_TAPER);
  const source = asRecord(value);
  if (!source) return cloneTaper(INTERNAL_DEFAULT_TAPER);
  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : INTERNAL_DEFAULT_TAPER.enabled,
    startLength: clamp(
      finiteNumber(source.startLength, INTERNAL_DEFAULT_TAPER.startLength),
      STUDIO_BRUSH_TAPER_LIMITS.length.min,
      STUDIO_BRUSH_TAPER_LIMITS.length.max
    ),
    endLength: clamp(
      finiteNumber(source.endLength, INTERNAL_DEFAULT_TAPER.endLength),
      STUDIO_BRUSH_TAPER_LIMITS.length.min,
      STUDIO_BRUSH_TAPER_LIMITS.length.max
    ),
    minSizeRatio: clamp(
      finiteNumber(source.minSizeRatio, INTERNAL_DEFAULT_TAPER.minSizeRatio),
      STUDIO_BRUSH_TAPER_LIMITS.minSizeRatio.min,
      STUDIO_BRUSH_TAPER_LIMITS.minSizeRatio.max
    ),
    minOpacityRatio: clamp(
      finiteNumber(source.minOpacityRatio, INTERNAL_DEFAULT_TAPER.minOpacityRatio),
      STUDIO_BRUSH_TAPER_LIMITS.minOpacityRatio.min,
      STUDIO_BRUSH_TAPER_LIMITS.minOpacityRatio.max
    ),
    curve: clamp(
      finiteNumber(source.curve, INTERNAL_DEFAULT_TAPER.curve),
      STUDIO_BRUSH_TAPER_LIMITS.curve.min,
      STUDIO_BRUSH_TAPER_LIMITS.curve.max
    ),
  };
}

/**
 * Multiplier for size/opacity at a given arc-length progress (0=start, 1=end).
 * Disabled taper returns 1 for both channels.
 */
export function studioBrushTaperFactors(
  progress: number,
  taper: NormalizedStudioBrushTaperSettings
): { size: number; opacity: number } {
  if (!taper.enabled) return { size: 1, opacity: 1 };
  const tProgress = clamp01(progress);
  let size = 1;
  let opacity = 1;

  const applyZone = (distanceFromTip: number, zoneLength: number) => {
    if (zoneLength <= 0) return;
    if (distanceFromTip >= zoneLength) return;
    const linear = clamp01(distanceFromTip / zoneLength);
    const eased = Math.pow(linear, taper.curve);
    size *= taper.minSizeRatio + (1 - taper.minSizeRatio) * eased;
    opacity *= taper.minOpacityRatio + (1 - taper.minOpacityRatio) * eased;
  };

  applyZone(tProgress, taper.startLength);
  applyZone(1 - tProgress, taper.endLength);
  return {
    size: clamp(size, 0, 8),
    opacity: clamp01(opacity),
  };
}

function normalizeRatio(
  source: Record<string, unknown>,
  ratioKey: "spacingRatio" | "scatterRatio",
  propertyKey: "spacing" | "scatter",
  fallback: number | null,
  min: number,
  max: number
): number | null {
  if (source[ratioKey] === null) return null;
  if (source[ratioKey] !== undefined) {
    return clamp(finiteNumber(source[ratioKey], fallback ?? min), min, max);
  }
  const property = asRecord(source[propertyKey]);
  // Existing absolute-px settings remain meaningful: an explicit base opts out of ratio mode.
  if (property && typeof property.base === "number" && Number.isFinite(property.base)) return null;
  return fallback;
}

function isDynamicsSource(value: unknown): value is StudioBrushDynamicsSource {
  return value === "pressure"
    || value === "tangential-pressure"
    || value === "speed"
    || value === "tilt"
    || value === "tilt-magnitude"
    || value === "tilt-azimuth"
    || value === "twist"
    || value === "direction";
}

function normalizeMapping(value: unknown): NormalizedStudioBrushDynamicsMapping | null {
  const source = asRecord(value);
  if (!source || !isDynamicsSource(source.source)) return null;

  const mode: StudioBrushDynamicsMappingMode = source.mode === "add" ? "add" : "multiply";
  const mappingLimit = mode === "multiply" ? 8 : MAX_ADDITIVE_MAPPING;
  const mappingMin = mode === "multiply" ? 0 : -mappingLimit;
  return {
    source: source.source,
    mode,
    from: clamp(finiteNumber(source.from, 0), mappingMin, mappingLimit),
    to: clamp(finiteNumber(source.to, 1), mappingMin, mappingLimit),
    amount: clamp01(finiteNumber(source.amount, 1)),
    curve: clamp(finiteNumber(source.curve, 1), 0.05, 8),
    invert: typeof source.invert === "boolean" ? source.invert : false,
  };
}

function normalizeJitter(value: unknown): NormalizedStudioBrushDynamicsJitter | null {
  const source = asRecord(value);
  if (!source) return null;
  const mode: StudioBrushDynamicsMappingMode = source.mode === "add" ? "add" : "multiply";
  const maximum = mode === "multiply" ? 1 : MAX_ADDITIVE_MAPPING;
  const amount = clamp(finiteNumber(source.amount, 0), 0, maximum);
  return amount > 0 ? { mode, amount } : null;
}

function normalizeProperty(
  value: unknown,
  fallback: NormalizedStudioBrushDynamicsProperty,
  propertyName: DynamicsPropertyName
): NormalizedStudioBrushDynamicsProperty {
  const source = asRecord(value);
  if (!source) return cloneProperty(fallback);

  const hardLimits = STUDIO_BRUSH_DYNAMICS_PROPERTY_LIMITS[propertyName];
  const firstBound = clamp(finiteNumber(source.min, fallback.min), hardLimits.min, hardLimits.max);
  const secondBound = clamp(finiteNumber(source.max, fallback.max), hardLimits.min, hardLimits.max);
  const min = Math.min(firstBound, secondBound);
  const max = Math.max(firstBound, secondBound);
  const base = clamp(finiteNumber(source.base, fallback.base), min, max);

  let mappings: readonly NormalizedStudioBrushDynamicsMapping[];
  if (source.mappings === undefined) {
    mappings = fallback.mappings.map(cloneMapping);
  } else if (Array.isArray(source.mappings)) {
    mappings = source.mappings
      .slice(0, MAX_MAPPING_COUNT)
      .map(normalizeMapping)
      .filter((mapping): mapping is NormalizedStudioBrushDynamicsMapping => mapping !== null);
  } else {
    mappings = fallback.mappings.map(cloneMapping);
  }

  const jitter = source.jitter === undefined
    ? (fallback.jitter ? { ...fallback.jitter } : null)
    : normalizeJitter(source.jitter);
  return { base, min, max, mappings, jitter };
}

/** Sanitizes partial/corrupt persisted settings into finite renderer-safe ranges. */
export function normalizeStudioBrushDynamicsSettings(value?: unknown): NormalizedStudioBrushDynamicsSettings {
  const source = asRecord(value) ?? {};
  const widthValue = source.width === undefined ? source.size : source.width;
  const width = normalizeProperty(widthValue, INTERNAL_DEFAULT_SETTINGS.width, "width");
  const spacingRatio = normalizeRatio(
    source,
    "spacingRatio",
    "spacing",
    INTERNAL_DEFAULT_SETTINGS.spacingRatio,
    STUDIO_BRUSH_DYNAMICS_RATIO_LIMITS.spacing.min,
    STUDIO_BRUSH_DYNAMICS_RATIO_LIMITS.spacing.max
  );
  const scatterRatio = normalizeRatio(
    source,
    "scatterRatio",
    "scatter",
    INTERNAL_DEFAULT_SETTINGS.scatterRatio,
    STUDIO_BRUSH_DYNAMICS_RATIO_LIMITS.scatter.min,
    STUDIO_BRUSH_DYNAMICS_RATIO_LIMITS.scatter.max
  );
  const spacing = normalizeProperty(source.spacing, INTERNAL_DEFAULT_SETTINGS.spacing, "spacing");
  const scatter = normalizeProperty(source.scatter, INTERNAL_DEFAULT_SETTINGS.scatter, "scatter");
  const tip = normalizeStudioBrushTipSettings(source.tip);
  const dualBrush = normalizeStudioBrushDualBrushSettings(source.dualBrush, tip);
  return {
    version: STUDIO_BRUSH_DYNAMICS_SETTINGS_VERSION,
    ...(isStudioDynamicBrushCausalDepositPipeline(source.depositPipeline)
      ? { depositPipeline: source.depositPipeline }
      : {}),
    seed: uint32(source.seed, INTERNAL_DEFAULT_SETTINGS.seed),
    fallbackPressure: clamp01(finiteNumber(source.fallbackPressure, INTERNAL_DEFAULT_SETTINGS.fallbackPressure)),
    maxSpeed: clamp(finiteNumber(source.maxSpeed, INTERNAL_DEFAULT_SETTINGS.maxSpeed), 0.01, MAX_POINTER_SPEED),
    ...(typeof source.minimumDiameterRatio === "number"
      && Number.isFinite(source.minimumDiameterRatio)
      ? { minimumDiameterRatio: clamp01(source.minimumDiameterRatio) }
      : {}),
    spacingRatio,
    scatterRatio,
    taper: normalizeTaper(source.taper),
    tip,
    colorDynamics: normalizeStudioBrushColorDynamicsSettings(source.colorDynamics),
    grain: normalizeStudioBrushGrainSettings(source.grain),
    tipLayers: normalizeStudioBrushTipLayers(source.tipLayers, tip),
    ...(studioBrushDualBrushSettingsAreIdentity(dualBrush) ? {} : { dualBrush }),
    width,
    opacity: normalizeProperty(source.opacity, INTERNAL_DEFAULT_SETTINGS.opacity, "opacity"),
    flow: normalizeProperty(source.flow, INTERNAL_DEFAULT_SETTINGS.flow, "flow"),
    spacing: spacingRatio === null
      ? spacing
      : { ...spacing, base: clamp(width.base * spacingRatio, spacing.min, spacing.max) },
    scatter: scatterRatio === null
      ? scatter
      : { ...scatter, base: clamp(width.base * scatterRatio, scatter.min, scatter.max) },
    angle: normalizeProperty(source.angle, INTERNAL_DEFAULT_SETTINGS.angle, "angle"),
    roundness: normalizeProperty(source.roundness, INTERNAL_DEFAULT_SETTINGS.roundness, "roundness"),
  };
}

/** Stable canonical JSON for persistence dirty-checks, collaboration patches and memo keys. */
export function serializeStudioBrushDynamicsSettingsCanonical(value?: unknown): string {
  return JSON.stringify(normalizeStudioBrushDynamicsSettings(value));
}

export function studioBrushDynamicsSettingsEqual(left?: unknown, right?: unknown): boolean {
  return serializeStudioBrushDynamicsSettingsCanonical(left) === serializeStudioBrushDynamicsSettingsCanonical(right);
}

/** Returns a detached, normalized preset suitable for immediate UI editing or persistence. */
export function studioBrushDynamicsPresetSettings(
  id: StudioBrushDynamicsPresetId
): NormalizedStudioBrushDynamicsSettings {
  const preset = STUDIO_BRUSH_DYNAMICS_PRESETS.find((candidate) => candidate.id === id)
    ?? STUDIO_BRUSH_DYNAMICS_PRESETS[0]!;
  return normalizeStudioBrushDynamicsSettings(preset.settings);
}

interface StudioBrushDynamicsVariant {
  presetId: StudioBrushDynamicsPresetId;
  overrides: StudioBrushDynamicsSettings;
}

/**
 * Physical variants for toolbar brush ids that share a persisted canonical dynamics preset.
 *
 * Saved strokes keep their existing `brush` id and canonical preset ids remain unchanged. Runtime
 * consumers can opt into this helper to make each commercial alias visibly distinct without a
 * document migration. Every call normalizes into a detached value, so UI edits cannot mutate the
 * variant catalogue or the canonical preset.
 */
const STUDIO_BRUSH_DYNAMICS_VARIANTS: Readonly<Record<string, StudioBrushDynamicsVariant>> = {
  "soft-brush": {
    presetId: "airbrush",
    overrides: {
      seed: 211,
      maxSpeed: 1.4,
      tip: { shape: "round", softness: 0.78 },
      width: {
        base: 36,
        mappings: [{ source: "pressure", from: 0.82, to: 1.18 }],
        jitter: { mode: "multiply", amount: 0.015 },
      },
      opacity: { base: 0.52, mappings: [{ source: "pressure", from: 0.55, to: 1 }] },
      flow: {
        base: 0.4,
        mappings: [{ source: "pressure", from: 0.5, to: 0.9 }],
        jitter: null,
      },
      spacingRatio: 0.09,
      spacing: {
        mappings: [],
        jitter: null,
      },
      scatterRatio: 0.035,
      scatter: {
        mappings: [{ source: "pressure", from: 1, to: 0.65 }],
        jitter: null,
      },
      angle: { base: 0, mappings: [], jitter: null },
      roundness: {
        base: 0.93,
        mappings: [{ source: "tilt-magnitude", from: 0.98, to: 0.85 }],
        jitter: null,
      },
    },
  },
  spray: {
    presetId: "airbrush",
    overrides: {
      seed: 223,
      taper: { enabled: false },
      tip: { shape: "flake", softness: 0.12 },
      width: {
        base: 16,
        mappings: [{ source: "pressure", from: 0.85, to: 1.12 }],
        jitter: { mode: "multiply", amount: 0.45 },
      },
      opacity: {
        base: 0.46,
        mappings: [{ source: "pressure", from: 0.55, to: 1 }],
        jitter: { mode: "multiply", amount: 0.22 },
      },
      flow: {
        base: 0.3,
        mappings: [{ source: "pressure", from: 0.7, to: 1 }],
        jitter: { mode: "multiply", amount: 0.18 },
      },
      spacingRatio: 0.34,
      spacing: {
        mappings: [{ source: "speed", from: 0.75, to: 1.7 }],
        jitter: { mode: "multiply", amount: 0.18 },
      },
      // The catalogue exposes this tool as a 40 px spray footprint. A ratio above 1 scattered the
      // only dab of a tap well outside both the cursor and the user's hand on roughly one third of
      // seeds, so a quick click could look as if it had not painted at all. Keep the flake/noise tip
      // character, but constrain its centre to the visible footprint; `splatter` remains the wide
      // throw alternative.
      scatterRatio: 0.2,
      scatter: {
        mappings: [{ source: "pressure", from: 1.6, to: 0.75 }],
        jitter: { mode: "multiply", amount: 0.35 },
      },
      angle: { base: 0, mappings: [], jitter: { mode: "add", amount: 180 } },
      roundness: {
        base: 0.74,
        mappings: [],
        jitter: { mode: "multiply", amount: 0.22 },
      },
    },
  },
  splatter: {
    presetId: "airbrush",
    overrides: {
      seed: 227,
      taper: { enabled: false },
      tip: { shape: "flake", softness: 0.08 },
      width: {
        base: 45,
        mappings: [{ source: "pressure", from: 0.72, to: 1.28 }],
        jitter: { mode: "multiply", amount: 0.58 },
      },
      opacity: {
        base: 0.48,
        mappings: [{ source: "pressure", from: 0.5, to: 1 }],
        jitter: { mode: "multiply", amount: 0.3 },
      },
      flow: {
        base: 0.32,
        mappings: [{ source: "pressure", from: 0.62, to: 1 }],
        jitter: { mode: "multiply", amount: 0.22 },
      },
      spacingRatio: 0.5,
      spacing: {
        mappings: [{ source: "speed", from: 0.8, to: 1.45 }],
        jitter: { mode: "multiply", amount: 0.24 },
      },
      // Unlike the cursor-anchored spray, splatter deliberately throws flake centres beyond the
      // nib footprint. The explicit variant keeps causal retained/SVG replay from collapsing to
      // the canonical soft airbrush now that those paths consume the dynamics snapshot directly.
      scatterRatio: 1.15,
      scatter: {
        mappings: [{ source: "pressure", from: 1.45, to: 0.72 }],
        jitter: { mode: "multiply", amount: 0.42 },
      },
      angle: { base: 0, mappings: [], jitter: { mode: "add", amount: 180 } },
      roundness: {
        base: 0.68,
        mappings: [],
        jitter: { mode: "multiply", amount: 0.28 },
      },
    },
  },
  crayon: {
    presetId: "dry-media",
    overrides: {
      seed: 307,
      tip: { shape: "hard", softness: 0.38 },
      width: {
        base: 10,
        mappings: [{ source: "pressure", from: 0.35, to: 1.25 }],
        jitter: { mode: "multiply", amount: 0.1 },
      },
      opacity: {
        base: 0.9,
        mappings: [{ source: "pressure", from: 0.7, to: 1 }],
        jitter: { mode: "multiply", amount: 0.1 },
      },
      flow: {
        base: 0.72,
        mappings: [{ source: "pressure", from: 0.75, to: 1 }],
        jitter: { mode: "multiply", amount: 0.06 },
      },
      spacingRatio: 0.11,
      spacing: {
        mappings: [{ source: "speed", from: 0.9, to: 1.3 }],
        jitter: { mode: "multiply", amount: 0.05 },
      },
      scatterRatio: 0.05,
      scatter: {
        mappings: [{ source: "speed", from: 0.7, to: 1.2 }],
        jitter: { mode: "multiply", amount: 0.04 },
      },
      angle: {
        base: 0,
        mappings: [{ source: "direction", mode: "add", from: 0, to: 360 }],
        jitter: { mode: "add", amount: 5 },
      },
      roundness: {
        base: 0.66,
        mappings: [{ source: "tilt-magnitude", from: 1, to: 0.62 }],
        jitter: { mode: "multiply", amount: 0.06 },
      },
    },
  },
  chalk: {
    presetId: "dry-media",
    overrides: {
      seed: 311,
      tip: { shape: "sponge", softness: 0.48 },
      width: {
        base: 14,
        mappings: [{ source: "pressure", from: 0.55, to: 1.18 }],
        jitter: { mode: "multiply", amount: 0.16 },
      },
      opacity: {
        base: 0.78,
        mappings: [{ source: "pressure", from: 0.45, to: 1 }],
        jitter: { mode: "multiply", amount: 0.2 },
      },
      flow: {
        base: 0.44,
        mappings: [{ source: "pressure", from: 0.6, to: 1 }],
        jitter: { mode: "multiply", amount: 0.14 },
      },
      spacingRatio: 0.18,
      spacing: {
        mappings: [{ source: "speed", from: 0.95, to: 1.12 }],
        jitter: { mode: "multiply", amount: 0.08 },
      },
      scatterRatio: 0.1,
      scatter: {
        mappings: [{ source: "speed", from: 0.8, to: 1.15 }],
        jitter: { mode: "multiply", amount: 0.12 },
      },
      angle: {
        base: 0,
        mappings: [{ source: "direction", mode: "add", from: 0, to: 360 }],
        jitter: { mode: "add", amount: 10 },
      },
      roundness: {
        base: 0.5,
        mappings: [{ source: "tilt-magnitude", from: 1, to: 0.42 }],
        jitter: { mode: "multiply", amount: 0.1 },
      },
    },
  },
  charcoal: {
    presetId: "dry-media",
    overrides: {
      seed: 317,
      tip: { shape: "bristle", softness: 0.58 },
      width: {
        base: 18,
        mappings: [{ source: "pressure", from: 0.28, to: 1.38 }],
        jitter: { mode: "multiply", amount: 0.15 },
      },
      opacity: {
        base: 0.82,
        mappings: [{ source: "pressure", from: 0.32, to: 1 }],
        jitter: { mode: "multiply", amount: 0.19 },
      },
      flow: {
        base: 0.62,
        mappings: [{ source: "pressure", from: 0.4, to: 1 }],
        jitter: { mode: "multiply", amount: 0.13 },
      },
      spacingRatio: 0.14,
      spacing: {
        mappings: [{ source: "speed", from: 0.95, to: 1.12 }],
        jitter: { mode: "multiply", amount: 0.08 },
      },
      scatterRatio: 0.075,
      scatter: {
        mappings: [{ source: "speed", from: 0.8, to: 1.15 }],
        jitter: { mode: "multiply", amount: 0.12 },
      },
      angle: {
        base: 0,
        mappings: [
          { source: "direction", mode: "add", from: 0, to: 360 },
          { source: "tilt-azimuth", mode: "add", from: 0, to: 360, amount: 0.15 },
        ],
        jitter: { mode: "add", amount: 9 },
      },
      roundness: {
        base: 0.24,
        mappings: [{ source: "tilt-magnitude", from: 1, to: 0.24 }],
        jitter: { mode: "multiply", amount: 0.09 },
      },
    },
  },
  pastel: {
    presetId: "dry-media",
    overrides: {
      seed: 331,
      taper: {
        enabled: true,
        startLength: 0.06,
        endLength: 0.1,
        minSizeRatio: 0.52,
        minOpacityRatio: 0.46,
        curve: 0.9,
      },
      tip: { shape: "sponge", softness: 0.62 },
      width: {
        base: 20,
        mappings: [{ source: "pressure", from: 0.62, to: 1.24 }],
        jitter: { mode: "multiply", amount: 0.08 },
      },
      opacity: {
        base: 0.72,
        mappings: [{ source: "pressure", from: 0.46, to: 1 }],
        jitter: { mode: "multiply", amount: 0.08 },
      },
      flow: {
        base: 0.52,
        mappings: [{ source: "pressure", from: 0.58, to: 1 }],
        jitter: { mode: "multiply", amount: 0.06 },
      },
      grain: {
        space: "canvas-fixed",
        amount: 0.3,
        scale: 8.5,
        contrast: 0.62,
        seed: 331,
      },
      spacingRatio: 0.12,
      spacing: {
        mappings: [{ source: "speed", from: 0.94, to: 1.08 }],
        jitter: null,
      },
      scatterRatio: 0.04,
      scatter: {
        mappings: [{ source: "speed", from: 0.9, to: 1.08 }],
        jitter: null,
      },
      angle: {
        base: 0,
        mappings: [
          { source: "direction", mode: "add", from: 0, to: 360 },
          { source: "tilt-azimuth", mode: "add", from: 0, to: 360, amount: 0.2 },
        ],
        jitter: { mode: "add", amount: 4 },
      },
      roundness: {
        base: 0.38,
        mappings: [{ source: "tilt-magnitude", from: 0.9, to: 0.3 }],
        jitter: { mode: "multiply", amount: 0.05 },
      },
    },
  },
  "oil-pastel": {
    presetId: "dry-media",
    overrides: {
      seed: 337,
      taper: {
        enabled: true,
        startLength: 0.05,
        endLength: 0.08,
        minSizeRatio: 0.58,
        minOpacityRatio: 0.62,
        curve: 0.86,
      },
      tip: { shape: "bristle", softness: 0.38 },
      width: {
        base: 18,
        mappings: [{ source: "pressure", from: 0.58, to: 1.18 }],
        jitter: { mode: "multiply", amount: 0.06 },
      },
      opacity: {
        base: 0.88,
        mappings: [{ source: "pressure", from: 0.62, to: 1 }],
        jitter: { mode: "multiply", amount: 0.05 },
      },
      flow: {
        base: 0.7,
        mappings: [{ source: "pressure", from: 0.7, to: 1 }],
        jitter: { mode: "multiply", amount: 0.04 },
      },
      grain: {
        space: "stroke-fixed",
        amount: 0.16,
        scale: 6,
        contrast: 0.48,
        seed: 337,
      },
      spacingRatio: 0.1,
      spacing: {
        mappings: [{ source: "speed", from: 0.96, to: 1.06 }],
        jitter: null,
      },
      scatterRatio: 0.025,
      scatter: {
        mappings: [{ source: "speed", from: 0.94, to: 1.05 }],
        jitter: null,
      },
      angle: {
        base: 0,
        mappings: [
          { source: "direction", mode: "add", from: 0, to: 360 },
          { source: "tilt-azimuth", mode: "add", from: 0, to: 360, amount: 0.12 },
        ],
        jitter: { mode: "add", amount: 3 },
      },
      roundness: {
        base: 0.46,
        mappings: [{ source: "tilt-magnitude", from: 0.96, to: 0.4 }],
        jitter: { mode: "multiply", amount: 0.04 },
      },
    },
  },
};

function mergeStudioBrushDynamicsVariant(
  base: NormalizedStudioBrushDynamicsSettings,
  overrides: StudioBrushDynamicsSettings
): NormalizedStudioBrushDynamicsSettings {
  const mergeProperty = (
    property: NormalizedStudioBrushDynamicsProperty,
    override: StudioBrushDynamicsPropertySettings | undefined
  ): StudioBrushDynamicsPropertySettings => ({ ...property, ...override });

  return normalizeStudioBrushDynamicsSettings({
    ...base,
    ...overrides,
    taper: { ...base.taper, ...overrides.taper },
    tip: { ...base.tip, ...overrides.tip },
    colorDynamics: { ...base.colorDynamics, ...overrides.colorDynamics },
    grain: { ...base.grain, ...overrides.grain },
    dualBrush: { ...base.dualBrush, ...overrides.dualBrush },
    width: mergeProperty(base.width, overrides.width ?? overrides.size),
    opacity: mergeProperty(base.opacity, overrides.opacity),
    flow: mergeProperty(base.flow, overrides.flow),
    spacing: mergeProperty(base.spacing, overrides.spacing),
    scatter: mergeProperty(base.scatter, overrides.scatter),
    angle: mergeProperty(base.angle, overrides.angle),
    roundness: mergeProperty(base.roundness, overrides.roundness),
  });
}

/**
 * Resolve the exact runtime dynamics for a toolbar brush id.
 *
 * Unlike `resolveStudioBrushDynamicsPresetId`, this keeps related brushes on the same persistence
 * pipeline while returning different tip physics for rendering. Unknown/non-dynamic brushes return
 * null so callers can retain their existing ordinary line renderer.
 */
export function studioBrushDynamicsSettingsForBrushId(
  brushId: unknown
): NormalizedStudioBrushDynamicsSettings | null {
  if (typeof brushId !== "string") return null;
  const variant = STUDIO_BRUSH_DYNAMICS_VARIANTS[brushId];
  if (variant) {
    return mergeStudioBrushDynamicsVariant(
      studioBrushDynamicsPresetSettings(variant.presetId),
      variant.overrides
    );
  }
  const presetId = resolveStudioBrushDynamicsPresetId(brushId);
  return presetId ? studioBrushDynamicsPresetSettings(presetId) : null;
}

/** Normalizes browser/serialized pointer data without mutating the source object. */
export function normalizeStudioBrushDynamicsSample(
  sample?: StudioBrushDynamicsSample | null,
  options?: Pick<StudioBrushDynamicsSettings, "fallbackPressure" | "maxSpeed"> | null
): NormalizedStudioBrushDynamicsSample {
  const fallbackPressure = clamp01(finiteNumber(options?.fallbackPressure, 0.5));
  const maxSpeed = clamp(finiteNumber(options?.maxSpeed, 1.6), 0.01, MAX_POINTER_SPEED);
  const pressure = clamp01(finiteNumber(sample?.pressure, fallbackPressure));
  const tangentialPressure = clamp(finiteNumber(sample?.tangentialPressure, 0), -1, 1);
  const speed = clamp(finiteNumber(sample?.speed, 0), 0, MAX_POINTER_SPEED);
  const tiltX = clamp(finiteNumber(sample?.tiltX, 0), -90, 90);
  const tiltY = clamp(finiteNumber(sample?.tiltY, 0), -90, 90);
  const tiltMagnitude = clamp01(Math.hypot(tiltX, tiltY) / 90);
  const hasTilt = tiltMagnitude > Number.EPSILON;
  const rawDirection = finiteNumber(sample?.direction, Number.NaN);
  const hasDirection = Number.isFinite(rawDirection);

  return {
    pressure,
    tangentialPressure,
    tangentialPressureNormalized: (tangentialPressure + 1) / 2,
    speed,
    speedNormalized: clamp01(speed / maxSpeed),
    tiltX,
    tiltY,
    tiltMagnitude,
    tiltAzimuth: hasTilt ? normalizeSignedDegrees(Math.atan2(tiltY, tiltX) * 180 / Math.PI) : 0,
    twist: clamp(finiteNumber(sample?.twist, 0), 0, 359),
    direction: hasDirection ? normalizeSignedDegrees(rawDirection) : 0,
    hasTilt,
    hasDirection,
    stampIndex: uint32(sample?.stampIndex, 0),
  };
}

function sourceValue(
  source: StudioBrushDynamicsSource,
  sample: NormalizedStudioBrushDynamicsSample
): { value: number; active: boolean } {
  switch (source) {
    case "pressure":
      return { value: sample.pressure, active: true };
    case "tangential-pressure":
      return { value: sample.tangentialPressureNormalized, active: true };
    case "speed":
      return { value: sample.speedNormalized, active: true };
    case "tilt":
    case "tilt-magnitude":
      return { value: sample.tiltMagnitude, active: true };
    case "tilt-azimuth":
      return { value: normalizedAngle(sample.tiltAzimuth), active: sample.hasTilt };
    case "twist":
      return { value: sample.twist / 360, active: true };
    case "direction":
      return { value: normalizedAngle(sample.direction), active: sample.hasDirection };
  }
}

/** Stable unsigned hash converted to [0, 1); intentionally independent of Math.random. */
function seededUnit(seed: number, stampIndex: number, salt: number): number {
  let value = (seed ^ Math.imul((stampIndex + 1) >>> 0, 0x9e37_79b1) ^ salt) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb_352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846c_a68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x1_0000_0000;
}

function resolveProperty(
  property: NormalizedStudioBrushDynamicsProperty,
  propertyName: DynamicsPropertyName,
  sample: NormalizedStudioBrushDynamicsSample,
  seed: number
): number {
  let value = property.base;
  for (const mapping of property.mappings) {
    const input = sourceValue(mapping.source, sample);
    if (!input.active || mapping.amount <= 0) continue;
    const linearResponse = mapping.invert ? 1 - input.value : input.value;
    const response = Math.pow(clamp01(linearResponse), mapping.curve);
    const target = mapping.from + (mapping.to - mapping.from) * response;
    if (mapping.mode === "multiply") value *= 1 + (target - 1) * mapping.amount;
    else value += target * mapping.amount;
  }

  if (property.jitter) {
    const signedRandom = seededUnit(seed, sample.stampIndex, PROPERTY_SALTS[propertyName]) * 2 - 1;
    if (property.jitter.mode === "multiply") value *= 1 + signedRandom * property.jitter.amount;
    else value += signedRandom * property.jitter.amount;
  }

  if (!Number.isFinite(value)) value = property.base;
  if (propertyName === "angle") value = normalizeSignedDegrees(value);
  return clamp(value, property.min, property.max);
}

function resolveNormalizedStudioBrushDynamics(
  sample: NormalizedStudioBrushDynamicsSample,
  settings: NormalizedStudioBrushDynamicsSettings
): StudioBrushDynamicsRecipe {
  const values = {} as Record<DynamicsPropertyName, number>;
  for (const propertyName of PROPERTY_NAMES) {
    let property = settings[propertyName];
    // Ratio mode follows the pressure/jitter-adjusted tip size of this exact dab, not only the
    // nominal toolbar width. Property mappings then remain available for extra speed/pressure
    // modulation on top of that physical ratio.
    if (propertyName === "spacing" && settings.spacingRatio !== null) {
      property = {
        ...property,
        base: clamp(values.width * settings.spacingRatio, property.min, property.max),
      };
    } else if (propertyName === "scatter" && settings.scatterRatio !== null) {
      property = {
        ...property,
        base: clamp(values.width * settings.scatterRatio, property.min, property.max),
      };
    }
    values[propertyName] = resolveProperty(property, propertyName, sample, settings.seed);
  }

  if (values.scatter <= 0) {
    return {
      size: values.width,
      width: values.width,
      opacity: values.opacity,
      flow: values.flow,
      spacing: values.spacing,
      scatter: 0,
      scatterOffsetX: 0,
      scatterOffsetY: 0,
      scatterAngle: 0,
      angle: values.angle,
      roundness: values.roundness,
    };
  }

  const scatterAngleRadians = seededUnit(settings.seed, sample.stampIndex, 0x243f_6a88) * TAU;
  // sqrt gives a spatially uniform disk rather than clustering particles at its centre.
  const scatterDistance = Math.sqrt(seededUnit(settings.seed, sample.stampIndex, 0x85a3_08d3)) * values.scatter;
  return {
    size: values.width,
    width: values.width,
    opacity: values.opacity,
    flow: values.flow,
    spacing: values.spacing,
    scatter: values.scatter,
    scatterOffsetX: Math.cos(scatterAngleRadians) * scatterDistance,
    scatterOffsetY: Math.sin(scatterAngleRadians) * scatterDistance,
    scatterAngle: normalizeSignedDegrees(scatterAngleRadians * 180 / Math.PI),
    angle: values.angle,
    roundness: values.roundness,
  };
}

/** Resolves one normalized, finite dab recipe from a pointer sample and serializable settings. */
export function resolveStudioBrushDynamics(
  sample?: StudioBrushDynamicsSample | null,
  settings?: StudioBrushDynamicsSettings | null
): StudioBrushDynamicsRecipe {
  const normalizedSettings = normalizeStudioBrushDynamicsSettings(settings);
  const normalizedSample = normalizeStudioBrushDynamicsSample(sample, normalizedSettings);
  return resolveNormalizedStudioBrushDynamics(normalizedSample, normalizedSettings);
}

/** Stable FNV-1a seed for document/stroke ids. */
export function studioBrushDynamicsSeedFromKey(key: unknown): number {
  if (typeof key !== "string" || key.length === 0) return INTERNAL_DEFAULT_SETTINGS.seed;
  let hash = 2166136261;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

interface SanitizedStrokePoint {
  x: number;
  y: number;
  sourceProgress: number;
}

interface StrokeStation extends SanitizedStrokePoint {
  direction: number;
  progress: number;
}

function safeCoordinate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? clamp(value, -MAX_COORDINATE_ABS, MAX_COORDINATE_ABS)
    : null;
}

function sanitizeStrokePoints(value: unknown): SanitizedStrokePoint[] {
  if (!Array.isArray(value)) return [];
  const sourcePairCount = Math.floor(value.length / 2);
  const points: SanitizedStrokePoint[] = [];
  for (let pairIndex = 0; pairIndex < sourcePairCount; pairIndex++) {
    const x = safeCoordinate(value[pairIndex * 2]);
    const y = safeCoordinate(value[pairIndex * 2 + 1]);
    if (x === null || y === null) continue;
    const sourceProgress = sourcePairCount <= 1 ? 0 : pairIndex / (sourcePairCount - 1);
    const previous = points.at(-1);
    if (previous && Math.hypot(x - previous.x, y - previous.y) <= POINT_EPSILON) {
      // Keep the most recent exact endpoint and associated stylus progress for zero-length runs.
      previous.x = x;
      previous.y = y;
      previous.sourceProgress = sourceProgress;
    } else {
      points.push({ x, y, sourceProgress });
    }
  }
  return points;
}

function cumulativeLengths(points: readonly SanitizedStrokePoint[]): Float64Array {
  const cumulative = new Float64Array(points.length);
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    cumulative[index] = cumulative[index - 1]! + Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  return cumulative;
}

/**
 * Creates a forward-only arc-length sampler.
 *
 * Planned dab distances are strictly increasing. Binary-searching the whole source path for every
 * dab made an active airbrush frame O(D log N) after already paying O(N) for cumulative lengths,
 * and that cost grew perceptibly during long strokes. One segment cursor produces byte-identical
 * interpolation in O(N + D). A defensive reset preserves deterministic behavior if a future caller
 * ever supplies a regressing distance.
 */
function createStationAtDistanceSampler(
  points: readonly SanitizedStrokePoint[],
  cumulative: Float64Array,
  totalLength: number
): (rawDistance: number) => StrokeStation {
  let upperIndex = 1;
  let previousDistance = 0;
  return (rawDistance: number): StrokeStation => {
    if (points.length === 1 || totalLength <= POINT_EPSILON) {
      return { ...points[0]!, direction: 0, progress: 0 };
    }

    const distance = clamp(rawDistance, 0, totalLength);
    if (distance < previousDistance) upperIndex = 1;
    previousDistance = distance;
    if (distance <= POINT_EPSILON) {
      upperIndex = 1;
    } else if (totalLength - distance <= POINT_EPSILON) {
      upperIndex = points.length - 1;
    } else {
      while (
        upperIndex < points.length - 1
        && cumulative[upperIndex]! < distance
      ) {
        upperIndex += 1;
      }
    }

    const lowerIndex = upperIndex - 1;
    const start = points[lowerIndex]!;
    const end = points[upperIndex]!;
    const segmentStart = cumulative[lowerIndex]!;
    const segmentLength = cumulative[upperIndex]! - segmentStart;
    const amount = segmentLength > POINT_EPSILON
      ? clamp01((distance - segmentStart) / segmentLength)
      : 0;
    return {
      x: distance <= POINT_EPSILON
        ? points[0]!.x
        : totalLength - distance <= POINT_EPSILON
          ? points.at(-1)!.x
          : start.x + (end.x - start.x) * amount,
      y: distance <= POINT_EPSILON
        ? points[0]!.y
        : totalLength - distance <= POINT_EPSILON
          ? points.at(-1)!.y
          : start.y + (end.y - start.y) * amount,
      sourceProgress: start.sourceProgress + (end.sourceProgress - start.sourceProgress) * amount,
      direction: normalizeSignedDegrees(
        Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI
      ),
      progress: distance / totalLength,
    };
  };
}

function sampleNumberAtProgress(
  values: unknown,
  progress: number,
  fallback: number,
  min: number,
  max: number
): number {
  if (!Array.isArray(values) || values.length === 0) return fallback;
  if (values.length === 1) return clamp(finiteNumber(values[0], fallback), min, max);
  const position = clamp01(progress) * (values.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.min(values.length - 1, Math.ceil(position));
  const amount = position - lowerIndex;
  const lower = clamp(finiteNumber(values[lowerIndex], fallback), min, max);
  const upper = clamp(finiteNumber(values[upperIndex], lower), min, max);
  return clamp(lower + (upper - lower) * amount, min, max);
}

function sampleCircularDegreesAtProgress(
  values: unknown,
  progress: number,
  fallback: number,
  min: number,
  max: number
): number {
  if (!Array.isArray(values) || values.length === 0) return normalizeSignedDegrees(fallback);
  if (values.length === 1) return normalizeSignedDegrees(clamp(finiteNumber(values[0], fallback), min, max));
  const position = clamp01(progress) * (values.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.min(values.length - 1, Math.ceil(position));
  const amount = position - lowerIndex;
  const lower = clamp(finiteNumber(values[lowerIndex], fallback), min, max);
  const upper = clamp(finiteNumber(values[upperIndex], lower), min, max);
  const delta = normalizeSignedDegrees(upper - lower);
  return normalizeSignedDegrees(lower + delta * amount);
}

function sampleTwistAtProgress(values: unknown, progress: number): number {
  return normalizeUnsignedDegrees(sampleCircularDegreesAtProgress(values, progress, 0, 0, 359));
}

function sampleForStation(
  station: StrokeStation,
  stampIndex: number,
  input: Partial<StudioDynamicBrushPlanInput>,
  settings: NormalizedStudioBrushDynamicsSettings
): StudioBrushDynamicsSample {
  const sourceProgress = station.sourceProgress;
  const direction = Array.isArray(input.directions) && input.directions.length > 0
    ? sampleCircularDegreesAtProgress(input.directions, sourceProgress, station.direction, -180, 180)
    : station.direction;
  return {
    pressure: sampleNumberAtProgress(input.pressures, sourceProgress, settings.fallbackPressure, 0, 1),
    tangentialPressure: sampleNumberAtProgress(input.tangentialPressures, sourceProgress, 0, -1, 1),
    speed: sampleNumberAtProgress(input.speeds, sourceProgress, 0, 0, MAX_POINTER_SPEED),
    tiltX: sampleNumberAtProgress(input.tiltXs, sourceProgress, 0, -90, 90),
    tiltY: sampleNumberAtProgress(input.tiltYs, sourceProgress, 0, -90, 90),
    twist: sampleTwistAtProgress(input.twists, sourceProgress),
    direction,
    stampIndex,
  };
}

function settingsForPlan(
  input: Partial<StudioDynamicBrushPlanInput>,
  normalizedSettings?: NormalizedStudioBrushDynamicsSettings,
  detachSettings = true
): NormalizedStudioBrushDynamicsSettings {
  const settings = normalizedSettings ?? normalizeStudioBrushDynamicsSettings(input.settings);
  const width = clamp(
    finiteNumber(input.baseWidth, INTERNAL_DEFAULT_SETTINGS.width.base),
    settings.width.min,
    settings.width.max
  );
  const opacity = clamp(
    finiteNumber(input.baseOpacity, INTERNAL_DEFAULT_SETTINGS.opacity.base),
    settings.opacity.min,
    settings.opacity.max
  );
  const spacing = settings.spacingRatio === null
    ? settings.spacing.base
    : clamp(width * settings.spacingRatio, settings.spacing.min, settings.spacing.max);
  const scatter = settings.scatterRatio === null
    ? settings.scatter.base
    : clamp(width * settings.scatterRatio, settings.scatter.min, settings.scatter.max);
  if (!detachSettings) {
    // The normalized renderer helper returns only dabs and never exposes this plan-local value.
    // Keep immutable nested settings by reference instead of cloning every mapping/tip/grain field
    // on each active-draft frame.
    return {
      ...settings,
      seed: uint32(input.seed, settings.seed),
      width: { ...settings.width, base: width },
      opacity: { ...settings.opacity, base: opacity },
      spacing: { ...settings.spacing, base: spacing },
      scatter: { ...settings.scatter, base: scatter },
    };
  }
  return {
    ...settings,
    seed: uint32(input.seed, settings.seed),
    taper: cloneTaper(settings.taper),
    tip: cloneTip(settings.tip),
    colorDynamics: { ...settings.colorDynamics },
    grain: { ...settings.grain },
    tipLayers: cloneTipLayers(settings.tipLayers),
    ...(settings.dualBrush ? { dualBrush: cloneDualBrush(settings.dualBrush) } : {}),
    width: { ...settings.width, base: width },
    opacity: { ...settings.opacity, base: opacity },
    spacing: { ...settings.spacing, base: spacing },
    scatter: { ...settings.scatter, base: scatter },
  };
}

/**
 * Converts a stroke to deterministic, arc-length-spaced particle dabs.
 *
 * When maxDabs >= 2, both unscattered source endpoints are retained even if the plan is capped.
 * Scatter intentionally moves rendered x/y; sourceX/sourceY always expose the exact path station.
 */
function planStudioDynamicBrushFromInput(
  input: Partial<StudioDynamicBrushPlanInput>,
  normalizedSettings?: NormalizedStudioBrushDynamicsSettings,
  detachSettings = true
): StudioDynamicBrushPlan {
  const settings = settingsForPlan(input, normalizedSettings, detachSettings);
  const points = sanitizeStrokePoints(input.points);
  if (points.length === 0) {
    return { dabs: [], sourcePointCount: 0, totalLength: 0, capped: false, settings };
  }

  const cumulative = cumulativeLengths(points);
  const totalLength = cumulative.at(-1) ?? 0;
  const maxDabs = Math.trunc(clamp(
    finiteNumber(input.maxDabs, DEFAULT_STUDIO_DYNAMIC_BRUSH_MAX_DABS),
    STUDIO_DYNAMIC_BRUSH_DAB_CAP_RANGE.min,
    STUDIO_DYNAMIC_BRUSH_DAB_CAP_RANGE.max
  ));
  interface PlannedDynamicBrushStation {
    readonly distance: number;
    readonly station: StrokeStation;
    readonly recipe: StudioBrushDynamicsRecipe;
  }
  const buildStations = (fitWholePathToBudget: boolean): PlannedDynamicBrushStation[] => {
    const stationAtDistance = createStationAtDistanceSampler(
      points,
      cumulative,
      totalLength
    );
    const stationPlanAt = (
      distance: number,
      index: number
    ): PlannedDynamicBrushStation => {
      const station = stationAtDistance(distance);
      const sample = normalizeStudioBrushDynamicsSample(
        sampleForStation(station, index, input, settings),
        settings
      );
      return {
        distance,
        station,
        recipe: resolveNormalizedStudioBrushDynamics(sample, settings),
      };
    };
    const planned = [stationPlanAt(0, 0)];
    if (points.length <= 1 || totalLength <= POINT_EPSILON) return planned;

    while (planned.length < maxDabs) {
      const current = planned.at(-1)!;
      const currentDistance = current.distance;
      const naturalSpacing = Math.max(
        STUDIO_BRUSH_DYNAMICS_PROPERTY_LIMITS.spacing.min,
        current.recipe.spacing
      );
      // A capped stroke used to keep all natural dabs near the start and replace only the final one
      // with the endpoint, leaving a many-thousand-pixel hole. On the bounded second pass, reserve
      // enough progress for every remaining station (including the endpoint). Natural spacing still
      // wins wherever pressure/speed/jitter asks for a wider interval, so variable-spacing character
      // survives while the hard cap remains O(maxDabs).
      const remainingStationSlots = maxDabs - planned.length;
      const budgetSpacing = fitWholePathToBudget && remainingStationSlots > 0
        ? (totalLength - currentDistance) / remainingStationSlots
        : 0;
      const nextDistance = currentDistance + Math.max(naturalSpacing, budgetSpacing);
      if (nextDistance >= totalLength - POINT_EPSILON) {
        if (totalLength - currentDistance > POINT_EPSILON) {
          planned.push(stationPlanAt(totalLength, planned.length));
        }
        break;
      }
      planned.push(stationPlanAt(nextDistance, planned.length));
    }
    return planned;
  };

  const naturalStations = buildStations(false);
  const capped = totalLength > POINT_EPSILON
    && totalLength - naturalStations.at(-1)!.distance > POINT_EPSILON;
  // Preserve byte-for-byte natural spacing for ordinary strokes. Only a plan proven to exceed the
  // cap pays for the bounded redistribution pass. A one-dab budget cannot retain both endpoints and
  // intentionally keeps the start, matching the public maxDabs=1 contract.
  const plannedStations = capped && maxDabs >= 2
    ? buildStations(true)
    : naturalStations;

  // Point taps and zero-length runs have no travel axis, so shared start/end taper would
  // incorrectly force the minimum tip size on the only dab.
  const applyStrokeTaper = totalLength > POINT_EPSILON;
  let previousSegmentFrame: StudioDynamicBrushSegmentStartFrame | undefined;
  const dabs = plannedStations.map(({ station, recipe, distance }, index): StudioDynamicBrushDab => {
    const taper = applyStrokeTaper
      ? studioBrushTaperFactors(station.progress, settings.taper)
      : { size: 1, opacity: 1 };
    // Width mappings and taper resolve first; the persisted minimum then constrains geometry only.
    // Opacity/flow keep the untouched canonical pressure so a light stylus contact can remain
    // optically delicate without becoming an unusably sub-pixel tip.
    const size = clamp(
      applyStudioDynamicBrushMinimumDiameterRatio(
        recipe.size * taper.size,
        settings.width.base,
        settings.minimumDiameterRatio
      ),
      STUDIO_BRUSH_DYNAMICS_PROPERTY_LIMITS.width.min,
      STUDIO_BRUSH_DYNAMICS_PROPERTY_LIMITS.width.max
    );
    const opacity = clamp01(recipe.opacity * taper.opacity);
    const dab: StudioDynamicBrushDab = {
      index,
      progress: station.progress,
      sourceX: station.x,
      sourceY: station.y,
      direction: station.direction,
      distanceFromPrevious: index === 0
        ? 0
        : Math.max(0, distance - plannedStations[index - 1]!.distance),
      ...(previousSegmentFrame
        ? { segmentStartFrame: previousSegmentFrame }
        : {}),
      x: station.x + recipe.scatterOffsetX,
      y: station.y + recipe.scatterOffsetY,
      size,
      opacity,
      flow: recipe.flow,
      spacing: recipe.spacing,
      scatter: recipe.scatter,
      angle: recipe.angle,
      roundness: recipe.roundness,
    };
    previousSegmentFrame = Object.freeze({
      index,
      sourceX: station.x,
      sourceY: station.y,
      direction: station.direction,
      size,
      roundness: recipe.roundness,
    });
    return dab;
  });

  return { dabs, sourcePointCount: points.length, totalLength, capped, settings };
}

/** Validates arbitrary settings and converts a stroke to deterministic render dabs. */
export function planStudioDynamicBrush(
  rawInput?: Partial<StudioDynamicBrushPlanInput> | null
): StudioDynamicBrushPlan {
  return planStudioDynamicBrushFromInput(rawInput ?? {});
}

/** Renderer convenience alias when only dabs are needed. */
export function planStudioDynamicBrushDabs(
  input?: Partial<StudioDynamicBrushPlanInput> | null
): StudioDynamicBrushDab[] {
  return planStudioDynamicBrush(input).dabs;
}

/**
 * Hot renderer path for settings that already crossed the normalization boundary. This skips a
 * second walk over every mapping/tip/grain field while retaining the same detached planner output.
 */
export function planNormalizedStudioDynamicBrushDabs(
  input: Omit<Partial<StudioDynamicBrushPlanInput>, "settings"> | null | undefined,
  settings: NormalizedStudioBrushDynamicsSettings
): StudioDynamicBrushDab[] {
  return planStudioDynamicBrushFromInput(input ?? {}, settings, false).dabs;
}
