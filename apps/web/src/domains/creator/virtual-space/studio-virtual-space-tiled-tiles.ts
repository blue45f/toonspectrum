import { studioWorldTilemapSchema, type StudioWorldTilemap } from "@toonspectrum/studio-project-model/world-publication";

export interface StudioTiledVisualLayer {
  readonly type: string;
  readonly name: string;
  readonly id?: number;
  readonly width?: number;
  readonly height?: number;
  readonly x?: number;
  readonly y?: number;
  readonly offsetx?: number;
  readonly offsety?: number;
  readonly visible?: boolean;
  readonly opacity?: number;
  readonly data?: readonly number[] | string;
  readonly encoding?: string;
  readonly compression?: string;
  readonly chunks?: readonly unknown[];
  readonly parallaxx?: number;
  readonly parallaxy?: number;
  readonly tintcolor?: string;
  readonly mode?: string;
  readonly layers?: readonly StudioTiledVisualLayer[];
  readonly properties?: readonly { readonly name: string; readonly value: unknown }[];
}

export interface StudioTiledTilesetLike {
  readonly firstgid: number;
  readonly name?: string;
  readonly source?: string;
  readonly image?: string;
  readonly imagewidth?: number;
  readonly imageheight?: number;
  readonly tilewidth?: number;
  readonly tileheight?: number;
  readonly tilecount?: number;
  readonly columns?: number;
  readonly margin?: number;
  readonly spacing?: number;
  readonly tileoffset?: { readonly x?: number; readonly y?: number };
  readonly transparentcolor?: string;
  readonly tiles?: readonly { readonly animation?: unknown; readonly image?: string; readonly objectgroup?: unknown }[];
  readonly wangsets?: readonly StudioTiledWangSetLike[];
}

export interface StudioTiledWangSetLike {
  readonly name: string;
  readonly type: string;
  readonly tile?: number;
  readonly class?: string;
  readonly colors: readonly {
    readonly name: string;
    readonly color: string;
    readonly tile?: number;
    readonly probability?: number;
    readonly class?: string;
  }[];
  readonly wangtiles: readonly { readonly tileid: number; readonly wangid: readonly number[] }[];
}

export interface StudioTiledVisualMap {
  readonly width: number;
  readonly height: number;
  readonly tilewidth: number;
  readonly tileheight: number;
  readonly orientation?: string;
  readonly renderorder?: string;
  readonly infinite?: boolean;
  readonly tilesets?: readonly StudioTiledTilesetLike[];
  readonly layers?: readonly StudioTiledVisualLayer[];
}

function numberOrDefault(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Tiled layer coordinate must be finite");
  return value;
}

