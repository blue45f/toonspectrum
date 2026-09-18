import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import {
  artifactKindSchema,
  blobRoleSchema,
  isoTimestampSchema,
  revisionKindSchema,
  reviewAnchorSchema,
  scopeRefSchema,
  sha256Schema,
  studioEntityIdSchema,
} from "@toonspectrum/studio-project-model";
import {
  compatibilityItemSchema,
  sourceCreativeFormatSchema,
} from "@toonspectrum/studio-format-gateway";

const HumanTextSchema = z.string().trim().min(1).max(4_096);
const CommandTypeSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/u);

export const StudioProjectParamsSchema = z
  .object({ projectId: studioEntityIdSchema })
  .strict();
export class StudioProjectParamsDto extends createZodDto(StudioProjectParamsSchema) {}

export const StudioWorkParamsSchema = z
  .object({ workId: studioEntityIdSchema })
  .strict();
export class StudioWorkParamsDto extends createZodDto(StudioWorkParamsSchema) {}

export const StudioArtifactParamsSchema = z
  .object({ artifactId: studioEntityIdSchema })
  .strict();
export class StudioArtifactParamsDto extends createZodDto(StudioArtifactParamsSchema) {}

export const StudioRevisionParamsSchema = z
  .object({
    artifactId: studioEntityIdSchema,
    revisionId: studioEntityIdSchema,
  })
  .strict();
export class StudioRevisionParamsDto extends createZodDto(
  StudioRevisionParamsSchema,
) {}

export const StudioReviewParamsSchema = z
  .object({ reviewId: studioEntityIdSchema })
  .strict();
export class StudioReviewParamsDto extends createZodDto(StudioReviewParamsSchema) {}

export const StudioReviewCommentParamsSchema = z
  .object({ commentId: studioEntityIdSchema })
  .strict();
export class StudioReviewCommentParamsDto extends createZodDto(
  StudioReviewCommentParamsSchema,
) {}

export const StudioReportParamsSchema = z
  .object({ reportId: studioEntityIdSchema })
  .strict();
export class StudioReportParamsDto extends createZodDto(StudioReportParamsSchema) {}

export const StudioBlobCommitRefSchema = z
  .object({
    sha256: sha256Schema,
    role: blobRoleSchema,
    ordinal: z.number().int().nonnegative().max(1_000_000),
  })
  .strict();

const InitialRevisionSchema = z
  .object({
    id: studioEntityIdSchema,
    rootGraphHash: sha256Schema,
    deviceId: studioEntityIdSchema,
    createdAt: isoTimestampSchema,
    message: z.string().trim().min(1).max(500).optional(),
    blobRefs: z.array(StudioBlobCommitRefSchema).max(100_000).default([]),
  })
  .strict();

export const CreateStudioProjectGraphSchema = z
  .object({
    projectId: studioEntityIdSchema,
    workId: studioEntityIdSchema,
    workspaceId: studioEntityIdSchema,
    artifact: z
      .object({
        id: studioEntityIdSchema,
        kind: artifactKindSchema,
        title: z.string().trim().min(1).max(240),
        scope: scopeRefSchema,
      })
      .strict(),
    initialRevision: InitialRevisionSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.artifact.scope.projectId !== input.projectId) {
      context.addIssue({
        code: "custom",
        path: ["artifact", "scope", "projectId"],
        message: "artifact scope must match projectId",
      });
    }
  });
export class CreateStudioProjectGraphDto extends createZodDto(
  CreateStudioProjectGraphSchema,
) {}

export const CreateStudioArtifactSchema = z
  .object({
    workspaceId: studioEntityIdSchema,
    artifact: z
      .object({
        id: studioEntityIdSchema,
        kind: artifactKindSchema,
        title: z.string().trim().min(1).max(240),
        scope: scopeRefSchema,
      })
      .strict(),
    initialRevision: InitialRevisionSchema,
  })
  .strict();
export class CreateStudioArtifactDto extends createZodDto(
  CreateStudioArtifactSchema,
) {}

export const StudioCommandCommitSchema = z
  .object({
    id: studioEntityIdSchema,
    type: CommandTypeSchema,
    scope: scopeRefSchema,
    payloadHash: sha256Schema,
    issuedAt: isoTimestampSchema,
    deterministicSeed: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    payload: z.unknown().optional(),
    patches: z.array(z.unknown()).max(1_000_000).default([]),
    inversePatches: z.array(z.unknown()).max(1_000_000).default([]),
    invalidations: z.array(z.unknown()).max(1_000_000).default([]),
  })
  .strict();

