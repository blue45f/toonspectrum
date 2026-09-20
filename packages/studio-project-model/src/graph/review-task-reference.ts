import { z } from "zod";

const identity = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u);

/** A locator shared by the production workspace and API, never an access grant. */
export const studioReviewTaskReferenceSchema = z.object({
  subject: z.object({
    schemaVersion: z.literal(1),
    projectId: identity,
    workId: identity,
    artifactId: identity,
    reviewId: identity,
    revisionId: identity,
    rootGraphHash: z.string().regex(/^[a-f0-9]{64}$/u),
  }).strict(),
  commentId: identity,
  handoffId: identity.nullable(),
}).strict();

export type StudioReviewTaskReference = z.infer<typeof studioReviewTaskReferenceSchema>;

/** Handoff criteria stay in their existing brief and in the task's explicit production scope. */
export function studioReviewTaskReferencesAreValid(
  scopeKey: string,
  tasks: readonly { readonly reviewRef?: StudioReviewTaskReference; readonly hierarchyNodeId?: string | null }[],
  handoffs: readonly { readonly id: string; readonly hierarchyNodeId: string }[],
): boolean {
  return tasks.every((task) => {
    const reference = task.reviewRef;
    if (!reference) return true;
    if (scopeKey !== `work:${reference.subject.workId}`) return false;
    if (reference.handoffId === null) return true;
    const matches = handoffs.filter((handoff) => handoff.id === reference.handoffId);
    return matches.length === 1 && matches[0]!.hierarchyNodeId === task.hierarchyNodeId;
  });
}
