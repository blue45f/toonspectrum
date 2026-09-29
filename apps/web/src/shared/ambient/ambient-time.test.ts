import { describe, expect, it } from "vitest";

import {
  AMBIENT_SEASONS,
  AMBIENT_TIME_PHASES,
  minutesUntilPhaseChange,
  phaseForDate,
  phaseForHour,
  seasonForDate,
  seasonForMonth,
  seasonParticleFor,
  tintProfileForPhase,
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

  it("음수·24 초과 시각을 정규화한다", () => {
    expect(phaseForHour(24)).toBe("night"); // 0시
    expect(phaseForHour(29)).toBe("dawn"); // 5시
    expect(phaseForHour(-1)).toBe("night"); // 23시
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
    expect(seasonForDate(new Date(2026, 3, 15))).toBe("spring"); // 4월
    expect(seasonForDate(new Date(2026, 9, 30))).toBe("autumn"); // 10월
  });
});

describe("seasonParticleFor", () => {
  it("계절별 파티클을 반환한다", () => {
    expect(seasonParticleFor("spring", "day")).toBe("petal");
    expect(seasonParticleFor("summer", "night")).toBe("firefly");
    expect(seasonParticleFor("summer", "day")).toBe("none");
    expect(seasonParticleFor("autumn", "evening")).toBe("leaf");
    expect(seasonParticleFor("winter", "morning")).toBe("snowflake");
  });
});

describe("tintProfileForPhase", () => {
  it("모든 시간대에 프로필이 있다", () => {
    for (const phase of AMBIENT_TIME_PHASES) {
      const profile = tintProfileForPhase(phase);
      expect(profile.phase).toBe(phase);
      expect(profile.tintOpacity).toBeGreaterThanOrEqual(0);
      expect(profile.tintOpacity).toBeLessThanOrEqual(1);
    }
  });

  it("밤은 어둡고 낮은 틴트가 없다", () => {
    expect(tintProfileForPhase("night").isDark).toBe(true);
    expect(tintProfileForPhase("day").tintOpacity).toBe(0);
  });
});

describe("minutesUntilPhaseChange", () => {
  it("다음 경계까지 남은 분을 반환한다", () => {
    // 6:30 → 7:00 아침까지 30분
    expect(minutesUntilPhaseChange(new Date(2026, 8, 30, 6, 30))).toBe(30);
    // 12:00 → 16:00 저녁까지 240분
    expect(minutesUntilPhaseChange(new Date(2026, 8, 30, 12, 0))).toBe(240);
    // 20:00 → 다음날 5:00까지 540분
    expect(minutesUntilPhaseChange(new Date(2026, 8, 30, 20, 0))).toBe(540);
  });
});

describe("상수", () => {
  it("5개 시간대·4개 계절", () => {
    expect(AMBIENT_TIME_PHASES).toHaveLength(5);
    expect(AMBIENT_SEASONS).toHaveLength(4);
  });
});
