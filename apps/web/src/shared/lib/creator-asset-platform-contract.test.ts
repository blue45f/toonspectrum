import { describe, expect, it } from "vitest";

import {
  CREATOR_ASSET_ARTIFACT_SET_SCHEMA,
  CREATOR_ASSET_PLATFORM_SCHEMA,
  CREATOR_ASSET_PLATFORM_VERSION,
  CREATOR_WORK_CATALOG_BINDING_SCHEMA,
  CreatorAssetArtifactSetDescriptorSchema,
  CreatorAssetDraftSchema,
  CreatorWorkCatalogAssetBindingSchema,
  assertCreatorAssetDraftTransition,
  canTransitionCreatorAssetDraft,
  canonicalizeCreatorAssetArtifactSet,
  hashCreatorAssetArtifactSet,
  resolveCreatorMarketplaceEntitlement,
} from "./creator-asset-platform-contract";

const SOURCE_DIGEST = `sha256:${"a".repeat(64)}` as const;
const TOOLCHAIN_DIGEST = `sha256:${"b".repeat(64)}` as const;
const THUMBNAIL_DIGEST = `sha256:${"c".repeat(64)}` as const;
const RUNTIME_DIGEST = `sha256:${"d".repeat(64)}` as const;
const NOW = "2026-09-07T06:00:00.000Z";

function artifactSet() {
  return {
    schema: CREATOR_ASSET_ARTIFACT_SET_SCHEMA,
    version: CREATOR_ASSET_PLATFORM_VERSION,
    id: "artifact-set/classroom-v1",
    entryKind: "3d-scene",
    sourceDigest: SOURCE_DIGEST,
    profileId: "webtoon-room-scene",
    profileVersion: 1,
    toolchainDigest: TOOLCHAIN_DIGEST,
    artifacts: [
      {
        id: "source",
        role: "source-original",
        purpose: "source",
        digest: SOURCE_DIGEST,
        contentType: "application/zip",
        byteLength: 1024,
        required: true,
        qualityProfile: "source",
        deviceProfile: "universal",
        width: null,
        height: null,
      },
      {
        id: "runtime-default",
        role: "runtime-default",
        purpose: "derived",
        digest: RUNTIME_DIGEST,
        contentType: "model/gltf-binary",
        byteLength: 4096,
        required: true,
        qualityProfile: "default",
        deviceProfile: "desktop",
        width: null,
        height: null,
        metrics: {
          triangles: 12000,
          nodes: 42,
          drawCalls: 18,
          materials: 8,
          textures: 12,
          decodedBytes: 8000000,
        },
      },
      {
        id: "thumbnail",
        role: "thumbnail",
        purpose: "derived",
        digest: THUMBNAIL_DIGEST,
        contentType: "image/webp",
        byteLength: 8192,
        required: true,
        qualityProfile: "preview",
        deviceProfile: "universal",
        width: 512,
        height: 512,
      },
    ],
  } as const;
}

function entitlementInput(overrides: Record<string, unknown> = {}) {
  return {
    actorId: "user/reader",
    organizationId: null,
    publisherId: "user/creator",
    packageId: "community/3d-asset/classroom",
    releaseId: "release/classroom/1.0.0",
    releaseOrdinal: 1,
    accessModel: "paid",
    availability: "active",
    purpose: "insert",
    attributionRequired: false,
    requestedSeats: 1,
    existingWorkReference: false,
    now: NOW,
    grants: [],
    ...overrides,
  };
}

function grant(overrides: Record<string, unknown> = {}) {
  return {
    id: "grant/classroom",
    subjectType: "user",
    subjectId: "user/reader",
    publisherId: "user/creator",
    packageId: "community/3d-asset/classroom",
    releasePolicy: "exact",
    releaseId: "release/classroom/1.0.0",
    minimumOrdinal: null,
    maximumOrdinal: null,
    grantType: "purchase",
    scope: "personal",
    seatCount: 1,
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: null,
    existingWorkSurvives: true,
    revokedAt: null,
    ...overrides,
  };
}

