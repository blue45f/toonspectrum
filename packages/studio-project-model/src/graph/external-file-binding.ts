import { z } from "zod";

import {
  isoTimestampSchema,
  sha256Schema,
  studioEntityIdSchema,
} from "./ids";

import type {
  ArtifactId,
  ExternalFileBindingId,
  RevisionId,
  Sha256,
} from "./ids";

export const externalFileProviderSchema = z.enum([
  "local-file",
  "filesystem-handle",
  "google-drive",
  "dropbox",
  "onedrive",
]);
export type ExternalFileProvider = z.infer<typeof externalFileProviderSchema>;

export const externalFileSyncModeSchema = z.enum([
  "import-only",
  "export-only",
  "bidirectional",
  "backup-mirror",
]);
export type ExternalFileSyncMode = z.infer<typeof externalFileSyncModeSchema>;

export interface ExternalFileBinding {
  readonly id: ExternalFileBindingId;
  readonly artifactId: ArtifactId;
  readonly provider: ExternalFileProvider;
  readonly providerAccountId?: string;
  readonly remoteFileId: string;
  readonly displayPath: string;
  readonly syncMode: ExternalFileSyncMode;
  readonly remoteVersion?: string;
  readonly remoteEtag?: string;
  readonly contentHash?: Sha256;
  readonly lastSyncedRevisionId?: RevisionId;
  readonly lastSyncedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const externalFileBindingSchema = z
  .object({
    id: studioEntityIdSchema,
    artifactId: studioEntityIdSchema,
    provider: externalFileProviderSchema,
    providerAccountId: z.string().trim().min(1).max(512).optional(),
    remoteFileId: z.string().trim().min(1).max(2_048),
    displayPath: z.string().trim().min(1).max(4_096),
    syncMode: externalFileSyncModeSchema,
    remoteVersion: z.string().trim().min(1).max(1_024).optional(),
    remoteEtag: z.string().trim().min(1).max(1_024).optional(),
    contentHash: sha256Schema.optional(),
    lastSyncedRevisionId: studioEntityIdSchema.optional(),
    lastSyncedAt: isoTimestampSchema.optional(),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict()
  .superRefine((binding, context) => {
    if (
      binding.provider !== "local-file"
      && binding.provider !== "filesystem-handle"
      && binding.providerAccountId === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["providerAccountId"],
        message: "cloud file binding requires providerAccountId",
      });
    }
    if (Date.parse(binding.updatedAt) < Date.parse(binding.createdAt)) {
      context.addIssue({ code: "custom", path: ["updatedAt"], message: "updatedAt must not precede createdAt" });
    }
    const hasSyncPoint = binding.lastSyncedAt !== undefined || binding.lastSyncedRevisionId !== undefined;
    if (hasSyncPoint && (binding.lastSyncedAt === undefined || binding.lastSyncedRevisionId === undefined)) {
      context.addIssue({ code: "custom", path: ["lastSyncedAt"], message: "sync timestamp and revision must be stored together" });
    }
  });
