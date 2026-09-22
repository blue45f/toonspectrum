import { describe, expect, it } from "vitest";

import { pinnedShareCreateSchema, pinnedShareAccessSchema, pinnedShareSnapshotSchema, pinnedShareFeedbackInputSchema,
  pinnedShareViewSchema, type PinnedShareCreate } from "../graph/pinned-review-share";

const id = "123e4567-e89b-42d3-a456-426614174000";
function input(): PinnedShareCreate { return { id, operationId: id, subject: { schemaVersion: 1, workId: "work", projectId: "project", artifactId: "artifact", reviewId: "review", revisionId: "revision", rootGraphHash: "a".repeat(64) },
  title: "Shared snapshot", instructions: "Only this selected page", purpose: "external-review", role: "commenter", pageOrdinals: [0], expiresInHours: 24, watermark: true, rightsStatement: "", publicationConsent: false }; }
function snapshot() { return { contract: "studio-pinned-review-share-v1", input: input(), createdBy: "actor", managerDigest: "b".repeat(64),
  createdAt: "2026-09-22T00:00:00.000Z", expiresAt: "2026-09-23T00:00:00.000Z", approvalDigest: null,
  pages: [{ ordinal: 0, sha256: "c".repeat(64), byteLength: 100, mediaType: "image/png", width: 100, height: 100 }] }; }
describe("strict isolated pinned-share contracts", () => {
  it("permits explicit selected-page private review and mentoring without a public consent flag", () => {
    expect(pinnedShareCreateSchema.parse(input()).pageOrdinals).toEqual([0]);
    expect(pinnedShareCreateSchema.safeParse({ ...input(), publicationConsent: true }).success).toBe(false);
    expect(pinnedShareCreateSchema.parse({ ...input(), purpose: "mentoring" }).purpose).toBe("mentoring");
    expect(pinnedShareSnapshotSchema.parse(snapshot()).approvalDigest).toBeNull();
  });
  it.each([{ role: "commenter", publicationConsent: true, rightsStatement: "Owner permission" },
    { role: "viewer", publicationConsent: false, rightsStatement: "Owner permission" },
    { role: "viewer", publicationConsent: true, rightsStatement: "" }])("requires separate consent, stated rights and read-only public sharing", (changes) => {
    expect(pinnedShareCreateSchema.safeParse({ ...input(), purpose: "showcase", ...changes }).success).toBe(false);
  });
  it("requires a saved approval digest in a public snapshot", () => {
    const value = snapshot(); value.input = { ...input(), purpose: "showcase", role: "viewer", publicationConsent: true, rightsStatement: "Explicit owner declaration" };
    expect(pinnedShareSnapshotSchema.safeParse(value).success).toBe(false);
    expect(pinnedShareSnapshotSchema.safeParse({ ...value, approvalDigest: "d".repeat(64) }).success).toBe(true);
  });
  it.each([[], [0, 0], [-1], [100000], [1.5], Array.from({length: 101}, (_, i) => i)].map((pageOrdinals) => ({ pageOrdinals })))("rejects missing, ambiguous or out-of-budget page selections", ({ pageOrdinals }) => {
    expect(pinnedShareCreateSchema.safeParse({ ...input(), pageOrdinals }).success).toBe(false);
  });
  it("binds the saved page order, lifetime, image format and decoded-size budget", () => {
    const value = snapshot();
    for (const candidate of [{ ...value, expiresAt: "2026-09-24T00:00:00.000Z" },
      { ...value, pages: [{ ...value.pages[0], ordinal: 1 }] }, { ...value, pages: [{ ...value.pages[0], mediaType: "image/svg+xml" }] },
      { ...value, pages: [{ ...value.pages[0], width: 16384, height: 16384 }] }]) expect(pinnedShareSnapshotSchema.safeParse(candidate).success).toBe(false);
  });
  it("never interprets an internal approval or other page mutation as external feedback", () => {
    const comment = { id, pageOrdinal: 0, reviewerName: "External display name", body: "Feedback only" };
    expect(pinnedShareFeedbackInputSchema.parse(comment)).toEqual(comment);
    expect(pinnedShareFeedbackInputSchema.safeParse({ ...comment, kind: "approve" }).success).toBe(false);
    expect(pinnedShareFeedbackInputSchema.safeParse({ ...comment, actorUserId: "owner" }).success).toBe(false);
  });
  it("rejects arbitrary URLs, mixed public/private grants and short bearer keys", () => {
    expect(pinnedShareAccessSchema.safeParse({ token: "a".repeat(43) }).success).toBe(true);
    expect(pinnedShareAccessSchema.safeParse({ publicId: id }).success).toBe(true);
    for (const value of [{ token: "a".repeat(42) }, { token: "https://arbitrary.invalid" }, { token: "a".repeat(43), publicId: id }, { url: "https://arbitrary.invalid" }])
      expect(pinnedShareAccessSchema.safeParse(value).success).toBe(false);
  });
  it("does not serialize source manuscript or private storage fields in guest responses", () => {
    const state = snapshot(), value = { id, title: "Shared", instructions: "", purpose: "external-review", role: "viewer", watermark: true,
      rightsStatement: "", revisionFingerprint: "a".repeat(64), expiresAt: state.expiresAt, leaseExpiresAt: state.createdAt, pages: state.pages, feedback: [] };
    expect(pinnedShareViewSchema.safeParse(value).success).toBe(true);
    for (const field of ["workId", "subject", "createdBy", "storageUrl", "token", "document"]) expect(pinnedShareViewSchema.safeParse({ ...value, [field]: "private" }).success).toBe(false);
  });
});
