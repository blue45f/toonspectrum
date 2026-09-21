import { describe, expect, it } from "vitest";
import { newTaskEdit, taskEditConflict, taskEditDirty, taskIdentity, reconcileTaskEdit, guardTaskEdit } from "./studio-production-task-editing";
import { createEmptyProductionWorkspace, type ProductionTask } from "./studio-production-workspace-runtime";

const task: ProductionTask = { id: "t", title: "선화", owner: "작가", due: "2026-09-21", progress: 20, status: "doing", stage: "lineart" };
const workspace = { ...createEmptyProductionWorkspace("work:a", "2026-09-21T00:00:00Z"), tasks: [task] };
const edited = () => { const state = newTaskEdit(task); return { ...state, draft: { ...state.draft, title: "작성 중" } }; };
describe("production dirty input boundaries", () => {
  it("keeps an unsaved edit through an unchanged task refresh", () => {
    const state = edited();
    expect(reconcileTaskEdit(state, { ...task })).toBe(state);
    expect(taskEditDirty(state)).toBe(true);
    expect(taskEditConflict(state, { ...task })).toBe(false);
  });
  it("preserves dirty input and reports concurrent changes", () => {
    const state = edited(), remote = { ...task, owner: "다른 담당자" };
    expect(reconcileTaskEdit(state, remote)).toBe(state);
    expect(taskEditConflict(state, remote)).toBe(true);
    expect(state.draft.title).toBe("작성 중");
  });
  it("adopts an updated task only when clean or when the exact submitted value is acknowledged", () => {
    const next = { ...task, title: "정리된 입력", progress: 25 };
    expect(reconcileTaskEdit(newTaskEdit(task), next).draft.title).toBe(next.title);
    const state = { ...edited(), expectedAck: taskIdentity(next) };
    expect(taskEditConflict(state, next)).toBe(false);
    expect(taskEditDirty(reconcileTaskEdit(state, next))).toBe(false);
  });
  it("does not treat a changed source with the same rounded progress as the old task", () => {
    const state = edited();
    expect(taskEditConflict(state, { ...task, progress: 20.1 })).toBe(true);
  });
  it("rejects missing, duplicated, cross-workspace or stale task updates", () => {
    expect(() => guardTaskEdit(workspace, workspace.scopeKey, task)).not.toThrow();
    for (const current of [
      { ...workspace, scopeKey: "work:b" }, { ...workspace, tasks: [] },
      { ...workspace, tasks: [task, task] }, { ...workspace, tasks: [{ ...task, title: "new" }] },
    ]) expect(() => guardTaskEdit(current, workspace.scopeKey, task)).toThrow();
  });
  it("permits unrelated changes without replacing their contents", () => {
    const other = { ...task, id: "other", title: "채색" };
    const current = { ...workspace, revision: 9, tasks: [task, other] };
    expect(() => guardTaskEdit(current, workspace.scopeKey, task)).not.toThrow();
    expect(current.tasks[1]).toBe(other);
  });
});
