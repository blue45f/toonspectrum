import { z } from "zod";

/**
 * ColorIR / PaintIR — stable style layer of the V11 IR (matrix E06).
 *
 * Colors are stored as premultiplication-free sRGB components in [0, 1].
 * Engine-specific color objects (SkColor, peniko::Color, …) are caches and are
 * never persisted; adapters convert at the island boundary.
 */

export const colorIRSchema = z.object({
  r: z.number().min(0).max(1),
  g: z.number().min(0).max(1),
  b: z.number().min(0).max(1),
  a: z.number().min(0).max(1),
});
export type ColorIR = z.infer<typeof colorIRSchema>;

/**
 * Blend modes restricted to the intersection every registered
 * VectorRendererProvider supports bit-comparably. Widening this union requires
 * a cross-renderer diff corpus entry per new mode.
 */
export const blendModeIRSchema = z.enum([
  "src-over",
  "multiply",
  "screen",
  "darken",
  "lighten",
]);
export type BlendModeIR = z.infer<typeof blendModeIRSchema>;

export const gradientStopIRSchema = z.object({
  offset: z.number().min(0).max(1),
  color: colorIRSchema,
});
export type GradientStopIR = z.infer<typeof gradientStopIRSchema>;

export const paintIRSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("solid"), color: colorIRSchema }),
  z.object({
    kind: z.literal("linear-gradient"),
    from: z.tuple([z.number(), z.number()]),
    to: z.tuple([z.number(), z.number()]),
    stops: z.array(gradientStopIRSchema).min(2),
  }),
  z.object({
    kind: z.literal("radial-gradient"),
    center: z.tuple([z.number(), z.number()]),
    radius: z.number().positive(),
    stops: z.array(gradientStopIRSchema).min(2),
  }),
]);
export type PaintIR = z.infer<typeof paintIRSchema>;

export function solidPaint(r: number, g: number, b: number, a = 1): PaintIR {
  return { kind: "solid", color: { r, g, b, a } };
}

/** 8-bit channel tuple used by raster adapters when uploading IR colors. */
export function colorToRgba8(color: ColorIR): [number, number, number, number] {
  const to8 = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 255);
  return [to8(color.r), to8(color.g), to8(color.b), to8(color.a)];
}
