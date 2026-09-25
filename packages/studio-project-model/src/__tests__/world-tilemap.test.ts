import { describe, expect, it } from "vitest";

import { decodeStudioWorldTileGid, studioWorldManifestSchema, studioWorldPublicationSchema, studioWorldTilemapSchema, type StudioWorldTilemap, type StudioWorldWangSet } from "../graph/world-publication";
import { canonicalJson } from "../index";

function first<T>(values: readonly T[]): T {
  const value = values[0];
  if (value === undefined) throw new Error("검증 fixture가 비어 있습니다");
  return value;
}

const tilemap = (): StudioWorldTilemap => ({
  orientation: "orthogonal", renderOrder: "right-down", width: 2, height: 2, tileWidth: 64, tileHeight: 64,
  tilesets: [{ firstGid: 1, name: "ground", imageUrl: "/assets/ground.png", imageWidth: 1024, imageHeight: 1024,
    tileWidth: 256, tileHeight: 256, columns: 4, tileCount: 16, margin: 0, spacing: 0 }],
  layers: [{ id: "ground", name: "Ground", x: 0, y: 0, width: 2, height: 2, visible: true, opacity: 1, depth: 10, data: [1, 2, 0, 16] }],
});
const world = () => ({ id: "world", version: 1, width: 128, height: 128, backgroundAssetKey: "back", backgroundUrl: "/assets/back.png",
  rooms: [{ id: "room", x: 0, y: 0, width: 128, height: 128, labelKo: "방", labelEn: "Room" }],
  props: [], colliders: [], interactions: [], portals: [], spawns: [{ id: "main", point: { x: 32, y: 32 } }], npcs: [] });

const wangSet = (): StudioWorldWangSet => ({
  name: "잔디와 산책로", type: "mixed", tile: -1, class: "TerrainBlend",
  colors: [{ name: "잔디", color: "#56894D", tile: 0, probability: 0.5, class: "Ground" },
    { name: "산책로", color: "#D0B89A", tile: -1, probability: 1 }],
  wangtiles: [{ tileid: 0, wangid: [1, 1, 1, 2, 2, 2, 2, 2] }, { tileid: 1, wangid: [2, 2, 2, 2, 2, 2, 2, 2] }],
});
const withWang = (wangSets: unknown) => {
  const map = tilemap();
  return { ...map, tilesets: [{ ...first(map.tilesets), wangSets }] };
};

