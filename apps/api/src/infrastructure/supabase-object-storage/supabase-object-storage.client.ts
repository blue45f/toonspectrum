import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";

import {
  CreateSupabaseSignedReadUrlSchema,
  DeleteSupabaseObjectSchema,
  SUPABASE_OBJECT_STORAGE_CONTRACT_VERSION,
  SupabaseObjectControlMetadataSchema,
  SupabaseObjectPurposeSchema,
  SupabaseObjectReferenceSchema,
  UploadSupabaseObjectSchema,
  type CreateSupabaseSignedReadUrl,
  type DeleteSupabaseObject,
  type SupabaseObjectPurpose,
  type SupabaseObjectReference,
  type SupabaseSignedReadUrl,
  type UploadSupabaseObject,
} from "./supabase-object-storage.contract";

import type { SupabaseObjectStorageConfig } from "./supabase-object-storage.config";
import type {
  SupabaseObjectStorageCallOptions,
  SupabaseObjectStoragePort,
  SupabaseObjectStorageReadiness,
} from "./supabase-object-storage.port";

export const SUPABASE_OBJECT_STORAGE_CONFIG = Symbol(
  "SUPABASE_OBJECT_STORAGE_CONFIG"
);
export const SUPABASE_OBJECT_STORAGE_RUNTIME = Symbol(
  "SUPABASE_OBJECT_STORAGE_RUNTIME"
);

export interface SupabaseObjectStorageRuntime {
  readonly fetch: (
    input: string | URL | Request,
    init?: RequestInit
  ) => Promise<Response>;
  readonly now: () => number;
}

export type SupabaseObjectStorageFailureCode =
  | "ABORTED"
  | "INVALID_INPUT"
  | "ASSET_TOO_LARGE"
  | "CONTROL_METADATA_TOO_LARGE"
  | "TIMEOUT"
  | "REMOTE_UNAVAILABLE"
  | "REMOTE_REJECTED"
  | "INVALID_RESPONSE"
  | "BUCKET_POLICY_INVALID"
  | "SOURCE_DELETE_FORBIDDEN";

export class SupabaseObjectStorageError extends Error {
  constructor(readonly code: SupabaseObjectStorageFailureCode) {
    super(`Supabase object storage failed: ${code}.`);
    this.name = "SupabaseObjectStorageError";
  }
}

const UploadResponseSchema = z
  .object({
    Id: z.string().min(1).max(512),
    Key: z.string().min(1).max(1_024),
  })
  .strip();

const SignedUrlResponseSchema = z
  .object({
    signedURL: z.string().min(1).max(16_384),
  })
  .strip();

const DeletedObjectSchema = z
  .object({
    name: z.string().min(1).max(1_024),
  })
  .strip();

const DeletedObjectsResponseSchema = z.array(DeletedObjectSchema).max(1_000);

const StoredObjectControlMetadataSchema = z
  .object({
    contractVersion: z.literal(SUPABASE_OBJECT_STORAGE_CONTRACT_VERSION),
    purpose: SupabaseObjectPurposeSchema,
    digest: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    byteLength: z.number().int().min(1),
    control: SupabaseObjectControlMetadataSchema,
  })
  .strict();

const ObjectInfoResponseSchema = z
  .object({
    name: z.string().min(1).max(1_024),
    bucket_id: z.string().min(1).max(128),
    size: z.number().int().min(1),
    content_type: z.string().min(3).max(160),
    cache_control: z.string().min(1).max(512),
    metadata: StoredObjectControlMetadataSchema,
  })
  .strip();

const BucketResponseSchema = z
  .object({
    id: z.string().min(1).max(128),
    name: z.string().min(1).max(128),
    public: z.boolean(),
  })
  .strip();

interface RemoteRequest {
  readonly path: string;
  readonly method: "DELETE" | "GET" | "POST";
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: BodyInit;
}

function encodedPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

async function cancelResponse(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Discarding an untrusted remote body is best-effort.
  }
}

function readStreamChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) {
    return Promise.reject(new SupabaseObjectStorageError("ABORTED"));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      action();
    };
    const onAbort = () => {
      void reader.cancel().catch(() => undefined);
      finish(() =>
        reject(new SupabaseObjectStorageError("ABORTED"))
      );
    };

    signal.addEventListener("abort", onAbort, { once: true });
    reader.read().then(
      (result) => finish(() => resolve(result)),
      () =>
        finish(() =>
          reject(new SupabaseObjectStorageError("INVALID_RESPONSE"))
        )
    );
  });
}

