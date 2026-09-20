import type { ProductionWorkspace } from "../studio-production/studio-production-workspace-runtime";

/** A read-only task projection. Display-name placeholders cannot impersonate an assignee. */
export function studioWorkspaceAssignedTasks(document: ProductionWorkspace, actorId: string) {
  const assignmentIds = new Set(document.roleAssignments.filter((role) => role.memberId === actorId).map((role) => role.id));
  assignmentIds.add(actorId);
  return document.tasks.filter((task) => task.status !== "done"
    && [...(task.assigneeIds ?? []), ...(task.reviewerIds ?? [])].some((id) => assignmentIds.has(id)))
    .sort((a, b) => a.due.localeCompare(b.due) || a.id.localeCompare(b.id));
}
