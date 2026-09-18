import { describe, expect, it } from "vitest";

import {
  EMPTY_CREATOR_ROLE_WORKSPACE_PREFERENCE,
  creatorAccountContextFromLegacyStage,
  creatorDetailedRoleLens,
  creatorExperienceLevelFromLegacyStage,
  creatorRoleAiTools,
  creatorRoleChecklist,
  creatorRoleNotificationSettings,
  creatorRoleStudioWorkspace,
  creatorWorkspaceStudioUiMode,
  isCreatorRoleProjectKey,
  normalizeCreatorRoleWorkspacePreference,
  rankCreatorRoleWork,
  recommendCreatorTeamRoles,
  recommendCreatorWorkspaceMode,
  resolveCreatorRoleProjectKey,
  scoreCreatorRoleMatch,
  type PublicCreatorRoleCandidate,
} from "./creator-role-workspace-contract";

describe("creator role workspace contract", () => {
  it("normalizes unsafe input with privacy-safe defaults", () => {
    expect(normalizeCreatorRoleWorkspacePreference({
      activeRole: "line-art",
      detailedLens: "not-a-lens",
      workspacePreset: "unknown",
      usageGoals: ["team-production", "team-production", "invalid"],
      visibility: {
        roles: true,
        specialties: "yes",
        experienceLevel: false,
        collaborationStatus: true,
      },
      capacity: {
        weeklyCapacityHours: 999,
        currentAssignedHours: -50,
        concurrentTaskLimit: 0,
      },
      customRoleLabel: "  메인 작화 감독  ",
      onboardingComplete: true,
      checklistStates: {
        "drawing-file": true,
        bad: "true",
      },
    })).toEqual({
      version: 1,
      activeRole: "line-art",
      detailedLens: "drawing",
      workspacePreset: "lineart",
      notificationPreset: "balanced",
      notificationOverrides: {},
      usageGoals: ["team-production"],
      accountContext: "individual",
      workspaceMode: "creator",
      capacity: {
        weeklyCapacityHours: 168,
        currentAssignedHours: 0,
        concurrentTaskLimit: 1,
        unavailableUntil: null,
      },
      visibility: {
        roles: true,
        specialties: false,
        experienceLevel: false,
        collaborationStatus: true,
      },
      customRoleLabel: "메인 작화 감독",
      onboardingComplete: true,
      checklistStates: {
        "drawing-file": true,
      },
    });
    expect(EMPTY_CREATOR_ROLE_WORKSPACE_PREFERENCE.visibility.roles).toBe(false);
  });

  it("separates account context, experience and workspace-mode recommendations", () => {
    expect(creatorAccountContextFromLegacyStage("student")).toBe("education");
    expect(creatorAccountContextFromLegacyStage("studio")).toBe("studio");
    expect(creatorAccountContextFromLegacyStage("professional")).toBe("individual");
    expect(creatorExperienceLevelFromLegacyStage("aspiring")).toBe("experienced");

    expect(recommendCreatorWorkspaceMode({
      accountContext: "education",
      experienceLevel: "beginner",
      usageGoals: ["learning"],
    })).toBe("guided");
    expect(recommendCreatorWorkspaceMode({
      accountContext: "studio",
      experienceLevel: "experienced",
      usageGoals: ["personal-project"],
    })).toBe("production");
    expect(recommendCreatorWorkspaceMode({
      accountContext: "individual",
      experienceLevel: "experienced",
      usageGoals: ["personal-project"],
    })).toBe("creator");
  });

  it("resolves project-specific keys without leaking malformed paths", () => {
    expect(isCreatorRoleProjectKey("work:work-1")).toBe(true);
    expect(isCreatorRoleProjectKey("project:season:2")).toBe(true);
    expect(isCreatorRoleProjectKey("../secret")).toBe(false);
    expect(resolveCreatorRoleProjectKey({
      pathname: "/studio/work/work-42/review",
      search: "",
    })).toBe("work:work-42");
    expect(resolveCreatorRoleProjectKey({
      pathname: "/production/projects/webtoon-a/overview",
      search: "",
    })).toBe("project:webtoon-a");
    expect(resolveCreatorRoleProjectKey({
      pathname: "/studio/projects",
      search: "?scope=remix%3Aremix-7",
    })).toBe("remix:remix-7");
    expect(resolveCreatorRoleProjectKey({
      pathname: "/studio/projects",
      search: "",
    })).toBe("draft");
  });

  it("maps every detailed role to an operational lens and editor preset", () => {
    expect(creatorDetailedRoleLens("story")).toBe("story");
    expect(creatorDetailedRoleLens("planner")).toBe("planning");
    expect(creatorDetailedRoleLens("storyboard")).toBe("storyboard");
    expect(creatorDetailedRoleLens("line-art")).toBe("drawing");
    expect(creatorDetailedRoleLens("background")).toBe("background");
    expect(creatorDetailedRoleLens("color")).toBe("color-finishing");
    expect(creatorDetailedRoleLens("lettering")).toBe("lettering");
    expect(creatorDetailedRoleLens("reviewer")).toBe("review");
    expect(creatorDetailedRoleLens("producer")).toBe("production");
    expect(creatorDetailedRoleLens("educator")).toBe("story");

    expect(creatorRoleStudioWorkspace("line-art")).toBe("lineart");
    expect(creatorRoleStudioWorkspace("color")).toBe("coloring");
    expect(creatorRoleStudioWorkspace("three-d")).toBe("pose-3d");
    expect(creatorRoleStudioWorkspace("producer")).toBe("publish");
    expect(creatorWorkspaceStudioUiMode("guided")).toBe("basic");
    expect(creatorWorkspaceStudioUiMode("creator")).toBe("standard");
    expect(creatorWorkspaceStudioUiMode("production")).toBe("full");
  });

  it("builds role-aware notification, checklist and AI defaults", () => {
    const notifications = creatorRoleNotificationSettings("producer", {
      notificationPreset: "focused",
      notificationOverrides: { question: true, "publish-risk": false },
    });
    expect(notifications["deadline-risk"]).toBe(true);
    expect(notifications["unassigned-work"]).toBe(true);
    expect(notifications.question).toBe(true);
    expect(notifications["publish-risk"]).toBe(false);

    expect(creatorRoleChecklist("line-art").map((item) => item.id)).toContain(
      "drawing-file",
    );
    expect(creatorRoleAiTools("producer").map((tool) => tool.id)).toEqual([
      "schedule-risk",
      "workload-balance",
      "review-summary",
    ]);
  });

  it("ranks assigned, overdue, blocked and review work ahead of generic tasks", () => {
    const queue = rankCreatorRoleWork({
      roleAssignments: [{
        id: "assignment-me",
        memberId: "user-me",
        displayName: "김작가",
        roles: ["lineart"],
      }],
      tasks: [
        {
          id: "task-generic",
          title: "다른 사람 채색",
          owner: "박작가",
          due: "2026-09-25",
          status: "todo",
          priority: "normal",
          role: "color",
          assigneeIds: [],
          dependencyIds: [],
        },
        {
          id: "task-overdue",
          title: "13화 선화 수정",
          owner: "김작가",
          due: "2026-09-16",
          status: "blocked",
          priority: "urgent",
          role: "lineart",
          assigneeIds: ["assignment-me"],
          dependencyIds: [],
        },
        {
          id: "task-ready",
          title: "14화 선화",
          owner: "",
          due: "2026-09-18",
          status: "todo",
          priority: "high",
          role: "lineart",
          assigneeIds: ["assignment-me"],
          dependencyIds: ["task-done"],
        },
        {
          id: "task-done",
          title: "14화 콘티",
          owner: "콘티작가",
          due: "2026-09-15",
          status: "done",
          priority: "normal",
          role: "storyboard",
          assigneeIds: [],
          dependencyIds: [],
        },
      ],
      reviews: [{
        id: "review-1",
        title: "13화 재검수",
        assignee: "김작가",
        severity: "blocker",
        status: "open",
        approvalRequired: true,
        requestedByRole: "lineart",
      }],
    }, {
      userId: "user-me",
      displayName: "김작가",
      activeRole: "line-art",
      now: new Date("2026-09-17T10:00:00.000Z"),
    });

    expect(queue.map((item) => item.id)).toEqual([
      "task-overdue",
      "review-1",
      "task-ready",
    ]);
    expect(queue[0]?.reasons).toEqual(expect.arrayContaining([
      "assigned-to-me",
      "overdue",
      "blocked",
      "urgent",
    ]));
    expect(queue[2]?.reasons).toContain("dependency-ready");
  });

  it("recommends team roles from public profile evidence without granting access", () => {
    const candidates: readonly PublicCreatorRoleCandidate[] = [
      {
        userId: "artist",
        name: "김작가",
        roleProfile: {
          version: 1,
          primaryRole: "background",
          secondaryRoles: ["three-d"],
          specialties: ["background-2d", "background-3d"],
          experienceLevel: "professional",
          collaborationStatus: "available",
        },
        capacity: {
          weeklyCapacityHours: 20,
          currentAssignedHours: 8,
          concurrentTaskLimit: 3,
          unavailableUntil: null,
        },
      },
      {
        userId: "busy",
        name: "박작가",
        roleProfile: {
          version: 1,
          primaryRole: "background",
          secondaryRoles: [],
          specialties: ["background-2d"],
          experienceLevel: "professional",
          collaborationStatus: "unavailable",
        },
        capacity: {
          weeklyCapacityHours: 10,
          currentAssignedHours: 16,
          concurrentTaskLimit: 1,
          unavailableUntil: null,
        },
      },
    ];

    const recommendations = recommendCreatorTeamRoles(candidates, ["background"]);
    expect(recommendations[0]).toMatchObject({
      userId: "artist",
      productionRole: "background",
    });
    expect(recommendations[0]?.reasons).toEqual(expect.arrayContaining([
      "대표 직무와 일치",
      "전문 분야와 일치",
      "협업 가능",
    ]));
    expect(recommendations.at(-1)?.userId).toBe("busy");

    expect(scoreCreatorRoleMatch(candidates[0]!, {
      role: "background",
      specialties: ["background-3d"],
      collaborationStatus: "available",
    })).toBeGreaterThan(90);
    expect(scoreCreatorRoleMatch(candidates[0]!, {
      role: "story",
    })).toBe(0);
  });
});
