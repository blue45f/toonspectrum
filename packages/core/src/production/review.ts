import type {
  ApprovalEvaluation,
  ApprovalLaneEvaluation,
  ReviewDecision,
  ReviewLane,
  ReviewPolicy,
} from "./types";

export function evaluateReviewApproval(
  policy: ReviewPolicy,
  decisions: readonly ReviewDecision[],
): ApprovalEvaluation {
  const latestByLaneAndAssignment = new Map<string, ReviewDecision>();
  for (const decision of decisions) {
    const key = `${decision.lane}:${decision.assignmentId}`;
    const current = latestByLaneAndAssignment.get(key);
    if (!current || Date.parse(decision.createdAt) > Date.parse(current.createdAt)) {
      latestByLaneAndAssignment.set(key, decision);
    }
  }

  const results: ApprovalLaneEvaluation[] = policy.lanes.map((lanePolicy) => {
    const laneDecisions = [...latestByLaneAndAssignment.values()].filter(
      (decision) => decision.lane === lanePolicy.lane,
    );
    const approvals = laneDecisions.filter((decision) =>
      decision.value === "approve" || decision.value === "approve-with-conditions").length;
    const approvedAssignments = new Set(laneDecisions.filter((decision) =>
      decision.value === "approve" || decision.value === "approve-with-conditions")
      .map((decision) => decision.assignmentId));
    const missingRequired = lanePolicy.requiredAssignmentIds.filter(
      (assignmentId) => !approvedAssignments.has(assignmentId),
    );
    const vetoedBy = laneDecisions.filter(
      (decision) => decision.value === "veto" && lanePolicy.vetoAssignmentIds.includes(decision.assignmentId),
    ).map((decision) => decision.assignmentId);
    const changeRequestedBy = laneDecisions.filter(
      (decision) => decision.value === "request-changes",
    ).map((decision) => decision.assignmentId);
    const approved = approvals >= lanePolicy.quorum
      && missingRequired.length === 0
      && vetoedBy.length === 0
      && changeRequestedBy.length === 0;
    return Object.freeze({
      lane: lanePolicy.lane,
      approved,
      approvals,
      requiredApprovals: lanePolicy.quorum,
      missingRequiredAssignmentIds: Object.freeze(missingRequired),
      vetoedByAssignmentIds: Object.freeze(vetoedBy),
      changeRequestedByAssignmentIds: Object.freeze(changeRequestedBy),
    });
  });
  const blockingLanes = results
    .filter((result) => !result.approved && policy.lanes.find((lane) => lane.lane === result.lane)?.blocksPublication)
    .map((result) => result.lane as ReviewLane);
  return Object.freeze({
    approved: results.every((result) => result.approved),
    blockingLanes: Object.freeze(blockingLanes),
    laneResults: Object.freeze(results),
  });
}

export function validateReviewDecision(
  policy: ReviewPolicy,
  decision: ReviewDecision,
): readonly string[] {
  const issues: string[] = [];
  const lane = policy.lanes.find((entry) => entry.lane === decision.lane);
  if (!lane) return Object.freeze(["unknown-review-lane"]);
  if (!lane.eligibleAssignmentIds.includes(decision.assignmentId)) issues.push("reviewer-not-eligible");
  if (decision.value === "veto") {
    if (!lane.vetoAssignmentIds.includes(decision.assignmentId)) issues.push("reviewer-cannot-veto");
    if (!decision.reasonCode) issues.push("veto-reason-required");
    if (decision.evidenceScopeRefs.length === 0) issues.push("veto-evidence-required");
  }
  if (decision.value === "request-changes" && !decision.reasonCode) issues.push("change-reason-required");
  if (decision.value === "approve-with-conditions" && decision.conditions.length === 0) {
    issues.push("approval-conditions-required");
  }
  return Object.freeze(issues);
}
