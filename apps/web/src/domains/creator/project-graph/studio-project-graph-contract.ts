import {
  artifactKindSchema,
  blobRoleSchema,
  isoTimestampSchema,
  projectAuthorityVersionSchema,
  revisionKindSchema,
  reviewAnchorSchema,
  scopeRefSchema,
  sha256Schema,
  studioEntityIdSchema,
  type ArtifactKind,
  type BlobRole,
  type ReviewAnchor,
  type ScopeRef,
} from "@toonspectrum/studio-project-model";
import {
  compatibilityItemSchema,
  compatibilityReportSchema,
  sourceCreativeFormatSchema,
  type CompatibilityItem,
  type CompatibilityReport,
  type SourceCreativeFormat,
} from "@toonspectrum/studio-format-gateway";
import { z } from "zod";

export const studioProjectAccessSchema = z
  .object({
    view: z.boolean(),
    comment: z.boolean(),
    edit: z.boolean(),
    manageMembers: z.boolean(),
    respondInvite: z.boolean(),
    owner: z.boolean(),
    role: z.enum(["owner", "admin", "editor", "commenter", "viewer"]).nullable(),
  })
  .strict();
export type StudioProjectAccessRecord = z.infer<typeof studioProjectAccessSchema>;

export const studioArtifactRecordSchema = z
  .object({
    id: studioEntityIdSchema,
    projectId: studioEntityIdSchema,
    kind: artifactKindSchema,
    title: z.string().trim().min(1).max(240),
    scope: scopeRefSchema,
    headRevisionId: studioEntityIdSchema,
    approvedRevisionId: studioEntityIdSchema.nullable(),
    ownerWorkspaceId: studioEntityIdSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();
export type StudioArtifactRecord = z.infer<typeof studioArtifactRecordSchema>;

export const studioProjectRecordSchema = z
  .object({
    id: studioEntityIdSchema,
    workId: studioEntityIdSchema,
    schemaVersion: z.literal(3),
    authorityVersion: projectAuthorityVersionSchema,
    ownerUserId: studioEntityIdSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
    access: studioProjectAccessSchema,
    artifacts: z.array(studioArtifactRecordSchema),
  })
  .strict();
export type StudioProjectRecord = z.infer<typeof studioProjectRecordSchema>;

export const studioRevisionBlobRefSchema = z
  .object({
    sha256: sha256Schema,
    role: blobRoleSchema,
    ordinal: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export type StudioRevisionBlobRef = z.infer<typeof studioRevisionBlobRefSchema>;

export const studioRevisionRecordSchema = z
  .object({
    id: studioEntityIdSchema,
    artifactId: studioEntityIdSchema,
    kind: revisionKindSchema,
    parentIds: z.array(studioEntityIdSchema).max(16),
    rootGraphHash: sha256Schema,
    operationFirst: z.number().int().positive().nullable(),
    operationLast: z.number().int().positive().nullable(),
    createdBy: studioEntityIdSchema.nullable(),
    deviceId: studioEntityIdSchema,
    createdAt: isoTimestampSchema,
    message: z.string().max(500).nullable(),
    compatibilityReportId: studioEntityIdSchema.nullable(),
    provenanceManifestId: studioEntityIdSchema.nullable(),
    blobRefs: z.array(studioRevisionBlobRefSchema),
  })
  .strict();
export type StudioRevisionRecord = z.infer<typeof studioRevisionRecordSchema>;

export const studioRevisionCommitResponseSchema = z
  .object({
    artifactId: studioEntityIdSchema,
    revisionId: studioEntityIdSchema,
    headRevisionId: studioEntityIdSchema,
    approvedRevisionId: studioEntityIdSchema.nullable(),
    sequence: z.number().int().positive(),
    replayed: z.boolean(),
  })
  .strict();
export type StudioRevisionCommitResponse = z.infer<
  typeof studioRevisionCommitResponseSchema
>;

export const studioProjectCreateResponseSchema = z
  .object({
    projectId: studioEntityIdSchema,
    artifactId: studioEntityIdSchema,
    revisionId: studioEntityIdSchema,
    replayed: z.boolean(),
  })
  .strict();
export type StudioProjectCreateResponse = z.infer<
  typeof studioProjectCreateResponseSchema
>;

export const studioBlobRegistrationSchema = z
  .object({
    hash: sha256Schema,
    malwareStatus: z.string().trim().min(1).max(80),
    formatStatus: z.string().trim().min(1).max(80),
    existing: z.boolean(),
  })
  .strict();
export type StudioBlobRegistration = z.infer<typeof studioBlobRegistrationSchema>;

const studioReviewStatusSchema = z.enum([
  "open",
  "changes-requested",
  "approved",
  "rejected",
  "cancelled",
]);
const studioReviewCommentStatusSchema = z.enum([
  "open",
  "resolved",
  "reopened",
  "dismissed",
]);

export const studioReviewSummarySchema = z
  .object({
    id: studioEntityIdSchema,
    artifactId: studioEntityIdSchema,
    revisionId: studioEntityIdSchema,
    requestedBy: studioEntityIdSchema.nullable(),
    title: z.string().trim().min(1).max(240),
    status: studioReviewStatusSchema,
    decidedAt: isoTimestampSchema.nullable(),
    decidedBy: studioEntityIdSchema.nullable(),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
    reviewerIds: z.array(studioEntityIdSchema),
    openRequiredCommentCount: z.number().int().nonnegative(),
  })
  .strict();
export type StudioReviewSummary = z.infer<typeof studioReviewSummarySchema>;

export const studioReviewCommentSchema = z
  .object({
    id: studioEntityIdSchema,
    reviewId: studioEntityIdSchema,
    authorUserId: studioEntityIdSchema.nullable(),
    anchor: reviewAnchorSchema,
    body: z.string().trim().min(1).max(20_000),
    severity: z.enum(["required", "recommended", "note"]),
    status: studioReviewCommentStatusSchema,
    dueAt: isoTimestampSchema.nullable(),
    resolutionRevisionId: studioEntityIdSchema.nullable(),
    resolvedBy: studioEntityIdSchema.nullable(),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
    assigneeIds: z.array(studioEntityIdSchema),
  })
  .strict();
export type StudioReviewComment = z.infer<typeof studioReviewCommentSchema>;

export const studioReviewRecordSchema = studioReviewSummarySchema.extend({
  comments: z.array(studioReviewCommentSchema),
});
export type StudioReviewRecord = z.infer<typeof studioReviewRecordSchema>;

export const studioCompatibilityApprovalSchema = z
  .object({
    id: studioEntityIdSchema,
    approvedBy: studioEntityIdSchema.nullable(),
    approvedAt: isoTimestampSchema.nullable(),
  })
  .strict();

export const studioRestoreRevisionInputSchema = z
  .object({
    revisionId: studioEntityIdSchema,
    commandId: studioEntityIdSchema,
    deviceId: studioEntityIdSchema,
    createdAt: isoTimestampSchema,
    message: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
export type StudioRestoreRevisionInput = z.infer<
  typeof studioRestoreRevisionInputSchema
>;

export interface StudioInitialRevisionInput {
  readonly id: string;
  readonly rootGraphHash: string;
  readonly deviceId: string;
  readonly createdAt: string;
  readonly message?: string;
  readonly blobRefs: readonly StudioRevisionBlobRef[];
}

export interface StudioArtifactBootstrapInput {
  readonly workspaceId: string;
  readonly artifact: {
    readonly id: string;
    readonly kind: ArtifactKind;
    readonly title: string;
    readonly scope: ScopeRef;
  };
  readonly initialRevision: StudioInitialRevisionInput;
}

export interface StudioProjectBootstrapInput extends StudioArtifactBootstrapInput {
  readonly projectId: string;
  readonly workId: string;
}

export interface StudioBlobRegistrationInput {
  readonly hash: string;
  readonly size: number;
  readonly mediaType: string;
  readonly objectKey: string;
  readonly encryptionMetadata?: Readonly<Record<string, unknown>>;
}

export interface StudioCommandCommitInput {
  readonly id: string;
  readonly type: string;
  readonly scope: ScopeRef;
  readonly payloadHash: string;
  readonly issuedAt: string;
  readonly deterministicSeed?: number;
  readonly payload?: unknown;
  readonly patches?: readonly unknown[];
  readonly inversePatches?: readonly unknown[];
  readonly invalidations?: readonly unknown[];
}

export interface StudioRevisionCommitInput {
  readonly revisionId: string;
  readonly kind: z.infer<typeof revisionKindSchema>;
  readonly parentIds: readonly string[];
  readonly rootGraphHash: string;
  readonly operationRange?: { readonly first: number; readonly last: number };
  readonly blobRefs?: readonly StudioRevisionBlobRef[];
  readonly deviceId: string;
  readonly createdAt: string;
  readonly message?: string;
  readonly compatibilityReportId?: string;
  readonly provenanceManifestId?: string;
  readonly command: StudioCommandCommitInput;
}

export interface StudioReviewCreateInput {
  readonly id: string;
  readonly revisionId: string;
  readonly title: string;
  readonly reviewerIds: readonly string[];
}

export interface StudioReviewCommentCreateInput {
  readonly id: string;
  readonly anchor: ReviewAnchor;
  readonly body: string;
  readonly severity: "required" | "recommended" | "note";
  readonly assigneeIds?: readonly string[];
  readonly dueAt?: string;
}

export interface StudioCompatibilityReportCreateInput {
  readonly id: string;
  readonly artifactId?: string;
  readonly source: {
    readonly fileName: string;
    readonly format: SourceCreativeFormat;
    readonly hash: string;
    readonly size: number;
  };
  readonly items: readonly CompatibilityItem[];
  readonly createdAt: string;
}

export {
  compatibilityItemSchema,
  compatibilityReportSchema,
  sourceCreativeFormatSchema,
};
export type { BlobRole, CompatibilityReport };
