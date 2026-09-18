import {
  inferProductionTaskDepartment,
  type ProductionDepartmentKey,
  type ProductionProjectAggregate,
  type ProductionTask,
  type ProductionTaskStatus,
} from "@toonspectrum/core/production";

import type { CreatorRoleId } from "@/shared/lib/creator-role-contract";
import {
  creatorDetailedRoleLens,
  creatorRoleProductionRoles,
  type CreatorProductionRole,
  type CreatorWorkReason,
  type RankedCreatorWorkItem,
} from "@/shared/lib/creator-role-workspace-contract";

type CreatorProductionAggregateLike = Pick<
  ProductionProjectAggregate,
  "tasks" | "assignments" | "parties"
>;

const CLOSED_STATUSES = new Set<ProductionTaskStatus>([
  "done",
  "cancelled",
  "out-of-scope",
]);
const REVIEW_STATUSES = new Set<ProductionTaskStatus>([
  "internal-review",
  "external-review",
  "conditionally-approved",
]);
const DEPENDENCY_COMPLETE_STATUSES = new Set<ProductionTaskStatus>([
  "approved",
  "done",
]);

const DEPARTMENT_TO_ROLE: Readonly<
  Record<ProductionDepartmentKey, CreatorProductionRole>
> = Object.freeze({
  story: "story",
  storyboard: "storyboard",
  "line-art": "lineart",
  background: "background",
  color: "color",
  lettering: "lettering",
  localization: "lettering",
  editorial: "reviewer",
  production: "director",
  rights: "reviewer",
});

function addReason(reasons: CreatorWorkReason[], reason: CreatorWorkReason): void {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function dayStart(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function dueDate(value: string | null): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString().slice(0, 10);
}

export function creatorProductionRoleForTask(
  task: ProductionTask,
  assignments: ProductionProjectAggregate["assignments"],
): CreatorProductionRole | null {
  const department = inferProductionTaskDepartment(task, assignments);
  return department ? DEPARTMENT_TO_ROLE[department] : null;
}

export function creatorProductionAssignmentIdsForUser(
  aggregate: CreatorProductionAggregateLike,
  userId: string | null,
): ReadonlySet<string> {
  if (!userId) return new Set();
  const partyIds = new Set(aggregate.parties
    .filter((party) => party.accountUserId === userId)
    .map((party) => party.id));
  return new Set(aggregate.assignments
    .filter((assignment) => partyIds.has(assignment.partyId))
    .filter((assignment) => assignment.status === "active" || assignment.status === "onboarding")
    .map((assignment) => assignment.id));
}

export function creatorRequiredProductionRoles(
  aggregate: CreatorProductionAggregateLike,
): readonly CreatorProductionRole[] {
  const roles = new Set<CreatorProductionRole>();
  for (const task of aggregate.tasks) {
    if (CLOSED_STATUSES.has(task.status) || task.assignmentIds.length > 0) continue;
    const role = creatorProductionRoleForTask(task, aggregate.assignments);
    if (role) roles.add(role);
  }
  return [...roles];
}

export function rankCreatorProductionWork(
  aggregate: CreatorProductionAggregateLike,
  options: {
    readonly userId: string | null;
    readonly activeRole: CreatorRoleId | null;
    readonly now?: Date;
    readonly limit?: number;
  },
): readonly RankedCreatorWorkItem[] {
  const now = options.now ?? new Date();
  const today = dayStart(now);
  const assignmentIds = creatorProductionAssignmentIdsForUser(aggregate, options.userId);
  const productionRoles = new Set(creatorRoleProductionRoles(options.activeRole));
  const producerView = creatorDetailedRoleLens(options.activeRole) === "production";
  const statusById = new Map(aggregate.tasks.map((task) => [task.id, task.status] as const));
  const result: RankedCreatorWorkItem[] = [];

  for (const task of aggregate.tasks) {
    if (CLOSED_STATUSES.has(task.status)) continue;
    const reasons: CreatorWorkReason[] = [];
    let score = 0;
    const assigned = task.assignmentIds.some((id) => assignmentIds.has(id));
    const reviewing = task.reviewerAssignmentIds.some((id) => assignmentIds.has(id));
    const productionRole = creatorProductionRoleForTask(task, aggregate.assignments);
    const roleMatch = productionRole ? productionRoles.has(productionRole) : false;

    if (assigned) {
      score += 70;
      addReason(reasons, "assigned-to-me");
    }
    if (reviewing) {
      score += 90;
      addReason(reasons, "assigned-to-me");
      addReason(reasons, "review-requested");
    }
    if (roleMatch) {
      score += 25;
      addReason(reasons, "role-match");
    }
    if (!assigned && !reviewing && !roleMatch && !producerView) continue;

    const due = dueDate(task.dueAt);
    if (due) {
      const days = Math.round((Date.parse(`${due}T00:00:00.000Z`) - today) / 86_400_000);
      if (days < 0) {
        score += 110 + Math.min(30, Math.abs(days));
        addReason(reasons, "overdue");
      } else if (days === 0) {
        score += 80;
        addReason(reasons, "due-today");
      } else if (days <= 2) {
        score += 45;
        addReason(reasons, "due-soon");
      }
    }

    if (task.status === "blocked") {
      score += 65;
      addReason(reasons, "blocked");
    } else if (task.status === "in-progress" || task.status === "changes-requested") {
      score += 18;
    }
    if (REVIEW_STATUSES.has(task.status)) {
      score += 40;
      addReason(reasons, "review-requested");
    }
    if (task.dependencyTaskIds.length > 0
      && task.dependencyTaskIds.every((id) => DEPENDENCY_COMPLETE_STATUSES.has(statusById.get(id) ?? "draft"))) {
      score += 12;
      addReason(reasons, "dependency-ready");
    }

    result.push({
      id: task.id,
      kind: "task",
      title: task.title,
      score,
      reasons,
      due,
      status: task.status,
      productionRole,
    });
  }

  return result
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, Math.max(1, Math.min(50, options.limit ?? 16)));
}
