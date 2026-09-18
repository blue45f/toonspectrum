import { describe, expect, it } from "vitest";

import { applyProductionRoleAssignment } from "./production-role-assignment";
import { createEmptyProductionWorkspace } from "./studio-production-workspace";

describe("project production role assignments", () => {
  it("links a real team member id and merges additional roles within the same scope", () => {
    const initial = createEmptyProductionWorkspace("work:test");
    const first = applyProductionRoleAssignment(initial, {
      assignmentId: "role-first",
      memberId: "member-1",
      displayName: "김작가",
      role: "lineart",
      hierarchyNodeId: null,
    });
    const second = applyProductionRoleAssignment(first, {
      assignmentId: "role-ignored",
      memberId: "member-1",
      displayName: "김작가",
      role: "color",
      hierarchyNodeId: null,
    });

    expect(second.roleAssignments).toEqual([{
      id: "role-first",
      memberId: "member-1",
      displayName: "김작가",
      roles: ["lineart", "color"],
      hierarchyNodeId: null,
    }]);
    expect(second.members).toEqual(["김작가"]);
  });

  it("keeps assignments separate when the project scope differs", () => {
    const initial = {
      ...createEmptyProductionWorkspace("work:test"),
      hierarchy: [{
        id: "episode-1",
        kind: "episode" as const,
        parentId: null,
        title: "1화",
        order: 0,
        pageId: null,
      }],
    };
    const projectWide = applyProductionRoleAssignment(initial, {
      assignmentId: "role-project",
      memberId: "member-1",
      displayName: "김작가",
      role: "lineart",
      hierarchyNodeId: null,
    });
    const episodeOnly = applyProductionRoleAssignment(projectWide, {
      assignmentId: "role-episode",
      memberId: "member-1",
      displayName: "김작가",
      role: "reviewer",
      hierarchyNodeId: "episode-1",
    });

    expect(episodeOnly.roleAssignments).toHaveLength(2);
    expect(episodeOnly.roleAssignments[1]).toMatchObject({
      id: "role-episode",
      memberId: "member-1",
      roles: ["reviewer"],
      hierarchyNodeId: "episode-1",
    });
  });

  it("deduplicates manually entered names case-insensitively without inventing a member id", () => {
    const initial = createEmptyProductionWorkspace("draft");
    const first = applyProductionRoleAssignment(initial, {
      assignmentId: "role-manual",
      memberId: null,
      displayName: "Assistant A",
      role: "background",
      hierarchyNodeId: null,
    });
    const second = applyProductionRoleAssignment(first, {
      assignmentId: "role-unused",
      memberId: null,
      displayName: "assistant a",
      role: "color",
      hierarchyNodeId: null,
    });

    expect(second.roleAssignments).toHaveLength(1);
    expect(second.roleAssignments[0]).toMatchObject({
      id: "role-manual",
      memberId: null,
      displayName: "assistant a",
      roles: ["background", "color"],
    });
    expect(second.members).toEqual(["assistant a"]);
  });
});
