import {
  scopeContains,
  stableProductionFingerprint,
  type ProductionProjectAggregate,
  type ProductionTask,
  type RoleAssignment,
} from "@toonstudio/core/production";

export interface ProductionBulkTaskEdit {
  readonly priority: "keep" | NonNullable<ProductionTask["priority"]>;
  readonly assigneeMode: "keep" | "replace" | "clear";
  readonly assignmentId: string;
  readonly deadlineMode: "keep" | "set" | "clear";
  readonly dueAt: string | null;
}
export interface ProductionBulkEditPlan {
  readonly tasks: readonly ProductionTask[];
  readonly expectedTasks: readonly ProductionTask[];
  readonly unchangedCount: number;
}
export const INITIAL_PRODUCTION_BULK_EDIT: ProductionBulkTaskEdit = {
  priority: "keep",
  assigneeMode: "keep",
  assignmentId: "",
  deadlineMode: "keep",
  dueAt: null,
};
const CLOSED = new Set<ProductionTask["status"]>([
  "approved",
  "done",
  "cancelled",
  "out-of-scope",
]);
export function isProductionTaskBulkEditable(task: ProductionTask): boolean {
  return !CLOSED.has(task.status);
}
function assignmentCanOwn(
  assignment: RoleAssignment,
  task: ProductionTask,
  now: number
): boolean {
  return (
    assignment.status === "active" &&
    assignment.projectId === task.projectId &&
    Date.parse(assignment.startsAt) <= now &&
    (!assignment.endsAt || Date.parse(assignment.endsAt) > now) &&
    scopeContains(assignment.scope, task.scope)
  );
}
export function commonProductionBulkAssignees(
  aggregate: ProductionProjectAggregate,
  tasks: readonly ProductionTask[],
  at: string
): readonly RoleAssignment[] {
  if (!tasks.length || !Number.isFinite(Date.parse(at))) return [];
  return aggregate.assignments.filter((assignment) =>
    tasks.every((task) => assignmentCanOwn(assignment, task, Date.parse(at)))
  );
}
/** 미리 보기에서 승인·작업 상태는 건드리지 않고 선택한 필드만 변경한다. */
export function buildProductionBulkEditPlan(
  aggregate: ProductionProjectAggregate,
  snapshots: readonly ProductionTask[],
  edit: ProductionBulkTaskEdit,
  at: string
): ProductionBulkEditPlan {
  if (
    !snapshots.length ||
    snapshots.length > 200 ||
    new Set(snapshots.map((task) => task.id)).size !== snapshots.length
  ) {
    throw new Error("중복 없이 1~200개 작업을 선택하세요.");
  }
  const now = Date.parse(at);
  if (!Number.isFinite(now))
    throw new Error("작업 변경 시각을 확인할 수 없습니다.");
  const currentById = new Map(aggregate.tasks.map((task) => [task.id, task]));
  for (const snapshot of snapshots) {
    const current = currentById.get(snapshot.id);
    if (
      snapshot.projectId !== aggregate.projectId ||
      !current ||
      stableProductionFingerprint(current) !==
        stableProductionFingerprint(snapshot)
    ) {
      throw new Error(
        "선택한 작업이 변경되었습니다. 편집을 닫고 최신 작업을 다시 선택하세요."
      );
    }
    if (!isProductionTaskBulkEditable(current))
      throw new Error("승인·완료·보관된 작업은 일괄 편집할 수 없습니다.");
  }
  const assignment = aggregate.assignments.find(
    (entry) => entry.id === edit.assignmentId
  );
  if (
    edit.assigneeMode === "replace" &&
    (!assignment ||
      !snapshots.every((task) => assignmentCanOwn(assignment, task, now)))
  ) {
    throw new Error(
      "선택한 모든 작업의 범위와 활동 기간에 맞는 담당자를 선택하세요."
    );
  }
  if (
    edit.deadlineMode === "set" &&
    (!edit.dueAt || !Number.isFinite(Date.parse(edit.dueAt)))
  ) {
    throw new Error("새 마감 일시를 입력하세요.");
  }
  const tasks: ProductionTask[] = [];
  const expectedTasks: ProductionTask[] = [];
  for (const task of snapshots) {
    let next = task;
    if (
      edit.priority !== "keep" &&
      edit.priority !== (task.priority ?? "normal")
    )
      next = { ...next, priority: edit.priority };
    if (edit.assigneeMode === "clear" && task.assignmentIds.length)
      next = { ...next, assignmentIds: [] };
    if (
      edit.assigneeMode === "replace" &&
      (task.assignmentIds.length !== 1 ||
        task.assignmentIds[0] !== edit.assignmentId)
    ) {
      next = { ...next, assignmentIds: [edit.assignmentId] };
    }
    if (edit.deadlineMode === "clear" && task.dueAt !== null)
      next = { ...next, dueAt: null };
    if (
      edit.deadlineMode === "set" &&
      edit.dueAt &&
      (!task.dueAt || Date.parse(task.dueAt) !== Date.parse(edit.dueAt))
    ) {
      next = { ...next, dueAt: new Date(edit.dueAt).toISOString() };
    }
    if (next !== task) {
      tasks.push(next);
      expectedTasks.push(task);
    }
  }
  return {
    tasks,
    expectedTasks,
    unchangedCount: snapshots.length - tasks.length,
  };
}
