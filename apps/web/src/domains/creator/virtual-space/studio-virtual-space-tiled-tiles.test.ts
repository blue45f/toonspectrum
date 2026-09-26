import { describe, expect, it } from "vitest";
import { studioWorldManifestFromTiled, type StudioTiledMapLike } from "./studio-virtual-space-tiled-adapter";
import { studioWorldManifestToTiledMap, parseStudioWorldAuthoringImport } from "./studio-virtual-space-world-authoring";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import { studioWorldTilemapFromTiled } from "./studio-virtual-space-tiled-tiles";
import { createStudioAutotileAtlasFromWangSet, STUDIO_AUTOTILE_CANONICAL_MASKS, studioAutotileWangId } from "./studio-virtual-space-autotile";

const base: StudioVirtualSpaceWorldManifest = { id: "world", version: 1, width: 128, height: 128, backgroundAssetKey: "back", backgroundUrl: "/assets/back.png",
  rooms: [{ id: "room", x: 0, y: 0, width: 128, height: 128, labelKo: "방", labelEn: "Room" }],
  props: [], colliders: [], interactions: [], portals: [], spawns: [{ id: "main", point: { x: 32, y: 32 } }], npcs: [] };
const map = (): StudioTiledMapLike => ({ width: 2, height: 2, tilewidth: 64, tileheight: 64, orientation: "orthogonal", infinite: false,
  tilesets: [{ firstgid: 1, name: "ground", image: "/tiles.png", imagewidth: 1024, imageheight: 1024, tilewidth: 256, tileheight: 256, columns: 4, tilecount: 16 }],
  layers: [{ id: 1, type: "tilelayer", name: "Ground", width: 2, height: 2, data: [1, 0, 0xe0000002, 16] }] });

function wangMap(): StudioTiledMapLike {
  const source = map();
  const tileset = source.tilesets?.[0];
  if (!tileset) throw new Error("검증 fixture에 타일셋이 없습니다");
  return { ...source, tilesets: [{ ...tileset, imagewidth: 2048, imageheight: 2048, columns: 8, tilecount: 64,
    wangsets: [{ name: "잔디와 돌길", type: "mixed", tile: -1, class: "TerrainBlend",
      colors: [{ name: "돌길", color: "#9A8876", tile: 0, probability: 1 }, { name: "잔디", color: "#4D8B62", tile: 46, probability: 0.25 }],
      wangtiles: STUDIO_AUTOTILE_CANONICAL_MASKS.map((mask, index) => ({ tileid: 63 - index, wangid: studioAutotileWangId(mask, 2, 1) })),
    }],
  }] };
}

