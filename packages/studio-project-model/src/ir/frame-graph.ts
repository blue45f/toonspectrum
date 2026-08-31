import { z } from "zod";

/**
 * FrameGraphIR — one frame of execution (V13 §8.3).
 *
 * GPUTexture objects are never stored; TextureHandle ids are resolved through
 * StudioGpuTextureRegistry at execute time.
 */

export const textureHandleIRSchema = z.object({
  id: z.string().min(1),
  format: z.enum(["rgba8unorm", "bgra8unorm", "rgba16float"]).default("rgba8unorm"),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  revision: z.number().int().nonnegative().default(0),
});
export type TextureHandleIR = z.infer<typeof textureHandleIRSchema>;

export const frameGraphPassKindSchema = z.enum([
  "resource-upload",
  "raster-brush",
  "vello-hybrid",
  "vello-classic",
  "skia-island",
  "three-d",
  "mask-filter",
  "layer-composite",
  "interaction-overlay",
  "present",
]);
export type FrameGraphPassKind = z.infer<typeof frameGraphPassKindSchema>;

export const frameGraphPassIRSchema = z.object({
  id: z.string().min(1),
  kind: frameGraphPassKindSchema,
  dependencies: z.array(z.string()).default([]),
  reads: z.array(z.string()).default([]),
  writes: z.array(z.string()).default([]),
  islandId: z.string().optional(),
  providerId: z.string().optional(),
});
export type FrameGraphPassIR = z.infer<typeof frameGraphPassIRSchema>;

export const frameGraphIslandIRSchema = z
  .object({
    id: z.string().min(1),
    providerId: z.string().min(1),
    transport: z.enum([
      "same-gpu-texture",
      "encoded-command-buffer",
      "image-bitmap",
      "shared-array-buffer-tile",
      "cpu-readback",
    ]),
    textureHandle: z.string().min(1),
    documentIds: z.array(z.string()).default([]),
  })
  // An island binds exactly one provider for its lifetime. Unknown legacy
  // fallbackChain data is rejected instead of being ignored during parsing.
  .strict();
export type FrameGraphIslandIR = z.infer<typeof frameGraphIslandIRSchema>;

export const frameGraphIRSchema = z.object({
  version: z.literal(13),
  surfaceId: z.string().min(1),
  deviceEpoch: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  colorSpace: z.enum(["srgb", "display-p3"]).default("srgb"),
  textures: z.array(textureHandleIRSchema).default([]),
  islands: z.array(frameGraphIslandIRSchema).default([]),
  passes: z.array(frameGraphPassIRSchema).min(1),
});
export type FrameGraphIR = z.infer<typeof frameGraphIRSchema>;

export function createPresentOnlyFrameGraph(options: {
  readonly surfaceId: string;
  readonly width: number;
  readonly height: number;
  readonly deviceEpoch: number;
}): FrameGraphIR {
  return frameGraphIRSchema.parse({
    version: 13,
    surfaceId: options.surfaceId,
    deviceEpoch: options.deviceEpoch,
    width: options.width,
    height: options.height,
    colorSpace: "srgb",
    textures: [],
    islands: [],
    passes: [{ id: "present", kind: "present", dependencies: [] }],
  });
}
