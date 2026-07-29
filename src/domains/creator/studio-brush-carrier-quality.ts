/**
 * Quality guardrails for continuously painted, stamp-carried brush presets.
 *
 * A continuous charcoal, crayon or soft wash is still rendered as a sequence of finite carriers.
 * If preset generation combines wide station spacing with independently scattered centres, the
 * carrier silhouette becomes visible as a row of circles/ovals while the pointer is moving. The
 * paper grain then looks like a defect in the dab lattice instead of a material texture.
 *
 * This policy is deliberately applied only while built-in catalogue presets are materialized.
 * User-authored dynamics and intentionally discrete particle/pattern/stamp brushes remain exact.
 * It does not copy a vendor preset: the limits are renderer-derived overlap budgets expressed as
 * fractions of our own canonical tip diameter.
 */

import {
  normalizeStudioBrushDynamicsSettings,
  type NormalizedStudioBrushDynamicsProperty,
  type NormalizedStudioBrushDynamicsSettings,
} from "./studio-brush-dynamics";

export const STUDIO_BRUSH_CONTINUOUS_CARRIER_POLICY_VERSION =
  "continuous-carrier-quality-v2" as const;

export interface StudioBrushContinuousCarrierPolicyInput {
  readonly runtimeBrushId: "airbrush" | "dry-media" | "ink-particle";
  readonly category: string;
  readonly previewStyle: string;
  readonly settings: NormalizedStudioBrushDynamicsSettings;
}

const DISCRETE_CATEGORIES = new Set([
  "foliage",
  "pattern",
  "pixel",
  "stamp",
  "tone",
]);

const DISCRETE_PREVIEW_STYLES = new Set([
  "dashed",
  "dots",
  "glitter",
  "tone",
]);

interface CarrierLimits {
  readonly spacingRatio: number;
  readonly scatterRatio: number;
}

function carrierLimits(
  input: StudioBrushContinuousCarrierPolicyInput,
): CarrierLimits {
  if (input.runtimeBrushId === "airbrush") {
    if (input.category === "marker") {
      return { spacingRatio: 0.14, scatterRatio: 0.06 };
    }
    if (input.previewStyle === "soft" || input.category === "paint") {
      return { spacingRatio: 0.16, scatterRatio: 0.08 };
    }
    return { spacingRatio: 0.18, scatterRatio: 0.1 };
  }
  if (input.runtimeBrushId === "dry-media") {
    if (
      input.category === "ink"
      || input.category === "marker"
      || input.category === "paint"
    ) {
      return {
        spacingRatio: 0.18,
        scatterRatio: input.category === "marker" ? 0.08 : 0.1,
      };
    }
    return { spacingRatio: 0.22, scatterRatio: 0.12 };
  }
  return { spacingRatio: 0.18, scatterRatio: 0.08 };
}

function capJitter(
  property: NormalizedStudioBrushDynamicsProperty,
  maximumAmount: number,
): NormalizedStudioBrushDynamicsProperty {
  if (!property.jitter || property.jitter.amount <= maximumAmount) {
    return property;
  }
  return {
    ...property,
    jitter: {
      ...property.jitter,
      amount: maximumAmount,
    },
  };
}

function hasTexturedCarrier(
  settings: NormalizedStudioBrushDynamicsSettings,
): boolean {
  return settings.grain.amount > 0
    || settings.tip.shape === "bristle"
    || settings.tip.shape === "grain"
    || settings.tip.shape === "sponge";
}

