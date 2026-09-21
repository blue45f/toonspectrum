import { canonicalJson } from "@toonspectrum/studio-project-model";
import type { ProductionTask, ProductionWorkspace, ProductionStage, ProductionRole, ProductionPriority, ProductionTaskStatus } from "./studio-production-workspace-runtime";

export interface TaskDraft {
  readonly title: string;
  readonly owner: string;
  readonly due: string;
  readonly progress: number;
  readonly status: ProductionTaskStatus;
  readonly stage: ProductionStage;
  readonly priority: ProductionPriority;
  readonly role: ProductionRole | null;
  readonly hierarchyNodeId: string | null;
  readonly dependencyIds: readonly string[];
  readonly assigneeIds: readonly string[];
  readonly reviewerIds: readonly string[];
  readonly blockedReason: string;
}

export function taskDraft(task: ProductionTask): TaskDraft {
  return {
    title: task.title,
    owner: task.owner,
    due: task.due,
    progress: Math.round(task.progress),
    status: task.status,
    stage: task.stage ?? "planning",
    priority: task.priority ?? "normal",
    role: task.role ?? null,
    hierarchyNodeId: task.hierarchyNodeId ?? null,
    dependencyIds: task.dependencyIds ?? [],
    assigneeIds: task.assigneeIds ?? [],
    reviewerIds: task.reviewerIds ?? [],
    blockedReason: task.blockedReason ?? "",
  };
}


export const taskIdentity = (task: ProductionTask): string => canonicalJson({ id: task.id, ...taskDraft(task), rawProgress: task.progress, reviewRef: task.reviewRef ?? null });
export interface TaskEditState { readonly source: string; readonly baseline: TaskDraft; readonly draft: TaskDraft; readonly expectedAck: string | null }
export function newTaskEdit(task: ProductionTask): TaskEditState { const draft = taskDraft(task); return { source: taskIdentity(task), baseline: draft, draft, expectedAck: null }; }
export const taskEditDirty = (state: TaskEditState): boolean => canonicalJson(state.draft) !== canonicalJson(state.baseline);
export function taskEditConflict(state: TaskEditState, task: ProductionTask): boolean {
  const identity = taskIdentity(task);
  return taskEditDirty(state) && identity !== state.source && identity !== state.expectedAck;
}
export function reconcileTaskEdit(state: TaskEditState, task: ProductionTask): TaskEditState {
  const identity = taskIdentity(task);
  if (identity === state.source) return state;
  return !taskEditDirty(state) || identity === state.expectedAck ? newTaskEdit(task) : state;
}
export function guardTaskEdit(workspace: ProductionWorkspace, scopeKey: string, expected: ProductionTask): void {
  const matches = workspace.tasks.filter((task) => task.id === expected.id);
  if (workspace.scopeKey !== scopeKey || matches.length !== 1 || taskIdentity(matches[0]!) !== taskIdentity(expected)) {
    throw new Error("작업 내용이 변경되어 저장하지 않았습니다. 작성 중인 입력을 유지했으니 최신 작업을 확인해 주세요.");
  }
}