async function readBoundedJson(
  response: Response,
  maximumBytes: number,
  signal: AbortSignal
): Promise<unknown> {
  const declared = response.headers.get("content-length");
  if (declared && /^\d+$/u.test(declared)) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length > maximumBytes) {
      await cancelResponse(response);
      throw new SupabaseObjectStorageError("INVALID_RESPONSE");
    }
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    await cancelResponse(response);
    throw new SupabaseObjectStorageError("INVALID_RESPONSE");
  }
  if (!response.body) {
    throw new SupabaseObjectStorageError("INVALID_RESPONSE");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const chunk = await readStreamChunk(reader, signal);
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new SupabaseObjectStorageError("INVALID_RESPONSE");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch {
    throw new SupabaseObjectStorageError("INVALID_RESPONSE");
  }
}

function createObjectReference(
  input: UploadSupabaseObject
): SupabaseObjectReference {
  const hash = createHash("sha256").update(input.bytes).digest("hex");
  return {
    contractVersion: SUPABASE_OBJECT_STORAGE_CONTRACT_VERSION,
    purpose: input.purpose,
    digest: `sha256:${hash}`,
    objectPath: `sha256/${hash.slice(0, 2)}/${hash}`,
    byteLength: input.bytes.byteLength,
    contentType: input.contentType,
  };
}

function assertReferenceIntegrity(
  object: SupabaseObjectReference
): void {
  const hash = object.digest.slice("sha256:".length);
  if (object.objectPath !== `sha256/${hash.slice(0, 2)}/${hash}`) {
    throw new SupabaseObjectStorageError("INVALID_INPUT");
  }
}

