import { describe, expect, it } from "vitest";

import { createProductionDemoProject } from "./production-demo";
import {
  creatorProductionAssignmentIdsForUser,
  creatorProductionRoleForTask,
  rankCreatorProductionWork,
} from "./creator-role-production-work";

describe("creator role production work bridge", () => {
  it("maps modern production tasks to creator roles", () => {
    const aggregate = createProductionDemoProject();
    const lineTask = aggregate.tasks.find((task) => task.id === "task-episode-12-line-art");
    const colorTask = aggregate.tasks.find((task) => task.id === "task-episode-12-color");

    expect(lineTask && creatorProductionRoleForTask(lineTask, aggregate.assignments)).toBe("lineart");
    expect(colorTask && creatorProductionRoleForTask(colorTask, aggregate.assignments)).toBe("color");
  });

  it("ranks the signed-in artist's assigned work from the modern aggregate", () => {
    const aggregate = createProductionDemoProject();
    const assignmentIds = creatorProductionAssignmentIdsForUser(aggregate, "demo-line");
    const items = rankCreatorProductionWork(aggregate, {
      userId: "demo-line",
      activeRole: "line-art",
      now: new Date("2026-09-18T03:00:00.000Z"),
      limit: 20,
    });

    expect(assignmentIds.has("assignment-line")).toBe(true);
    expect(items.some((item) => item.id === "task-episode-12-line-art")).toBe(true);
    expect(items.find((item) => item.id === "task-episode-12-line-art")?.reasons)
      .toContain("assigned-to-me");
  });

  it("marks reviewer assignments as review work", () => {
    const aggregate = createProductionDemoProject();
    const items = rankCreatorProductionWork(aggregate, {
      userId: "demo-art",
      activeRole: "reviewer",
      now: new Date("2026-09-18T03:00:00.000Z"),
      limit: 20,
    });

    expect(items.some((item) => item.reasons.includes("review-requested"))).toBe(true);
  });
});
