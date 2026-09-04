import { describe, expect, it } from "vitest";

import {
  classifyTrafficDevice,
  classifyTrafficSource,
  isExcludedTrafficPath,
  normalizeTrafficCampaignToken,
  normalizeTrafficPath,
} from "./traffic-analytics-model";

describe("traffic analytics privacy boundaries", () => {
  it("keeps only the pathname and removes query or hash data", () => {
    expect(
      normalizeTrafficPath(
        "https://www.toonstudio.cloud/title/demo?email=private@example.com#episode",
      ),
    ).toBe("/title/demo");
  });

  it("rejects API paths and excludes administrator routes", () => {
    expect(() => normalizeTrafficPath("/api/admin/users")).toThrow(
      "수집할 수 없는 페이지 경로",
    );
    expect(isExcludedTrafficPath("/admin")).toBe(true);
    expect(isExcludedTrafficPath("/admin/members")).toBe(true);
    expect(isExcludedTrafficPath("/studio")).toBe(false);
    expect(normalizeTrafficPath("/apiculture")).toBe("/apiculture");
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

  it("normalizes campaign labels without retaining free-form personal data", () => {
    expect(normalizeTrafficCampaignToken(" launch user@example.com ")).toBe(
      "launch-user-example.com",
    );
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
