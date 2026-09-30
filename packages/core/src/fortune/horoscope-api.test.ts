import { describe, expect, it, vi } from "vitest";

import {
  clearHoroscopeCache,
  fetchGlobalHoroscope,
  summarizeHoroscopeKo,
} from "./horoscope-api";

function mockFetch(json: unknown, ok = true) {
  return vi.fn(async () => ({
    ok,
    json: async () => json,
  }));
}

describe("fetchGlobalHoroscope", () => {
  it("API 성공 시 운세 데이터를 반환한다", async () => {
    clearHoroscopeCache();
    const fetchImpl = mockFetch({
      data: { date: "2026-09-30", period: "daily", sign: "Aries", horoscope: "Great opportunities await." },
    });
    const result = await fetchGlobalHoroscope("aries", "daily", fetchImpl);
    expect(result).not.toBeNull();
    expect(result?.sign).toBe("aries");
    expect(result?.text).toContain("opportunities");
    expect(result?.source).toBe("horoscope-app-api");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("같은 키로 두 번 호출하면 캐시를 사용한다", async () => {
    clearHoroscopeCache();
    const fetchImpl = mockFetch({
      data: { date: "2026-09-30", period: "daily", sign: "Taurus", horoscope: "A calm day." },
    });
    await fetchGlobalHoroscope("taurus", "daily", fetchImpl);
    await fetchGlobalHoroscope("taurus", "daily", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("API 실패 시 null을 반환한다", async () => {
    clearHoroscopeCache();
    const result = await fetchGlobalHoroscope("aries", "daily", mockFetch({}, false));
    expect(result).toBeNull();
  });

  it("빈 운세 텍스트면 null을 반환한다", async () => {
    clearHoroscopeCache();
    const result = await fetchGlobalHoroscope(
      "gemini",
      "daily",
      mockFetch({ data: { date: "2026-09-30", sign: "Gemini", horoscope: "  " } }),
    );
    expect(result).toBeNull();
  });

  it("fetch가 throw해도 null을 반환한다", async () => {
    clearHoroscopeCache();
    const bad = vi.fn(async () => {
      throw new Error("network down");
    });
    const result = await fetchGlobalHoroscope("leo", "daily", bad);
    expect(result).toBeNull();
  });

  it("fetch 구현이 없으면 null을 반환한다", async () => {
    clearHoroscopeCache();
    const orig = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = undefined;
    try {
      const result = await fetchGlobalHoroscope("virgo");
      expect(result).toBeNull();
    } finally {
      (globalThis as { fetch?: unknown }).fetch = orig;
    }
  });
});

describe("summarizeHoroscopeKo", () => {
  it("긍정 키워드가 많으면 positive", () => {
    const gist = summarizeHoroscopeKo("Great opportunities and success bring joy and creative energy today.");
    expect(gist.sentiment).toBe("positive");
    expect(gist.keywordsKo).toContain("기회");
    expect(gist.summaryKo).toContain("세계의 점성가들");
  });

  it("주의 키워드가 많으면 caution", () => {
    const gist = summarizeHoroscopeKo("Be careful to avoid conflict and stress. Patience is needed.");
    expect(gist.sentiment).toBe("caution");
    expect(gist.keywordsKo).toContain("신중");
  });

  it("섞여 있으면 mixed", () => {
    const gist = summarizeHoroscopeKo("Opportunities and creative energy arise, but be careful about stress.");
    expect(gist.sentiment).toBe("mixed");
  });

  it("키워드가 없어도 요약은 만든다", () => {
    const gist = summarizeHoroscopeKo("The moon is in the sky.");
    expect(gist.summaryKo.length).toBeGreaterThan(0);
    expect(gist.keywordsKo.length).toBeLessThanOrEqual(3);
  });

  it("결정적이다", () => {
    const text = "Success and love bring harmony and growth.";
    expect(summarizeHoroscopeKo(text)).toEqual(summarizeHoroscopeKo(text));
  });
});
