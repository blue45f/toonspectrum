import { describe, expect, it } from "vitest";

import {
  MarketAuthoringDraftCreateSchema,
  MarketAuthoringDraftUpdateSchema,
  MarketHandoffCompleteSchema,
  MarketHandoffCreateSchema,
  MarketHandoffRedeemSchema,
  MarketMediaUpsertSchema,
  MarketPackageProfileUpdateSchema,
  MarketViewerContextRequestSchema,
} from "./market-platform-v2-contract";

const packageId = "123e4567-e89b-42d3-a456-426614174001";
const releaseId = "123e4567-e89b-42d3-a456-426614174002";
const projectContext = { studioVersion: "2.0.0", renderer: "webgpu" as const };

describe("market request boundaries used by Studio", () => {
  it("normalizes the optional viewer context without inferring an installed or owned package", () => {
    expect(MarketViewerContextRequestSchema.parse({ packageIds: [packageId], projectContext })).toEqual({
      packageIds: [packageId], projectRef: null, documentRef: null, deviceInstallations: [],
      projectContext: { ...projectContext, documentType: "unknown", deviceClass: "desktop", licensePurpose: "commercial" },
    });
    expect(MarketViewerContextRequestSchema.safeParse({ packageIds: [] }).success).toBe(false);
    expect(MarketViewerContextRequestSchema.safeParse({ packageIds: Array(65).fill(packageId) }).success).toBe(false);
    expect(MarketViewerContextRequestSchema.safeParse({ packageIds: [packageId], favorite: true }).success).toBe(false);
    expect(MarketViewerContextRequestSchema.safeParse({ packageIds: [packageId], deviceInstallations: [{ packageId, releaseId: "untrusted", version: "2" }] }).success).toBe(false);
  });

  it.each(["install", "open-catalog", "preview-apply", "update"])("pins the selected release in a %s handoff and keeps local defaults explicit", (mode) => {
    expect(MarketHandoffCreateSchema.parse({ packageId, releaseId, mode, projectContext })).toMatchObject({
      packageId, releaseId, mode, returnPath: "/market", projectRef: null, documentRef: null,
    });
    expect(MarketHandoffCreateSchema.safeParse({ packageId, mode, projectContext }).success).toBe(false);
  });

  it("refuses malformed handoff tokens and oversized transaction reports", () => {
    const token = "a".repeat(32);
    expect(MarketHandoffRedeemSchema.parse({ token })).toEqual({ token });
    expect(MarketHandoffRedeemSchema.safeParse({ token: "short" }).success).toBe(false);
    expect(MarketHandoffRedeemSchema.safeParse({ token, userId: "different-account" }).success).toBe(false);
    const complete = { transactionId: packageId, state: "rolled-back" };
    expect(MarketHandoffCompleteSchema.parse(complete)).toEqual({ ...complete,
      projectRevisionBefore: null, projectRevisionAfter: null, createdLayerIds: [], createdObjectIds: [],
      modifiedPropertyPaths: [], warnings: [], failureCode: null,
    });
    expect(MarketHandoffCompleteSchema.safeParse({ ...complete, state: "redeemed" }).success).toBe(false);
    expect(MarketHandoffCompleteSchema.safeParse({ ...complete, createdObjectIds: Array(1001).fill("object") }).success).toBe(false);
  });

  it("accepts accessible HTTPS media metadata and refuses unsafe URLs or malformed dimensions and hashes", () => {
    const media = { role: "hero", type: "image", url: "https://assets.example.com/cover.png", altText: "  Character preview  ", sortOrder: 0 };
    expect(MarketMediaUpsertSchema.parse({ items: [media] }).items[0]).toEqual({ ...media,
      altText: "Character preview", width: null, height: null, durationMs: null, contentHash: null,
    });
    for (const patch of [{ url: "http://assets.example.com/cover.png" }, { url: "javascript:alert(1)" },
      { altText: " " }, { width: 0 }, { height: 32769 }, { durationMs: -1 }, { contentHash: "a".repeat(63) }, { sortOrder: 1001 }]) {
      expect(MarketMediaUpsertSchema.safeParse({ items: [{ ...media, ...patch }] }).success).toBe(false);
    }
    expect(MarketMediaUpsertSchema.safeParse({ items: Array(65).fill(media) }).success).toBe(false);
  });

  it("validates authoring revisions, taxonomy limits, and descriptions before writing a draft", () => {
    expect(MarketAuthoringDraftCreateSchema.parse({ runtimeKind: "3d-asset", authoringTemplate: "3d" })).toEqual({
      runtimeKind: "3d-asset", authoringTemplate: "3d", packageId: null, baseReleaseId: null, payload: {},
    });
    expect(MarketAuthoringDraftUpdateSchema.parse({ revision: 2, payload: { title: "Character" } })).toEqual({ revision: 2, payload: { title: "Character" } });
    expect(MarketAuthoringDraftUpdateSchema.safeParse({ revision: 0, payload: {} }).success).toBe(false);
    expect(MarketAuthoringDraftUpdateSchema.safeParse({ revision: 1, payload: {}, status: "published" }).success).toBe(false);
    const profile = { title: " New character ", summary: " Character asset for a new episode. ", description: " A reusable character asset with multiple poses and materials. ", aiDisclosure: "assistive" };
    const parsed = MarketPackageProfileUpdateSchema.parse(profile);
    expect(parsed.title).toBe("New character");
    expect(parsed.purposes).toEqual([]);
    expect(parsed.technicalFeatures).toEqual([]);
    expect(MarketPackageProfileUpdateSchema.safeParse({ ...profile, purposes: Array(25).fill("inking") }).success).toBe(false);
    expect(MarketPackageProfileUpdateSchema.safeParse({ ...profile, aiDisclosure: "verified" }).success).toBe(false);
    expect(MarketPackageProfileUpdateSchema.safeParse({ ...profile, description: "short" }).success).toBe(false);
  });
});
