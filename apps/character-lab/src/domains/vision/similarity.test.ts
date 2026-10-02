import { describe, expect, it } from "vitest";

import { cosine, l2Normalize, rankBySimilarity, toEmbedding } from "./similarity";

describe("vision/similarity", () => {
  it("코사인은 대칭이고 자기 자신과는 1, 직교하면 0, 반대면 -1이다", () => {
    const a = toEmbedding([1, 2, 3]);
    const b = toEmbedding([3, 2, 1]);
    expect(cosine(a, b)).toBeCloseTo(cosine(b, a), 12);
    expect(cosine(a, a)).toBeCloseTo(1, 12);
    expect(cosine(toEmbedding([1, 0]), toEmbedding([0, 1]))).toBeCloseTo(0, 12);
    expect(cosine(toEmbedding([1, 0]), toEmbedding([-1, 0]))).toBeCloseTo(-1, 12);
  });

  it("영벡터·NaN 입력은 NaN 대신 0을 돌려주고, 길이가 다르면 throw한다", () => {
    expect(cosine(toEmbedding([0, 0]), toEmbedding([1, 1]))).toBe(0);
    expect(toEmbedding([Number.NaN, 1])[0]).toBe(0);
    expect(() => cosine(toEmbedding([1, 2]), toEmbedding([1, 2, 3]))).toThrow(/길이/u);
  });

  it("L2 정규화 후 길이는 1이고 입력은 바뀌지 않는다", () => {
    const input = toEmbedding([3, 4]);
    const normalized = l2Normalize(input);
    expect(Math.hypot(normalized[0] ?? 0, normalized[1] ?? 0)).toBeCloseTo(1, 6);
    expect(Array.from(input)).toEqual([3, 4]);
    expect(Array.from(l2Normalize(toEmbedding([0, 0])))).toEqual([0, 0]);
  });

  it("Top-K는 점수 내림차순이고 동률은 입력 순서를 유지한다(안정)", () => {
    const query = toEmbedding([1, 0]);
    const ranked = rankBySimilarity(
      query,
      [
        { id: "a", embedding: toEmbedding([0, 1]) },
        { id: "b", embedding: toEmbedding([1, 1]) },
        { id: "c", embedding: toEmbedding([2, 2]) },
        { id: "d", embedding: toEmbedding([5, 0]) },
      ],
      3,
    );
    expect(ranked.map((entry) => entry.id)).toEqual(["d", "b", "c"]);
    expect(ranked.map((entry) => entry.rank)).toEqual([0, 1, 2]);
    expect(ranked[1]?.score).toBeCloseTo(ranked[2]?.score ?? Number.NaN, 12);
    expect(rankBySimilarity(query, [], 3)).toEqual([]);
    expect(rankBySimilarity(query, [{ id: "x", embedding: toEmbedding([1, 0]) }]).length).toBe(1);
  });
});
