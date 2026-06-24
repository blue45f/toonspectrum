import { describe, expect, it } from "vitest";

import {
  guessNext,
  hasEnoughTitles,
  judge,
  nextChallenger,
  startDuel,
  type DuelState,
} from "./popularity-duel-engine";

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

function makeTitle(i: number, views: number): PlayTitle {
  return {
    id: `t${i}`,
    title: `웹툰${i}`,
    author: `작가${i}`,
    cover: ["oklch(0.4 0.1 200)", "oklch(0.3 0.1 240)"],
    genres: ["액션"],
    ageRating: "전체",
    type: "webtoon",
    status: "ongoing",
    views,
    likes: views / 100,
    bookmarks: views / 200,
  };
}

const pool = (n: number, base = 1_000_000): PlayTitle[] =>
  Array.from({ length: n }, (_, i) => makeTitle(i, base * (i + 1)));

describe("popularity-duel-engine", () => {
  it("hasEnoughTitles: 2편 이상이어야 게임 가능", () => {
    expect(hasEnoughTitles([])).toBe(false);
    expect(hasEnoughTitles(pool(1))).toBe(false);
    expect(hasEnoughTitles(pool(2))).toBe(true);
    expect(hasEnoughTitles(pool(50))).toBe(true);
  });

  it("judge: 도전자가 더 많으면 higher 정답 / 더 적으면 lower 정답", () => {
    expect(judge(1000, 2000, "higher")).toBe(true);
    expect(judge(1000, 2000, "lower")).toBe(false);
    expect(judge(2000, 1000, "lower")).toBe(true);
    expect(judge(2000, 1000, "higher")).toBe(false);
  });

  it("judge: 동률은 어느 추측이든 정답(플레이어 유리)", () => {
    expect(judge(5000, 5000, "higher")).toBe(true);
    expect(judge(5000, 5000, "lower")).toBe(true);
  });

  it("nextChallenger: 절대 앵커 id를 반복하지 않는다(반복 추첨)", () => {
    const titles = pool(8);
    const r = rng(123);
    for (const anchor of titles) {
      for (let k = 0; k < 50; k++) {
        const next = nextChallenger(titles, anchor.id, r);
        expect(next.id).not.toBe(anchor.id);
      }
    }
  });

  it("nextChallenger: 같은 시드면 결정적", () => {
    const titles = pool(12);
    const a = nextChallenger(titles, "t0", rng(7));
    const b = nextChallenger(titles, "t0", rng(7));
    expect(a.id).toBe(b.id);
  });

  it("nextChallenger: 후보가 앵커뿐이면 폴백(무한루프 방지)", () => {
    const single = [makeTitle(0, 100)];
    const next = nextChallenger(single, "t0", rng(1));
    expect(next.id).toBe("t0"); // 다른 후보 없음 — 풀 첫 원소 폴백
  });

  it("startDuel: 앵커와 도전자가 서로 다르고, 점수 0 · over false", () => {
    const s = startDuel(pool(20), rng(3), 5);
    expect(s.anchor.id).not.toBe(s.challenger.id);
    expect(s.score).toBe(0);
    expect(s.over).toBe(false);
    expect(s.best).toBe(5); // best 이어받음
    expect(s.lastCorrect).toBeNull();
  });

  it("guessNext: 정답이면 점수+1, 도전자가 새 앵커가 되고 새 도전자 등장", () => {
    // 앵커 1000, 도전자 2000 → higher가 정답이 되도록 구성.
    const anchor = makeTitle(0, 1000);
    const challenger = makeTitle(1, 2000);
    const titles = [anchor, challenger, makeTitle(2, 3000), makeTitle(3, 4000)];
    const state: DuelState = { anchor, challenger, score: 0, best: 0, over: false, lastCorrect: null };
    const next = guessNext(state, "higher", titles, rng(2));
    expect(next.over).toBe(false);
    expect(next.score).toBe(1);
    expect(next.best).toBe(1);
    expect(next.lastCorrect).toBe(true);
    expect(next.anchor.id).toBe(challenger.id); // 도전자가 새 앵커
    expect(next.challenger.id).not.toBe(next.anchor.id); // 새 도전자는 앵커 아님
  });

  it("guessNext: 오답이면 over=true, best는 현재 점수 유지/갱신", () => {
    const anchor = makeTitle(0, 5000);
    const challenger = makeTitle(1, 1000); // 도전자가 더 적음
    const titles = [anchor, challenger, makeTitle(2, 9000)];
    const state: DuelState = { anchor, challenger, score: 3, best: 3, over: false, lastCorrect: true };
    const next = guessNext(state, "higher", titles, rng(4)); // 틀린 추측
    expect(next.over).toBe(true);
    expect(next.score).toBe(3); // 점수는 그대로
    expect(next.best).toBe(3);
    expect(next.lastCorrect).toBe(false);
  });

  it("guessNext: over 상태에서는 무시(동일 참조 반환)", () => {
    const anchor = makeTitle(0, 1000);
    const challenger = makeTitle(1, 2000);
    const state: DuelState = { anchor, challenger, score: 0, best: 0, over: true, lastCorrect: false };
    expect(guessNext(state, "higher", pool(5), rng(1))).toBe(state);
  });

  it("연속 정답 런: best가 누적 최고점을 추적한다", () => {
    // 단조 증가 풀에서 도전자가 항상 더 많은 쪽을 노리도록은 보장 못 하므로,
    // 정답일 때마다 score가 best를 끌어올리는지만 확인.
    let s = startDuel(pool(30), rng(99), 0);
    let safety = 0;
    while (!s.over && safety++ < 100) {
      const correctGuess = s.challenger.views > s.anchor.views ? "higher" : "lower";
      s = guessNext(s, correctGuess, pool(30), rng(99 + safety));
      expect(s.best).toBeGreaterThanOrEqual(s.score);
    }
    expect(s.best).toBeGreaterThanOrEqual(0);
  });
});
