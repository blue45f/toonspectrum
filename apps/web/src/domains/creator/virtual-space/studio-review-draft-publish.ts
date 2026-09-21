import { canonicalJson } from "@toonspectrum/studio-project-model";
import { createStudioReviewComment } from "../project-graph/studio-project-graph-client";
import type { StudioReviewComment } from "../project-graph/studio-project-graph-contract";
import { verifyStudioVirtualSpaceReviewSubject, type StudioVirtualSpaceReviewVerification } from "./studio-virtual-space-review-invitation";
import { sameStudioVirtualSpaceReviewSubject } from "./studio-virtual-space-review-subject";
import { reviewDraftScopeKey, type ReviewDraftInput, type ReviewDraftScope, type ReviewDraftRepository } from "./studio-review-draft-shelf";

export function draftMatchesComment(scope: ReviewDraftScope, input: ReviewDraftInput, comment: StudioReviewComment): boolean {
  return comment.id === input.id && comment.reviewId === scope.subject.reviewId && comment.authorUserId === scope.actorId
    && comment.body === input.body && comment.severity === input.severity
    && canonicalJson(comment.anchor) === canonicalJson(input.anchor)
    && canonicalJson([...comment.assigneeIds].sort()) === canonicalJson([...input.assigneeIds].sort())
    && (comment.dueAt ? Date.parse(comment.dueAt) : null) === (input.dueAt ? Date.parse(input.dueAt) : null);
}
export interface ReviewDraftPublisherDependencies {
  verify: (scope: ReviewDraftScope) => Promise<StudioVirtualSpaceReviewVerification>;
  create: typeof createStudioReviewComment;
}
const defaults: ReviewDraftPublisherDependencies = {
  verify: (scope) => verifyStudioVirtualSpaceReviewSubject(scope.subject, "view"), create: createStudioReviewComment,
};
export interface ReviewDraftPublishResult { readonly confirmed: readonly string[]; readonly stopped: string | null }
/** Per-note durable identities, not an atomic batch. Unknown results keep their original ID. */
export function publishReviewDrafts(scope: ReviewDraftScope, ids: readonly string[], repository: ReviewDraftRepository,
  current: () => boolean, dependencies: ReviewDraftPublisherDependencies = defaults): Promise<ReviewDraftPublishResult> {
  if (!ids.length || ids.length > 20 || new Set(ids).size !== ids.length) return Promise.reject(new Error("Invalid draft selection"));
  return repository.publishLock(`studio-review-drafts:publish:${reviewDraftScopeKey(scope)}`, async () => {
    const confirmed: string[] = [];
    const check = () => { if (!current()) throw new Error("cancelled"); };
    const verify = async () => {
      check(); const value = await dependencies.verify(scope); check();
      if (!value.ok || !value.project.access.view || value.expiresAt <= Date.now()
        || !sameStudioVirtualSpaceReviewSubject(value.subject, scope.subject)
        || value.revision.id !== scope.subject.revisionId || value.revision.rootGraphHash !== scope.subject.rootGraphHash) throw new Error("unavailable");
      return value;
    };
    for (const id of ids) {
      try {
        check(); const entries = await repository.list(scope); check();
        const draft = entries.find((entry) => entry.input.id === id);
        if (!draft) throw new Error("draft-missing");
        const initial = await verify();
        const existing = initial.review.comments.find((comment) => comment.id === id);
        if (existing) {
          if (!draftMatchesComment(scope, draft.input, existing)) throw new Error("receipt-mismatch");
          await repository.remove(scope, id, current, true); check(); confirmed.push(id); continue;
        }
        if (!initial.project.access.comment || !["open", "changes-requested"].includes(initial.review.status)) throw new Error("comment-unavailable");
        const marked = await repository.markAttempt(scope, id, current); check();
        if (initial.expiresAt <= Date.now()) throw new Error("expired");
        const receipt = await dependencies.create(scope.subject.reviewId, marked.input); check();
        if (receipt.id !== id || receipt.reviewId !== scope.subject.reviewId
          || canonicalJson(receipt.anchor) !== canonicalJson(marked.input.anchor)) throw new Error("receipt-mismatch");
        const final = await verify(), recorded = final.review.comments.find((comment) => comment.id === id);
        if (!recorded || !draftMatchesComment(scope, marked.input, recorded)) throw new Error("receipt-unconfirmed");
        await repository.remove(scope, id, current, true); check(); confirmed.push(id);
      } catch { return { confirmed, stopped: current() ? id : "cancelled" }; }
    }
    return { confirmed, stopped: null };
  });
}
