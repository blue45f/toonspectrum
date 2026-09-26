import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
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

import type {
  ArtifactKind,
  CapabilityLedgerEntry,
  ProjectAuthorityVersion,
  RevisionKind,
  ReviewAnchor,
  ScopeRef,
} from "@toonspectrum/studio-project-model";
import type {
  CompatibilityItem,
  CompatibilitySummary,
  SourceCreativeFormat,
} from "@toonspectrum/studio-format-gateway";

import { users } from "./auth.schema";
import { creatorWorks } from "./creator.schema";

export const studioProjectGraphs = pgTable(
  "studio_project_graph",
  {
    id: text("id").primaryKey(),
    workId: text("workId")
      .notNull()
      .references(() => creatorWorks.id, { onDelete: "cascade" }),
    schemaVersion: integer("schemaVersion").notNull().default(3),
    authorityVersion: text("authorityVersion")
      .$type<ProjectAuthorityVersion>()
      .notNull()
      .default("legacy-v2"),
    ownerUserId: text("ownerUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("studio_project_graph_work_unique").on(table.workId),
    index("idx_studio_project_graph_owner_updated").on(
      table.ownerUserId,
      table.updatedAt.desc(),
      table.id,
    ),
    check("studio_project_graph_id_check", sql`length(${table.id}) between 1 and 160`),
    check("studio_project_graph_schema_check", sql`${table.schemaVersion} = 3`),
    check(
      "studio_project_graph_authority_check",
      sql`${table.authorityVersion} in ('legacy-v2', 'project-graph-v3')`,
    ),
    check(
      "studio_project_graph_time_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const studioArtifacts = pgTable(
  "studio_artifact",
  {
    id: text("id").primaryKey(),
    projectId: text("projectId")
      .notNull()
      .references(() => studioProjectGraphs.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ArtifactKind>().notNull(),
    title: text("title").notNull(),
    scope: jsonb("scope").$type<ScopeRef>().notNull(),
    // Raw migration owns the deferred FKs because Artifact and Revision form a cycle.
    headRevisionId: text("headRevisionId").notNull(),
    approvedRevisionId: text("approvedRevisionId"),
    ownerWorkspaceId: text("ownerWorkspaceId").notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_studio_artifact_project_kind_updated").on(
      table.projectId,
      table.kind,
      table.updatedAt.desc(),
      table.id,
    ),
    index("idx_studio_artifact_scope_gin").using("gin", table.scope),
    check("studio_artifact_id_check", sql`length(${table.id}) between 1 and 160`),
    check(
      "studio_artifact_kind_check",
      sql`${table.kind} in (
        'story', 'storyboard', 'canvas-2d', 'scene-3d', 'asset', 'audio',
        'localization', 'review-snapshot', 'deliverable', 'release'
      )`,
    ),
    check(
      "studio_artifact_title_check",
      sql`length(btrim(${table.title})) between 1 and 240`,
    ),
    check(
      "studio_artifact_scope_check",
      sql`jsonb_typeof(${table.scope}) = 'object'
        and ${table.scope}->>'projectId' = ${table.projectId}`,
    ),
    check(
      "studio_artifact_time_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const studioRevisions = pgTable(
  "studio_revision",
  {
    id: text("id").primaryKey(),
    artifactId: text("artifactId")
      .notNull()
      .references(() => studioArtifacts.id, { onDelete: "cascade" }),
    kind: text("kind").$type<RevisionKind>().notNull(),
    rootGraphHash: text("rootGraphHash").notNull(),
    operationFirst: bigint("operationFirst", { mode: "number" }),
    operationLast: bigint("operationLast", { mode: "number" }),
    createdBy: text("createdBy").references(() => users.id, { onDelete: "set null" }),
    deviceId: text("deviceId").notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull(),
    message: text("message"),
    compatibilityReportId: text("compatibilityReportId"),
    provenanceManifestId: text("provenanceManifestId"),
  },
  (table) => [
    index("idx_studio_revision_artifact_created").on(
      table.artifactId,
      table.createdAt.desc(),
      table.id,
    ),
    index("idx_studio_revision_kind_created").on(
      table.kind,
      table.createdAt.desc(),
      table.id,
    ),
    check("studio_revision_id_check", sql`length(${table.id}) between 1 and 160`),
    check(
      "studio_revision_kind_check",
      sql`${table.kind} in ('autosave', 'checkpoint', 'submission', 'review-snapshot', 'approved', 'release')`,
    ),
    check(
      "studio_revision_hash_check",
      sql`${table.rootGraphHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "studio_revision_operation_range_check",
      sql`(${table.operationFirst} is null and ${table.operationLast} is null)
        or (${table.operationFirst} > 0 and ${table.operationLast} >= ${table.operationFirst})`,
    ),
    check(
      "studio_revision_device_check",
      sql`length(${table.deviceId}) between 1 and 160`,
    ),
    check(
      "studio_revision_message_check",
      sql`${table.message} is null or length(btrim(${table.message})) between 1 and 500`,
    ),
  ],
);

export const studioRevisionParents = pgTable(
  "studio_revision_parent",
  {
    revisionId: text("revisionId")
      .notNull()
      .references(() => studioRevisions.id, { onDelete: "cascade" }),
    parentRevisionId: text("parentRevisionId")
      .notNull()
      .references(() => studioRevisions.id, { onDelete: "restrict" }),
    ordinal: integer("ordinal").notNull(),
  },
  (table) => [
    primaryKey({
      name: "studio_revision_parent_pkey",
      columns: [table.revisionId, table.parentRevisionId],
    }),
    unique("studio_revision_parent_ordinal_unique").on(
      table.revisionId,
      table.ordinal,
    ),
    index("idx_studio_revision_parent_parent").on(
      table.parentRevisionId,
      table.revisionId,
    ),
    check(
      "studio_revision_parent_self_check",
      sql`${table.revisionId} <> ${table.parentRevisionId}`,
    ),
    check(
      "studio_revision_parent_ordinal_check",
      sql`${table.ordinal} between 0 and 15`,
    ),
  ],
);

export const studioBlobs = pgTable(
  "studio_blob",
  {
    hash: text("hash").primaryKey(),
    size: bigint("size", { mode: "number" }).notNull(),
    mediaType: text("mediaType").notNull(),
    objectKey: text("objectKey").notNull(),
    encryptionMetadata: jsonb("encryptionMetadata").$type<Record<string, unknown> | null>(),
    malwareStatus: text("malwareStatus").notNull().default("pending"),
    formatStatus: text("formatStatus").notNull().default("pending"),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("studio_blob_hash_check", sql`${table.hash} ~ '^[0-9a-f]{64}$'`),
    check("studio_blob_size_check", sql`${table.size} >= 0`),
    check(
      "studio_blob_media_type_check",
      sql`length(btrim(${table.mediaType})) between 1 and 160`,
    ),
    check(
      "studio_blob_object_key_check",
      sql`length(btrim(${table.objectKey})) between 1 and 2048`,
    ),
    check(
      "studio_blob_encryption_check",
      sql`${table.encryptionMetadata} is null or jsonb_typeof(${table.encryptionMetadata}) = 'object'`,
    ),
    check(
      "studio_blob_malware_check",
      sql`${table.malwareStatus} in ('pending', 'clean', 'blocked', 'failed')`,
    ),
    check(
      "studio_blob_format_check",
      sql`${table.formatStatus} in ('pending', 'valid', 'invalid', 'unsupported')`,
    ),
  ],
);

export const studioRevisionBlobs = pgTable(
  "studio_revision_blob",
  {
    revisionId: text("revisionId")
      .notNull()
      .references(() => studioRevisions.id, { onDelete: "cascade" }),
    blobHash: text("blobHash")
      .notNull()
      .references(() => studioBlobs.hash, { onDelete: "restrict" }),
    role: text("role").notNull(),
    ordinal: integer("ordinal").notNull(),
  },
  (table) => [
    primaryKey({
      name: "studio_revision_blob_pkey",
      columns: [table.revisionId, table.blobHash, table.role],
    }),
    unique("studio_revision_blob_ordinal_unique").on(
      table.revisionId,
      table.role,
      table.ordinal,
    ),
    index("idx_studio_revision_blob_hash").on(
      table.blobHash,
      table.revisionId,
    ),
    check(
      "studio_revision_blob_role_check",
      sql`${table.role} in (
        'graph', 'tile', 'vector', 'source', 'thumbnail', 'preview',
        'export', 'license', 'provenance'
      )`,
    ),
    check("studio_revision_blob_ordinal_check", sql`${table.ordinal} >= 0`),
  ],
);

export interface StudioOperationRecord {
  readonly commandId: string;
  readonly type: string;
  readonly idempotencyKeyHash: string;
  readonly deterministicSeed?: number;
  readonly payload: unknown;
  readonly patches: readonly unknown[];
  readonly inversePatches: readonly unknown[];
  readonly invalidations: readonly unknown[];
}

export const studioOperations = pgTable(
  "studio_operation",
  {
    artifactId: text("artifactId")
      .notNull()
      .references(() => studioArtifacts.id, { onDelete: "cascade" }),
    sequence: bigint("sequence", { mode: "number" }).notNull(),
    commandId: text("commandId").notNull(),
    baseRevisionId: text("baseRevisionId")
      .notNull()
      .references(() => studioRevisions.id, { onDelete: "restrict" }),
    resultRevisionId: text("resultRevisionId")
      .notNull()
      .references(() => studioRevisions.id, { onDelete: "restrict" }),
    actorUserId: text("actorUserId").references(() => users.id, { onDelete: "set null" }),
    deviceId: text("deviceId").notNull(),
    commandType: text("commandType").notNull(),
    scope: jsonb("scope").$type<ScopeRef>().notNull(),
    payloadHash: text("payloadHash").notNull(),
    operation: jsonb("operation").$type<StudioOperationRecord>().notNull(),
    issuedAt: timestamp("issuedAt", { mode: "date", withTimezone: true }).notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "studio_operation_pkey",
      columns: [table.artifactId, table.sequence],
    }),
    unique("studio_operation_command_unique").on(
      table.artifactId,
      table.commandId,
    ),
    index("idx_studio_operation_result_revision").on(table.resultRevisionId),
    index("idx_studio_operation_actor_created").on(
      table.actorUserId,
      table.createdAt.desc(),
    ),
    check("studio_operation_sequence_check", sql`${table.sequence} > 0`),
    check(
      "studio_operation_command_check",
      sql`length(${table.commandId}) between 1 and 160`,
    ),
    check(
      "studio_operation_device_check",
      sql`length(${table.deviceId}) between 1 and 160`,
    ),
    check(
      "studio_operation_type_check",
      sql`${table.commandType} ~ '^[a-z0-9][a-z0-9-]*(\\.[a-z0-9][a-z0-9-]*)+$'`,
    ),
    check(
      "studio_operation_scope_check",
      sql`jsonb_typeof(${table.scope}) = 'object'`,
    ),
    check(
      "studio_operation_payload_hash_check",
      sql`${table.payloadHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "studio_operation_json_check",
      sql`jsonb_typeof(${table.operation}) = 'object'`,
    ),
  ],
);

export interface StudioMutationReceiptResponse {
  readonly artifactId: string;
  readonly revisionId: string;
  readonly headRevisionId: string;
  readonly sequence: number;
  readonly replayed: boolean;
}

export const studioMutationReceipts = pgTable(
  "studio_mutation_receipt",
  {
    artifactId: text("artifactId")
      .notNull()
      .references(() => studioArtifacts.id, { onDelete: "cascade" }),
    actorUserId: text("actorUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    idempotencyKeyHash: text("idempotencyKeyHash").notNull(),
    requestHash: text("requestHash").notNull(),
    resultRevisionId: text("resultRevisionId")
      .notNull()
      .references(() => studioRevisions.id, { onDelete: "restrict" }),
    response: jsonb("response").$type<StudioMutationReceiptResponse>().notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "studio_mutation_receipt_pkey",
      columns: [table.artifactId, table.actorUserId, table.idempotencyKeyHash],
    }),
    index("idx_studio_mutation_receipt_created").on(table.createdAt),
    check(
      "studio_mutation_receipt_key_hash_check",
      sql`${table.idempotencyKeyHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "studio_mutation_receipt_request_hash_check",
      sql`${table.requestHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "studio_mutation_receipt_response_check",
      sql`jsonb_typeof(${table.response}) = 'object'`,
    ),
  ],
);

export const studioCompatibilityReports = pgTable(
  "studio_compatibility_report",
  {
    id: text("id").primaryKey(),
    projectId: text("projectId")
      .notNull()
      .references(() => studioProjectGraphs.id, { onDelete: "cascade" }),
    artifactId: text("artifactId").references(() => studioArtifacts.id, {
      onDelete: "set null",
    }),
    sourceFormat: text("sourceFormat").$type<SourceCreativeFormat>().notNull(),
    sourceFileName: text("sourceFileName").notNull(),
    sourceHash: text("sourceHash").notNull(),
    sourceSize: bigint("sourceSize", { mode: "number" }).notNull(),
    grade: text("grade").notNull(),
    summary: jsonb("summary").$type<CompatibilitySummary>().notNull(),
    items: jsonb("items").$type<CompatibilityItem[]>().notNull(),
    requiresApproval: boolean("requiresApproval").notNull(),
    approvedBy: text("approvedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approvedAt", { mode: "date", withTimezone: true }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_studio_compatibility_report_project_created").on(
      table.projectId,
      table.createdAt.desc(),
      table.id,
    ),
    index("idx_studio_compatibility_report_artifact_created").on(
      table.artifactId,
      table.createdAt.desc(),
      table.id,
    ),
    check("studio_compatibility_report_id_check", sql`length(${table.id}) between 1 and 160`),
    check("studio_compatibility_report_hash_check", sql`${table.sourceHash} ~ '^[0-9a-f]{64}$'`),
    check("studio_compatibility_report_size_check", sql`${table.sourceSize} >= 0`),
    check("studio_compatibility_report_grade_check", sql`${table.grade} in ('A', 'B', 'C', 'D')`),
    check("studio_compatibility_report_summary_check", sql`jsonb_typeof(${table.summary}) = 'object'`),
    check("studio_compatibility_report_items_check", sql`jsonb_typeof(${table.items}) = 'array'`),
    check(
      "studio_compatibility_report_approval_check",
      sql`(${table.approvedBy} is null and ${table.approvedAt} is null)
        or (${table.requiresApproval} and ${table.approvedBy} is not null and ${table.approvedAt} is not null)`,
    ),
  ],
);

export const studioExternalFileBindings = pgTable(
  "studio_external_file_binding",
  {
    id: text("id").primaryKey(),
    artifactId: text("artifactId")
      .notNull()
      .references(() => studioArtifacts.id, { onDelete: "cascade" }),
    ownerUserId: text("ownerUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId"),
    remoteFileId: text("remoteFileId").notNull(),
    displayPath: text("displayPath").notNull(),
    syncMode: text("syncMode").notNull(),
    remoteVersion: text("remoteVersion"),
    remoteEtag: text("remoteEtag"),
    contentHash: text("contentHash"),
    lastSyncedRevisionId: text("lastSyncedRevisionId").references(
      () => studioRevisions.id,
      { onDelete: "set null" },
    ),
    lastSyncedAt: timestamp("lastSyncedAt", { mode: "date", withTimezone: true }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("studio_external_file_binding_remote_unique").on(
      table.ownerUserId,
      table.provider,
      sql`coalesce(${table.providerAccountId}, '')`,
      table.remoteFileId,
    ),
    index("idx_studio_external_file_binding_artifact").on(
      table.artifactId,
      table.updatedAt.desc(),
      table.id,
    ),
    check(
      "studio_external_file_binding_provider_check",
      sql`${table.provider} in ('local-file', 'filesystem-handle', 'google-drive', 'dropbox', 'onedrive')`,
    ),
    check(
      "studio_external_file_binding_account_check",
      sql`${table.provider} in ('local-file', 'filesystem-handle') or ${table.providerAccountId} is not null`,
    ),
    check(
      "studio_external_file_binding_mode_check",
      sql`${table.syncMode} in ('import-only', 'export-only', 'bidirectional', 'backup-mirror')`,
    ),
    check(
      "studio_external_file_binding_hash_check",
      sql`${table.contentHash} is null or ${table.contentHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "studio_external_file_binding_sync_point_check",
      sql`(${table.lastSyncedRevisionId} is null and ${table.lastSyncedAt} is null)
        or (${table.lastSyncedRevisionId} is not null and ${table.lastSyncedAt} is not null)`,
    ),
    check("studio_external_file_binding_time_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const studioReviews = pgTable(
  "studio_review",
  {
    id: text("id").primaryKey(),
    artifactId: text("artifactId")
      .notNull()
      .references(() => studioArtifacts.id, { onDelete: "cascade" }),
    revisionId: text("revisionId")
      .notNull()
      .references(() => studioRevisions.id, { onDelete: "restrict" }),
    requestedBy: text("requestedBy").references(() => users.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    status: text("status").notNull().default("open"),
    decidedAt: timestamp("decidedAt", { mode: "date", withTimezone: true }),
    decidedBy: text("decidedBy").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_studio_review_artifact_status_created").on(
      table.artifactId,
      table.status,
      table.createdAt.desc(),
      table.id,
    ),
    index("idx_studio_review_revision").on(table.revisionId, table.id),
    check("studio_review_id_check", sql`length(${table.id}) between 1 and 160`),
    check("studio_review_title_check", sql`length(btrim(${table.title})) between 1 and 240`),
    check(
      "studio_review_status_check",
      sql`${table.status} in ('open', 'changes-requested', 'approved', 'rejected', 'cancelled')`,
    ),
    check(
      "studio_review_decision_check",
      sql`(${table.status} in ('open', 'changes-requested') and ${table.decidedAt} is null and ${table.decidedBy} is null)
        or (${table.status} in ('approved', 'rejected', 'cancelled') and ${table.decidedAt} is not null and ${table.decidedBy} is not null)`,
    ),
    check("studio_review_time_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const studioReviewReviewers = pgTable(
  "studio_review_reviewer",
  {
    reviewId: text("reviewId")
      .notNull()
      .references(() => studioReviews.id, { onDelete: "cascade" }),
    reviewerUserId: text("reviewerUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "studio_review_reviewer_pkey",
      columns: [table.reviewId, table.reviewerUserId],
    }),
    index("idx_studio_review_reviewer_user").on(
      table.reviewerUserId,
      table.createdAt.desc(),
      table.reviewId,
    ),
  ],
);

export const studioReviewComments = pgTable(
  "studio_review_comment",
  {
    id: text("id").primaryKey(),
    reviewId: text("reviewId")
      .notNull()
      .references(() => studioReviews.id, { onDelete: "cascade" }),
    authorUserId: text("authorUserId").references(() => users.id, { onDelete: "set null" }),
    anchor: jsonb("anchor").$type<ReviewAnchor>().notNull(),
    body: text("body").notNull(),
    severity: text("severity").notNull(),
    status: text("status").notNull().default("open"),
    dueAt: timestamp("dueAt", { mode: "date", withTimezone: true }),
    resolutionRevisionId: text("resolutionRevisionId").references(
      () => studioRevisions.id,
      { onDelete: "set null" },
    ),
    resolvedBy: text("resolvedBy").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_studio_review_comment_review_status_created").on(
      table.reviewId,
      table.status,
      table.createdAt,
      table.id,
    ),
    index("idx_studio_review_comment_anchor_gin").using("gin", table.anchor),
    check("studio_review_comment_id_check", sql`length(${table.id}) between 1 and 160`),
    check("studio_review_comment_anchor_check", sql`jsonb_typeof(${table.anchor}) = 'object'`),
    check("studio_review_comment_body_check", sql`length(btrim(${table.body})) between 1 and 20000`),
    check(
      "studio_review_comment_severity_check",
      sql`${table.severity} in ('required', 'recommended', 'note')`,
    ),
    check(
      "studio_review_comment_status_check",
      sql`${table.status} in ('open', 'resolved', 'reopened', 'dismissed')`,
    ),
    check(
      "studio_review_comment_resolution_check",
      sql`(${table.status} in ('open', 'reopened') and ${table.resolutionRevisionId} is null and ${table.resolvedBy} is null)
        or (${table.status} in ('resolved', 'dismissed') and ${table.resolutionRevisionId} is not null and ${table.resolvedBy} is not null)`,
    ),
    check("studio_review_comment_time_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);

export const studioReviewCommentAssignees = pgTable(
  "studio_review_comment_assignee",
  {
    commentId: text("commentId")
      .notNull()
      .references(() => studioReviewComments.id, { onDelete: "cascade" }),
    assigneeUserId: text("assigneeUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "studio_review_comment_assignee_pkey",
      columns: [table.commentId, table.assigneeUserId],
    }),
    index("idx_studio_review_comment_assignee_user").on(
      table.assigneeUserId,
      table.createdAt.desc(),
      table.commentId,
    ),
  ],
);

export const studioCapabilityLedger = pgTable(
  "studio_capability_ledger",
  {
    id: text("id").primaryKey(),
    status: text("status").notNull(),
    domainOwner: text("domainOwner").notNull(),
    entry: jsonb("entry").$type<CapabilityLedgerEntry>().notNull(),
    evidenceDigest: text("evidenceDigest"),
    updatedBy: text("updatedBy").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_studio_capability_ledger_status_updated").on(
      table.status,
      table.updatedAt.desc(),
      table.id,
    ),
    check("studio_capability_ledger_id_check", sql`length(${table.id}) between 1 and 160`),
    check(
      "studio_capability_ledger_status_check",
      sql`${table.status} in (
        'unplanned', 'contracted', 'core-implemented', 'product-wired', 'durable',
        'collaboration-ready', 'roundtrip-ready', 'device-validated',
        'expert-validated', 'equivalent', 'differentiated'
      )`,
    ),
    check("studio_capability_ledger_owner_check", sql`length(btrim(${table.domainOwner})) between 1 and 160`),
    check("studio_capability_ledger_entry_check", sql`jsonb_typeof(${table.entry}) = 'object'`),
    check(
      "studio_capability_ledger_digest_check",
      sql`${table.evidenceDigest} is null or ${table.evidenceDigest} ~ '^[0-9a-f]{64}$'`,
    ),
    check("studio_capability_ledger_time_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);
