import type {
  ProductionRole,
  ProductionTask,
  ProductionWorkspace,
} from "./studio-production-workspace-runtime";

export type CreatorRoleTaskReason =
  | "direct-assignee"
  | "direct-reviewer"
  | "blocked"
  | "dependency"
  | "overdue"
  | "due-soon"
  | "in-progress"
  | "urgent"
  | "high-priority"
  | "role-match"
  | "oversight";

export interface CreatorRoleTaskInboxItem {
  readonly task: ProductionTask;
  readonly score: number;
  readonly reasons: readonly CreatorRoleTaskReason[];
  readonly dueAt: number | null;
}

export interface RankCreatorRoleTasksInput {
  readonly workspace: ProductionWorkspace;
  readonly currentUserId: string | null | undefined;
  readonly activeRoles: readonly ProductionRole[];
  readonly now?: Date;
  readonly limit?: number;
}

function validDueTimestamp(value: string): number | null {
  if (!value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function appendReason(
  reasons: CreatorRoleTaskReason[],
  reason: CreatorRoleTaskReason,
  score: number,
): number {
  if (!reasons.includes(reason)) reasons.push(reason);
  return score;
}

export function rankCreatorRoleTasks({
  workspace,
  currentUserId,
  activeRoles,
  now = new Date(),
  limit = 6,
}: RankCreatorRoleTasksInput): readonly CreatorRoleTaskInboxItem[] {
  const assignmentIds = new Set(
    workspace.roleAssignments
      .filter((assignment) => currentUserId && assignment.memberId === currentUserId)
      .map((assignment) => assignment.id),
  );
  const activeRoleSet = new Set(activeRoles);
  const oversight = activeRoleSet.has("director") || activeRoleSet.has("publisher");
  const completedTaskIds = new Set(
    workspace.tasks.filter((task) => task.status === "done").map((task) => task.id),
  );
  const nowTimestamp = now.getTime();
  const dueSoonBoundary = nowTimestamp + 2 * 86_400_000;
  const ranked: CreatorRoleTaskInboxItem[] = [];

  for (const task of workspace.tasks) {
    if (task.status === "done") continue;
    const directAssignee = (task.assigneeIds ?? []).some((id) => assignmentIds.has(id));
    const directReviewer = (task.reviewerIds ?? []).some((id) => assignmentIds.has(id));
    const roleMatch = Boolean(task.role && activeRoleSet.has(task.role));
    const dependencyBlocked = (task.dependencyIds ?? []).some(
      (dependencyId) => !completedTaskIds.has(dependencyId),
    );
    const blocked = task.status === "blocked" || Boolean(task.blockedReason?.trim());
    const highSignalForOversight = blocked
      || dependencyBlocked
      || task.priority === "urgent"
      || task.priority === "high";
    if (!directAssignee && !directReviewer && !roleMatch && !(oversight && highSignalForOversight)) {
      continue;
    }

    const reasons: CreatorRoleTaskReason[] = [];
    let score = 0;
    if (directAssignee) score += appendReason(reasons, "direct-assignee", 100);
    if (directReviewer) score += appendReason(reasons, "direct-reviewer", 90);
    if (blocked) score += appendReason(reasons, "blocked", 80);
    if (dependencyBlocked) score += appendReason(reasons, "dependency", 70);

    const dueAt = validDueTimestamp(task.due);
    if (dueAt !== null && dueAt < nowTimestamp) {
      score += appendReason(reasons, "overdue", 65);
    } else if (dueAt !== null && dueAt <= dueSoonBoundary) {
      score += appendReason(reasons, "due-soon", 35);
    }
    if (task.status === "doing") score += appendReason(reasons, "in-progress", 25);
    if (task.priority === "urgent") score += appendReason(reasons, "urgent", 30);
    if (task.priority === "high") score += appendReason(reasons, "high-priority", 15);
    if (roleMatch) score += appendReason(reasons, "role-match", 20);
    if (oversight && highSignalForOversight && !directAssignee && !directReviewer && !roleMatch) {
      score += appendReason(reasons, "oversight", 5);
    }

    ranked.push({ task, score, reasons, dueAt });
  }

  return ranked
    .sort((left, right) => (
      right.score - left.score
      || (left.dueAt ?? Number.POSITIVE_INFINITY) - (right.dueAt ?? Number.POSITIVE_INFINITY)
      || left.task.title.localeCompare(right.task.title)
    ))
    .slice(0, Math.max(1, Math.min(20, Math.trunc(limit))));
}
