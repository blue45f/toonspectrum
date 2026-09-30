import { describe, expect, it } from "vitest";

import {
  EVENT_COUNTDOWN_URGENT_DAYS,
  getEventCountdown,
} from "./event-countdown";

const NOW = new Date("2026-09-30T12:00:00+09:00");
const isoAfterDays = (days: number) =>
  new Date(NOW.getTime() + days * 86_400_000).toISOString();

describe("getEventCountdown", () => {
  it("endsAt이 없으면 null을 반환한다", () => {
    expect(getEventCountdown(null, NOW)).toBeNull();
    expect(getEventCountdown(undefined, NOW)).toBeNull();
  });

  it("파싱할 수 없는 날짜면 null을 반환한다", () => {
    expect(getEventCountdown("not-a-date", NOW)).toBeNull();
  });

  it("이미 지난 마감이면 null을 반환한다", () => {
    expect(getEventCountdown(isoAfterDays(-1), NOW)).toBeNull();
  });

  it("남은 일수를 내림으로 계산한다", () => {
    // 5일 12시간 뒤 -> D-5, 임박 아님
    const fiveAndHalf = new Date(NOW.getTime() + 5.5 * 86_400_000).toISOString();
    expect(getEventCountdown(fiveAndHalf, NOW)).toEqual({
      daysLeft: 5,
      urgent: false,
      isToday: false,
    });
  });

  it("D-3 이하면 urgent가 true다", () => {
    expect(getEventCountdown(isoAfterDays(3), NOW)?.urgent).toBe(true);
    expect(getEventCountdown(isoAfterDays(2), NOW)).toEqual({
      daysLeft: 2,
      urgent: true,
      isToday: false,
    });
  });

  it("마감 당일은 D-day(isToday)이며 urgent다", () => {
    const inTwelveHours = new Date(NOW.getTime() + 12 * 3_600_000).toISOString();
    expect(getEventCountdown(inTwelveHours, NOW)).toEqual({
      daysLeft: 0,
      urgent: true,
      isToday: true,
    });
  });

  it("임박 기준 상수는 3이다", () => {
    expect(EVENT_COUNTDOWN_URGENT_DAYS).toBe(3);
  });
});
