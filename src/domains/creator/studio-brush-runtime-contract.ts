/**
 * Brush catalogue -> renderer contract.
 *
 * A commercial brush shelf cannot treat a label as the implementation.  Every preset below
 * declares the concrete playback/export engine it uses, its engine variant, preview language and
 * tip footprint.  `canonicalId` makes intentional parameter-only aliases explicit so a new brush
 * cannot silently become a duplicate of an existing one.
 *
 * Keep this table explicit rather than generating it from the family map: reviewers should be able
 * to audit every core promise in one place and tests can compare the declaration with the real engine
 * resolvers used by Canvas and SVG.
 */

import {
  BRUSH_PRESETS,
  type BrushPreset,
  type StudioBrushRenderFamily,
  type StudioToolOperation,
} from "./studio-brush";

import type { StudioBrushPreviewStyle } from "./studio-brush-visual";

export type StudioBrushRuntimeEngine =
  | "causal-ink"
  | "stamp-dabs"
  | "calligraphy-segments"
  | "perfect-outline"
  | "highlighter-path"
  | "neon-halo"
  | "glow-halo"
  | "particle-scatter"
  | "angled-ribbon"
  | "watercolor-dabs"
  | "oil-ribbon"
  | "dynamic-dabs"
  | "pencil-path"
  | "pastel-dabs"
  | "screentone-dots";

export type StudioBrushRuntimeTip =
  | "round"
  | "pressure-round"
  | "chisel"
  | "square"
  | "angled-ribbon"
  | "soft-diffuse"
  | "soft-particle"
  | "flake"
  | "hard"
  | "sponge"
  | "bristle"
  | "grain"
  | "spark"
  | "tone-dot"
  | "stamp-ink"
  | "stamp-airbrush"
  | "stamp-pencil"
  | "stamp-wet-edge";

/** Texture footprint that the committed Canvas/SVG renderer really produces. */
export type StudioBrushRuntimeTexture =
  | "none"
  | "soft-gradient"
  | "wet-edge"
  | "procedural-grain"
  | "procedural-bristle"
  | "procedural-spark"
  | "tone-grid"
  | "custom-alpha-capable";

/** Input/settings model consumed by the renderer rather than merely exposed by the UI. */
export type StudioBrushRuntimeDynamics =
  | "causal-pressure"
  | "stamp-pressure-flow"
  | "tilt-pressure"
  | "outline-pressure"
  | "fixed-path"
  | "seeded-particles"
  | "ribbon-pressure"
  | "watercolor-pressure"
  | "bristle-pressure"
  | "mapped-dabs"
  | "grain-jitter"
  | "pastel-pressure"
  | "global-grid";

/**
 * unique: this is the canonical implementation for its exact execution signature.
 * profile-variant: shares the base engine but applies an exact-id runtime profile after defaults.
 * engine-variant: shares an engine with canonicalId but switches a real runtime algorithm option.
 */
export type StudioBrushRuntimeDistinctness =
  | "unique"
  | "profile-variant"
  | "engine-variant";

export interface StudioBrushRuntimeContract {
  id: string;
  family: StudioBrushRenderFamily;
  engine: StudioBrushRuntimeEngine;
  /** Concrete switch inside the engine; part of the exact execution signature. */
  engineVariant: string;
  /** Canonical preset for aliases/variants. A unique preset points to itself. */
  canonicalId: string;
  preview: StudioBrushPreviewStyle;
  tip: StudioBrushRuntimeTip;
  texture: StudioBrushRuntimeTexture;
  dynamics: StudioBrushRuntimeDynamics;
  distinctness: StudioBrushRuntimeDistinctness;
  /** Omitted means ordinary paint; erase is admitted only through an explicit selectable preset. */
  operation?: StudioToolOperation;
}

