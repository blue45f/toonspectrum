import { z } from "zod";

import {
  isoTimestampSchema,
  sha256Schema,
  studioEntityIdSchema,
} from "./ids";

import type {
  ArtifactId,
  ProjectId,
  RevisionId,
  Sha256,
} from "./ids";

export const syncOutboxStateSchema = z.enum([
  "pending",
  "uploading-blobs",
  "committing",
  "retry-wait",
  "conflict",
  "acknowledged",
  "cancelled",
]);
export type SyncOutboxState = z.infer<typeof syncOutboxStateSchema>;

export interface SyncOutboxEntry {
  readonly id: string;
  readonly projectId: ProjectId;
  readonly artifactId: ArtifactId;
  readonly localSequence: number;
  readonly baseRevisionId: RevisionId;
  readonly proposedRevisionId: RevisionId;
  readonly operationHash: Sha256;
  readonly requiredBlobHashes: readonly Sha256[];
  readonly state: SyncOutboxState;
  readonly attempts: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly nextRetryAt?: string;
  readonly lastErrorCode?: string;
}

export const syncOutboxEntrySchema = z
  .object({
    id: studioEntityIdSchema,
    projectId: studioEntityIdSchema,
    artifactId: studioEntityIdSchema,
    localSequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    baseRevisionId: studioEntityIdSchema,
    proposedRevisionId: studioEntityIdSchema,
    operationHash: sha256Schema,
    requiredBlobHashes: z.array(sha256Schema).max(100_000),
    state: syncOutboxStateSchema,
    attempts: z.number().int().nonnegative().max(1_000),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
    nextRetryAt: isoTimestampSchema.optional(),
    lastErrorCode: z.string().trim().min(1).max(160).optional(),
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.baseRevisionId === entry.proposedRevisionId) {
      context.addIssue({ code: "custom", path: ["proposedRevisionId"], message: "proposed revision must differ from base revision" });
    }
    if (new Set(entry.requiredBlobHashes).size !== entry.requiredBlobHashes.length) {
      context.addIssue({ code: "custom", path: ["requiredBlobHashes"], message: "required blob hashes must be unique" });
    }
    if (entry.state === "retry-wait" && entry.nextRetryAt === undefined) {
      context.addIssue({ code: "custom", path: ["nextRetryAt"], message: "retry-wait requires nextRetryAt" });
    }
    if (entry.state !== "retry-wait" && entry.nextRetryAt !== undefined) {
      context.addIssue({ code: "custom", path: ["nextRetryAt"], message: "nextRetryAt is only valid in retry-wait" });
    }
  });

export const syncConflictKindSchema = z.enum([
  "head-advanced",
  "same-object-edit",
  "destructive-region-overlap",
  "deleted-remotely",
  "permission-changed",
  "provider-version-mismatch",
]);

export interface SyncConflict {
  readonly id: string;
  readonly projectId: ProjectId;
  readonly artifactId: ArtifactId;
  readonly baseRevisionId: RevisionId;
  readonly localRevisionId: RevisionId;
  readonly remoteRevisionId: RevisionId;
  readonly kind: z.infer<typeof syncConflictKindSchema>;
  readonly affectedObjectIds: readonly string[];
  readonly createdAt: string;
}

export const syncConflictSchema = z
  .object({
    id: studioEntityIdSchema,
    projectId: studioEntityIdSchema,
    artifactId: studioEntityIdSchema,
    baseRevisionId: studioEntityIdSchema,
    localRevisionId: studioEntityIdSchema,
    remoteRevisionId: studioEntityIdSchema,
    kind: syncConflictKindSchema,
    affectedObjectIds: z.array(studioEntityIdSchema).max(100_000),
    createdAt: isoTimestampSchema,
  })
  .strict();

export interface RevisionCommitRequest {
  readonly artifactId: ArtifactId;
  readonly expectedHeadRevisionId: RevisionId;
  readonly revisionId: RevisionId;
  readonly operationHash: Sha256;
  readonly requiredBlobHashes: readonly Sha256[];
  readonly idempotencyKey: string;
}

export const revisionCommitRequestSchema = z
  .object({
    artifactId: studioEntityIdSchema,
    expectedHeadRevisionId: studioEntityIdSchema,
    revisionId: studioEntityIdSchema,
    operationHash: sha256Schema,
    requiredBlobHashes: z.array(sha256Schema).max(100_000),
    idempotencyKey: z.string().trim().min(8).max(240),
  })
  .strict();
