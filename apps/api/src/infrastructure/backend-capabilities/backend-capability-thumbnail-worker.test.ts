import { createHash } from "node:crypto";

import { Image, decode, encodePng } from "image-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  SupabaseThumbnailCapabilityWorker,
  type BackendCapabilityWorkerRuntime,
} from "./backend-capability-thumbnail-worker";

import type { BackendCapabilityWorkerConfig } from "./backend-capability-worker.config";
import type { SupabaseObjectStoragePort } from "../supabase-object-storage/supabase-object-storage.port";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const config: BackendCapabilityWorkerConfig = {
  maximumSourceBytes: 1_048_576,
  maximumSourcePixels: 1_048_576,
  maximumOutputPixels: 1_048_576,
  maximumOutputBytes: 1_048_576,
  signedUrlTtlSeconds: 60,
};

describe("Supabase thumbnail capability worker", () => {
  const sourceBytes = encodePng(
    new Image(4, 2, {
      colorModel: "RGBA",
      bitDepth: 8,
      data: Uint8Array.from(
        Array.from({ length: 4 * 2 }, (_, index) => [
          index * 20,
          120,
          220,
          255,
        ]).flat(),
      ),
    }),
  );
  const sourceDigest = sha256(sourceBytes);
  const sourceObject = {
    contractVersion: "toonspectrum.supabase-object-storage.v1" as const,
    purpose: "source" as const,
    digest: `sha256:${sourceDigest}` as const,
    objectPath: `sha256/${sourceDigest.slice(0, 2)}/${sourceDigest}` as const,
    byteLength: sourceBytes.byteLength,
    contentType: "image/png",
  };
  const storage = {
    verifyPrivatePurposeBuckets: vi.fn(),
    createSignedReadUrl: vi.fn(),
    uploadImmutable: vi.fn(),
    deleteGeneratedObject: vi.fn(),
  };
  const runtime: BackendCapabilityWorkerRuntime = {
    fetch: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    storage.verifyPrivatePurposeBuckets.mockResolvedValue({
      ready: true,
      privatePurposeBuckets: 3,
    });
    storage.createSignedReadUrl.mockResolvedValue({
      url: "https://storage.example.test/signed/source",
      expiresAtEpochMs: Date.now() + 60_000,
    });
    vi.mocked(runtime.fetch).mockResolvedValue(
      new Response(Buffer.from(sourceBytes), {
        status: 200,
        headers: {
          "content-length": String(sourceBytes.byteLength),
          "content-type": "image/png",
        },
      }),
    );
    storage.uploadImmutable.mockImplementation(async (input: { bytes: Uint8Array }) => {
      const digest = sha256(input.bytes);
      return {
        contractVersion: "toonspectrum.supabase-object-storage.v1",
        purpose: "derived",
        digest: `sha256:${digest}`,
        objectPath: `sha256/${digest.slice(0, 2)}/${digest}`,
        byteLength: input.bytes.byteLength,
        contentType: "image/png",
      };
    });
  });

  function worker(): SupabaseThumbnailCapabilityWorker {
    return new SupabaseThumbnailCapabilityWorker(
      config,
      runtime,
      storage as unknown as SupabaseObjectStoragePort,
    );
  }

  const command = {
    operation: "thumbnail.render" as const,
    tenantId: "tenant-1",
    idempotencyKey: "thumbnail-command-1",
    sourceAssetId: "asset-1",
    sourceObject,
    format: "png" as const,
    maxWidth: 2,
    maxHeight: 2,
  };

  it("reads an exact immutable source, resizes it and uploads a derived object", async () => {
    const result = await worker().submit(command);

    expect(result).toMatchObject({
      outcome: "completed",
      result: {
        operation: "thumbnail.render",
        sourceAssetId: "asset-1",
        width: 2,
        height: 1,
        format: "png",
        object: { purpose: "derived", contentType: "image/png" },
      },
    });
    const upload = storage.uploadImmutable.mock.calls[0]?.[0];
    expect(upload).toMatchObject({
      purpose: "derived",
      contentType: "image/png",
      controlMetadata: {
        documentId: "tenant-1",
        operationId: "thumbnail-command-1",
      },
    });
    const decoded = decode(upload.bytes);
    expect([decoded.width, decoded.height]).toEqual([2, 1]);
  });

  it("deduplicates concurrent and repeated work by immutable command fingerprint", async () => {
    const subject = worker();
    const [first, second] = await Promise.all([
      subject.submit(command),
      subject.submit(command),
    ]);
    const third = await subject.submit(command);

    expect(first).toEqual(second);
    expect(third).toEqual(first);
    expect(runtime.fetch).toHaveBeenCalledTimes(1);
    expect(storage.uploadImmutable).toHaveBeenCalledTimes(1);
    await expect(
      subject.submit({ ...command, maxWidth: 3 }),
    ).resolves.toMatchObject({
      outcome: "rejected",
      errorCode: "WORKER_IDEMPOTENCY_KEY_MISMATCH",
      retryable: false,
    });
  });

  it("never evicts in-flight idempotency receipts under a large pending burst", async () => {
    storage.createSignedReadUrl.mockImplementation(
      async () => new Promise<never>(() => undefined),
    );
    const subject = worker();
    for (let index = 0; index < 1_025; index += 1) {
      void subject.submit({
        ...command,
        idempotencyKey: `thumbnail-pending-${String(index).padStart(4, "0")}`,
        sourceAssetId: `asset-${index}`,
      });
    }

    await expect(subject.submit({
      ...command,
      idempotencyKey: "thumbnail-pending-0000",
      sourceAssetId: "asset-0",
      maxWidth: 3,
    })).resolves.toMatchObject({
      outcome: "rejected",
      errorCode: "WORKER_IDEMPOTENCY_KEY_MISMATCH",
      retryable: false,
    });
    expect(storage.createSignedReadUrl).toHaveBeenCalledTimes(1_025);
  });

  it("fails closed on integrity mismatch and unsupported long AI queue work", async () => {
    const subject = worker();
    await expect(
      subject.submit({
        ...command,
        idempotencyKey: "thumbnail-command-2",
        sourceObject: {
          ...sourceObject,
          digest: `sha256:${"0".repeat(64)}`,
          objectPath: `sha256/00/${"0".repeat(64)}`,
        },
      }),
    ).resolves.toMatchObject({
      outcome: "rejected",
      errorCode: "THUMBNAIL_SOURCE_INTEGRITY_MISMATCH",
      retryable: false,
    });
    await expect(
      subject.submit({
        operation: "studio-ai-long",
        tenantId: "tenant-1",
        idempotencyKey: "long-ai-command-1",
        jobType: "image-sequence",
        task: { prompt: "scene" },
      }),
    ).resolves.toMatchObject({
      outcome: "rejected",
      errorCode: "LONG_AI_QUEUE_EXECUTOR_UNAVAILABLE",
      retryable: true,
    });
  });
});