export const STUDIO_BRUSH_RUNTIME_CONTRACT = [
  { id: "pen", family: "pen", engine: "causal-ink", engineVariant: "round", canonicalId: "pen", preview: "solid", tip: "round", texture: "none", dynamics: "causal-pressure", distinctness: "unique" },
  { id: "fineliner", family: "pen", engine: "causal-ink", engineVariant: "round", canonicalId: "pen", preview: "solid", tip: "round", texture: "none", dynamics: "causal-pressure", distinctness: "profile-variant" },
  { id: "ballpoint", family: "pen", engine: "causal-ink", engineVariant: "round", canonicalId: "pen", preview: "solid", tip: "round", texture: "none", dynamics: "causal-pressure", distinctness: "profile-variant" },
  { id: "gel-pen", family: "pen", engine: "causal-ink", engineVariant: "round", canonicalId: "pen", preview: "solid", tip: "round", texture: "none", dynamics: "causal-pressure", distinctness: "profile-variant" },
  { id: "glass-pen", family: "pen", engine: "causal-ink", engineVariant: "round", canonicalId: "pen", preview: "solid", tip: "round", texture: "none", dynamics: "causal-pressure", distinctness: "profile-variant" },
  { id: "ruling-pen", family: "pen", engine: "causal-ink", engineVariant: "round", canonicalId: "pen", preview: "solid", tip: "round", texture: "none", dynamics: "causal-pressure", distinctness: "profile-variant" },
  { id: "technical-pen", family: "pen", engine: "causal-ink", engineVariant: "round", canonicalId: "pen", preview: "solid", tip: "round", texture: "none", dynamics: "causal-pressure", distinctness: "profile-variant" },
  { id: "gpen", family: "gpen", engine: "perfect-outline", engineVariant: "gpen-taper", canonicalId: "gpen", preview: "calligraphy", tip: "pressure-round", texture: "none", dynamics: "outline-pressure", distinctness: "unique" },
  { id: "school-pen", family: "gpen", engine: "perfect-outline", engineVariant: "gpen-taper", canonicalId: "gpen", preview: "calligraphy", tip: "pressure-round", texture: "none", dynamics: "outline-pressure", distinctness: "profile-variant" },
  { id: "maru-pen", family: "gpen", engine: "perfect-outline", engineVariant: "gpen-taper", canonicalId: "gpen", preview: "calligraphy", tip: "pressure-round", texture: "none", dynamics: "outline-pressure", distinctness: "profile-variant" },
  { id: "mapping-pen", family: "gpen", engine: "perfect-outline", engineVariant: "gpen-taper", canonicalId: "gpen", preview: "calligraphy", tip: "pressure-round", texture: "none", dynamics: "outline-pressure", distinctness: "profile-variant" },
  { id: "kaburapen", family: "gpen", engine: "perfect-outline", engineVariant: "gpen-taper", canonicalId: "gpen", preview: "calligraphy", tip: "pressure-round", texture: "none", dynamics: "outline-pressure", distinctness: "profile-variant" },
  { id: "liner", family: "gpen", engine: "perfect-outline", engineVariant: "gpen-taper", canonicalId: "gpen", preview: "calligraphy", tip: "pressure-round", texture: "none", dynamics: "outline-pressure", distinctness: "profile-variant" },
  { id: "ink-brush", family: "stamp", engine: "stamp-dabs", engineVariant: "ink", canonicalId: "ink-brush", preview: "solid", tip: "stamp-ink", texture: "none", dynamics: "stamp-pressure-flow", distinctness: "unique" },
  { id: "calligraphy", family: "calligraphy", engine: "calligraphy-segments", engineVariant: "tilt-chisel", canonicalId: "calligraphy", preview: "calligraphy", tip: "chisel", texture: "none", dynamics: "tilt-pressure", distinctness: "unique" },
  { id: "fountain-pen", family: "calligraphy", engine: "calligraphy-segments", engineVariant: "tilt-chisel", canonicalId: "calligraphy", preview: "calligraphy", tip: "chisel", texture: "none", dynamics: "tilt-pressure", distinctness: "profile-variant" },
  { id: "parallel-pen", family: "calligraphy", engine: "calligraphy-segments", engineVariant: "tilt-chisel", canonicalId: "calligraphy", preview: "calligraphy", tip: "chisel", texture: "none", dynamics: "tilt-pressure", distinctness: "profile-variant" },
  { id: "brush-pen", family: "calligraphy", engine: "calligraphy-segments", engineVariant: "tilt-chisel", canonicalId: "calligraphy", preview: "calligraphy", tip: "chisel", texture: "none", dynamics: "tilt-pressure", distinctness: "profile-variant" },
  { id: "perfect-ink", family: "perfect", engine: "perfect-outline", engineVariant: "ink-taper", canonicalId: "perfect-ink", preview: "calligraphy", tip: "pressure-round", texture: "none", dynamics: "outline-pressure", distinctness: "unique" },
  { id: "perfect-marker", family: "perfect", engine: "perfect-outline", engineVariant: "marker-flat", canonicalId: "perfect-marker", preview: "solid", tip: "round", texture: "none", dynamics: "outline-pressure", distinctness: "unique" },
  { id: "standard-eraser", family: "pen", engine: "causal-ink", engineVariant: "standard-erase", canonicalId: "standard-eraser", preview: "solid", tip: "round", texture: "none", dynamics: "causal-pressure", distinctness: "unique", operation: "erase" },
  { id: "kneaded-eraser", family: "pen", engine: "causal-ink", engineVariant: "round", canonicalId: "kneaded-eraser", preview: "solid", tip: "round", texture: "none", dynamics: "causal-pressure", distinctness: "unique", operation: "erase" },
  { id: "marker", family: "marker", engine: "causal-ink", engineVariant: "round", canonicalId: "pen", preview: "solid", tip: "round", texture: "none", dynamics: "causal-pressure", distinctness: "profile-variant" },
  { id: "felt-tip", family: "marker", engine: "causal-ink", engineVariant: "round", canonicalId: "pen", preview: "solid", tip: "round", texture: "none", dynamics: "causal-pressure", distinctness: "profile-variant" },
  { id: "marker-bold", family: "marker", engine: "causal-ink", engineVariant: "round", canonicalId: "pen", preview: "solid", tip: "round", texture: "none", dynamics: "causal-pressure", distinctness: "profile-variant" },
  { id: "alcohol-marker", family: "marker", engine: "causal-ink", engineVariant: "round", canonicalId: "pen", preview: "solid", tip: "round", texture: "none", dynamics: "causal-pressure", distinctness: "profile-variant" },
  { id: "highlighter", family: "highlighter", engine: "highlighter-path", engineVariant: "one-wash-round", canonicalId: "highlighter", preview: "solid", tip: "round", texture: "none", dynamics: "ribbon-pressure", distinctness: "unique" },
  { id: "chisel-highlighter", family: "highlighter", engine: "highlighter-path", engineVariant: "one-wash-soft-flat", canonicalId: "highlighter", preview: "solid", tip: "chisel", texture: "none", dynamics: "ribbon-pressure", distinctness: "engine-variant" },
  { id: "pastel-highlighter", family: "highlighter", engine: "highlighter-path", engineVariant: "one-wash-pastel", canonicalId: "highlighter", preview: "solid", tip: "grain", texture: "procedural-grain", dynamics: "ribbon-pressure", distinctness: "engine-variant" },
  { id: "neon", family: "neon", engine: "neon-halo", engineVariant: "bright-core", canonicalId: "neon", preview: "neon", tip: "round", texture: "soft-gradient", dynamics: "fixed-path", distinctness: "unique" },
  { id: "glow", family: "glow", engine: "glow-halo", engineVariant: "standard", canonicalId: "glow", preview: "glow", tip: "soft-diffuse", texture: "soft-gradient", dynamics: "fixed-path", distinctness: "unique" },
  { id: "soft-glow", family: "glow", engine: "glow-halo", engineVariant: "soft", canonicalId: "glow", preview: "glow", tip: "soft-diffuse", texture: "soft-gradient", dynamics: "fixed-path", distinctness: "engine-variant" },
  { id: "glitter", family: "glitter", engine: "particle-scatter", engineVariant: "glitter", canonicalId: "glitter", preview: "glitter", tip: "spark", texture: "procedural-spark", dynamics: "seeded-particles", distinctness: "unique" },
  { id: "star-dust", family: "glitter", engine: "particle-scatter", engineVariant: "star-dust", canonicalId: "glitter", preview: "glitter", tip: "spark", texture: "procedural-spark", dynamics: "seeded-particles", distinctness: "engine-variant" },
  { id: "sparkle-star", family: "glitter", engine: "particle-scatter", engineVariant: "glitter", canonicalId: "glitter", preview: "glitter", tip: "spark", texture: "procedural-spark", dynamics: "seeded-particles", distinctness: "profile-variant" },
  { id: "brush", family: "brush", engine: "angled-ribbon", engineVariant: "minus-30deg", canonicalId: "brush", preview: "wavy", tip: "angled-ribbon", texture: "none", dynamics: "ribbon-pressure", distinctness: "unique" },
  { id: "flat-brush", family: "brush", engine: "angled-ribbon", engineVariant: "minus-30deg", canonicalId: "brush", preview: "wavy", tip: "angled-ribbon", texture: "none", dynamics: "ribbon-pressure", distinctness: "profile-variant" },
  { id: "watercolor", family: "watercolor", engine: "watercolor-dabs", engineVariant: "diffuse", canonicalId: "watercolor", preview: "soft", tip: "soft-diffuse", texture: "wet-edge", dynamics: "watercolor-pressure", distinctness: "unique" },
  { id: "ink-wash", family: "watercolor", engine: "watercolor-dabs", engineVariant: "diffuse", canonicalId: "watercolor", preview: "soft", tip: "soft-diffuse", texture: "wet-edge", dynamics: "watercolor-pressure", distinctness: "profile-variant" },
  { id: "inkwash-pen", family: "watercolor", engine: "watercolor-dabs", engineVariant: "diffuse", canonicalId: "watercolor", preview: "soft", tip: "soft-diffuse", texture: "wet-edge", dynamics: "watercolor-pressure", distinctness: "profile-variant" },
  { id: "inkwash-water-brush", family: "watercolor", engine: "watercolor-dabs", engineVariant: "diffuse", canonicalId: "watercolor", preview: "soft", tip: "soft-diffuse", texture: "wet-edge", dynamics: "watercolor-pressure", distinctness: "profile-variant" },
  { id: "inkwash-bleed-wash", family: "watercolor", engine: "watercolor-dabs", engineVariant: "diffuse", canonicalId: "watercolor", preview: "soft", tip: "soft-diffuse", texture: "wet-edge", dynamics: "watercolor-pressure", distinctness: "profile-variant" },
  { id: "inkwash-white-ink", family: "watercolor", engine: "watercolor-dabs", engineVariant: "diffuse", canonicalId: "watercolor", preview: "soft", tip: "soft-diffuse", texture: "wet-edge", dynamics: "watercolor-pressure", distinctness: "profile-variant" },
  { id: "gouache", family: "watercolor", engine: "watercolor-dabs", engineVariant: "diffuse", canonicalId: "watercolor", preview: "soft", tip: "soft-diffuse", texture: "wet-edge", dynamics: "watercolor-pressure", distinctness: "profile-variant" },
  { id: "oil", family: "oil", engine: "oil-ribbon", engineVariant: "bristle-lanes", canonicalId: "oil", preview: "oil", tip: "bristle", texture: "procedural-bristle", dynamics: "bristle-pressure", distinctness: "unique" },
  { id: "acrylic", family: "oil", engine: "oil-ribbon", engineVariant: "bristle-lanes", canonicalId: "oil", preview: "oil", tip: "bristle", texture: "procedural-bristle", dynamics: "bristle-pressure", distinctness: "profile-variant" },
  { id: "paint-tube", family: "oil", engine: "dynamic-dabs", engineVariant: "extruded-bead-ribbon", canonicalId: "paint-tube", preview: "oil", tip: "hard", texture: "procedural-bristle", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "airbrush", family: "airbrush", engine: "dynamic-dabs", engineVariant: "airbrush", canonicalId: "airbrush", preview: "soft", tip: "soft-particle", texture: "custom-alpha-capable", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "hard-airbrush", family: "airbrush", engine: "dynamic-dabs", engineVariant: "connected-hard-envelope", canonicalId: "hard-airbrush", preview: "solid", tip: "hard", texture: "none", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "airbrush-fine", family: "stamp", engine: "stamp-dabs", engineVariant: "airbrush", canonicalId: "airbrush-fine", preview: "soft", tip: "stamp-airbrush", texture: "soft-gradient", dynamics: "stamp-pressure-flow", distinctness: "unique" },
  { id: "wash-brush", family: "stamp", engine: "stamp-dabs", engineVariant: "watercolor", canonicalId: "wash-brush", preview: "soft", tip: "stamp-wet-edge", texture: "wet-edge", dynamics: "stamp-pressure-flow", distinctness: "unique" },
  { id: "soft-brush", family: "airbrush", engine: "dynamic-dabs", engineVariant: "soft-brush", canonicalId: "airbrush", preview: "soft", tip: "round", texture: "custom-alpha-capable", dynamics: "mapped-dabs", distinctness: "engine-variant" },
  { id: "spray", family: "airbrush", engine: "dynamic-dabs", engineVariant: "spray", canonicalId: "airbrush", preview: "dots", tip: "flake", texture: "custom-alpha-capable", dynamics: "mapped-dabs", distinctness: "engine-variant" },
  { id: "splatter", family: "airbrush", engine: "dynamic-dabs", engineVariant: "splatter", canonicalId: "airbrush", preview: "dots", tip: "flake", texture: "custom-alpha-capable", dynamics: "mapped-dabs", distinctness: "engine-variant" },
  { id: "pencil", family: "pencil", engine: "pencil-path", engineVariant: "jitter", canonicalId: "pencil", preview: "dashed", tip: "grain", texture: "procedural-grain", dynamics: "grain-jitter", distinctness: "unique" },
  { id: "erodible-pencil", family: "pencil", engine: "dynamic-dabs", engineVariant: "progressive-wear-ribbon", canonicalId: "erodible-pencil", preview: "texture", tip: "grain", texture: "procedural-grain", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "pencil-2b", family: "pencil", engine: "pencil-path", engineVariant: "jitter", canonicalId: "pencil", preview: "dashed", tip: "grain", texture: "procedural-grain", dynamics: "grain-jitter", distinctness: "profile-variant" },
  { id: "pencil-6b", family: "pencil", engine: "pencil-path", engineVariant: "jitter", canonicalId: "pencil", preview: "dashed", tip: "grain", texture: "procedural-grain", dynamics: "grain-jitter", distinctness: "profile-variant" },
  { id: "soft-pencil", family: "pencil", engine: "pencil-path", engineVariant: "jitter", canonicalId: "pencil", preview: "dashed", tip: "grain", texture: "procedural-grain", dynamics: "grain-jitter", distinctness: "profile-variant" },
  { id: "pencil-grain", family: "stamp", engine: "stamp-dabs", engineVariant: "pencil", canonicalId: "pencil-grain", preview: "texture", tip: "stamp-pencil", texture: "procedural-grain", dynamics: "stamp-pressure-flow", distinctness: "unique" },
  { id: "colored-pencil", family: "pencil", engine: "pencil-path", engineVariant: "jitter", canonicalId: "pencil", preview: "dashed", tip: "grain", texture: "procedural-grain", dynamics: "grain-jitter", distinctness: "profile-variant" },
  { id: "dry-media", family: "dry-media", engine: "dynamic-dabs", engineVariant: "dry-media", canonicalId: "dry-media", preview: "texture", tip: "grain", texture: "custom-alpha-capable", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "crayon", family: "dry-media", engine: "dynamic-dabs", engineVariant: "crayon", canonicalId: "dry-media", preview: "texture", tip: "hard", texture: "custom-alpha-capable", dynamics: "mapped-dabs", distinctness: "engine-variant" },
  { id: "chalk", family: "dry-media", engine: "dynamic-dabs", engineVariant: "chalk", canonicalId: "dry-media", preview: "texture", tip: "sponge", texture: "custom-alpha-capable", dynamics: "mapped-dabs", distinctness: "engine-variant" },
  { id: "charcoal", family: "dry-media", engine: "dynamic-dabs", engineVariant: "charcoal", canonicalId: "dry-media", preview: "texture", tip: "bristle", texture: "custom-alpha-capable", dynamics: "mapped-dabs", distinctness: "engine-variant" },
  { id: "pastel", family: "pastel", engine: "dynamic-dabs", engineVariant: "pastel", canonicalId: "pastel", preview: "soft", tip: "sponge", texture: "custom-alpha-capable", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "oil-pastel", family: "pastel", engine: "dynamic-dabs", engineVariant: "oil-pastel", canonicalId: "pastel", preview: "soft", tip: "bristle", texture: "custom-alpha-capable", dynamics: "mapped-dabs", distinctness: "engine-variant" },
  { id: "ink-particle", family: "ink-particle", engine: "dynamic-dabs", engineVariant: "ink-particle", canonicalId: "ink-particle", preview: "dots", tip: "soft-particle", texture: "custom-alpha-capable", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "tangent-normal-brush", family: "ink-particle", engine: "dynamic-dabs", engineVariant: "direction-encoded-ribbon", canonicalId: "tangent-normal-brush", preview: "calligraphy", tip: "hard", texture: "none", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "sketchpad-tile", family: "ink-particle", engine: "dynamic-dabs", engineVariant: "sketchpad-tile-lattice", canonicalId: "sketchpad-tile", preview: "dots", tip: "hard", texture: "procedural-grain", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "sketchpad-mirror", family: "pen", engine: "dynamic-dabs", engineVariant: "sketchpad-mirror-pair", canonicalId: "sketchpad-mirror", preview: "solid", tip: "hard", texture: "none", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "sketchpad-soft-marker", family: "marker", engine: "dynamic-dabs", engineVariant: "sketchpad-soft-envelope", canonicalId: "sketchpad-soft-marker", preview: "soft", tip: "soft-diffuse", texture: "soft-gradient", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "web-multi-agent", family: "ink-particle", engine: "dynamic-dabs", engineVariant: "web-multi-agent-swarm", canonicalId: "web-multi-agent", preview: "dots", tip: "hard", texture: "procedural-grain", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "web-rough-ink", family: "pen", engine: "dynamic-dabs", engineVariant: "web-rough-ink-jitter", canonicalId: "web-rough-ink", preview: "solid", tip: "hard", texture: "procedural-grain", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "web-gravity-drip", family: "ink-particle", engine: "dynamic-dabs", engineVariant: "web-gravity-drip-beads", canonicalId: "web-gravity-drip", preview: "dots", tip: "hard", texture: "procedural-grain", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "web-soft-cloud", family: "airbrush", engine: "dynamic-dabs", engineVariant: "web-soft-cloud-spray", canonicalId: "web-soft-cloud", preview: "soft", tip: "soft-diffuse", texture: "soft-gradient", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "web-calligraphy-ribbon", family: "calligraphy", engine: "dynamic-dabs", engineVariant: "web-calligraphy-chisel", canonicalId: "web-calligraphy-ribbon", preview: "solid", tip: "hard", texture: "none", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "web-dash-stitch", family: "pen", engine: "dynamic-dabs", engineVariant: "web-dash-stitch-pitch", canonicalId: "web-dash-stitch", preview: "dots", tip: "hard", texture: "none", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "web-scatter-stamp", family: "ink-particle", engine: "dynamic-dabs", engineVariant: "web-scatter-stamp-cloud", canonicalId: "web-scatter-stamp", preview: "dots", tip: "hard", texture: "procedural-grain", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "web-rainbow-flow", family: "marker", engine: "dynamic-dabs", engineVariant: "web-rainbow-flow-ribbon", canonicalId: "web-rainbow-flow", preview: "soft", tip: "soft-diffuse", texture: "soft-gradient", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "web-lazy-ink", family: "pen", engine: "dynamic-dabs", engineVariant: "web-lazy-ink-smooth", canonicalId: "web-lazy-ink", preview: "solid", tip: "hard", texture: "none", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "web-hatch-color", family: "pen", engine: "dynamic-dabs", engineVariant: "web-hatch-color-lattice", canonicalId: "web-hatch-color", preview: "solid", tip: "hard", texture: "none", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "web-cel-flat", family: "marker", engine: "dynamic-dabs", engineVariant: "web-cel-flat-block", canonicalId: "web-cel-flat", preview: "solid", tip: "hard", texture: "none", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "web-blend-softener", family: "airbrush", engine: "dynamic-dabs", engineVariant: "web-blend-softener-mist", canonicalId: "web-blend-softener", preview: "soft", tip: "soft-diffuse", texture: "soft-gradient", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "web-dot-tone", family: "screentone", engine: "dynamic-dabs", engineVariant: "web-dot-tone-grid", canonicalId: "web-dot-tone", preview: "dots", tip: "hard", texture: "procedural-grain", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "web-kaleido-ink", family: "ink-particle", engine: "dynamic-dabs", engineVariant: "web-kaleido-ink-fold", canonicalId: "web-kaleido-ink", preview: "dots", tip: "hard", texture: "procedural-grain", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "web-fur-strand", family: "ink-particle", engine: "dynamic-dabs", engineVariant: "web-fur-strand-parallel", canonicalId: "web-fur-strand", preview: "dots", tip: "hard", texture: "procedural-grain", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "web-contour-double", family: "pen", engine: "dynamic-dabs", engineVariant: "web-contour-double-edge", canonicalId: "web-contour-double", preview: "solid", tip: "hard", texture: "none", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "web-radial-burst", family: "ink-particle", engine: "dynamic-dabs", engineVariant: "web-radial-burst-rays", canonicalId: "web-radial-burst", preview: "dots", tip: "hard", texture: "procedural-grain", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "web-mirror-ink", family: "pen", engine: "dynamic-dabs", engineVariant: "web-mirror-ink-axis", canonicalId: "web-mirror-ink", preview: "solid", tip: "hard", texture: "none", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "web-grid-ink", family: "pen", engine: "dynamic-dabs", engineVariant: "web-grid-ink-snap", canonicalId: "web-grid-ink", preview: "solid", tip: "hard", texture: "none", dynamics: "mapped-dabs", distinctness: "unique" },
  { id: "screentone", family: "screentone", engine: "screentone-dots", engineVariant: "global-grid", canonicalId: "screentone", preview: "tone", tip: "tone-dot", texture: "tone-grid", dynamics: "global-grid", distinctness: "unique" },
  { id: "crosshatch", family: "screentone", engine: "screentone-dots", engineVariant: "global-grid", canonicalId: "screentone", preview: "tone", tip: "tone-dot", texture: "tone-grid", dynamics: "global-grid", distinctness: "profile-variant" },
] as const satisfies readonly StudioBrushRuntimeContract[];

