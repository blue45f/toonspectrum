import { describe, expect, it } from "vitest";

import {
  buildBoard,
  flipReducer,
  initState,
  isFaceUp,
  isSolved,
  shuffle,
  type MemoryState,
  type Tile,
} from "./memory-engine";

import type { PlayTitle } from "../../play-types";

// 결정적 rng(mulberry32).
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeTitle(i: number): PlayTitle {
  return {
    id: `t${i}`,
    title: `웹툰${i}`,
    author: `작가${i}`,
    cover: ["oklch(0.4 0.1 200)", "oklch(0.3 0.1 240)"],
    coverImage: `https://example.test/${i}.jpg`,
    genres: ["액션"],
    ageRating: "전체",
    type: "webtoon",
    status: "ongoing",
    views: 1_000 * (i + 1),
    likes: 10 * (i + 1),
    bookmarks: 5 * (i + 1),
  };
}

const pool = (n: number): PlayTitle[] => Array.from({ length: n }, (_, i) => makeTitle(i));

/** 보드에서 titleId가 같은 두 타일(한 쌍)의 id를 찾는다. */
function pairFor(tiles: Tile[], titleId: string): [string, string] {
  const ids = tiles.filter((t) => t.titleId === titleId).map((t) => t.id);
  return [ids[0], ids[1]];
}

describe("memory-engine", () => {
  it("buildBoard: 2N 타일 · N쌍 · 각 쌍 정확히 2장 · 같은 시드 결정적", () => {
    const a = buildBoard(pool(20), 6, rng(1));
    const b = buildBoard(pool(20), 6, rng(1));
    expect(a.length).toBe(12);
    expect(a.map((t) => t.id)).toEqual(b.map((t) => t.id)); // 결정적

    // 정확히 6개의 distinct titleId, 각 2장.
    const counts = new Map<string, number>();
    for (const t of a) counts.set(t.titleId, (counts.get(t.titleId) ?? 0) + 1);
    expect(counts.size).toBe(6);
    for (const n of counts.values()) expect(n).toBe(2);

    // 타일 id는 보드 내 고유.
    expect(new Set(a.map((t) => t.id)).size).toBe(a.length);
  });

  it("buildBoard: 커버/이미지/이름을 원본에서 가져오고, 중복 titleId는 한 쌍만", () => {
    const dupes = [...pool(3), ...pool(3)]; // t0..t2 두 번
    const tiles = buildBoard(dupes, 5, rng(2));
    // 고유 웹툰은 3개뿐 → 최대 3쌍 = 6타일.
    expect(tiles.length).toBe(6);
    expect(new Set(tiles.map((t) => t.titleId)).size).toBe(3);
    const t0 = tiles.find((t) => t.titleId === "t0");
    expect(t0?.name).toBe("웹툰0");
    expect(t0?.coverImage).toBe("https://example.test/0.jpg");
    expect(t0?.cover).toEqual(["oklch(0.4 0.1 200)", "oklch(0.3 0.1 240)"]);
  });

  it("shuffle: 같은 시드면 같은 순열, 원소 보존, 입력 불변", () => {
    const src = [1, 2, 3, 4, 5, 6];
    const x = shuffle(src, rng(42));
    const y = shuffle(src, rng(42));
    expect(x).toEqual(y);
    expect([...x].sort()).toEqual(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6]); // 원본 불변
  });

  it("flip: 첫 장은 flipped에, 두 번째 매치면 matched·moves++·잠금 없음", () => {
    const tiles = buildBoard(pool(20), 6, rng(3));
    const titleId = tiles[0].titleId;
    const [p1, p2] = pairFor(tiles, titleId);
    let s = initState(tiles);

    s = flipReducer(s, { type: "flip", id: p1 });
    expect(s.flipped).toEqual([p1]);
    expect(s.moves).toBe(0);

    s = flipReducer(s, { type: "flip", id: p2 });
    expect(s.flipped).toEqual([]); // 판정 후 비움
    expect(s.matched).toEqual([p1, p2]);
    expect(s.moves).toBe(1);
    expect(s.locked).toBe(false); // 매치는 잠그지 않음(연속 진행)
    expect(isFaceUp(s, p1)).toBe(true);
  });

  it("flip: 미스매치는 두 장 앞면 유지 + 잠금, resolve가 닫는다", () => {
    const tiles = buildBoard(pool(20), 6, rng(4));
    // 서로 다른 titleId의 두 타일 고르기.
    const first = tiles[0];
    const second = tiles.find((t) => t.titleId !== first.titleId)!;
    let s = initState(tiles);

    s = flipReducer(s, { type: "flip", id: first.id });
    s = flipReducer(s, { type: "flip", id: second.id });
    expect(s.flipped).toEqual([first.id, second.id]);
    expect(s.moves).toBe(1);
    expect(s.locked).toBe(true);
    expect(s.matched).toEqual([]);

    // 잠금 중에는 추가 flip 무시(상태 동일 참조).
    const third = tiles.find((t) => t.id !== first.id && t.id !== second.id)!;
    expect(flipReducer(s, { type: "flip", id: third.id })).toBe(s);

    // resolve로 닫기.
    s = flipReducer(s, { type: "resolve" });
    expect(s.flipped).toEqual([]);
    expect(s.locked).toBe(false);
    expect(isFaceUp(s, first.id)).toBe(false);
  });

  it("flip: 이미 매치/앞면 타일이나 같은 타일 두 번은 무시", () => {
    const tiles = buildBoard(pool(20), 6, rng(5));
    const titleId = tiles[0].titleId;
    const [p1, p2] = pairFor(tiles, titleId);
    let s = initState(tiles);
    s = flipReducer(s, { type: "flip", id: p1 });
    s = flipReducer(s, { type: "flip", id: p2 }); // 매치됨

    // 매치된 타일 다시 flip → no-op(동일 참조).
    expect(flipReducer(s, { type: "flip", id: p1 })).toBe(s);

    // 첫 장 뒤집은 뒤 같은 장 다시 → no-op.
    const s2 = flipReducer(initState(tiles), { type: "flip", id: tiles[0].id });
    expect(flipReducer(s2, { type: "flip", id: tiles[0].id })).toBe(s2);
  });

  it("resolve: 잠기지 않은 상태면 no-op", () => {
    const tiles = buildBoard(pool(20), 6, rng(6));
    const s = flipReducer(initState(tiles), { type: "flip", id: tiles[0].id });
    expect(flipReducer(s, { type: "resolve" })).toBe(s);
  });

  it("isSolved: 모든 쌍을 맞추면 참, 그 전엔 거짓 / reset은 초기화", () => {
    const tiles = buildBoard(pool(20), 3, rng(7)); // 작은 보드(3쌍=6타일)로 끝까지.
    let s: MemoryState = initState(tiles);
    expect(isSolved(s)).toBe(false);

    const titleIds = [...new Set(tiles.map((t) => t.titleId))];
    for (const tid of titleIds) {
      const [a, b] = pairFor(tiles, tid);
      s = flipReducer(s, { type: "flip", id: a });
      s = flipReducer(s, { type: "flip", id: b });
    }
    expect(isSolved(s)).toBe(true);
    expect(s.matched.length).toBe(6);
    expect(s.moves).toBe(3);

    const fresh = flipReducer(s, { type: "reset", tiles });
    expect(fresh.matched).toEqual([]);
    expect(fresh.moves).toBe(0);
    expect(isSolved(fresh)).toBe(false);
  });

  it("isSolved: 빈 보드는 거짓", () => {
    expect(isSolved(initState([]))).toBe(false);
  });
});
