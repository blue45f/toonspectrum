import { describe, expect, it } from "vitest";

import { evaluateReviewPolicy, reviewPolicyCommandSchema, reviewPolicyDefinitionSchema, type ReviewPolicyDefinition, type ReviewPolicyVoteRecord } from "../graph/review-policy";

const definition = (mode: ReviewPolicyDefinition["mode"] = "parallel"): ReviewPolicyDefinition => ({ mode, groups: [
  { id: "production", label: "제작", reviewerIds: ["artist", "pd"], requiredApprovals: 2 },
  { id: "rights", label: "권리", reviewerIds: ["owner"], requiredApprovals: 1 },
] });
const vote = (groupId: string, actorId: string, stateVersion: number, decision: ReviewPolicyVoteRecord["decision"] = "approve"): ReviewPolicyVoteRecord => ({
  groupId, actorId, stateVersion, decision, note: decision === "approve" ? "" : "수정 필요", decidedAt: "2026-09-21T00:00:00.000Z",
});
describe("fixed-review group policy", () => {
  it("requires every group quorum and ignores duplicate/unknown votes", () => {
    const values = [vote("production", "artist", 2), vote("production", "artist", 3), vote("production", "pd", 4), vote("rights", "owner", 5), vote("rights", "outsider", 6)];
    const result = evaluateReviewPolicy(definition(), values, ["artist", "pd", "owner"]);
    expect(result.satisfied).toBe(true); expect(result.groups.map((group) => group.approvalCount)).toEqual([2, 1]);
    expect(evaluateReviewPolicy(definition(), values, ["artist", "owner"]).satisfied).toBe(false);
    expect(evaluateReviewPolicy(definition(), values.slice(0, 3), ["artist", "pd", "owner"]).satisfied).toBe(false);
  });
  it("uses the latest vote and blocks an eligible change request", () => {
    const values = [vote("production", "artist", 2), vote("production", "pd", 3), vote("rights", "owner", 4), vote("production", "pd", 5, "request-changes")];
    const result = evaluateReviewPolicy(definition(), values, ["artist", "pd", "owner"]);
    expect(result.satisfied).toBe(false); expect(result.groups[0]?.changeRequestedBy).toEqual(["pd"]);
    expect(evaluateReviewPolicy(definition(), [...values, vote("production", "pd", 6)], ["artist", "pd", "owner"]).satisfied).toBe(true);
  });
  it("invalidates downstream sequential votes after an earlier group changes", () => {
    const original = [vote("production", "artist", 2), vote("production", "pd", 3), vote("rights", "owner", 4)];
    expect(evaluateReviewPolicy(definition("sequential"), original, ["artist", "pd", "owner"]).satisfied).toBe(true);
    const result = evaluateReviewPolicy(definition("sequential"), [...original, vote("production", "artist", 5)], ["artist", "pd", "owner"]);
    expect(result.groups[1]).toMatchObject({ ready: true, satisfied: false, staleVoterIds: ["owner"] });
    expect(evaluateReviewPolicy(definition("sequential"), [...original, vote("production", "artist", 5), vote("rights", "owner", 6)], ["artist", "pd", "owner"]).satisfied).toBe(true);
  });
  it("does not count votes from a now-inaccessible reviewer or an unready group", () => {
    const result = evaluateReviewPolicy(definition("sequential"), [vote("rights", "owner", 2), vote("production", "artist", 3)], ["artist", "owner"]);
    expect(result.satisfied).toBe(false); expect(result.groups[1]).toMatchObject({ ready: false, satisfied: false });
  });
  it("keeps group and actor identity tuples distinct when IDs contain colons", () => {
    const policy: ReviewPolicyDefinition = { mode: "parallel", groups: [
      { id: "a:b", label: "One", reviewerIds: ["c"], requiredApprovals: 1 },
      { id: "a", label: "Two", reviewerIds: ["b:c"], requiredApprovals: 1 },
    ] };
    expect(evaluateReviewPolicy(policy, [vote("a:b", "c", 2), vote("a", "b:c", 3)], ["c", "b:c"]).satisfied).toBe(true);
  });
  it("rejects impossible quorums, duplicate reviewers/groups and unsigned actor/timestamp fields", () => {
    expect(reviewPolicyDefinitionSchema.safeParse({ mode: "parallel", groups: [{ id: "g", label: "G", reviewerIds: ["a"], requiredApprovals: 2 }] }).success).toBe(false);
    expect(reviewPolicyDefinitionSchema.safeParse({ mode: "parallel", groups: [{ id: "g", label: "G", reviewerIds: ["a", "a"], requiredApprovals: 1 }] }).success).toBe(false);
    expect(reviewPolicyDefinitionSchema.safeParse({ mode: "parallel", groups: [definition().groups[0], definition().groups[0]] }).success).toBe(false);
    const input = { id: "request", type: "vote", pin: { reviewId: "r", artifactId: "a", revisionId: "v", rootGraphHash: "a".repeat(64) }, expectedPolicyVersion: 1, expectedStateVersion: 1, groupId: "g", decision: "request-changes", note: "" };
    expect(reviewPolicyCommandSchema.safeParse(input).success).toBe(false);
    expect(reviewPolicyCommandSchema.safeParse({ ...input, note: "reason", actorId: "someone" }).success).toBe(false);
  });
});