/** 지원하지 않는 시각 의미를 조용히 버리지 않고 가져오기 단계에서 거절한다. */
export function studioWorldTilemapFromTiled(map: StudioTiledVisualMap): StudioWorldTilemap | undefined {
  if (map.infinite !== undefined && map.infinite !== false) throw new Error("Infinite Tiled maps are unsupported");
  if (map.orientation !== undefined && map.orientation !== "orthogonal") throw new Error("Only orthogonal Tiled maps are supported");
  if (map.renderorder !== undefined && map.renderorder !== "right-down") throw new Error("Only right-down Tiled render order is supported");
  if (!Number.isInteger(map.width) || !Number.isInteger(map.height) || !Number.isInteger(map.tilewidth) || !Number.isInteger(map.tileheight)
    || map.width < 1 || map.height < 1 || map.tilewidth < 1 || map.tileheight < 1
    || map.width * map.tilewidth > 10000 || map.height * map.tileheight > 10000) throw new Error("Invalid finite Tiled map dimensions");
  const layers: StudioWorldTilemap["layers"] = [];
  let visited = 0;
  let cells = 0;
  const visit = (items: readonly StudioTiledVisualLayer[], parentX = 0, parentY = 0, visible = true, opacity = 1, depth = 0, path = "root") => {
    if (depth > 16) throw new Error("Tiled groups exceed maximum nesting depth");
    for (const [index, layer] of items.entries()) {
      visited += 1;
      if (visited > 1024) throw new Error("Tiled layer budget exceeded");
      if (layer.type !== "group" && layer.type !== "tilelayer") continue;
      if (layer.id !== undefined && (!Number.isInteger(layer.id) || layer.id < 1)) throw new Error("Invalid Tiled layer id");
      if (layer.visible !== undefined && typeof layer.visible !== "boolean") throw new Error("Invalid Tiled visibility");
      if ((layer.parallaxx !== undefined && layer.parallaxx !== 1) || (layer.parallaxy !== undefined && layer.parallaxy !== 1)
        || layer.tintcolor !== undefined || (layer.mode !== undefined && layer.mode !== "normal")) throw new Error("Tiled parallax, tint and blend modes are unsupported");
      const localOpacity = numberOrDefault(layer.opacity, 1);
      if (localOpacity < 0 || localOpacity > 1) throw new Error("Invalid Tiled opacity");
      const tileX = numberOrDefault(layer.x, 0), tileY = numberOrDefault(layer.y, 0);
      if (!Number.isInteger(tileX) || !Number.isInteger(tileY)) throw new Error("Tiled layer cell offset must be an integer");
      const x = parentX + tileX * map.tilewidth + numberOrDefault(layer.offsetx, 0);
      const y = parentY + tileY * map.tileheight + numberOrDefault(layer.offsety, 0);
      if (Math.abs(x) > 10000 || Math.abs(y) > 10000) throw new Error("Tiled layer offset exceeds world budget");
      const enabled = layer.properties?.find((item) => item.name === "enabled")?.value !== false;
      const nextVisible = visible && layer.visible !== false && enabled;
      const nextOpacity = opacity * localOpacity;
      if (layer.type === "group") {
        visit(layer.layers ?? [], x, y, nextVisible, nextOpacity, depth + 1, `${path}-${index}`);
        continue;
      }
      if (layer.chunks !== undefined || (layer.compression !== undefined && layer.compression !== "")
        || (layer.encoding !== undefined && layer.encoding !== "csv") || !Array.isArray(layer.data)) throw new Error("Tile layers require finite uncompressed JSON GID arrays");
      if (layers.length >= 32) throw new Error("Tile layer budget exceeded");
      cells += layer.data.length;
      if (layer.data.length > 65_536 || cells > 131_072) throw new Error("Tilemap cell budget exceeded");
      const customId = layer.properties?.find((item) => item.name === "studioLayerId")?.value;
      const customDepth = layer.properties?.find((item) => item.name === "depth")?.value;
      layers.push({
        id: customId === undefined ? `tile-${layer.id ?? `${path}-${index}`}` : typeof customId === "string" ? customId : "",
        name: layer.name, width: layer.width ?? map.width, height: layer.height ?? map.height,
        x, y, visible: nextVisible, opacity: nextOpacity,
        depth: customDepth === undefined ? 10 + layers.length : typeof customDepth === "number" ? customDepth : NaN,
        data: [...layer.data],
      });
    }
  };
  visit(map.layers ?? []);
  if (!layers.length) {
    if (map.tilesets?.length) throw new Error("Tiled tilesets require an explicit tile layer");
    return undefined;
  }
  if ((map.tilesets?.length ?? 0) > 32) throw new Error("Tileset budget exceeded");
  const tilesets = (map.tilesets ?? []).map((set) => {
    if (set.source !== undefined) throw new Error("External Tiled tilesets must be embedded before import");
    if (set.transparentcolor !== undefined || (set.tileoffset !== undefined && (set.tileoffset.x !== 0 || set.tileoffset.y !== 0))
      || set.tiles?.some((tile) => tile.animation !== undefined || tile.image !== undefined || tile.objectgroup !== undefined)) {
      throw new Error("Tileset animation, image collections, tile collision and offsets are unsupported");
    }
    return {
      firstGid: set.firstgid, name: set.name, imageUrl: set.image, imageWidth: set.imagewidth, imageHeight: set.imageheight,
      tileWidth: set.tilewidth, tileHeight: set.tileheight, columns: set.columns, tileCount: set.tilecount,
      margin: set.margin ?? 0, spacing: set.spacing ?? 0,
      ...(set.wangsets === undefined ? {} : { wangSets: set.wangsets }),
    };
  });
  return studioWorldTilemapSchema.parse({ orientation: "orthogonal", renderOrder: "right-down",
    width: map.width, height: map.height, tileWidth: map.tilewidth, tileHeight: map.tileheight, tilesets, layers });
}
