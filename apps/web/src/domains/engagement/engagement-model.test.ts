import { describe, expect, it } from "vitest";

import type { GrowthExperiment } from "./engagement-model";
import {
  assessGrowthExperiment,
  availabilitySnapshotOf,
  diffAvailabilitySnapshots,
  incrementGrowthMetric,
  releaseNotificationForTitle,
  zeroGrowthMetrics,
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
    const friday = new Date("2026-09-25T00:00:00+09:00");
    const notification = releaseNotificationForTitle(title(), friday);
    expect(notification?.id).toBe("release:2026-09-25:title-1");
    expect(releaseNotificationForTitle(title(), new Date("2026-09-24T00:00:00+09:00"))).toBeNull();
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
});