export type StudioBrushRuntimePresetId = (typeof STUDIO_BRUSH_RUNTIME_CONTRACT)[number]["id"];

const CONTRACT_BY_ID = new Map<string, StudioBrushRuntimeContract>(
  STUDIO_BRUSH_RUNTIME_CONTRACT.map((contract) => [contract.id, contract])
);

interface StudioBrushEngineVariantCapability {
  readonly families: readonly StudioBrushRenderFamily[];
  readonly previews: readonly StudioBrushPreviewStyle[];
  readonly tip: StudioBrushRuntimeTip;
  readonly texture: StudioBrushRuntimeTexture;
  readonly dynamics: StudioBrushRuntimeDynamics;
}

/**
 * Renderer-owned capability matrix. The catalogue contract is accepted only when every declared
 * engine variant has an implementation-compatible family/tip/texture/dynamics tuple here.
 */
const STUDIO_BRUSH_ENGINE_CAPABILITIES: Readonly<
  Record<StudioBrushRuntimeEngine, Readonly<Record<string, StudioBrushEngineVariantCapability>>>
> = {
  "causal-ink": {
    round: { families: ["pen", "marker"], previews: ["solid"], tip: "round", texture: "none", dynamics: "causal-pressure" },
    "standard-erase": { families: ["pen"], previews: ["solid"], tip: "round", texture: "none", dynamics: "causal-pressure" },
  },
  "stamp-dabs": {
    ink: { families: ["stamp"], previews: ["solid"], tip: "stamp-ink", texture: "none", dynamics: "stamp-pressure-flow" },
    airbrush: { families: ["stamp"], previews: ["soft"], tip: "stamp-airbrush", texture: "soft-gradient", dynamics: "stamp-pressure-flow" },
    pencil: { families: ["stamp"], previews: ["texture"], tip: "stamp-pencil", texture: "procedural-grain", dynamics: "stamp-pressure-flow" },
    watercolor: { families: ["stamp"], previews: ["soft"], tip: "stamp-wet-edge", texture: "wet-edge", dynamics: "stamp-pressure-flow" },
  },
  "calligraphy-segments": {
    "tilt-chisel": { families: ["calligraphy"], previews: ["calligraphy"], tip: "chisel", texture: "none", dynamics: "tilt-pressure" },
  },
  // perfect-freehand 아웃라인 폴리곤(studio-perfect-freehand.ts). 각 variant는 실제
  // getStroke 옵션(thinning/smoothing/taper 프로필)이 다른 별개 실행 시그니처다.
  "perfect-outline": {
    "ink-taper": { families: ["perfect"], previews: ["calligraphy"], tip: "pressure-round", texture: "none", dynamics: "outline-pressure" },
    "marker-flat": { families: ["perfect"], previews: ["solid"], tip: "round", texture: "none", dynamics: "outline-pressure" },
    "gpen-taper": { families: ["gpen"], previews: ["calligraphy"], tip: "pressure-round", texture: "none", dynamics: "outline-pressure" },
  },
  "highlighter-path": {
    "one-wash-round": { families: ["highlighter"], previews: ["solid"], tip: "round", texture: "none", dynamics: "ribbon-pressure" },
    "one-wash-soft-flat": { families: ["highlighter"], previews: ["solid"], tip: "chisel", texture: "none", dynamics: "ribbon-pressure" },
    "one-wash-pastel": { families: ["highlighter"], previews: ["solid"], tip: "grain", texture: "procedural-grain", dynamics: "ribbon-pressure" },
  },
  "neon-halo": {
    "bright-core": { families: ["neon"], previews: ["neon"], tip: "round", texture: "soft-gradient", dynamics: "fixed-path" },
  },
  "glow-halo": {
    standard: { families: ["glow"], previews: ["glow"], tip: "soft-diffuse", texture: "soft-gradient", dynamics: "fixed-path" },
    soft: { families: ["glow"], previews: ["glow"], tip: "soft-diffuse", texture: "soft-gradient", dynamics: "fixed-path" },
  },
  "particle-scatter": {
    glitter: { families: ["glitter"], previews: ["glitter"], tip: "spark", texture: "procedural-spark", dynamics: "seeded-particles" },
    "star-dust": { families: ["glitter"], previews: ["glitter"], tip: "spark", texture: "procedural-spark", dynamics: "seeded-particles" },
  },
  "angled-ribbon": {
    "minus-30deg": { families: ["brush"], previews: ["wavy"], tip: "angled-ribbon", texture: "none", dynamics: "ribbon-pressure" },
  },
  "watercolor-dabs": {
    diffuse: { families: ["watercolor"], previews: ["soft"], tip: "soft-diffuse", texture: "wet-edge", dynamics: "watercolor-pressure" },
  },
  "oil-ribbon": {
    "bristle-lanes": { families: ["oil"], previews: ["oil"], tip: "bristle", texture: "procedural-bristle", dynamics: "bristle-pressure" },
  },
  "dynamic-dabs": {
    airbrush: { families: ["airbrush"], previews: ["soft"], tip: "soft-particle", texture: "custom-alpha-capable", dynamics: "mapped-dabs" },
    "soft-brush": { families: ["airbrush"], previews: ["soft"], tip: "round", texture: "custom-alpha-capable", dynamics: "mapped-dabs" },
    spray: { families: ["airbrush"], previews: ["dots"], tip: "flake", texture: "custom-alpha-capable", dynamics: "mapped-dabs" },
    splatter: { families: ["airbrush"], previews: ["dots"], tip: "flake", texture: "custom-alpha-capable", dynamics: "mapped-dabs" },
    "dry-media": { families: ["dry-media"], previews: ["texture"], tip: "grain", texture: "custom-alpha-capable", dynamics: "mapped-dabs" },
    crayon: { families: ["dry-media"], previews: ["texture"], tip: "hard", texture: "custom-alpha-capable", dynamics: "mapped-dabs" },
    chalk: { families: ["dry-media"], previews: ["texture"], tip: "sponge", texture: "custom-alpha-capable", dynamics: "mapped-dabs" },
    charcoal: { families: ["dry-media"], previews: ["texture"], tip: "bristle", texture: "custom-alpha-capable", dynamics: "mapped-dabs" },
    pastel: { families: ["pastel"], previews: ["soft"], tip: "sponge", texture: "custom-alpha-capable", dynamics: "mapped-dabs" },
    "oil-pastel": { families: ["pastel"], previews: ["soft"], tip: "bristle", texture: "custom-alpha-capable", dynamics: "mapped-dabs" },
    "ink-particle": { families: ["ink-particle"], previews: ["dots"], tip: "soft-particle", texture: "custom-alpha-capable", dynamics: "mapped-dabs" },
    "connected-hard-envelope": { families: ["airbrush"], previews: ["solid"], tip: "hard", texture: "none", dynamics: "mapped-dabs" },
    "progressive-wear-ribbon": { families: ["pencil"], previews: ["texture"], tip: "grain", texture: "procedural-grain", dynamics: "mapped-dabs" },
    "extruded-bead-ribbon": { families: ["oil"], previews: ["oil"], tip: "hard", texture: "procedural-bristle", dynamics: "mapped-dabs" },
    "direction-encoded-ribbon": { families: ["ink-particle"], previews: ["calligraphy"], tip: "hard", texture: "none", dynamics: "mapped-dabs" },
    "sketchpad-tile-lattice": { families: ["ink-particle"], previews: ["dots"], tip: "hard", texture: "procedural-grain", dynamics: "mapped-dabs" },
    "sketchpad-mirror-pair": { families: ["pen"], previews: ["solid"], tip: "hard", texture: "none", dynamics: "mapped-dabs" },
    "sketchpad-soft-envelope": { families: ["marker"], previews: ["soft"], tip: "soft-diffuse", texture: "soft-gradient", dynamics: "mapped-dabs" },
    "web-multi-agent-swarm": { families: ["ink-particle"], previews: ["dots"], tip: "hard", texture: "procedural-grain", dynamics: "mapped-dabs" },
    "web-rough-ink-jitter": { families: ["pen"], previews: ["solid"], tip: "hard", texture: "procedural-grain", dynamics: "mapped-dabs" },
    "web-gravity-drip-beads": { families: ["ink-particle"], previews: ["dots"], tip: "hard", texture: "procedural-grain", dynamics: "mapped-dabs" },
    "web-soft-cloud-spray": { families: ["airbrush"], previews: ["soft"], tip: "soft-diffuse", texture: "soft-gradient", dynamics: "mapped-dabs" },
    "web-calligraphy-chisel": { families: ["calligraphy"], previews: ["solid"], tip: "hard", texture: "none", dynamics: "mapped-dabs" },
    "web-dash-stitch-pitch": { families: ["pen"], previews: ["dots"], tip: "hard", texture: "none", dynamics: "mapped-dabs" },
    "web-scatter-stamp-cloud": { families: ["ink-particle"], previews: ["dots"], tip: "hard", texture: "procedural-grain", dynamics: "mapped-dabs" },
    "web-rainbow-flow-ribbon": { families: ["marker"], previews: ["soft"], tip: "soft-diffuse", texture: "soft-gradient", dynamics: "mapped-dabs" },
    "web-lazy-ink-smooth": { families: ["pen"], previews: ["solid"], tip: "hard", texture: "none", dynamics: "mapped-dabs" },
    "web-hatch-color-lattice": { families: ["pen"], previews: ["solid"], tip: "hard", texture: "none", dynamics: "mapped-dabs" },
    "web-cel-flat-block": { families: ["marker"], previews: ["solid"], tip: "hard", texture: "none", dynamics: "mapped-dabs" },
    "web-blend-softener-mist": { families: ["airbrush"], previews: ["soft"], tip: "soft-diffuse", texture: "soft-gradient", dynamics: "mapped-dabs" },
    "web-dot-tone-grid": { families: ["screentone"], previews: ["dots"], tip: "hard", texture: "procedural-grain", dynamics: "mapped-dabs" },
    "web-kaleido-ink-fold": { families: ["ink-particle"], previews: ["dots"], tip: "hard", texture: "procedural-grain", dynamics: "mapped-dabs" },
    "web-fur-strand-parallel": { families: ["ink-particle"], previews: ["dots"], tip: "hard", texture: "procedural-grain", dynamics: "mapped-dabs" },
    "web-contour-double-edge": { families: ["pen"], previews: ["solid"], tip: "hard", texture: "none", dynamics: "mapped-dabs" },
    "web-radial-burst-rays": { families: ["ink-particle"], previews: ["dots"], tip: "hard", texture: "procedural-grain", dynamics: "mapped-dabs" },
    "web-mirror-ink-axis": { families: ["pen"], previews: ["solid"], tip: "hard", texture: "none", dynamics: "mapped-dabs" },
    "web-grid-ink-snap": { families: ["pen"], previews: ["solid"], tip: "hard", texture: "none", dynamics: "mapped-dabs" },
  },
  "pencil-path": {
    jitter: { families: ["pencil"], previews: ["dashed"], tip: "grain", texture: "procedural-grain", dynamics: "grain-jitter" },
  },
  "pastel-dabs": {
    "soft-grain": { families: ["pastel"], previews: ["soft"], tip: "grain", texture: "procedural-grain", dynamics: "pastel-pressure" },
  },
  "screentone-dots": {
    "global-grid": { families: ["screentone"], previews: ["tone"], tip: "tone-dot", texture: "tone-grid", dynamics: "global-grid" },
  },
};

