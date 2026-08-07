import { pathIRSchema } from "@toonspectrum/studio-project-model";
import { z } from "zod";

import { shape_text_json } from "../../../crates/studio-engine-vello/pkg/studio_engine_vello.js";

import { assertVelloInitialized } from "./render";

/**
 * Parley text lane (matrix E07 PoC): shaping + line breaking + glyph outline
 * extraction in the wasm crate, surfaced as renderer-neutral PathIR glyphs.
 * CanvasKit Paragraph remains the production baseline until this lane passes
 * its CJK/vertical-writing gates (see docs/candidates/text-layout).
 */

export const shapedGlyphSchema = z.object({
  id: z.number().int().nonnegative(),
  x: z.number(),
  y: z.number(),
  path: pathIRSchema,
});
export type ShapedGlyph = z.infer<typeof shapedGlyphSchema>;

export const shapedTextSchema = z.object({
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  lineCount: z.number().int().positive(),
  glyphs: z.array(shapedGlyphSchema),
});
export type ShapedText = z.infer<typeof shapedTextSchema>;

export interface ShapeTextOptions {
  fontSizePx: number;
  maxWidthPx: number;
}

export function shapeTextToGlyphPaths(
  text: string,
  fontBytes: Uint8Array,
  options: ShapeTextOptions,
): ShapedText {
  assertVelloInitialized();
  const json = shape_text_json(
    text,
    fontBytes,
    options.fontSizePx,
    options.maxWidthPx,
  );
  return shapedTextSchema.parse(JSON.parse(json));
}
