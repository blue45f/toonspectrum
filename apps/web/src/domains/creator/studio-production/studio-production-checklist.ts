import type { ProductionWorkspace } from "./studio-production-workspace-runtime";

export interface ProductionChecklistState {
  readonly state: "unavailable" | "empty" | "pending" | "clear";
  readonly unfinishedTasks: number | null;
  readonly requiredReviews: number | null;
}
/** An operational checklist is never a grant of manuscript approval or publication. */
export function productionChecklistState(workspace: Pick<ProductionWorkspace, "tasks" | "reviews">,
  verified: boolean): ProductionChecklistState {
  if (!verified) return { state: "unavailable", unfinishedTasks: null, requiredReviews: null };
  const unfinishedTasks = workspace.tasks.filter((task) => task.status !== "done").length;
  const requiredReviews = workspace.reviews.filter((issue) => issue.status !== "resolved"
    && (issue.approvalRequired || issue.severity === "blocker" || issue.severity === "major")).length;
  return { state: !workspace.tasks.length ? "empty" : unfinishedTasks || requiredReviews ? "pending" : "clear",
    unfinishedTasks, requiredReviews };
}