describe("creator asset draft lifecycle", () => {
  it("allows only explicit forward or recovery transitions", () => {
    expect(canTransitionCreatorAssetDraft("editing", "uploading")).toBe(true);
    expect(canTransitionCreatorAssetDraft("processing", "ready-to-submit")).toBe(true);
    expect(canTransitionCreatorAssetDraft("published", "editing")).toBe(false);
    expect(() =>
      assertCreatorAssetDraftTransition("in-review", "published"),
    ).toThrow(/invalid creator asset draft transition/u);
  });

  it("requires a release id only after publication", () => {
    const base = {
      schema: CREATOR_ASSET_PLATFORM_SCHEMA,
      version: CREATOR_ASSET_PLATFORM_VERSION,
      id: "draft/classroom",
      publisherId: "user/creator",
      packageId: "community/3d-asset/classroom",
      kind: "3d-asset",
      state: "published",
      revision: 7,
      artifactSetId: "artifact-set/classroom-v1",
      licenseSnapshotId: "license/classroom-v1",
      publishedReleaseId: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    expect(CreatorAssetDraftSchema.safeParse(base).success).toBe(false);
    expect(
      CreatorAssetDraftSchema.parse({
        ...base,
        publishedReleaseId: "release/classroom/1.0.0",
      }).publishedReleaseId,
    ).toBe("release/classroom/1.0.0");
  });
});

describe("sealed artifact-set contract", () => {
  it("accepts one source, one runtime derivative and a thumbnail", () => {
    expect(CreatorAssetArtifactSetDescriptorSchema.parse(artifactSet()).id).toBe(
      "artifact-set/classroom-v1",
    );
  });

  it("rejects duplicate artifact ids and source lineage drift", () => {
    const candidate = artifactSet();
    expect(
      CreatorAssetArtifactSetDescriptorSchema.safeParse({
        ...candidate,
        sourceDigest: `sha256:${"e".repeat(64)}`,
        artifacts: [
          candidate.artifacts[0],
          { ...candidate.artifacts[1], id: "source" },
          candidate.artifacts[2],
        ],
      }).success,
    ).toBe(false);
  });

  it("canonicalizes and hashes the validated descriptor deterministically", async () => {
    const canonical = canonicalizeCreatorAssetArtifactSet(artifactSet());
    expect(canonical).toContain(CREATOR_ASSET_ARTIFACT_SET_SCHEMA);
    expect(await hashCreatorAssetArtifactSet(artifactSet())).toMatch(
      /^sha256:[a-f0-9]{64}$/u,
    );
    expect(await hashCreatorAssetArtifactSet(artifactSet())).toBe(
      await hashCreatorAssetArtifactSet(JSON.parse(canonical)),
    );
  });
});

describe("marketplace entitlement resolution", () => {
  it("blocks security and rights holds before evaluating grants", () => {
    expect(
      resolveCreatorMarketplaceEntitlement(
        entitlementInput({ availability: "security-blocked" }),
      ).code,
    ).toBe("security-blocked");
    expect(
      resolveCreatorMarketplaceEntitlement(
        entitlementInput({
          availability: "rights-suspended",
          grants: [grant()],
        }),
      ).code,
    ).toBe("rights-suspended");
  });

  it("allows creators and active exact-release grants", () => {
    expect(
      resolveCreatorMarketplaceEntitlement(
        entitlementInput({ actorId: "user/creator" }),
      ).allowed,
    ).toBe(true);
    expect(
      resolveCreatorMarketplaceEntitlement(
        entitlementInput({ grants: [grant()] }),
      ),
    ).toMatchObject({ code: "allow", allowed: true, grantId: "grant/classroom" });
  });

  it("preserves only existing works after a survivable grant expires", () => {
    expect(
      resolveCreatorMarketplaceEntitlement(
        entitlementInput({
          existingWorkReference: true,
          grants: [grant({ validUntil: "2026-08-01T00:00:00.000Z" })],
        }),
      ).code,
    ).toBe("allow-existing-work-only");
  });

  it("distinguishes team scope, seat limits and missing purchase rights", () => {
    expect(
      resolveCreatorMarketplaceEntitlement(
        entitlementInput({
          organizationId: "organization/studio",
          grants: [grant()],
        }),
      ).code,
    ).toBe("require-team-license");
    expect(
      resolveCreatorMarketplaceEntitlement(
        entitlementInput({
          organizationId: "organization/studio",
          requestedSeats: 3,
          grants: [
            grant({
              subjectType: "organization",
              subjectId: "organization/studio",
              scope: "team",
              seatCount: 2,
            }),
          ],
        }),
      ).code,
    ).toBe("seat-limit-exceeded");
    expect(resolveCreatorMarketplaceEntitlement(entitlementInput()).code).toBe(
      "require-purchase",
    );
  });

  it("allows free releases while retaining attribution requirements", () => {
    expect(
      resolveCreatorMarketplaceEntitlement(
        entitlementInput({
          accessModel: "free",
          attributionRequired: true,
        }),
      ).code,
    ).toBe("allow-with-attribution");
  });
});

describe("work catalog binding", () => {
  it("stores immutable ids and digests but rejects delivery URLs", () => {
    const binding = {
      schema: CREATOR_WORK_CATALOG_BINDING_SCHEMA,
      version: CREATOR_ASSET_PLATFORM_VERSION,
      workId: "work/episode-1",
      attachmentId: "attachment/classroom",
      assetType: "scene3d",
      releaseId: "release/classroom/1.0.0",
      entryId: "scene/classroom",
      artifactSetId: "artifact-set/classroom-v1",
      selectedArtifactId: "runtime-default",
      expectedContentDigest: RUNTIME_DIGEST,
      licenseSnapshotId: "license/classroom-v1",
      entitlementGrantId: "grant/classroom",
      useReceiptId: "receipt/classroom/episode-1",
      qualityProfile: "default",
      insertedAt: NOW,
    };
    expect(CreatorWorkCatalogAssetBindingSchema.parse(binding)).toEqual(binding);
    expect(
      CreatorWorkCatalogAssetBindingSchema.safeParse({
        ...binding,
        signedUrl: "https://storage.example/private.glb?token=secret",
      }).success,
    ).toBe(false);
  });
});
