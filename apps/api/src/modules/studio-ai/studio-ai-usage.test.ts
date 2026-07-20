import { describe, expect, it } from "vitest";

import {
  attemptStudioAiQuotaReservation,
  DEFAULT_STUDIO_AI_DAILY_REQUEST_LIMIT,
  DEFAULT_STUDIO_AI_DAILY_TOKEN_LIMIT,
  DEFAULT_STUDIO_AI_GLOBAL_DAILY_REQUEST_LIMIT,
  DEFAULT_STUDIO_AI_GLOBAL_DAILY_TOKEN_LIMIT,
  estimateStudioAiTokenReservation,
  resolveStudioAiQuotaLimits,
  settleStudioAiQuotaReservation,
  studioAiQuotaTokenCharge,
  utcUsageDay,
} from "./studio-ai-usage";

describe("Studio AI usage quota helpers", () => {
  it("uses conservative backwards-compatible defaults and bounded overrides", () => {
    expect(resolveStudioAiQuotaLimits({})).toEqual({
      dailyRequests: DEFAULT_STUDIO_AI_DAILY_REQUEST_LIMIT,
      dailyTokens: DEFAULT_STUDIO_AI_DAILY_TOKEN_LIMIT,
      globalDailyRequests: DEFAULT_STUDIO_AI_GLOBAL_DAILY_REQUEST_LIMIT,
      globalDailyTokens: DEFAULT_STUDIO_AI_GLOBAL_DAILY_TOKEN_LIMIT,
    });
    expect(
      resolveStudioAiQuotaLimits({
        STUDIO_AI_DAILY_REQUEST_LIMIT: "25",
        STUDIO_AI_DAILY_TOKEN_LIMIT: "75000",
        STUDIO_AI_GLOBAL_DAILY_REQUEST_LIMIT: "1000",
        STUDIO_AI_GLOBAL_DAILY_TOKEN_LIMIT: "5000000",
      })
    ).toEqual({
      dailyRequests: 25,
      dailyTokens: 75_000,
      globalDailyRequests: 1_000,
      globalDailyTokens: 5_000_000,
    });
    expect(
      resolveStudioAiQuotaLimits({
        STUDIO_AI_DAILY_REQUEST_LIMIT: "invalid",
        STUDIO_AI_DAILY_TOKEN_LIMIT: "0",
        STUDIO_AI_GLOBAL_DAILY_REQUEST_LIMIT: "-1",
        STUDIO_AI_GLOBAL_DAILY_TOKEN_LIMIT: "invalid",
      })
    ).toEqual({
      dailyRequests: DEFAULT_STUDIO_AI_DAILY_REQUEST_LIMIT,
      dailyTokens: DEFAULT_STUDIO_AI_DAILY_TOKEN_LIMIT,
      globalDailyRequests: DEFAULT_STUDIO_AI_GLOBAL_DAILY_REQUEST_LIMIT,
      globalDailyTokens: DEFAULT_STUDIO_AI_GLOBAL_DAILY_TOKEN_LIMIT,
    });
  });

  it("changes quota days exactly at UTC midnight regardless of local offsets", () => {
    expect(utcUsageDay(new Date("2026-07-10T23:59:59.999Z"))).toBe("2026-07-10");
    expect(utcUsageDay(new Date("2026-07-11T00:00:00.000Z"))).toBe("2026-07-11");
    expect(utcUsageDay(new Date("2026-07-11T08:59:59+09:00"))).toBe("2026-07-10");
    expect(utcUsageDay(new Date("2026-07-11T09:00:00+09:00"))).toBe("2026-07-11");
  });

  it("reserves a conservative byte-fallback prompt bound plus maximum completion", () => {
    const ascii = estimateStudioAiTokenReservation({
      systemScope: "scope",
      system: "system",
      user: "user",
      maxCompletionTokens: 600,
    });
    const korean = estimateStudioAiTokenReservation({
      systemScope: "범위",
      system: "지시",
      user: "사용자",
      maxCompletionTokens: 600,
    });
    expect(ascii).toBeGreaterThan(600);
    expect(korean).toBeGreaterThan(ascii);
  });

  it("uses returned total or complete components and fails closed for missing usage", () => {
    expect(studioAiQuotaTokenCharge({ totalTokens: 20 }, 900)).toBe(20);
    expect(studioAiQuotaTokenCharge({ promptTokens: 12, completionTokens: 8 }, 900)).toBe(20);
    expect(studioAiQuotaTokenCharge({ promptTokens: 12 }, 900)).toBe(900);
    expect(studioAiQuotaTokenCharge({}, 900)).toBe(900);
  });

  it("deterministically mirrors atomic request and token admission under contention", () => {
    const limits = { dailyRequests: 3, dailyTokens: 1_000 };
    let state = { requestCount: 0, tokenCount: 0, reservedTokens: 0 };
    const decisions = Array.from({ length: 10 }, () => {
      const decision = attemptStudioAiQuotaReservation(state, 300, limits);
      state = decision.state;
      return decision.allowed;
    });

    expect(decisions).toEqual([true, true, true, false, false, false, false, false, false, false]);
    expect(state).toEqual({ requestCount: 3, tokenCount: 0, reservedTokens: 900 });
  });

  it("settles known usage and conservatively charges a missing-usage reservation", () => {
    const known = settleStudioAiQuotaReservation(
      { requestCount: 2, tokenCount: 100, reservedTokens: 800 },
      300,
      { totalTokens: 40 }
    );
    expect(known).toEqual({ requestCount: 2, tokenCount: 140, reservedTokens: 500 });
    expect(settleStudioAiQuotaReservation(known, 500, {})).toEqual({
      requestCount: 2,
      tokenCount: 640,
      reservedTokens: 0,
    });
  });
});
