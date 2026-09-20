import type { StudioRevisionRecord } from "../project-graph/studio-project-graph-contract";
import { reviewProductionFixture } from "../review-production/studio-review-production-test-fixture";
import type { StudioReviewResolutionAuthority } from "./studio-review-resolution-authority";

export function reviewResolutionFixture(now = Date.now()) {
  const seed = reviewProductionFixture(now), origin = seed.verified;
  const replacement = { ...origin, subject: { ...origin.subject, reviewId: "review-new", revisionId: "snapshot-new", rootGraphHash: "b".repeat(64) },
    review: { ...origin.review, id: "review-new", revisionId: "snapshot-new", title: "수정된 손 방향", comments: [], openRequiredCommentCount: 0 },
    revision: { ...origin.revision, id: "snapshot-new", rootGraphHash: "b".repeat(64), parentIds: ["submission-new"] } };
  const submission: StudioRevisionRecord = { ...replacement.revision, id: "submission-new", kind: "submission", parentIds: ["checkpoint-new"] };
  const request = { origin: seed.request, replacement: replacement.subject };
  const authority: StudioReviewResolutionAuthority = { origin, replacement, comment: seed.authority.comment, submissionId: submission.id,
    expiresAt: now + 15_000, resolved: false };
  return { request, authority, origin, replacement, revisions: [origin.revision, replacement.revision, submission], team: seed.authority.team };
}
