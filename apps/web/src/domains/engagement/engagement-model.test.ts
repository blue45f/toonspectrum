import { describe, expect, it } from "vitest";

import type { EngagementNotification, GrowthExperiment } from "./engagement-model";
import {
  assessGrowthExperiment,
  availabilitySnapshotOf,
  diffAvailabilitySnapshots,
  groupNotificationsByDate,
  incrementGrowthMetric,
  notificationDateBucket,
  releaseNotificationForTitle,
  summarizeGrowthExperiments,
  zeroGrowthMetrics,
  zeroGrowthProjectSummary,
} from "./engagement-model";
import { decodePublicCollectionSnapshot, encodePublicCollectionSnapshot } from "./public-list-share";

import type { Title } from "@/shared/lib/types";

function title(overrides: Partial<Title> = {}): Title {
  return {
    id: "title-1",
    slug: "title-one",
    type: "webtoon",
    title: "작품 하나",
    author: "작가",
    genres: ["판타지"],
    tags: ["성장"],
    synopsis: "소개",
    cover: ["#111111", "#222222"],
    status: "ongoing",
    ageRating: "12",
    releaseYear: 2026,
    totalEpisodes: 10,
    updateDays: ["금"],
    availability: [{ platformId: "naver-webtoon", pricing: "free" }],
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
    ...overrides,
  };
}

