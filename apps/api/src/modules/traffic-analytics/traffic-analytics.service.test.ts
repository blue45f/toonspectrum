import { describe, expect, it } from "vitest";

import {
  classifyTrafficDevice,
  classifyTrafficSource,
  isExcludedTrafficPath,
  normalizeTrafficCampaignToken,
  normalizeTrafficPath,
  normalizeTrafficScreenClass,
} from "./traffic-analytics-model";

describe("traffic analytics privacy boundaries", () => {
  it("keeps only the pathname and removes query or hash data", () => {
    expect(
      normalizeTrafficPath(
        "https://www.toonstudio.cloud/title/demo?email=private@example.com#episode",
      ),
    ).toBe("/title/demo");
  });

  it("rejects APIs, excludes admin, and templates private identifiers", () => {
    expect(() => normalizeTrafficPath("/api/admin/users")).toThrow(
      "수집할 수 없는 페이지 경로",
    );
    expect(isExcludedTrafficPath("/admin")).toBe(true);
    expect(isExcludedTrafficPath("/admin/members")).toBe(true);
    expect(isExcludedTrafficPath("/studio")).toBe(false);
    expect(normalizeTrafficPath("/apiculture")).toBe("/apiculture");
    expect(normalizeTrafficPath("/u/user-private-id")).toBe("/u/:userId");
    expect(normalizeTrafficPath("/create/work-private-id")).toBe(
      "/create/:id",
    );
    expect(normalizeTrafficPath("/create/series/series-private-id")).toBe(
      "/create/series/:id",
    );
    expect(normalizeTrafficPath("/studio/projects/private-id")).toBe(
      "/studio/*",
    );
  });

  it("classifies common devices without retaining the user-agent string", () => {
    expect(
      classifyTrafficDevice(
        "Mozilla/5.0 (Linux; Android 16; SM-S931N) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36",
      ),
    ).toMatchObject({
      browser: "Chrome",
      os: "Android",
      deviceType: "mobile",
      isBot: false,
    });
    expect(
      classifyTrafficDevice(
        "Mozilla/5.0 compatible Googlebot/2.1; +https://www.google.com/bot.html",
      ).isBot,
    ).toBe(true);
  });

  it("accepts only a coarse display class", () => {
    expect(normalizeTrafficScreenClass("small")).toBe("small");
    expect(normalizeTrafficScreenClass("LARGE")).toBe("large");
    expect(normalizeTrafficScreenClass("2560x1440")).toBe("unknown");
    expect(normalizeTrafficScreenClass(undefined)).toBe("unknown");
  });

  it("rejects PII-like campaign labels and normalizes safe labels", () => {
    expect(normalizeTrafficCampaignToken("launch newsletter")).toBe(
      "launch-newsletter",
    );
    expect(normalizeTrafficCampaignToken("user@example.com")).toBeNull();
    expect(normalizeTrafficCampaignToken("user%40example.com")).toBeNull();
    expect(normalizeTrafficCampaignToken("01012345678")).toBeNull();
    expect(normalizeTrafficCampaignToken("campaign?id=123")).toBeNull();
    expect(normalizeTrafficCampaignToken("한글 캠페인")).toBeNull();
  });

  it("prioritizes explicit campaign attribution over referrer inference", () => {
    expect(
      classifyTrafficSource({
        utmSource: "newsletter",
        utmMedium: "email",
        utmCampaign: "launch",
        referrerHost: "google.com",
      }),
    ).toEqual({
      source: "newsletter",
      medium: "email",
      campaign: "launch",
    });
    expect(
      classifyTrafficSource({
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        referrerHost: "search.naver.com",
      }),
    ).toEqual({
      source: "search.naver.com",
      medium: "organic",
      campaign: null,
    });
    expect(
      classifyTrafficSource({
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        referrerHost: "x.com",
      }),
    ).toEqual({ source: "x.com", medium: "social", campaign: null });
  });
});
