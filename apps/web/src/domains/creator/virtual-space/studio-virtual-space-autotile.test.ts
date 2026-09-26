import { describe, expect, it } from "vitest";
import {
  STUDIO_AUTOTILE_CANONICAL_MASKS,
  STUDIO_AUTOTILE_NEIGHBORS,
  createStudioAutotileAtlas,
  createStudioAutotileAtlasFromWangSet,
  normalizeStudioAutotileMask,
  studioAutotileFrame,
  studioAutotileMaskAt,
  studioAutotileMaskFromWangId,
  studioAutotileWangId,
} from "./studio-virtual-space-autotile";

const canonical = [
  0, 1, 4, 5, 7, 16, 17, 20, 21, 23, 28, 29, 31, 64, 65, 68, 69, 71, 80, 81, 84, 85,
  87, 92, 93, 95, 112, 113, 116, 117, 119, 124, 125, 127, 193, 197, 199, 209, 213, 215,
  221, 223, 241, 245, 247, 253, 255,
];
const bindings = canonical.map((mask, index) => ({ mask, frame: 100 - index }));
function grid(rows: readonly string[]) {
  return { width: rows[0]?.length ?? 0, height: rows.length, cells: rows.flatMap((row) => [...row].map((cell) => cell === "." ? null : cell)) };
}

describe("47개 blob 지형 선택", () => {
  it("256개 이웃 조합을 안정적인 47개 canonical frame으로 정규화한다", () => {
    expect(STUDIO_AUTOTILE_CANONICAL_MASKS).toEqual(canonical);
    const reached = new Set<number>();
    for (let raw = 0; raw < 256; raw += 1) {
      const normalized = normalizeStudioAutotileMask(raw);
      reached.add(normalized);
      expect(normalizeStudioAutotileMask(normalized)).toBe(normalized);
      expect(normalized & 85).toBe(raw & 85);
      expect(normalized & ~raw).toBe(0);
      expect(studioAutotileFrame(raw)).toBe(canonical.indexOf(normalized));
    }
    expect([...reached].sort((a, b) => a - b)).toEqual(canonical);
    expect(studioAutotileFrame(0)).toBe(0);
    expect(studioAutotileFrame(255)).toBe(46);
  });

  it.each([
    { diagonal: 2, adjacent: [1, 4] }, { diagonal: 8, adjacent: [4, 16] },
    { diagonal: 32, adjacent: [16, 64] }, { diagonal: 128, adjacent: [64, 1] },
  ])("직교 둘이 없으면 대각 $diagonal 변화가 타일을 바꾸지 않는다", ({ diagonal, adjacent }) => {
    const edges = adjacent.reduce((mask, bit) => mask | bit, 0);
    for (let mask = 0; mask < 256; mask += 1) {
      const absent = normalizeStudioAutotileMask(mask & ~diagonal);
      const present = normalizeStudioAutotileMask(mask | diagonal);
      expect(present ^ absent).toBe((mask & edges) === edges ? diagonal : 0);
    }
  });

  it("island·inner corner·T·cross를 채워진 중심과 구분한다", () => {
    const masks = [
      studioAutotileMaskAt(grid(["...", ".a.", "..."]), 1, 1, "a"),
      studioAutotileMaskAt(grid(["aa.", "aaa", "aaa"]), 1, 1, "a"),
      studioAutotileMaskAt(grid([".a.", "aaa", "..."]), 1, 1, "a"),
      studioAutotileMaskAt(grid([".a.", "aaa", ".a."]), 1, 1, "a"),
      studioAutotileMaskAt(grid(["aaa", "aaa", "aaa"]), 1, 1, "a"),
    ];
    expect(masks).toEqual([0, 253, 69, 85, 255]);
    expect(new Set(masks).size).toBe(5);
    expect(studioAutotileMaskAt(grid(["a.a", ".a.", "a.a"]), 1, 1, "a")).toBe(0);
  });

  it("빈 구멍을 메우지 않고 그 둘레와 대각 안쪽 모서리를 보존한다", () => {
    const donut = grid(["aaaaa", "aaaaa", "aa.aa", "aaaaa", "aaaaa"]);
    expect(studioAutotileMaskAt(donut, 2, 2, "a")).toBeNull();
    expect(studioAutotileMaskAt(donut, 2, 1, "a")).toBe(199);
    expect(studioAutotileMaskAt(donut, 1, 1, "a")).toBe(247);
    expect(studioAutotileMaskAt(donut, 3, 3, "a")).toBe(127);
  });

  it("경계 밖을 행 반대편이나 다른 지형으로 이어 붙이지 않는다", () => {
    const map = grid(["aab", "aaa", "aaa"]);
    expect(studioAutotileMaskAt(map, 0, 0, "a")).toBe(28);
    expect(studioAutotileMaskAt(map, 2, 0, "a")).toBeNull();
    expect(studioAutotileMaskAt(map, 2, 0, "b")).toBe(0);
    for (const [x, y] of [[-1, 1], [3, 1], [1, -1], [1, 3]]) {
      if (x === undefined || y === undefined) throw new Error("경계 좌표 누락");
      expect(studioAutotileMaskAt(map, x, y, "a")).toBeNull();
    }
    expect(studioAutotileMaskAt({ width: 1, height: 1, cells: [0] }, 0, 0, 0)).toBe(0);
  });

  it("8방향 이웃의 단일 편집은 한 칸 반경 밖의 타일을 변경하지 않는다", () => {
    const map = grid(Array.from({ length: 7 }, () => "aaaaaaa"));
    for (const neighbor of STUDIO_AUTOTILE_NEIGHBORS) {
      const x = 3 + neighbor.x, y = 3 + neighbor.y;
      const cells = [...map.cells];
      cells[y * map.width + x] = "b";
      const edited = { ...map, cells };
      expect(studioAutotileMaskAt(edited, 3, 3, "a")).not.toBe(255);
      for (let row = 0; row < map.height; row += 1) for (let column = 0; column < map.width; column += 1) {
        if (Math.max(Math.abs(column - x), Math.abs(row - y)) <= 1) continue;
        expect(studioAutotileMaskAt(edited, column, row, "a")).toBe(studioAutotileMaskAt(map, column, row, "a"));
      }
    }
  });

  it("8방향의 256개 실제 격자가 행 우선 좌표와 같은 mask를 선택한다", () => {
    const rowMajorBits = [128, 1, 2, 64, 0, 4, 32, 16, 8];
    for (let raw = 0; raw < 256; raw += 1) {
      const cells = rowMajorBits.map((bit, index) => index === 4 || (raw & bit) !== 0 ? 0 : 1);
      expect(studioAutotileMaskAt({ width: 3, height: 3, cells }, 1, 1, 0)).toBe(normalizeStudioAutotileMask(raw));
    }
  });

  it("범위를 벗어난 mask·격자·좌표를 임의 타일로 치환하지 않는다", () => {
    for (const invalid of [-1, 256, 2.5, NaN, Infinity]) expect(() => studioAutotileFrame(invalid)).toThrow();
    expect(() => studioAutotileMaskAt({ width: 2, height: 2, cells: ["a"] }, 0, 0, "a")).toThrow();
    expect(() => studioAutotileMaskAt(grid(["a"]), 0.5, 0, "a")).toThrow();
    expect(() => studioAutotileMaskAt({ width: 1, height: 1, cells: [NaN] }, 0, 0, NaN)).toThrow();
  });
});

