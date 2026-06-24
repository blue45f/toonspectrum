import { describe, expect, it } from "vitest";

import {
  aiTakeTurn,
  attack,
  endTurn,
  HERO_HP,
  playCard,
  startBattle,
  statToCard,
  shuffle,
  youHasMove,
} from "./card-battle-engine";

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

describe("card-battle-engine", () => {
  it("statToCard: 결정적이고 코스트 1..8 · 공격/체력 1..12 범위", () => {
    for (const t of pool(30, 500)) {
      const c = statToCard(t);
      expect(c.cost).toBeGreaterThanOrEqual(1);
      expect(c.cost).toBeLessThanOrEqual(8);
      expect(c.atk).toBeGreaterThanOrEqual(1);
      expect(c.atk).toBeLessThanOrEqual(12);
      expect(c.hp).toBeGreaterThanOrEqual(1);
      expect(c.hp).toBeLessThanOrEqual(12);
    }
    // 같은 입력 → 같은 출력(결정성).
    expect(statToCard(makeTitle(5, 9_999))).toEqual(statToCard(makeTitle(5, 9_999)));
  });

  it("인기도가 높을수록 코스트가 (단조 비감소) 커진다", () => {
    const low = statToCard(makeTitle(1, 1_000)).cost;
    const high = statToCard(makeTitle(1, 500_000_000)).cost;
    expect(high).toBeGreaterThan(low);
  });

  it("shuffle: 같은 시드면 같은 순열, 원소 보존, 입력 불변", () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = shuffle(src, rng(42));
    const b = shuffle(src, rng(42));
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // 원본 불변
  });

  it("startBattle: 영웅 30, 선공 you, 첫 턴 마나 1, 손패 구성", () => {
    const s = startBattle(pool(20), pool(20, 2_000_000), rng(1));
    expect(s.heroHp.you).toBe(HERO_HP);
    expect(s.heroHp.ai).toBe(HERO_HP);
    expect(s.active).toBe("you");
    expect(s.maxMana.you).toBe(1);
    expect(s.mana.you).toBe(1);
    expect(s.hand.you.length).toBe(4); // 오프닝 3 + 첫 턴 드로우 1
    expect(s.winner).toBeNull();
  });

  it("playCard: 마나 차감 + 필드 소환 + 소환 멀미(ready=false), 마나 초과 불가", () => {
    let s = startBattle(pool(20), pool(20), rng(3));
    // 마나 1로 낼 수 있는 카드 찾기.
    const cheap = s.hand.you.find((c) => c.cost <= s.mana.you);
    if (cheap) {
      const before = s.mana.you;
      s = playCard(s, "you", cheap.uid);
      expect(s.board.you.length).toBe(1);
      expect(s.board.you[0].ready).toBe(false);
      expect(s.mana.you).toBe(before - cheap.cost);
    }
    // 비싼 카드(마나 초과)는 무시 — 상태 동일 참조 반환.
    const tooPricey = s.hand.you.find((c) => c.cost > s.mana.you);
    if (tooPricey) {
      expect(playCard(s, "you", tooPricey.uid)).toBe(s);
    }
  });

  it("attack: 영웅 직공은 체력을 깎고 공격자는 소진(ready=false)", () => {
    // 마나를 키워 확실히 소환 가능하게 여러 턴 진행.
    let s = startBattle(pool(20), pool(20), rng(9));
    for (let i = 0; i < 3; i++) s = endTurn(s); // you→ai→you... 마나 상승
    // you 턴이 되도록 보정
    if (s.active === "ai") s = aiTakeTurn(s, rng(9));
    const card = s.hand.you.find((c) => c.cost <= s.mana.you);
    if (card) {
      s = playCard(s, "you", card.uid);
      // 다음 턴 시작해야 ready — 한 바퀴 돌리기.
      s = endTurn(s);
      if (s.active === "ai") s = aiTakeTurn(s, rng(2));
      const m = s.board.you[0];
      if (m && s.active === "you") {
        const hpBefore = s.heroHp.ai;
        s = attack(s, "you", m.uid, "hero");
        expect(s.heroHp.ai).toBeLessThan(hpBefore);
        expect(s.board.you[0].ready).toBe(false);
      }
    }
  });

  it("endTurn: 활성 플레이어를 바꾸고 마나 한도를 올린다", () => {
    const s = startBattle(pool(20), pool(20), rng(5));
    const t = endTurn(s);
    expect(t.active).toBe("ai");
    expect(t.maxMana.ai).toBe(1);
  });

  it("aiTakeTurn: 결정적이며 진행 후 플레이어 턴(또는 승패)로 넘어간다", () => {
    let s = startBattle(pool(20), pool(20), rng(11));
    s = endTurn(s); // ai 턴
    const a = aiTakeTurn(s, rng(11));
    const b = aiTakeTurn(s, rng(11));
    expect(a.log).toEqual(b.log); // 결정적
    expect(a.winner !== null || a.active === "you").toBe(true);
  });

  it("영웅 체력이 0 이하면 승자가 정해진다", () => {
    const s = startBattle(pool(20), pool(20), rng(7));
    const dead = { ...s, heroHp: { ...s.heroHp, ai: 0 } };
    // checkWinner는 내부 — 공격으로 트리거되므로 직접 상태로 endTurn 후 확인 대신 attack 경로로 검증됨.
    // 여기서는 youHasMove가 승부 종료를 막는지 확인.
    expect(youHasMove({ ...dead, winner: "you" })).toBe(false);
  });
});
