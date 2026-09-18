import { z } from "zod";

import { studioEntityIdSchema } from "../graph/ids";
import { blobRefSchema } from "../graph/revision";

import type { BlobRef } from "../graph/revision";

export const rasterColorSpaceV3Schema = z.enum([
  "srgb",
  "display-p3",
  "adobe-rgb",
  "linear-srgb",
]);
export type RasterColorSpaceV3 = z.infer<typeof rasterColorSpaceV3Schema>;

export const rasterPixelFormatV3Schema = z.enum([
  "rgba8",
  "rgba16",
  "rgba16f",
  "rgba32f",
]);
export type RasterPixelFormatV3 = z.infer<typeof rasterPixelFormatV3Schema>;

export interface TileKeyV3 {
  readonly layerId: string;
  readonly mip: number;
  readonly x: number;
  readonly y: number;
}

export const tileKeyV3Schema = z
  .object({
    layerId: studioEntityIdSchema,
    mip: z.number().int().min(0).max(24),
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
  })
  .strict();

export interface RasterTileRefV3 {
  readonly key: TileKeyV3;
  readonly blob: BlobRef;
  readonly pixelFormat: RasterPixelFormatV3;
  readonly colorSpace: RasterColorSpaceV3;
  readonly premultiplied: boolean;
}

export const rasterTileRefV3Schema = z
  .object({
    key: tileKeyV3Schema,
    blob: blobRefSchema,
    pixelFormat: rasterPixelFormatV3Schema,
    colorSpace: rasterColorSpaceV3Schema,
    premultiplied: z.boolean(),
  })
  .strict()
  .superRefine((tile, context) => {
    if (tile.blob.role !== "tile") {
      context.addIssue({
        code: "custom",
        path: ["blob", "role"],
        message: "raster tile blob role must be tile",
      });
    }
  });

export interface SparseTileSetV3 {
  readonly schemaVersion: 3;
  readonly tileSize: 256 | 512;
  readonly width: number;
  readonly height: number;
  readonly tiles: Readonly<Record<string, RasterTileRefV3>>;
}

export const sparseTileSetV3Schema = z
  .object({
    schemaVersion: z.literal(3),
    tileSize: z.union([z.literal(256), z.literal(512)]),
    width: z.number().int().positive().max(1_000_000),
    height: z.number().int().positive().max(10_000_000),
    tiles: z.record(z.string().min(1), rasterTileRefV3Schema),
  })
  .strict()
  .superRefine((set, context) => {
    for (const [key, tile] of Object.entries(set.tiles)) {
      if (key !== tileKeyV3String(tile.key)) {
        context.addIssue({
          code: "custom",
          path: ["tiles", key],
          message: "tile map key differs from TileKeyV3",
        });
      }
      const scale = 2 ** tile.key.mip;
      const columns = Math.ceil(set.width / (set.tileSize * scale));
      const rows = Math.ceil(set.height / (set.tileSize * scale));
      if (tile.key.x >= columns || tile.key.y >= rows) {
        context.addIssue({
          code: "custom",
          path: ["tiles", key, "key"],
          message: "tile lies outside document bounds",
        });
      }
    }
  });

export function tileKeyV3String(key: TileKeyV3): string {
  return `${key.layerId}:${key.mip}:${key.x}:${key.y}`;
}

export function decodedTileByteLength(
  tileSize: number,
  pixelFormat: RasterPixelFormatV3,
): number {
  const bytesPerPixel: Readonly<Record<RasterPixelFormatV3, number>> = {
    rgba8: 4,
    rgba16: 8,
    rgba16f: 8,
    rgba32f: 16,
  };
  return tileSize * tileSize * bytesPerPixel[pixelFormat];
}

export interface TileResidencyCandidateV3 {
  readonly key: string;
  readonly decodedBytes: number;
  readonly viewportDistance: number;
  readonly mipPenalty: number;
  readonly lastUsedAt: number;
}

export function selectResidentTilesV3(
  candidates: readonly TileResidencyCandidateV3[],
  budgetBytes: number,
): readonly string[] {
  if (!Number.isSafeInteger(budgetBytes) || budgetBytes < 0) {
    throw new RangeError("invalid tile memory budget");
  }
  const ordered = [...candidates].sort((left, right) =>
    left.viewportDistance - right.viewportDistance
    || left.mipPenalty - right.mipPenalty
    || right.lastUsedAt - left.lastUsedAt
    || left.key.localeCompare(right.key),
  );
  const selected: string[] = [];
  let used = 0;
  for (const candidate of ordered) {
    if (!Number.isSafeInteger(candidate.decodedBytes) || candidate.decodedBytes < 0) {
      throw new RangeError(`invalid decoded byte count for ${candidate.key}`);
    }
    if (used + candidate.decodedBytes > budgetBytes) continue;
    selected.push(candidate.key);
    used += candidate.decodedBytes;
  }
  return selected;
}