describe("게시 타일맵 계약", () => {
  it("원본 해상도와 논리 셀을 분리해 보존하고 타일 변경을 게시 해시에 포함한다", () => {
    const manifest = { ...world(), tilemap: tilemap() };
    expect(studioWorldManifestSchema.parse(manifest)).toEqual(manifest);
    const publication = { contract: "studio-world-publication-v1", workId: "work", projectId: "project", artifactId: "world",
      revisionId: "revision", previousPublishedRevisionId: null, contentHash: "a".repeat(64), sequence: 1,
      publishedBy: "author", publishedAt: "2026-09-26T00:00:00.000Z", manifest };
    expect(studioWorldPublicationSchema.parse(publication).manifest.tilemap).toEqual(manifest.tilemap);
    const changed = structuredClone(manifest); first(changed.tilemap.layers).data[0] = 3;
    expect(canonicalJson(studioWorldManifestSchema.parse(changed))).not.toBe(canonicalJson(studioWorldManifestSchema.parse(manifest)));
    expect(studioWorldManifestSchema.parse(world())).not.toHaveProperty("tilemap");
  });
  it("0과 H/V/대각선의 8가지 조합을 unsigned GID로 보존한다", () => {
    for (let flags = 0; flags < 8; flags += 1) {
      const raw = 1 + ((flags & 1) ? 0x80000000 : 0) + ((flags & 2) ? 0x40000000 : 0) + ((flags & 4) ? 0x20000000 : 0);
      const map = tilemap(); first(map.layers).data[0] = raw;
      expect(first(studioWorldTilemapSchema.parse(map).layers).data[0]).toBe(raw);
      expect(decodeStudioWorldTileGid(raw)).toEqual({ gid: 1, flipX: Boolean(flags & 1), flipY: Boolean(flags & 2), flipDiagonal: Boolean(flags & 4) });
    }
    expect(decodeStudioWorldTileGid(0).gid).toBe(0);
  });
  it.each([17, -1, 1.5, Infinity, 0x10000001, 0x80000000, 0x100000000])("존재하지 않거나 잘못된 GID %s를 거절한다", (gid) => {
    const map = tilemap(); first(map.layers).data[0] = gid;
    expect(studioWorldTilemapSchema.safeParse(map).success).toBe(false);
  });
  it("GID 겹침·아틀라스 범위·소스 배율 불일치를 거절한다", () => {
    for (const patch of [{ firstGid: 16, name: "other" }, { firstGid: 17, name: "other", tileWidth: 128, tileHeight: 256 },
      { firstGid: 17, name: "other", tileWidth: 128, tileHeight: 128, columns: 8 }, { columns: 5 }, { tileCount: 17 }, { margin: 1 }]) {
      const map = tilemap(); map.tilesets.push({ ...first(map.tilesets), ...patch });
      expect(studioWorldTilemapSchema.safeParse(map).success).toBe(false);
    }
  });
  it("레이어 셀 수·중복 ID·월드 외부 점유·월드 크기 불일치를 거절한다", () => {
    const short = tilemap(); first(short.layers).data.pop();
    const duplicate = tilemap(); duplicate.layers.push({ ...first(duplicate.layers) });
    const outside = tilemap(); first(outside.layers).x = 1;
    for (const map of [short, duplicate, outside]) expect(studioWorldTilemapSchema.safeParse(map).success).toBe(false);
    expect(studioWorldManifestSchema.safeParse({ ...world(), width: 129, tilemap: tilemap() }).success).toBe(false);
  });
  it("점유되지 않은 패딩만 월드 바깥으로 이동할 수 있다", () => {
    const map = tilemap(); map.layers[0] = { ...first(map.layers), x: -64, data: [0, 1, 0, 2] };
    expect(studioWorldTilemapSchema.parse(map)).toEqual(map);
  });
  it.each(["//evil.test/tile.png", "http://evil.test/tile.png", "javascript:alert(1)", "/\\evil.test/a", "/assets/\ntile.png"])("안전하지 않은 타일 이미지 주소 %s를 거절한다", (imageUrl) => {
    const map = tilemap(); first(map.tilesets).imageUrl = imageUrl;
    expect(studioWorldTilemapSchema.safeParse(map).success).toBe(false);
  });
  it("인증 정보가 포함된 타일 이미지 주소를 거절한다", () => {
    const imageUrl = new URL("https://tiles.invalid/atlas.png");
    imageUrl.username = "fixture-user";
    imageUrl.password = "fixture-password";
    const map = tilemap(); first(map.tilesets).imageUrl = imageUrl.href;
    expect(studioWorldTilemapSchema.safeParse(map).success).toBe(false);
  });
  it("타일 셀과 디코딩 이미지 예산을 검사한다", () => {
    const cells = tilemap(); cells.width = 256; cells.height = 256; cells.tileWidth = 1; cells.tileHeight = 1;
    cells.layers = Array.from({ length: 3 }, (_, index) => ({ ...first(cells.layers), id: `layer-${index}`, width: 256, height: 256, data: Array(65_536).fill(0) }));
    expect(studioWorldTilemapSchema.safeParse(cells).success).toBe(false);
    const texture = tilemap(); texture.tilesets[0] = { ...first(texture.tilesets), imageWidth: 8192, imageHeight: 8192, columns: 32 };
    expect(studioWorldTilemapSchema.safeParse(texture).success).toBe(false);
  });
  it("타일 아틀라스도 누락·중복 없는 무결성 핀이 필요하다", () => {
    const pin = (url: string) => ({ url, sha256: "a".repeat(64), bytes: 100, mediaType: "image/png" as const });
    const manifest = { ...world(), tilemap: tilemap(), assetIntegrity: [pin("/assets/back.png"), pin("/assets/ground.png")] };
    expect(studioWorldManifestSchema.parse(manifest)).toEqual(manifest);
    expect(studioWorldManifestSchema.safeParse({ ...manifest, assetIntegrity: [manifest.assetIntegrity[0]] }).success).toBe(false);
    expect(studioWorldManifestSchema.safeParse({ ...manifest, assetIntegrity: [...manifest.assetIntegrity, manifest.assetIntegrity[1]] }).success).toBe(false);
  });
});

