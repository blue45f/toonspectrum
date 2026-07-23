/**
 * 2026-07 procedural brush pack expansion wave — per-preset professional tuning data.
 *
 * The compact profile rows in studio-brush-pack-runtime.ts derive most parameters from the row
 * index, which is perfect for bulk variety but too coarse for presets that imitate a specific
 * physical tool (a G-pen's dramatic pressure swell, a pastel's canvas-pinned paper tooth, rain
 * falling at one fixed angle...). This module carries explicit, hand-tuned dynamics overrides for
 * the 33 expansion ids ONLY. Ids outside the wave never receive an entry, so the 87 original
 * catalogue brushes keep byte-identical materialized dynamics and saved strokes replay unchanged.
 *
 * Determinism: no override introduces a new random stream. Jitters/mappings run through the
 * engine's seeded planner and every grain override pins an explicit constant seed.
 */
import type {
  StudioBrushDynamicsPropertySettings,
  StudioBrushDynamicsSettings,
  StudioBrushTaperSettings,
} from "./studio-brush-dynamics";
import type {
  StudioBrushColorDynamicsSettings,
  StudioBrushGrainSettings,
} from "./studio-brush-material-dynamics";
import type { StudioBrushPackCatalogId } from "./studio-brush-pack-id";

/** Ids appended by the 2026-07 expansion, in catalogue order. Used by tests and the tuning table. */
export const STUDIO_BRUSH_PACK_EXPANSION_WAVE_IDS = [
  "pencil-4b-rough",
  "pencil-hb-mechanical",
  "pencil-colored-soft",
  "pencil-charcoal-stick",
  "pencil-tilt-shading",
  "g-pen-flex",
  "maru-pen-fine",
  "spoon-pen-round",
  "brush-pen-ink",
  "calligraphy-tilt-nib",
  "milli-pen-uniform",
  "watercolor-wet-bleed",
  "watercolor-edge-stain",
  "oil-impasto-heavy",
  "oil-dry-scumble",
  "pastel-paper-soft",
  "crayon-wax-bold",
  "airbrush-grand-soft",
  "sponge-stipple-dab",
  "marker-colorless-blender",
  "marker-wide-chisel",
  "spray-noise-fine",
  "stardust-star-scatter",
  "leaf-fall-flurry",
  "cloud-billow-soft",
  "rope-twist-stamp",
  "halftone-sparse-dot",
  "rain-streak-diagonal",
  "sparkle-glint-cross",
  "snow-flurry-flake",
  "ink-splatter-burst",
  "fur-soft-clumps",
  "wood-grain-flow",
] as const satisfies readonly StudioBrushPackCatalogId[];

export type StudioBrushPackExpansionWaveId =
  (typeof STUDIO_BRUSH_PACK_EXPANSION_WAVE_IDS)[number];

/**
 * Additive override applied on top of the formula-built settings snapshot before normalization.
 * Channel objects merge shallowly (`{ ...formula, ...override }`), so an override that only sets
 * `jitter` keeps the formula's mappings. `width.base`/`opacity.base` are re-asserted by the
 * runtime after merging — catalogue width and toolbar opacity remain the artist's outer controls.
 */
export interface StudioBrushPackExpansionTuning {
  /** Edge softness for the primary procedural tip (0 = sharp, 1 = softest). */
  tipSoftness?: number;
  /** CSS px/ms at which the normalized speed source saturates. Lower = livelier speed response. */
  maxSpeed?: number;
  /** Dab spacing as a tip-width ratio. */
  spacingRatio?: number;
  /** Scatter radius as a tip-width ratio. */
  scatterRatio?: number;
  taper?: StudioBrushTaperSettings;
  colorDynamics?: StudioBrushColorDynamicsSettings;
  grain?: StudioBrushGrainSettings;
  width?: StudioBrushDynamicsPropertySettings;
  opacity?: StudioBrushDynamicsPropertySettings;
  flow?: StudioBrushDynamicsPropertySettings;
  spacing?: StudioBrushDynamicsPropertySettings;
  scatter?: StudioBrushDynamicsPropertySettings;
  angle?: StudioBrushDynamicsPropertySettings;
  roundness?: StudioBrushDynamicsPropertySettings;
}

const EXPANSION_TUNING: Readonly<
  Record<StudioBrushPackExpansionWaveId, StudioBrushPackExpansionTuning>
