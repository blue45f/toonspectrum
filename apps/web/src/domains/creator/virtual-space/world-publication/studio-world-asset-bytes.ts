import { inspectStrictJpegDimensions, inspectStrictStaticWebpDimensions } from "@/shared/lib/strict-raster-image-inspector";
import { parseStudioUploadImageDimensions } from "../../studio-upload-image-safety";
import { STUDIO_WORLD_ASSET_FILE_MAX_BYTES, STUDIO_WORLD_ASSET_TOTAL_MAX_BYTES,
  type StudioWorldAssetIntegrity } from "@toonspectrum/studio-project-model/world-publication";

export interface WorldAssetBudget { bytes: number; pixels?: number }
export class StudioWorldAssetBytesError extends Error {}
const fail = (message: string): never => { throw new StudioWorldAssetBytesError(message); };
const cancelled = (signal: AbortSignal) => { if (signal.aborted) throw new DOMException("Asset verification cancelled", "AbortError"); };

/** Streaming limits run before allocation/decoding; caller owns the aggregate budget. */
export async function readStudioWorldAssetBytes(response: Response, signal: AbortSignal,
  budget: WorldAssetBudget, expected?: StudioWorldAssetIntegrity): Promise<{ blob: Blob; sha256: string }> {
  cancelled(signal);
  const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (!response.ok || !mediaType || !["image/png", "image/jpeg", "image/webp"].includes(mediaType)
    || (expected && mediaType !== expected.mediaType)) return fail("Unsupported world image response");
  const advertised = response.headers.get("content-length");
  if (advertised !== null && (!/^\d+$/u.test(advertised) || Number(advertised) > STUDIO_WORLD_ASSET_FILE_MAX_BYTES)) return fail("World image exceeds byte budget");
  if (!response.body) return fail("Missing world image body");
  const reader = response.body.getReader(), chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      cancelled(signal);
      const result = await reader.read();
      cancelled(signal);
      if (result.done) break;
      size += result.value.byteLength; budget.bytes += result.value.byteLength;
      if (size > STUDIO_WORLD_ASSET_FILE_MAX_BYTES || budget.bytes > STUDIO_WORLD_ASSET_TOTAL_MAX_BYTES
        || (expected && size > expected.bytes)) return fail("World image exceeds byte budget");
      chunks.push(new Uint8Array(result.value));
    }
    if (!size || (expected && size !== expected.bytes)) return fail("World image size does not match");
    const blob = new Blob(chunks, { type: mediaType });
    const data = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", data);
    cancelled(signal);
    const sha256 = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
    if (expected && sha256 !== expected.sha256) return fail("World image content changed");
    const header = parseStudioUploadImageDimensions(data);
    const mime = header.format === "jpeg" ? "image/jpeg" : `image/${header.format}`;
    if (mime !== mediaType) return fail("Image header and MIME type do not match");
    const dimensions = mediaType === "image/webp" ? inspectStrictStaticWebpDimensions(new Uint8Array(data))
      : mediaType === "image/jpeg" ? inspectStrictJpegDimensions(new Uint8Array(data)) : header;
    const pixels = dimensions.width * dimensions.height;
    budget.pixels = (budget.pixels ?? 0) + pixels;
    if (dimensions.width > 16384 || dimensions.height > 16384 || pixels > 16_777_216 || budget.pixels > 67_108_864) return fail("World image exceeds decoded pixel budget");
    return { blob, sha256 };
  } finally { signal.removeEventListener("abort", abort); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
