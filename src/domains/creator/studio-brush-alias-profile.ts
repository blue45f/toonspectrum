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

export const STUDIO_BRUSH_ALIAS_PROFILE_VERSION = "brush-alias-profile-v1" as const;

export type StudioBrushAliasProfileVersion =
  typeof STUDIO_BRUSH_ALIAS_PROFILE_VERSION;

export type StudioBrushAliasId =
  | "pen"
  | "fineliner"
  | "ballpoint"
  | "marker"
  | "felt-tip"
  | "marker-bold"
  | "gpen"
  | "liner"
  | "watercolor"
  | "ink-wash"
  | "pencil"
  | "soft-pencil";

export type StudioBrushAliasFamily =
  | "causal-ink"
  | "gpen"
  | "watercolor"
  | "pencil";

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
  gpen: {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "gpen",
    family: "gpen",
    diameterScale: 1,
    pressure: IDENTITY_PRESSURE,
  },
  liner: {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "liner",
    family: "gpen",
    diameterScale: 0.78,
    pressure: { minimum: 0.68, maximum: 0.92, exponent: 0.82 },
  },
  watercolor: {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "watercolor",
    family: "watercolor",
    diameterScale: 1,
    pressure: IDENTITY_PRESSURE,
    watercolor: {
      spacingRatio: 0.34,
      coreRadiusScale: 1,
      coreOpacityScale: 1,
      diffuseRadiusScale: 1,
      diffuseOpacityScale: 1,
    },
  },
  "ink-wash": {
    version: STUDIO_BRUSH_ALIAS_PROFILE_VERSION,
    id: "ink-wash",
    family: "watercolor",
    diameterScale: 0.88,
    pressure: { minimum: 0.2, maximum: 1, exponent: 0.8 },
    watercolor: {
      spacingRatio: 0.22,
      coreRadiusScale: 0.78,
      coreOpacityScale: 1.55,
      diffuseRadiusScale: 1.55,
      diffuseOpacityScale: 0.62,
    },
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
  const scale = resolveStudioBrushAliasProfile(brushId)?.diameterScale ?? 1;
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
  if (!profile?.watercolor) return null;
  const baseWidth = studioBrushAliasEffectiveDiameter(brushId, selectedDiameter);
  return {
    baseWidth,
    spacing: Math.max(0.25, baseWidth * profile.watercolor.spacingRatio),
  };
}

export interface StudioBrushAliasWatercolorDab {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly opacity: number;
  readonly role: "core" | "diffuse";
}

/** Applies material-only radius/pigment differences without moving deterministic dab centres. */
export function applyStudioBrushAliasWatercolorMaterial(
  brushId: unknown,
  dabs: readonly StudioBrushAliasWatercolorDab[]
): readonly StudioBrushAliasWatercolorDab[] {
  const material = resolveStudioBrushAliasProfile(brushId)?.watercolor;
  if (!material) return dabs;
  return dabs.map((dab) => {
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
}

/** Empty for non-pencil families; returned profiles are immutable catalogue constants. */
export function resolveStudioBrushAliasPencilPasses(
  brushId: unknown
): readonly StudioBrushAliasPencilPass[] {
  return resolveStudioBrushAliasProfile(brushId)?.pencilPasses ?? [];
}
