/**
 * Versioned visual profiles for named brushes that intentionally share a renderer.
 *
 * The catalogue exposes artist-facing tools such as fineliner, ballpoint, felt tip and ink wash,
 * while the hot render path groups them into a handful of deterministic engines. Without a
 * second, shared profile boundary, equal toolbar size/opacity values collapse every alias in one
 * family to the exact same pixels. This module keeps the distinction pure and renderer-neutral so
 * retained Canvas, live Canvas/WebGPU and SVG can consume the same numbers.
 *
 * `diameterScale` is deliberately geometric. The global opacity slider remains an honest element
 * opacity and is never silently rescaled for causal line aliases. Natural-media engines may still
 * have per-dab/per-pass pigment multipliers because those are part of the brush material itself.
 */

import { resolveStudioBrushEngineLaneWatercolorMaterial } from "./studio-brush-engine-lane-catalog";
import {
  augmentStudioLivingInkSettledBakeDabs,
  resolveStudioLivingInkSettledBakeProgram,
  type StudioLivingInkSettledBakePhase,
} from "./studio-living-ink-settled-bake-v1";
import {
  augmentStudioWetEdgeBloomDabs,
  resolveStudioWetEdgeBloomProgram,
} from "./studio-wet-edge-bloom-v1";

export const STUDIO_BRUSH_ALIAS_PROFILE_VERSION = "brush-alias-profile-v1" as const;

export type StudioBrushAliasProfileVersion =
  typeof STUDIO_BRUSH_ALIAS_PROFILE_VERSION;

export type StudioBrushAliasId =
  | "pen"
  | "fineliner"
  | "ballpoint"
  | "gel-pen"
  | "glass-pen"
  | "ruling-pen"
  | "technical-pen"
  | "marker"
  | "felt-tip"
  | "marker-bold"
  | "alcohol-marker"
  | "gpen"
  | "school-pen"
  | "maru-pen"
  | "mapping-pen"
  | "kaburapen"
  | "liner"
  | "calligraphy"
  | "fountain-pen"
  | "parallel-pen"
  | "brush-pen"
  | "kneaded-eraser"
  | "highlighter"
  | "chisel-highlighter"
  | "pastel-highlighter"
  | "glitter"
  | "sparkle-star"
  | "brush"
  | "flat-brush"
  | "watercolor"
  | "ink-wash"
  | "inkwash-pen"
  | "inkwash-water-brush"
  | "inkwash-bleed-wash"
  | "inkwash-white-ink"
  | "gouache"
  | "oil"
  | "acrylic"
  | "airbrush"
  | "splatter"
  | "pencil"
  | "pencil-2b"
  | "pencil-6b"
  | "soft-pencil"
  | "colored-pencil"
  | "pastel"
  | "oil-pastel"
  | "screentone"
  | "crosshatch";

export type StudioBrushAliasFamily =
  | "causal-ink"
  | "gpen"
  | "calligraphy"
  | "highlighter"
  | "glitter"
  | "brush"
  | "watercolor"
  | "oil"
  | "airbrush"
  | "pencil"
  | "dry-media"
  | "pastel"
  | "ink-particle"
  | "screentone";

export interface StudioBrushAliasPressureCurve {
  /** Output at a zero-pressure sample. */
  readonly minimum: number;
  /** Output at a full-pressure sample. */
  readonly maximum: number;
  /** Values above one feel firmer; below one respond earlier. */
  readonly exponent: number;
}

export interface StudioBrushAliasWatercolorMaterial {
  /** Dab station distance as a ratio of the already-scaled base width. */
  readonly spacingRatio: number;
  readonly coreRadiusScale: number;
  readonly coreOpacityScale: number;
  readonly diffuseRadiusScale: number;
  readonly diffuseOpacityScale: number;
}

export type StudioBrushAliasPencilPassRole = "soft-edge" | "core";

export interface StudioBrushAliasPencilPass {
  readonly role: StudioBrushAliasPencilPassRole;
  /** Multiplied after the profile-level diameter scale. */
  readonly widthScale: number;
  /** Multiplied by the element's user-selected opacity. */
  readonly opacityScale: number;
  /** Maximum deterministic x/y displacement in document pixels. */
  readonly jitterRadius: number;
}

