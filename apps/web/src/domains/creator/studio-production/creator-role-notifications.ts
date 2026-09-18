import type {
  ProductionRole,
  ProductionTask,
  ProductionWorkspace,
} from "./studio-production-workspace-runtime";

import type { CreatorRoleNotificationLevel } from "@/shared/lib/creator-role-contract";

export type CreatorRoleNotificationTone = "danger" | "warning" | "info";

export interface CreatorRoleNotification {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly tone: CreatorRoleNotificationTone;
  readonly score: number;
  readonly taskId?: string;
}

function dueTimestamp(task: ProductionTask): number | null {
  if (!task.due) return null;
  const value = Date.parse(task.due);
  return Number.isFinite(value) ? value : null;
}

function selectedAssignmentIds(
  workspace: ProductionWorkspace,
  currentUserId: string,
  activeRoles: readonly ProductionRole[],
): ReadonlySet<string> {
  const roles = new Set(activeRoles);
  return new Set(
    workspace.roleAssignments
      .filter((assignment) => assignment.memberId === currentUserId
        && assignment.roles.some((role) => roles.has(role)))
      .map((assignment) => assignment.id),
  );
}
function notificationForTask(
  task: ProductionTask,
  assigned: boolean,
  roleMatched: boolean,
  level: CreatorRoleNotificationLevel,
  now: number,
): CreatorRoleNotification | null {
  if (task.status === "done") return null;
  const due = dueTimestamp(task);
  const overdue = due !== null && due < now;
  const dueSoon = due !== null && due >= now && due - now <= 48 * 60 * 60 * 1_000;
  const blocked = task.status === "blocked" || Boolean(task.blockedReason?.trim());
  const urgent = task.priority === "urgent" || task.priority === "high";
  if (blocked) {
    return {
      id: `task-blocked:${task.id}`,
      title: `${task.title} · 진행 차단`,
      detail: task.blockedReason?.trim() || "차단 원인을 확인하고 다음 담당자와 조율하세요.",
      tone: "danger",
      score: 1_000 + (assigned ? 120 : 0),
      taskId: task.id,
    };
  }
  if (overdue) {
    return {
      id: `task-overdue:${task.id}`,
      title: `${task.title} · 마감 지남`,
      detail: "마감과 다음 인수인계 일정을 다시 확인하세요.",
      tone: "danger",
      score: 900 + (assigned ? 120 : 0),
      taskId: task.id,
    };
  }
  if (level !== "essential" && dueSoon && (assigned || roleMatched)) {
    return {
      id: `task-due-soon:${task.id}`,
      title: `${task.title} · 48시간 이내 마감`,
      detail: assigned ? "내 담당 작업입니다." : "현재 직무와 관련된 작업입니다.",
      tone: "warning",
      score: 700 + (assigned ? 100 : 0),
      taskId: task.id,
    };
  }
  if (level === "all" && (assigned || roleMatched || urgent)) {
    return {
      id: `task-active:${task.id}`,
      title: task.title,
      detail: assigned
        ? "내게 배정된 진행 작업입니다."
        : roleMatched
          ? "현재 직무와 관련된 작업입니다."
          : "우선순위가 높은 미배정 작업입니다.",
      tone: urgent ? "warning" : "info",
      score: 400 + (assigned ? 100 : 0) + (urgent ? 80 : 0),
      taskId: task.id,
    };
  }
  return null;
}

export function creatorRoleNotifications(
  workspace: ProductionWorkspace,
  currentUserId: string,
  activeRoles: readonly ProductionRole[],
  level: CreatorRoleNotificationLevel,
  now: number = Date.now(),
): readonly CreatorRoleNotification[] {
  const assignmentIds = selectedAssignmentIds(workspace, currentUserId, activeRoles);
  const roleSet = new Set(activeRoles);
  const notifications: CreatorRoleNotification[] = [];
  for (const task of workspace.tasks) {
    const assigned = (task.assigneeIds ?? []).some((id) => assignmentIds.has(id))
      || (task.reviewerIds ?? []).some((id) => assignmentIds.has(id));
    const roleMatched = Boolean(task.role && roleSet.has(task.role));
    const notification = notificationForTask(task, assigned, roleMatched, level, now);
    if (notification) notifications.push(notification);
  }

  for (const handoff of workspace.handoffs) {
    if (!roleSet.has(handoff.toRole)) continue;
    if (handoff.status !== "ready" && handoff.status !== "changes-requested") continue;
    if (level === "essential" && handoff.status !== "changes-requested") continue;
    notifications.push({
      id: `handoff:${handoff.id}`,
      title: handoff.status === "changes-requested"
        ? "인계 브리프 수정 요청"
        : "새 인계 브리프 도착",
      detail: handoff.scenePurpose || `${handoff.fromRole} → ${handoff.toRole} 인계 내용을 확인하세요.`,
      tone: handoff.status === "changes-requested" ? "danger" : "info",
      score: handoff.status === "changes-requested" ? 850 : 620,
    });
  }

  return notifications
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, "ko"))
    .slice(0, level === "all" ? 20 : 10);
}
