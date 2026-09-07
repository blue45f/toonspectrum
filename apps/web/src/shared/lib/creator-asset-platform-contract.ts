import { z } from "zod";

import {
  CreatorMarketplaceResourceKindSchema,
  CreatorMarketplaceResourcePackageIdSchema,
  canonicalizeCreatorMarketplaceJson,
  type CreatorMarketplaceJsonValue,
} from "./creator-marketplace-resource-contract";

export const CREATOR_ASSET_PLATFORM_SCHEMA =
  "toonspectrum.creator-asset-platform" as const;
export const CREATOR_ASSET_PLATFORM_VERSION = 1 as const;
export const CREATOR_ASSET_ARTIFACT_SET_SCHEMA =
  "toonspectrum.creator-asset-artifact-set" as const;
export const CREATOR_WORK_CATALOG_BINDING_SCHEMA =
  "toonspectrum.creator-work-catalog-asset-binding" as const;

const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const CONTENT_TYPE_PATTERN =
  /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u;

const SafeIdSchema = z.string().min(1).max(160).regex(SAFE_ID_PATTERN);
const IsoTimestampSchema = z.string().datetime({ offset: true });
export const CreatorAssetDigestSchema = z.string().regex(SHA256_PATTERN);

export const CREATOR_ASSET_DRAFT_STATES = [
  "editing",
  "uploading",
  "processing",
  "needs-fix",
  "ready-to-submit",
  "in-review",
  "changes-requested",
  "approved",
  "publishing",
  "published",
  "rejected",
  "abandoned",
] as const;
export const CreatorAssetDraftStateSchema = z.enum(
  CREATOR_ASSET_DRAFT_STATES,
);
export type CreatorAssetDraftState = z.infer<
  typeof CreatorAssetDraftStateSchema
>;

const DRAFT_TRANSITIONS: Readonly<
  Record<CreatorAssetDraftState, ReadonlySet<CreatorAssetDraftState>>
> = Object.freeze({
  editing: new Set<CreatorAssetDraftState>([
    "uploading",
    "processing",
    "abandoned",
  ]),
  uploading: new Set<CreatorAssetDraftState>([
    "editing",
    "processing",
    "needs-fix",
    "abandoned",
  ]),
  processing: new Set<CreatorAssetDraftState>([
    "needs-fix",
    "ready-to-submit",
    "abandoned",
  ]),
  "needs-fix": new Set<CreatorAssetDraftState>([
    "editing",
    "uploading",
    "processing",
    "abandoned",
  ]),
  "ready-to-submit": new Set<CreatorAssetDraftState>([
    "editing",
    "in-review",
    "abandoned",
  ]),
  "in-review": new Set<CreatorAssetDraftState>([
    "changes-requested",
    "approved",
    "rejected",
  ]),
  "changes-requested": new Set<CreatorAssetDraftState>([
    "editing",
    "processing",
    "in-review",
    "abandoned",
  ]),
  approved: new Set<CreatorAssetDraftState>([
    "publishing",
    "changes-requested",
  ]),
  publishing: new Set<CreatorAssetDraftState>(["published", "approved"]),
  published: new Set<CreatorAssetDraftState>(),
  rejected: new Set<CreatorAssetDraftState>(["editing", "abandoned"]),
  abandoned: new Set<CreatorAssetDraftState>(),
});

export function canTransitionCreatorAssetDraft(
  current: CreatorAssetDraftState,
  next: CreatorAssetDraftState,
): boolean {
  return current === next || DRAFT_TRANSITIONS[current].has(next);
}

export function assertCreatorAssetDraftTransition(
  current: CreatorAssetDraftState,
  next: CreatorAssetDraftState,
): void {
  if (!canTransitionCreatorAssetDraft(current, next)) {
    throw new Error(
      `invalid creator asset draft transition: ${current} -> ${next}`,
    );
  }
}

