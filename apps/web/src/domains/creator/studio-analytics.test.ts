import { describe, expect, it } from "vitest";

import { aggregateStudioAnalytics, type StudioAnalyticsEvent } from "./studio-analytics";

function event(
  id: string,
  type: StudioAnalyticsEvent["type"],
  session: string,
  patch: Partial<StudioAnalyticsEvent> = {},
): StudioAnalyticsEvent {
  return {
    id,
    type,
    projectId: "project-1",
    episodeId: "episode-1",
    locale: "ko",
    anonymousSessionId: `anon:${session}`,
    occurredAt: "2026-09-11T00:00:00.000Z",
    value: null,
    amountMinor: null,
    currency: null,
    ...patch,
  };
}

describe("Studio analytics aggregation", () => {
  it("aggregates readers, completion, scroll depth and project economics without exposing identities", () => {
    const report = aggregateStudioAnalytics([
      event("1", "episode-open", "a"),
      event("2", "scroll-depth", "a", { value: 0.5 }),
      event("3", "scroll-depth", "a", { value: 0.9 }),
      event("4", "episode-complete", "a"),
      event("5", "episode-open", "b"),
      event("6", "scroll-depth", "b", { value: 0.4 }),
      event("7", "subscribe", "b"),
      event("8", "reaction", "b"),
      event("9", "revenue", "a", { amountMinor: 5000, currency: "KRW" }),
      event("10", "production-cost", "a", { amountMinor: 1200, currency: "KRW" }),
    ]);
    expect(report).toMatchObject({
      projectId: "project-1",
      acceptedEventCount: 10,
      duplicateEventCount: 0,
      rejectedEventIds: [],
    });
    expect(report.episodes[0]).toMatchObject({
      uniqueReaders: 2,
      opens: 2,
      completes: 1,
      completionRate: 0.5,
      averageMaxScrollDepth: 0.65,
      subscriptions: 1,
      reactions: 1,
      revenueMinor: 5000,
      productionCostMinor: 1200,
      netMinor: 3800,
      currency: "KRW",
    });
    expect(JSON.stringify(report)).not.toContain("anon:a");
  });

  it("deduplicates event ids and rejects malformed privacy or metric values", () => {
    const valid = event("same", "episode-open", "a");
    const report = aggregateStudioAnalytics([
      valid,
      valid,
      event("bad-session", "episode-open", "a", { anonymousSessionId: "person@example.com" }),
      event("bad-scroll", "scroll-depth", "b", { value: 2 }),
    ]);
    expect(report).toMatchObject({
      acceptedEventCount: 1,
      duplicateEventCount: 1,
      rejectedEventIds: ["bad-session", "bad-scroll"],
    });
  });

  it("rejects accidental cross-project aggregation", () => {
    expect(() => aggregateStudioAnalytics([
      event("1", "episode-open", "a"),
      event("2", "episode-open", "b", { projectId: "project-2" }),
    ])).toThrow("one project");
  });
});
