import { deriveStudioReviewPageMapping, type StudioReviewPageMapping } from "@toonspectrum/studio-project-model";
import { z } from "zod";

import { studioReviewCaptureFromOperation, type StudioReviewSourcePin } from "./studio-review-capture-attestation";

export const studioReviewPageRasterSchema = z.object({ ordinal: z.number().int().min(0).max(99_999),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u), width: z.number().int().positive(), height: z.number().int().positive(),
}).strict();
export type StudioReviewPageRaster = z.infer<typeof studioReviewPageRasterSchema>;
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : null;

/** Validate/hash one immutable document once per read, including multi-page preview batches. */
function mappingResolver(operation: unknown, pin: StudioReviewSourcePin, captureReceipt?: unknown): (ordinal: number, sha256: string) => StudioReviewPageMapping {
  const payload = record(record(operation)?.payload);
  if (!payload || payload.sourceMapVersion === undefined) return () => ({ status: "unmapped", reason: "legacy-review" });
  const proof = studioReviewCaptureFromOperation(operation, pin, captureReceipt);
  const rasters = z.array(studioReviewPageRasterSchema).min(1).max(100_000).safeParse(payload.pageRasters);
  if (payload.sourceMapVersion !== 1 || !proof || !rasters.success
    || rasters.data.length !== proof.intent.pageCount || rasters.data.some((page, index) => page.ordinal !== index)) {
    return () => ({ status: "unmapped", reason: "source-unavailable" });
  }
  return (ordinal, sha256) => {
    const raster = rasters.data[ordinal];
    if (!raster || raster.ordinal !== ordinal || raster.sha256 !== sha256) return { status: "unmapped", reason: "source-unavailable" };
    return deriveStudioReviewPageMapping(payload.sourceSnapshot, { sourceServerRevision: proof.intent.sourceServerRevision,
      sourceContentDigest: proof.intent.sourceContentDigest, ordinal, renderWidth: raster.width, renderHeight: raster.height });
  };
}

/** Only a server-attested capture operation can bind pixels to saved authoring coordinates. */
export function studioReviewMappingFromOperation(operation: unknown, pin: StudioReviewSourcePin, ordinal: number, sha256: string,
  captureReceipt?: unknown): StudioReviewPageMapping {
  return mappingResolver(operation, pin, captureReceipt)(ordinal, sha256);
}

export function studioReviewMappingsFromOperation(operation: unknown, pin: StudioReviewSourcePin,
  previews: readonly { readonly ordinal: number; readonly hash: string }[], captureReceipt?: unknown): Readonly<Record<number, StudioReviewPageMapping>> {
  const resolve = mappingResolver(operation, pin, captureReceipt);
  return Object.fromEntries(previews.map((preview) => [preview.ordinal, resolve(preview.ordinal, preview.hash)]));
}