export function resolveStudioBrushRuntimeContract(
  brushId: unknown
): StudioBrushRuntimeContract | null {
  return typeof brushId === "string" ? CONTRACT_BY_ID.get(brushId) ?? null : null;
}

/** Exact normalized renderer footprint; catalogue defaults are deliberately excluded. */
export function studioBrushRuntimeExecutionSignature(
  contract: Pick<
    StudioBrushRuntimeContract,
    "engine" | "engineVariant" | "tip" | "texture" | "dynamics" | "operation"
  >
): string {
  return [
    contract.engine,
    contract.engineVariant,
    contract.tip,
    contract.texture,
    contract.dynamics,
    contract.operation ?? "paint",
  ].join(":");
}

export type StudioBrushRuntimeAuditIssueCode =
  | "duplicate-preset-id"
  | "duplicate-contract-id"
  | "missing-runtime-contract"
  | "orphan-runtime-contract"
  | "operation-mismatch"
  | "invalid-preset-defaults"
  | "unsupported-engine-variant"
  | "incompatible-engine-combination"
  | "unknown-canonical-id"
  | "invalid-canonical-relation"
  | "ambiguous-execution-signature";

export interface StudioBrushRuntimeAuditIssue {
  readonly code: StudioBrushRuntimeAuditIssueCode;
  readonly brushId: string;
  readonly message: string;
}

