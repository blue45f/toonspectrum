import { z } from "zod";

/** 게시물에 함께 고정되는 렌더러 중립 타일 데이터다. 충돌 권위는 기존 world.colliders다. */
export const STUDIO_WORLD_TILEMAP_MAX_CELLS = 131_072;
export const STUDIO_WORLD_TILEMAP_MAX_TEXTURE_PIXELS = 32 * 1024 * 1024;
export const STUDIO_WORLD_TILE_GID_MASK = 0x0fffffff;
export const STUDIO_WORLD_TILEMAP_MAX_WANG_TILES = 16_384;
const HORIZONTAL = 0x80000000;
const VERTICAL = 0x40000000;
const DIAGONAL = 0x20000000;
const HEXAGONAL = 0x10000000;
const dimension = z.number().int().min(1).max(8192);
const label = z.string().trim().min(1).max(160);
const imageUrl = z.string().min(1).max(2048).refine((value) => {
  if ([...value].some((char) => char === "\\" || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
}, "Unsafe tile image URL");

export function decodeStudioWorldTileGid(value: number) {
  return {
    gid: (value & STUDIO_WORLD_TILE_GID_MASK) >>> 0,
    flipX: (value & HORIZONTAL) !== 0,
    flipY: (value & VERTICAL) !== 0,
    flipDiagonal: (value & DIAGONAL) !== 0,
  };
}

/** Wang 내부 키와 배열 순서는 Tiled 원본을 보존한다. 색 index 0은 미지정이다. */
export const studioWorldWangColorSchema = z.object({
  name: z.string().max(160),
  color: z.string().regex(/^#[0-9a-f]{6}$/iu),
  tile: z.number().int().min(-1).max(65_535).optional(),
  probability: z.number().finite().nonnegative().optional(),
  class: z.string().max(160).optional(),
}).strict();

export const studioWorldWangSetSchema = z.object({
  name: z.string().min(1).max(160).refine((value) => value.trim().length > 0, "Wang set name must not be blank"),
  type: z.enum(["corner", "edge", "mixed"]),
  tile: z.number().int().min(-1).max(65_535).optional(),
  class: z.string().max(160).optional(),
  colors: z.array(studioWorldWangColorSchema).min(1).max(254),
  wangtiles: z.array(z.object({
    tileid: z.number().int().min(0).max(65_535),
    wangid: z.array(z.number().int().min(0).max(254)).length(8),
  }).strict()).max(4096),
}).strict().superRefine((set, ctx) => {
  if (new Set(set.wangtiles.map((tile) => tile.tileid)).size !== set.wangtiles.length) {
    ctx.addIssue({ code: "custom", message: "Duplicate Wang local tile id" });
  }
  for (const [tileIndex, tile] of set.wangtiles.entries()) {
    for (const [index, color] of tile.wangid.entries()) {
      if (color > set.colors.length) {
        ctx.addIssue({ code: "custom", message: "Wang color index has no declared color", path: ["wangtiles", tileIndex, "wangid", index] });
      }
      if (color !== 0 && ((set.type === "edge" && index % 2 === 1) || (set.type === "corner" && index % 2 === 0))) {
        ctx.addIssue({ code: "custom", message: "Wang color is incompatible with set type", path: ["wangtiles", tileIndex, "wangid", index] });
      }
    }
  }
});

export const studioWorldTilesetSchema = z.object({
  firstGid: z.number().int().min(1).max(STUDIO_WORLD_TILE_GID_MASK),
  name: label,
  imageUrl,
  imageWidth: dimension,
  imageHeight: dimension,
  /** 타일맵의 논리 크기와 구분되는 아틀라스 원본 셀 크기다. */
  tileWidth: dimension,
  tileHeight: dimension,
  columns: z.number().int().min(1).max(4096),
  tileCount: z.number().int().min(1).max(65_536),
  margin: z.number().int().min(0).max(256),
  spacing: z.number().int().min(0).max(256),
  /** 선택 사항이므로 Wang 정보가 없는 기존 게시물의 형태를 바꾸지 않는다. */
  wangSets: z.array(studioWorldWangSetSchema).max(16).optional(),
}).strict().superRefine((set, ctx) => {
  const columns = Math.floor((set.imageWidth - 2 * set.margin + set.spacing) / (set.tileWidth + set.spacing));
  const rows = Math.floor((set.imageHeight - 2 * set.margin + set.spacing) / (set.tileHeight + set.spacing));
  if (columns !== set.columns || rows < 1 || set.tileCount > columns * rows) {
    ctx.addIssue({ code: "custom", message: "Tileset frame geometry exceeds image bounds" });
  }
  if (set.firstGid + set.tileCount - 1 > STUDIO_WORLD_TILE_GID_MASK) {
    ctx.addIssue({ code: "custom", message: "Tileset GID range exceeds unsigned tile index" });
  }
  const wangSets = set.wangSets ?? [];
  if (new Set(wangSets.map((wang) => wang.name)).size !== wangSets.length) {
    ctx.addIssue({ code: "custom", message: "Duplicate Wang set name" });
  }
  for (const [index, wang] of wangSets.entries()) {
    const references = [wang.tile ?? -1, ...wang.colors.map((color) => color.tile ?? -1), ...wang.wangtiles.map((tile) => tile.tileid)];
    if (references.some((tile) => tile >= set.tileCount)) {
      ctx.addIssue({ code: "custom", message: "Wang local tile reference exceeds atlas frame bounds", path: ["wangSets", index] });
    }
  }
});

export const studioWorldTileLayerSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_.:-]{0,95}$/iu),
  name: label,
  width: z.number().int().min(1).max(512),
  height: z.number().int().min(1).max(512),
  /** 그룹 이동을 누적한 월드 좌표다. 빈 셀도 명시적으로 0으로 보존한다. */
  x: z.number().finite().min(-10000).max(10000),
  y: z.number().finite().min(-10000).max(10000),
  visible: z.boolean(),
  opacity: z.number().finite().min(0).max(1),
  depth: z.number().finite().min(-10000).max(20000),
  data: z.array(z.number().int().min(0).max(0xffffffff)).max(65_536),
}).strict().superRefine((layer, ctx) => {
  if (layer.data.length !== layer.width * layer.height) {
    ctx.addIssue({ code: "custom", message: "Tile layer data must cover every cell exactly once" });
  }
});

