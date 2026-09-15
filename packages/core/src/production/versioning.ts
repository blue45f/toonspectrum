import { scopeContains } from "./scope";

import type {
  CreativeBranch,
  CreativeMergeRequest,
  Deliverable,
  ProductionProjectAggregate,
  Submission,
} from "./types";

const BRANCH_TRANSITIONS: Readonly<Record<CreativeBranch["status"], readonly CreativeBranch["status"][]>> = Object.freeze({
  active: ["review", "closed", "expired"],
  review: ["active", "merged", "closed", "expired"],
  merged: [],
  closed: [],
  expired: [],
});

const MERGE_TRANSITIONS: Readonly<
  Record<CreativeMergeRequest["status"], readonly CreativeMergeRequest["status"][]>
> = Object.freeze({
  draft: ["ready-for-review", "closed"],
  "ready-for-review": ["changes-requested", "approved", "conflicted", "closed"],
  "changes-requested": ["draft", "ready-for-review", "closed"],
  approved: ["merged", "conflicted", "closed"],
  conflicted: ["draft", "ready-for-review", "closed"],
  merged: [],
  closed: [],
});

const SUBMISSION_TRANSITIONS: Readonly<
  Record<Submission["status"], readonly Submission["status"][]>
> = Object.freeze({
  submitted: ["in-review", "superseded"],
  "in-review": ["changes-requested", "approved", "superseded"],
  "changes-requested": ["superseded"],
  approved: ["superseded"],
  superseded: [],
});

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

export function validateCreativeBranch(input: {
  readonly branch: CreativeBranch;
  readonly current?: CreativeBranch | null;
  readonly aggregate: Pick<ProductionProjectAggregate, "projectId" | "episodes" | "assignments">;
}): readonly string[] {
  const { branch, current, aggregate } = input;
  const issues: string[] = [];
  if (branch.projectId !== aggregate.projectId) issues.push("branch-project-mismatch");
  if (!aggregate.episodes.some((episode) => episode.episodeId === branch.episodeId)) {
    issues.push("branch-episode-missing");
  }
  const owner = aggregate.assignments.find((assignment) => assignment.id === branch.ownerAssignmentId);
  if (!owner || owner.status !== "active") issues.push("branch-owner-inactive");
  if (branch.baseRevisionRef.lineage !== branch.lineage || branch.headRevisionRef.lineage !== branch.lineage) {
    issues.push("branch-lineage-mismatch");
  }
  if (branch.headRevisionRef.revision < branch.baseRevisionRef.revision) {
    issues.push("branch-head-before-base");
  }
  if (branch.allowedScopes.length === 0) issues.push("branch-scope-empty");
  if (current) {
    if (current.projectId !== branch.projectId || current.episodeId !== branch.episodeId) {
      issues.push("branch-identity-changed");
    }
    if (current.ownerAssignmentId !== branch.ownerAssignmentId) issues.push("branch-owner-changed");
    if (current.lineage !== branch.lineage || current.mergeTarget !== branch.mergeTarget) {
      issues.push("branch-lineage-changed");
    }
    if (current.status !== branch.status && !BRANCH_TRANSITIONS[current.status].includes(branch.status)) {
      issues.push(`illegal-branch-transition:${current.status}:${branch.status}`);
    }
    if (branch.headRevisionRef.revision < current.headRevisionRef.revision) {
      issues.push("branch-head-regressed");
    }
  }
  return Object.freeze(issues);
}

