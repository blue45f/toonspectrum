import { describe, expect, it } from "vitest";
import { productionCalendarGroups, productionDependencyImpact, sortProductionTasks } from "./studio-production-calendar";
import { productionDueDay } from "./studio-production-smart-views";
import type { ProductionTask } from "./studio-production-workspace-runtime";

const task = (id: string, due = "2026-09-21", dependencyIds: string[] = []): ProductionTask => ({ id, title: id, due, dependencyIds, progress: 0, status: "todo", owner: "" });
describe("calendar and dependency projections", () => {
  it("groups only the requested month and keeps invalid dates separate", () => {
    const tasks = [task("later", "2026-09-30"), task("today"), task("other", "2026-10-01"), task("unknown", ""), task("invalid", "2026-02-30")];
    const before = JSON.stringify(tasks), result = productionCalendarGroups(tasks, "2026-09");
    expect(result.groups.map((g) => g.day)).toEqual(["2026-09-21", "2026-09-30"]);
    expect(result.undated.map((t) => t.id)).toEqual(["unknown", "invalid"]);
    expect(JSON.stringify(tasks)).toBe(before);
    expect(productionDueDay("2024-02-29")).toBe("2024-02-29");
    for (const day of ["2026-02-29", "2026-09-31", "2026-13-01", "2026-09-21T01:00:00Z"]) expect(productionDueDay(day)).toBeNull();
  });
  it("sorts a copy and never mutates original task order", () => {
    const tasks = [task("b", ""), task("a"), {...task("urgent", "2026-09-01"), priority: "urgent" as const}];
    expect(sortProductionTasks(tasks, "due").map((t) => t.id)).toEqual(["urgent", "a", "b"]);
    expect(sortProductionTasks(tasks, "priority").map((t) => t.id)).toEqual(["urgent", "b", "a"]);
    expect(tasks.map((t) => t.id)).toEqual(["b", "a", "urgent"]);
  });
  it("handles missing predecessors and cycles without inventing or repeatedly visiting tasks", () => {
    const tasks = [task("a", undefined, ["missing", "c"]), task("b", undefined, ["a"]), task("c", undefined, ["b"])];
    const result = productionDependencyImpact(tasks, "a");
    expect(result.descendants.map((t) => t.id)).toEqual(["b", "c"]);
    expect(result.unresolved.map((r) => [r.id, r.task?.id ?? null])).toEqual([["missing", null], ["c", "c"]]);
    expect(productionDependencyImpact(tasks, "absent").descendants).toEqual([]);
  });
});
