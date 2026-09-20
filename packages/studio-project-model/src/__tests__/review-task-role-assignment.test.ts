import { describe, expect, it } from "vitest";

import { resolveStudioReviewTaskRoleSelections, studioReviewRoleAssignmentCoversTask, studioReviewTaskAssignmentChoices } from "../graph/review-task-role-assignment";

const hierarchy = [{ id: "episode", parentId: null }, { id: "scene", parentId: "episode" }, { id: "page", parentId: "scene" }, { id: "other", parentId: "episode" }];
const input = { assigneeUserIds: ["user-a", "user-b"], task: { hierarchyNodeId: "page" }, hierarchy,
  roleAssignments: [{ id: "role-a", memberId: "user-a", hierarchyNodeId: "episode" }, { id: "role-b", memberId: "user-b", hierarchyNodeId: null },
    { id: "sibling-role", memberId: "user-a", hierarchyNodeId: "other" }], eligibleUserIds: ["user-a", "user-b"] };

describe("review assignee to production role assignment", () => {
  it("accepts global, same and ancestor scopes without accepting a sibling", () => {
    for (const scope of [null, "page", "scene", "episode"]) expect(studioReviewRoleAssignmentCoversTask("page", scope, hierarchy)).toBe(true);
    expect(studioReviewRoleAssignmentCoversTask("page", "other", hierarchy)).toBe(false);
    expect(studioReviewRoleAssignmentCoversTask(null, "episode", hierarchy)).toBe(false);
  });
  it("rejects missing/duplicate/cyclic hierarchy identities", () => {
    expect(studioReviewRoleAssignmentCoversTask("missing", null, hierarchy)).toBe(false);
    expect(studioReviewRoleAssignmentCoversTask("page", "missing", hierarchy)).toBe(false);
    expect(studioReviewRoleAssignmentCoversTask("page", null, [...hierarchy, hierarchy[0]!])).toBe(false);
    expect(studioReviewRoleAssignmentCoversTask("page", "page", [{ id: "page", parentId: "page" }])).toBe(false);
    expect(studioReviewRoleAssignmentCoversTask("page", null, [{ id: "page", parentId: "page" }])).toBe(false);
  });
  it("resolves explicit user-to-role choices and never returns raw user IDs", () => {
    expect(studioReviewTaskAssignmentChoices(input)).toEqual([{ userId: "user-a", roleAssignmentIds: ["role-a"] }, { userId: "user-b", roleAssignmentIds: ["role-b"] }]);
    expect(resolveStudioReviewTaskRoleSelections(input, { "user-a": "role-a", "user-b": "role-b" })).toEqual(["role-a", "role-b"]);
    expect(resolveStudioReviewTaskRoleSelections(input, { "user-a": "user-a", "user-b": "role-b" })).toBeNull();
  });
  it("does not substitute roles for missing, revoked, duplicate or unconfirmed assignees", () => {
    expect(resolveStudioReviewTaskRoleSelections(input, { "user-a": "role-a" })).toBeNull();
    expect(resolveStudioReviewTaskRoleSelections({ ...input, eligibleUserIds: ["user-b"] }, { "user-a": "role-a", "user-b": "role-b" })).toBeNull();
    expect(resolveStudioReviewTaskRoleSelections({ ...input, roleAssignments: [...input.roleAssignments, input.roleAssignments[0]!] }, { "user-a": "role-a", "user-b": "role-b" })).toBeNull();
  });
  it("allows an unassigned comment without silently assigning a member", () => {
    expect(resolveStudioReviewTaskRoleSelections({ ...input, assigneeUserIds: [] }, {})).toEqual([]);
    expect(resolveStudioReviewTaskRoleSelections({ ...input, assigneeUserIds: [] }, { "user-a": "role-a" })).toBeNull();
  });
});
