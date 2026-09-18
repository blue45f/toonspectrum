import { describe, expect, it } from "vitest";

import { creatorRoleWorkload } from "./creator-role-workload";
import { createEmptyProductionWorkspace } from "./studio-production-workspace";

const NOW = Date.parse("2026-09-17T00:00:00.000Z");

function workspace() {
  return {
    ...createEmptyProductionWorkspace("work:capacity"),
    roleAssignments: [
      {
        id: "assignment-me",
        memberId: "member-me",
        displayName: "김작가",
        roles: ["lineart" as const],
        hierarchyNodeId: null,
      },
      {
        id: "assignment-assistant",
        memberId: "member-assistant",
        displayName: "박어시",
        roles: ["lineart" as const],
        hierarchyNodeId: null,
      },
    ],
    tasks: [
      {
        id: "mine-1",
        title: "내 선화 1",
        owner: "김작가",
        due: "2026-09-16T00:00:00.000Z",
        progress: 30,
        status: "doing" as const,
        role: "lineart" as const,
        priority: "high" as const,
        assigneeIds: ["assignment-me"],
      },
      {
        id: "mine-2",
        title: "내 선화 2",
        owner: "김작가",
        due: "2026-09-18T00:00:00.000Z",
        progress: 0,
        status: "blocked" as const,
        role: "lineart" as const,
        priority: "urgent" as const,
        assigneeIds: ["assignment-me"],
        blockedReason: "자료 대기",
      },
      {
        id: "unassigned",
        title: "미배정 작업",
        owner: "",
        due: "",
        progress: 0,
        status: "todo" as const,
        role: "lineart" as const,
        priority: "normal" as const,
      },
    ],
  };
}

describe("creator role workload", () => {
  it("counts risk by real assignment and flags personal capacity overflow", () => {
    const summary = creatorRoleWorkload(
      workspace(),
      "member-me",
      { weeklyHours: 20, maxConcurrentTasks: 1, availabilityNote: "평일 저녁" },
      NOW,
    );

    expect(summary.currentUserOpenTasks).toBe(2);
    expect(summary.overloaded).toBe(true);
    expect(summary.unassignedTasks).toBe(1);
    expect(summary.members[0]).toMatchObject({
      memberId: "member-me",
      openTasks: 2,
      blockedTasks: 1,
      overdueTasks: 1,
      dueSoonTasks: 1,
    });
  });
});