export const CreatorAssetDraftSchema = z
  .object({
    schema: z.literal(CREATOR_ASSET_PLATFORM_SCHEMA),
    version: z.literal(CREATOR_ASSET_PLATFORM_VERSION),
    id: SafeIdSchema,
    publisherId: SafeIdSchema,
    packageId: CreatorMarketplaceResourcePackageIdSchema,
    kind: CreatorMarketplaceResourceKindSchema,
    state: CreatorAssetDraftStateSchema,
    revision: z.number().int().min(1),
    artifactSetId: SafeIdSchema.nullable(),
    licenseSnapshotId: SafeIdSchema.nullable(),
    publishedReleaseId: SafeIdSchema.nullable(),
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
  })
  .strict()
  .superRefine((draft, context) => {
    if (draft.state === "published" && draft.publishedReleaseId === null) {
      context.addIssue({
        code: "custom",
        path: ["publishedReleaseId"],
        message: "게시 완료 초안은 공개 릴리스 식별자가 필요합니다.",
      });
    }
    if (draft.state !== "published" && draft.publishedReleaseId !== null) {
      context.addIssue({
        code: "custom",
        path: ["publishedReleaseId"],
        message: "게시 전 초안은 공개 릴리스를 참조할 수 없습니다.",
      });
    }
  });
export type CreatorAssetDraft = z.infer<typeof CreatorAssetDraftSchema>;

export const CREATOR_ASSET_ARTIFACT_ROLES = [
  "source-original",
  "source-dependency-archive",
  "master",
  "runtime-proxy",
  "runtime-default",
  "runtime-high",
  "runtime-mobile",
  "runtime-fallback",
  "collision-proxy",
  "thumbnail",
  "preview-turntable",
  "preview-color",
  "preview-line",
  "preview-tone",
  "preview-shadow",
  "preview-size-reference",
  "layer-manifest",
  "runtime-tile-manifest",
  "runtime-tile",
  "qa-report",
  "toolchain-report",
] as const;
export const CreatorAssetArtifactRoleSchema = z.enum(
  CREATOR_ASSET_ARTIFACT_ROLES,
);
export const CreatorAssetStoragePurposeSchema = z.enum([
  "source",
  "derived",
  "export",
]);
export const CreatorAssetEntryKindSchema = z.enum([
  "raster-asset",
  "vector-asset",
  "3d-asset",
  "3d-scene",
  "material",
  "hdri",
]);
export const CreatorAssetQualityProfileSchema = z.enum([
  "source",
  "proxy",
  "default",
  "high",
  "mobile",
  "preview",
]);
export const CreatorAssetDeviceProfileSchema = z.enum([
  "universal",
  "desktop",
  "tablet",
  "mobile",
]);

const CreatorAssetMetricsSchema = z
  .object({
    triangles: z.number().int().min(0).max(20_000_000).optional(),
    nodes: z.number().int().min(0).max(100_000).optional(),
    drawCalls: z.number().int().min(0).max(100_000).optional(),
    materials: z.number().int().min(0).max(10_000).optional(),
    textures: z.number().int().min(0).max(10_000).optional(),
    decodedBytes: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
  })
  .strict();

export const CreatorAssetArtifactDescriptorSchema = z
  .object({
    id: SafeIdSchema,
    role: CreatorAssetArtifactRoleSchema,
    purpose: CreatorAssetStoragePurposeSchema,
    digest: CreatorAssetDigestSchema,
    contentType: z.string().min(3).max(160).regex(CONTENT_TYPE_PATTERN),
    byteLength: z.number().int().min(1).max(5 * 1024 * 1024 * 1024),
    required: z.boolean(),
    qualityProfile: CreatorAssetQualityProfileSchema,
    deviceProfile: CreatorAssetDeviceProfileSchema,
    width: z.number().int().min(1).max(65_536).nullable(),
    height: z.number().int().min(1).max(65_536).nullable(),
    metrics: CreatorAssetMetricsSchema.optional(),
  })
  .strict()
  .superRefine((artifact, context) => {
    if ((artifact.width === null) !== (artifact.height === null)) {
      context.addIssue({
        code: "custom",
        path: ["width"],
        message: "2D 크기는 가로와 세로가 함께 존재하거나 함께 없어야 합니다.",
      });
    }
    if (artifact.role === "source-original" && artifact.purpose !== "source") {
      context.addIssue({
        code: "custom",
        path: ["purpose"],
        message: "원본 artifact는 source 저장 목적을 사용해야 합니다.",
      });
    }
  });
