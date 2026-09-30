import { describe, expect, it } from "vitest";

import {
  drawFortuneTarotSpread,
  getTarotSpread,
  TAROT_SPREADS,
} from "./tarot-deck";

describe("TAROT_SPREADS", () => {
  it("4종 스프레드를 정의한다", () => {
    expect(Object.keys(TAROT_SPREADS)).toEqual(["one", "three", "celtic-cross", "relationship"]);
    expect(TAROT_SPREADS["celtic-cross"].positions).toHaveLength(10);
    expect(TAROT_SPREADS.relationship.positions).toHaveLength(6);
    expect(TAROT_SPREADS.one.positions).toHaveLength(1);
    expect(TAROT_SPREADS.three.positions).toHaveLength(3);
  });
  it("모든 위치에 한/영 의미가 있다", () => {
    for (const spread of Object.values(TAROT_SPREADS)) {
      expect(spread.ko.length).toBeGreaterThan(0);
      expect(spread.en.length).toBeGreaterThan(0);
      for (const pos of spread.positions) {
        expect(pos.ko.length).toBeGreaterThan(0);
        expect(pos.en.length).toBeGreaterThan(0);
        expect(pos.meaningKo.length).toBeGreaterThan(0);
        expect(pos.meaningEn.length).toBeGreaterThan(0);
      }
    }
  });
  it("켈틱 크로스 10위치가 전통 순서다", () => {
    const names = TAROT_SPREADS["celtic-cross"].positions.map((p) => p.ko);
    expect(names[0]).toBe("현재 상황");
    expect(names[1]).toBe("장애물");
    expect(names[9]).toBe("최종 결과");
  });
});

describe("getTarotSpread", () => {
  it("알 수 없는 id는 원 카드를 반환한다", () => {
    expect(getTarotSpread("nope").id).toBe("one");
  });
});

describe("drawFortuneTarotSpread", () => {
  it("켈틱 크로스 10장을 중복 없이 뽑는다", () => {
    const cards = drawFortuneTarotSpread("full-78", "2026-09-30", 3, "celtic-cross");
    expect(cards).toHaveLength(10);
    const ids = cards.map((c) => c.id);
    expect(new Set(ids).size).toBe(10);
    expect(cards[0].position).toBe("현재 상황");
    expect(cards[9].position).toBe("최종 결과");
    for (const c of cards) {
      expect(c.positionMeaningKo.length).toBeGreaterThan(0);
      expect(["upright", "reversed"]).toContain(c.type);
      expect(c.keywords.length).toBeGreaterThan(0);
    }
  });
  it("관계 스프레드 6장을 뽑는다", () => {
    const cards = drawFortuneTarotSpread("full-78", "2026-09-30", 0, "relationship");
    expect(cards).toHaveLength(6);
    expect(cards[0].position).toBe("나");
    expect(cards[5].position).toBe("관계의 전망");
  });
  it("major-22 덱도 동작한다", () => {
    const cards = drawFortuneTarotSpread("major-22", "2026-09-30", 5, "three");
    expect(cards).toHaveLength(3);
    for (const c of cards) expect(c.id).toBeLessThan(22);
  });
  it("결정적이다 (같은 입력 → 같은 결과)", () => {
    const a = drawFortuneTarotSpread("full-78", "2026-09-30", 3, "celtic-cross");
    const b = drawFortuneTarotSpread("full-78", "2026-09-30", 3, "celtic-cross");
    expect(a).toEqual(b);
  });
  it("날짜가 다르면 결과가 다르다", () => {
    const a = drawFortuneTarotSpread("full-78", "2026-09-30", 3, "celtic-cross");
    const b = drawFortuneTarotSpread("full-78", "2026-10-01", 3, "celtic-cross");
    expect(a.map((c) => c.id)).not.toEqual(b.map((c) => c.id));
  });
  it("잘못된 입력에 에러를 던진다", () => {
    expect(() => drawFortuneTarotSpread("full-78", "2026-09-30", -1, "one")).toThrow();
    expect(() => drawFortuneTarotSpread("full-78", "2026-09-30", 99, "one")).toThrow();
  });
});