export interface StudioBrushRuntimeCatalogAudit {
  readonly ok: boolean;
  readonly presetCount: number;
  readonly contractCount: number;
  readonly issues: readonly StudioBrushRuntimeAuditIssue[];
}

function auditIssue(
  code: StudioBrushRuntimeAuditIssueCode,
  brushId: string,
  message: string
): StudioBrushRuntimeAuditIssue {
  return { code, brushId, message };
}

/** Pure, injectable audit used by CI as well as the module-load fail-fast guard. */
export function auditStudioBrushRuntimeCatalog(
  presets: readonly BrushPreset[] = BRUSH_PRESETS,
  contracts: readonly StudioBrushRuntimeContract[] = STUDIO_BRUSH_RUNTIME_CONTRACT
): StudioBrushRuntimeCatalogAudit {
  const issues: StudioBrushRuntimeAuditIssue[] = [];
  const presetIds = new Set<string>();
  const contractIds = new Set<string>();
  const contractById = new Map<string, StudioBrushRuntimeContract>();
  const canonicalBySignature = new Map<string, string>();

  for (const preset of presets) {
    if (presetIds.has(preset.id)) {
      issues.push(auditIssue("duplicate-preset-id", preset.id, "catalogue id is duplicated"));
    }
    presetIds.add(preset.id);
    if (
      !preset.id
      || !preset.name
      || !Number.isFinite(preset.defaultWidth)
      || preset.defaultWidth <= 0
      || !Number.isFinite(preset.defaultOpacity)
      || preset.defaultOpacity <= 0
      || preset.defaultOpacity > 1
    ) {
      issues.push(auditIssue("invalid-preset-defaults", preset.id, "catalogue defaults cannot produce a visible stroke"));
    }
  }

  for (const contract of contracts) {
    if (contractIds.has(contract.id)) {
      issues.push(auditIssue("duplicate-contract-id", contract.id, "runtime contract id is duplicated"));
    }
    contractIds.add(contract.id);
    contractById.set(contract.id, contract);
    const capability = STUDIO_BRUSH_ENGINE_CAPABILITIES[contract.engine]?.[contract.engineVariant];
    if (!capability) {
      issues.push(auditIssue(
        "unsupported-engine-variant",
        contract.id,
        `${contract.engine}:${contract.engineVariant} has no renderer capability`
      ));
      continue;
    }
    const operationCompatible =
      (contract.operation ?? "paint") === "paint"
      || contract.engine === "causal-ink";
    const compatible = operationCompatible
      && capability.families.includes(contract.family)
      && capability.previews.includes(contract.preview)
      && capability.tip === contract.tip
      && capability.texture === contract.texture
      && capability.dynamics === contract.dynamics;
    if (!compatible) {
      issues.push(auditIssue(
        "incompatible-engine-combination",
        contract.id,
        `${contract.engine}:${contract.engineVariant} cannot consume the declared family/tip/texture/dynamics tuple`
      ));
    }
  }

  for (const presetId of presetIds) {
    if (!contractIds.has(presetId)) {
      issues.push(auditIssue("missing-runtime-contract", presetId, "catalogue preset has no renderer contract"));
    }
  }
  for (const preset of presets) {
    const contract = contractById.get(preset.id);
    if (contract && (contract.operation ?? "paint") !== preset.operation) {
      issues.push(auditIssue(
        "operation-mismatch",
        preset.id,
        `catalogue operation ${preset.operation} does not match runtime operation ${contract.operation ?? "paint"}`
      ));
    }
  }
  for (const contractId of contractIds) {
    if (!presetIds.has(contractId)) {
      issues.push(auditIssue("orphan-runtime-contract", contractId, "renderer contract is not selectable in the catalogue"));
    }
  }

  for (const contract of contracts) {
    const canonical = contractById.get(contract.canonicalId);
    if (!canonical) {
      issues.push(auditIssue("unknown-canonical-id", contract.id, `canonical ${contract.canonicalId} does not exist`));
      continue;
    }
    const signature = studioBrushRuntimeExecutionSignature(contract);
    const canonicalSignature = studioBrushRuntimeExecutionSignature(canonical);
    const canonicalRelationIsValid = contract.distinctness === "unique"
      ? contract.canonicalId === contract.id
      : contract.distinctness === "profile-variant"
        ? contract.canonicalId !== contract.id && canonicalSignature === signature
        : contract.canonicalId !== contract.id
          && canonical.engine === contract.engine
          && canonicalSignature !== signature;
    if (!canonicalRelationIsValid) {
      issues.push(auditIssue(
        "invalid-canonical-relation",
        contract.id,
        `${contract.distinctness} does not match canonical ${contract.canonicalId}`
      ));
    }
    const declaredCanonical = canonicalBySignature.get(signature);
    if (declaredCanonical && declaredCanonical !== contract.canonicalId) {
      issues.push(auditIssue(
        "ambiguous-execution-signature",
        contract.id,
        `execution signature already belongs to canonical ${declaredCanonical}`
      ));
    } else if (!declaredCanonical) {
      canonicalBySignature.set(signature, contract.canonicalId);
    }
  }

  return {
    ok: issues.length === 0,
    presetCount: presets.length,
    contractCount: contracts.length,
    issues,
  };
}