export type CreatorAssetArtifactDescriptor = z.infer<
  typeof CreatorAssetArtifactDescriptorSchema
>;

export const CreatorAssetArtifactSetDescriptorSchema = z
  .object({
    schema: z.literal(CREATOR_ASSET_ARTIFACT_SET_SCHEMA),
    version: z.literal(CREATOR_ASSET_PLATFORM_VERSION),
    id: SafeIdSchema,
    entryKind: CreatorAssetEntryKindSchema,
    sourceDigest: CreatorAssetDigestSchema,
    profileId: SafeIdSchema,
    profileVersion: z.number().int().min(1),
    toolchainDigest: CreatorAssetDigestSchema,
    artifacts: z.array(CreatorAssetArtifactDescriptorSchema).min(2).max(128),
  })
  .strict()
  .superRefine((set, context) => {
    const ids = new Set<string>();
    for (const [index, artifact] of set.artifacts.entries()) {
      if (ids.has(artifact.id)) {
        context.addIssue({
          code: "custom",
          path: ["artifacts", index, "id"],
          message: "Artifact Set 안에서 artifact id는 고유해야 합니다.",
        });
      }
      ids.add(artifact.id);
    }
    const originals = set.artifacts.filter(
      (artifact) => artifact.role === "source-original",
    );
    if (originals.length !== 1 || originals[0]?.digest !== set.sourceDigest) {
      context.addIssue({
        code: "custom",
        path: ["sourceDigest"],
        message: "정확히 하나의 원본 artifact가 sourceDigest와 일치해야 합니다.",
      });
    }
    if (!set.artifacts.some((artifact) => artifact.role === "thumbnail")) {
      context.addIssue({
        code: "custom",
        path: ["artifacts"],
        message: "게시 가능한 Artifact Set에는 대표 썸네일이 필요합니다.",
      });
    }
    const runtimeRoles: ReadonlySet<CreatorAssetArtifactDescriptor["role"]> =
      new Set([
        "runtime-proxy",
        "runtime-default",
        "runtime-high",
        "runtime-mobile",
        "master",
      ]);
    if (!set.artifacts.some((artifact) => runtimeRoles.has(artifact.role))) {
      context.addIssue({
        code: "custom",
        path: ["artifacts"],
        message: "Artifact Set에는 적어도 하나의 실행 가능한 파생본이 필요합니다.",
      });
    }
  });
export type CreatorAssetArtifactSetDescriptor = z.infer<
  typeof CreatorAssetArtifactSetDescriptorSchema
>;

export function canonicalizeCreatorAssetArtifactSet(value: unknown): string {
  const parsed = CreatorAssetArtifactSetDescriptorSchema.parse(value);
  return canonicalizeCreatorMarketplaceJson(
    parsed as unknown as CreatorMarketplaceJsonValue,
  );
}

export async function creatorAssetPlatformSha256(
  value: string | Uint8Array,
): Promise<`sha256:${string}`> {
  const sourceBytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digestInput = new ArrayBuffer(sourceBytes.byteLength);
  new Uint8Array(digestInput).set(sourceBytes);
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    digestInput,
  );
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `sha256:${hex}`;
}

export async function hashCreatorAssetArtifactSet(
  value: unknown,
): Promise<`sha256:${string}`> {
  return creatorAssetPlatformSha256(
    canonicalizeCreatorAssetArtifactSet(value),
  );
}