export const CommitStudioRevisionSchema = z
  .object({
    revisionId: studioEntityIdSchema,
    kind: revisionKindSchema,
    parentIds: z.array(studioEntityIdSchema).max(16),
    rootGraphHash: sha256Schema,
    operationRange: z
      .object({
        first: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        last: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      })
      .strict()
      .optional(),
    blobRefs: z.array(StudioBlobCommitRefSchema).max(100_000).default([]),
    deviceId: studioEntityIdSchema,
    createdAt: isoTimestampSchema,
    message: z.string().trim().min(1).max(500).optional(),
    compatibilityReportId: studioEntityIdSchema.optional(),
    provenanceManifestId: studioEntityIdSchema.optional(),
    command: StudioCommandCommitSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (new Set(input.parentIds).size !== input.parentIds.length) {
      context.addIssue({
        code: "custom",
        path: ["parentIds"],
        message: "parent revision ids must be unique",
      });
    }
    if (input.parentIds.includes(input.revisionId)) {
      context.addIssue({
        code: "custom",
        path: ["parentIds"],
        message: "revision cannot parent itself",
      });
    }
    if (
      input.operationRange !== undefined
      && input.operationRange.last < input.operationRange.first
    ) {
      context.addIssue({
        code: "custom",
        path: ["operationRange", "last"],
        message: "operation range last must be >= first",
      });
    }
    const blobKeys = input.blobRefs.map(
      (blob) => `${blob.role}:${blob.ordinal}:${blob.sha256}`,
    );
    if (new Set(blobKeys).size !== blobKeys.length) {
      context.addIssue({
        code: "custom",
        path: ["blobRefs"],
        message: "blob references must be unique",
      });
    }
  });
export class CommitStudioRevisionDto extends createZodDto(
  CommitStudioRevisionSchema,
) {}

export const RestoreStudioRevisionSchema = z
  .object({
    revisionId: studioEntityIdSchema,
    commandId: studioEntityIdSchema,
    deviceId: studioEntityIdSchema,
    createdAt: isoTimestampSchema,
    message: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
export class RestoreStudioRevisionDto extends createZodDto(
  RestoreStudioRevisionSchema,
) {}

export const RegisterStudioBlobSchema = z
  .object({
    hash: sha256Schema,
    size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    mediaType: z.string().trim().min(1).max(160),
    objectKey: z.string().trim().min(1).max(2_048),
    encryptionMetadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export class RegisterStudioBlobDto extends createZodDto(RegisterStudioBlobSchema) {}

export const CreateStudioReviewSchema = z
  .object({
    id: studioEntityIdSchema,
    revisionId: studioEntityIdSchema,
    title: z.string().trim().min(1).max(240),
    reviewerIds: z.array(studioEntityIdSchema).min(1).max(64),
  })
  .strict()
  .superRefine((review, context) => {
    if (new Set(review.reviewerIds).size !== review.reviewerIds.length) {
      context.addIssue({
        code: "custom",
        path: ["reviewerIds"],
        message: "reviewers must be unique",
      });
    }
  });
export class CreateStudioReviewDto extends createZodDto(CreateStudioReviewSchema) {}

export const CreateStudioReviewCommentSchema = z
  .object({
    id: studioEntityIdSchema,
    anchor: reviewAnchorSchema,
    body: HumanTextSchema.max(20_000),
    severity: z.enum(["required", "recommended", "note"]),
    assigneeIds: z.array(studioEntityIdSchema).max(64).default([]),
    dueAt: isoTimestampSchema.optional(),
  })
  .strict();
export class CreateStudioReviewCommentDto extends createZodDto(
  CreateStudioReviewCommentSchema,
) {}

export const DecideStudioReviewSchema = z
  .object({
    status: z.enum([
      "changes-requested",
      "approved",
      "rejected",
      "cancelled",
    ]),
  })
  .strict();
export class DecideStudioReviewDto extends createZodDto(
  DecideStudioReviewSchema,
) {}

export const ResolveStudioReviewCommentSchema = z
  .object({
    resolutionRevisionId: studioEntityIdSchema,
    status: z.enum(["resolved", "dismissed"]).default("resolved"),
  })
  .strict();
export class ResolveStudioReviewCommentDto extends createZodDto(
  ResolveStudioReviewCommentSchema,
) {}

export const CreateCompatibilityReportSchema = z
  .object({
    id: studioEntityIdSchema,
    artifactId: studioEntityIdSchema.optional(),
    source: z
      .object({
        fileName: z.string().trim().min(1).max(1_024),
        format: sourceCreativeFormatSchema,
        hash: sha256Schema,
        size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      })
      .strict(),
    items: z.array(compatibilityItemSchema).max(1_000_000),
    createdAt: isoTimestampSchema,
  })
  .strict();
export class CreateCompatibilityReportDto extends createZodDto(
  CreateCompatibilityReportSchema,
) {}

export type CreateStudioProjectGraph = z.infer<typeof CreateStudioProjectGraphSchema>;
export type CreateStudioArtifact = z.infer<typeof CreateStudioArtifactSchema>;
export type CommitStudioRevision = z.infer<typeof CommitStudioRevisionSchema>;
export type RestoreStudioRevision = z.infer<typeof RestoreStudioRevisionSchema>;
export type RegisterStudioBlob = z.infer<typeof RegisterStudioBlobSchema>;
export type CreateStudioReview = z.infer<typeof CreateStudioReviewSchema>;
export type DecideStudioReview = z.infer<typeof DecideStudioReviewSchema>;
export type ResolveStudioReviewComment = z.infer<typeof ResolveStudioReviewCommentSchema>;
export type CreateStudioReviewComment = z.infer<typeof CreateStudioReviewCommentSchema>;
export type CreateCompatibilityReport = z.infer<typeof CreateCompatibilityReportSchema>;
