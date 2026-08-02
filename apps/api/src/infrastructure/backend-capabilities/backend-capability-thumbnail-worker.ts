import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { decode, encodeJpeg, encodePng } from "image-js";

import {
  SupabaseObjectStorageError,
} from "../supabase-object-storage/supabase-object-storage.client";
import {
  SUPABASE_OBJECT_STORAGE_PORT,
  type SupabaseObjectStoragePort,
} from "../supabase-object-storage/supabase-object-storage.port";

import { canonicalJsonStringify } from "./backend-capability-gateway-contract";
import {
  BackendCapabilityWorkerCommandSchema,
  BackendCapabilityWorkerSubmissionSchema,
  type BackendCapabilityWorkerCallOptions,
  type BackendCapabilityWorkerPort,
  type BackendCapabilityWorkerReadiness,
  type BackendCapabilityWorkerSubmission,
} from "./backend-capability-worker.port";

import type { BackendCapabilityWorkerConfig } from "./backend-capability-worker.config";

export const BACKEND_CAPABILITY_WORKER_CONFIG = Symbol(
  "BACKEND_CAPABILITY_WORKER_CONFIG",
);
export const BACKEND_CAPABILITY_WORKER_RUNTIME = Symbol(
  "BACKEND_CAPABILITY_WORKER_RUNTIME",
);

export interface BackendCapabilityWorkerRuntime {
  readonly fetch: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
}

interface EncodedImageDimensions {
  readonly format: "jpeg" | "png";
  readonly width: number;
  readonly height: number;
}

interface WorkerReceipt {
  readonly fingerprint: string;
  readonly promise: Promise<BackendCapabilityWorkerSubmission>;
  settled: boolean;
}

const MAXIMUM_PROCESS_RECEIPTS = 1_024;

function rejected(
  errorCode: string,
  retryable: boolean,
): BackendCapabilityWorkerSubmission {
  return BackendCapabilityWorkerSubmissionSchema.parse({
    outcome: "rejected",
    retryable,
    errorCode,
  });
}

function readPngDimensions(bytes: Uint8Array): EncodedImageDimensions | null {
  if (bytes.byteLength < 24) return null;
  const signature = [137, 80, 78, 71, 13, 10, 26, 10] as const;
  if (signature.some((value, index) => bytes[index] !== value)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  return width > 0 && height > 0 ? { format: "png", width, height } : null;
}

const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0,
  0xc1,
  0xc2,
  0xc3,
  0xc5,
  0xc6,
  0xc7,
  0xc9,
  0xca,
  0xcb,
  0xcd,
  0xce,
  0xcf,
]);

function readJpegDimensions(bytes: Uint8Array): EncodedImageDimensions | null {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 3 < bytes.byteLength) {
    while (offset < bytes.byteLength && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.byteLength) return null;
    const marker = bytes[offset] ?? 0;
    offset += 1;
    if (
      marker === 0x01 ||
      marker === 0xd8 ||
      marker === 0xd9 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      continue;
    }
    if (marker === 0xda) return null;
    if (offset + 1 >= bytes.byteLength) return null;
    const segmentLength = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
    if (segmentLength < 2 || offset + segmentLength > bytes.byteLength) {
      return null;
    }
    if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
      if (segmentLength < 7) return null;
      const height = ((bytes[offset + 3] ?? 0) << 8) | (bytes[offset + 4] ?? 0);
      const width = ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0);
      return width > 0 && height > 0
        ? { format: "jpeg", width, height }
        : null;
    }
    offset += segmentLength;
  }
  return null;
}

function readEncodedImageDimensions(
  bytes: Uint8Array,
): EncodedImageDimensions | null {
  return readPngDimensions(bytes) ?? readJpegDimensions(bytes);
}

function boundedPixelCount(width: number, height: number): number | null {
  const pixels = width * height;
  return Number.isSafeInteger(pixels) && pixels > 0 ? pixels : null;
}

