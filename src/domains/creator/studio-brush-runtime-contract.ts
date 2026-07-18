/**
 * Brush catalogue -> renderer contract.
 *
 * A commercial brush shelf cannot treat a label as the implementation.  Every preset below
 * declares the concrete playback/export engine it uses, its engine variant, preview language and
 * tip footprint.  `canonicalId` makes intentional parameter-only aliases explicit so a new brush
 * cannot silently become a duplicate of an existing one.
 *
 * Keep this table explicit rather than generating it from the family map: reviewers should be able
 * to audit all 35 promises in one place and tests can compare the declaration with the real engine
 * resolvers used by Canvas and SVG.
 */

import type { StudioBrushRenderFamily } from "./studio-brush";
import type { StudioBrushPreviewStyle } from "./studio-brush-visual";

export type StudioBrushRuntimeEngine =
  | "causal-ink"
  | "pressure-segments"
  | "stamp-dabs"
  | "calligraphy-segments"
  | "highlighter-path"
  | "neon-halo"
  | "glow-halo"
  | "particle-scatter"
  | "angled-ribbon"
  | "watercolor-dabs"
  | "oil-dabs"
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
  | "bristle"
  | "grain"
  | "spark"
  | "tone-dot"
  | "stamp-ink"
  | "stamp-airbrush"
  | "stamp-pencil"
  | "stamp-wet-edge";

/**
 * unique: this is the canonical implementation for its exact execution signature.
 * parameter-variant: same normalized renderer as canonicalId; catalogue defaults create the feel.
 * engine-variant: shares an engine with canonicalId but switches a real runtime algorithm option.
 */
export type StudioBrushRuntimeDistinctness =
  | "unique"
  | "parameter-variant"
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
  distinctness: StudioBrushRuntimeDistinctness;
}