export function validateCreativeMergeRequest(input: {
  readonly request: CreativeMergeRequest;
  readonly current?: CreativeMergeRequest | null;
  readonly branch: CreativeBranch | null;
}): readonly string[] {
  const { request, current, branch } = input;
  const issues: string[] = [];
  if (!branch) return Object.freeze(["merge-source-branch-missing"]);
  if (request.projectId !== branch.projectId || request.episodeId !== branch.episodeId) {
    issues.push("merge-branch-identity-mismatch");
  }
  if (request.sourceBranchId !== branch.id) issues.push("merge-source-branch-mismatch");
  if (request.targetLineage !== branch.mergeTarget) issues.push("merge-target-lineage-mismatch");
  if (request.proposedRevisionRef.lineage !== branch.lineage) issues.push("merge-proposed-lineage-mismatch");
  if (request.proposedRevisionRef.id !== branch.headRevisionRef.id
    || request.proposedRevisionRef.digest !== branch.headRevisionRef.digest) {
    issues.push("merge-proposed-head-mismatch");
  }
  if (request.baseRevisionRef.lineage !== request.targetLineage) issues.push("merge-base-lineage-mismatch");
  if (request.status === "merged") {
    if (!request.mergedRevisionRef) issues.push("merge-result-revision-missing");
    else if (request.mergedRevisionRef.lineage !== request.targetLineage) issues.push("merge-result-lineage-mismatch");
  } else if (request.mergedRevisionRef) {
    issues.push("merge-result-revision-premature");
  }
  if (request.changedScopes.length === 0) issues.push("merge-changed-scope-empty");
  for (const scope of request.changedScopes) {
    if (!branch.allowedScopes.some((allowed) => scopeContains(allowed, scope))) {
      issues.push(`merge-scope-outside-branch:${scope.kind}:${scope.id}`);
    }
  }
  if (!unique(request.requiredReviewLanes)) issues.push("merge-review-lanes-duplicate");
  if (current) {
    if (
      current.projectId !== request.projectId
      || current.episodeId !== request.episodeId
      || current.sourceBranchId !== request.sourceBranchId
    ) {
      issues.push("merge-request-identity-changed");
    }
    if (current.status !== request.status && !MERGE_TRANSITIONS[current.status].includes(request.status)) {
      issues.push(`illegal-merge-transition:${current.status}:${request.status}`);
    }
  }
  if (request.status === "merged" && branch.status !== "review" && branch.status !== "merged") {
    issues.push("merge-branch-not-reviewable");
  }
  return Object.freeze(issues);
}

export function validateDeliverable(
  deliverable: Deliverable,
  projectId: string,
): readonly string[] {
  const issues: string[] = [];
  if (deliverable.projectId !== projectId) issues.push("deliverable-project-mismatch");
  if (!deliverable.type.trim()) issues.push("deliverable-type-missing");
  if (!deliverable.expectedFormat.trim()) issues.push("deliverable-format-missing");
  if (deliverable.completionCriteria.length === 0) issues.push("deliverable-criteria-missing");
  if (deliverable.approvedSubmissionId && deliverable.currentSubmissionId !== deliverable.approvedSubmissionId) {
    issues.push("deliverable-approved-not-current");
  }
  return Object.freeze(issues);
}

export function validateSubmission(input: {
  readonly submission: Submission;
  readonly current?: Submission | null;
  readonly deliverable: Deliverable | null;
  readonly activeAssignmentIds: readonly string[];
}): readonly string[] {
  const { submission, current, deliverable } = input;
  const issues: string[] = [];
  if (!deliverable) return Object.freeze(["submission-deliverable-missing"]);
  if (submission.projectId !== deliverable.projectId) issues.push("submission-project-mismatch");
  if (submission.deliverableId !== deliverable.id) issues.push("submission-deliverable-mismatch");
  if (!input.activeAssignmentIds.includes(submission.submittedByAssignmentId)) {
    issues.push("submission-assignment-inactive");
  }
  if (submission.inputRevisionRefs.length === 0) issues.push("submission-input-revisions-missing");
  if (submission.revisionRef.revision < 1) issues.push("submission-revision-invalid");
  if (current) {
    if (current.deliverableId !== submission.deliverableId) issues.push("submission-identity-changed");
    if (current.status !== submission.status && !SUBMISSION_TRANSITIONS[current.status].includes(submission.status)) {
      issues.push(`illegal-submission-transition:${current.status}:${submission.status}`);
    }
    if (current.revisionRef.id !== submission.revisionRef.id
      || current.revisionRef.digest !== submission.revisionRef.digest) {
      issues.push("submission-content-mutated");
    }
  }
  if (submission.status === "approved" && submission.evidenceRefs.length === 0) {
    issues.push("submission-approval-evidence-missing");
  }
  return Object.freeze(issues);
}

export function applySubmissionToDeliverable(
  deliverable: Deliverable,
  submission: Submission,
): Deliverable {
  if (deliverable.id !== submission.deliverableId) {
    throw new Error("Submission does not belong to deliverable.");
  }
  return Object.freeze({
    ...deliverable,
    currentSubmissionId: submission.id,
    approvedSubmissionId: submission.status === "approved"
      ? submission.id
      : deliverable.approvedSubmissionId,
  });
}
