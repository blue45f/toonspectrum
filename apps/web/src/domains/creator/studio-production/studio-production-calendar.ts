import type { ProductionTask } from "./studio-production-workspace-runtime";
import { productionDueDay } from "./studio-production-smart-views";

export function productionCalendarGroups(tasks: readonly ProductionTask[], month: string) {
  const groups = new Map<string, ProductionTask[]>(), undated: ProductionTask[] = [];
  if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(month)) return { groups: [], undated: tasks.filter((task) => !productionDueDay(task.due)) };
  for (const task of tasks) {
    const day = productionDueDay(task.due);
    if (!day) { undated.push(task); continue; }
    if (!day.startsWith(`${month}-`)) continue;
    const group = groups.get(day) ?? []; group.push(task); groups.set(day, group);
  }
  return { groups: [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, items]) => ({ day, tasks: items })), undated };
}
export function productionDependencyImpact(tasks: readonly ProductionTask[], taskId: string) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const downstream = new Map<string, ProductionTask[]>();
  for (const task of tasks) for (const id of task.dependencyIds ?? []) {
    const group = downstream.get(id) ?? []; group.push(task); downstream.set(id, group);
  }
  const seen = new Set<string>([taskId]), descendants: ProductionTask[] = [], queue = [...(downstream.get(taskId) ?? [])];
  for (let i = 0; i < queue.length; i++) {
    const task = queue[i]!; if (seen.has(task.id)) continue;
    seen.add(task.id); descendants.push(task); queue.push(...(downstream.get(task.id) ?? []));
  }
  return { descendants, unresolved: (byId.get(taskId)?.dependencyIds ?? []).filter((id) => byId.get(id)?.status !== "done")
    .map((id) => ({ id, task: byId.get(id) ?? null })) };
}
export function sortProductionTasks(tasks: readonly ProductionTask[], sort: "original" | "due" | "priority"): ProductionTask[] {
  if (sort === "original") return [...tasks];
  const priorities = { urgent: 0, high: 1, normal: 2, low: 3 };
  return [...tasks].sort((a, b) => sort === "due"
    ? (productionDueDay(a.due) ?? "9999-99-99").localeCompare(productionDueDay(b.due) ?? "9999-99-99")
    : priorities[a.priority ?? "normal"] - priorities[b.priority ?? "normal"]);
}
