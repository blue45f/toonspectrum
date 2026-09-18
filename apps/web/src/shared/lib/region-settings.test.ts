import { describe, expect, it } from "vitest";

import {
  chooseNewestRegionSettings,
  createDetectedRegionSettings,
  parseRegionSettings,
  patchRegionSettings,
  resolveRegionPolicy,
} from "./region-settings";

const T0 = new Date("2026-09-18T00:00:00.000Z");
const T1 = new Date("2026-09-18T01:00:00.000Z");

describe("region settings", () => {
  it.each([
    ["ko", "ko-KR", "Asia/Seoul", "KR", "KRW"],
    ["en", "en-US", "America/New_York", "US", "USD"],
    ["ja", "ja-JP", "Asia/Tokyo", "JP", "JPY"],
  ])("detects %s defaults without coupling later edits", (
    language, locale, timezone, country, currency,
  ) => {
    expect(createDetectedRegionSettings({
      language, locale, timezone, now: T0,
    })).toMatchObject({ language, country, currency, timezone });
  });

  it("keeps region fields independent", () => {
    const base = createDetectedRegionSettings({
      language: "ko",
      locale: "ko-KR",
      timezone: "Asia/Seoul",
      now: T0,
    });
    const changed = patchRegionSettings(base, { country: "US" }, T1);
    expect(changed?.country).toBe("US");
    expect(changed?.language).toBe("ko");
    expect(changed?.currency).toBe("KRW");
    expect(changed?.timezone).toBe("Asia/Seoul");
  });

  it("rejects malformed persisted settings", () => {
    expect(parseRegionSettings({
      version: 1,
      country: "KOREA",
      language: "ko",
      currency: "KRW",
      timezone: "Asia/Seoul",
      updatedAt: T0.toISOString(),
    })).toBeNull();
  });

  it("resolves explicit policies and a global fallback", () => {
    expect(resolveRegionPolicy({ country: "KR" }).privacy.regime).toBe("pipa");
    expect(resolveRegionPolicy({ country: "US" }).commerce.taxMode).toBe("us-sales-tax");
    expect(resolveRegionPolicy({ country: "JP" }).auth.ageVerification).toBe("standard");
    expect(resolveRegionPolicy({ country: "DE" }).key).toBe("DEFAULT");
  });

  it("keeps the most recently changed login preference", () => {
    const older = createDetectedRegionSettings({
      language: "ko",
      locale: "ko-KR",
      timezone: "Asia/Seoul",
      now: T0,
    });
    const newer = patchRegionSettings(older, { currency: "USD" }, T1);
    expect(chooseNewestRegionSettings(older, newer)).toEqual(newer);
    expect(chooseNewestRegionSettings(newer, older)).toEqual(newer);
  });
});
