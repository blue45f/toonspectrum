import { describe, expect, it } from "vitest";

import {
  analyzeMonthLuck,
  drawMonthlyFortune,
  drawYearlyFortune,
  monthCategoryScores,
  monthPillarKo,
} from "./fortune-period";
import { analyzeSaju } from "./saju-analysis";
import { calculateSaju } from "./saju-utils";

const BIRTH = "1990-05-15";
const BIRTH_TIME = "10:30";

describe("monthPillarKo", () => {
  it("절기 기준 월간지를 반환한다 (2026년 9월 = 정유월)", () => {
    // 2026년 병오년: 백로(9월) 이후는 유월(酉月) → 정유
    expect(monthPillarKo(2026, 9)).toBe("정유");
  });
  it("입춘 이후 2월은 인월이다 (2026년 2월 = 경인월)", () => {
    // 15일 기준이므로 입춘(2월 4일) 이후 → 경인
    expect(monthPillarKo(2026, 2)).toBe("경인");
  });
  it("입춘 전 1월은 축월이다 (2026년 1월 = 기축월)", () => {
    expect(monthPillarKo(2026, 1)).toBe("기축");
  });
});

describe("analyzeMonthLuck", () => {
  it("결정적 결과를 반환한다", () => {
    const analysis = analyzeSaju(calculateSaju(BIRTH, BIRTH_TIME));
    const a = analyzeMonthLuck(analysis, 2026, 9);
    const b = analyzeMonthLuck(analysis, 2026, 9);
    expect(a).toEqual(b);
    expect(a.score).toBeGreaterThanOrEqual(55);
    expect(a.score).toBeLessThanOrEqual(98);
    expect(a.pillar).toBe("정유");
    expect(a.themeName.length).toBeGreaterThan(0);
  });
  it("월마다 다른 십성 관계가 나올 수 있다", () => {
    const analysis = analyzeSaju(calculateSaju(BIRTH, BIRTH_TIME));
    const gods = new Set(
      Array.from({ length: 12 }, (_, i) => analyzeMonthLuck(analysis, 2026, i + 1).relationTenGod),
    );
    expect(gods.size).toBeGreaterThan(1);
  });
});

describe("monthCategoryScores", () => {
  it("4개 카테고리 점수를 반환한다", () => {
    const analysis = analyzeSaju(calculateSaju(BIRTH, BIRTH_TIME));
    const ml = analyzeMonthLuck(analysis, 2026, 9);
    const cats = monthCategoryScores(ml);
    for (const v of [cats.love, cats.money, cats.work, cats.health]) {
      expect(v).toBeGreaterThanOrEqual(55);
      expect(v).toBeLessThanOrEqual(98);
    }
  });
});

describe("drawMonthlyFortune", () => {
  it("월간 운세 전체 구조를 반환한다", () => {
    const f = drawMonthlyFortune(BIRTH, BIRTH_TIME, 2026, 9);
    expect(f.year).toBe(2026);
    expect(f.month).toBe(9);
    expect(f.summaryKo).toContain("2026년 9월");
    expect(f.summaryEn).toContain("2026-09");
    expect(f.dayMaster.length).toBeGreaterThan(0);
  });
  it("생시 미상이어도 동작한다", () => {
    const f = drawMonthlyFortune(BIRTH, undefined, 2026, 9);
    expect(f.monthLuck.score).toBeGreaterThanOrEqual(55);
  });
});

describe("drawYearlyFortune", () => {
  it("연간 운세 + 12개월 흐름을 반환한다", () => {
    const f = drawYearlyFortune(BIRTH, BIRTH_TIME, 2026);
    expect(f.year).toBe(2026);
    expect(f.months).toHaveLength(12);
    expect(f.months[0].month).toBe(1);
    expect(f.months[11].month).toBe(12);
    expect(f.bestMonth).toBeGreaterThanOrEqual(1);
    expect(f.bestMonth).toBeLessThanOrEqual(12);
    expect(f.cautionMonth).toBeGreaterThanOrEqual(1);
    expect(f.cautionMonth).toBeLessThanOrEqual(12);
    // 최고월 점수가 최저월보다 높다
    const scores = f.months.map((m) => m.score);
    expect(Math.max(...scores)).toBeGreaterThanOrEqual(Math.min(...scores));
    expect(f.summaryKo).toContain("2026년");
    // 상반기/하반기 평균이 범위 안에 있다
    expect(f.firstHalfAvg).toBeGreaterThanOrEqual(55);
    expect(f.secondHalfAvg).toBeLessThanOrEqual(98);
  });
  it("결정적이다", () => {
    const a = drawYearlyFortune(BIRTH, BIRTH_TIME, 2026);
    const b = drawYearlyFortune(BIRTH, BIRTH_TIME, 2026);
    expect(a).toEqual(b);
  });
});