export const CreatorAssetLicenseCapabilitiesSchema = z
  .object({
    commercialWebtoonUse: z.boolean(),
    commercialPrintUse: z.boolean(),
    videoUse: z.boolean(),
    advertisingUse: z.boolean(),
    derivativesAllowed: z.boolean(),
    renderedOutputAllowed: z.boolean(),
    sourceRedistributionAllowed: z.boolean(),
    teamUseAllowed: z.boolean(),
    organizationUseAllowed: z.boolean(),
    attributionRequired: z.boolean(),
    shareAlikeRequired: z.boolean(),
    aiTrainingAllowed: z.boolean(),
    existingWorkSurvives: z.boolean(),
  })
  .strict();

export const CreatorAssetLicenseSnapshotSchema = z
  .object({
    schema: z.literal(CREATOR_ASSET_PLATFORM_SCHEMA),
    version: z.literal(CREATOR_ASSET_PLATFORM_VERSION),
    id: SafeIdSchema,
    licenseCode: z.string().min(1).max(80),
    policyVersion: z.number().int().min(1),
    capabilities: CreatorAssetLicenseCapabilitiesSchema,
    legalTextDigest: CreatorAssetDigestSchema,
    sourceReference: z.string().url().max(500).nullable(),
    capturedAt: IsoTimestampSchema,
    reviewState: z.enum(["pending", "approved", "rejected"]),
    reviewedBy: SafeIdSchema.nullable(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (snapshot.reviewState === "approved" && snapshot.reviewedBy === null) {
      context.addIssue({
        code: "custom",
        path: ["reviewedBy"],
        message: "승인된 라이선스 스냅샷에는 검토자가 필요합니다.",
      });
    }
  });

export const CreatorMarketplaceReleaseAvailabilitySchema = z.enum([
  "active",
  "owner-delisted",
  "moderation-hold",
  "rights-suspended",
  "security-blocked",
  "revoked",
]);
export const CreatorMarketplaceAccessModelSchema = z.enum([
  "free",
  "paid",
  "subscription",
]);

export const CreatorMarketplaceEntitlementGrantSchema = z
  .object({
    id: SafeIdSchema,
    subjectType: z.enum(["user", "organization"]),
    subjectId: SafeIdSchema,
    publisherId: SafeIdSchema,
    packageId: CreatorMarketplaceResourcePackageIdSchema,
    releasePolicy: z.enum(["exact", "range", "package-head"]),
    releaseId: SafeIdSchema.nullable(),
    minimumOrdinal: z.number().int().min(1).nullable(),
    maximumOrdinal: z.number().int().min(1).nullable(),
    grantType: z.enum([
      "free",
      "purchase",
      "subscription",
      "creator",
      "administrator",
    ]),
    scope: z.enum(["personal", "team", "enterprise"]),
    seatCount: z.number().int().min(1).max(100_000),
    validFrom: IsoTimestampSchema,
    validUntil: IsoTimestampSchema.nullable(),
    existingWorkSurvives: z.boolean(),
    revokedAt: IsoTimestampSchema.nullable(),
  })
  .strict()
  .superRefine((grant, context) => {
    if (grant.releasePolicy === "exact" && grant.releaseId === null) {
      context.addIssue({
        code: "custom",
        path: ["releaseId"],
        message: "exact 권리는 특정 릴리스를 가리켜야 합니다.",
      });
    }
    if (
      grant.releasePolicy === "range" &&
      (grant.minimumOrdinal === null || grant.maximumOrdinal === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["minimumOrdinal"],
        message: "range 권리는 시작·종료 릴리스 순번이 필요합니다.",
      });
    }
    if (
      grant.minimumOrdinal !== null &&
      grant.maximumOrdinal !== null &&
      grant.minimumOrdinal > grant.maximumOrdinal
    ) {
      context.addIssue({
        code: "custom",
        path: ["maximumOrdinal"],
        message: "최대 릴리스 순번은 최소 순번보다 작을 수 없습니다.",
      });
    }
  });
