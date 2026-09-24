// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { activeEngagementNotifications, useEngagement } from "./engagement-store";

import type { Title } from "@/shared/lib/types";

function title(pricing: "free" | "paid" = "free"): Title {
  return {
    id: "title-1",
    slug: "title-one",
    type: "webtoon",
    title: "작품 하나",
    author: "작가",
    genres: ["판타지"],
    tags: [],
    synopsis: "소개",
    cover: ["#111111", "#222222"],
    status: "ongoing",
    ageRating: "12",
    releaseYear: 2026,
    updateDays: ["금"],
    availability: [{ platformId: "naver-webtoon", pricing }],
    stats: {
      views: 1,
      likes: 1,
      bookmarks: 1,
      ratingAvg: 4,
      ratingCount: 1,
      ratingDist: [0, 0, 0, 1, 0],
      rankDelta: 0,
      trendingScore: 50,
      completionRate: 50,
      bingeIndex: 50,
    },
  };
}

describe("engagement store", () => {
  beforeEach(() => {
    localStorage.clear();
    useEngagement.getState().resetEngagementData();
  });

  it("preserves notification read state across source refreshes", () => {
    const base = {
      id: "notice",
      category: "system" as const,
      title: "처음",
      body: "본문",
      href: "/",
      createdAt: "2026-09-25T00:00:00.000Z",
      readAt: null,
      archivedAt: null,
      snoozedUntil: null,
      sourceKey: "system:test",
    };
    useEngagement.getState().upsertNotifications([base]);
    useEngagement.getState().markNotificationRead("notice");
    useEngagement.getState().upsertNotifications([{ ...base, title: "갱신" }]);
    expect(useEngagement.getState().notifications[0]).toMatchObject({ title: "갱신" });
    expect(useEngagement.getState().notifications[0]?.readAt).not.toBeNull();
  });

  it("preserves read state while replacing a server-backed notification source", () => {
    const item = {
      id: "production:one",
      category: "production" as const,
      title: "검수",
      body: "본문",
      href: "/production",
      createdAt: "2026-09-25T00:00:00.000Z",
      readAt: null,
      archivedAt: null,
      snoozedUntil: null,
      sourceKey: "production-inbox:one",
    };
    useEngagement.getState().replaceNotificationsBySourcePrefix("production-inbox:", [item]);
    useEngagement.getState().markNotificationRead(item.id);
    useEngagement.getState().replaceNotificationsBySourcePrefix("production-inbox:", [{ ...item, title: "검수 갱신" }]);
    expect(useEngagement.getState().notifications).toHaveLength(1);
    expect(useEngagement.getState().notifications[0]).toMatchObject({ title: "검수 갱신" });
    expect(useEngagement.getState().notifications[0]?.readAt).not.toBeNull();
  });

  it("records a baseline without notifying, then notifies on a later observed change", () => {
    useEngagement.getState().observeAvailability(title("free"), "2026-09-25T00:00:00.000Z");
    expect(useEngagement.getState().notifications).toHaveLength(0);
    useEngagement.getState().observeAvailability(title("paid"), "2026-09-26T00:00:00.000Z");
    expect(useEngagement.getState().notifications).toHaveLength(1);
    expect(useEngagement.getState().availabilityHistory["title-1"]?.events).toHaveLength(2);
  });

  it("advances the stored availability baseline for an origin-label change", () => {
    const baseline = title("free");
    useEngagement.getState().observeAvailability(baseline, "2026-09-25T00:00:00.000Z");
    useEngagement.getState().observeAvailability({
      ...baseline,
      availability: baseline.availability.map((item) => ({ ...item, isOriginal: true })),
    }, "2026-09-26T00:00:00.000Z");
    const record = useEngagement.getState().availabilityHistory["title-1"];
    expect(record?.current.availability[0]?.isOriginal).toBe(true);
    expect(record?.events[0]?.changes).toContainEqual(expect.objectContaining({
      kind: "platform-origin-changed",
    }));
  });

  it("hides snoozed and archived notifications from the active projection", () => {
    useEngagement.getState().upsertNotifications([{
      id: "future",
      category: "system",
      title: "미래",
      body: "",
      href: "/",
      createdAt: "2026-09-25T00:00:00.000Z",
      readAt: null,
      archivedAt: null,
      snoozedUntil: "2099-01-01T00:00:00.000Z",
      sourceKey: "future",
    }]);
    expect(activeEngagementNotifications(useEngagement.getState().notifications, Date.parse("2026-09-25"))).toHaveLength(0);
  });
});
