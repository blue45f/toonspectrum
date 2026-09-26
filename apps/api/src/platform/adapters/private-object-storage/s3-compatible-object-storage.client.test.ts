import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  S3CompatibleObjectStorageError,
  S3CompatiblePrivateObjectStoragePort,
  type S3CompatibleObjectStorageRuntime,
} from "./s3-compatible-object-storage.client";
import { PRIVATE_OBJECT_STORAGE_LEGACY_CONTRACT_VERSION } from "./private-object-storage.contract";

import type { S3CompatibleObjectStorageConfig } from "./private-object-storage.config";
import type { PrivateObjectReference } from "./private-object-storage.contract";

const config: S3CompatibleObjectStorageConfig = {
  providerId: "cloudflare-r2",
  endpoint: "https://account.r2.example",
  region: "auto",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key-with-enough-length",
  buckets: {
    source: "source-assets",
    derived: "derived-assets",
    export: "export-assets",
  },  timeoutMs: 100,
  maximumAssetBytes: 1_024 * 1_024,
  maximumControlMetadataBytes: 4 * 1_024,
};

const now = Date.UTC(2026, 8, 14, 6, 0, 0);
const controlMetadata = {
  documentId: "work:123",
  operationId: "upload:456",
  labels: { role: "line-art", revision: 7 },
} as const;

function createClient(
  implementation: S3CompatibleObjectStorageRuntime["fetch"],
) {
  const fetchMock = vi.fn<S3CompatibleObjectStorageRuntime["fetch"]>(implementation);
  return {
    client: new S3CompatiblePrivateObjectStoragePort(config, {
      fetch: fetchMock,
      now: () => now,
    }),
    fetchMock,
  };
}

function objectReference(  purpose: "source" | "derived" | "export" = "derived",
  hash = "b".repeat(64),
  byteLength = 128,
  contentType = "image/webp",
): PrivateObjectReference {
  return {
    contractVersion: PRIVATE_OBJECT_STORAGE_LEGACY_CONTRACT_VERSION,
    purpose,
    digest: `sha256:${hash}`,
    objectPath: `sha256/${hash.slice(0, 2)}/${hash}`,
    byteLength,
    contentType,
  };
}

function exactHeaders(object: PrivateObjectReference): HeadersInit {
  return {
    "content-length": String(object.byteLength),
    "content-type": object.contentType,
    "cache-control": "private, max-age=31536000, immutable",
    "x-amz-meta-toonspectrum-contract": object.contractVersion,
    "x-amz-meta-toonspectrum-purpose": object.purpose,
    "x-amz-meta-toonspectrum-digest": object.digest,
    "x-amz-meta-toonspectrum-byte-length": String(object.byteLength),
    "x-amz-meta-toonspectrum-control": Buffer.from(      JSON.stringify(controlMetadata),
      "utf8",
    ).toString("base64url"),
  };
}

describe("S3-compatible private object storage", () => {
  it("uploads exact immutable bytes with a bounded SigV4 request", async () => {
    const bytes = new Uint8Array([0, 255, 17, 33, 0, 128]);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const object = objectReference("source", hash, bytes.byteLength, "image/png");
    const { client, fetchMock } = createClient(async () =>
      new Response(null, { status: 201 }),
    );

    await expect(client.uploadImmutable({
      purpose: "source",
      contentType: "image/png",
      bytes,
      controlMetadata,
    })).resolves.toEqual(object);

    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(input)).toBe(
      `${config.endpoint}/${config.buckets.source}/${object.objectPath}`,    );
    expect(init).toMatchObject({ method: "PUT", cache: "no-store", redirect: "error" });
    expect(Array.from(init?.body as Uint8Array)).toEqual(Array.from(bytes));
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 /u);
    expect(headers.get("if-none-match")).toBe("*");
    expect(headers.get("x-amz-content-sha256")).toBe(hash);
  });

  it("accepts an exact object after a conditional upload conflict", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const object = objectReference("derived", hash, bytes.byteLength);
    const { client, fetchMock } = createClient(async (_input, init) =>
      init?.method === "PUT"
        ? new Response(null, { status: 409 })
        : new Response(null, { status: 200, headers: exactHeaders(object) }),
    );

    await expect(client.uploadImmutable({
      purpose: "derived",
      contentType: "image/webp",
      bytes,
      controlMetadata,
    })).resolves.toEqual(object);    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual([
      "PUT",
      "HEAD",
    ]);
  });

  it("fails closed when conflict metadata is inconsistent", async () => {
    const bytes = new Uint8Array([9, 8, 7]);
    const { client } = createClient(async (_input, init) =>
      init?.method === "PUT"
        ? new Response(null, { status: 412 })
        : new Response(null, {
            status: 200,
            headers: { ...exactHeaders(objectReference()), "content-length": "1" },
          }),
    );

    const result = client.uploadImmutable({
      purpose: "derived",
      contentType: "image/webp",
      bytes,
      controlMetadata,
    });
    await expect(result).rejects.toBeInstanceOf(S3CompatibleObjectStorageError);
    await expect(result).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("verifies every configured private-purpose bucket", async () => {
    const { client, fetchMock } = createClient(async () =>
      new Response(null, { status: 200 }),
    );

    await expect(client.verifyPrivatePurposeBuckets()).resolves.toEqual({
      ready: true,
      privatePurposeBuckets: 3,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("creates a bounded signed URL without a remote request", async () => {
    const object = objectReference("export");
    const { client, fetchMock } = createClient(async () =>
      new Response(null, { status: 500 }),
    );

    const result = await client.createSignedReadUrl({
      object,
      expiresInSeconds: 60,
    });
    const url = new URL(result.url);
    expect(url.origin + url.pathname).toBe(
      `${config.endpoint}/${config.buckets.export}/${object.objectPath}`,    );
    expect(url.searchParams.get("X-Amz-Expires")).toBe("60");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.expiresAtEpochMs).toBe(now + 60_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes generated objects but never source objects", async () => {
    const { client, fetchMock } = createClient(async () =>
      new Response(null, { status: 404 }),
    );

    await expect(client.deleteGeneratedObject({
      object: objectReference("derived"),
    })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();

    const result = client.deleteGeneratedObject({
      object: objectReference("source"),
    });
    await expect(result).rejects.toBeInstanceOf(S3CompatibleObjectStorageError);
    await expect(result).rejects.toMatchObject({ code: "SOURCE_DELETE_FORBIDDEN" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
