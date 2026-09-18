import { describe, expect, it } from "vitest";

import { creatorRoleNotifications } from "./creator-role-notifications";
import { createEmptyProductionWorkspace } from "./studio-production-workspace";

function workspace() {
  return {
    ...createEmptyProductionWorkspace("work:alerts"),
    roleAssignments: [{
      id: "assignment-me",
      memberId: "member-me",
      displayName: "나",
      roles: ["lineart" as const],
      hierarchyNodeId: null,
    }],
    tasks: [
      {
        id: "blocked",
        title: "차단된 선화",
        owner: "나",
        due: "2026-09-20T00:00:00.000Z",
        progress: 30,
        status: "blocked" as const,
        role: "lineart" as const,
        priority: "high" as const,
        assigneeIds: ["assignment-me"],
        blockedReason: "콘티 승인 대기",
      },
      {
        id: "due-soon",
        title: "마감 임박 선화",
        owner: "나",
        due: "2026-09-18T00:00:00.000Z",
        progress: 20,
        status: "doing" as const,
        role: "lineart" as const,
        priority: "normal" as const,
        assigneeIds: ["assignment-me"],
      },
    ],
    handoffs: [{
      id: "handoff-1",
      hierarchyNodeId: "scene-1",
      fromRole: "storyboard" as const,
      toRole: "lineart" as const,
      status: "ready" as const,
      scenePurpose: "감정 전환 장면",
      emotionalBeat: "",
      mustShow: [],
      continuityNotes: [],
      lockedFields: [],
      acceptanceCriteria: [],
      createdBy: "콘티 작가",
      assignedTo: "나",
      updatedAt: "2026-09-17T00:00:00.000Z",
    }],
  };
}

describe("creator role notifications", () => {
  it("keeps essential alerts limited to blockers and overdue work", () => {
    const result = creatorRoleNotifications(
      workspace(),
      "member-me",
      ["lineart"],
      "essential",
      Date.parse("2026-09-17T00:00:00.000Z"),
    );
    expect(result.map((entry) => entry.id)).toEqual(["task-blocked:blocked"]);
  });

  it("adds due-soon work and handoffs for the standard level", () => {
    const result = creatorRoleNotifications(
      workspace(),
      "member-me",
      ["lineart"],
      "standard",
      Date.parse("2026-09-17T00:00:00.000Z"),
    );
    expect(result.map((entry) => entry.id)).toEqual([
      "task-blocked:blocked",
      "task-due-soon:due-soon",
      "handoff:handoff-1",
    ]);
  });
});