describe("제작된 atlas와 Tiled mixed Wang 연결", () => {
  it("atlas 정렬이나 입력 수정과 무관하게 명시한 실제 프레임을 선택한다", () => {
    const input = bindings.map((binding) => ({ ...binding })).reverse();
    const atlas = createStudioAutotileAtlas(input, 101);
    const first = input[0];
    if (!first) throw new Error("Atlas 입력 누락");
    first.frame = 0;
    input[0] = { mask: 0, frame: 0 };
    expect(atlas.bindings).toEqual(bindings);
    for (const binding of bindings) expect(atlas.frameForMask(binding.mask)).toBe(binding.frame);
    expect(atlas.frameForMask(170)).toBe(100);
    expect(Object.isFrozen(atlas.bindings)).toBe(true);
  });

  it("빠진 아트·중복 그림·잘못된 모서리·범위 밖 프레임을 거절한다", () => {
    expect(() => createStudioAutotileAtlas(bindings.slice(1), 101)).toThrow(/47/);
    expect(() => createStudioAutotileAtlas([...bindings, { mask: 0, frame: 1 }], 101)).toThrow(/duplicate/);
    expect(() => createStudioAutotileAtlas([{ mask: 0, frame: 99 }, ...bindings.slice(1)], 101)).toThrow(/duplicate/);
    expect(() => createStudioAutotileAtlas([{ mask: 2, frame: 100 }, ...bindings.slice(1)], 101)).toThrow(/canonical/);
    expect(() => createStudioAutotileAtlas(bindings, 100)).toThrow(/bounds/);
    expect(() => createStudioAutotileAtlas(bindings, 46)).toThrow(/47/);
  });

  it("Wang의 top→top-right→right 순서와 두 지형 ID를 보존한다", () => {
    expect(studioAutotileWangId(7, 2, 1)).toEqual([2, 2, 2, 1, 1, 1, 1, 1]);
    expect(studioAutotileMaskFromWangId([2, 2, 2, 1, 1, 1, 1, 1], 2, 1)).toBe(7);
    for (const mask of canonical) expect(studioAutotileMaskFromWangId(studioAutotileWangId(mask))).toBe(mask);
    const atlas = createStudioAutotileAtlasFromWangSet({ type: "mixed", wangtiles: bindings.map(({ mask, frame }) => ({
      tileid: frame, wangid: studioAutotileWangId(mask, 2, 1),
    })) }, 101, 2, 1);
    expect(atlas.bindings).toEqual(bindings);
  });

  it("제3 지형·끊어진 Wang corner·edge 전용 set·변형 누락을 받아들이지 않는다", () => {
    expect(() => studioAutotileMaskFromWangId([1, 0, 3, 0, 0, 0, 0, 0])).toThrow(/unrelated/);
    expect(() => studioAutotileMaskFromWangId([0, 1, 0, 0, 0, 0, 0, 0])).toThrow(/canonical/);
    expect(() => studioAutotileMaskFromWangId([1, 1])).toThrow(/eight/);
    expect(() => studioAutotileWangId(0, 1, 1)).toThrow(/distinct/);
    expect(() => studioAutotileWangId(0, 255, 0)).toThrow(/indexes/);
    expect(() => createStudioAutotileAtlasFromWangSet({ type: "edge", wangtiles: [] }, 47)).toThrow(/mixed/);
    expect(() => createStudioAutotileAtlasFromWangSet({ type: "mixed", wangtiles: [{ tileid: 0, wangid: studioAutotileWangId(255) }] }, 47)).toThrow(/47/);
  });
});