export const studioWorldTilemapSchema = z.object({
  orientation: z.literal("orthogonal"),
  renderOrder: z.literal("right-down"),
  width: z.number().int().min(1).max(512),
  height: z.number().int().min(1).max(512),
  tileWidth: z.number().int().min(1).max(1024),
  tileHeight: z.number().int().min(1).max(1024),
  tilesets: z.array(studioWorldTilesetSchema).min(1).max(32),
  layers: z.array(studioWorldTileLayerSchema).min(1).max(32),
}).strict().superRefine((map, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  const width = map.width * map.tileWidth;
  const height = map.height * map.tileHeight;
  if (width > 10000 || height > 10000) fail("Tilemap pixel bounds exceed world budget");
  if (map.layers.reduce((sum, layer) => sum + layer.data.length, 0) > STUDIO_WORLD_TILEMAP_MAX_CELLS) fail("Tilemap cell budget exceeded");
  if (map.tilesets.reduce((sum, set) => sum + set.imageWidth * set.imageHeight, 0) > STUDIO_WORLD_TILEMAP_MAX_TEXTURE_PIXELS) fail("Tilemap decoded texture budget exceeded");
  if (map.tilesets.reduce((sum, set) => sum + (set.wangSets ?? []).reduce((count, wang) => count + wang.wangtiles.length, 0), 0)
    > STUDIO_WORLD_TILEMAP_MAX_WANG_TILES) fail("Tilemap Wang metadata budget exceeded");
  if (new Set(map.tilesets.map((set) => set.name)).size !== map.tilesets.length) fail("Duplicate tileset name");
  if (new Set(map.layers.map((layer) => layer.id)).size !== map.layers.length) fail("Duplicate tile layer id");
  let ratio: number | undefined;
  for (const [index, set] of map.tilesets.entries()) {
    const current = set.tileWidth / map.tileWidth;
    if (current !== set.tileHeight / map.tileHeight || (ratio !== undefined && ratio !== current)) fail("Tilesets require a shared uniform source-to-world scale");
    ratio = current;
    if (map.tilesets.slice(0, index).some((other) => set.firstGid < other.firstGid + other.tileCount && other.firstGid < set.firstGid + set.tileCount)) fail("Overlapping tileset GID ranges");
  }
  for (const layer of map.layers) {
    for (const [index, raw] of layer.data.entries()) {
      if ((raw & HEXAGONAL) !== 0) { fail("Hexagonal rotation flag is unsupported for orthogonal tiles"); break; }
      const { gid } = decodeStudioWorldTileGid(raw);
      if (gid === 0) {
        if (raw !== 0) { fail("Empty tile cannot have flip flags"); break; }
        continue;
      }
      if (!map.tilesets.some((set) => gid >= set.firstGid && gid < set.firstGid + set.tileCount)) { fail("Tile GID has no tileset frame"); break; }
      const x = layer.x + (index % layer.width) * map.tileWidth;
      const y = layer.y + Math.floor(index / layer.width) * map.tileHeight;
      if (x < 0 || y < 0 || x + map.tileWidth > width || y + map.tileHeight > height) { fail("Occupied tile extends outside the world"); break; }
    }
  }
});

export type StudioWorldTileset = z.infer<typeof studioWorldTilesetSchema>;
export type StudioWorldTileLayer = z.infer<typeof studioWorldTileLayerSchema>;
export type StudioWorldTilemap = z.infer<typeof studioWorldTilemapSchema>;
export type StudioWorldWangSet = z.infer<typeof studioWorldWangSetSchema>;
export type StudioWorldWangColor = z.infer<typeof studioWorldWangColorSchema>;