function stabilizeContinuousCarrierColor(
  input: StudioBrushContinuousCarrierPolicyInput,
): NormalizedStudioBrushDynamicsSettings["colorDynamics"] {
  const colorDynamics = input.settings.colorDynamics;

  /*
   * Continuous catalogue paint has one pigment colour per stroke. Signed per-dab HSV/background
   * jitter lets a later, lighter carrier raise RGB luminance even though source-over alpha remains
   * monotonic, which looks exactly like an earlier mark was rubbed away at self-overlaps. Grain,
   * pressure, flow and opacity still retain material variation without changing pigment identity.
   *
   * Analytic soft tips have an additional performance requirement: every exact jitter colour needs
   * a separately tinted 259×259 falloff surface. Once the small immutable cache fills, long wet
   * washes otherwise retint that complete scratch surface at nearly every station and expose the
   * regular carrier lattice as lighter/darker discs.
   *
   * Explicit particle/stamp presets return before this helper, and user-authored dynamics never
   * pass through the catalogue materialization policy.
   */
  return {
    ...colorDynamics,
    foregroundBackgroundJitter: 0,
    hueJitter: 0,
    saturationJitter: 0,
    valueJitter: 0,
  };
}

export function studioBrushPresetUsesIntentionalDiscreteCarrier(
  input: Pick<
    StudioBrushContinuousCarrierPolicyInput,
    "category" | "previewStyle" | "runtimeBrushId"
  >,
): boolean {
  // `effect` is deliberately not a blanket discrete category. Soft smoke/cloud effects and
  // flowing weather wisps are continuous paint carriers even though they live in the FX library.
  // Their visual preview is `soft`/`wavy`, whereas repeated particles, glints, rain stamps and
  // similar authored marks already opt into one of the explicit discrete preview styles below.
  return DISCRETE_CATEGORIES.has(input.category)
    // Ink-particle FX rendered as a wavy preview are authored repeated line/ray motifs (for
    // example focus-ray stamps), unlike airbrush smoke/cloud streams that need carrier overlap.
    || (
      input.category === "effect"
      && input.previewStyle === "wavy"
      && input.runtimeBrushId === "ink-particle"
    )
    || DISCRETE_PREVIEW_STYLES.has(input.previewStyle);
}

/**
 * Returns a detached normalized preset with a continuous carrier envelope.
 *
 * - spacing is bounded before a full tip-diameter hole can open;
 * - scatter is bounded tightly enough that neighbouring carrier supports keep overlapping;
 * - white-noise amplitude is limited while pressure mappings remain untouched;
 * - a tiny deterministic rotation is added to textured tips that otherwise repeat one identical
 *   bitmap orientation. The canonical seeded jitter stream still guarantees prefix-stable replay.
 */
export function applyStudioBrushContinuousCarrierQualityPolicy(
  input: StudioBrushContinuousCarrierPolicyInput,
): NormalizedStudioBrushDynamicsSettings {
  if (studioBrushPresetUsesIntentionalDiscreteCarrier(input)) {
    return normalizeStudioBrushDynamicsSettings(input.settings);
  }

  const limits = carrierLimits(input);
  const settings = input.settings;
  const spacingRatio = settings.spacingRatio === null
    ? null
    : Math.min(settings.spacingRatio, limits.spacingRatio);
  const scatterRatio = settings.scatterRatio === null
    ? null
    : Math.min(settings.scatterRatio, limits.scatterRatio);
  const angle = capJitter(settings.angle, 12);
  /*
   * An alpha map is only a tip silhouette transport. Broad chisel/calligraphy tips also use an
   * alpha map, and rotating each station of those otherwise smooth carriers exposes a saw-tooth
   * dab lattice along both edges. Decorrelate only genuinely textured material (grain/bristle/
   * sponge), while a flat mapped nib keeps its authored orientation exactly.
   */
  const antiRepeatAngle = angle.jitter || !hasTexturedCarrier(settings)
    ? angle
    : {
        ...angle,
        jitter: {
          mode: "add" as const,
          amount: 2.5,
        },
      };

  return normalizeStudioBrushDynamicsSettings({
    ...settings,
    spacingRatio,
    scatterRatio,
    width: capJitter(settings.width, 0.18),
    opacity: capJitter(settings.opacity, 0.2),
    flow: capJitter(settings.flow, 0.16),
    spacing: capJitter(settings.spacing, 0.1),
    scatter: capJitter(settings.scatter, 0.14),
    angle: antiRepeatAngle,
    roundness: capJitter(settings.roundness, 0.12),
    colorDynamics: stabilizeContinuousCarrierColor(input),
  });
}
