import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  SupabaseObjectStorageError,
  SupabaseRestObjectStoragePort,
  type SupabaseObjectStorageRuntime,
} from "./supabase-object-storage.client";
import { SUPABASE_OBJECT_STORAGE_CONTRACT_VERSION } from "./supabase-object-storage.contract";

import type { SupabaseObjectStorageConfig } from "./supabase-object-storage.config";
import type { SupabaseObjectReference } from "./supabase-object-storage.contract";

const serviceRoleKey =
  "private-service-role-key-with-at-least-thirty-two-characters";
const config: SupabaseObjectStorageConfig = {
  projectUrl: "https://project.example",
  serviceRoleKey,
  buckets: {
    source: "toon-source-assets",
    derived: "toon-derived-assets",
    export: "toon-export-assets",
  },
  timeoutMs: 100,
  maximumAssetBytes: 1_024 * 1_024,
  maximumControlMetadataBytes: 4 * 1_024,
  maximumResponseBytes: 64 * 1_024,
};

const controlMetadata = {
  documentId: "work:123",
  operationId: "upload:456",
  labels: { role: "line-art", revision: 7 },
} as const;

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function createClient(
  implementation: SupabaseObjectStorageRuntime["fetch"],
  clientConfig: SupabaseObjectStorageConfig = config,
  now = Date.UTC(2026, 6, 31, 12, 0, 0)
): {
  client: SupabaseRestObjectStoragePort;
  fetchMock: ReturnType<
    typeof vi.fn<SupabaseObjectStorageRuntime["fetch"]>
  >;
} {
  const fetchMock =
    vi.fn<SupabaseObjectStorageRuntime["fetch"]>(implementation);
  return {
    client: new SupabaseRestObjectStoragePort(clientConfig, {
      fetch: fetchMock,
      now: () => now,
    }),
    fetchMock,
  };
}

function objectReference(
  purpose: "source" | "derived" | "export" = "derived"
): SupabaseObjectReference {
  const hash = "b".repeat(64);
  return {
    contractVersion: SUPABASE_OBJECT_STORAGE_CONTRACT_VERSION,
    purpose,
    digest: `sha256:${hash}`,
    objectPath: `sha256/bb/${hash}`,
    byteLength: 128,
    contentType: "image/webp",
  };
}