describe("Tiled 타일 가져오기와 내보내기", () => {
  it("실제 tilesets와 배열 tilelayer를 게시 데이터로 변환하고 기존 충돌 권위를 보존한다", () => {
    const world = studioWorldManifestFromTiled(map(), base);
    expect(world.tilemap?.tilesets[0]).toMatchObject({ imageUrl: "/tiles.png", firstGid: 1, tileWidth: 256, columns: 4 });
    expect(world.tilemap?.layers[0]).toMatchObject({ id: "tile-1", x: 0, y: 0, data: [1, 0, 0xe0000002, 16], depth: 10 });
    expect(world.colliders).toBe(base.colliders);
    expect(world.rooms).toBe(base.rooms);
  });
  it("그룹 이동·숨김·opacity를 누적하며 빈 타일도 보존한다", () => {
    const source: StudioTiledMapLike = { ...map(), layers: [{ type: "group", name: "parent", offsetx: 10, offsety: 12, visible: false, opacity: 0.5, layers: [
      { type: "group", name: "child", offsetx: 8, offsety: 4, opacity: 0.5, layers: [
        { id: 9, name: "Ground", type: "tilelayer", width: 1, height: 1, data: [1], opacity: 0.8, properties: [{ name: "depth", value: 1700 }] },
      ] },
    ] }] };
    expect(studioWorldTilemapFromTiled(source)?.layers[0]).toEqual({ id: "tile-9", name: "Ground", width: 1, height: 1,
      data: [1], x: 18, y: 16, visible: false, opacity: 0.2, depth: 1700 });
  });
  it("Tiled 재내보내기 후 핀·원본 셀·배율·GID·레이어 ID·순서를 잃지 않는다", () => {
    const imported = studioWorldManifestFromTiled(map(), base);
    const pin = (url: string) => ({ url, sha256: "a".repeat(64), bytes: 100, mediaType: "image/png" as const });
    const world = { ...imported, assetIntegrity: [pin(base.backgroundUrl), pin("/tiles.png")] };
    const exported = studioWorldManifestToTiledMap(world);
    expect(exported).toMatchObject({ width: 2, height: 2, tilewidth: 64, tileheight: 64, tilesets: [{ firstgid: 1, image: "/tiles.png" }] });
    const restored = parseStudioWorldAuthoringImport(JSON.stringify(exported), base);
    expect(restored.tilemap).toEqual(world.tilemap);
    expect(restored.assetIntegrity).toEqual(world.assetIntegrity);
  });
  it("레거시 배경을 가져올 때 다른 월드의 타일을 상속하지 않는다", () => {
    const tiledWorld = studioWorldManifestFromTiled(map(), base);
    const legacy = studioWorldManifestFromTiled({ width: 128, height: 128, tilewidth: 1, tileheight: 1, layers: [] }, tiledWorld);
    expect(legacy.tilemap).toBeUndefined();
    expect(legacy.backgroundUrl).toBe(base.backgroundUrl);
  });
  it("47개 Wang metadata가 게시 계약과 Tiled 재내보내기를 거쳐 실제 atlas lookup에 연결된다", () => {
    const source = wangMap();
    const world = studioWorldManifestFromTiled(source, base);
    const tileset = world.tilemap?.tilesets[0];
    const wang = tileset?.wangSets?.[0];
    if (!tileset || !wang) throw new Error("가져온 Wang metadata가 없습니다");
    expect(wang).toEqual(source.tilesets?.[0]?.wangsets?.[0]);
    const atlas = createStudioAutotileAtlasFromWangSet(wang, tileset.tileCount, 2, 1);
    expect(atlas.frameForMask(255)).toBe(17);
    expect(atlas.frameForMask(0)).toBe(63);
    const exported = studioWorldManifestToTiledMap(world);
    expect(exported).toMatchObject({ tilesets: [{ wangsets: [wang] }] });
    const restored = parseStudioWorldAuthoringImport(JSON.stringify(exported), base);
    expect(restored.tilemap).toEqual(world.tilemap);
    const restoredSet = restored.tilemap?.tilesets[0];
    const restoredWang = restoredSet?.wangSets?.[0];
    if (!restoredSet || !restoredWang) throw new Error("복원한 Wang metadata가 없습니다");
    expect(createStudioAutotileAtlasFromWangSet(restoredWang, restoredSet.tileCount, 2, 1).bindings).toEqual(atlas.bindings);
  });
  it("Wang 없는 기존 tileset에는 metadata를 추가하지 않는다", () => {
    const world = studioWorldManifestFromTiled(map(), base);
    expect(world.tilemap?.tilesets[0]).not.toHaveProperty("wangSets");
    const exported = studioWorldManifestToTiledMap(world);
    expect(JSON.stringify(exported)).not.toContain('"wangsets"');
  });
  it("Wang 색 범위·local tileid·중복·미지원 속성을 가져오기에서 조용히 버리지 않는다", () => {
    const source = wangMap();
    const tileset = source.tilesets?.[0], wang = tileset?.wangsets?.[0];
    if (!tileset || !wang) throw new Error("Wang 검증 fixture가 없습니다");
    for (const patch of [
      { tile: 64 }, { colors: [{ name: "지형", color: "invalid" }] },
      { wangtiles: [{ tileid: 0, wangid: [3, 0, 0, 0, 0, 0, 0, 0] }] },
      { wangtiles: [{ tileid: 64, wangid: [0, 0, 0, 0, 0, 0, 0, 0] }] },
      { wangtiles: [...wang.wangtiles, wang.wangtiles[0]] },
      { properties: [{ name: "미지원", value: true }] },
    ]) {
      // JSON 입력으로 검증해 잘못된 외부 구조를 타입 단언으로 합법화하지 않는다.
      const raw = JSON.stringify({ ...source, tilesets: [{ ...tileset, wangsets: [{ ...wang, ...patch }] }] });
      expect(() => parseStudioWorldAuthoringImport(raw, base)).toThrow();
    }
  });
  it.each([{ infinite: true }, { orientation: "isometric" }, { renderorder: "left-down" }])("지원하지 않는 맵 %j을 거절한다", (patch) => {
    expect(() => studioWorldTilemapFromTiled({ ...map(), ...patch })).toThrow();
  });
  it.each([{ data: "AAAA", encoding: "base64" }, { compression: "gzip" }, { chunks: [] }, { tintcolor: "#ff0000" }, { parallaxx: 0.5 },
    { mode: "multiply" }, { opacity: 2 }, { data: [17, 0, 0, 0] }, { data: [1] }])("미지원 또는 잘못된 타일 레이어 %j을 버리지 않고 거절한다", (patch) => {
    const source = map();
    expect(() => studioWorldTilemapFromTiled({ ...source, layers: [{ type: "tilelayer", name: "Ground", width: 2, height: 2, data: [1, 2, 3, 4], ...patch }] })).toThrow();
  });
  it("외부 TSX·타일 단위 충돌·애니메이션을 명시적으로 거절한다", () => {
    for (const patch of [{ source: "tiles.tsx" }, { tiles: [{ animation: [{ tileid: 0, duration: 100 }] }] }, { tiles: [{ objectgroup: {} }] }]) {
      const source = map();
      const tileset = source.tilesets?.[0];
      if (!tileset) throw new Error("검증 fixture에 타일셋이 없습니다");
      expect(() => studioWorldTilemapFromTiled({ ...source, tilesets: [{ ...tileset, ...patch }] })).toThrow();
    }
  });
});