export const STUDIO_BRUSH_RUNTIME_CATALOG_AUDIT = auditStudioBrushRuntimeCatalog();

if (!STUDIO_BRUSH_RUNTIME_CATALOG_AUDIT.ok) {
  const summary = STUDIO_BRUSH_RUNTIME_CATALOG_AUDIT.issues
    .map((issue) => `${issue.brushId}[${issue.code}]`)
    .join(", ");
  throw new Error(`Invalid Studio brush runtime catalogue: ${summary}`);
}

export const STUDIO_BRUSH_SAFE_FALLBACK_ID = "pen" as const;

export interface StudioBrushRuntimeResolution {
  readonly status: "exact" | "safe-fallback";
  readonly requestedId: string | null;
  readonly resolvedId: StudioBrushRuntimePresetId;
  readonly contract: StudioBrushRuntimeContract;
  readonly reason: "supported" | "missing-id" | "unsupported-id";
}

/**
 * User-authored/imported brush references never enter a silent no-op route. Unknown ids converge
 * to the documented pen renderer while preserving the requested id in the diagnostic result.
 */
export function resolveStudioBrushRuntime(
  brushId: unknown
): StudioBrushRuntimeResolution {
  const requestedId = typeof brushId === "string" && brushId.length > 0 ? brushId : null;
  const exact = requestedId ? CONTRACT_BY_ID.get(requestedId) : undefined;
  if (exact) {
    return {
      status: "exact",
      requestedId,
      resolvedId: exact.id as StudioBrushRuntimePresetId,
      contract: exact,
      reason: "supported",
    };
  }
  const fallback = CONTRACT_BY_ID.get(STUDIO_BRUSH_SAFE_FALLBACK_ID);
  if (!fallback) {
    throw new Error(`Studio brush safe fallback ${STUDIO_BRUSH_SAFE_FALLBACK_ID} is unavailable`);
  }
  return {
    status: "safe-fallback",
    requestedId,
    resolvedId: STUDIO_BRUSH_SAFE_FALLBACK_ID,
    contract: fallback,
    reason: requestedId ? "unsupported-id" : "missing-id",
  };
}

