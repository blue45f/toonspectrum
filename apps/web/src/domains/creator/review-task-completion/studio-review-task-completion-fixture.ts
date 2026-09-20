import type { StudioReviewTaskCompletionContext, StudioReviewTaskCompletionInput } from "@toonspectrum/studio-project-model";
import type { StudioReviewTaskCompletionRequest } from "./studio-review-task-completion-client";

export function completionFixture() {
  const request: StudioReviewTaskCompletionRequest = { taskId: "task", commentId: "comment", subject: {
    schemaVersion: 1, workId: "work", projectId: "project", artifactId: "artifact", reviewId: "review", revisionId: "snapshot", rootGraphHash: "a".repeat(64) } };
  const context: StudioReviewTaskCompletionContext = { workId: "work", taskId: "task", taskTitle: "두 번째 컷 수정", commentBody: "손의 방향을 수정해 주세요.",
    reference: { subject: request.subject, commentId: "comment", handoffId: "handoff" },
    replacement: { ...request.subject, reviewId: "new-review", revisionId: "new-snapshot", rootGraphHash: "b".repeat(64) },
    criteria: ["손가락이 대사 방향을 가리킴", "소매 연결 유지"],
    resolution: { revisionId: "new-submission", resolvedBy: "actor", updatedAt: "2026-09-20T00:00:00.000Z" },
    baseRevision: 4, proofDigest: "c".repeat(64), evidence: null };
  const input: StudioReviewTaskCompletionInput = { requestId: "intent", baseRevision: 4, proofDigest: context.proofDigest, confirmedCriteria: [...context.criteria] };
  const completed: StudioReviewTaskCompletionContext = { ...context, baseRevision: 5, evidence: { current: true, receipt: {
    contract: "studio-review-task-completion-v1", workId: "work", taskId: "task", requestId: "intent", reference: context.reference,
    replacement: context.replacement, criteria: context.criteria, resolution: context.resolution, proofDigest: context.proofDigest,
    workspaceRevision: 5, completedBy: "actor", completedAt: "2026-09-20T00:01:00.000Z" } } };
  return { request, context, input, completed };
}
