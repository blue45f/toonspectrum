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
 * when present, deterministic 1em fallback otherwise), Latin/digit runs are
 * rotated 90° clockwise with the rotation baked into PathIR, and columns
 * wrap right→left at `maxHeightPx`. Nothing is dropped silently — coverage
 * gaps, missing vertical punctuation forms, metric fallbacks and the
 * tate-chu-yoko v2 gap all surface through `warnings`.
 */

export const verticalShapedGlyphSchema = z.object({
  id: z.number().int().nonnegative(),
  x: z.number(),
  y: z.number(),
  column: z.number().int().nonnegative(),
  rotated: z.boolean(),
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

export const verticalShapedTextSchema = z.object({
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  columnCount: z.number().int().positive(),
  columnAdvance: z.number().positive(),
  verticalMetricsSource: verticalMetricsSourceSchema,
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
