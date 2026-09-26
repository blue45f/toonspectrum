import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

export type StudioTileWorld = NonNullable<StudioVirtualSpaceWorldManifest["tilemap"]>;
export type StudioTileLayer = StudioTileWorld["layers"][number];
export type StudioTileset = StudioTileWorld["tilesets"][number];
export interface StudioTileViewport { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface StudioTileChunk {
  readonly key: string;
  readonly layer: StudioTileLayer;
  readonly column: number;
  readonly row: number;
  readonly width: number;
  readonly height: number;
  readonly data: readonly number[];
  readonly tilesets: readonly StudioTileset[];
}

export const STUDIO_TILE_CHUNK_SIZE = 8;
export const STUDIO_TILE_GID_MASK = 0x0fffffff;

function validViewport(viewport: StudioTileViewport): boolean {
  return [viewport.x, viewport.y, viewport.width, viewport.height].every(Number.isFinite)
    && viewport.width > 0 && viewport.height > 0;
}

function chunkRange(world: StudioTileWorld, layer: StudioTileLayer, viewport: StudioTileViewport) {
  const left = (viewport.x - layer.x) / world.tileWidth;
  const top = (viewport.y - layer.y) / world.tileHeight;
  return {
    minX: Math.max(0, Math.floor(left / STUDIO_TILE_CHUNK_SIZE) - 1),
    minY: Math.max(0, Math.floor(top / STUDIO_TILE_CHUNK_SIZE) - 1),
    maxX: Math.min(Math.ceil(layer.width / STUDIO_TILE_CHUNK_SIZE) - 1, Math.ceil((left + viewport.width / world.tileWidth) / STUDIO_TILE_CHUNK_SIZE)),
    maxY: Math.min(Math.ceil(layer.height / STUDIO_TILE_CHUNK_SIZE) - 1, Math.ceil((top + viewport.height / world.tileHeight) / STUDIO_TILE_CHUNK_SIZE)),
  };
}

/** layer offset을 포함해 실제 청크 범위가 달라질 때만 타일 배열을 다시 계산한다. */
export function studioTileViewportChunkKey(world: StudioTileWorld, viewport: StudioTileViewport): string {
  if (!validViewport(viewport)) return "invalid";
  return world.layers.filter((layer) => layer.visible && layer.opacity > 0).map((layer) => {
    const range = chunkRange(world, layer, viewport);
    return `${layer.id}:${range.minX}:${range.minY}:${range.maxX}:${range.maxY}`;
  }).join("|");
}

/** 카메라와 한 청크 여유분만 생성한다. 충돌·상호작용의 권위는 바꾸지 않는다. */
export function studioVisibleTileChunks(world: StudioTileWorld, viewport: StudioTileViewport): readonly StudioTileChunk[] {
  if (!validViewport(viewport)) return [];
  const result: StudioTileChunk[] = [];
  const size = STUDIO_TILE_CHUNK_SIZE;
  for (const layer of world.layers) {
    if (!layer.visible || layer.opacity <= 0) continue;
    const { minX, minY, maxX, maxY } = chunkRange(world, layer, viewport);
    for (let cy = minY; cy <= maxY; cy += 1) {
      for (let cx = minX; cx <= maxX; cx += 1) {
        const column = cx * size;
        const row = cy * size;
        const width = Math.min(size, layer.width - column);
        const height = Math.min(size, layer.height - row);
        const data: number[] = [];
        const used = new Set<StudioTileset>();
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const value = layer.data[(row + y) * layer.width + column + x] ?? 0;
            data.push(value);
            const gid = value & STUDIO_TILE_GID_MASK;
            if (gid === 0) continue;
            const tileset = world.tilesets.find((entry) => gid >= entry.firstGid && gid < entry.firstGid + entry.tileCount);
            if (tileset) used.add(tileset);
          }
        }
        if (used.size > 0) result.push({ key: `${layer.id}:${cx}:${cy}`, layer, column, row, width, height, data, tilesets: [...used] });
      }
    }
  }
  return result;
}
