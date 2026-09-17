import type {
  ProductionRole,
  ProductionWorkspace,
} from "./studio-production-workspace-runtime";

import type { CreatorWorkCapacity } from "@/shared/lib/creator-role-contract";

export interface CreatorRoleWorkloadMember {
  readonly key: string;
  readonly memberId: string | null;
  readonly displayName: string;
  readonly roles: readonly ProductionRole[];
  readonly openTasks: number;
  readonly blockedTasks: number;
  readonly overdueTasks: number;
  readonly dueSoonTasks: number;
}

export interface CreatorRoleWorkloadSummary {
  readonly members: readonly CreatorRoleWorkloadMember[];
  readonly unassignedTasks: number;
  readonly currentUserOpenTasks: number;
  readonly capacity: CreatorWorkCapacity;
  readonly overloaded: boolean;
}

function validDue(value: string): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function creatorRoleWorkload(
  workspace: ProductionWorkspace,
  currentUserId: string,
  capacity: CreatorWorkCapacity,
  now: number = Date.now(),
): CreatorRoleWorkloadSummary {
  const members = new Map<string, CreatorRoleWorkloadMember>();
  const assignmentMemberKey = new Map<string, string>();
  for (const assignment of workspace.roleAssignments) {
    const key = assignment.memberId
      ? `member:${assignment.memberId}`
      : `name:${assignment.displayName.trim().toLocaleLowerCase()}`;
    assignmentMemberKey.set(assignment.id, key);
    const existing = members.get(key);
    members.set(key, {
      key,
      memberId: assignment.memberId,
      displayName: assignment.displayName,
      roles: [...new Set([...(existing?.roles ?? []), ...assignment.roles])],
      openTasks: existing?.openTasks ?? 0,
      blockedTasks: existing?.blockedTasks ?? 0,
      overdueTasks: existing?.overdueTasks ?? 0,
      dueSoonTasks: existing?.dueSoonTasks ?? 0,
    });
  }

  let unassignedTasks = 0;
  for (const task of workspace.tasks) {
    if (task.status === "done") continue;
    const assignedKeys = [...new Set(
      (task.assigneeIds ?? [])
        .map((assignmentId) => assignmentMemberKey.get(assignmentId))
        .filter((key): key is string => Boolean(key)),
    )];
    if (assignedKeys.length === 0) {
      unassignedTasks += 1;
      continue;
    }
    const due = validDue(task.due);
    const blocked = task.status === "blocked" || Boolean(task.blockedReason?.trim());
    const overdue = due !== null && due < now;
    const dueSoon = due !== null && due >= now && due - now <= 48 * 60 * 60 * 1_000;
    for (const key of assignedKeys) {
      const member = members.get(key);
      if (!member) continue;      members.set(key, {
        ...member,
        openTasks: member.openTasks + 1,
        blockedTasks: member.blockedTasks + (blocked ? 1 : 0),
        overdueTasks: member.overdueTasks + (overdue ? 1 : 0),
        dueSoonTasks: member.dueSoonTasks + (dueSoon ? 1 : 0),
      });
    }
  }

  const ordered = [...members.values()].sort((left, right) => {
    const leftRisk = left.blockedTasks * 100 + left.overdueTasks * 80 + left.openTasks;
    const rightRisk = right.blockedTasks * 100 + right.overdueTasks * 80 + right.openTasks;
    return rightRisk - leftRisk || left.displayName.localeCompare(right.displayName, "ko");
  });
  const currentUserOpenTasks = ordered.find(
    (member) => member.memberId === currentUserId,
  )?.openTasks ?? 0;
  const overloaded = capacity.maxConcurrentTasks !== null
    && currentUserOpenTasks > capacity.maxConcurrentTasks;

  return {
    members: ordered,
    unassignedTasks,
    currentUserOpenTasks,
    capacity,
    overloaded,
  };
}