export type CreatorMarketplaceEntitlementGrant = z.infer<
  typeof CreatorMarketplaceEntitlementGrantSchema
>;

export const CreatorMarketplaceEntitlementDecisionSchema = z
  .object({
    code: z.enum([
      "allow",
      "allow-with-attribution",
      "allow-existing-work-only",
      "require-acquisition",
      "require-purchase",
      "require-subscription",
      "require-team-license",
      "seat-limit-exceeded",
      "version-not-included",
      "rights-suspended",
      "security-blocked",
      "deny",
    ]),
    allowed: z.boolean(),
    grantId: SafeIdSchema.nullable(),
    reason: z.string().min(1).max(240),
  })
  .strict();
export type CreatorMarketplaceEntitlementDecision = z.infer<
  typeof CreatorMarketplaceEntitlementDecisionSchema
>;

export const CreatorMarketplaceEntitlementResolveInputSchema = z
  .object({
    actorId: SafeIdSchema,
    organizationId: SafeIdSchema.nullable(),
    publisherId: SafeIdSchema,
    packageId: CreatorMarketplaceResourcePackageIdSchema,
    releaseId: SafeIdSchema,
    releaseOrdinal: z.number().int().min(1),
    accessModel: CreatorMarketplaceAccessModelSchema,
    availability: CreatorMarketplaceReleaseAvailabilitySchema,
    purpose: z.enum(["preview", "insert", "render", "export"]),
    attributionRequired: z.boolean(),
    requestedSeats: z.number().int().min(1).max(100_000),
    existingWorkReference: z.boolean(),
    now: IsoTimestampSchema,
    grants: z.array(CreatorMarketplaceEntitlementGrantSchema).max(1_000),
  })
  .strict();

function grantIncludesRelease(
  grant: CreatorMarketplaceEntitlementGrant,
  releaseId: string,
  releaseOrdinal: number,
): boolean {
  if (grant.releasePolicy === "package-head") return true;
  if (grant.releasePolicy === "exact") return grant.releaseId === releaseId;
  return (
    grant.minimumOrdinal !== null &&
    grant.maximumOrdinal !== null &&
    releaseOrdinal >= grant.minimumOrdinal &&
    releaseOrdinal <= grant.maximumOrdinal
  );
}

function allowDecision(
  attributionRequired: boolean,
  grantId: string | null,
  reason: string,
): CreatorMarketplaceEntitlementDecision {
  return {
    code: attributionRequired ? "allow-with-attribution" : "allow",
    allowed: true,
    grantId,
    reason,
  };
}

