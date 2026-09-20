import { z } from "zod";
import { STUDIO_BG3D_SHOT_BATCH_PASSES } from "./studio-bg3d-shot-batch-pass-catalog";
import { createStudioBg3dTilePlan } from "./studio-bg3d-tile-plan";
import type { StudioBg3dCapturedRaster } from "./studio-bg3d-capture-adapter";
import type { StudioBg3dLtRenderSettings } from "./studio-bg3d-lt-render";
import type { StudioBg3dShotBatchPass } from "./studio-bg3d-shot-batch-pass-catalog";
import type { StudioBg3dTilePlan } from "./studio-bg3d-tile-plan";

export interface StudioBg3dTiledArtifactOptions {
  readonly width: number;
  readonly height: number;
  readonly tileWidth?: number;
  readonly bandHeight?: number;
  readonly includeDepth?: boolean;
  readonly includeNormals?: boolean;
  readonly settings: StudioBg3dLtRenderSettings;
  readonly passes: readonly StudioBg3dShotBatchPass[];
}
export interface StudioBg3dTiledArtifactResult {
  readonly images: readonly {
    readonly pass: StudioBg3dShotBatchPass;
    readonly png: Blob;
  }[];
  readonly skipped: readonly {
    readonly pass: StudioBg3dShotBatchPass;
    readonly reason: "disabled" | "unavailable";
  }[];
}
export type StudioBg3dTiledRequest =
  | {
      readonly version: 1;
      readonly id: number;
      readonly kind: "init";
      readonly options: StudioBg3dTiledArtifactOptions;
    }
  | {
      readonly version: 1;
      readonly id: number;
      readonly kind: "tile";
      readonly index: number;
      readonly raster: StudioBg3dCapturedRaster;
    }
  | { readonly version: 1; readonly id: number; readonly kind: "finish" };
const header = z.object({
  version: z.literal(1),
  id: z.number().int().positive(),
  kind: z.enum(["init", "tile", "finish"]),
});
export function assertStudioBg3dTiledRequest(
  value: unknown,
): asserts value is StudioBg3dTiledRequest {
  const parsed = header.passthrough().parse(value);
  const keys = Object.keys(parsed).sort().join(",");
  const allowed =
    parsed.kind === "init"
      ? "id,kind,options,version"
      : parsed.kind === "tile"
        ? "id,index,kind,raster,version"
        : "id,kind,version";
  if (keys !== allowed)
    throw new TypeError("Invalid tiled Worker message fields.");
}
export function validateStudioBg3dTiledOptions(value: unknown): {
  options: StudioBg3dTiledArtifactOptions;
  plan: StudioBg3dTilePlan;
} {
  const options = z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      tileWidth: z.number().int().optional(),
      bandHeight: z.number().int().optional(),
      includeDepth: z.boolean().optional(),
      includeNormals: z.boolean().optional(),
      settings: z
        .object({
          line: z.object({}).passthrough(),
          tone: z.object({}).passthrough(),
        })
        .strict(),
      passes: z
        .array(z.enum(STUDIO_BG3D_SHOT_BATCH_PASSES))
        .min(1)
        .max(STUDIO_BG3D_SHOT_BATCH_PASSES.length),
    })
    .strict()
    .parse(value);
  if (new Set(options.passes).size !== options.passes.length)
    throw new TypeError("Duplicate output passes.");
  if (options.includeNormals && !options.includeDepth)
    throw new TypeError("Tiled normals require depth.");
  const plan = createStudioBg3dTilePlan(options);
  return {
    options: options as unknown as StudioBg3dTiledArtifactOptions,
    plan,
  };
}