export interface StudioBrushAliasProfile {
  readonly version: StudioBrushAliasProfileVersion;
  readonly id: StudioBrushAliasId;
  readonly family: StudioBrushAliasFamily;
  /** Multiplied by the size shown in the toolbar before pressure is applied. */
  readonly diameterScale: number;
  readonly pressure: StudioBrushAliasPressureCurve;
  readonly watercolor?: StudioBrushAliasWatercolorMaterial;
  readonly pencilPasses?: readonly StudioBrushAliasPencilPass[];
}

const IDENTITY_PRESSURE = {
  minimum: 0,
  maximum: 1,
  exponent: 1,
} as const satisfies StudioBrushAliasPressureCurve;

/**
 * Visual targets at equal toolbar size/opacity:
 *
 * - fineliner: narrow and almost pressure-invariant;
 * - ballpoint: firmer, smaller tip with a capped maximum;
 * - markers: progressively broader and progressively flatter pressure response;
 * - liner: narrower and much less elastic than the expressive G-pen;
 * - ink wash: compact dark core plus a much broader, paler bleed;
 * - soft pencil: broad translucent under-pass plus a rough graphite core.
 */
export const STUDIO_BRUSH_ALIAS_PROFILES = {
  pen: {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "pen",
    family: "causal-ink",
    diameterScale: 1,
    pressure: IDENTITY_PRESSURE,
  },
  fineliner: {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "fineliner",
    family: "causal-ink",
    diameterScale: 0.48,
    pressure: { minimum: 0.8, maximum: 1, exponent: 0.72 },
  },
  ballpoint: {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "ballpoint",
    family: "causal-ink",
    diameterScale: 0.68,
    pressure: { minimum: 0.34, maximum: 0.9, exponent: 1.35 },
  },
  "gel-pen": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "gel-pen",
    family: "causal-ink",
    // Dense gel ink stays opaque at light pressure but retains a small, visible swell.
    diameterScale: 0.74,
    pressure: { minimum: 0.78, maximum: 1.04, exponent: 0.68 },
  },
  "glass-pen": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "glass-pen",
    family: "causal-ink",
    // A narrow glass groove retains a readable light line and swells subtly as ink loading rises.
    diameterScale: 0.62,
    pressure: { minimum: 0.58, maximum: 1.02, exponent: 0.92 },
  },
  "ruling-pen": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "ruling-pen",
    family: "causal-ink",
    // The jaw gap remains controlled while pressure can still open a visibly broader technical line.
    diameterScale: 0.86,
    pressure: { minimum: 0.44, maximum: 1.12, exponent: 0.78 },
  },
  "technical-pen": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "technical-pen",
    family: "causal-ink",
    diameterScale: 0.55,
    pressure: { minimum: 0.9, maximum: 1, exponent: 0.5 },
  },
  marker: {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "marker",
    family: "causal-ink",
    diameterScale: 1.16,
    pressure: { minimum: 0.86, maximum: 1, exponent: 0.7 },
  },
  "felt-tip": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "felt-tip",
    family: "causal-ink",
    diameterScale: 0.88,
    pressure: { minimum: 0.64, maximum: 0.98, exponent: 0.85 },
  },
  "marker-bold": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "marker-bold",
    family: "causal-ink",
    diameterScale: 1.5,
    pressure: { minimum: 0.92, maximum: 1, exponent: 0.55 },
  },
  "alcohol-marker": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "alcohol-marker",
    family: "causal-ink",
    diameterScale: 1.25,
    pressure: { minimum: 0.75, maximum: 0.95, exponent: 0.8 },
  },
  gpen: {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "gpen",
    family: "gpen",
    diameterScale: 1,
    pressure: IDENTITY_PRESSURE,
  },
  "school-pen": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "school-pen",
    family: "gpen",
    // A school nib is steadier than a G-pen: readable hairline floor, restrained maximum.
    diameterScale: 0.82,
    pressure: { minimum: 0.48, maximum: 1.08, exponent: 0.88 },
  },
  "maru-pen": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "maru-pen",
    family: "gpen",
    // A fine manga nib starts at a true hairline and opens late under deliberate pressure.
    diameterScale: 0.58,
    pressure: { minimum: 0.12, maximum: 1.06, exponent: 1.32 },
  },
  "mapping-pen": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "mapping-pen",
    family: "gpen",
    diameterScale: 0.45,
    pressure: { minimum: 0.2, maximum: 0.95, exponent: 1.1 },
  },
  kaburapen: {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "kaburapen",
    family: "gpen",
    diameterScale: 0.82,
    pressure: { minimum: 0.6, maximum: 1, exponent: 0.7 },
  },
  liner: {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "liner",
    family: "gpen",
    diameterScale: 0.78,
    pressure: { minimum: 0.68, maximum: 0.92, exponent: 0.82 },
  },
  calligraphy: {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "calligraphy",
    family: "causal-ink",
    diameterScale: 1,
    pressure: IDENTITY_PRESSURE,
  },
  "fountain-pen": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "fountain-pen",
    family: "calligraphy",
    // Firm oblique nib: narrower than the broad calligraphy tool, without becoming monoline.
    diameterScale: 0.72,
    pressure: { minimum: 0.38, maximum: 1.02, exponent: 1.08 },
  },
  "parallel-pen": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "parallel-pen",
    family: "calligraphy",
    // Broad-edge lettering needs a stable parallel band rather than brush-pen elasticity.
    diameterScale: 1.18,
    pressure: { minimum: 0.76, maximum: 1.04, exponent: 0.62 },
  },
  "brush-pen": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "brush-pen",
    family: "calligraphy",
    diameterScale: 1.25,
    pressure: { minimum: 0.1, maximum: 1.3, exponent: 1.4 },
  },
  "kneaded-eraser": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "kneaded-eraser",
    family: "causal-ink",
    // The selected 26 px footprint is slightly broadened while light contact remains controllable.
    diameterScale: 1.16,
    pressure: { minimum: 0.24, maximum: 0.92, exponent: 0.86 },
  },
  highlighter: {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "highlighter",
    family: "causal-ink",
    diameterScale: 1,
    pressure: IDENTITY_PRESSURE,
  },
  "chisel-highlighter": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "chisel-highlighter",
    family: "causal-ink",
    diameterScale: 1.35,
    pressure: { minimum: 0.9, maximum: 1, exponent: 0.5 },
  },
  "pastel-highlighter": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "pastel-highlighter",
    family: "causal-ink",
    diameterScale: 1.1,
    pressure: { minimum: 0.85, maximum: 1, exponent: 0.6 },
  },
  glitter: {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "glitter",
    family: "causal-ink",
    diameterScale: 1,
    pressure: IDENTITY_PRESSURE,
  },
  "sparkle-star": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "sparkle-star",
    family: "glitter",
    diameterScale: 1.35,
    pressure: IDENTITY_PRESSURE,
  },
  brush: {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "brush",
    family: "causal-ink",
    diameterScale: 1,
    pressure: IDENTITY_PRESSURE,
  },
  "flat-brush": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "flat-brush",
    family: "causal-ink",
    diameterScale: 1.3,
    pressure: { minimum: 0.5, maximum: 1, exponent: 0.9 },
  },
  watercolor: {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "watercolor",
    family: "watercolor",
    diameterScale: 1,
    pressure: IDENTITY_PRESSURE,
    // Expresii/Kleki wash feel without Living Ink CFD: denser stations, denser
    // core pigment, wider lower-opacity diffuse skirt so soft airbrush and wet
    // wash stop reading as the same envelope (browser texture QA 2026-08-12).
    watercolor: {
      spacingRatio: 0.22,
      coreRadiusScale: 0.76,
      coreOpacityScale: 1.42,
      diffuseRadiusScale: 1.62,
      diffuseOpacityScale: 0.55,
    },
  },
  "ink-wash": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "ink-wash",
    family: "watercolor",
    diameterScale: 0.92,
    // Sumi hand-feel: light pressure keeps a dense core with a narrow bleed skirt; heavy pressure
    // opens the wash and feeds the wet edge. Distinct from soft watercolor's flatter diffuse load.
    pressure: { minimum: 0.14, maximum: 1.08, exponent: 0.74 },
    watercolor: {
      spacingRatio: 0.18,
      coreRadiusScale: 0.72,
      coreOpacityScale: 1.78,
      diffuseRadiusScale: 1.72,
      diffuseOpacityScale: 0.52,
    },
  },
  "inkwash-pen": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "inkwash-pen",
    family: "watercolor",
    diameterScale: 0.65,
    pressure: { minimum: 0.12, maximum: 1.1, exponent: 1.2 },
    watercolor: {
      spacingRatio: 0.18,
      coreRadiusScale: 0.85,
      coreOpacityScale: 1.6,
      diffuseRadiusScale: 1.25,
      diffuseOpacityScale: 0.45,
    },
  },
  "inkwash-water-brush": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "inkwash-water-brush",
    family: "watercolor",
    diameterScale: 1.2,
    pressure: { minimum: 0.3, maximum: 1.0, exponent: 0.7 },
    watercolor: {
      spacingRatio: 0.28,
      coreRadiusScale: 0.5,
      coreOpacityScale: 0.2,
      diffuseRadiusScale: 1.8,
      diffuseOpacityScale: 0.85,
    },
  },
  "inkwash-bleed-wash": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "inkwash-bleed-wash",
    family: "watercolor",
    diameterScale: 1.35,
    pressure: { minimum: 0.15, maximum: 1.0, exponent: 0.8 },
    watercolor: {
      spacingRatio: 0.25,
      coreRadiusScale: 0.7,
      coreOpacityScale: 1.1,
      diffuseRadiusScale: 1.9,
      diffuseOpacityScale: 0.78,
    },
  },
  "inkwash-white-ink": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "inkwash-white-ink",
    family: "watercolor",
    diameterScale: 0.85,
    pressure: { minimum: 0.25, maximum: 1.0, exponent: 0.9 },
    watercolor: {
      spacingRatio: 0.22,
      coreRadiusScale: 0.92,
      coreOpacityScale: 1.4,
      diffuseRadiusScale: 1.3,
      diffuseOpacityScale: 0.55,
    },
  },
  gouache: {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "gouache",
    family: "watercolor",
    diameterScale: 0.95,
    pressure: IDENTITY_PRESSURE,
    watercolor: {
      spacingRatio: 0.28,
      coreRadiusScale: 0.9,
      coreOpacityScale: 1.2,
      diffuseRadiusScale: 1.1,
      diffuseOpacityScale: 0.8,
    },
  },
  oil: {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "oil",
    family: "causal-ink",
    diameterScale: 1.05,
    // Soft early swell, strong late load — matches the oil-ribbon pressureFeel curve so alias
    // diameter and the continuous carrier respond with the same hand-feel.
    pressure: { minimum: 0.28, maximum: 1.18, exponent: 0.82 },
  },
  acrylic: {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "acrylic",
    family: "oil",
    diameterScale: 1.38,
    pressure: { minimum: 0.32, maximum: 1.22, exponent: 0.78 },
  },
  airbrush: {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "airbrush",
    family: "causal-ink",
    diameterScale: 1,
    pressure: IDENTITY_PRESSURE,
  },
  splatter: {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "splatter",
    family: "airbrush",
    diameterScale: 1.45,
    pressure: IDENTITY_PRESSURE,
  },
  pencil: {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "pencil",
    family: "pencil",
    diameterScale: 1,
    pressure: IDENTITY_PRESSURE,
    pencilPasses: [
      { role: "core", widthScale: 1, opacityScale: 1, jitterRadius: 0.75 },
    ],
  },
  "pencil-2b": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "pencil-2b",
    family: "pencil",
    diameterScale: 1.1,
    pressure: IDENTITY_PRESSURE,
    pencilPasses: [
      { role: "core", widthScale: 1.1, opacityScale: 0.9, jitterRadius: 0.8 },
    ],
  },
  "pencil-6b": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "pencil-6b",
    family: "pencil",
    diameterScale: 1.4,
    pressure: IDENTITY_PRESSURE,
    pencilPasses: [
      { role: "soft-edge", widthScale: 1.5, opacityScale: 0.4, jitterRadius: 1.0 },
      { role: "core", widthScale: 1.1, opacityScale: 0.85, jitterRadius: 1.5 },
    ],
  },
  "soft-pencil": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "soft-pencil",
    family: "pencil",
    diameterScale: 1.28,
    pressure: IDENTITY_PRESSURE,
    pencilPasses: [
      { role: "soft-edge", widthScale: 1.9, opacityScale: 0.18, jitterRadius: 0.3 },
      { role: "core", widthScale: 1, opacityScale: 0.72, jitterRadius: 1.2 },
    ],
  },
  "colored-pencil": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "colored-pencil",
    family: "pencil",
    diameterScale: 1.05,
    pressure: IDENTITY_PRESSURE,
    pencilPasses: [
      { role: "core", widthScale: 1.0, opacityScale: 0.82, jitterRadius: 0.6 },
    ],
  },
  pastel: {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "pastel",
    family: "pencil",
    diameterScale: 1,
    pressure: IDENTITY_PRESSURE,
    pencilPasses: [
      { role: "core", widthScale: 1, opacityScale: 1, jitterRadius: 0.75 },
    ],
  },
  "oil-pastel": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "oil-pastel",
    family: "pencil",
    diameterScale: 1.4,
    pressure: IDENTITY_PRESSURE,
    pencilPasses: [
      { role: "soft-edge", widthScale: 1.7, opacityScale: 0.4, jitterRadius: 1.4 },
      { role: "core", widthScale: 1.25, opacityScale: 0.85, jitterRadius: 2.0 },
    ],
  },
  screentone: {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "screentone",
    family: "causal-ink",
    diameterScale: 1,
    pressure: IDENTITY_PRESSURE,
  },
  crosshatch: {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "crosshatch",
    family: "causal-ink",
    diameterScale: 1.25,
    pressure: IDENTITY_PRESSURE,
  },
} as const satisfies Readonly<Record<StudioBrushAliasId, StudioBrushAliasProfile>>;