describe("Supabase REST object storage port", () => {
  it("uploads exact bytes to an immutable SHA-256 path without overwrite or transform", async () => {
    const bytes = new Uint8Array([0, 255, 17, 33, 0, 128]);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const path = `sha256/${hash.slice(0, 2)}/${hash}`;
    const bucket = config.buckets.source;
    const { client, fetchMock } = createClient(async () =>
      jsonResponse({ Id: "object-id", Key: `${bucket}/${path}` })
    );

    const result = await client.uploadImmutable({
      purpose: "source",
      contentType: "image/png",
      bytes,
      controlMetadata,
    });

    expect(result).toEqual({
      contractVersion: SUPABASE_OBJECT_STORAGE_CONTRACT_VERSION,
      purpose: "source",
      digest: `sha256:${hash}`,
      objectPath: path,
      byteLength: bytes.byteLength,
      contentType: "image/png",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      `${config.projectUrl}/storage/v1/object/${bucket}/${path}`
    );
    expect(init).toMatchObject({
      method: "POST",
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });

    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe(
      `Bearer ${serviceRoleKey}`
    );
    expect(headers.get("apikey")).toBe(serviceRoleKey);
    expect(headers.get("x-upsert")).toBe("false");
    expect(headers.get("content-type")).toBe("image/png");
    expect(headers.get("content-length")).toBe(String(bytes.byteLength));
    expect(Buffer.from(init?.body as ArrayBuffer)).toEqual(
      Buffer.from(bytes)
    );

    const metadata = JSON.parse(
      Buffer.from(headers.get("x-metadata") ?? "", "base64").toString(
        "utf8"
      )
    ) as Record<string, unknown>;
    expect(metadata).toMatchObject({
      contractVersion: SUPABASE_OBJECT_STORAGE_CONTRACT_VERSION,
      purpose: "source",
      digest: `sha256:${hash}`,
      byteLength: bytes.byteLength,
      control: controlMetadata,
    });
    expect(metadata).not.toHaveProperty("bytes");
    expect(JSON.stringify(result)).not.toContain(serviceRoleKey);
    expect(result).not.toHaveProperty("bucket");
    expect(result).not.toHaveProperty("projectUrl");
  });

  it("adopts an exact existing immutable object after a concurrent create rejection", async () => {
    const bytes = new Uint8Array([5, 4, 3, 2, 1]);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const path = `sha256/${hash.slice(0, 2)}/${hash}`;
    const bucket = config.buckets.derived;
    const { client, fetchMock } = createClient(async (_input, init) => {
      if (init?.method === "POST") {
        return jsonResponse(
          { statusCode: "409", error: "Duplicate", message: "Asset Already Exists" },
          { status: 409 },
        );
      }
      return jsonResponse({
        name: path,
        bucket_id: bucket,
        size: bytes.byteLength,
        content_type: "image/png",
        cache_control: "max-age=31536000, immutable",
        metadata: {
          contractVersion: SUPABASE_OBJECT_STORAGE_CONTRACT_VERSION,
          purpose: "derived",
          digest: `sha256:${hash}`,
          byteLength: bytes.byteLength,
          // The first uploader may belong to another work. Identity adoption validates the
          // content contract while keeping request-control metadata opaque and well formed.
          control: {
            documentId: "work:other",
            operationId: "derived-upload:other",
          },
        },
      });
    });

    await expect(client.uploadImmutable({
      purpose: "derived",
      contentType: "image/png",
      bytes,
      controlMetadata,
    })).resolves.toEqual({
      contractVersion: SUPABASE_OBJECT_STORAGE_CONTRACT_VERSION,
      purpose: "derived",
      digest: `sha256:${hash}`,
      objectPath: path,
      byteLength: bytes.byteLength,
      contentType: "image/png",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${config.projectUrl}/storage/v1/object/info/authenticated/${bucket}/${path}`,
    );

    const mismatched = createClient(async (_input, init) =>
      init?.method === "POST"
        ? jsonResponse({ message: "Asset Already Exists" }, { status: 400 })
        : jsonResponse({
            name: path,
            bucket_id: bucket,
            size: bytes.byteLength + 1,
            content_type: "image/png",
            cache_control: "max-age=31536000, immutable",
            metadata: {
              contractVersion: SUPABASE_OBJECT_STORAGE_CONTRACT_VERSION,
              purpose: "derived",
              digest: `sha256:${hash}`,
              byteLength: bytes.byteLength,
              control: controlMetadata,
            },
          })
    ).client;
    await expect(mismatched.uploadImmutable({
      purpose: "derived",
      contentType: "image/png",
      bytes,
      controlMetadata,
    })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("uses one stable snapshot when SharedArrayBuffer-backed caller bytes mutate", async () => {
    const sharedBuffer = new SharedArrayBuffer(4);
    const callerBytes = new Uint8Array(sharedBuffer);
    callerBytes.set([1, 2, 3, 4]);
    const initiallyAdmittedBytes = Buffer.from(callerBytes);
    const expectedHash = createHash("sha256")
      .update(initiallyAdmittedBytes)
      .digest("hex");
    const expectedPath =
      `sha256/${expectedHash.slice(0, 2)}/${expectedHash}`;
    let callerByteLengthReads = 0;
    Object.defineProperty(callerBytes, "byteLength", {
      configurable: true,
      get: () => {
        callerByteLengthReads += 1;
        // The previous implementation observed caller-owned byteLength three times and hashed
        // before this mutation but uploaded afterward, producing a digest/body mismatch.
        if (callerByteLengthReads === 3) callerBytes.fill(9);
        return sharedBuffer.byteLength;
      },
    });

    let uploadedBytes: Buffer | undefined;
    const bucket = config.buckets.source;
    const { client } = createClient(async (input, init) => {
      // A caller may mutate its shared memory as soon as the asynchronous upload has begun.
      callerBytes.fill(7);
      uploadedBytes = Buffer.from(init?.body as Uint8Array);
      const requestPath = new URL(String(input)).pathname;
      const objectPrefix =
        `/storage/v1/object/${bucket}/`;
      const objectPath = requestPath.slice(objectPrefix.length);
      return jsonResponse({
        Id: "object-id",
        Key: `${bucket}/${objectPath}`,
      });
    });

    await expect(
      client.uploadImmutable({
        purpose: "source",
        contentType: "image/png",
        bytes: callerBytes,
        controlMetadata,
      }),
    ).resolves.toMatchObject({
      digest: `sha256:${expectedHash}`,
      objectPath: expectedPath,
      byteLength: initiallyAdmittedBytes.byteLength,
    });

    expect(callerByteLengthReads).toBe(0);
    expect([...callerBytes]).toEqual([7, 7, 7, 7]);
    expect(uploadedBytes).toEqual(initiallyAdmittedBytes);
  });

  it("rejects empty, oversized, and oversized-control uploads before fetch", async () => {
    const tinyConfig = {
      ...config,
      maximumAssetBytes: 2,
      maximumControlMetadataBytes: 128,
    };
    const { client, fetchMock } = createClient(
      async () => jsonResponse({}),
      tinyConfig
    );

    await expect(
      client.uploadImmutable({
        purpose: "source",
        contentType: "image/png",
        bytes: new Uint8Array(),
        controlMetadata,
      })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      client.uploadImmutable({
        purpose: "source",
        contentType: "image/png",
        bytes: new Uint8Array([1, 2, 3]),
        controlMetadata,
      })
    ).rejects.toMatchObject({ code: "ASSET_TOO_LARGE" });
    await expect(
      client.uploadImmutable({
        purpose: "source",
        contentType: "image/png",
        bytes: new Uint8Array([1]),
        controlMetadata,
      })
    ).rejects.toMatchObject({
      code: "CONTROL_METADATA_TOO_LARGE",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a private, exact-object signed URL without transform options", async () => {
    const object = objectReference("export");
    const bucket = config.buckets.export;
    const signedPath = `/object/sign/${bucket}/${object.objectPath}`;
    const now = Date.UTC(2026, 6, 31, 12, 0, 0);
    const { client, fetchMock } = createClient(
      async () =>
        jsonResponse({
          signedURL: `${signedPath}?token=${"t".repeat(64)}`,
        }),
      config,
      now
    );

    await expect(
      client.createSignedReadUrl({
        object,
        expiresInSeconds: 900,
      })
    ).resolves.toEqual({
      url: `${config.projectUrl}/storage/v1${signedPath}?token=${"t".repeat(
        64
      )}`,
      expiresAtEpochMs: now + 900_000,
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      expiresIn: 900,
    });
    expect(String(init?.body)).not.toContain("transform");
    expect(String(init?.body)).not.toContain("download");
  });

  it.each([
    "https://attacker.example/object/sign/path?token=unsafe",
    "/object/sign/wrong-bucket/path?token=unsafeunsafeunsafe",
    `/object/sign/${config.buckets.derived}/${objectReference().objectPath}?token=short`,
    `/object/sign/${config.buckets.derived}/${objectReference().objectPath}?token=${"t".repeat(
      64
    )}&width=64`,
  ])("rejects an untrusted signed URL response: %s", async (signedURL) => {
    const { client } = createClient(async () =>
      jsonResponse({ signedURL })
    );

    await expect(
      client.createSignedReadUrl({
        object: objectReference(),
        expiresInSeconds: 60,
      })
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("fails closed for source deletion and deletes only exact generated paths", async () => {
    const source = objectReference("source");
    const derived = objectReference("derived");
    const { client, fetchMock } = createClient(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as {
        prefixes: string[];
      };
      return jsonResponse([{ name: body.prefixes[0] }]);
    });

    await expect(
      client.deleteGeneratedObject({ object: source })
    ).rejects.toMatchObject({ code: "SOURCE_DELETE_FORBIDDEN" });
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(
      client.deleteGeneratedObject({ object: derived })
    ).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      `${config.projectUrl}/storage/v1/object/${config.buckets.derived}`
    );
    expect(init?.method).toBe("DELETE");
    expect(JSON.parse(String(init?.body))).toEqual({
      prefixes: [derived.objectPath],
    });

    const alreadyAbsent = createClient(async () => jsonResponse([])).client;
    await expect(
      alreadyAbsent.deleteGeneratedObject({ object: derived })
    ).resolves.toBeUndefined();
  });

  it("verifies that all purpose buckets are distinct, present, and private", async () => {
    const { client, fetchMock } = createClient(async (url) => {
      const name = decodeURIComponent(
        String(url).split("/").at(-1) ?? ""
      );
      return jsonResponse({ id: name, name, public: false });
    });

    await expect(client.verifyPrivatePurposeBuckets()).resolves.toEqual({
      ready: true,
      privatePurposeBuckets: 3,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const publicClient = createClient(async (url) => {
      const name = decodeURIComponent(
        String(url).split("/").at(-1) ?? ""
      );
      return jsonResponse({
        id: name,
        name,
        public: name === config.buckets.source,
      });
    }).client;
    await expect(
      publicClient.verifyPrivatePurposeBuckets()
    ).rejects.toMatchObject({ code: "BUCKET_POLICY_INVALID" });
  });

  it("honors caller abort and internal timeout across the remote operation", async () => {
    const never = async (
      _input: string | URL | Request,
      init?: RequestInit
    ): Promise<Response> =>
      await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new Error("aborted remote request")),
          { once: true }
        );
      });
    const abortController = new AbortController();
    abortController.abort();
    const { client } = createClient(never, {
      ...config,
      timeoutMs: 10,
    });

    await expect(
      client.verifyPrivatePurposeBuckets({
        signal: abortController.signal,
      })
    ).rejects.toMatchObject({ code: "ABORTED" });
    await expect(
      client.verifyPrivatePurposeBuckets()
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("bounds remote metadata and sanitizes transport errors", async () => {
    const oversized = createClient(
      async () =>
        jsonResponse(
          { signedURL: "x".repeat(1_024) },
          { headers: { "content-length": "10000" } }
        ),
      { ...config, maximumResponseBytes: 1_024 }
    ).client;
    await expect(
      oversized.createSignedReadUrl({
        object: objectReference(),
        expiresInSeconds: 60,
      })
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });

    const transportFailure = createClient(async () => {
      throw new Error(
        `${serviceRoleKey} ${config.projectUrl} upstream diagnostics`
      );
    }).client;
    let captured: unknown;
    try {
      await transportFailure.verifyPrivatePurposeBuckets();
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(SupabaseObjectStorageError);
    expect(String(captured)).toBe(
      "SupabaseObjectStorageError: Supabase object storage failed: REMOTE_UNAVAILABLE."
    );
    expect(String(captured)).not.toContain(serviceRoleKey);
    expect(String(captured)).not.toContain(config.projectUrl);
  });

  it("rejects references whose path does not match their digest", async () => {
    const object = {
      ...objectReference(),
      objectPath: `sha256/cc/${"c".repeat(64)}`,
    } as SupabaseObjectReference;
    const { client, fetchMock } = createClient(async () =>
      jsonResponse({})
    );

    await expect(
      client.createSignedReadUrl({
        object,
        expiresInSeconds: 60,
      })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