> = {
  // ── 연필/스케치 ─────────────────────────────────────────────────────────
  "pencil-4b-rough": {
    // Soft 4B lead: wide pressure swell, heavy canvas-pinned paper tooth.
    tipSoftness: 0.3,
    width: {
      mappings: [{ source: "pressure", from: 0.3, to: 1.6, curve: 1.35 }],
      jitter: { mode: "multiply", amount: 0.14 },
    },
    flow: { base: 0.6, mappings: [{ source: "pressure", from: 0.45, to: 1, curve: 1.2 }] },
    grain: { space: "canvas-fixed", amount: 0.42, scale: 3.2, contrast: 0.62, seed: 0x4b0a_1101 },
    taper: { startLength: 0.05, endLength: 0.12, minSizeRatio: 0.3, curve: 1.3 },
  },
  "pencil-hb-mechanical": {
    // Stiff HB refill: barely any pressure response, faint grain, short taper.
    tipSoftness: 0.05,
    width: {
      mappings: [{ source: "pressure", from: 0.62, to: 1.15, curve: 0.9 }],
      jitter: null,
    },
    flow: { base: 0.85 },
    grain: { space: "canvas-fixed", amount: 0.12, scale: 1.6, contrast: 0.4, seed: 0x4b0a_1102 },
    spacing: { mappings: [{ source: "speed", from: 0.9, to: 1.15 }] },
    taper: { startLength: 0.03, endLength: 0.06, minSizeRatio: 0.6, curve: 1 },
  },
  "pencil-colored-soft": {
    // Wax colored pencil: subtle deterministic hue drift between dabs.
    colorDynamics: { hueJitter: 6, saturationJitter: 0.05, valueJitter: 0.05 },
    width: {
      mappings: [{ source: "pressure", from: 0.4, to: 1.5, curve: 1.1 }],
      jitter: { mode: "multiply", amount: 0.1 },
    },
    flow: { base: 0.58, mappings: [{ source: "pressure", from: 0.5, to: 1 }] },
    grain: { space: "canvas-fixed", amount: 0.3, scale: 2.6, contrast: 0.5, seed: 0x4b0a_1103 },
    roundness: { jitter: { mode: "multiply", amount: 0.06 } },
  },
  "pencil-charcoal-stick": {
    // Charcoal: crumbling opacity, smears that travel with the stroke.
    tipSoftness: 0.22,
    width: {
      mappings: [{ source: "pressure", from: 0.35, to: 1.7, curve: 1.25 }],
      jitter: { mode: "multiply", amount: 0.2 },
    },
    opacity: { jitter: { mode: "multiply", amount: 0.2 } },
    flow: { base: 0.5, mappings: [{ source: "pressure", from: 0.4, to: 1 }] },
    grain: { space: "stroke-fixed", amount: 0.5, scale: 4.5, contrast: 0.55, seed: 0x4b0a_1104 },
  },
  "pencil-tilt-shading": {
    // Side-of-lead shading: tilt magnitude broadens and flattens the mark.
    width: {
      mappings: [
        { source: "pressure", from: 0.5, to: 1.2 },
        { source: "tilt-magnitude", from: 0.8, to: 2.2, curve: 1.1 },
      ],
    },
    roundness: { mappings: [{ source: "tilt-magnitude", from: 1, to: 0.4 }] },
    flow: { base: 0.42, mappings: [{ source: "pressure", from: 0.5, to: 1 }] },
    grain: { space: "canvas-fixed", amount: 0.36, scale: 3.8, contrast: 0.5, seed: 0x4b0a_1105 },
  },

  // ── 펜/잉크 ────────────────────────────────────────────────────────────
  "g-pen-flex": {
    // Manga G-pen: dramatic 0.12x→1.9x swell and a long thin exit stroke.
    tipSoftness: 0.03,
    width: {
      mappings: [{ source: "pressure", from: 0.12, to: 1.9, curve: 1.5 }],
      jitter: null,
    },
    taper: {
      startLength: 0.03,
      endLength: 0.22,
      minSizeRatio: 0.05,
      minOpacityRatio: 0.85,
      curve: 1.6,
    },
    flow: { base: 0.95, mappings: [] },
    spacing: { mappings: [{ source: "speed", from: 0.85, to: 1.2 }] },
  },
  "maru-pen-fine": {
    // Maru (mapping) nib: stiff, precise, nearly constant hairline.
    tipSoftness: 0.02,
    width: {
      mappings: [{ source: "pressure", from: 0.5, to: 1.25, curve: 1.1 }],
      jitter: null,
    },
    opacity: { mappings: [{ source: "pressure", from: 0.75, to: 1 }] },
    taper: { startLength: 0.02, endLength: 0.08, minSizeRatio: 0.35, minOpacityRatio: 0.9, curve: 1.1 },
    flow: { base: 1, mappings: [] },
  },
  "spoon-pen-round": {
    // Spoon (school) nib: gentle early swell, forgiving dialogue-line feel.
    width: {
      mappings: [{ source: "pressure", from: 0.42, to: 1.45, curve: 0.85 }],
      jitter: null,
    },
    taper: { startLength: 0.04, endLength: 0.12, minSizeRatio: 0.25, curve: 1.05 },
    flow: { base: 0.98, mappings: [] },
  },
  "brush-pen-ink": {
    // Sumi brush pen: pressure loads ink, speed starves the bristles.
    tipSoftness: 0.12,
    width: {
      mappings: [
        { source: "pressure", from: 0.18, to: 2, curve: 1.3 },
        { source: "speed", from: 1.05, to: 0.72 },
      ],
    },
    taper: {
      startLength: 0.05,
      endLength: 0.3,
      minSizeRatio: 0.04,
      minOpacityRatio: 0.4,
      curve: 1.8,
    },
    flow: { base: 0.9, mappings: [{ source: "pressure", from: 0.7, to: 1 }] },
  },
  "calligraphy-tilt-nib": {
    // Broad-edge nib: the flat follows the stylus azimuth/barrel, not the stroke direction.
    width: { mappings: [{ source: "pressure", from: 0.55, to: 1.3, curve: 0.95 }] },
    angle: {
      mappings: [
        { source: "tilt-azimuth", mode: "add", from: 0, to: 360, amount: 0.85 },
        { source: "twist", mode: "add", from: 0, to: 360, amount: 0.4 },
      ],
      jitter: null,
    },
    roundness: { mappings: [{ source: "tilt-magnitude", from: 1, to: 0.6, amount: 0.6 }] },
    taper: { startLength: 0.04, endLength: 0.1, minSizeRatio: 0.4, curve: 1 },
    flow: { base: 0.96 },
  },
  "milli-pen-uniform": {
    // Technical liner: pressure is ignored entirely; the line never varies.
    width: { mappings: [], jitter: null },
    opacity: { mappings: [] },
    flow: { base: 1, mappings: [] },
    spacingRatio: 0.09,
  },

  // ── 채색 ───────────────────────────────────────────────────────────────
  "watercolor-wet-bleed": {
    // Wet-on-wet wash: slow strokes deposit more water, fast strokes dry out.
    tipSoftness: 0.9,
    flow: {
      base: 0.3,
      mappings: [
        { source: "pressure", from: 0.5, to: 1 },
        { source: "speed", from: 1.15, to: 0.6 },
      ],
    },
    opacity: { mappings: [{ source: "pressure", from: 0.35, to: 1, curve: 0.8 }] },
    width: { mappings: [{ source: "pressure", from: 0.75, to: 1.35 }] },
    grain: { space: "stroke-fixed", amount: 0.18, scale: 9, contrast: 0.3, seed: 0x4b0a_1201 },
  },
  "watercolor-edge-stain": {
    // Drying pool: high-contrast canvas-pinned blotches read as pigment edges.
    tipSoftness: 0.75,
    flow: { base: 0.26, mappings: [{ source: "pressure", from: 0.45, to: 1 }] },
    opacity: { jitter: { mode: "multiply", amount: 0.15 } },
    grain: { space: "canvas-fixed", amount: 0.34, scale: 14, contrast: 0.7, seed: 0x4b0a_1202 },
    scatter: { mappings: [{ source: "speed", from: 0.7, to: 1.3 }] },
  },
  "oil-impasto-heavy": {
    // Impasto: near-continuous dabs plus stroke-locked ridge grain = thick paint.
    spacingRatio: 0.045,
    flow: { base: 0.95, mappings: [] },
    width: {
      mappings: [{ source: "pressure", from: 0.6, to: 1.35, curve: 0.8 }],
      jitter: { mode: "multiply", amount: 0.08 },
    },
    roundness: { jitter: { mode: "multiply", amount: 0.08 } },
    grain: { space: "stroke-fixed", amount: 0.5, scale: 5.5, contrast: 0.75, seed: 0x4b0a_1203 },
    colorDynamics: { valueJitter: 0.045 },
  },
  "oil-dry-scumble": {
    // Dry brush: speed starves flow so fast passes break over the canvas tooth.
    flow: {
      base: 0.5,
      mappings: [
        { source: "pressure", from: 0.5, to: 1 },
        { source: "speed", from: 1.1, to: 0.55 },
      ],
    },
    opacity: { jitter: { mode: "multiply", amount: 0.18 } },
    width: {
      mappings: [{ source: "pressure", from: 0.55, to: 1.3 }],
      jitter: { mode: "multiply", amount: 0.16 },
    },
    grain: { space: "canvas-fixed", amount: 0.44, scale: 3, contrast: 0.68, seed: 0x4b0a_1204 },
  },
  "pastel-paper-soft": {
    // Soft pastel: strong paper tooth pinned to the canvas, powder-light flow.
    tipSoftness: 0.55,
    flow: { base: 0.38, mappings: [{ source: "pressure", from: 0.55, to: 1 }] },
    width: { mappings: [{ source: "pressure", from: 0.7, to: 1.2 }] },
    grain: { space: "canvas-fixed", amount: 0.55, scale: 6, contrast: 0.5, seed: 0x4b0a_1205 },
  },
  "crayon-wax-bold": {
    // Wax crayon: streaks drag with the stroke, hard pressure packs the wax.
    flow: { base: 0.85, mappings: [{ source: "pressure", from: 0.6, to: 1 }] },
    opacity: { mappings: [{ source: "pressure", from: 0.5, to: 1, curve: 1.4 }] },
    grain: { space: "stroke-fixed", amount: 0.4, scale: 2.2, contrast: 0.8, seed: 0x4b0a_1206 },
    roundness: { jitter: { mode: "multiply", amount: 0.05 } },
  },
  "airbrush-grand-soft": {
    // Grand airbrush: size stays stable; pressure only meters the paint.
    tipSoftness: 0.95,
    flow: { base: 0.16, mappings: [{ source: "pressure", from: 0.35, to: 1, curve: 0.85 }] },
    width: { mappings: [{ source: "pressure", from: 0.85, to: 1.15 }], jitter: null },
    taper: { enabled: false },
    scatterRatio: 0.12,
  },
  "sponge-stipple-dab": {
    // Stipple: dabs separate into distinct sponge prints with rotational chaos.
    spacingRatio: 0.82,
    width: {
      mappings: [{ source: "pressure", from: 0.5, to: 1.6 }],
      jitter: { mode: "multiply", amount: 0.3 },
    },
    angle: { jitter: { mode: "add", amount: 90 } },
    scatter: { jitter: { mode: "add", amount: 0.3 } },
    flow: { base: 0.75, mappings: [{ source: "pressure", from: 0.6, to: 1 }] },
  },
  "marker-colorless-blender": {
    // Colorless blender: almost no pigment, exists to soften edges by layering.
    tipSoftness: 0.8,
    flow: { base: 0.14, mappings: [{ source: "pressure", from: 0.4, to: 1 }] },
    opacity: { mappings: [{ source: "pressure", from: 0.3, to: 1 }] },
    width: { mappings: [{ source: "pressure", from: 0.9, to: 1.1 }], jitter: null },
  },
  "marker-wide-chisel": {
    // Poster chisel: fixed-angle flat held steady; only layering builds tone.
    tipSoftness: 0.04,
    spacingRatio: 0.06,
    width: { mappings: [], jitter: null },
    opacity: { mappings: [] },
    flow: { base: 0.6, mappings: [{ source: "pressure", from: 0.75, to: 1 }] },
  },

  // ── 효과/질감 ──────────────────────────────────────────────────────────
  "spray-noise-fine": {
    // Noise spray: huge scatter radius, speed widens the cone.
    spacingRatio: 0.5,
    scatterRatio: 1.15,
    width: {
      mappings: [{ source: "pressure", from: 0.3, to: 1.2 }],
      jitter: { mode: "multiply", amount: 0.5 },
    },
    opacity: { jitter: { mode: "multiply", amount: 0.3 } },
    flow: { base: 0.5 },
    scatter: {
      mappings: [{ source: "speed", from: 0.5, to: 1.6 }],
      jitter: { mode: "add", amount: 0.4 },
    },
  },
  "stardust-star-scatter": {
    // Stardust: fully random star rotation and size, gentle hue shimmer.
    spacingRatio: 0.75,
    width: {
      mappings: [{ source: "pressure", from: 0.6, to: 1.3 }],
      jitter: { mode: "multiply", amount: 0.45 },
    },
    angle: { jitter: { mode: "add", amount: 180 } },
    opacity: { jitter: { mode: "multiply", amount: 0.25 } },
    colorDynamics: { hueJitter: 8, valueJitter: 0.12 },
    scatter: { jitter: { mode: "add", amount: 0.4 } },
  },
  "leaf-fall-flurry": {
    // Falling leaves: tumbling rotation (no direction-follow) and autumn hue spread.
    angle: { jitter: { mode: "add", amount: 150 } },
    colorDynamics: { hueJitter: 14, saturationJitter: 0.08, valueJitter: 0.09 },
    scatter: {
      mappings: [{ source: "speed", from: 0.6, to: 1.5 }],
      jitter: { mode: "add", amount: 0.3 },
    },
    width: {
      mappings: [{ source: "pressure", from: 0.55, to: 1.4 }],
      jitter: { mode: "multiply", amount: 0.35 },
    },
  },
  "cloud-billow-soft": {
    // Cumulus smoke: giant soft dabs shaped by very large canvas-pinned noise.
    flow: { base: 0.14, mappings: [{ source: "pressure", from: 0.35, to: 1, curve: 0.75 }] },
    width: {
      mappings: [{ source: "pressure", from: 0.8, to: 1.2 }],
      jitter: { mode: "multiply", amount: 0.25 },
    },
    roundness: { jitter: { mode: "multiply", amount: 0.12 } },
    grain: { space: "canvas-fixed", amount: 0.3, scale: 22, contrast: 0.45, seed: 0x4b0a_1301 },
  },
  "rope-twist-stamp": {
    // Rope: one twist segment per tip width, aligned to the stroke direction.
    spacingRatio: 0.98,
    width: { mappings: [{ source: "pressure", from: 0.85, to: 1.1 }], jitter: null },
    flow: { base: 1, mappings: [] },
  },
  "halftone-sparse-dot": {
    // Sparse screentone: pressure drives dot gain like a real tone gradient.
    spacingRatio: 0.42,
    width: {
      mappings: [{ source: "pressure", from: 0.6, to: 1.5, curve: 1.2 }],
      jitter: null,
    },
    flow: { base: 1, mappings: [] },
  },
  "rain-streak-diagonal": {
    // Rain: streaks keep one fixed diagonal; stroke speed stretches and spreads them.
    maxSpeed: 1.1,
    width: {
      mappings: [{ source: "speed", from: 0.7, to: 1.5 }],
      jitter: { mode: "multiply", amount: 0.2 },
    },
    angle: { jitter: { mode: "add", amount: 4 } },
    opacity: { jitter: { mode: "multiply", amount: 0.3 } },
    scatter: { jitter: { mode: "add", amount: 0.5 } },
    spacing: { mappings: [{ source: "speed", from: 0.7, to: 1.7 }] },
    flow: { base: 0.85 },
  },
  "sparkle-glint-cross": {
    // Glints: isolated cross-flare stamps with strong size variance, mostly upright.
    spacingRatio: 1.05,
    width: {
      mappings: [{ source: "pressure", from: 0.6, to: 1.4 }],
      jitter: { mode: "multiply", amount: 0.55 },
    },
    angle: { jitter: { mode: "add", amount: 24 } },
    colorDynamics: { valueJitter: 0.15 },
    scatter: { jitter: { mode: "add", amount: 0.35 } },
  },
  "snow-flurry-flake": {
    // Snow: tumbling flakes, speed widens the flurry, gentle brightness shimmer.
    angle: { jitter: { mode: "add", amount: 180 } },
    width: {
      mappings: [{ source: "pressure", from: 0.7, to: 1.25 }],
      jitter: { mode: "multiply", amount: 0.4 },
    },
    opacity: { jitter: { mode: "multiply", amount: 0.2 } },
    scatter: { mappings: [{ source: "speed", from: 0.6, to: 1.5 }] },
    flow: { base: 0.9 },
    colorDynamics: { valueJitter: 0.06 },
  },
  "ink-splatter-burst": {
    // Splatter: pressure (not speed) drives the burst radius — press to explode.
    scatter: {
      mappings: [{ source: "pressure", from: 0.5, to: 1.7, curve: 1.3 }],
      jitter: { mode: "add", amount: 0.3 },
    },
    width: {
      mappings: [{ source: "pressure", from: 0.5, to: 1.3 }],
      jitter: { mode: "multiply", amount: 0.6 },
    },
    opacity: { jitter: { mode: "multiply", amount: 0.15 } },
    flow: { base: 0.95 },
  },
  "fur-soft-clumps": {
    // Fur: strand fans diverge from the stroke and thin out at the tip.
    angle: { jitter: { mode: "add", amount: 26 } },
    taper: {
      startLength: 0.08,
      endLength: 0.28,
      minSizeRatio: 0.1,
      minOpacityRatio: 0.45,
      curve: 1.4,
    },
    width: { mappings: [{ source: "pressure", from: 0.4, to: 1.3 }] },
    flow: { base: 0.8, mappings: [{ source: "pressure", from: 0.6, to: 1 }] },
  },
  "wood-grain-flow": {
    // Wood grain: fibre lines ride the stroke while rings stay locked to it.
    grain: { space: "stroke-fixed", amount: 0.42, scale: 7, contrast: 0.6, seed: 0x4b0a_1302 },
    width: { mappings: [{ source: "pressure", from: 0.7, to: 1.25 }] },
    roundness: { jitter: { mode: "multiply", amount: 0.06 } },
    flow: { base: 0.62, mappings: [{ source: "pressure", from: 0.55, to: 1 }] },
  },
};