export interface StudioBrushUserPresetRuntimeInspection {
  readonly resolution: StudioBrushRuntimeResolution;
  readonly stampTuning: "active" | "inactive";
  readonly brushDynamics: "active" | "preserved-inactive";
  readonly customTipTexture: "supported" | "unsupported";
}

/** Capability report shared by import/storage tests and future brush marketplace validation. */
export function inspectStudioBrushUserPresetRuntime(
  input: { readonly brushId?: unknown }
): StudioBrushUserPresetRuntimeInspection {
  const resolution = resolveStudioBrushRuntime(input.brushId);
  return {
    resolution,
    stampTuning: resolution.contract.engine === "stamp-dabs" ? "active" : "inactive",
    brushDynamics: resolution.contract.engine === "dynamic-dabs" ? "active" : "preserved-inactive",
    customTipTexture: resolution.contract.texture === "custom-alpha-capable"
      ? "supported"
      : "unsupported",
  };
}

export type StudioBrushSinglePointRoute = StudioBrushRuntimeEngine | "generic-dot";

export interface StudioBrushSinglePointRouteInput {
  brushId: unknown;
  mode?: unknown;
  /** New pen/marker strokes with sample spacing or a pressure model use causal round dabs. */
  causalInkEnabled?: boolean;
}

/**
 * Decide the renderer for the smallest valid gesture (one `[x,y]` point).
 *
 * Several path engines need at least one segment, so their tap footprint is an intentional generic
 * dot. Dab/particle/FX engines can render a real one-point plan and must never be intercepted by
 * that fallback. Keeping this decision pure prevents Canvas, SVG and future WebGPU playback from
 * disagreeing specifically on fast press/release gestures.
 */
export function resolveStudioBrushSinglePointRoute({
  brushId,
  mode = "pen",
  causalInkEnabled = false,
}: StudioBrushSinglePointRouteInput): StudioBrushSinglePointRoute {
  if (mode === "eraser") return "generic-dot";
  const contract = resolveStudioBrushRuntimeContract(brushId);
  if (!contract) return "generic-dot";

  switch (contract.engine) {
    case "causal-ink":
      return causalInkEnabled ? "causal-ink" : "generic-dot";
    // perfect-outline 도 최소 한 세그먼트가 필요하다(테이퍼가 탭을 지워버리는 것 방지).
    case "calligraphy-segments":
    case "perfect-outline":
    case "highlighter-path":
    case "angled-ribbon":
    case "pencil-path":
      return "generic-dot";
    default:
      return contract.engine;
  }
}
