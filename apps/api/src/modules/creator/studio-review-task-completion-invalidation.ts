import { createHash } from "node:crypto";
import { canonicalJson, studioReviewTaskCompletionReceiptSchema } from "@toonspectrum/studio-project-model";
import type { StudioProductionWorkspaceDocument } from "./studio-production.dto";

export const studioReviewTaskCompletionFingerprint = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");

/** Only fields that change the completed obligation invalidate its evidence. Labels and
 * unrelated tasks are not grounds to ask someone to repeat their confirmation. */
function lineage(document: StudioProductionWorkspaceDocument, id: string | null) {
  const result: { id: string; kind: StudioProductionWorkspaceDocument["hierarchy"][number]["kind"] | null; pageId: string | null }[] = [];
  const visited = new Set<string>();
  while (id !== null && !visited.has(id)) {
    visited.add(id);
    const node = document.hierarchy.find((candidate) => candidate.id === id);
    // A stable production node can be rebound to a different source page.
    result.push({ id, kind: node?.kind ?? null, pageId: node?.pageId ?? null });
    id = node?.parentId ?? null;
  }
  return result;
}
export function studioReviewTaskCompletionBasis(document: StudioProductionWorkspaceDocument, taskId: string) {
  const task = document.tasks.find((item) => item.id === taskId);
  if (!task) return null;
  const handoff = document.handoffs.find((item) => item.id === task.reviewRef?.handoffId);
  return { reference: task.reviewRef ?? null, scope: lineage(document, task.hierarchyNodeId),
    handoff: handoff ? { scope: lineage(document, handoff.hierarchyNodeId), criteria: handoff.acceptanceCriteria } : null };
}
function obligation(document: StudioProductionWorkspaceDocument, taskId: string) {
  const task = document.tasks.find((item) => item.id === taskId);
  return task ? { basis: studioReviewTaskCompletionBasis(document, taskId), status: task.status, progress: task.progress } : null;
}

export function studioReviewTaskCompletionChangedTasks(current: StudioProductionWorkspaceDocument, next: StudioProductionWorkspaceDocument): string[] {
  const ids = new Set([...current.tasks, ...next.tasks].filter((task) => task.reviewRef).map((task) => task.id));
  return [...ids].filter((id) => canonicalJson(obligation(current, id)) !== canonicalJson(obligation(next, id)));
}

export function studioReviewTaskCompletionInvalidations(
  current: StudioProductionWorkspaceDocument, next: StudioProductionWorkspaceDocument, receipts: readonly unknown[],
) {
  return receipts.flatMap((raw) => {
    const parsed = studioReviewTaskCompletionReceiptSchema.safeParse(raw);
    if (!parsed.success || parsed.data.workId !== current.scopeKey.slice(5)) return [];
    const receipt = parsed.data;
    if (canonicalJson(obligation(current, receipt.taskId)) === canonicalJson(obligation(next, receipt.taskId))) return [];
    return [{ contract: "studio-review-task-completion-invalidated-v1" as const, workId: receipt.workId, taskId: receipt.taskId,
      completionFingerprint: studioReviewTaskCompletionFingerprint(receipt), workspaceRevision: next.revision,
      artifactId: receipt.reference.subject.artifactId, revisionId: receipt.reference.subject.revisionId }];
  });
}