async function readExactResponseBytes(
  response: Response,
  expectedBytes: number,
  maximumBytes: number,
  signal: AbortSignal | undefined,
): Promise<Uint8Array> {
  const declared = response.headers.get("content-length");
  if (
    declared !== null &&
    (!/^\d+$/u.test(declared) || Number(declared) !== expectedBytes)
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("source length mismatch");
  }
  if (!response.body) throw new Error("source body missing");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const onAbort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    while (true) {
      if (signal?.aborted) throw new Error("source read aborted");
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > expectedBytes || total > maximumBytes) {
        await reader.cancel();
        throw new Error("source response exceeded budget");
      }
      chunks.push(chunk.value);
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
  if (total !== expectedBytes) throw new Error("source length mismatch");

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

@Injectable()
export class SupabaseThumbnailCapabilityWorker
  implements BackendCapabilityWorkerPort
{
  private readonly receipts = new Map<string, WorkerReceipt>();

  constructor(
    @Inject(BACKEND_CAPABILITY_WORKER_CONFIG)
    private readonly config: BackendCapabilityWorkerConfig,
    @Inject(BACKEND_CAPABILITY_WORKER_RUNTIME)
    private readonly runtime: BackendCapabilityWorkerRuntime,
    @Inject(SUPABASE_OBJECT_STORAGE_PORT)
    private readonly storage: SupabaseObjectStoragePort,
  ) {}

  async verifyReadiness(
    options: BackendCapabilityWorkerCallOptions = {},
  ): Promise<BackendCapabilityWorkerReadiness> {
    try {
      const readiness = await this.storage.verifyPrivatePurposeBuckets(options);
      return readiness.ready && readiness.privatePurposeBuckets === 3
        ? { ready: true, operations: ["thumbnail.render"] }
        : { ready: false, reason: "object-storage-unavailable" };
    } catch {
      return { ready: false, reason: "object-storage-unavailable" };
    }
  }

  async submit(
    input: Parameters<BackendCapabilityWorkerPort["submit"]>[0],
    options: BackendCapabilityWorkerCallOptions = {},
  ): Promise<BackendCapabilityWorkerSubmission> {
    const parsed = BackendCapabilityWorkerCommandSchema.safeParse(input);
    if (!parsed.success) return rejected("WORKER_COMMAND_INVALID", false);
    if (parsed.data.operation === "studio-ai-long") {
      return rejected("LONG_AI_QUEUE_EXECUTOR_UNAVAILABLE", true);
    }

    const key = `${parsed.data.tenantId}:${parsed.data.idempotencyKey}`;
    const fingerprint = createHash("sha256")
      .update(canonicalJsonStringify(parsed.data))
      .digest("hex");
    const existing = this.receipts.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return rejected("WORKER_IDEMPOTENCY_KEY_MISMATCH", false);
      }
      return existing.promise;
    }

    const promise = this.renderThumbnail(parsed.data, options);
    const receipt: WorkerReceipt = { fingerprint, promise, settled: false };
    this.receipts.set(key, receipt);
    void promise.finally(() => {
      receipt.settled = true;
      this.trimSettledReceipts();
    });
    const result = await promise;
    if (result.outcome === "rejected") this.receipts.delete(key);
    return result;
  }

  private trimSettledReceipts(): void {
    let settledCount = 0;
    for (const receipt of this.receipts.values()) {
      if (receipt.settled) settledCount += 1;
    }
    if (settledCount <= MAXIMUM_PROCESS_RECEIPTS) return;
    for (const [key, receipt] of this.receipts) {
      if (!receipt.settled) continue;
      this.receipts.delete(key);
      settledCount -= 1;
      if (settledCount <= MAXIMUM_PROCESS_RECEIPTS) return;
    }
  }

  private async renderThumbnail(
    command: Extract<
      Parameters<BackendCapabilityWorkerPort["submit"]>[0],
      { operation: "thumbnail.render" }
    >,
    options: BackendCapabilityWorkerCallOptions,
  ): Promise<BackendCapabilityWorkerSubmission> {
    const source = command.sourceObject;
    if (
      source.byteLength > this.config.maximumSourceBytes ||
      (source.contentType !== "image/png" && source.contentType !== "image/jpeg")
    ) {
      return rejected("THUMBNAIL_SOURCE_BUDGET_EXCEEDED", false);
    }

    try {
      const signed = await this.storage.createSignedReadUrl(
        {
          object: source,
          expiresInSeconds: this.config.signedUrlTtlSeconds,
        },
        options,
      );
      const response = await this.runtime.fetch(signed.url, {
        method: "GET",
        headers: { accept: source.contentType },
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: options.signal,
      });
      const responseType = (response.headers.get("content-type") ?? "")
        .toLowerCase()
        .split(";")[0]
        .trim();
      if (
        !response.ok ||
        response.redirected ||
        responseType !== source.contentType
      ) {
        await response.body?.cancel().catch(() => undefined);
        return rejected("THUMBNAIL_SOURCE_UNAVAILABLE", true);
      }

      const sourceBytes = await readExactResponseBytes(
        response,
        source.byteLength,
        this.config.maximumSourceBytes,
        options.signal,
      );
      const digest = `sha256:${createHash("sha256")
        .update(sourceBytes)
        .digest("hex")}`;
      if (digest !== source.digest) {
        return rejected("THUMBNAIL_SOURCE_INTEGRITY_MISMATCH", false);
      }

      const dimensions = readEncodedImageDimensions(sourceBytes);
      const sourcePixels = dimensions
        ? boundedPixelCount(dimensions.width, dimensions.height)
        : null;
      if (
        !dimensions ||
        dimensions.format !== (source.contentType === "image/png" ? "png" : "jpeg") ||
        sourcePixels === null ||
        sourcePixels > this.config.maximumSourcePixels
      ) {
        return rejected("THUMBNAIL_SOURCE_DIMENSIONS_INVALID", false);
      }

      const scale = Math.min(
        1,
        command.maxWidth / dimensions.width,
        command.maxHeight / dimensions.height,
      );
      const width = Math.max(1, Math.floor(dimensions.width * scale));
      const height = Math.max(1, Math.floor(dimensions.height * scale));
      const outputPixels = boundedPixelCount(width, height);
      if (
        outputPixels === null ||
        outputPixels > this.config.maximumOutputPixels
      ) {
        return rejected("THUMBNAIL_OUTPUT_BUDGET_EXCEEDED", false);
      }

      let decoded: ReturnType<typeof decode>;
      try {
        decoded = decode(sourceBytes);
      } catch {
        return rejected("THUMBNAIL_SOURCE_DECODE_INVALID", false);
      }
      if (
        decoded.width !== dimensions.width ||
        decoded.height !== dimensions.height
      ) {
        return rejected("THUMBNAIL_SOURCE_DIMENSIONS_INVALID", false);
      }
      const resized =
        decoded.width === width && decoded.height === height
          ? decoded
          : decoded.resize({ width, height, interpolationType: "bilinear" });
      let outputBytes: Uint8Array<ArrayBuffer>;
      try {
        const encoded =
          command.format === "png"
            ? encodePng(resized)
            : encodeJpeg(resized, { quality: 85 });
        outputBytes = new Uint8Array(encoded.byteLength);
        outputBytes.set(encoded);
      } catch {
        return rejected("THUMBNAIL_OUTPUT_ENCODING_FAILED", false);
      }
      if (outputBytes.byteLength > this.config.maximumOutputBytes) {
        return rejected("THUMBNAIL_OUTPUT_BUDGET_EXCEEDED", false);
      }

      const contentType =
        command.format === "png" ? "image/png" : "image/jpeg";
      const object = await this.storage.uploadImmutable(
        {
          purpose: "derived",
          contentType,
          bytes: outputBytes,
          controlMetadata: {
            documentId: command.tenantId,
            operationId: command.idempotencyKey,
            labels: {
              kind: "thumbnail",
              sourceAssetId: command.sourceAssetId,
              sourceDigest: source.digest,
              width,
              height,
            },
          },
        },
        options,
      );
      return BackendCapabilityWorkerSubmissionSchema.parse({
        outcome: "completed",
        result: {
          operation: "thumbnail.render",
          sourceAssetId: command.sourceAssetId,
          format: command.format,
          width,
          height,
          object,
        },
      });
    } catch (error) {
      if (options.signal?.aborted) {
        return rejected("THUMBNAIL_EXECUTION_ABORTED", true);
      }
      if (error instanceof SupabaseObjectStorageError) {
        return rejected("THUMBNAIL_OBJECT_STORAGE_UNAVAILABLE", true);
      }
      return rejected("THUMBNAIL_EXECUTION_FAILED", true);
    }
  }
}
