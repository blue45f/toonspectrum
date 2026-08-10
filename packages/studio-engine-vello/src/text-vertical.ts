import { pathIRSchema } from "@toonspectrum/studio-project-model";
import { z } from "zod";

import { shape_text_vertical_json } from "../../../crates/studio-engine-vello/pkg/studio_engine_vello.js";

import { assertVelloInitialized } from "./render";

/**
 * Vertical writing (세로쓰기) extension of the Parley text lane — V12 gate
 * matrix Text row, webtoon CJK vertical dialogue/sound-effect workload.
 *
 * Parley has no native vertical mode, so the crate performs manual vertical
 * composition: upright CJK cells stack top→bottom (advance from vhea/vmtx
 * when present, deterministic 1em fallback otherwise), Latin and long digit
 * runs are rotated 90° clockwise with the rotation baked into PathIR, and columns
 * wrap right→left at `maxHeightPx`. Nothing is dropped silently — coverage
 * gaps and geometric punctuation fallbacks surface through `warnings`. Upright
 * cells use the pinned HarfRust shaper directly in top-to-bottom direction with
 * OpenType `vert`/`vrt2`; Skrifa outlines the selected glyph ids into PathIR.
 * One-to-four ASCII digit runs use tate-chu-yoko
 * (縦中横): horizontal glyphs fitted into one vertical cell without rotation.
 */

export const verticalShapedGlyphSchema = z.object({
  id: z.number().int().nonnegative(),
  x: z.number(),
  y: z.number(),
  column: z.number().int().nonnegative(),
  rotated: z.boolean(),
  tateChuYoko: z.boolean(),
  /** Additive/default-compatible with vertical JSON produced before V12. */
  verticalAlternate: z.boolean().default(false),
  verticalFallback: z.enum(["rotate", "offset", "upright-center"]).nullable().default(null),
  path: pathIRSchema,
});
export type VerticalShapedGlyph = z.infer<typeof verticalShapedGlyphSchema>;

export const verticalColumnSchema = z.object({
  index: z.number().int().nonnegative(),
  x: z.number(),
  height: z.number().nonnegative(),
});
export type VerticalColumn = z.infer<typeof verticalColumnSchema>;

export const verticalMetricsSourceSchema = z.enum(["vmtx", "fallback-1em"]);
export type VerticalMetricsSource = z.infer<typeof verticalMetricsSourceSchema>;

export const verticalFeatureEvidenceSchema = z.object({
  requested: z.tuple([z.literal("vert"), z.literal("vrt2")]),
  fontHasVert: z.boolean(),
  fontHasVrt2: z.boolean(),
  application: z.enum(["applied", "available-no-substitution", "absent-in-font"]),
  appliedGlyphs: z.number().int().nonnegative(),
  geometricFallbackGlyphs: z.number().int().nonnegative(),
  strategy: z.enum([
    "opentype-vert-vrt2",
    "mixed",
    "geometric-fallback",
    "not-applicable",
  ]),
}).default({
  requested: ["vert", "vrt2"],
  fontHasVert: false,
  fontHasVrt2: false,
  application: "absent-in-font",
  appliedGlyphs: 0,
  geometricFallbackGlyphs: 0,
  strategy: "not-applicable",
});
export type VerticalFeatureEvidence = z.infer<typeof verticalFeatureEvidenceSchema>;

export const verticalShapedTextSchema = z.object({
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  columnCount: z.number().int().positive(),
  columnAdvance: z.number().positive(),
  verticalMetricsSource: verticalMetricsSourceSchema,
  verticalFeatures: verticalFeatureEvidenceSchema,
  glyphs: z.array(verticalShapedGlyphSchema),
  columns: z.array(verticalColumnSchema),
  warnings: z.array(z.string()),
});
export type VerticalShapedText = z.infer<typeof verticalShapedTextSchema>;

export interface ShapeTextVerticalOptions {
  fontSizePx: number;
  maxHeightPx: number;
}

export function shapeTextVerticalToGlyphPaths(
  text: string,
  fontBytes: Uint8Array,
  options: ShapeTextVerticalOptions,
): VerticalShapedText {
  assertVelloInitialized();
  const json = shape_text_vertical_json(
    text,
    fontBytes,
    options.fontSizePx,
    options.maxHeightPx,
  );
  return verticalShapedTextSchema.parse(JSON.parse(json));
}
