import { describe, expect, it } from "vitest";

import { createProductionDemoProject } from "./production-demo";
import {
  buildEpisodePipelinePlan,
  deriveProductionOperationsOverview,
  nextEpisodeNumber,
  WEBTOON_EPISODE_PIPELINE,
} from "./production-episode-operations";

const NOW = new Date("2026-09-17T00:00:00.000Z");

describe("production episode operations", () => {
  it("summarizes cadence, deadline risk, blockers and buffer for producers", () => {
    const aggregate = createProductionDemoProject();
    const overview = deriveProductionOperationsOverview(aggregate, NOW);
    const episode12 = overview.rows.find((row) => row.episode.episodeId === "episode-12");
    const episode13 = overview.rows.find((row) => row.episode.episodeId === "episode-13");

    expect(overview.cadenceDays).toBe(7);
    expect(overview.nextRelease?.episode.episodeId).toBe("episode-12");
    expect(overview.readyBufferCount).toBe(0);
    expect(overview.openBlockerCount).toBeGreaterThan(0);
    expect(episode12).toMatchObject({
      health: "critical",
      releaseAt: "2026-09-25T09:00:00.000Z",
    });
    expect(episode12?.healthReasons).toContain("차단된 작업 존재");
    expect(episode13).toMatchObject({ health: "unplanned", releaseAt: null });
  });

  it("builds the complete nine-step pipeline and preserves dependencies", () => {
    const aggregate = createProductionDemoProject();
    const episode = aggregate.episodes.find((entry) => entry.episodeId === "episode-13")!;
    const releaseAt = "2026-10-02T09:00:00.000Z";
    const result = buildEpisodePipelinePlan({
      aggregate,
      episode,
      releaseAt,
      rebaselineExisting: true,
    });

    expect(result.tasks).toHaveLength(WEBTOON_EPISODE_PIPELINE.length);
    expect(result.createdCount).toBe(8);
    expect(result.updatedCount).toBe(1);
    expect(result.tasks.find((task) => task.processKey === "publication")?.dueAt).toBe(releaseAt);
    expect(result.tasks.find((task) => task.processKey === "color")?.dependencyTaskIds).toEqual(expect.arrayContaining([
      "task-episode-13-line-art",
      "task-episode-13-background",
    ]));
    expect(result.tasks.find((task) => task.processKey === "joint-proof")?.dependencyTaskIds).toEqual(expect.arrayContaining([
      "task-episode-13-lettering",
      "task-episode-13-rights-preflight",
    ]));
  });

  it("records already-approved milestones as completed instead of reopening them", () => {
    const aggregate = createProductionDemoProject();
    const episode = aggregate.episodes.find((entry) => entry.episodeId === "episode-12")!;
    const result = buildEpisodePipelinePlan({
      aggregate,
      episode,
      releaseAt: "2026-10-09T09:00:00.000Z",
      rebaselineExisting: true,
    });

    expect(result.tasks.find((task) => task.processKey === "story")).toMatchObject({
      status: "done",
    });
  });

  it("never moves a completed task while rebaselining unfinished work", () => {
    const aggregate = createProductionDemoProject();
    const thumbnail = aggregate.tasks.find((task) => task.id === "task-episode-12-thumbnail")!;
    const completed = { ...thumbnail, status: "done" as const };
    const withCompleted = {
      ...aggregate,
      tasks: aggregate.tasks.map((task) => task.id === completed.id ? completed : task),
    };
    const episode = withCompleted.episodes.find((entry) => entry.episodeId === "episode-12")!;
    const result = buildEpisodePipelinePlan({
      aggregate: withCompleted,
      episode,
      releaseAt: "2026-10-09T09:00:00.000Z",
      rebaselineExisting: true,
    });

    expect(result.preservedCompletedCount).toBe(1);
    expect(result.tasks.find((task) => task.id === completed.id)).toBe(completed);
    expect(result.tasks.find((task) => task.processKey === "publication")?.dueAt).toBe("2026-10-09T09:00:00.000Z");
  });

  it("suggests the next unique episode number", () => {
    expect(nextEpisodeNumber(createProductionDemoProject())).toBe(14);
  });
});
