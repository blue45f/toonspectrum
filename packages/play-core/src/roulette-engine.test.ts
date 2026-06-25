import { describe, expect, it } from "vitest";

import {
  filterByGenre,
  genreChips,
  pickRandom,
  popularityTier,
  reasonFor,
  tierLabel,
} from "./roulette-engine";

import type { PlayCoreTitle } from "./play-title";

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

function makeTitle(i: number, genres: string[], views = 1_000_000): PlayCoreTitle {
  return {
    id: `t${i}`,
    title: `웹툰${i}`,
    cover: ["oklch(0.4 0.1 200)", "oklch(0.3 0.1 240)"],
    genres,
    views,
    likes: views / 100,
    bookmarks: views / 200,
  };
}

const pool: PlayCoreTitle[] = [
  makeTitle(0, ["로맨스"], 5_000_000),
  makeTitle(1, ["액션", "판타지"], 300_000_000),
  makeTitle(2, ["로맨스", "드라마"], 12_000),
  makeTitle(3, ["판타지"], 50_000_000),
  makeTitle(4, ["액션"], 2_000_000),
  makeTitle(5, ["로맨스"], 800_000),
];

describe("roulette-engine", () => {
  it("pickRandom: 장르 필터를 존중한다(반환작은 항상 그 장르를 포함)", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const picked = pickRandom(pool, rng(seed), "로맨스");
      expect(picked).not.toBeNull();
      expect(picked!.genres).toContain("로맨스");
    }
  });

  it("pickRandom: 장르 미지정이면 전체 풀에서 뽑고 항상 풀의 원소다", () => {
    const ids = new Set(pool.map((t) => t.id));
    for (let seed = 1; seed <= 30; seed++) {
      const picked = pickRandom(pool, rng(seed));
      expect(picked).not.toBeNull();
      expect(ids.has(picked!.id)).toBe(true);
    }
  });

  it("pickRandom: 같은 시드 + 같은 풀 → 같은 결과(결정성)", () => {
    expect(pickRandom(pool, rng(7))?.id).toBe(pickRandom(pool, rng(7))?.id);
    expect(pickRandom(pool, rng(7), "액션")?.id).toBe(pickRandom(pool, rng(7), "액션")?.id);
  });

  it("pickRandom: 매칭 0건이거나 빈 풀이면 null", () => {
    expect(pickRandom(pool, rng(1), "존재하지않는장르")).toBeNull();
    expect(pickRandom([], rng(1))).toBeNull();
  });

  it("pickRandom: 후보가 1개면 항상 그 1개", () => {
    const picked = pickRandom(pool, rng(99), "드라마");
    expect(picked?.id).toBe("t2");
  });

  it("reasonFor: 결정적(같은 입력 → 같은 문자열)이고 비어있지 않다", () => {
    const t = makeTitle(42, ["로맨스"], 5_000_000);
    expect(reasonFor(t)).toBe(reasonFor(t));
    expect(reasonFor(t).length).toBeGreaterThan(0);
    // 다른 작품 객체라도 내용이 같으면 같은 이유.
    expect(reasonFor(makeTitle(1, ["액션"], 1_000))).toBe(reasonFor(makeTitle(2, ["액션"], 1_000)));
  });

  it("reasonFor: 인기도 티어가 다르면 이유 문장도 달라진다", () => {
    const legend = makeTitle(1, ["액션"], 300_000_000);
    const hidden = makeTitle(2, ["액션"], 1_000);
    expect(reasonFor(legend)).not.toBe(reasonFor(hidden));
  });

  it("reasonFor: 알 수 없는 장르도 폴백 문구로 안전하게 처리", () => {
    const t = makeTitle(3, ["우주활극"], 2_000_000);
    expect(reasonFor(t)).toContain("우주활극");
  });

  it("reasonFor: 장르가 없어도 동작한다", () => {
    const t = makeTitle(4, [], 2_000_000);
    expect(reasonFor(t).length).toBeGreaterThan(0);
  });

  it("popularityTier: 점수 경계로 결정적으로 분류된다", () => {
    expect(popularityTier(makeTitle(1, ["a"], 300_000_000))).toBe("legend");
    expect(popularityTier(makeTitle(2, ["a"], 12_000_000))).toBe("hit");
    expect(popularityTier(makeTitle(3, ["a"], 2_000_000))).toBe("rising");
    expect(popularityTier(makeTitle(4, ["a"], 10_000))).toBe("hidden");
  });

  it("tierLabel: 각 티어마다 비어있지 않은 한글 라벨", () => {
    expect(tierLabel(makeTitle(1, ["a"], 300_000_000))).toBe("전설의 흥행작");
    expect(tierLabel(makeTitle(4, ["a"], 1_000)).length).toBeGreaterThan(0);
  });

  it("filterByGenre: 장르 매칭만 남기고 미지정/미매칭은 전체 폴백", () => {
    expect(filterByGenre(pool, "로맨스").every((t) => t.genres.includes("로맨스"))).toBe(true);
    expect(filterByGenre(pool).length).toBe(pool.length);
    expect(filterByGenre(pool, "없음").length).toBe(pool.length); // 폴백
  });

  it("genreChips: 빈도순으로 중복 없이 장르를 모은다", () => {
    const chips = genreChips(pool);
    expect(chips[0]).toBe("로맨스"); // 3회로 최다
    expect(new Set(chips).size).toBe(chips.length); // 중복 없음
    expect(chips).toContain("액션");
  });
});