export const STUDIO_BRUSH_RUNTIME_CONTRACT = [
  { id: "pen", family: "pen", engine: "causal-ink", engineVariant: "round", canonicalId: "pen", preview: "solid", tip: "round", distinctness: "unique" },
  { id: "fineliner", family: "pen", engine: "causal-ink", engineVariant: "round", canonicalId: "pen", preview: "solid", tip: "round", distinctness: "parameter-variant" },
  { id: "ballpoint", family: "pen", engine: "causal-ink", engineVariant: "round", canonicalId: "pen", preview: "solid", tip: "round", distinctness: "parameter-variant" },
  { id: "gpen", family: "gpen", engine: "pressure-segments", engineVariant: "round", canonicalId: "gpen", preview: "calligraphy", tip: "pressure-round", distinctness: "unique" },
  { id: "liner", family: "gpen", engine: "pressure-segments", engineVariant: "round", canonicalId: "gpen", preview: "calligraphy", tip: "pressure-round", distinctness: "parameter-variant" },
  { id: "ink-brush", family: "stamp", engine: "stamp-dabs", engineVariant: "ink", canonicalId: "ink-brush", preview: "solid", tip: "stamp-ink", distinctness: "unique" },
  { id: "calligraphy", family: "calligraphy", engine: "calligraphy-segments", engineVariant: "tilt-chisel", canonicalId: "calligraphy", preview: "calligraphy", tip: "chisel", distinctness: "unique" },
  { id: "marker", family: "marker", engine: "causal-ink", engineVariant: "round", canonicalId: "pen", preview: "solid", tip: "round", distinctness: "parameter-variant" },
  { id: "felt-tip", family: "marker", engine: "causal-ink", engineVariant: "round", canonicalId: "pen", preview: "solid", tip: "round", distinctness: "parameter-variant" },
  { id: "marker-bold", family: "marker", engine: "causal-ink", engineVariant: "round", canonicalId: "pen", preview: "solid", tip: "round", distinctness: "parameter-variant" },
  { id: "highlighter", family: "highlighter", engine: "highlighter-path", engineVariant: "multiply-square", canonicalId: "highlighter", preview: "solid", tip: "square", distinctness: "unique" },
  { id: "neon", family: "neon", engine: "neon-halo", engineVariant: "bright-core", canonicalId: "neon", preview: "neon", tip: "round", distinctness: "unique" },
  { id: "glow", family: "glow", engine: "glow-halo", engineVariant: "standard", canonicalId: "glow", preview: "glow", tip: "soft-diffuse", distinctness: "unique" },
  { id: "soft-glow", family: "glow", engine: "glow-halo", engineVariant: "soft", canonicalId: "glow", preview: "glow", tip: "soft-diffuse", distinctness: "engine-variant" },
  { id: "glitter", family: "glitter", engine: "particle-scatter", engineVariant: "glitter", canonicalId: "glitter", preview: "glitter", tip: "spark", distinctness: "unique" },
  { id: "star-dust", family: "glitter", engine: "particle-scatter", engineVariant: "star-dust", canonicalId: "glitter", preview: "glitter", tip: "spark", distinctness: "engine-variant" },
  { id: "brush", family: "brush", engine: "angled-ribbon", engineVariant: "minus-30deg", canonicalId: "brush", preview: "wavy", tip: "angled-ribbon", distinctness: "unique" },
  { id: "watercolor", family: "watercolor", engine: "watercolor-dabs", engineVariant: "diffuse", canonicalId: "watercolor", preview: "soft", tip: "soft-diffuse", distinctness: "unique" },
  { id: "ink-wash", family: "watercolor", engine: "watercolor-dabs", engineVariant: "diffuse", canonicalId: "watercolor", preview: "soft", tip: "soft-diffuse", distinctness: "parameter-variant" },
  { id: "oil", family: "oil", engine: "oil-dabs", engineVariant: "bristle", canonicalId: "oil", preview: "oil", tip: "bristle", distinctness: "unique" },
  { id: "airbrush", family: "airbrush", engine: "dynamic-dabs", engineVariant: "airbrush", canonicalId: "airbrush", preview: "soft", tip: "soft-particle", distinctness: "unique" },
  { id: "airbrush-fine", family: "stamp", engine: "stamp-dabs", engineVariant: "airbrush", canonicalId: "airbrush-fine", preview: "soft", tip: "stamp-airbrush", distinctness: "unique" },
  { id: "wash-brush", family: "stamp", engine: "stamp-dabs", engineVariant: "watercolor", canonicalId: "wash-brush", preview: "soft", tip: "stamp-wet-edge", distinctness: "unique" },
  { id: "soft-brush", family: "airbrush", engine: "dynamic-dabs", engineVariant: "airbrush", canonicalId: "airbrush", preview: "soft", tip: "soft-particle", distinctness: "parameter-variant" },
  { id: "spray", family: "airbrush", engine: "dynamic-dabs", engineVariant: "airbrush", canonicalId: "airbrush", preview: "soft", tip: "soft-particle", distinctness: "parameter-variant" },
  { id: "pencil", family: "pencil", engine: "pencil-path", engineVariant: "jitter", canonicalId: "pencil", preview: "dashed", tip: "grain", distinctness: "unique" },
  { id: "soft-pencil", family: "pencil", engine: "pencil-path", engineVariant: "jitter", canonicalId: "pencil", preview: "dashed", tip: "grain", distinctness: "parameter-variant" },
  { id: "pencil-grain", family: "stamp", engine: "stamp-dabs", engineVariant: "pencil", canonicalId: "pencil-grain", preview: "texture", tip: "stamp-pencil", distinctness: "unique" },
  { id: "dry-media", family: "dry-media", engine: "dynamic-dabs", engineVariant: "dry-media", canonicalId: "dry-media", preview: "texture", tip: "grain", distinctness: "unique" },
  { id: "crayon", family: "dry-media", engine: "dynamic-dabs", engineVariant: "dry-media", canonicalId: "dry-media", preview: "texture", tip: "grain", distinctness: "parameter-variant" },
  { id: "chalk", family: "dry-media", engine: "dynamic-dabs", engineVariant: "dry-media", canonicalId: "dry-media", preview: "texture", tip: "grain", distinctness: "parameter-variant" },
  { id: "charcoal", family: "dry-media", engine: "dynamic-dabs", engineVariant: "dry-media", canonicalId: "dry-media", preview: "texture", tip: "grain", distinctness: "parameter-variant" },
  { id: "pastel", family: "pastel", engine: "pastel-dabs", engineVariant: "soft-grain", canonicalId: "pastel", preview: "soft", tip: "grain", distinctness: "unique" },
  { id: "ink-particle", family: "ink-particle", engine: "dynamic-dabs", engineVariant: "ink-particle", canonicalId: "ink-particle", preview: "dots", tip: "soft-particle", distinctness: "unique" },
  { id: "screentone", family: "screentone", engine: "screentone-dots", engineVariant: "global-grid", canonicalId: "screentone", preview: "tone", tip: "tone-dot", distinctness: "unique" },
] as const satisfies readonly StudioBrushRuntimeContract[];

export type StudioBrushRuntimePresetId = (typeof STUDIO_BRUSH_RUNTIME_CONTRACT)[number]["id"];

const CONTRACT_BY_ID = new Map<string, StudioBrushRuntimeContract>(
  STUDIO_BRUSH_RUNTIME_CONTRACT.map((contract) => [contract.id, contract])
);

export function resolveStudioBrushRuntimeContract(
  brushId: unknown
): StudioBrushRuntimeContract | null {
  return typeof brushId === "string" ? CONTRACT_BY_ID.get(brushId) ?? null : null;
}

/** Exact normalized renderer footprint; catalogue defaults are deliberately excluded. */
export function studioBrushRuntimeExecutionSignature(
  contract: Pick<StudioBrushRuntimeContract, "engine" | "engineVariant" | "tip">
): string {
  return `${contract.engine}:${contract.engineVariant}:${contract.tip}`;
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
    case "pressure-segments":
    case "calligraphy-segments":
    case "highlighter-path":
    case "angled-ribbon":
    case "pencil-path":
      return "generic-dot";
    default:
      return contract.engine;
  }
}
