import { describe, expect, it } from "vitest";

import {
  answerOf,
  buildQuestion,
  CHOICE_COUNT,
  isCorrect,
  shuffle,
} from "./quiz-engine";

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
    genres: ["액션", "판타지"],
    ageRating: "전체",
    type: "webtoon",
    status: "ongoing",
    views: 1_000_000 * (i + 1),
    likes: i * 100,
    bookmarks: i * 50,
  };
}

const pool = (n: number): PlayTitle[] => Array.from({ length: n }, (_, i) => makeTitle(i));

describe("quiz-engine", () => {
  it("shuffle: 같은 시드면 같은 순열, 원소 보존, 입력 불변", () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = shuffle(src, rng(42));
    const b = shuffle(src, rng(42));
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // 원본 불변
  });

  it("buildQuestion: 보기 4개·정답 포함·id 모두 유일", () => {
    const q = buildQuestion(pool(30), rng(1));
    expect(q.choices.length).toBe(CHOICE_COUNT);
    // 정답이 보기 안에 포함.
    expect(q.choices.some((c) => c.id === q.answerId)).toBe(true);
    // 보기 id 4개 모두 유일.
    const ids = new Set(q.choices.map((c) => c.id));
    expect(ids.size).toBe(CHOICE_COUNT);
  });

  it("buildQuestion: 결정적(같은 시드 → 같은 문제)", () => {
    const a = buildQuestion(pool(30), rng(7));
    const b = buildQuestion(pool(30), rng(7));
    expect(a.answerId).toBe(b.answerId);
    expect(a.choices.map((c) => c.id)).toEqual(b.choices.map((c) => c.id));
  });

  it("buildQuestion: 풀이 4편 미만이면 가능한 만큼만(중복 없이)", () => {
    const q = buildQuestion(pool(2), rng(3));
    expect(q.choices.length).toBe(2);
    expect(new Set(q.choices.map((c) => c.id)).size).toBe(2);
    expect(q.choices.some((c) => c.id === q.answerId)).toBe(true);
  });

  it("buildQuestion: 중복 id 입력은 제거되어 보기에 한 번만 등장", () => {
    const dup = [...pool(4), ...pool(4)]; // t0..t3 두 번씩
    const q = buildQuestion(dup, rng(9));
    expect(new Set(q.choices.map((c) => c.id)).size).toBe(q.choices.length);
  });

  it("buildQuestion: 빈 풀은 throw", () => {
    expect(() => buildQuestion([], rng(1))).toThrow();
  });

  it("isCorrect: 정답 id만 true", () => {
    const q = buildQuestion(pool(30), rng(5));
    expect(isCorrect(q, q.answerId)).toBe(true);
    const wrong = q.choices.find((c) => c.id !== q.answerId);
    expect(wrong).toBeDefined();
    if (wrong) expect(isCorrect(q, wrong.id)).toBe(false);
    expect(isCorrect(q, "없는id")).toBe(false);
  });

  it("answerOf: 보기에서 정답 PlayTitle를 돌려준다", () => {
    const q = buildQuestion(pool(30), rng(2));
    const ans = answerOf(q);
    expect(ans).toBeDefined();
    expect(ans?.id).toBe(q.answerId);
  });

  it("정답 위치가 항상 첫 인덱스는 아니다(섞임 검증)", () => {
    // 여러 시드에서 정답이 0번 외 위치에도 등장하는지.
    const positions = new Set<number>();
    for (let s = 1; s <= 40; s++) {
      const q = buildQuestion(pool(30), rng(s));
      positions.add(q.choices.findIndex((c) => c.id === q.answerId));
    }
    expect(positions.size).toBeGreaterThan(1);
  });
});
