import { z } from "zod";

import { isoTimestampSchema, sha256Schema, studioEntityIdSchema as id } from "./ids";

const version = z.number().int().nonnegative().max(2_147_483_647);
export const reviewPolicyPinSchema = z.object({
  reviewId: id, artifactId: id, revisionId: id, rootGraphHash: sha256Schema,
}).strict();
export const reviewPolicyGroupSchema = z.object({
  id, label: z.string().trim().min(1).max(100),
  reviewerIds: z.array(id).min(1).max(64), requiredApprovals: z.number().int().min(1).max(64),
}).strict().superRefine((group, context) => {
  if (new Set(group.reviewerIds).size !== group.reviewerIds.length) context.addIssue({ code: "custom", message: "Duplicate reviewers" });
  if (group.requiredApprovals > group.reviewerIds.length) context.addIssue({ code: "custom", message: "Quorum exceeds assigned reviewers" });
});
export const reviewPolicyDefinitionSchema = z.object({
  mode: z.enum(["parallel", "sequential"]), groups: z.array(reviewPolicyGroupSchema).min(1).max(8),
}).strict().refine((policy) => new Set(policy.groups.map((group) => group.id)).size === policy.groups.length, "Duplicate review group");
const base = { id, pin: reviewPolicyPinSchema, expectedPolicyVersion: version, expectedStateVersion: version };
export const reviewPolicyConfigureSchema = z.object({
  ...base, type: z.literal("configure"), definition: reviewPolicyDefinitionSchema,
  reason: z.string().trim().min(1).max(2000),
}).strict();
export const reviewPolicyVoteSchema = z.object({
  ...base, type: z.literal("vote"), groupId: id, decision: z.enum(["approve", "request-changes"]), note: z.string().trim().max(2000),
}).strict().refine((vote) => vote.decision !== "request-changes" || vote.note.length > 0, "A change request needs a reason");
export const reviewPolicyCommandSchema = z.discriminatedUnion("type", [reviewPolicyConfigureSchema, reviewPolicyVoteSchema]);
export const reviewPolicyExpectationSchema = z.object({ ...reviewPolicyPinSchema.shape, policyVersion: version.min(1), stateVersion: version.min(1) }).strict();
export const reviewPolicyVoteRecordSchema = z.object({
  groupId: id, actorId: id, decision: z.enum(["approve", "request-changes"]), note: z.string().max(2000),
  stateVersion: version.min(1), decidedAt: isoTimestampSchema, accessCurrent: z.boolean().optional(),
}).strict();
export const reviewPolicyGroupStateSchema = z.object({
  id, ready: z.boolean(), satisfied: z.boolean(), approvalCount: z.number().int().nonnegative(),
  requiredApprovals: z.number().int().positive(), eligibleIds: z.array(id).max(64),
  changeRequestedBy: z.array(id).max(64), staleVoterIds: z.array(id).max(64),
}).strict();
export const reviewPolicyRecordSchema = z.object({
  pin: reviewPolicyPinSchema, policyVersion: version.min(1), stateVersion: version.min(1),
  definition: reviewPolicyDefinitionSchema, configuredBy: id, configuredAt: isoTimestampSchema,
  votes: z.array(reviewPolicyVoteRecordSchema).max(512), groups: z.array(reviewPolicyGroupStateSchema).max(8),
  satisfied: z.boolean(),
}).strict();
export const reviewPolicyResponseSchema = z.object({
  policy: reviewPolicyRecordSchema.nullable(), canConfigure: z.boolean(),
  eligibleReviewerIds: z.array(id).max(64), actorId: id, replayed: z.boolean().optional(),
}).strict();
export type ReviewPolicyPin = z.infer<typeof reviewPolicyPinSchema>;
export type ReviewPolicyDefinition = z.infer<typeof reviewPolicyDefinitionSchema>;
export type ReviewPolicyCommand = z.infer<typeof reviewPolicyCommandSchema>;
export type ReviewPolicyExpectation = z.infer<typeof reviewPolicyExpectationSchema>;
export type ReviewPolicyVoteRecord = z.infer<typeof reviewPolicyVoteRecordSchema>;
export type ReviewPolicyRecord = z.infer<typeof reviewPolicyRecordSchema>;
export type ReviewPolicyResponse = z.infer<typeof reviewPolicyResponseSchema>;
export type ReviewPolicyGroupState = z.infer<typeof reviewPolicyGroupStateSchema>;

/** Pure projection. Callers supply CURRENT eligible members, never cached role claims. */
export function evaluateReviewPolicy(definition: ReviewPolicyDefinition, votes: readonly ReviewPolicyVoteRecord[], activeReviewerIds: readonly string[]) {
  const active = new Set(activeReviewerIds), latest = new Map<string, ReviewPolicyVoteRecord>();
  for (const vote of votes) {
    const key = JSON.stringify([vote.groupId, vote.actorId]), previous = latest.get(key);
    if (!previous || previous.stateVersion < vote.stateVersion) latest.set(key, vote);
  }
  let dependenciesSatisfied = true, dependencyVersion = 0;
  const groups: ReviewPolicyGroupState[] = definition.groups.map((group) => {
    const eligibleIds = group.reviewerIds.filter((actor) => active.has(actor));
    const candidates = [...latest.values()].filter((vote) => vote.groupId === group.id && group.reviewerIds.includes(vote.actorId));
    const ready = definition.mode === "parallel" || dependenciesSatisfied;
    const current = candidates.filter((vote) => vote.accessCurrent !== false && active.has(vote.actorId)
      && (definition.mode === "parallel" || vote.stateVersion > dependencyVersion));
    const approvalCount = current.filter((vote) => vote.decision === "approve").length;
    const changeRequestedBy = current.filter((vote) => vote.decision === "request-changes").map((vote) => vote.actorId);
    const staleVoterIds = candidates.filter((vote) => !current.includes(vote)).map((vote) => vote.actorId);
    const satisfied = ready && approvalCount >= group.requiredApprovals && changeRequestedBy.length === 0;
    dependenciesSatisfied &&= satisfied;
    for (const vote of candidates) dependencyVersion = Math.max(dependencyVersion, vote.stateVersion);
    return { id: group.id, ready, satisfied, approvalCount, requiredApprovals: group.requiredApprovals, eligibleIds, changeRequestedBy, staleVoterIds };
  });
  return { groups, satisfied: groups.length > 0 && groups.every((group) => group.satisfied) };
}