export function resolveCreatorMarketplaceEntitlement(
  input: unknown,
): CreatorMarketplaceEntitlementDecision {
  const request = CreatorMarketplaceEntitlementResolveInputSchema.parse(input);
  if (request.availability === "security-blocked") {
    return {
      code: "security-blocked",
      allowed: false,
      grantId: null,
      reason: "보안 차단된 릴리스는 파일을 전달할 수 없습니다.",
    };
  }
  if (
    request.availability === "rights-suspended" ||
    request.availability === "revoked"
  ) {
    return {
      code: "rights-suspended",
      allowed: false,
      grantId: null,
      reason: "권리 검토 중이거나 회수된 릴리스입니다.",
    };
  }
  if (
    request.availability === "moderation-hold" ||
    request.availability === "owner-delisted"
  ) {
    return {
      code: "deny",
      allowed: false,
      grantId: null,
      reason: "현재 배포가 중단된 릴리스입니다.",
    };
  }
  if (request.actorId === request.publisherId) {
    return allowDecision(
      request.attributionRequired,
      null,
      "제작자는 자신의 활성 릴리스를 사용할 수 있습니다.",
    );
  }

  const now = Date.parse(request.now);
  let sawMatchingVersion = false;
  let sawTeamScopeProblem = false;
  let sawSeatProblem = false;
  for (const grant of request.grants) {
    const subjectMatches =
      (grant.subjectType === "user" && grant.subjectId === request.actorId) ||
      (grant.subjectType === "organization" &&
        request.organizationId !== null &&
        grant.subjectId === request.organizationId);
    if (
      !subjectMatches ||
      grant.publisherId !== request.publisherId ||
      grant.packageId !== request.packageId ||
      grant.revokedAt !== null ||
      Date.parse(grant.validFrom) > now
    ) {
      continue;
    }
    if (
      !grantIncludesRelease(grant, request.releaseId, request.releaseOrdinal)
    ) {
      continue;
    }
    sawMatchingVersion = true;
    const expired =
      grant.validUntil !== null && Date.parse(grant.validUntil) < now;
    if (expired) {
      if (request.existingWorkReference && grant.existingWorkSurvives) {
        return {
          code: "allow-existing-work-only",
          allowed: true,
          grantId: grant.id,
          reason: "만료 전 작품의 기존 사용 권리는 유지됩니다.",
        };
      }
      continue;
    }
    if (request.organizationId !== null && grant.scope === "personal") {
      sawTeamScopeProblem = true;
      continue;
    }
    if (request.requestedSeats > grant.seatCount) {
      sawSeatProblem = true;
      continue;
    }
    return allowDecision(
      request.attributionRequired,
      grant.id,
      "유효한 사용 권한을 확인했습니다.",
    );
  }

  if (sawSeatProblem) {
    return {
      code: "seat-limit-exceeded",
      allowed: false,
      grantId: null,
      reason: "요청한 팀 좌석 수가 사용 권한의 한도를 넘었습니다.",
    };
  }
  if (sawTeamScopeProblem) {
    return {
      code: "require-team-license",
      allowed: false,
      grantId: null,
      reason: "조직 프로젝트에는 팀 또는 기업 사용 권한이 필요합니다.",
    };
  }
  if (request.accessModel === "free") {
    return allowDecision(
      request.attributionRequired,
      null,
      "무료 활성 릴리스는 별도 결제 없이 사용할 수 있습니다.",
    );
  }
  if (sawMatchingVersion) {
    return {
      code:
        request.accessModel === "paid"
          ? "require-purchase"
          : "require-subscription",
      allowed: false,
      grantId: null,
      reason: "해당 권리가 만료되었거나 현재 사용 범위와 맞지 않습니다.",
    };
  }
  return {
    code:
      request.accessModel === "paid"
        ? "require-purchase"
        : request.accessModel === "subscription"
          ? "require-subscription"
          : "require-acquisition",
    allowed: false,
    grantId: null,
    reason: "이 릴리스를 사용할 수 있는 권리를 찾지 못했습니다.",
  };
}

export const CreatorWorkCatalogAssetBindingSchema = z
  .object({
    schema: z.literal(CREATOR_WORK_CATALOG_BINDING_SCHEMA),
    version: z.literal(CREATOR_ASSET_PLATFORM_VERSION),
    workId: SafeIdSchema,
    attachmentId: SafeIdSchema,
    assetType: z.enum(["raster", "vector", "background3d", "scene3d"]),
    releaseId: SafeIdSchema,
    entryId: SafeIdSchema,
    artifactSetId: SafeIdSchema,
    selectedArtifactId: SafeIdSchema,
    expectedContentDigest: CreatorAssetDigestSchema,
    licenseSnapshotId: SafeIdSchema,
    entitlementGrantId: SafeIdSchema.nullable(),
    useReceiptId: SafeIdSchema,
    qualityProfile: CreatorAssetQualityProfileSchema,
    insertedAt: IsoTimestampSchema,
  })
  .strict();
export type CreatorWorkCatalogAssetBinding = z.infer<
  typeof CreatorWorkCatalogAssetBindingSchema
>;
