import { describe, expect, it } from "vitest";
import { createEmptyProductionWorkspace, type ProductionWorkspace } from "../studio-production/studio-production-workspace-runtime";
import { studioWorkspaceAssignedTasks } from "./studio-workspace-inbox-projection";

function fixture(): ProductionWorkspace {
  const base = createEmptyProductionWorkspace("work:work");
  return { ...base, roleAssignments: [
    { id: "my-role", memberId: "actor", displayName: "Me", roles: ["lineart"], hierarchyNodeId: null },
    { id: "placeholder", memberId: null, displayName: "actor", roles: ["lineart"], hierarchyNodeId: null },
  ], tasks: [
    { id: "z", title: "Later", owner: "", due: "2026-09-24", progress: 20, status: "doing", assigneeIds: ["my-role"] },
    { id: "a", title: "Review", owner: "", due: "2026-09-22", progress: 0, status: "todo", reviewerIds: ["actor"] },
    { id: "other", title: "Not mine", owner: "actor", due: "2026-09-21", progress: 0, status: "todo", assigneeIds: ["placeholder"] },
    { id: "done", title: "Done", owner: "", due: "2026-09-20", progress: 100, status: "done", assigneeIds: ["actor"] },
  ] };
}
describe("read-only workspace inbox", () => {
  it("uses actual user and role IDs, not an editable display name", () => {
    expect(studioWorkspaceAssignedTasks(fixture(), "actor").map((task) => task.id)).toEqual(["a", "z"]);
  });
  it("does not give an unrelated account the previous account's tasks", () => {
    expect(studioWorkspaceAssignedTasks(fixture(), "another")).toEqual([]);
  });
  it("does not reorder source data or complete tasks when projecting", () => {
    const value = fixture(), before = JSON.stringify(value); studioWorkspaceAssignedTasks(value, "actor"); expect(JSON.stringify(value)).toBe(before);
  });
});
