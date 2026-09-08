import { describe, expect, it } from "vitest";

import {
  buildStoryBeats,
  calculateStreak,
  createEmptyNowState,
  formatTimer,
  getKstDay,
  getMode,
  getThemeForDay,
  makeBriefText,
  NOW_PROGRESS_STEPS,
  parseNowState,
  serializeNowState,
  shiftIsoDate,
} from "./now";

describe("daily inspiration model", () => {
  it("uses the Korean calendar boundary and keeps theme selection deterministic", () => {
    const beforeMidnight = getKstDay(new Date("2026-09-08T14:59:59.000Z"));
    const afterMidnight = getKstDay(new Date("2026-09-08T15:00:00.000Z"));

    expect(beforeMidnight.iso).toBe("2026-09-08");
    expect(afterMidnight.iso).toBe("2026-09-09");
    expect(getKstDay(new Date("2026-09-08T15:00:00.000Z"), 1).iso).toBe("2026-09-08");
    expect(getThemeForDay(afterMidnight)).toEqual(getThemeForDay(getKstDay(new Date("2026-09-09T01:00:00.000Z"))));
  });

  it("sanitizes untrusted browser state and preserves only supported values", () => {
    const state = parseNowState(
      JSON.stringify({
        version: 99,
        mode: "mystery",
        progressByDate: {
          "2026-09-09": ["hook", "hook", "thumbnail", "unknown"],
          "not-a-date": ["draft"],
          __proto__: ["review"],
        },
        completedDates: ["2026-09-08", "invalid", "2026-09-08"],
        savedDates: ["2026-09-09", null, "2026-09-09"],
      }),
    );

    expect(state).toEqual({
      version: 2,
      mode: "mystery",
      progressByDate: { "2026-09-09": ["hook", "thumbnail"] },
      completedDates: ["2026-09-08"],
      savedDates: ["2026-09-09"],
    });
    expect(parseNowState("{broken")).toEqual(createEmptyNowState());
    expect(parseNowState(JSON.stringify({ mode: "unsupported" }))).toEqual(createEmptyNowState());
    expect(parseNowState("x".repeat(200_001))).toEqual(createEmptyNowState());
    expect(parseNowState(serializeNowState(state))).toEqual(state);
  });

  it("builds mode-specific five-panel beats and a portable brief", () => {
    const day = getKstDay(new Date("2026-09-09T03:00:00.000Z"));
    const theme = getThemeForDay(day);
    const mode = getMode("visual");
    const beats = buildStoryBeats(theme, mode);
    const brief = makeBriefText(day, theme, mode);

    expect(beats).toHaveLength(5);
    expect(beats.map((beat) => beat.label)).toEqual(["1컷", "2컷", "3컷", "4컷", "5컷"]);
    expect(beats[0]!.body).toContain(theme.place);
    expect(beats[1]!.body).toContain(theme.object);
    expect(brief).toContain(theme.title);
    expect(brief).toContain("연출 모드: 형식 실험");
    expect(brief).toContain("https://www.toonstudio.cloud/now");
  });

  it("calculates streaks without penalizing an unfinished current day", () => {
    const today = "2026-09-09";
    expect(calculateStreak(["2026-09-06", "2026-09-07", "2026-09-08"], today)).toBe(3);
    expect(calculateStreak(["2026-09-07", "2026-09-08", today], today)).toBe(3);
    expect(calculateStreak(["2026-09-07", today], today)).toBe(1);
    expect(calculateStreak([], today)).toBe(0);
    expect(calculateStreak([today], "invalid")).toBe(0);
  });

  it("formats focus time and validates date shifts", () => {
    expect(formatTimer(1200)).toBe("20:00");
    expect(formatTimer(1199.9)).toBe("19:59");
    expect(formatTimer(-5)).toBe("00:00");
    expect(formatTimer(Number.NaN)).toBe("00:00");
    expect(shiftIsoDate("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftIsoDate("2026-01-01", Number.NaN)).toBe("2026-01-01");
    expect(() => shiftIsoDate("bad", 1)).toThrow("Invalid ISO date");
    expect(NOW_PROGRESS_STEPS).toHaveLength(5);
  });
});
