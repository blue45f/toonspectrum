import { describe, expect, it, vi } from "vitest";
import { createEmptyProductionWorkspace, type ProductionTask } from "./studio-production-workspace-runtime";
import { newTaskEdit, taskEditDirty, taskEditConflict, reconcileTaskEdit, guardTaskEdit, taskIdentity } from "./studio-production-task-editing";
import { productionCalendarGroups, productionDependencyImpact, sortProductionTasks } from "./studio-production-calendar";
import { createProductionViewsRepository, parseProductionViews, productionViewScope, type ProductionSavedFilter } from "./studio-production-saved-views";

const task = (id = "task-a", extra: Partial<ProductionTask> = {}): ProductionTask => ({ id, title: id, owner: "작가", due: "2026-09-21", progress: 20, status: "doing", ...extra });
const workspace = (tasks = [task()]) => ({ ...createEmptyProductionWorkspace("work:alpha", "2026-09-21T00:00:00Z"), tasks });
const filters: ProductionSavedFilter = { view: "all", query: "", stage: "all", layout: "calendar", sort: "due" };
describe("task draft conflict boundary", () => {
  it("retains dirty edits through equivalent refreshes and unrelated task changes", () => {
    const base = newTaskEdit(task()); const editing = { ...base, draft: { ...base.draft, title: "나의 수정" } };
    expect(taskEditDirty(editing)).toBe(true);
    expect(reconcileTaskEdit(editing, { ...task() })).toBe(editing);
    expect(taskEditConflict(editing, { ...task() })).toBe(false);
    expect(() => guardTaskEdit(workspace([task(), task("other")]), "work:alpha", task())).not.toThrow();
  });
  it("preserves input and reports a same-task remote conflict", () => {
    const base = newTaskEdit(task()); const editing = { ...base, draft: { ...base.draft, title: "내 입력" } };
    const remote = task("task-a", { due: "2026-09-22" });
    expect(taskEditConflict(editing, remote)).toBe(true);
    expect(reconcileTaskEdit(editing, remote)).toBe(editing);
    expect(() => guardTaskEdit(workspace([remote]), "work:alpha", task())).toThrow();
  });
  it("acknowledges only the exact submitted task and refreshes a clean draft", () => {
    const base = newTaskEdit(task()); const saved = task("task-a", { title: "제출한 수정" });
    const editing = { ...base, draft: { ...base.draft, title: saved.title }, expectedAck: taskIdentity(saved) };
    expect(reconcileTaskEdit(editing, saved)).toEqual(newTaskEdit(saved));
    expect(taskEditDirty(reconcileTaskEdit(editing, saved))).toBe(false);
    expect(reconcileTaskEdit(base, saved)).toEqual(newTaskEdit(saved));
    expect(taskEditConflict(editing, { ...saved, due: "2026-09-23" })).toBe(true);
  });
  it("rejects missing, duplicate, cross-work and changed-reference tasks at commit time", () => {
    expect(() => guardTaskEdit(workspace([]), "work:alpha", task())).toThrow();
    expect(() => guardTaskEdit(workspace([task(), task()]), "work:alpha", task())).toThrow();
    expect(() => guardTaskEdit(workspace(), "work:beta", task())).toThrow();
    expect(() => guardTaskEdit(workspace([task("task-a", { progress: 20.1 })]), "work:alpha", task())).toThrow();
  });
});
describe("calendar and dependency projections", () => {
  it("groups valid due dates, separates impossible dates and preserves task identities", () => {
    const valid = task(), next = task("next", { due: "2026-10-01" }), invalid = task("invalid", { due: "2026-02-30" });
    const result = productionCalendarGroups([next, invalid, valid], "2026-09");
    expect(result.groups).toEqual([{ day: "2026-09-21", tasks: [valid] }]);
    expect(result.groups[0]?.tasks[0]).toBe(valid); expect(result.undated).toEqual([invalid]);
    expect(productionCalendarGroups([valid], "not-a-month").groups).toEqual([]);
  });
  it("walks transitive dependencies safely even when a legacy cycle exists", () => {
    const tasks = [task("a", { dependencyIds: ["missing"] }), task("b", { dependencyIds: ["a", "c"] }), task("c", { dependencyIds: ["b"] })];
    const before = JSON.stringify(tasks), result = productionDependencyImpact(tasks, "a");
    expect(result.descendants.map((item) => item.id)).toEqual(["b", "c"]);
    expect(result.unresolved).toEqual([{ id: "missing", task: null }]);
    expect(JSON.stringify(tasks)).toBe(before);
  });
  it("sorts without mutating source order and places invalid dates last", () => {
    const tasks = [task("invalid", { due: "" }), task("late", { due: "2026-09-30", priority: "urgent" }), task("early")];
    expect(sortProductionTasks(tasks, "due").map((item) => item.id)).toEqual(["early", "late", "invalid"]);
    expect(sortProductionTasks(tasks, "priority")[0]?.id).toBe("late"); expect(tasks[0]?.id).toBe("invalid");
  });
});
function repositoryFixture() {
  const rows = new Map<string, string>(); let tail: Promise<unknown> = Promise.resolve();
  const store = { get: vi.fn(async (key: string) => rows.get(key) ?? null), set: vi.fn(async (key: string, value: string) => { rows.set(key, value); }), delete: vi.fn(async (key: string) => { rows.delete(key); }) };
  const lock = <T,>(_key: string, action: () => Promise<T>): Promise<T> => { const result = tail.then(action); tail = result.catch(() => undefined); return result; };
  return { rows, store, repository: createProductionViewsRepository(store, lock) };
}
describe("bounded local saved views", () => {
  it("stores only explicit filters and isolates actors/workspaces", async () => {
    const { repository, rows } = repositoryFixture(), a = productionViewScope("actor-a", "work:a");
    const saved = await repository.save(a, "내 선화", { ...filters, stage: "lineart" });
    expect(saved[0]?.filter.stage).toBe("lineart");
    expect(await repository.load(productionViewScope("actor-b", "work:a"))).toEqual([]);
    expect(await repository.load(productionViewScope("actor-a", "work:b"))).toEqual([]);
    expect(JSON.parse(rows.get(a)!).views[0]).toEqual({ id: saved[0]?.id, name: "내 선화", filter: { ...filters, stage: "lineart" } });
    expect(await repository.remove(a, saved[0]!.id)).toEqual([]);
  });
  it("serializes concurrent saves without losing a view", async () => {
    const { repository } = repositoryFixture();
    await Promise.all([repository.save("scope", "one", filters), repository.save("scope", "two", filters)]);
    expect((await repository.load("scope")).map((item) => item.name)).toEqual(["one", "two"]);
  });
  it("rejects normalized duplicate names and a seventeenth view without overwriting", async () => {
    const { repository, rows } = repositoryFixture();
    await repository.save("scope", "ＡＢＣ", filters);
    await expect(repository.save("scope", "abc", filters)).rejects.toThrow();
    for (let i = 1; i < 16; i++) await repository.save("scope", `view-${i}`, filters);
    const original = rows.get("scope"); await expect(repository.save("scope", "overflow", filters)).rejects.toThrow();
    expect(rows.get("scope")).toBe(original);
  });
  it("preserves unreadable storage and propagates unavailable writes", async () => {
    const { repository, rows, store } = repositoryFixture();
    rows.set("scope", "invalid-json");
    await expect(repository.save("scope", "new", filters)).rejects.toThrow();
    expect(store.set).not.toHaveBeenCalled();
    expect(rows.get("scope")).toBe("invalid-json");
    rows.delete("scope");
    store.set.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(repository.save("scope", "new", filters)).rejects.toThrow("storage unavailable");
    expect(rows.has("scope")).toBe(false);
  });
  it("rejects unsupported collection fields and oversized values", () => {
    expect(() => parseProductionViews(JSON.stringify({ version: 1, views: [], extra: true }))).toThrow();
    expect(() => parseProductionViews(" ".repeat(16001))).toThrow();
    expect(() => productionViewScope("actor", "")).toThrow();
  });
});
