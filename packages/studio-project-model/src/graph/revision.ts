import { z } from "zod";

import { canonicalJson } from "../ir/digest";

import {
  isoTimestampSchema,
  sha256Schema,
  studioEntityIdSchema,
} from "./ids";

import type {
  ArtifactId,
  BlobId,
  CompatibilityReportId,
  DeviceId,
  ProvenanceManifestId,
  RevisionId,
  Sha256,
  UserId,
} from "./ids";

export const revisionKindSchema = z.enum([
  "autosave",
  "checkpoint",
  "submission",
  "review-snapshot",
  "approved",
  "release",
]);
export type RevisionKind = z.infer<typeof revisionKindSchema>;

export const blobRoleSchema = z.enum([
  "graph",
  "tile",
  "vector",
  "source",
  "thumbnail",
  "preview",
  "export",
  "license",
  "provenance",
]);
export type BlobRole = z.infer<typeof blobRoleSchema>;

export interface BlobRef {
  id: BlobId;
  sha256: Sha256;
  size: number;
  mediaType: string;
  role: BlobRole;
  encryptionKeyId?: string;
}

export const blobRefSchema = z
  .object({
    id: studioEntityIdSchema,
    sha256: sha256Schema,
    size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    mediaType: z.string().trim().min(1).max(160),
    role: blobRoleSchema,
    encryptionKeyId: z.string().trim().min(1).max(160).optional(),
  })
  .strict();

export interface RevisionManifest {
  id: RevisionId;
  artifactId: ArtifactId;
  kind: RevisionKind;
  parentIds: RevisionId[];
  rootGraphHash: Sha256;
  operationRange?: { first: number; last: number };
  blobRefs: BlobRef[];
  createdBy: UserId;
  deviceId: DeviceId;
  createdAt: string;
  message?: string;
  compatibilityReportId?: CompatibilityReportId;
  provenanceManifestId?: ProvenanceManifestId;
}

export const revisionManifestSchema = z
  .object({
    id: studioEntityIdSchema,
    artifactId: studioEntityIdSchema,
    kind: revisionKindSchema,
    parentIds: z.array(studioEntityIdSchema).max(16),
    rootGraphHash: sha256Schema,
    operationRange: z
      .object({
        first: z.number().int().positive(),
        last: z.number().int().positive(),
      })
      .strict()
      .optional(),
    blobRefs: z.array(blobRefSchema).max(100_000),
    createdBy: studioEntityIdSchema,
    deviceId: studioEntityIdSchema,
    createdAt: isoTimestampSchema,
    message: z.string().trim().min(1).max(500).optional(),
    compatibilityReportId: studioEntityIdSchema.optional(),
    provenanceManifestId: studioEntityIdSchema.optional(),
  })
  .strict()
  .superRefine((revision, context) => {
    if (new Set(revision.parentIds).size !== revision.parentIds.length) {
      context.addIssue({
        code: "custom",
        path: ["parentIds"],
        message: "revision parent ids must be unique",
      });
    }
    if (revision.parentIds.includes(revision.id)) {
      context.addIssue({
        code: "custom",
        path: ["parentIds"],
        message: "revision cannot parent itself",
      });
    }
    if (
      revision.operationRange !== undefined
      && revision.operationRange.last < revision.operationRange.first
    ) {
      context.addIssue({
        code: "custom",
        path: ["operationRange", "last"],
        message: "operation range last must be >= first",
      });
    }
    const blobKeys = revision.blobRefs.map(
      (blob) => `${blob.sha256}:${blob.role}:${blob.id}`,
    );
    if (new Set(blobKeys).size !== blobKeys.length) {
      context.addIssue({
        code: "custom",
        path: ["blobRefs"],
        message: "revision blob references must be unique",
      });
    }
  });

export class ImmutableRevisionError extends Error {
  constructor(readonly revisionId: string) {
    super(`revision ${revisionId} is immutable`);
    this.name = "ImmutableRevisionError";
  }
}

export function parseRevisionManifest(value: unknown): RevisionManifest {
  return revisionManifestSchema.parse(value) as RevisionManifest;
}

export function assertSameImmutableRevision(
  current: RevisionManifest,
  incoming: RevisionManifest,
): void {
  if (canonicalJson(current) !== canonicalJson(incoming)) {
    throw new ImmutableRevisionError(current.id);
  }
}

export function isFrozenWorkflowRevision(kind: RevisionKind): boolean {
  return kind === "submission"
    || kind === "review-snapshot"
    || kind === "approved"
    || kind === "release";
}

const ALLOWED_PARENT_KINDS: Readonly<Record<RevisionKind, readonly RevisionKind[]>> = {
  autosave: ["autosave", "checkpoint", "submission", "review-snapshot", "approved"],
  checkpoint: ["autosave", "checkpoint", "submission", "review-snapshot", "approved"],
  submission: ["autosave", "checkpoint"],
  "review-snapshot": ["submission"],
  approved: ["review-snapshot"],
  release: ["approved"],
};

export function revisionParentKindIssues(
  revision: RevisionManifest,
  parents: readonly RevisionManifest[],
): string[] {
  if (revision.parentIds.length === 0) {
    return revision.kind === "autosave" || revision.kind === "checkpoint"
      ? []
      : [`${revision.kind} revision requires a parent`];
  }
  const allowed = ALLOWED_PARENT_KINDS[revision.kind];
  const issues: string[] = [];
  for (const parent of parents) {
    if (!allowed.includes(parent.kind)) {
      issues.push(`${revision.kind} cannot derive from ${parent.kind}`);
    }
    if (parent.artifactId !== revision.artifactId) {
      issues.push(`parent ${parent.id} belongs to another artifact`);
    }
  }
  return issues;
}
