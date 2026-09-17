import { describe, expect, it } from "vitest";

import type { ProductionProjectAggregate, ProductionTask } from "@toonspectrum/core/production";

import { createProductionDemoProject } from "./production-demo";
import {
  deriveAssignmentWorkload,
  deriveProductionManagementOverview,
} from "./production-management-overview";

const NOW = new Date("2026-09-17T00:00:00.000Z");

function withTasks(
  aggregate: ProductionProjectAggregate,
  tasks: readonly ProductionTask[],
): ProductionProjectAggregate {
  return { ...aggregate, tasks };
}

describe("production management overview", () => {
  it("connects episode deadlines, blockers, review queues and workload into one action model", () => {
    const aggregate = createProductionDemoProject();
    const overview = deriveProductionManagementOverview(aggregate, {
      now: NOW,
      roleLens: "producer",
    });

    expect(overview.blockingQuestionCount).toBe(1);
    expect(overview.blockedTaskCount).toBeGreaterThan(0);
    expect(overview.reviewTaskCount).toBeGreaterThan(0);
    expect(overview.operations.unplannedCount).toBe(1);
    expect(overview.healthScore).toBeLessThan(100);
    expect(overview.healthReasons).toContain("제작 차단 질문 1개");
    expect(overview.actions.some((action) => action.id === "clarification:clarification-envelope-angle")).toBe(true);
    expect(overview.actions.some((action) => action.id === "blocked-task:task-episode-12-background")).toBe(true);
    expect(overview.actions.some((action) => action.id === "episode:episode-13" && action.kind === "release")).toBe(true);
  });

  it("builds a six-phase episode matrix without treating missing stages as completed", () => {
    const aggregate = createProductionDemoProject();
    const overview = deriveProductionManagementOverview(aggregate, { now: NOW });
    const episode12 = overview.episodeRows.find((row) => row.operations.episode.episodeId === "episode-12");
    const episode13 = overview.episodeRows.find((row) => row.operations.episode.episodeId === "episode-13");

    expect(episode12?.phases.map((phase) => phase.key)).toEqual([
      "story",
      "thumbnail",
      "art",
      "lettering",
      "review",
      "publication",
    ]);
    expect(episode12?.phases.find((phase) => phase.key === "story")?.status).toBe("complete");
    expect(episode12?.phases.find((phase) => phase.key === "art")?.status).toBe("blocked");
    expect(episode13?.phases.find((phase) => phase.key === "publication")?.status).toBe("missing");
  });

  it("splits shared task effort and flags workload beyond the active assignment capacity", () => {
    const aggregate = createProductionDemoProject();
    const colorTask = aggregate.tasks.find((task) => task.id === "task-episode-12-color");
    if (!colorTask) throw new Error("demo color task missing");
    const overloadTask: ProductionTask = {
      ...colorTask,
      id: "task-episode-13-color-overload",
      title: "13화 긴급 채색",
      scope: {
        kind: "episode",
        id: "episode-13",
        ancestors: [{ kind: "project", id: aggregate.projectId }],
      },
      dueAt: "2026-09-20T09:00:00.000Z",
      estimateHours: { optimistic: 90, likely: 120, pessimistic: 150 },
    };
    const next = withTasks(aggregate, [...aggregate.tasks, overloadTask]);
    const workload = deriveAssignmentWorkload(next, NOW);
    const colorist = workload.find((entry) => entry.assignment.id === "assignment-color");

    expect(colorist?.taskCount).toBe(2);
    expect(colorist?.remainingHours).toBe(146);
    expect(colorist?.loadPercent).toBeGreaterThan(100);
    expect(colorist?.health).toBe("overloaded");
  });

  it("surfaces unassigned work as an actionable responsibility gap", () => {
    const aggregate = createProductionDemoProject();
    const task = aggregate.tasks.find((entry) => entry.id === "task-episode-12-lettering");
    if (!task) throw new Error("demo lettering task missing");
    const unassigned = { ...task, assignmentIds: [] } satisfies ProductionTask;
    const next = withTasks(
      aggregate,
      aggregate.tasks.map((entry) => entry.id === task.id ? unassigned : entry),
    );
    const overview = deriveProductionManagementOverview(next, { now: NOW, roleLens: "producer" });

    expect(overview.unassignedTaskCount).toBe(1);
    expect(overview.actions.some((action) =>
      action.id === `unassigned-task:${task.id}`
      && action.actionLabel === "담당 배정"))
      .toBe(true);
  });

  it("keeps role lenses as ordering preferences without hiding project-wide risks", () => {
    const aggregate = createProductionDemoProject();
    const story = deriveProductionManagementOverview(aggregate, { now: NOW, roleLens: "story" });
    const art = deriveProductionManagementOverview(aggregate, { now: NOW, roleLens: "art" });

    expect(story.actions.some((action) => action.kind === "capacity" || action.kind === "risk")).toBe(true);
    expect(art.actions.some((action) => action.id === "clarification:clarification-envelope-angle")).toBe(true);
    expect(story.actions.find((action) => action.id === "clarification:clarification-envelope-angle")?.lensPriority).toBe(0);
    expect(art.actions.find((action) => action.id === "clarification:clarification-envelope-angle")?.lensPriority).toBe(0);
  });
});
