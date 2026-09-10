import { describe, expect, it } from "vitest";

import {
  STUDIO_CLIP_WORKSPACE_RECOMMENDATION,
  STUDIO_SIMPLE_WORKSPACE_RECOMMENDATION,
  resolveStudioWorkspaceRecommendation,
  studioWorkspaceSearchAliases,
} from "./studio-workspace-recommendation";
import { STUDIO_DEFAULT_WORKSPACES } from "./studio-workspaces";

describe("Studio workspace recommendation model", () => {
  it("recommends the lowest-complexity built-in while keeping migration aliases searchable", () => {
    const recommendation = resolveStudioWorkspaceRecommendation(
      STUDIO_DEFAULT_WORKSPACES,
      "storyboard",
    );

    expect(recommendation?.workspace.id).toBe("quick-sketch");
    expect(recommendation?.workspace.name).toBe("빠른 스케치");
    expect(recommendation?.actionLabel).toBe("간편 화면으로 시작");
    expect(
      studioWorkspaceSearchAliases(STUDIO_CLIP_WORKSPACE_RECOMMENDATION.workspaceId),
    ).toEqual(expect.arrayContaining(["CSP", "Clip Studio", "클튜"]));
  });

  it("does not compete with the current-workspace summary after activation", () => {
    expect(
      resolveStudioWorkspaceRecommendation(
        STUDIO_DEFAULT_WORKSPACES,
        STUDIO_SIMPLE_WORKSPACE_RECOMMENDATION.workspaceId,
      ),
    ).toBeNull();
  });

  it("fails closed if the referenced built-in is unavailable", () => {
    expect(resolveStudioWorkspaceRecommendation([], "storyboard")).toBeNull();
    expect(studioWorkspaceSearchAliases("storyboard")).toEqual([]);
  });
});
