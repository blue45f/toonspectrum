import { describe, expect, it } from "vitest";

import { reviewPolicyHistoryQuerySchema, reviewPolicyHistoryResponseSchema } from "../graph/review-policy-history";

const pin = { reviewId: "r", artifactId: "a", revisionId: "v", rootGraphHash: "a".repeat(64) };
const entry = (stateVersion: number) => ({ id: `event-${stateVersion}`, policyVersion: 1, stateVersion, actorId: "actor", createdAt: "2026-09-21T00:00:00.000Z",
  command: { id: `event-${stateVersion}`, type: "vote" as const, pin, expectedPolicyVersion: 1, expectedStateVersion: stateVersion - 1, groupId: "g", decision: "approve" as const, note: "" } });
const page = () => ({ pin, actorId: "actor", entries: [entry(3), entry(2)], nextBeforeStateVersion: null });
describe("review policy history contract", () => {
  it("accepts single positive numeric keysets and rejects arrays, empty values and unknown fields", () => {
    expect(reviewPolicyHistoryQuerySchema.parse({ beforeStateVersion: "12" })).toEqual({ beforeStateVersion: 12 });
    for (const beforeStateVersion of [0, -1, NaN, true, "", "1e4", ["2"], "2147483648"]) expect(reviewPolicyHistoryQuerySchema.safeParse({ beforeStateVersion }).success).toBe(false);
    expect(reviewPolicyHistoryQuerySchema.safeParse({ limit: 1000 }).success).toBe(false);
  });
  it("accepts descending exact-review history but rejects foreign sources and duplicate or reordered records", () => {
    expect(reviewPolicyHistoryResponseSchema.safeParse(page()).success).toBe(true);
    expect(reviewPolicyHistoryResponseSchema.safeParse({ ...page(), entries: [entry(2), entry(3)] }).success).toBe(false);
    expect(reviewPolicyHistoryResponseSchema.safeParse({ ...page(), entries: [entry(3), entry(3)] }).success).toBe(false);
    const foreign = entry(3); foreign.command.pin = { ...pin, revisionId: "other" };
    expect(reviewPolicyHistoryResponseSchema.safeParse({ ...page(), entries: [foreign] }).success).toBe(false);
  });
  it("requires the continuation key to match the final item of a full bounded page", () => {
    const entries = Array.from({ length: 25 }, (_, index) => entry(30 - index));
    expect(reviewPolicyHistoryResponseSchema.safeParse({ ...page(), entries, nextBeforeStateVersion: 6 }).success).toBe(true);
    expect(reviewPolicyHistoryResponseSchema.safeParse({ ...page(), entries, nextBeforeStateVersion: 5 }).success).toBe(false);
    expect(reviewPolicyHistoryResponseSchema.safeParse({ ...page(), nextBeforeStateVersion: 2 }).success).toBe(false);
  });
  it("rejects a forged record identity or mismatched consent version", () => {
    expect(reviewPolicyHistoryResponseSchema.safeParse({ ...page(), entries: [{ ...entry(3), id: "different" }] }).success).toBe(false);
    expect(reviewPolicyHistoryResponseSchema.safeParse({ ...page(), entries: [{ ...entry(3), policyVersion: 2 }] }).success).toBe(false);
  });
});