@Injectable()
export class SupabaseRestObjectStoragePort
  implements SupabaseObjectStoragePort
{
  constructor(
    @Inject(SUPABASE_OBJECT_STORAGE_CONFIG)
    private readonly config: SupabaseObjectStorageConfig,
    @Inject(SUPABASE_OBJECT_STORAGE_RUNTIME)
    private readonly runtime: SupabaseObjectStorageRuntime
  ) {}

  async verifyPrivatePurposeBuckets(
    options: SupabaseObjectStorageCallOptions = {}
  ): Promise<SupabaseObjectStorageReadiness> {
    const purposes = ["source", "derived", "export"] as const;
    const buckets = await Promise.all(
      purposes.map(async (purpose) => {
        const bucket = this.bucketFor(purpose);
        const response = await this.requestJson(
          {
            method: "GET",
            path: `/bucket/${encodeURIComponent(bucket)}`,
          },
          options
        );
        const parsed = BucketResponseSchema.safeParse(response);
        if (!parsed.success) {
          throw new SupabaseObjectStorageError("INVALID_RESPONSE");
        }
        return { expected: bucket, actual: parsed.data };
      })
    );

    if (
      buckets.some(
        ({ expected, actual }) =>
          actual.public || actual.id !== expected || actual.name !== expected
      )
    ) {
      throw new SupabaseObjectStorageError("BUCKET_POLICY_INVALID");
    }

    return { ready: true, privatePurposeBuckets: 3 };
  }

  async uploadImmutable(
    input: UploadSupabaseObject,
    options: SupabaseObjectStorageCallOptions = {}
  ): Promise<SupabaseObjectReference> {
    const parsed = UploadSupabaseObjectSchema.safeParse(input);
    if (!parsed.success) {
      throw new SupabaseObjectStorageError("INVALID_INPUT");
    }

    // This request-owned copy is the exact-byte admission boundary. Never observe the caller's
    // potentially SharedArrayBuffer-backed view again: length, digest, metadata, and the upload
    // body must all describe this one stable snapshot.
    const admittedBytes = Buffer.from(parsed.data.bytes);
    if (admittedBytes.byteLength === 0) {
      throw new SupabaseObjectStorageError("INVALID_INPUT");
    }
    if (admittedBytes.byteLength > this.config.maximumAssetBytes) {
      throw new SupabaseObjectStorageError("ASSET_TOO_LARGE");
    }

    const object = createObjectReference({
      ...parsed.data,
      bytes: admittedBytes,
    });
    const controlMetadata = JSON.stringify({
      contractVersion: SUPABASE_OBJECT_STORAGE_CONTRACT_VERSION,
      purpose: object.purpose,
      digest: object.digest,
      byteLength: object.byteLength,
      control: parsed.data.controlMetadata,
    });
    if (
      byteLength(controlMetadata) >
      this.config.maximumControlMetadataBytes
    ) {
      throw new SupabaseObjectStorageError(
        "CONTROL_METADATA_TOO_LARGE"
      );
    }

    const bucket = this.bucketFor(object.purpose);
    let response: unknown;
    try {
      response = await this.requestJson(
        {
          method: "POST",
          path: `/object/${encodeURIComponent(bucket)}/${encodedPath(
            object.objectPath
          )}`,
          headers: {
            "cache-control": "max-age=31536000, immutable",
            "content-length": String(object.byteLength),
            "content-type": object.contentType,
            "x-metadata": Buffer.from(
              controlMetadata,
              "utf8"
            ).toString("base64"),
            "x-upsert": "false",
          },
          body: admittedBytes,
        },
        options
      );
    } catch (error) {
      if (
        !(error instanceof SupabaseObjectStorageError) ||
        error.code !== "REMOTE_REJECTED"
      ) {
        throw error;
      }
      // Standard Upload deliberately rejects concurrent creates with "Asset Already Exists".
      // A previous request may also have completed the remote write and failed before recording
      // the database reference. Adopt only an exact content-addressed object whose immutable
      // provider metadata proves the same digest, length, MIME type and cache policy.
      await this.assertExactRemoteObject(object, options);
      return SupabaseObjectReferenceSchema.parse(object);
    }
    const remote = UploadResponseSchema.safeParse(response);
    if (
      !remote.success ||
      remote.data.Key !== `${bucket}/${object.objectPath}`
    ) {
      throw new SupabaseObjectStorageError("INVALID_RESPONSE");
    }

    return SupabaseObjectReferenceSchema.parse(object);
  }

  async createSignedReadUrl(
    input: CreateSupabaseSignedReadUrl,
    options: SupabaseObjectStorageCallOptions = {}
  ): Promise<SupabaseSignedReadUrl> {
    const parsed = CreateSupabaseSignedReadUrlSchema.safeParse(input);
    if (!parsed.success) {
      throw new SupabaseObjectStorageError("INVALID_INPUT");
    }
    assertReferenceIntegrity(parsed.data.object);

    const bucket = this.bucketFor(parsed.data.object.purpose);
    const expectedSignedPath = `/object/sign/${encodeURIComponent(
      bucket
    )}/${encodedPath(parsed.data.object.objectPath)}`;
    const response = await this.requestJson(
      {
        method: "POST",
        path: expectedSignedPath,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expiresIn: parsed.data.expiresInSeconds,
        }),
      },
      options
    );
    const remote = SignedUrlResponseSchema.safeParse(response);
    if (!remote.success) {
      throw new SupabaseObjectStorageError("INVALID_RESPONSE");
    }

    const signedUrl = this.validateSignedUrl(
      remote.data.signedURL,
      expectedSignedPath
    );
    const now = this.runtime.now();
    const expiresAtEpochMs =
      now + parsed.data.expiresInSeconds * 1_000;
    if (
      !Number.isSafeInteger(now) ||
      now <= 0 ||
      !Number.isSafeInteger(expiresAtEpochMs)
    ) {
      throw new SupabaseObjectStorageError("INVALID_RESPONSE");
    }

    return { url: signedUrl, expiresAtEpochMs };
  }

  async deleteGeneratedObject(
    input: DeleteSupabaseObject,
    options: SupabaseObjectStorageCallOptions = {}
  ): Promise<void> {
    const parsed = DeleteSupabaseObjectSchema.safeParse(input);
    if (!parsed.success) {
      throw new SupabaseObjectStorageError("INVALID_INPUT");
    }
    assertReferenceIntegrity(parsed.data.object);
    if (parsed.data.object.purpose === "source") {
      throw new SupabaseObjectStorageError(
        "SOURCE_DELETE_FORBIDDEN"
      );
    }

    const bucket = this.bucketFor(parsed.data.object.purpose);
    const response = await this.requestJson(
      {
        method: "DELETE",
        path: `/object/${encodeURIComponent(bucket)}`,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prefixes: [parsed.data.object.objectPath],
        }),
      },
      options
    );
    const remote = DeletedObjectsResponseSchema.safeParse(response);
    if (
      !remote.success ||
      remote.data.length > 1 ||
      (remote.data.length === 1 &&
        remote.data[0]?.name !== parsed.data.object.objectPath)
    ) {
      throw new SupabaseObjectStorageError("INVALID_RESPONSE");
    }
  }

  private async assertExactRemoteObject(
    object: SupabaseObjectReference,
    options: SupabaseObjectStorageCallOptions
  ): Promise<void> {
    const bucket = this.bucketFor(object.purpose);
    const response = await this.requestJson(
      {
        method: "GET",
        path: `/object/info/authenticated/${encodeURIComponent(
          bucket
        )}/${encodedPath(object.objectPath)}`,
      },
      options
    );
    const remote = ObjectInfoResponseSchema.safeParse(response);
    if (
      !remote.success ||
      remote.data.name !== object.objectPath ||
      remote.data.bucket_id !== bucket ||
      remote.data.size !== object.byteLength ||
      remote.data.content_type !== object.contentType ||
      remote.data.cache_control !== "max-age=31536000, immutable" ||
      remote.data.metadata.contractVersion !== object.contractVersion ||
      remote.data.metadata.purpose !== object.purpose ||
      remote.data.metadata.digest !== object.digest ||
      remote.data.metadata.byteLength !== object.byteLength
    ) {
      throw new SupabaseObjectStorageError("INVALID_RESPONSE");
    }
  }

  private bucketFor(purpose: SupabaseObjectPurpose): string {
    return this.config.buckets[purpose];
  }

  private validateSignedUrl(
    value: string,
    expectedSignedPath: string
  ): string {
    if (!value.startsWith(`${expectedSignedPath}?`)) {
      throw new SupabaseObjectStorageError("INVALID_RESPONSE");
    }

    let url: URL;
    try {
      url = new URL(
        `${this.config.projectUrl}/storage/v1${value}`
      );
    } catch {
      throw new SupabaseObjectStorageError("INVALID_RESPONSE");
    }

    if (
      url.origin !== this.config.projectUrl ||
      url.username !== "" ||
      url.password !== "" ||
      url.hash !== "" ||
      url.pathname !== `/storage/v1${expectedSignedPath}`
    ) {
      throw new SupabaseObjectStorageError("INVALID_RESPONSE");
    }
    const entries = [...url.searchParams.entries()];
    const token = url.searchParams.getAll("token");
    if (
      entries.length !== 1 ||
      token.length !== 1 ||
      (token[0]?.length ?? 0) < 16 ||
      (token[0]?.length ?? 0) > 16_384
    ) {
      throw new SupabaseObjectStorageError("INVALID_RESPONSE");
    }

    return url.toString();
  }

  private async requestJson(
    request: RemoteRequest,
    options: SupabaseObjectStorageCallOptions
  ): Promise<unknown> {
    if (options.signal?.aborted) {
      throw new SupabaseObjectStorageError("ABORTED");
    }

    const controller = new AbortController();
    let timedOut = false;
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.config.timeoutMs);
    timer.unref?.();

    try {
      const response = await this.runtime.fetch(
        `${this.config.projectUrl}/storage/v1${request.path}`,
        {
          method: request.method,
          headers: {
            accept: "application/json",
            apikey: this.config.serviceRoleKey,
            authorization: `Bearer ${this.config.serviceRoleKey}`,
            "x-client-info":
              "toonspectrum-supabase-object-storage/1",
            ...request.headers,
          },
          body: request.body,
          cache: "no-store",
          credentials: "omit",
          redirect: "error",
          referrerPolicy: "no-referrer",
          signal: controller.signal,
        }
      );

      if (
        response.status < 200 ||
        response.status >= 300 ||
        response.redirected
      ) {
        await cancelResponse(response);
        throw new SupabaseObjectStorageError("REMOTE_REJECTED");
      }

      return await readBoundedJson(
        response,
        this.config.maximumResponseBytes,
        controller.signal
      );
    } catch (error) {
      if (timedOut) {
        throw new SupabaseObjectStorageError("TIMEOUT");
      }
      if (options.signal?.aborted) {
        throw new SupabaseObjectStorageError("ABORTED");
      }
      if (error instanceof SupabaseObjectStorageError) {
        throw error;
      }
      throw new SupabaseObjectStorageError("REMOTE_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    }
  }
}
