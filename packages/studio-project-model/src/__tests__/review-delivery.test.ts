import { describe, expect, it } from "vitest";

import { DEFAULT_REVIEW_DELIVERY_PROFILE, createReviewDeliveryManifest, reviewDeliveryListSchema,
  reviewDeliverySourceSchema } from "../graph/review-delivery";

const subject = { schemaVersion: 1 as const, workId: "work", projectId: "project", artifactId: "artifact",
  reviewId: "review", revisionId: "revision", rootGraphHash: "a".repeat(64) };
const page = (ordinal: number) => ({ ordinal, sha256: String(ordinal + 1).repeat(64).slice(0, 64), byteLength: 100 + ordinal,
  mediaType: "image/png" as const, width: 800, height: 1000 });
const source = { subject, approvalDigest: "b".repeat(64), decidedAt: "2026-09-23T00:00:00.000Z", pages: [page(0), page(1)] };
const rights = { contract: "studio-review-delivery-rights-v1" as const, statementVersion: 1 as const,
  mode: "free" as const, rightsGraphDigest: "c".repeat(64), confirmed: true as const, statement: "Owner attestation for the exact approved delivery." };
describe("approved review delivery contract", () => {
  it("builds deterministic page paths and exact totals from a server-provided source digest", () => {
    const manifest = createReviewDeliveryManifest({ id: "11111111-1111-4111-8111-111111111111", title: "Delivery",
      preparedAt: "2026-09-23T00:01:00.000Z", source, sourceDigest: "d".repeat(64), profile: DEFAULT_REVIEW_DELIVERY_PROFILE, rights });
    expect(manifest.source).toMatchObject({ reviewId: "review", revisionId: "revision", sourceDigest: "d".repeat(64) });
    expect(manifest.pages.map((item) => item.path)).toEqual(["pages/000001.png", "pages/000002.png"]);
    expect(manifest.totalPageBytes).toBe(201);
    expect(createReviewDeliveryManifest({ id: manifest.jobId, title: manifest.title, preparedAt: manifest.preparedAt,
      source, sourceDigest: "d".repeat(64), profile: DEFAULT_REVIEW_DELIVERY_PROFILE, rights })).toEqual(manifest);
  });
  it("rejects incomplete ordinal sequences and forged totals", () => {
    expect(reviewDeliverySourceSchema.safeParse({ ...source, pages: [page(1)] }).success).toBe(false);
    expect(() => createReviewDeliveryManifest({ id: "11111111-1111-4111-8111-111111111111", title: "Delivery",
      preparedAt: "2026-09-23T00:01:00.000Z", source: { ...source, pages: [page(0), page(2)] }, sourceDigest: "d".repeat(64),
      profile: DEFAULT_REVIEW_DELIVERY_PROFILE, rights })).toThrow();
  });
  it("requires list authority, current mode and bounded jobs", () => {
    expect(reviewDeliveryListSchema.safeParse({ items: [], recipients: [], canPrepare: true, mode: "free" }).success).toBe(true);
    expect(reviewDeliveryListSchema.safeParse({ items: [], recipients: [], canPrepare: true, mode: "unknown" }).success).toBe(false);
  });
});
