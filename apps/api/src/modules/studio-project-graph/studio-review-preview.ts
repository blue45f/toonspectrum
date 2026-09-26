import { z } from "zod";
import { sha256Schema, studioEntityIdSchema, type StudioReviewPageMapping } from "@toonspectrum/studio-project-model";

import {
  LocatedPrivateObjectReferenceSchema, type LocatedPrivateObjectReference,
} from "../../platform/adapters/private-object-storage/private-object-storage.contract";

export const STUDIO_REVIEW_PREVIEW_PAGE_SIZE = 32;
export const STUDIO_REVIEW_PREVIEW_URL_SECONDS = 30;
export const STUDIO_REVIEW_PREVIEW_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export const studioReviewPreviewSubjectSchema = z.object({
  schemaVersion: z.literal(1), projectId: studioEntityIdSchema, workId: studioEntityIdSchema,
  artifactId: studioEntityIdSchema, reviewId: studioEntityIdSchema, revisionId: studioEntityIdSchema,
  rootGraphHash: sha256Schema,
}).strict();
export type StudioReviewPreviewSubject = z.infer<typeof studioReviewPreviewSubjectSchema>;

export const studioReviewPreviewCursorSchema = z.string().regex(/^(0|[1-9][0-9]{0,6})\.[a-f0-9]{64}$/u)
  .refine((value) => Number(value.split(".")[0]) <= 1_000_000);

export interface StudioReviewPreviewBlobRow {
  readonly hash: string;
  readonly ordinal: number;
  readonly size: number | string;
  readonly mediaType: string;
  readonly objectKey: string;
  readonly encryptionMetadata: unknown;
  readonly malwareStatus: string;
  readonly formatStatus: string;
  /** Exact object owned by an active generated-asset reference in this same work. */
  readonly workStorageObject: unknown;
}

export interface StudioReviewPreviewSource {
  readonly subject: StudioReviewPreviewSubject;
  readonly blobs: readonly StudioReviewPreviewBlobRow[];
  readonly nextCursor: string | null;
  readonly pageMappings?: Readonly<Record<number, StudioReviewPageMapping>>;
}

/**
 * The graph's legacy arbitrary objectKey is not a storage locator. Only an explicitly persisted
 * v2 immutable reference is readable: no provider/purpose inference or URL/path fallback.
 */
export function studioReviewPreviewObject(row: StudioReviewPreviewBlobRow): LocatedPrivateObjectReference | null {
  if (row.malwareStatus !== "clean" || row.formatStatus !== "valid" || row.encryptionMetadata !== null
    || !STUDIO_REVIEW_PREVIEW_MEDIA_TYPES.includes(row.mediaType as typeof STUDIO_REVIEW_PREVIEW_MEDIA_TYPES[number])
    || !Number.isSafeInteger(Number(row.size)) || Number(row.size) <= 0
    || !Number.isSafeInteger(row.ordinal) || row.ordinal < 0 || row.ordinal > 1_000_000
    || typeof row.objectKey !== "string" || row.objectKey.length > 2_048) return null;
  let value: unknown;
  try { value = JSON.parse(row.objectKey); } catch { return null; }
  const parsed = LocatedPrivateObjectReferenceSchema.safeParse(value);
  if (!parsed.success) return null;
  const object = parsed.data;
  const owned = LocatedPrivateObjectReferenceSchema.safeParse(row.workStorageObject);
  if (!owned.success || Object.keys(object).some((key) =>
    object[key as keyof LocatedPrivateObjectReference] !== owned.data[key as keyof LocatedPrivateObjectReference])) return null;
  if (object.purpose !== "derived" || object.digest !== `sha256:${row.hash}`
    || object.objectPath !== `sha256/${row.hash.slice(0, 2)}/${row.hash}`
    || object.contentType !== row.mediaType || object.byteLength !== Number(row.size)) return null;
  return object;
}