/** Tuning lookup. Returns null for every pre-expansion catalogue id — their physics never change. */
export function studioBrushPackExpansionTuningById(
  catalogId: StudioBrushPackCatalogId
): StudioBrushPackExpansionTuning | null {
  return Object.prototype.hasOwnProperty.call(EXPANSION_TUNING, catalogId)
    ? EXPANSION_TUNING[catalogId as StudioBrushPackExpansionWaveId]
    : null;
}

function mergeChannel(
  base: StudioBrushDynamicsPropertySettings | undefined,
  override: StudioBrushDynamicsPropertySettings | undefined
): StudioBrushDynamicsPropertySettings | undefined {
  if (!override) return base;
  return { ...base, ...override };
}

/**
 * Merge a tuning entry over the formula-built settings snapshot. Only fields present in the
 * tuning are replaced; channels merge shallowly so partial overrides keep formula sub-fields.
 * The caller re-asserts `width.base`/`opacity.base` after this merge.
 */
export function applyStudioBrushPackExpansionTuning(
  settings: StudioBrushDynamicsSettings,
  tuning: StudioBrushPackExpansionTuning
): StudioBrushDynamicsSettings {
  return {
    ...settings,
    ...(tuning.maxSpeed !== undefined ? { maxSpeed: tuning.maxSpeed } : {}),
    ...(tuning.spacingRatio !== undefined ? { spacingRatio: tuning.spacingRatio } : {}),
    ...(tuning.scatterRatio !== undefined ? { scatterRatio: tuning.scatterRatio } : {}),
    ...(tuning.taper ? { taper: { ...settings.taper, ...tuning.taper } } : {}),
    ...(tuning.colorDynamics ? { colorDynamics: tuning.colorDynamics } : {}),
    ...(tuning.grain ? { grain: tuning.grain } : {}),
    width: mergeChannel(settings.width, tuning.width),
    opacity: mergeChannel(settings.opacity, tuning.opacity),
    flow: mergeChannel(settings.flow, tuning.flow),
    spacing: mergeChannel(settings.spacing, tuning.spacing),
    scatter: mergeChannel(settings.scatter, tuning.scatter),
    angle: mergeChannel(settings.angle, tuning.angle),
    roundness: mergeChannel(settings.roundness, tuning.roundness),
  };
}
