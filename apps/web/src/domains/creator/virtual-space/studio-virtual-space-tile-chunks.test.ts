import { describe, expect, it } from "vitest";
import { studioVisibleTileChunks, type StudioTileWorld } from "./studio-virtual-space-tile-chunks";

function world(): StudioTileWorld {
  return {
    orientation: "orthogonal", renderOrder: "right-down", width: 48, height: 32, tileWidth: 16, tileHeight: 24,
    tilesets: [
      { firstGid: 1, name: "floor", imageUrl: "/floor.png", imageWidth: 16, imageHeight: 24, tileWidth: 8, tileHeight: 12, columns: 2, tileCount: 4, margin: 0, spacing: 0 },
      { firstGid: 17, name: "props", imageUrl: "/props.png", imageWidth: 16, imageHeight: 24, tileWidth: 8, tileHeight: 12, columns: 2, tileCount: 4, margin: 0, spacing: 0 },
    ],
    layers: [{ id: "ground", name: "바닥", width: 48, height: 32, x: 0, y: 0, visible: true, opacity: 1, depth: 0, data: Array.from({ length: 48 * 32 }, () => 1) }],
  };
}

function groundLayer(map: StudioTileWorld) {
  const layer = map.layers[0];
  if (!layer) throw new Error("필수 fixture layer 누락");
  return layer;
}

describe("가상스튜디오 타일 청크 선택", () => {
  it("48×32 월드의 시작·중앙·끝에서 카메라와 인접 청크만 선택한다", () => {
    const map = world();
    expect(studioVisibleTileChunks(map, { x: 0, y: 0, width: 128, height: 192 }).map((chunk) => chunk.key))
      .toEqual(["ground:0:0", "ground:1:0", "ground:0:1", "ground:1:1"]);
    expect(studioVisibleTileChunks(map, { x: 384, y: 384, width: 128, height: 192 }).map((chunk) => chunk.key))
      .toEqual(["ground:2:1", "ground:3:1", "ground:4:1", "ground:2:2", "ground:3:2", "ground:4:2", "ground:2:3", "ground:3:3", "ground:4:3"]);
    expect(studioVisibleTileChunks(map, { x: 752, y: 744, width: 16, height: 24 }).map((chunk) => chunk.key))
      .toEqual(["ground:4:2", "ground:5:2", "ground:4:3", "ground:5:3"]);
  });

  it("음수 카메라와 완전히 벗어난 카메라에서 월드 밖 청크를 만들지 않는다", () => {
    const map = world();
    expect(studioVisibleTileChunks(map, { x: -16, y: -24, width: 16, height: 24 }).map((chunk) => chunk.key)).toEqual(["ground:0:0"]);
    expect(studioVisibleTileChunks(map, { x: -400, y: -600, width: 16, height: 24 })).toEqual([]);
    expect(studioVisibleTileChunks(map, { x: 1100, y: 1100, width: 16, height: 24 })).toEqual([]);
    for (const viewport of [
      { x: Number.NaN, y: 0, width: 16, height: 24 },
      { x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 24 },
      { x: 0, y: 0, width: 0, height: 24 },
      { x: 0, y: 0, width: 16, height: -1 },
    ]) expect(studioVisibleTileChunks(map, viewport)).toEqual([]);
  });

  it("layer offset·끝의 작은 청크·빈 셀·서로 다른 tileset의 원래 GID를 보존한다", () => {
    const base = world();
    const cells = Array.from({ length: 10 * 9 }, () => 0);
    cells[8 * 10 + 8] = 0x80000001;
    cells[8 * 10 + 9] = 0xa0000011;
    const map = { ...base, layers: [{ ...groundLayer(base), width: 10, height: 9, x: 256, y: 192, data: cells }] };
    const chunks = studioVisibleTileChunks(map, { x: 384, y: 384, width: 32, height: 24 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ key: "ground:1:1", column: 8, row: 8, width: 2, height: 1, data: [0x80000001, 0xa0000011] });
    expect(chunks[0]?.tilesets.map((tileset) => tileset.name)).toEqual(["floor", "props"]);
    expect(cells.filter(Boolean)).toEqual([0x80000001, 0xa0000011]);
  });

  it("빈 청크와 감춰진 layer는 로딩 목록에 넣지 않고 같은 tileset은 한 번만 요청한다", () => {
    const base = world();
    const ground = groundLayer(base);
    const cells = Array.from({ length: ground.data.length }, () => 0);
    cells[0] = 1; cells[1] = 2; cells[2] = 0x80000003;
    const map = { ...base, layers: [
      { ...ground, data: cells },
      { ...ground, id: "hidden", visible: false },
      { ...ground, id: "transparent", opacity: 0 },
    ] };
    const chunks = studioVisibleTileChunks(map, { x: 0, y: 0, width: 128, height: 192 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.tilesets).toEqual([base.tilesets[0]]);
    expect(chunks[0]?.data.slice(0, 4)).toEqual([1, 2, 0x80000003, 0]);
    expect(studioVisibleTileChunks(map, { x: 752, y: 744, width: 16, height: 24 })).toEqual([]);
  });
});