describe("게시 타일맵 Wang metadata 계약", () => {
  it("색 순서·이름·대표 타일·상대 확률·class를 보존하고 게시 해시에 포함한다", () => {
    const source = withWang([wangSet()]);
    const parsed = studioWorldTilemapSchema.parse(source);
    expect(parsed).toEqual(source);
    const manifest = { ...world(), tilemap: parsed };
    expect(studioWorldManifestSchema.parse(manifest)).toEqual(manifest);
    const changed = structuredClone(parsed);
    const wang = first(first(changed.tilesets).wangSets ?? []);
    first(wang.colors).probability = 0.25;
    expect(canonicalJson(changed)).not.toBe(canonicalJson(parsed));
    expect(first(parsed.tilesets).wangSets).toEqual([wangSet()]);
    expect(first(studioWorldTilemapSchema.parse(tilemap()).tilesets)).not.toHaveProperty("wangSets");
  });

  it("-1 대표 타일·생략된 선택 필드·동일 Wang 패턴의 별도 타일 변형을 보존한다", () => {
    const minimal = { name: "대안", type: "mixed", colors: [{ name: "", color: "#aabbcc" }], wangtiles: [
      { tileid: 0, wangid: [1, 1, 1, 1, 1, 1, 1, 1] }, { tileid: 15, wangid: [1, 1, 1, 1, 1, 1, 1, 1] },
    ] };
    expect(first(studioWorldTilemapSchema.parse(withWang([minimal])).tilesets).wangSets).toEqual([minimal]);
    expect(studioWorldTilemapSchema.safeParse(withWang([])).success).toBe(true);
  });

  it.each([
    { type: "other" }, { name: " " }, { tile: -2 }, { tile: 16 }, { properties: [{ name: "미지원", value: true }] },
    { colors: [] }, { colors: [{ name: "잔디", color: "#gggggg" }] },
    { colors: [{ name: "잔디", color: "#112233", tile: 16 }] },
    { colors: [{ name: "잔디", color: "#112233", probability: -1 }] },
    { colors: [{ name: "잔디", color: "#112233", probability: Infinity }] },
    { colors: Array.from({ length: 255 }, () => ({ name: "지형", color: "#112233" })) },
    { wangtiles: [{ tileid: 16, wangid: [0, 0, 0, 0, 0, 0, 0, 0] }] },
    { wangtiles: [{ tileid: -1, wangid: [0, 0, 0, 0, 0, 0, 0, 0] }] },
    { wangtiles: [{ tileid: 0, wangid: [1, 1] }] },
    { wangtiles: [{ tileid: 0, wangid: [3, 0, 0, 0, 0, 0, 0, 0] }] },
    { wangtiles: [{ tileid: 0, wangid: [1.5, 0, 0, 0, 0, 0, 0, 0] }] },
    { wangtiles: [{ tileid: 0, wangid: [-1, 0, 0, 0, 0, 0, 0, 0] }] },
    { wangtiles: [{ tileid: 0, wangid: [0, 0, 0, 0, 0, 0, 0, 0], hflip: true }] },
  ])("잘못되거나 보존할 수 없는 Wang 정보 %j를 거절한다", (patch) => {
    expect(studioWorldTilemapSchema.safeParse(withWang([{ ...wangSet(), ...patch }])).success).toBe(false);
  });

  it("색 index 254까지 선언 순서대로 받으며 edge와 corner 위치를 구분한다", () => {
    const colors = Array.from({ length: 254 }, (_, index) => ({ name: `지형 ${index}`, color: "#112233" }));
    const edge = { name: "길", type: "edge", colors, wangtiles: [{ tileid: 0, wangid: [254, 0, 1, 0, 1, 0, 0, 0] }] };
    const corner = { name: "땅", type: "corner", colors, wangtiles: [{ tileid: 1, wangid: [0, 254, 0, 1, 0, 1, 0, 0] }] };
    expect(studioWorldTilemapSchema.safeParse(withWang([edge, corner])).success).toBe(true);
    expect(studioWorldTilemapSchema.safeParse(withWang([{ ...edge, type: "corner" }])).success).toBe(false);
    expect(studioWorldTilemapSchema.safeParse(withWang([{ ...corner, type: "edge" }])).success).toBe(false);
  });

  it("중복 set·tileid와 set 개수·전체 metadata 예산 초과를 거절한다", () => {
    expect(studioWorldTilemapSchema.safeParse(withWang([wangSet(), wangSet()])).success).toBe(false);
    const duplicate = wangSet(); duplicate.wangtiles.push(first(duplicate.wangtiles));
    expect(studioWorldTilemapSchema.safeParse(withWang([duplicate])).success).toBe(false);
    const tooMany = Array.from({ length: 17 }, (_, index) => ({ ...wangSet(), name: `세트 ${index}`, wangtiles: [] }));
    expect(studioWorldTilemapSchema.safeParse(withWang(tooMany)).success).toBe(false);
    const map = tilemap();
    const tiles = Array.from({ length: 4096 }, (_, tileid) => ({ tileid, wangid: [0, 0, 0, 0, 0, 0, 0, 0] }));
    map.tilesets[0] = { ...first(map.tilesets), imageWidth: 4096, imageHeight: 4096, tileWidth: 64, tileHeight: 64, columns: 64, tileCount: 4096,
      wangSets: Array.from({ length: 5 }, (_, index) => ({ ...wangSet(), name: `세트 ${index}`, wangtiles: tiles })) };
    expect(studioWorldTilemapSchema.safeParse(map).success).toBe(false);
    first(map.tilesets).wangSets = [{ ...wangSet(), wangtiles: [...tiles, { tileid: 4096, wangid: [0, 0, 0, 0, 0, 0, 0, 0] }] }];
    expect(studioWorldTilemapSchema.safeParse(map).success).toBe(false);
  });
});
