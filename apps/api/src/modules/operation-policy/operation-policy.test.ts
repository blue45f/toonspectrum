import { describe, expect, it } from "vitest";
import { initialOperationPolicy, licenseReviewAllows, operationTransitionBlockers, resolveOperationPolicy, type OperationPolicyDraft } from "@toonspectrum/contracts/operation-policy";
import { nextSeoulDay } from "@toonspectrum/contracts/production-workspace";
import { ApplyOperationPolicySchema, OperationPolicyDraftSchema } from "./operation-policy.dto";
import { WorkspaceCommandSchema, WorkspaceCreateSchema } from "../production-collaboration/team-workspace.dto";

const now = new Date("2026-09-22T00:00:00Z");
const fingerprint = `sha256:${"a".repeat(64)}`;
function approvedPaid(): OperationPolicyDraft {
  return { ...initialOperationPolicy(), mode: "paid", releaseReview: {
    state: "approved", approvedModes: ["paid"], subjectDigest: fingerprint,
    evidenceRef: "test-fixture-not-a-real-license-review", validUntil: "2026-10-01T00:00:00Z",
  } };
}
const effective = (draft: OperationPolicyDraft, digest: string | null = fingerprint) => resolveOperationPolicy({ revision: 7, draft, updatedAt: now.toISOString() }, digest, now);
describe("production operation mode policy", () => {
  it("starts free with no billing or automatic enrollment", () => {
    const result = effective(initialOperationPolicy());
    expect(result.mode).toBe("free");
    expect(result.billing).toEqual({ state: "disabled", checkoutEnabled: false, automaticEnrollment: false });
    expect(result.features["team-workspace"].enabled).toBe(true);
    expect(result.existingData).toBe("preserve");
  });
  it("can configure the paid profile while retaining free operation", () => {
    const base = initialOperationPolicy();
    const draft = { ...base, profiles: { ...base.profiles, paid: { ...base.profiles.paid, limits: { ...base.profiles.paid.limits, membersPerWorkspace: 20 } } } };
    expect(OperationPolicyDraftSchema.safeParse(draft).success).toBe(true);
    expect(effective(draft).limits.membersPerWorkspace).toBe(10);
  });
  it("rejects a paid transition without matching deployment evidence", () => {
    expect(operationTransitionBlockers({ ...initialOperationPolicy(), mode: "paid" }, fingerprint, now)).toHaveLength(1);
    expect(effective(approvedPaid(), null).features["team-workspace"].enabled).toBe(false);
  });
  it.each([null, `sha256:${"b".repeat(64)}`, "not-a-digest"])("fails closed for runtime fingerprint %s", (digest) => {
    expect(licenseReviewAllows(approvedPaid().releaseReview, "paid", digest, now)).toBe(false);
  });
  it("rejects expired or explicitly blocked approval", () => {
    const review = approvedPaid().releaseReview;
    expect(licenseReviewAllows({ ...review, validUntil: now.toISOString() }, "paid", fingerprint, now)).toBe(false);
    expect(licenseReviewAllows({ ...review, state: "blocked" }, "paid", fingerprint, now)).toBe(false);
    expect(licenseReviewAllows(review, "free", fingerprint, now)).toBe(false);
  });
  it("changes mode/profile without starting checkout or raising user entitlements", () => {
    const base = approvedPaid();
    const draft = { ...base, profiles: { ...base.profiles, paid: { ...base.profiles.paid, limits: { ...base.profiles.paid.limits, ownedWorkspaces: 3 } } } };
    expect(effective(draft).limits.ownedWorkspaces).toBe(3);
    expect(effective(draft).billing.checkoutEnabled).toBe(false);
    expect(operationTransitionBlockers(draft, fingerprint, now)).toEqual([]);
  });
  it("always permits switching back to free even after paid approval expiry", () => {
    expect(operationTransitionBlockers({ ...approvedPaid(), mode: "free" }, null, now)).toEqual([]);
  });
  it("does not activate unintegrated licensed or metered providers by toggling", () => {
    const base = initialOperationPolicy();
    const draft = { ...base, profiles: { ...base.profiles, free: { ...base.profiles.free, features: { ...base.profiles.free.features, "ai-shading": true, "licensed-assets": true } } } };
    expect(effective(draft).features["ai-shading"].enabled).toBe(false);
    expect(effective(draft).features["licensed-assets"].enabled).toBe(false);
  });
  it("rejects payment flags and invalid capacity rather than ignoring them", () => {
    expect(OperationPolicyDraftSchema.safeParse({ ...initialOperationPolicy(), billingEnabled: true }).success).toBe(false);
    const base = initialOperationPolicy();
    expect(OperationPolicyDraftSchema.safeParse({ ...base, profiles: { ...base.profiles, free: { ...base.profiles.free, limits: { ...base.profiles.free.limits, membersPerWorkspace: 0 } } } }).success).toBe(false);
    expect(ApplyOperationPolicySchema.safeParse({ expectedRevision: 0, draft: base, reason: "x" }).success).toBe(false);
  });
  it("requires evidence when marking a review approved", () => {
    const base = initialOperationPolicy();
    expect(OperationPolicyDraftSchema.safeParse({ ...base, releaseReview: { ...base.releaseReview, state: "approved" } }).success).toBe(false);
  });
  it("validates strict workspace requests and forbids identity or owner injection", () => {
    expect(WorkspaceCreateSchema.safeParse({ name: "팀", mutationId: crypto.randomUUID(), userId: "attacker" }).success).toBe(false);
    expect(WorkspaceCommandSchema.safeParse({ type: "invite", mutationId: crypto.randomUUID(), expectedRevision: 0, email: "a@example.test", role: "owner" }).success).toBe(false);
  });
  it("returns the next Seoul midnight rather than a client-calculated reset", () => {
    expect(nextSeoulDay(new Date("2026-09-21T14:59:59Z"))).toBe("2026-09-21T15:00:00.000Z");
    expect(nextSeoulDay(new Date("2026-09-21T15:00:00Z"))).toBe("2026-09-22T15:00:00.000Z");
  });
});