describe("engagement model", () => {
  it("creates deterministic release notifications only on the configured weekday", () => {
    // releaseNotificationForTitle는 로컬 시간 기준(getDay/localDateKey)이라
    // 고정 오프셋을 박으면 러너 시간대에 따라 같은 instant의 요일이 달라진다.
    // 2026-09-25는 실제로 금요일이므로 로컬 자정으로 만들어 어떤 TZ에서도 성립하게 한다.
    const friday = new Date(2026, 8, 25);
    const notification = releaseNotificationForTitle(title(), friday);
    expect(notification?.id).toBe("release:2026-09-25:title-1");
    expect(releaseNotificationForTitle(title(), new Date(2026, 8, 24))).toBeNull();
  });

  it("explains observed availability changes without inventing historical facts", () => {
    const before = availabilitySnapshotOf(title());
    const after = availabilitySnapshotOf(title({
      status: "completed",
      totalEpisodes: 12,
      availability: [
        { platformId: "naver-webtoon", pricing: "paid" },
        { platformId: "ridi", pricing: "subscription" },
      ],
    }));
    expect(diffAvailabilitySnapshots(before, after).map((change) => change.kind)).toEqual([
      "pricing-changed",
      "platform-added",
      "serialization-changed",
      "episode-count-changed",
    ]);
  });

  it("records a provider origin-label change even when pricing is unchanged", () => {
    const before = availabilitySnapshotOf(title({
      availability: [{ platformId: "naver-webtoon", pricing: "free", isOriginal: false }],
    }));
    const after = availabilitySnapshotOf(title({
      availability: [{ platformId: "naver-webtoon", pricing: "free", isOriginal: true }],
    }));
    expect(diffAvailabilitySnapshots(before, after)).toContainEqual(expect.objectContaining({
      kind: "platform-origin-changed",
      before: "일반 제공",
      after: "공식 원작",
    }));
  });

  it("does not declare an experiment leader before sample and confidence gates", () => {
    const experiment: GrowthExperiment = {
      id: "experiment",
      projectId: "project",
      name: "표지",
      hypothesis: "",
      minimumSample: 100,
      primaryMetric: "open-rate",
      status: "running",
      createdAt: "2026-09-25T00:00:00.000Z",
      updatedAt: "2026-09-25T00:00:00.000Z",
      variants: [
        { id: "a", label: "A", note: "", metrics: { ...zeroGrowthMetrics(), impressions: 20, opens: 10 } },
        { id: "b", label: "B", note: "", metrics: { ...zeroGrowthMetrics(), impressions: 20, opens: 5 } },
      ],
    };
    expect(assessGrowthExperiment(experiment)).toMatchObject({ state: "collecting", leaderId: null });
    const sufficient = {
      ...experiment,
      variants: [
        { id: "a", label: "A", note: "", metrics: { ...zeroGrowthMetrics(), impressions: 1000, opens: 400 } },
        { id: "b", label: "B", note: "", metrics: { ...zeroGrowthMetrics(), impressions: 1000, opens: 200 } },
      ],
    };
    expect(assessGrowthExperiment(sufficient)).toMatchObject({ state: "directional", leaderId: "a" });
  });

  it("uses reading starts as the completion-rate confidence denominator", () => {
    const experiment: GrowthExperiment = {
      id: "completion-experiment",
      projectId: "project",
      name: "완독 실험",
      hypothesis: "",
      minimumSample: 100,
      primaryMetric: "completion-rate",
      status: "running",
      createdAt: "2026-09-25T00:00:00.000Z",
      updatedAt: "2026-09-25T00:00:00.000Z",
      variants: [
        { id: "a", label: "A", note: "", metrics: { impressions: 1_000, opens: 20, starts: 20, completes: 19, subscribes: 0 } },
        { id: "b", label: "B", note: "", metrics: { impressions: 1_000, opens: 20, starts: 20, completes: 10, subscribes: 0 } },
      ],
    };
    expect(assessGrowthExperiment(experiment)).toMatchObject({ state: "directional", leaderId: "a" });
  });

  it("summarizes an empty project as zeros without experiments", () => {
    expect(summarizeGrowthExperiments([])).toEqual(zeroGrowthProjectSummary());
  });

  it("sums normalized funnel metrics across every experiment for the dashboard", () => {
    const base: GrowthExperiment = {
      id: "experiment",
      projectId: "project",
      name: "표지",
      hypothesis: "",
      minimumSample: 100,
      primaryMetric: "open-rate",
      status: "running",
      createdAt: "2026-09-25T00:00:00.000Z",
      updatedAt: "2026-09-25T00:00:00.000Z",
      variants: [],
    };
    const summary = summarizeGrowthExperiments([
      {
        ...base,
        id: "first",
        variants: [
          { id: "a", label: "A", note: "", metrics: { impressions: 100, opens: 40, starts: 20, completes: 10, subscribes: 4 } },
          { id: "b", label: "B", note: "", metrics: { impressions: 100, opens: 30, starts: 15, completes: 8, subscribes: 2 } },
        ],
      },
      {
        ...base,
        id: "second",
        // 저장된 구형 데이터처럼 퍼널 단조성이 깨진 값도 합산 전에 정규화한다.
        variants: [
          { id: "c", label: "C", note: "", metrics: { impressions: 10, opens: 999, starts: 999, completes: 999, subscribes: 999 } },
        ],
      },
    ]);
    expect(summary).toEqual({
      experimentCount: 2,
      impressions: 210,
      opens: 80,
      starts: 45,
      completes: 28,
      subscribes: 16,
    });
  });

  it("keeps manually recorded funnel metrics monotonic", () => {
    const completed = incrementGrowthMetric(zeroGrowthMetrics(), "completes");
    expect(completed).toEqual({ impressions: 1, opens: 1, starts: 1, completes: 1, subscribes: 0 });
    const subscribed = incrementGrowthMetric(completed, "subscribes");
    expect(subscribed).toEqual({ impressions: 1, opens: 1, starts: 1, completes: 1, subscribes: 1 });
  });

  it("round-trips a bounded Unicode public-list snapshot", () => {
    const token = encodePublicCollectionSnapshot({
      version: 1,
      name: "완결 판타지",
      emoji: "sparkles",
      description: "주말 정주행",
      titleIds: ["one", "two", "one"],
      createdAt: "2026-09-25T00:00:00.000Z",
    });
    expect(decodePublicCollectionSnapshot(token)).toEqual({
      version: 1,
      name: "완결 판타지",
      emoji: "sparkles",
      description: "주말 정주행",
      titleIds: ["one", "two"],
      createdAt: "2026-09-25T00:00:00.000Z",
    });
    expect(() => decodePublicCollectionSnapshot("***")).toThrow();
  });

  it("buckets notifications into today, yesterday, this week, and older", () => {
    // 로컬 자정 기준으로 버킷을 나누므로, runner 시간대에 영향받지 않게 로컬 날짜로 만든다.
    const now = new Date(2026, 8, 29, 12, 0, 0);
    const iso = (year: number, month: number, day: number) =>
      new Date(year, month - 1, day, 9, 0, 0).toISOString();
    expect(notificationDateBucket(iso(2026, 9, 29), now)).toBe("today");
    expect(notificationDateBucket(iso(2026, 9, 28), now)).toBe("yesterday");
    expect(notificationDateBucket(iso(2026, 9, 24), now)).toBe("this-week");
    expect(notificationDateBucket(iso(2026, 9, 20), now)).toBe("older");
    expect(notificationDateBucket("not-a-date", now)).toBe("older");
  });

  it("groups a sorted notification list while keeping bucket order stable", () => {
    const now = new Date(2026, 8, 29, 12, 0, 0);
    const make = (id: string, createdAt: string): EngagementNotification => ({
      id,
      category: "system",
      title: id,
      body: "",
      href: "/",
      createdAt,
      readAt: null,
      archivedAt: null,
      snoozedUntil: null,
      sourceKey: `test:${id}`,
    });
    const items = [
      make("a", new Date(2026, 8, 29, 11).toISOString()),
      make("b", new Date(2026, 8, 29, 8).toISOString()),
      make("c", new Date(2026, 8, 28, 20).toISOString()),
      make("d", new Date(2026, 8, 10, 9).toISOString()),
    ];
    const grouped = groupNotificationsByDate(items, now);
    expect(grouped.map((group) => group.bucket)).toEqual(["today", "yesterday", "older"]);
    expect(grouped[0]?.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(grouped[2]?.items.map((item) => item.id)).toEqual(["d"]);
  });
});