const MAX_SAFE_PROFILE_SAMPLE_COUNT = 1_000_000;
const MIN_EFFECTIVE_DIAMETER = 0.01;
const MAX_EFFECTIVE_DIAMETER = 8_192;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function isStudioBrushAliasId(value: unknown): value is StudioBrushAliasId {
  return typeof value === "string"
    && Object.prototype.hasOwnProperty.call(STUDIO_BRUSH_ALIAS_PROFILES, value);
}

/** Only named eraser presets may alter the generic eraser footprint and pressure response. */
export function isStudioBrushEraserAliasId(
  value: unknown
): value is Extract<StudioBrushAliasId, "kneaded-eraser"> {
  return value === "kneaded-eraser";
}

/** Unknown/future brushes intentionally return null instead of inheriting pen semantics. */
export function resolveStudioBrushAliasProfile(
  brushId: unknown
): StudioBrushAliasProfile | null {
  return isStudioBrushAliasId(brushId)
    ? STUDIO_BRUSH_ALIAS_PROFILES[brushId]
    : null;
}

/** Returns the renderer diameter while keeping malformed inputs bounded and deterministic. */
export function studioBrushAliasEffectiveDiameter(
  brushId: unknown,
  selectedDiameter: unknown
): number {
  const diameter = clamp(
    finiteOr(selectedDiameter, 1),
    MIN_EFFECTIVE_DIAMETER,
    MAX_EFFECTIVE_DIAMETER
  );
  let scale = resolveStudioBrushAliasProfile(brushId)?.diameterScale ?? 1;
  if (typeof brushId === "string" && brushId.includes("--")) {
    let hash = 2166136261;
    for (let i = 0; i < brushId.length; i++) {
      hash ^= brushId.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    scale *= 0.84 + (((hash >>> 0) % 10_000) / 10_000) * 0.52;
  }
  return clamp(
    diameter * scale,
    MIN_EFFECTIVE_DIAMETER,
    MAX_EFFECTIVE_DIAMETER
  );
}

/** Applies one alias's bounded pressure response. Unknown brushes retain identity pressure. */
export function mapStudioBrushAliasPressure(
  brushId: unknown,
  pressure: unknown,
  fallback = 1
): number {
  const source = clamp(finiteOr(pressure, finiteOr(fallback, 1)), 0, 1);
  const curve = resolveStudioBrushAliasProfile(brushId)?.pressure ?? IDENTITY_PRESSURE;
  return curve.minimum
    + (curve.maximum - curve.minimum) * Math.pow(source, curve.exponent);
}

/**
 * Resolves every source-point pressure, including omitted mouse/touch samples, before rendering.
 * The caller supplies the pressure-model fallback (normally 1 for V3 and 0.5 for legacy).
 */
export function mapStudioBrushAliasPressureSamples(
  brushId: unknown,
  pressures: readonly number[] | null | undefined,
  sourcePointCount: unknown,
  fallback = 1
): number[] {
  if (
    typeof sourcePointCount !== "number"
    || !Number.isSafeInteger(sourcePointCount)
    || sourcePointCount < 0
    || sourcePointCount > MAX_SAFE_PROFILE_SAMPLE_COUNT
  ) {
    return [];
  }
  return Array.from(
    { length: sourcePointCount },
    (_, index) => mapStudioBrushAliasPressure(brushId, pressures?.[index], fallback)
  );
}

export interface StudioBrushAliasWatercolorPlanSettings {
  readonly baseWidth: number;
  readonly spacing: number;
}

/** Exact planner inputs shared by causal and legacy watercolor planners. */
export function resolveStudioBrushAliasWatercolorPlanSettings(
  brushId: unknown,
  selectedDiameter: unknown
): StudioBrushAliasWatercolorPlanSettings | null {
  const profile = resolveStudioBrushAliasProfile(brushId);
  const laneMaterial =
    typeof brushId === "string"
      ? resolveStudioBrushEngineLaneWatercolorMaterial(brushId)
      : null;
  const watercolor = profile?.watercolor ?? laneMaterial;
  if (!watercolor) return null;
  const baseWidth = studioBrushAliasEffectiveDiameter(brushId, selectedDiameter);
  return {
    baseWidth,
    spacing: Math.max(0.25, baseWidth * watercolor.spacingRatio),
  };
}

export interface StudioBrushAliasWatercolorDab {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly opacity: number;
  readonly role: "core" | "diffuse";
}

/**
 * Applies material-only radius/pigment differences without moving deterministic dab centres.
 *
 * `seed` is the stroke-stable watercolor seed (`watercolorBrushSeedFromKey(element.id)`); it is
 * consumed only when the lane material declares a wet-edge-bloom program, so every lane without a
 * program id — including all pre-wave lanes — returns exactly the scaled dabs as before
 * (2026-08-13 brush quality wave).
 *
 * `phase` (2026-08-13 wave 3) feeds only the opt-in living-ink settled bake: the fluid field is
 * global over the stroke, so live prefixes must stay identity and only an explicit `"settled"`
 * bakes. The augmenter defaults every non-settled value to identity, so a caller that omits the
 * parameter can never destabilize a live prefix (fail-closed).
 */
export function applyStudioBrushAliasWatercolorMaterial(
  brushId: unknown,
  dabs: readonly StudioBrushAliasWatercolorDab[],
  seed?: number,
  phase?: StudioLivingInkSettledBakePhase,
): readonly StudioBrushAliasWatercolorDab[] {
  const laneMaterial = typeof brushId === "string"
    ? resolveStudioBrushEngineLaneWatercolorMaterial(brushId)
    : null;
  const material = resolveStudioBrushAliasProfile(brushId)?.watercolor ?? laneMaterial;
  if (!material) return dabs;
  const scaledDabs = dabs.map((dab) => {
    const core = dab.role === "core";
    return {
      ...dab,
      radius: Math.max(
        0.05,
        finiteOr(dab.radius, 0.05)
          * (core ? material.coreRadiusScale : material.diffuseRadiusScale)
      ),
      opacity: clamp(
        finiteOr(dab.opacity, 0)
          * (core ? material.coreOpacityScale : material.diffuseOpacityScale),
        0,
        1
      ),
    };
  });
  // Opt-in wet-texture physics (coffee ring / granulation / chromatography / fresh-ink wetness):
  // only engine lanes whose material row carries a program id ever reach the augment pass.
  const wetEdgeBloomProgram = resolveStudioWetEdgeBloomProgram(
    laneMaterial?.wetEdgeBloomProgramId
  );
  if (wetEdgeBloomProgram) {
    return augmentStudioWetEdgeBloomDabs(scaledDabs, { ...wetEdgeBloomProgram, seed });
  }
  // Opt-in settled-only living-ink bake (2026-08-13 wave 3). One wet-texture authority per lane:
  // a bake program is consulted only when no wet-edge-bloom program is pinned.
  const livingInkBakeProgram = resolveStudioLivingInkSettledBakeProgram(
    laneMaterial?.livingInkBakeProgramId
  );
  if (livingInkBakeProgram) {
    return augmentStudioLivingInkSettledBakeDabs(scaledDabs, {
      ...livingInkBakeProgram,
      seed,
      phase: phase ?? "live",
    });
  }
  return scaledDabs;
}

/** Empty for non-pencil families; returned profiles are immutable catalogue constants. */
export function resolveStudioBrushAliasPencilPasses(
  brushId: unknown
): readonly StudioBrushAliasPencilPass[] {
  return resolveStudioBrushAliasProfile(brushId)?.pencilPasses ?? [];
}
