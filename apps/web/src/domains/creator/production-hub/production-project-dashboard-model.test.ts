import { describe, expect, it } from "vitest";

import { createProductionDemoProject, PRODUCTION_DEMO_ANCHOR_AT } from "./production-demo";
import {
  deriveDashboardFeedback,
  deriveDashboardProgress,
  deriveProductionDashboard,
  resolveProductionSurfaceTarget,
} from "./production-project-dashboard-model";

const NOW = new Date(PRODUCTION_DEMO_ANCHOR_AT);

describe("production project dashboard", () => {
  it("counts progress from non-archived tasks", () => {
    const aggregate = createProductionDemoProject();
    const progress = deriveDashboardProgress(aggregate);
    expect(progress.total).toBe(aggregate.tasks.filter((task) => task.status !== "cancelled" && task.status !== "out-of-scope").length);
    expect(progress.completed).toBe(0);
    expect(progress.percent).toBe(0);
    expect(progress.inReview).toBe(1);
    expect(progress.blocked).toBe(2);
  });

  it("lists unpublished episodes by release date and leaves published ones out", () => {
    const dashboard = deriveProductionDashboard(createProductionDemoProject(), { now: NOW, viewerAssignmentIds: [], roleLens: "producer" });
    expect(dashboard.episodes.map((episode) => episode.episodeId)).toEqual(["episode-12", "episode-13"]);
    expect(dashboard.episodes[0]?.title).toBe("돌아온 봉투");
    expect(dashboard.episodes[0]?.releaseAt).toBeTruthy();
    expect(dashboard.episodes[1]?.releaseAt).toBeNull();
  });

  it("picks tasks by role in the sample and by account for real members", () => {
    const aggregate = createProductionDemoProject();
    const byRole = deriveProductionDashboard(aggregate, { now: NOW, viewerAssignmentIds: [], roleLens: "art" });
    expect(byRole.todoScope).toBe("role");
    expect(byRole.todos.length).toBeGreaterThan(0);
    expect(byRole.todos.every(({ task }) => task.status !== "done" && task.status !== "approved")).toBe(true);
    const byAccount = deriveProductionDashboard(aggregate, { now: NOW, viewerAssignmentIds: ["assignment-rights"], roleLens: "art" });
    expect(byAccount.todoScope).toBe("account");
    expect(byAccount.todos.map(({ task }) => task.id)).toEqual(["task-episode-12-rights"]);
  });

  it("shows the blocking question first and sends the next step to its episode room", () => {
    const aggregate = createProductionDemoProject();
    const feedback = deriveDashboardFeedback(aggregate);
    expect(feedback[0]?.kind).toBe("question");
    expect(feedback[0]?.kind === "question" && feedback[0].blocking).toBe(true);
    const dashboard = deriveProductionDashboard(aggregate, { now: NOW, viewerAssignmentIds: [], roleLens: "producer" });
    expect(dashboard.nextStep).toMatchObject({ kind: "answer-question", episodeId: "episode-12" });
  });

  it("falls back to overdue work, then review, once no question is blocking", () => {
    const aggregate = createProductionDemoProject();
    const answered = {
      ...aggregate,
      clarifications: aggregate.clarifications.map((thread) => ({ ...thread, status: "decision-recorded" as const })),
    };
    const later = new Date(Date.parse(PRODUCTION_DEMO_ANCHOR_AT) + 30 * 86_400_000);
    expect(deriveProductionDashboard(answered, { now: later, viewerAssignmentIds: [], roleLens: "producer" }).nextStep.kind).toBe("overdue");
    expect(deriveProductionDashboard(answered, { now: NOW, viewerAssignmentIds: [], roleLens: "producer" }).nextStep).toEqual({ kind: "review", count: 1 });
  });

  it("resolves surface targets, sending room links to the most urgent episode", () => {
    const aggregate = createProductionDemoProject();
    expect(resolveProductionSurfaceTarget(aggregate, { kind: "episode-room" }, NOW)).toBe("/production/projects/sample-project/episodes/episode-12");
    expect(resolveProductionSurfaceTarget(aggregate, { kind: "surface", surface: "manuscripts", query: "manuscriptView=delivery" }, NOW))
      .toBe("/production/projects/sample-project/manuscripts?manuscriptView=delivery");
    expect(resolveProductionSurfaceTarget(aggregate, { kind: "path", path: "/team/people" }, NOW)).toBe("/team/people");
  });
});
