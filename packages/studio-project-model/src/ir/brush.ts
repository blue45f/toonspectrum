import { z } from "zod";

/**
 * BrushProgramIR — the engine-neutral brush program (V11 §6.1).
 *
 * Presets are unlimited; every preset compiles into this structure and a
 * BrushDynamics/StrokeGeometry/RasterBrush/NaturalMedia provider compiles the
 * relevant stage graphs. Provider-specific payloads (`.myb`, ABR …) travel in
 * `sourcePayload` untouched so no import ever loses data silently.
 */

export const dynamicInputIRSchema = z.enum([
  "pressure",
  "velocity",
  "tiltAltitude",
  "tiltAzimuth",
  "twist",
  "random",
  "constant",
]);
export type DynamicInputIR = z.infer<typeof dynamicInputIRSchema>;

export const dynamicMappingIRSchema = z.object({
  input: dynamicInputIRSchema,
  /** Uniform LUT on [0,1] → [0,1]; linear interpolation between taps. */
  curve: z.array(z.number().min(0).max(1)).min(2).default([0, 1]),
  min: z.number().default(0),
  max: z.number().default(1),
});
export type DynamicMappingIR = z.infer<typeof dynamicMappingIRSchema>;

export const stabilizerGraphIRSchema = z.object({
  kind: z.enum(["none", "ema", "spring"]).default("ema"),
  /** 0 = passthrough, 1 = maximum smoothing/inertia. */
  strength: z.number().min(0).max(1).default(0.35),
  predictionMs: z.number().min(0).max(50).default(0),
});
export type StabilizerGraphIR = z.infer<typeof stabilizerGraphIRSchema>;

export const geometryGraphIRSchema = z.object({
  kind: z
    .enum(["perfect-freehand", "centerline-ribbon", "google-ink-mesh"])
    .default("perfect-freehand"),
  thinning: z.number().min(-1).max(1).default(0.5),
  smoothing: z.number().min(0).max(1).default(0.5),
  streamline: z.number().min(0).max(1).default(0.5),
  capStart: z.boolean().default(true),
  capEnd: z.boolean().default(true),
});
export type GeometryGraphIR = z.infer<typeof geometryGraphIRSchema>;

export const tipGraphIRSchema = z.object({
  kind: z.enum(["round", "stamp", "image"]).default("round"),
  hardness: z.number().min(0).max(1).default(1),
  spacingPct: z.number().min(1).max(1000).default(10),
  angleJitterDeg: z.number().min(0).max(180).default(0),
  imageAssetId: z.string().optional(),
});
export type TipGraphIR = z.infer<typeof tipGraphIRSchema>;

export const mixingGraphIRSchema = z.object({
  kind: z.enum(["none", "smudge", "wet"]).default("none"),
  strength: z.number().min(0).max(1).default(0),
});
export type MixingGraphIR = z.infer<typeof mixingGraphIRSchema>;

export const brushOutputPolicyIRSchema = z.object({
  /**
   * Output lane union:
   * - `vector-path` — outline PathIR baked from stroke geometry (compileVectorBrush)
   * - `vector-mesh` — Google Ink triangle-mesh output with incremental deltas
   *   (compileMeshBrush; requires `geometry.kind === "google-ink-mesh"`)
   * - `raster-tiles` — natural-media pixel output (compileRasterBrush)
   */
  target: z.enum(["vector-path", "vector-mesh", "raster-tiles"]).default("vector-path"),
  bake: z.enum(["editable-proxy", "flatten"]).default("editable-proxy"),
});
export type BrushOutputPolicyIR = z.infer<typeof brushOutputPolicyIRSchema>;

export const brushProgramIRSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  stabilizer: stabilizerGraphIRSchema.default({
    kind: "ema",
    strength: 0.35,
    predictionMs: 0,
  }),
  sizeDynamics: z.array(dynamicMappingIRSchema).default([]),
  flowDynamics: z.array(dynamicMappingIRSchema).default([]),
  geometry: geometryGraphIRSchema.default({
    kind: "perfect-freehand",
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    capStart: true,
    capEnd: true,
  }),
  tip: tipGraphIRSchema.default({
    kind: "round",
    hardness: 1,
    spacingPct: 10,
    angleJitterDeg: 0,
  }),
  mixing: mixingGraphIRSchema.default({ kind: "none", strength: 0 }),
  output: brushOutputPolicyIRSchema.default({
    target: "vector-path",
    bake: "editable-proxy",
  }),
  /** Provider hint chain, first entry preferred (e.g. ["hokusai", "skia-raster"]). */
  providerPreference: z.array(z.string()).default([]),
  /** Original imported payload (base64) + format tag; never dropped. */
  sourcePayload: z
    .object({ format: z.string(), base64: z.string() })
    .optional(),
});
export type BrushProgramIR = z.infer<typeof brushProgramIRSchema>;

export function evaluateDynamicMapping(
  mapping: DynamicMappingIR,
  inputValue: number,
): number {
  const clamped = Math.min(1, Math.max(0, inputValue));
  const scaled = clamped * (mapping.curve.length - 1);
  const lower = Math.floor(scaled);
  const upper = Math.min(mapping.curve.length - 1, lower + 1);
  const t = scaled - lower;
  const lowerValue = mapping.curve[lower] ?? 0;
  const upperValue = mapping.curve[upper] ?? lowerValue;
  const curveValue = lowerValue + (upperValue - lowerValue) * t;
  return mapping.min + (mapping.max - mapping.min) * curveValue;
}
