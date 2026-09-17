import { describe, expect, it } from "vitest";

import { CREATOR_ROLE_IDS } from "./creator-role-contract";
import {
  creatorRoleExperience,
  creatorWorkItemLaunch,
} from "./creator-role-experience";
import type { RankedCreatorWorkItem } from "./creator-role-workspace-contract";

function workItem(
  overrides: Partial<RankedCreatorWorkItem> = {},
): RankedCreatorWorkItem {
  return {
    id: "task-1",
    kind: "task",
    title: "작업",
    score: 100,
    reasons: ["assigned-to-me"],
    due: "2026-09-18",
    status: "todo",
    productionRole: "lineart",
    ...overrides,
  };
}

describe("creator role experience", () => {
  it("gives every creator role a focused primary action and bounded navigation", () => {
    for (const role of CREATOR_ROLE_IDS) {
      const experience = creatorRoleExperience(role);
      expect(experience.role).toBe(role);
      expect(experience.primaryAction.href).toMatch(/^\//u);
      expect(experience.navigation.length).toBeGreaterThanOrEqual(4);
      expect(experience.navigation.length).toBeLessThanOrEqual(7);
      expect(new Set(experience.navigation.map((item) => item.id)).size)
        .toBe(experience.navigation.length);
    }
  });

  it("keeps specialist primary actions aligned with their workspace", () => {
    expect(creatorRoleExperience("story").primaryAction.labelKo).toBe("이어 쓰기");
    expect(creatorRoleExperience("storyboard").primaryAction.workspacePreset).toBe("storyboard");
    expect(creatorRoleExperience("line-art").primaryAction.workspacePreset).toBe("lineart");
    expect(creatorRoleExperience("color").primaryAction.workspacePreset).toBe("coloring");
    expect(creatorRoleExperience("three-d").primaryAction.workspacePreset).toBe("pose-3d");
    expect(creatorRoleExperience("producer").primaryAction.href).toBe("/production");
  });

  it("opens an assistant color task in the coloring workspace", () => {
    const launch = creatorWorkItemLaunch(workItem({
      id: "color-task",
      productionRole: "color",
    }), {
      activeRole: "assistant",
      projectKey: "work:episode-12",
    });

    expect(launch.surface).toBe("studio");
    expect(launch.workspacePreset).toBe("coloring");
    expect(launch.href).toContain("workspace=draw");
    expect(launch.href).toContain("roleWorkspace=coloring");
    expect(launch.href).toContain("scope=work%3Aepisode-12");
    expect(launch.href).toContain("taskId=color-task");
  });

  it("routes background and lettering tasks to their specialist surfaces", () => {
    const background = creatorWorkItemLaunch(workItem({ productionRole: "background" }), {
      activeRole: "background",
      projectKey: "draft",
    });
    const lettering = creatorWorkItemLaunch(workItem({ productionRole: "lettering" }), {
      activeRole: "lettering",
      projectKey: "draft",
    });

    expect(background.href).toContain("workspace=3d");
    expect(background.workspacePreset).toBe("pose-3d");
    expect(lettering.href).toContain("workspace=localization");
    expect(lettering.workspacePreset).toBe("lettering");
  });

  it("routes story work and reviews outside the drawing studio", () => {
    const story = creatorWorkItemLaunch(workItem({ productionRole: "story" }), {
      activeRole: "story",
      projectKey: "project:webtoon-a",
    });
    const review = creatorWorkItemLaunch(workItem({
      id: "review-42",
      kind: "review",
      productionRole: "reviewer",
      status: "open",
    }), {
      activeRole: "editor",
      projectKey: "project:webtoon-a",
    });

    expect(story.surface).toBe("story");
    expect(story.href).toContain("/story-lab?");
    expect(review.surface).toBe("production");
    expect(review.href).toContain("reviewId=review-42");
  });

  it("opens modern production review and blocker tasks in the exact production task", () => {
    const review = creatorWorkItemLaunch(workItem({
      id: "review-task",
      status: "internal-review",
      reasons: ["assigned-to-me", "review-requested"],
    }), {
      activeRole: "editor",
      projectKey: "work:work-42",
      productionProjectId: "project/42",
    });
    const blocked = creatorWorkItemLaunch(workItem({
      id: "blocked-task",
      status: "blocked",
    }), {
      activeRole: "line-art",
      projectKey: "work:work-42",
      productionProjectId: "project/42",
    });

    expect(review.labelKo).toBe("검수하기");
    expect(review.href).toBe("/production/projects/project%2F42/production?task=review-task");
    expect(blocked.labelKo).toBe("문제 확인");
    expect(blocked.href).toBe("/production/projects/project%2F42/production?task=blocked-task");
  });

  it("uses task state to keep the next action understandable", () => {
    expect(creatorWorkItemLaunch(workItem({ status: "doing" }), {
      activeRole: "line-art",
      projectKey: "draft",
    }).labelKo).toBe("이어 작업하기");

    expect(creatorWorkItemLaunch(workItem({ status: "blocked" }), {
      activeRole: "line-art",
      projectKey: "draft",
    }).labelKo).toBe("문제 확인");
  });
});
