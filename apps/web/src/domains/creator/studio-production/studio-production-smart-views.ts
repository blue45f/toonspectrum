import type { ProductionTask, ProductionStage, ProductionRoleAssignment } from "./studio-production-workspace-runtime";

export const PRODUCTION_SMART_VIEWS = ["all", "mine", "due", "blocked", "unassigned", "done"] as const;
export type ProductionSmartView = typeof PRODUCTION_SMART_VIEWS[number];
export interface ProductionSmartFilter {
  readonly view: ProductionSmartView;
  readonly query: string;
  readonly stage: ProductionStage | "all";
  readonly actorId: string | null;
  readonly today: string;
}
export function productionLocalDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function dueDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}
export function productionSmartMatches(task: ProductionTask, filter: ProductionSmartFilter,
  byId: ReadonlyMap<string, ProductionTask>,
  assignments: readonly Pick<ProductionRoleAssignment, "id" | "memberId">[] = []): boolean {
  if (filter.stage !== "all" && (task.stage ?? "planning") !== filter.stage) return false;
  const query = filter.query.trim().normalize("NFKC").toLocaleLowerCase();
  if (query && ![task.title, task.owner, task.blockedReason ?? ""].join(" ").normalize("NFKC").toLocaleLowerCase().includes(query)) return false;
  if (filter.view === "all") return true;
  if (filter.view === "done") return task.status === "done";
  if (task.status === "done") return false;
  if (filter.view === "mine") return !!filter.actorId && (task.assigneeIds ?? []).some((id) => {
    const roles = assignments.filter((assignment) => assignment.id === id);
    // Current tasks hold role-assignment IDs; older tasks can hold direct user IDs.
    // A role ID collision must not become another person's assignment.
    if (roles.length) return roles.length === 1 && roles[0]!.memberId === filter.actorId;
    return id === filter.actorId;
  });
  if (filter.view === "due") { const due = dueDate(task.due); return due !== null && due <= filter.today; }
  if (filter.view === "blocked") return task.status === "blocked" || (task.dependencyIds ?? []).some((id) => byId.get(id)?.status !== "done");
  return !task.assigneeIds?.length && (!task.owner.trim() || task.owner.trim() === "미배정");
}
