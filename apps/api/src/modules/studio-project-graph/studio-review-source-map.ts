import { deriveStudioReviewPageMapping, type StudioReviewPageMapping } from "@toonspectrum/studio-project-model";
import { z } from "zod";

import { studioReviewPreviewDigest, studioReviewPreviewIntentKey, studioReviewPreviewIntentSchema } from "./studio-review-preview-producer.contract";

export const studioReviewPageRasterSchema = z.object({ ordinal: z.number().int().min(0).max(99_999),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u), width: z.number().int().positive(), height: z.number().int().positive(),
}).strict();
export type StudioReviewPageRaster = z.infer<typeof studioReviewPageRasterSchema>;
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : null;

interface ReviewSourcePin {
  readonly workId: string; readonly projectId: string; readonly artifactId: string; readonly rootGraphHash: string;
  readonly reviewId: string; readonly revisionId: string;
}

/** Validate/hash one immutable document once per read, including multi-page preview batches. */
function mappingResolver(operation: unknown, pin: ReviewSourcePin, captureReceipt?: unknown): (ordinal: number, sha256: string) => StudioReviewPageMapping {
  const payload = record(record(operation)?.payload);
  if (!payload || payload.sourceMapVersion === undefined) return () => ({ status: "unmapped", reason: "legacy-review" });
  const intent = studioReviewPreviewIntentSchema.safeParse(payload.intent);
  const rasters = z.array(studioReviewPageRasterSchema).min(1).max(100_000).safeParse(payload.pageRasters);
  const receipt = record(captureReceipt), response = record(receipt?.response), subject = record(response?.subject);
  let sourceDigest: string | null = null;
  try { if (payload.sourceSnapshot !== undefined) sourceDigest = studioReviewPreviewDigest(payload.sourceSnapshot); } catch { /* Unmapped corrupt source. */ }
  if (payload.sourceMapVersion !== 1 || !intent.success || !rasters.success
    || intent.data.workId !== pin.workId || intent.data.projectId !== pin.projectId || intent.data.artifactId !== pin.artifactId
    || intent.data.sourceContentDigest !== pin.rootGraphHash || sourceDigest !== pin.rootGraphHash
    || rasters.data.length !== intent.data.pageCount || rasters.data.some((page, index) => page.ordinal !== index)) {
    return () => ({ status: "unmapped", reason: "source-unavailable" });
  }
  // A client may append graph operations; it cannot manufacture this server-owned producer receipt.
  if (!receipt || typeof receipt.actorUserId !== "string" || response?.status !== "completed"
    || response.fingerprint !== studioReviewPreviewDigest(intent.data) || !subject
    || Object.entries(pin).some(([field, value]) => subject[field] !== value)
    || receipt.idempotencyKeyHash !== studioReviewPreviewIntentKey(receipt.actorUserId, intent.data)
    || record(operation)?.commandId !== `review-capture-${receipt.idempotencyKeyHash}`) {
    return () => ({ status: "unmapped", reason: "source-unavailable" });
  }
  return (ordinal, sha256) => {
    const raster = rasters.data[ordinal];
    if (!raster || raster.ordinal !== ordinal || raster.sha256 !== sha256) return { status: "unmapped", reason: "source-unavailable" };
    return deriveStudioReviewPageMapping(payload.sourceSnapshot, { sourceServerRevision: intent.data.sourceServerRevision,
      sourceContentDigest: intent.data.sourceContentDigest, ordinal, renderWidth: raster.width, renderHeight: raster.height });
  };
}

/** Only a server-attested capture operation can bind pixels to saved authoring coordinates. */
export function studioReviewMappingFromOperation(operation: unknown, pin: ReviewSourcePin, ordinal: number, sha256: string,
  captureReceipt?: unknown): StudioReviewPageMapping {
  return mappingResolver(operation, pin, captureReceipt)(ordinal, sha256);
}

export function studioReviewMappingsFromOperation(operation: unknown, pin: ReviewSourcePin,
  previews: readonly { readonly ordinal: number; readonly hash: string }[], captureReceipt?: unknown): Readonly<Record<number, StudioReviewPageMapping>> {
  const resolve = mappingResolver(operation, pin, captureReceipt);
  return Object.fromEntries(previews.map((preview) => [preview.ordinal, resolve(preview.ordinal, preview.hash)]));
}
