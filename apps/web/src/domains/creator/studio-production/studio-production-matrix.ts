import type { ProductionHierarchyNode, ProductionTask } from "./studio-production-workspace-runtime";

export interface ProductionEpisodeRow {
  readonly id: string | null; readonly title: string; readonly tasks: readonly ProductionTask[];
}
/** Hierarchy, not display names or page proximity, defines episode membership. */
export function productionEpisodeRows(tasks: readonly ProductionTask[], hierarchy: readonly ProductionHierarchyNode[]): readonly ProductionEpisodeRow[] {
  const byId = new Map(hierarchy.map((node) => [node.id, node]));
  const duplicateIds = new Set(hierarchy.filter((node, index) => hierarchy.findIndex((other) => other.id === node.id) !== index).map((node) => node.id));
  const rows = new Map<string, { id: string; title: string; tasks: ProductionTask[] }>();
  for (const node of [...hierarchy].sort((a,b) => a.order - b.order)) {
    if (node.kind === "episode" && !duplicateIds.has(node.id)) rows.set(node.id, { id: node.id, title: node.title, tasks: [] });
  }
  const unassigned: ProductionTask[] = [];
  for (const task of tasks) {
    let cursor = task.hierarchyNodeId ?? null;
    const visited = new Set<string>();
    let found: string | null = null;
    while (cursor && !visited.has(cursor) && !duplicateIds.has(cursor)) {
      visited.add(cursor);
      const node = byId.get(cursor);
      if (!node) break;
      if (node.kind === "episode") { found = node.id; break; }
      cursor = node.parentId;
    }
    if (found && rows.has(found)) rows.get(found)!.tasks.push(task);
    else unassigned.push(task);
  }
  return [...rows.values(), ...(unassigned.length ? [{ id: null, title: "", tasks: unassigned }] : [])];
}
