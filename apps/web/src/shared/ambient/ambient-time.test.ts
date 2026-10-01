import { describe, expect, it } from "vitest";

import {
  AMBIENT_SEASONS,
  AMBIENT_TIME_PHASES,
  isDaylightPhase,
  phaseForDate,
  phaseForHour,
  seasonForDate,
  seasonForMonth,
} from "./ambient-time";

describe("phaseForHour", () => {
  it.each([
    [5, "dawn"],
    [6, "dawn"],
    [7, "morning"],
    [10, "morning"],
    [11, "day"],
    [15, "day"],
    [16, "evening"],
    [18, "evening"],
    [19, "night"],
    [23, "night"],
    [0, "night"],
    [4, "night"],
  ])("%i시 → %s", (hour, expected) => {
    expect(phaseForHour(hour)).toBe(expected);
  });

  it("음수·24 이상 시각을 정규화한다", () => {
    expect(phaseForHour(24)).toBe("night");
    expect(phaseForHour(29)).toBe("dawn");
    expect(phaseForHour(-1)).toBe("night");
  });
});

describe("phaseForDate", () => {
  it("Date의 시각을 사용한다", () => {
    expect(phaseForDate(new Date(2026, 8, 30, 6, 30))).toBe("dawn");
    expect(phaseForDate(new Date(2026, 8, 30, 12, 0))).toBe("day");
    expect(phaseForDate(new Date(2026, 8, 30, 22, 0))).toBe("night");
  });
});

describe("seasonForMonth", () => {
  it.each([
    [3, "spring"], [4, "spring"], [5, "spring"],
    [6, "summer"], [7, "summer"], [8, "summer"],
    [9, "autumn"], [10, "autumn"], [11, "autumn"],
    [12, "winter"], [1, "winter"], [2, "winter"],
  ])("%i월 → %s", (month, expected) => {
    expect(seasonForMonth(month)).toBe(expected);
  });
});

describe("seasonForDate", () => {
  it("Date의 월을 사용한다", () => {
    expect(seasonForDate(new Date(2026, 3, 15))).toBe("spring");
    expect(seasonForDate(new Date(2026, 9, 30))).toBe("autumn");
  });
});

describe("isDaylightPhase", () => {
  it("밤만 해가 없는 시간대다", () => {
    expect(AMBIENT_TIME_PHASES.filter((phase) => !isDaylightPhase(phase))).toEqual(["night"]);
  });
});

describe("상수", () => {
  it("5개 시간대·4개 계절", () => {
    expect(AMBIENT_TIME_PHASES).toHaveLength(5);
    expect(AMBIENT_SEASONS).toHaveLength(4);
  });
});
