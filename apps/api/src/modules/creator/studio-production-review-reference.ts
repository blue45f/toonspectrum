import { canonicalJson, studioReviewRoleAssignmentCoversTask, type StudioReviewTaskReference } from "@toonspectrum/studio-project-model";
import type { StudioProductionWorkspaceDocument } from "./studio-production.dto";

type Task = StudioProductionWorkspaceDocument["tasks"][number];
type LinkedTask = Task & { reviewRef: StudioReviewTaskReference };
export class StudioProductionReviewReferenceError extends Error {
  constructor(readonly reason: "reference" | "assignees") {
    super(`studio_production_review_${reason}_invalid`); this.name = "StudioProductionReviewReferenceError";
  }
}
export interface StudioProductionReviewAuthority {
  /** Must bind work/project/artifact/review/snapshot/hash/comment in the caller's transaction. */
  readReference(reference: StudioReviewTaskReference): Promise<readonly string[] | null>;
  /** Current work owner plus active admin/editor user IDs, held stable until commit. */
  readEligibleUserIds(): Promise<readonly string[]>;
}

function referenceIdentity(reference: StudioReviewTaskReference): string {
  return canonicalJson({ subject: reference.subject, commentId: reference.commentId });
}
function roleBinding(task: Task, workspace: StudioProductionWorkspaceDocument): string {
  return canonicalJson({ taskScope: task.hierarchyNodeId, roles: [...task.assigneeIds].sort().map((id) => {
    const role = workspace.roleAssignments.find((assignment) => assignment.id === id);
    return role ? { id, memberId: role.memberId, scope: role.hierarchyNodeId,
      covers: studioReviewRoleAssignmentCoversTask(task.hierarchyNodeId, role.hierarchyNodeId, workspace.hierarchy) } : { id, missing: true };
  }) });
}

/** Existing historical references are preserved; references never confer permission. */
export async function validateStudioProductionReviewChanges(
  current: StudioProductionWorkspaceDocument, next: StudioProductionWorkspaceDocument, authority: StudioProductionReviewAuthority,
): Promise<void> {
  const known = new Set([...current.tasks, ...current.versions.flatMap((version) => version.tasks)]
    .flatMap((task) => task.reviewRef ? [referenceIdentity(task.reviewRef)] : []));
  const previousTasks = new Map(current.tasks.map((task) => [task.id, task]));
  const assignments = next.tasks.filter((task): task is LinkedTask => {
    if (!task.reviewRef) return false;
    const previous = previousTasks.get(task.id);
    return !previous?.reviewRef || canonicalJson(previous.reviewRef) !== canonicalJson(task.reviewRef)
      || roleBinding(previous, current) !== roleBinding(task, next);
  });
  const references = new Map(assignments.map((task) => [referenceIdentity(task.reviewRef), task.reviewRef]));
  // A newly submitted version cannot manufacture a historical graph relationship.
  for (const task of next.versions.flatMap((version) => version.tasks)) {
    if (task.reviewRef && !known.has(referenceIdentity(task.reviewRef))) references.set(referenceIdentity(task.reviewRef), task.reviewRef);
  }
  const assigneesByReference = new Map<string, readonly string[]>();
  for (const [key, reference] of references) {
    if (next.scopeKey !== `work:${reference.subject.workId}`) throw new StudioProductionReviewReferenceError("reference");
    const assignees = await authority.readReference(reference);
    if (!assignees) throw new StudioProductionReviewReferenceError("reference");
    assigneesByReference.set(key, assignees);
  }
  if (!assignments.length) return;
  const eligible = new Set(await authority.readEligibleUserIds());
  for (const task of assignments) {
    const commentAssignees = assigneesByReference.get(referenceIdentity(task.reviewRef))!;
    const taskUsers = new Set<string>();
    for (const roleId of task.assigneeIds) {
      // A legacy member ID is not silently promoted to a production role ID.
      const role = next.roleAssignments.find((assignment) => assignment.id === roleId);
      if (!role?.memberId || !eligible.has(role.memberId)
        || !studioReviewRoleAssignmentCoversTask(task.hierarchyNodeId, role.hierarchyNodeId, next.hierarchy)) {
        throw new StudioProductionReviewReferenceError("assignees");
      }
      taskUsers.add(role.memberId);
    }
    if (commentAssignees.some((userId) => !eligible.has(userId) || !taskUsers.has(userId))) throw new StudioProductionReviewReferenceError("assignees");
  }
}
