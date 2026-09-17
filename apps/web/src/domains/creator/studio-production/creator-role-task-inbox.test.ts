import { describe, expect, it } from "vitest";

import { rankCreatorRoleTasks } from "./creator-role-task-inbox";
import { createEmptyProductionWorkspace } from "./studio-production-workspace";

function workspace() {
  return {
    ...createEmptyProductionWorkspace("work:test"),
    roleAssignments: [{
      id: "assignment-me",
      memberId: "user-me",
      displayName: "나",
      roles: ["lineart" as const],
      hierarchyNodeId: null,
    }],
    tasks: [
      {
        id: "direct-overdue",
        title: "수정 선화",
        owner: "나",
        due: "2026-09-15T00:00:00.000Z",
        progress: 20,
        status: "doing" as const,
        role: "lineart" as const,
        priority: "urgent" as const,
        assigneeIds: ["assignment-me"],
      },
      {
        id: "role-match",
        title: "담당자 없는 선화",
        owner: "",
        due: "2026-09-18T00:00:00.000Z",
        progress: 0,
        status: "todo" as const,
        role: "lineart" as const,
        priority: "normal" as const,
      },
      {
        id: "unrelated",
        title: "대본 초안",
        owner: "글작가",
        due: "2026-09-18T00:00:00.000Z",
        progress: 0,
        status: "todo" as const,
        role: "story" as const,
        priority: "normal" as const,
      },
      {
        id: "done",
        title: "완료된 선화",
        owner: "나",
        due: "2026-09-14T00:00:00.000Z",
        progress: 100,
        status: "done" as const,
        role: "lineart" as const,
        priority: "urgent" as const,
        assigneeIds: ["assignment-me"],
      },
    ],
  };
}

describe("creator role task inbox", () => {
  it("prioritizes direct, overdue and blocked work while excluding completed or unrelated tasks", () => {
    const ranked = rankCreatorRoleTasks({
      workspace: workspace(),
      currentUserId: "user-me",
      activeRoles: ["lineart"],
      now: new Date("2026-09-17T00:00:00.000Z"),
    });

    expect(ranked.map((item) => item.task.id)).toEqual([
      "direct-overdue",
      "role-match",
    ]);
    expect(ranked[0]?.reasons).toEqual(expect.arrayContaining([
      "direct-assignee",
      "overdue",
      "in-progress",
      "urgent",
      "role-match",
    ]));
  });

  it("surfaces cross-role blockers for producer oversight without assigning permissions", () => {
    const source = workspace();
    const ranked = rankCreatorRoleTasks({
      workspace: {
        ...source,
        tasks: source.tasks.map((task) => task.id === "unrelated"
          ? { ...task, status: "blocked" as const, blockedReason: "콘티 승인 대기" }
          : task),
      },
      currentUserId: "producer",
      activeRoles: ["director", "publisher"],
      now: new Date("2026-09-17T00:00:00.000Z"),
    });

    expect(ranked.map((item) => item.task.id)).toContain("unrelated");
    expect(ranked.find((item) => item.task.id === "unrelated")?.reasons)
      .toEqual(expect.arrayContaining(["blocked", "oversight"]));
  });
});
