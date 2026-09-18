import { z } from "zod";

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type WorkspaceId = Brand<string, "WorkspaceId">;
export type ProjectId = Brand<string, "ProjectId">;
export type SeasonId = Brand<string, "SeasonId">;
export type EpisodeId = Brand<string, "EpisodeId">;
export type SequenceId = Brand<string, "SequenceId">;
export type StorySceneId = Brand<string, "StorySceneId">;
export type PanelId = Brand<string, "PanelId">;
export type ElementId = Brand<string, "ElementId">;
export type ArtifactId = Brand<string, "ArtifactId">;
export type RevisionId = Brand<string, "RevisionId">;
export type UserId = Brand<string, "UserId">;
export type DeviceId = Brand<string, "DeviceId">;
export type CommandId = Brand<string, "CommandId">;
export type BlobId = Brand<string, "BlobId">;
export type Sha256 = Brand<string, "Sha256">;
export type CompatibilityReportId = Brand<string, "CompatibilityReportId">;
export type ProvenanceManifestId = Brand<string, "ProvenanceManifestId">;
export type ExternalFileBindingId = Brand<string, "ExternalFileBindingId">;
export type AssetId = Brand<string, "AssetId">;
export type SellerId = Brand<string, "SellerId">;
export type LicenseGrantId = Brand<string, "LicenseGrantId">;
export type ReviewId = Brand<string, "ReviewId">;
export type ReviewCommentId = Brand<string, "ReviewCommentId">;
export type LeaseId = Brand<string, "LeaseId">;
export type ShotId = Brand<string, "ShotId">;
export type VectorStrokeId = Brand<string, "VectorStrokeId">;

export const STUDIO_ENTITY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
export const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

export const studioEntityIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(STUDIO_ENTITY_ID_PATTERN, "invalid Studio entity id");

export const sha256Schema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(SHA256_PATTERN, "expected a lowercase SHA-256 digest");

export const isoTimestampSchema = z.string().datetime({ offset: true });

export function brandStudioId<T extends Brand<string, string>>(value: string): T {
  return studioEntityIdSchema.parse(value) as T;
}

export function brandSha256(value: string): Sha256 {
  return sha256Schema.parse(value) as Sha256;
}
