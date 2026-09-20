import { afterEach, describe, expect, it, vi } from "vitest";

import { buildFortuneReading, drawFortuneTarot, drawTarot, fortunePeriodWindow, fortuneReadingText, fortuneTarotCatalog, localFortuneHoroscope, FORTUNE_ZODIAC_IDS } from "./index";

afterEach(() => vi.useRealTimers());
describe("versioned, local-only fortune enrichment", () => {
  it("preserves classic cards at the same KST reference day", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-20T01:00:00Z"));
    for (const spread of ["one", "three"] as const) {
      const classic = await drawTarot([], "leona", 7, spread);
      expect(await drawFortuneTarot("major-22", "2026-09-20", 7, spread)).toEqual(classic.cards);
    }
  });
  it("uses selected date instead of wall-clock date and records the deck", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-20T14:59:59Z"));
    const first = await buildFortuneReading("tarot-three", { date: "2024-02-29", pick: 4 });
    vi.setSystemTime(new Date("2026-09-21T15:00:00Z"));
    const replay = await buildFortuneReading("tarot-three", { date: "2024-02-29", pick: 4 });
    expect(first.cards).toEqual(replay.cards);
    expect(first.context).toMatchObject({ referenceDate: "2024-02-29", timeZone: "Asia/Seoul", tarotDeck: "major-22" });
    expect(first.cards).toEqual(await drawFortuneTarot("major-22", "2024-02-29", 4, "three"));
  });
  it("contains 78 unique IDs and independent editable copies", () => {
    const catalog = fortuneTarotCatalog();
    expect(catalog).toHaveLength(78); expect(new Set(catalog.map((c) => c.id)).size).toBe(78);
    expect(catalog[22].nameEn).toBe("Ace of Wands"); expect(catalog[77].nameEn).toBe("King of Pentacles");
    catalog[0].keywords[0] = "changed";
    expect(fortuneTarotCatalog()[0].keywords[0]).not.toBe("changed");
  });
  it("draws unique replayable full-deck cards with both orientations", async () => {
    const seen = new Set<number>(), orientations = new Set<string>();
    for (let day = 1; day <= 28; day += 1) for (let pick = 0; pick < 22; pick += 1) {
      const cards = await drawFortuneTarot("full-78", `2026-02-${String(day).padStart(2, "0")}`, pick, "three");
      expect(new Set(cards.map((c) => c.id)).size).toBe(3);
      cards.forEach((c) => { seen.add(c.id); orientations.add(c.type); expect(c.description.length).toBeGreaterThan(25); });
    }
    expect(seen.size).toBe(78); expect(orientations.size).toBe(2);
    expect(await drawFortuneTarot("full-78", "2026-09-20", 3, "three")).toEqual(await drawFortuneTarot("full-78", "2026-09-20", 3, "three"));
  });
  it("rejects invalid dates and selections", async () => {
    expect(await drawFortuneTarot("full-78", "2026-02-28", 77, "one")).toHaveLength(1);
    await expect(drawFortuneTarot("major-22", "2026-02-28", 22, "one")).rejects.toThrow();
    await expect(drawFortuneTarot("full-78", "2026-02-30", 0, "one")).rejects.toThrow();
    await expect(drawFortuneTarot("full-78", "2026-02-28", 78, "one")).rejects.toThrow();
  });
  it.each([
    ["2024-02-29", "monthly", "2024-02-01", "2024-03-01"],
    ["2026-01-01", "weekly", "2025-12-29", "2026-01-05"],
    ["2050-12-31", "daily", "2050-12-31", "2051-01-01"],
  ] as const)("bounds %s %s without host timezone", (date, period, start, end) => {
    expect(fortunePeriodWindow(date, period)).toEqual({ periodStart: start, periodEndExclusive: end });
  });
  it("supplies deterministic Korean local fallback for every sign and period", () => {
    for (const sign of FORTUNE_ZODIAC_IDS) for (const period of ["daily", "weekly", "monthly"] as const) {
      const result = localFortuneHoroscope(sign, period, "2026-09-20");
      expect(result).toEqual(localFortuneHoroscope(sign, period, "2026-09-20")); expect(result.source).toBe("local");
    }
  });
  it("keeps birth information out of exported zodiac readings", async () => { const r = await buildFortuneReading("zodiac", { birth: { date: "1996-02-01", time: "08:00" }, date: "2026-09-20" }); expect(r.zodiacSign).toBe("aquarius"); expect(fortuneReadingText(r)).not.toContain("1996-02-01"); });
});
