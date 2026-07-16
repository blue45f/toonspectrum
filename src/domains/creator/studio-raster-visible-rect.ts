import type { StudioRasterReplayTileFilterInput } from "./studio-crdt-raster-replay-runtime";

export interface StudioRasterVisibleDocumentRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function studioRasterTileIntersectsDocumentRect(
  tile: StudioRasterReplayTileFilterInput,
  rect: StudioRasterVisibleDocumentRect,
  tileSize: number
): boolean {
  if (
    !Number.isFinite(rect.x) || !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) || !Number.isFinite(rect.height) ||
    rect.width <= 0 || rect.height <= 0
  ) return false;
  if (!Number.isSafeInteger(tileSize) || tileSize <= 0) return false;
  // Edge tiles can be narrower than the canonical tile grid. Their origin still advances by
  // surface.tileSize, not by the edge tile's decoded width/height.
  const tileLeft = tile.tileX * tileSize;
  const tileTop = tile.tileY * tileSize;
  return tileLeft < rect.x + rect.width &&
    tileTop < rect.y + rect.height &&
    tileLeft + tile.width > rect.x &&
    tileTop + tile.height > rect.y;
}
