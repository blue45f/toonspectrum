import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { creatorAssetStorageObjects } from "./creator-asset-object-storage.schema";
import { creatorMarketplaceResources } from "./creator-marketplace-resource.schema";
import { creatorWorks, users } from "./schema";

import type {
  CreatorAssetArtifactSetDescriptor,
  CreatorAssetDraftState,
  CreatorMarketplaceEntitlementGrant,
} from "../../../web/src/shared/lib/creator-asset-platform-contract";

export const creatorMarketplaceDrafts = pgTable(
  "creator_marketplace_draft",
  {
    id: text("id").primaryKey(),
    publisherId: text("publisherId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    packageId: text("packageId").notNull(),
    baseReleaseId: text("baseReleaseId").references(
      () => creatorMarketplaceResources.id,
      { onDelete: "set null" },
    ),
    kind: text("kind").notNull(),
    state: text("state").$type<CreatorAssetDraftState>().notNull().default("editing"),
    currentRevision: integer("currentRevision").notNull().default(1),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    accessModel: text("accessModel").notNull().default("free"),
    artifactSetId: text("artifactSetId"),
    licenseSnapshotId: text("licenseSnapshotId"),
    publishedReleaseId: text("publishedReleaseId").references(
      () => creatorMarketplaceResources.id,
      { onDelete: "restrict" },
    ),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    submittedAt: timestamp("submittedAt", { mode: "date", withTimezone: true }),
  },
  (table) => [
    uniqueIndex("creator_marketplace_draft_active_package_unique")
      .on(table.publisherId, table.packageId)
      .where(sql`${table.state} not in ('published', 'abandoned')`),
    index("idx_creator_marketplace_draft_owner_updated").on(
      table.publisherId,
      table.updatedAt,
      table.id,
    ),
    index("idx_creator_marketplace_draft_review_queue").on(
      table.state,
      table.submittedAt,
      table.id,
    ),
    check(
      "creator_marketplace_draft_id_check",
      sql`length(${table.id}) between 1 and 160 and ${table.id} !~ '[[:cntrl:]]'`,
    ),
    check(
      "creator_marketplace_draft_package_id_check",
      sql`${table.packageId} ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'`,
    ),
    check(
      "creator_marketplace_draft_kind_check",
      sql`${table.kind} in ('asset', 'brush', 'filter', 'palette', 'template', '3d-preset', '3d-asset')`,
    ),
    check(
      "creator_marketplace_draft_state_check",
      sql`${table.state} in (
        'editing', 'uploading', 'processing', 'needs-fix', 'ready-to-submit',
        'in-review', 'changes-requested', 'approved', 'publishing', 'published',
        'rejected', 'abandoned'
      )`,
    ),
    check(
      "creator_marketplace_draft_revision_check",
      sql`${table.currentRevision} between 1 and 2147483647`,
    ),
    check(
      "creator_marketplace_draft_access_check",
      sql`${table.accessModel} in ('free', 'paid', 'subscription')`,
    ),
    check(
      "creator_marketplace_draft_tags_check",
      sql`jsonb_typeof(${table.tags}) = 'array' and jsonb_array_length(${table.tags}) <= 32`,
    ),
    check(
      "creator_marketplace_draft_publication_check",
      sql`(
        ${table.state} = 'published' and ${table.publishedReleaseId} is not null
      ) or (
        ${table.state} <> 'published' and ${table.publishedReleaseId} is null
      )`,
    ),
    check(
      "creator_marketplace_draft_timestamp_check",
      sql`${table.updatedAt} >= ${table.createdAt}
        and (${table.submittedAt} is null or ${table.submittedAt} >= ${table.createdAt})`,
    ),
  ],
);

export const creatorMarketplaceDraftRevisions = pgTable(
  "creator_marketplace_draft_revision",
  {
    draftId: text("draftId")
      .notNull()
      .references(() => creatorMarketplaceDrafts.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    canonicalPayload: jsonb("canonicalPayload")
      .$type<Record<string, unknown>>()
      .notNull(),
    payloadHash: text("payloadHash").notNull(),
    changedBy: text("changedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    changeReason: text("changeReason").notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "creator_marketplace_draft_revision_pkey",
      columns: [table.draftId, table.revision],
    }),
    check(
      "creator_marketplace_draft_revision_number_check",
      sql`${table.revision} between 1 and 2147483647`,
    ),
    check(
      "creator_marketplace_draft_revision_payload_check",
      sql`jsonb_typeof(${table.canonicalPayload}) = 'object'`,
    ),
    check(
      "creator_marketplace_draft_revision_hash_check",
      sql`${table.payloadHash} ~ '^sha256:[a-f0-9]{64}$'`,
    ),
    check(
      "creator_marketplace_draft_revision_reason_check",
      sql`length(${table.changeReason}) between 1 and 120
        and ${table.changeReason} !~ '[[:cntrl:]]'`,
    ),
  ],
);

export const creatorAssetUploadSessions = pgTable(
  "creator_asset_upload_session",
  {
    id: text("id").primaryKey(),
    draftId: text("draftId")
      .notNull()
      .references(() => creatorMarketplaceDrafts.id, { onDelete: "cascade" }),
    entryId: text("entryId").notNull(),
    logicalRole: text("logicalRole").notNull(),
    protocol: text("protocol").notNull().default("tus"),
    state: text("state").notNull().default("reserved"),
    quarantinePath: text("quarantinePath").notNull(),
    expectedByteLength: bigint("expectedByteLength", { mode: "number" }).notNull(),
    actualByteLength: bigint("actualByteLength", { mode: "number" }),
    declaredContentType: text("declaredContentType").notNull(),
    detectedContentType: text("detectedContentType"),
    clientDigest: text("clientDigest"),
    verifiedDigest: text("verifiedDigest"),
    uploadTokenHash: text("uploadTokenHash").notNull(),
    expiresAt: timestamp("expiresAt", { mode: "date", withTimezone: true }).notNull(),
    completedAt: timestamp("completedAt", { mode: "date", withTimezone: true }),
    finalizedAt: timestamp("finalizedAt", { mode: "date", withTimezone: true }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("creator_asset_upload_session_path_unique").on(table.quarantinePath),
    index("idx_creator_asset_upload_session_draft").on(
      table.draftId,
      table.createdAt,
      table.id,
    ),
    index("idx_creator_asset_upload_session_expiry").on(
      table.state,
      table.expiresAt,
    ),
    check(
      "creator_asset_upload_session_protocol_check",
      sql`${table.protocol} in ('tus', 'server-multipart')`,
    ),
    check(
      "creator_asset_upload_session_state_check",
      sql`${table.state} in (
        'reserved', 'uploading', 'uploaded', 'verifying', 'verified',
        'rejected', 'expired', 'aborted', 'promoted'
      )`,
    ),
    check(
      "creator_asset_upload_session_bytes_check",
      sql`${table.expectedByteLength} between 1 and 5368709120
        and (${table.actualByteLength} is null or ${table.actualByteLength} between 1 and 5368709120)`,
    ),
    check(
      "creator_asset_upload_session_digest_check",
      sql`(${table.clientDigest} is null or ${table.clientDigest} ~ '^sha256:[a-f0-9]{64}$')
        and (${table.verifiedDigest} is null or ${table.verifiedDigest} ~ '^sha256:[a-f0-9]{64}$')
        and ${table.uploadTokenHash} ~ '^sha256:[a-f0-9]{64}$'`,
    ),
    check(
      "creator_asset_upload_session_verified_check",
      sql`${table.state} not in ('verified', 'promoted') or (
        ${table.verifiedDigest} is not null
        and ${table.actualByteLength} is not null
        and ${table.detectedContentType} is not null
        and ${table.finalizedAt} is not null
      )`,
    ),
    check(
      "creator_asset_upload_session_timestamp_check",
      sql`${table.updatedAt} >= ${table.createdAt}
        and ${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

export const creatorAssetProcessingRuns = pgTable(
  "creator_asset_processing_run",
  {
    id: text("id").primaryKey(),
    draftId: text("draftId")
      .notNull()
      .references(() => creatorMarketplaceDrafts.id, { onDelete: "cascade" }),
    entryId: text("entryId").notNull(),
    sourceDigest: text("sourceDigest").notNull(),
    pipelineProfile: text("pipelineProfile").notNull(),
    pipelineVersion: integer("pipelineVersion").notNull(),
    toolchainDigest: text("toolchainDigest").notNull(),
    idempotencyKey: text("idempotencyKey").notNull(),
    state: text("state").notNull().default("queued"),
    currentStep: text("currentStep"),
    requestedBy: text("requestedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    failureCode: text("failureCode"),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("startedAt", { mode: "date", withTimezone: true }),
    finishedAt: timestamp("finishedAt", { mode: "date", withTimezone: true }),
  },
  (table) => [
    unique("creator_asset_processing_run_idempotency_unique").on(table.idempotencyKey),
    index("idx_creator_asset_processing_run_queue").on(
      table.state,
      table.createdAt,
      table.id,
    ),
    index("idx_creator_asset_processing_run_draft").on(
      table.draftId,
      table.createdAt,
      table.id,
    ),
    check(
      "creator_asset_processing_run_digest_check",
      sql`${table.sourceDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.toolchainDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.idempotencyKey} ~ '^sha256:[a-f0-9]{64}$'`,
    ),
    check(
      "creator_asset_processing_run_state_check",
      sql`${table.state} in ('queued', 'running', 'succeeded', 'failed', 'cancelled')`,
    ),
    check(
      "creator_asset_processing_run_version_check",
      sql`${table.pipelineVersion} between 1 and 2147483647`,
    ),
    check(
      "creator_asset_processing_run_terminal_check",
      sql`${table.state} not in ('succeeded', 'failed', 'cancelled') or ${table.finishedAt} is not null`,
    ),
  ],
);

export const creatorAssetArtifactSets = pgTable(
  "creator_asset_artifact_set",
  {
    id: text("id").primaryKey(),
    processingRunId: text("processingRunId")
      .notNull()
      .references(() => creatorAssetProcessingRuns.id, { onDelete: "restrict" }),
    entryKind: text("entryKind").notNull(),
    sourceDigest: text("sourceDigest").notNull(),
    profileSchemaVersion: integer("profileSchemaVersion").notNull(),
    descriptor: jsonb("descriptor").$type<CreatorAssetArtifactSetDescriptor>().notNull(),
    descriptorHash: text("descriptorHash").notNull(),
    state: text("state").notNull().default("building"),
    toolchainDigest: text("toolchainDigest").notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    sealedAt: timestamp("sealedAt", { mode: "date", withTimezone: true }),
  },
  (table) => [
    unique("creator_asset_artifact_set_run_unique").on(table.processingRunId),
    uniqueIndex("creator_asset_artifact_set_descriptor_hash_unique").on(
      table.descriptorHash,
    ),
    index("idx_creator_asset_artifact_set_source").on(
      table.sourceDigest,
      table.state,
    ),
    check(
      "creator_asset_artifact_set_kind_check",
      sql`${table.entryKind} in ('raster-asset', 'vector-asset', '3d-asset', '3d-scene', 'material', 'hdri')`,
    ),
    check(
      "creator_asset_artifact_set_digest_check",
      sql`${table.sourceDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.descriptorHash} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.toolchainDigest} ~ '^sha256:[a-f0-9]{64}$'`,
    ),
    check(
      "creator_asset_artifact_set_state_check",
      sql`${table.state} in ('building', 'sealed', 'rejected')`,
    ),
    check(
      "creator_asset_artifact_set_descriptor_check",
      sql`jsonb_typeof(${table.descriptor}) = 'object'
        and ${table.descriptor}->>'schema' = 'toonspectrum.creator-asset-artifact-set'
        and ${table.descriptor}->>'version' = '1'
        and ${table.descriptor}->>'id' = ${table.id}`,
    ),
    check(
      "creator_asset_artifact_set_sealed_check",
      sql`(${table.state} = 'sealed' and ${table.sealedAt} is not null)
        or (${table.state} <> 'sealed' and ${table.sealedAt} is null)`,
    ),
  ],
);

export const creatorAssetArtifacts = pgTable(
  "creator_asset_artifact",
  {
    artifactSetId: text("artifactSetId")
      .notNull()
      .references(() => creatorAssetArtifactSets.id, { onDelete: "restrict" }),
    artifactId: text("artifactId").notNull(),
    role: text("role").notNull(),
    purpose: text("purpose").notNull(),
    objectDigest: text("objectDigest").notNull(),
    contentType: text("contentType").notNull(),
    byteLength: bigint("byteLength", { mode: "number" }).notNull(),
    qualityProfile: text("qualityProfile").notNull(),
    deviceProfile: text("deviceProfile").notNull(),
    width: integer("width"),
    height: integer("height"),
    metrics: jsonb("metrics").$type<Record<string, number>>(),
    required: boolean("required").notNull().default(false),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "creator_asset_artifact_pkey",
      columns: [table.artifactSetId, table.artifactId],
    }),
    foreignKey({
      name: "creator_asset_artifact_storage_object_fkey",
      columns: [table.purpose, table.objectDigest],
      foreignColumns: [
        creatorAssetStorageObjects.purpose,
        creatorAssetStorageObjects.digest,
      ],
    }).onDelete("restrict"),
    index("idx_creator_asset_artifact_object").on(
      table.purpose,
      table.objectDigest,
    ),
    index("idx_creator_asset_artifact_role").on(
      table.artifactSetId,
      table.role,
      table.qualityProfile,
    ),
    check(
      "creator_asset_artifact_id_check",
      sql`length(${table.artifactId}) between 1 and 160
        and ${table.artifactId} !~ '[[:cntrl:]]'`,
    ),
    check(
      "creator_asset_artifact_role_check",
      sql`${table.role} in (
        'source-original', 'source-dependency-archive', 'master', 'runtime-proxy',
        'runtime-default', 'runtime-high', 'runtime-mobile', 'runtime-fallback',
        'collision-proxy', 'thumbnail', 'preview-turntable', 'preview-color',
        'preview-line', 'preview-tone', 'preview-shadow', 'preview-size-reference',
        'layer-manifest', 'runtime-tile-manifest', 'runtime-tile', 'qa-report',
        'toolchain-report'
      )`,
    ),
    check(
      "creator_asset_artifact_purpose_check",
      sql`${table.purpose} in ('source', 'derived', 'export')`,
    ),
    check(
      "creator_asset_artifact_quality_check",
      sql`${table.qualityProfile} in ('source', 'proxy', 'default', 'high', 'mobile', 'preview')`,
    ),
    check(
      "creator_asset_artifact_device_check",
      sql`${table.deviceProfile} in ('universal', 'desktop', 'tablet', 'mobile')`,
    ),
    check(
      "creator_asset_artifact_bytes_check",
      sql`${table.byteLength} between 1 and 5368709120`,
    ),
    check(
      "creator_asset_artifact_dimensions_check",
      sql`(${table.width} is null and ${table.height} is null)
        or (${table.width} is not null and ${table.height} is not null
          and ${table.width} between 1 and 65536 and ${table.height} between 1 and 65536)`,
    ),
    check(
      "creator_asset_artifact_metrics_check",
      sql`${table.metrics} is null or jsonb_typeof(${table.metrics}) = 'object'`,
    ),
    check(
      "creator_asset_artifact_source_role_check",
      sql`${table.role} <> 'source-original' or ${table.purpose} = 'source'`,
    ),
  ],
);

export const creatorAssetLicenseSnapshots = pgTable(
  "creator_asset_license_snapshot",
  {
    id: text("id").primaryKey(),
    licenseCode: text("licenseCode").notNull(),
    policyVersion: integer("policyVersion").notNull(),
    capabilities: jsonb("capabilities")
      .$type<Record<string, boolean>>()
      .notNull(),
    legalTextDigest: text("legalTextDigest").notNull(),
    sourceReference: text("sourceReference"),
    capturedAt: timestamp("capturedAt", { mode: "date", withTimezone: true }).notNull(),
    reviewState: text("reviewState").notNull().default("pending"),
    reviewedBy: text("reviewedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("creator_asset_license_snapshot_identity_unique").on(
      table.licenseCode,
      table.policyVersion,
      table.legalTextDigest,
    ),
    index("idx_creator_asset_license_snapshot_review").on(
      table.reviewState,
      table.createdAt,
    ),
    check(
      "creator_asset_license_snapshot_code_check",
      sql`length(${table.licenseCode}) between 1 and 80
        and ${table.licenseCode} !~ '[[:cntrl:]]'`,
    ),
    check(
      "creator_asset_license_snapshot_version_check",
      sql`${table.policyVersion} between 1 and 2147483647`,
    ),
    check(
      "creator_asset_license_snapshot_digest_check",
      sql`${table.legalTextDigest} ~ '^sha256:[a-f0-9]{64}$'`,
    ),
    check(
      "creator_asset_license_snapshot_capabilities_check",
      sql`jsonb_typeof(${table.capabilities}) = 'object'`,
    ),
    check(
      "creator_asset_license_snapshot_review_check",
      sql`${table.reviewState} in ('pending', 'approved', 'rejected')
        and (${table.reviewState} <> 'approved' or ${table.reviewedBy} is not null)`,
    ),
  ],
);

export const creatorMarketplaceReleaseArtifactBindings = pgTable(
  "creator_marketplace_release_artifact_binding",
  {
    releaseId: text("releaseId")
      .notNull()
      .references(() => creatorMarketplaceResources.id, { onDelete: "restrict" }),
    entryId: text("entryId").notNull(),
    artifactSetId: text("artifactSetId")
      .notNull()
      .references(() => creatorAssetArtifactSets.id, { onDelete: "restrict" }),
    licenseSnapshotId: text("licenseSnapshotId")
      .notNull()
      .references(() => creatorAssetLicenseSnapshots.id, { onDelete: "restrict" }),
    publicPreviewArtifactId: text("publicPreviewArtifactId").notNull(),
    bindingHash: text("bindingHash").notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "creator_marketplace_release_artifact_binding_pkey",
      columns: [table.releaseId, table.entryId],
    }),
    unique("creator_marketplace_release_artifact_binding_entry_unique").on(
      table.releaseId, table.entryId, table.artifactSetId, table.licenseSnapshotId,
    ),
    uniqueIndex("creator_marketplace_release_artifact_binding_hash_unique").on(
      table.bindingHash,
    ),
    foreignKey({
      name: "creator_marketplace_release_preview_artifact_fkey",
      columns: [table.artifactSetId, table.publicPreviewArtifactId],
      foreignColumns: [
        creatorAssetArtifacts.artifactSetId,
        creatorAssetArtifacts.artifactId,
      ],
    }).onDelete("restrict"),
    check(
      "creator_marketplace_release_artifact_binding_hash_check",
      sql`${table.bindingHash} ~ '^sha256:[a-f0-9]{64}$'`,
    ),
    check(
      "creator_marketplace_release_artifact_binding_entry_check",
      sql`length(${table.entryId}) between 1 and 160 and ${table.entryId} !~ '[[:cntrl:]]'`,
    ),
  ],
);

export const creatorMarketplaceReleaseAvailability = pgTable(
  "creator_marketplace_release_availability",
  {
    releaseId: text("releaseId")
      .primaryKey()
      .references(() => creatorMarketplaceResources.id, { onDelete: "cascade" }),
    state: text("state").notNull().default("active"),
    reasonCode: text("reasonCode"),
    revision: integer("revision").notNull().default(1),
    updatedBy: text("updatedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_creator_marketplace_release_availability_state").on(
      table.state,
      table.updatedAt,
    ),
    check(
      "creator_marketplace_release_availability_state_check",
      sql`${table.state} in (
        'active', 'owner-delisted', 'moderation-hold', 'rights-suspended',
        'security-blocked', 'revoked'
      )`,
    ),
    check(
      "creator_marketplace_release_availability_revision_check",
      sql`${table.revision} between 1 and 2147483647`,
    ),
    check(
      "creator_marketplace_release_availability_reason_check",
      sql`(${table.state} = 'active' and ${table.reasonCode} is null)
        or (${table.state} <> 'active' and length(${table.reasonCode}) between 1 and 120)`,
    ),
  ],
);

export const creatorMarketplaceEntitlementGrants = pgTable(
  "creator_marketplace_entitlement_grant",
  {
    id: text("id").primaryKey(),
    subjectType: text("subjectType").notNull(),
    subjectId: text("subjectId").notNull(),
    publisherId: text("publisherId")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    packageId: text("packageId").notNull(),
    releasePolicy: text("releasePolicy").notNull(),
    releaseId: text("releaseId").references(() => creatorMarketplaceResources.id, {
      onDelete: "restrict",
    }),
    minimumOrdinal: integer("minimumOrdinal"),
    maximumOrdinal: integer("maximumOrdinal"),
    grantType: text("grantType")
      .$type<CreatorMarketplaceEntitlementGrant["grantType"]>()
      .notNull(),
    scope: text("scope").$type<CreatorMarketplaceEntitlementGrant["scope"]>().notNull(),
    seatCount: integer("seatCount").notNull().default(1),
    validFrom: timestamp("validFrom", { mode: "date", withTimezone: true }).notNull(),
    validUntil: timestamp("validUntil", { mode: "date", withTimezone: true }),
    existingWorkSurvives: boolean("existingWorkSurvives").notNull().default(false),
    sourceEventId: text("sourceEventId").notNull(),
    revokedAt: timestamp("revokedAt", { mode: "date", withTimezone: true }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("creator_marketplace_entitlement_source_event_unique").on(
      table.sourceEventId,
    ),
    index("idx_creator_marketplace_entitlement_subject").on(
      table.subjectType,
      table.subjectId,
      table.packageId,
      table.validUntil,
    ),
    check(
      "creator_marketplace_entitlement_subject_check",
      sql`${table.subjectType} in ('user', 'organization')
        and length(${table.subjectId}) between 1 and 160
        and ${table.subjectId} !~ '[[:cntrl:]]'`,
    ),
    check(
      "creator_marketplace_entitlement_package_check",
      sql`${table.packageId} ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'`,
    ),
    check(
      "creator_marketplace_entitlement_policy_check",
      sql`${table.releasePolicy} in ('exact', 'range', 'package-head')
        and (
          (${table.releasePolicy} = 'exact' and ${table.releaseId} is not null
            and ${table.minimumOrdinal} is null and ${table.maximumOrdinal} is null)
          or (${table.releasePolicy} = 'range' and ${table.releaseId} is null
            and ${table.minimumOrdinal} is not null and ${table.maximumOrdinal} is not null
            and ${table.minimumOrdinal} between 1 and 2147483647
            and ${table.maximumOrdinal} between ${table.minimumOrdinal} and 2147483647)
          or (${table.releasePolicy} = 'package-head' and ${table.releaseId} is null
            and ${table.minimumOrdinal} is null and ${table.maximumOrdinal} is null)
        )`,
    ),
    check(
      "creator_marketplace_entitlement_grant_type_check",
      sql`${table.grantType} in ('free', 'purchase', 'subscription', 'creator', 'administrator')`,
    ),
    check(
      "creator_marketplace_entitlement_scope_check",
      sql`${table.scope} in ('personal', 'team', 'enterprise')`,
    ),
    check(
      "creator_marketplace_entitlement_seat_check",
      sql`${table.seatCount} between 1 and 100000`,
    ),
    check(
      "creator_marketplace_entitlement_time_check",
      sql`${table.validUntil} is null or ${table.validUntil} >= ${table.validFrom}`,
    ),
  ],
);

export const creatorWorkCatalogAssetBindings = pgTable(
  "creator_work_catalog_asset_binding",
  {
    workId: text("workId")
      .notNull()
      .references(() => creatorWorks.id, { onDelete: "cascade" }),
    attachmentId: text("attachmentId").notNull(),
    assetType: text("assetType").notNull(),
    releaseId: text("releaseId")
      .notNull()
      .references(() => creatorMarketplaceResources.id, { onDelete: "restrict" }),
    entryId: text("entryId").notNull(),
    artifactSetId: text("artifactSetId")
      .notNull()
      .references(() => creatorAssetArtifactSets.id, { onDelete: "restrict" }),
    selectedArtifactId: text("selectedArtifactId").notNull(),
    expectedContentDigest: text("expectedContentDigest").notNull(),
    licenseSnapshotId: text("licenseSnapshotId")
      .notNull()
      .references(() => creatorAssetLicenseSnapshots.id, { onDelete: "restrict" }),
    entitlementGrantId: text("entitlementGrantId").references(
      () => creatorMarketplaceEntitlementGrants.id,
      { onDelete: "set null" },
    ),
    useReceiptId: text("useReceiptId").notNull(),
    qualityProfile: text("qualityProfile").notNull(),
    state: text("state").notNull().default("active"),
    insertedBy: text("insertedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    insertedAt: timestamp("insertedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    lastResolvedAt: timestamp("lastResolvedAt", {
      mode: "date",
      withTimezone: true,
    }),
  },
  (table) => [
    primaryKey({
      name: "creator_work_catalog_asset_binding_pkey",
      columns: [table.workId, table.attachmentId],
    }),
    unique("creator_work_catalog_asset_binding_receipt_unique").on(
      table.useReceiptId,
    ),
    foreignKey({
      name: "creator_work_catalog_asset_binding_artifact_fkey",
      columns: [table.artifactSetId, table.selectedArtifactId],
      foreignColumns: [
        creatorAssetArtifacts.artifactSetId,
        creatorAssetArtifacts.artifactId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "creator_work_catalog_asset_binding_release_entry_fkey",
      columns: [table.releaseId, table.entryId, table.artifactSetId, table.licenseSnapshotId],
      foreignColumns: [
        creatorMarketplaceReleaseArtifactBindings.releaseId,
        creatorMarketplaceReleaseArtifactBindings.entryId,
        creatorMarketplaceReleaseArtifactBindings.artifactSetId,
        creatorMarketplaceReleaseArtifactBindings.licenseSnapshotId,
      ],
    }).onDelete("restrict"),
    index("idx_creator_work_catalog_asset_binding_release").on(
      table.releaseId,
      table.workId,
    ),
    check(
      "creator_work_catalog_asset_binding_attachment_check",
      sql`length(${table.attachmentId}) between 1 and 160
        and ${table.attachmentId} !~ '[[:cntrl:]]'`,
    ),
    check(
      "creator_work_catalog_asset_binding_asset_type_check",
      sql`${table.assetType} in ('raster', 'vector', 'background3d', 'scene3d')`,
    ),
    check(
      "creator_work_catalog_asset_binding_digest_check",
      sql`${table.expectedContentDigest} ~ '^sha256:[a-f0-9]{64}$'`,
    ),
    check(
      "creator_work_catalog_asset_binding_quality_check",
      sql`${table.qualityProfile} in ('source', 'proxy', 'default', 'high', 'mobile', 'preview')`,
    ),
    check(
      "creator_work_catalog_asset_binding_state_check",
      sql`${table.state} in ('active', 'missing', 'revoked-warning', 'blocked')`,
    ),
  ],
);
