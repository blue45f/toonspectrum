import { createHash, createHmac } from "node:crypto";

import {
  CreatePrivateSignedReadUrlSchema,
  DeletePrivateObjectSchema,
  PRIVATE_OBJECT_STORAGE_CONTRACT_VERSION,
  PrivateObjectControlMetadataSchema,
  PrivateObjectPurposeSchema,
  PrivateObjectReferenceSchema,
  PrivateSignedReadUrlSchema,
  UploadPrivateObjectSchema,
  type CreatePrivateSignedReadUrl,
  type DeletePrivateObject,
  type PrivateObjectPurpose,
  type PrivateObjectReference,
  type PrivateSignedReadUrl,
  type UploadPrivateObject,
} from "./private-object-storage.contract";
import { PrivateObjectStorageError } from "./private-object-storage.error";

import type { S3CompatibleObjectStorageConfig } from "./private-object-storage.config";
import type {
  PrivateObjectStorageCallOptions,
  PrivateObjectStoragePort,
  PrivateObjectStorageReadiness,
} from "./private-object-storage.port";

export interface S3CompatibleObjectStorageRuntime {
  readonly fetch: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
  readonly now: () => number;
}

export class S3CompatibleObjectStorageError extends PrivateObjectStorageError {
  constructor(
    code: ConstructorParameters<typeof PrivateObjectStorageError>[0],
  ) {
    super(code, "S3-compatible private object storage");
    this.name = "S3CompatibleObjectStorageError";
  }
}

const EMPTY_PAYLOAD_HASH = createHash("sha256").update("").digest("hex");
const IMMUTABLE_CACHE_CONTROL = "private, max-age=31536000, immutable";
const SERVICE = "s3";
const MAXIMUM_SIGNED_URL_SECONDS = 86_400;
const METADATA_HEADERS = Object.freeze({
  contract: "x-amz-meta-toonspectrum-contract",
  purpose: "x-amz-meta-toonspectrum-purpose",
  digest: "x-amz-meta-toonspectrum-digest",
  byteLength: "x-amz-meta-toonspectrum-byte-length",
  control: "x-amz-meta-toonspectrum-control",
});

function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(
  key: string | Buffer,
  value: string,
  encoding?: "hex",
): Buffer | string {
  const digest = createHmac("sha256", key).update(value);
  return encoding === "hex" ? digest.digest("hex") : digest.digest();
}

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalUri(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => awsEncode(decodeURIComponent(segment)))
    .join("/");
}

function canonicalQuery(parameters: URLSearchParams): string {
  return [...parameters.entries()]
    .map(([key, value]) => [awsEncode(key), awsEncode(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey
        ? leftValue.localeCompare(rightValue)
        : leftKey.localeCompare(rightKey),
    )
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function canonicalHeaderValue(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function signedHeaderMaterial(
  headersValue: Readonly<Record<string, string>>,
): {
  readonly canonicalHeaders: string;
  readonly signedHeaders: string;
} {
  const entries = Object.entries(headersValue)
    .map(([name, value]) => [
      name.toLowerCase(),
      canonicalHeaderValue(value),
    ] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  return {
    canonicalHeaders: entries
      .map(([name, value]) => `${name}:${value}\n`)
      .join(""),
    signedHeaders: entries.map(([name]) => name).join(";"),
  };
}

function awsTimestamp(epochMs: number): {
  readonly amzDate: string;
  readonly dateStamp: string;
} {
  const iso = new Date(epochMs).toISOString();
  const dateStamp = iso.slice(0, 10).replaceAll("-", "");
  const amzDate = `${dateStamp}T${iso.slice(11, 19).replaceAll(":", "")}Z`;
  return { amzDate, dateStamp };
}

function signingKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
): Buffer {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp) as Buffer;
  const regionKey = hmac(dateKey, region) as Buffer;
  const serviceKey = hmac(regionKey, SERVICE) as Buffer;
  return hmac(serviceKey, "aws4_request") as Buffer;
}

function signature(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  stringToSign: string,
): string {
  return hmac(
    signingKey(secretAccessKey, dateStamp, region),
    stringToSign,
    "hex",
  ) as string;
}

function snapshotBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const snapshot = new Uint8Array(bytes.buffer.byteLength === 0 ? 0 : bytes.byteLength);
  snapshot.set(bytes);
  return snapshot;
}

function assertReferenceIntegrity(
  value: PrivateObjectReference,
): PrivateObjectReference {
  const object = PrivateObjectReferenceSchema.parse(value);
  const hash = object.digest.slice("sha256:".length);
  if (object.objectPath !== `sha256/${hash.slice(0, 2)}/${hash}`) {
    throw new S3CompatibleObjectStorageError("INVALID_INPUT");
  }
  return object;
}

function encodedControlMetadata(value: unknown): string {
  const parsed = PrivateObjectControlMetadataSchema.parse(value);
  return Buffer.from(JSON.stringify(parsed), "utf8").toString("base64url");
}

function decodedControlMetadata(value: string | null): unknown {
  if (!value || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new S3CompatibleObjectStorageError("INVALID_RESPONSE");
  }
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new S3CompatibleObjectStorageError("INVALID_RESPONSE");
  }
}

function signedRequestHeaders(
  config: S3CompatibleObjectStorageConfig,
  method: string,
  url: URL,
  headersValue: Readonly<Record<string, string>>,
  payloadHash: string,
  epochMs: number,
): Headers {
  const { amzDate, dateStamp } = awsTimestamp(epochMs);
  const headers = {
    ...Object.fromEntries(
      Object.entries(headersValue).map(([name, value]) => [
        name.toLowerCase(),
        value,
      ]),
    ),
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  const material = signedHeaderMaterial(headers);
  const canonicalRequest = [
    method,
    canonicalUri(url.pathname),
    canonicalQuery(url.searchParams),
    material.canonicalHeaders,
    material.signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${dateStamp}/${config.region}/${SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}`,
    `SignedHeaders=${material.signedHeaders}`,
    `Signature=${signature(
      config.secretAccessKey,
      dateStamp,
      config.region,
      stringToSign,
    )}`,
  ].join(", ");

  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (name !== "host") result.set(name, value);
  }
  result.set("authorization", authorization);
  return result;
}

function createPresignedUrl(
  config: S3CompatibleObjectStorageConfig,
  url: URL,
  expiresInSeconds: number,
  epochMs: number,
): URL {
  const { amzDate, dateStamp } = awsTimestamp(epochMs);
  const scope = `${dateStamp}/${config.region}/${SERVICE}/aws4_request`;
  url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  url.searchParams.set(
    "X-Amz-Credential",
    `${config.accessKeyId}/${scope}`,
  );
  url.searchParams.set("X-Amz-Date", amzDate);
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  url.searchParams.set("X-Amz-SignedHeaders", "host");

  const canonicalRequest = [
    "GET",
    canonicalUri(url.pathname),
    canonicalQuery(url.searchParams),
    `host:${url.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  url.searchParams.set(
    "X-Amz-Signature",
    signature(
      config.secretAccessKey,
      dateStamp,
      config.region,
      stringToSign,
    ),
  );
  return url;
}

async function cancelResponse(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Discarding an untrusted remote body is best-effort.
  }
}

export class S3CompatiblePrivateObjectStoragePort
  implements PrivateObjectStoragePort
{
  constructor(
    private readonly config: S3CompatibleObjectStorageConfig,
    private readonly runtime: S3CompatibleObjectStorageRuntime,
  ) {}

  private objectUrl(
    purpose: PrivateObjectPurpose,
    objectPath?: string,
  ): URL {
    const url = new URL(this.config.endpoint);
    const bucket = this.config.buckets[purpose];
    if (!bucket) {
      throw new S3CompatibleObjectStorageError("PROVIDER_NOT_CONFIGURED");
    }
    const path = objectPath
      ? `/${bucket}/${objectPath}`
      : `/${bucket}`;
    url.pathname = path
      .split("/")
      .map((segment) => awsEncode(segment))
      .join("/");
    return url;
  }

  private async request(
    method: "DELETE" | "HEAD" | "PUT",
    url: URL,
    headersValue: Readonly<Record<string, string>> = {},
    body: Uint8Array | undefined = undefined,
    options: PrivateObjectStorageCallOptions = {},
  ): Promise<Response> {
    if (options.signal?.aborted) {
      throw new S3CompatibleObjectStorageError("ABORTED");
    }
    const controller = new AbortController();
    let timedOut = false;
    const onCallerAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onCallerAbort, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.config.timeoutMs);

    const requestBody = body ? snapshotBytes(body) : undefined;
    const payloadHash = requestBody
      ? sha256Hex(requestBody)
      : EMPTY_PAYLOAD_HASH;
    const headers = signedRequestHeaders(
      this.config,
      method,
      url,
      headersValue,
      payloadHash,
      this.runtime.now(),
    );
    try {
      return await this.runtime.fetch(url, {
        method,
        headers,
        body: requestBody,
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) {
        throw new S3CompatibleObjectStorageError("TIMEOUT");
      }
      if (options.signal?.aborted || controller.signal.aborted) {
        throw new S3CompatibleObjectStorageError("ABORTED");
      }
      if (error instanceof PrivateObjectStorageError) throw error;
      throw new S3CompatibleObjectStorageError("REMOTE_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onCallerAbort);
    }
  }

  async verifyPrivatePurposeBuckets(
    options: PrivateObjectStorageCallOptions = {},
    purposes: readonly PrivateObjectPurpose[] =
      PrivateObjectPurposeSchema.options,
  ): Promise<PrivateObjectStorageReadiness> {
    const unique = [...new Set(
      purposes.map((purpose) => PrivateObjectPurposeSchema.parse(purpose)),
    )];
    if (unique.length === 0) {
      throw new S3CompatibleObjectStorageError("INVALID_INPUT");
    }
    await Promise.all(unique.map(async (purpose) => {
      const response = await this.request(
        "HEAD",
        this.objectUrl(purpose),
        {},
        undefined,
        options,
      );
      await cancelResponse(response);
      if (response.status !== 200 || response.redirected) {
        throw new S3CompatibleObjectStorageError(
          "BUCKET_POLICY_INVALID",
        );
      }
    }));
    return {
      ready: true,
      privatePurposeBuckets: unique.length,
    };
  }

  async uploadImmutable(
    inputValue: UploadPrivateObject,
    options: PrivateObjectStorageCallOptions = {},
  ): Promise<PrivateObjectReference> {
    const parsed = UploadPrivateObjectSchema.safeParse(inputValue);
    if (!parsed.success) {
      throw new S3CompatibleObjectStorageError("INVALID_INPUT");
    }
    const bytes = Uint8Array.from(parsed.data.bytes);
    if (bytes.byteLength === 0) {
      throw new S3CompatibleObjectStorageError("INVALID_INPUT");
    }
    if (bytes.byteLength > this.config.maximumAssetBytes) {
      throw new S3CompatibleObjectStorageError("ASSET_TOO_LARGE");
    }
    const control = encodedControlMetadata(parsed.data.controlMetadata);
    if (
      Buffer.byteLength(control, "utf8")
      > this.config.maximumControlMetadataBytes
    ) {
      throw new S3CompatibleObjectStorageError(
        "CONTROL_METADATA_TOO_LARGE",
      );
    }
    const hash = sha256Hex(bytes);
    const object = PrivateObjectReferenceSchema.parse({
      contractVersion: PRIVATE_OBJECT_STORAGE_CONTRACT_VERSION,
      purpose: parsed.data.purpose,
      digest: `sha256:${hash}`,
      objectPath: `sha256/${hash.slice(0, 2)}/${hash}`,
      byteLength: bytes.byteLength,
      contentType: parsed.data.contentType,
    });
    const response = await this.request(
      "PUT",
      this.objectUrl(object.purpose, object.objectPath),
      {
        "cache-control": IMMUTABLE_CACHE_CONTROL,
        "content-type": object.contentType,
        "if-none-match": "*",
        [METADATA_HEADERS.contract]: object.contractVersion,
        [METADATA_HEADERS.purpose]: object.purpose,
        [METADATA_HEADERS.digest]: object.digest,
        [METADATA_HEADERS.byteLength]: String(object.byteLength),
        [METADATA_HEADERS.control]: control,
      },
      bytes,
      options,
    );
    await cancelResponse(response);
    if (
      (response.status === 200 || response.status === 201)
      && !response.redirected
    ) {
      return object;
    }
    if (response.status === 409 || response.status === 412) {
      const existing = await this.headExactObject(object, options);
      if (existing) return existing;
      throw new S3CompatibleObjectStorageError("INVALID_RESPONSE");
    }
    throw new S3CompatibleObjectStorageError("REMOTE_REJECTED");
  }

  private async headExactObject(
    objectValue: PrivateObjectReference,
    options: PrivateObjectStorageCallOptions,
  ): Promise<PrivateObjectReference | null> {
    const object = assertReferenceIntegrity(objectValue);
    const response = await this.request(
      "HEAD",
      this.objectUrl(object.purpose, object.objectPath),
      {},
      undefined,
      options,
    );
    await cancelResponse(response);
    if (response.status === 404) return null;
    if (response.status !== 200 || response.redirected) {
      throw new S3CompatibleObjectStorageError("REMOTE_REJECTED");
    }

    const declaredLength = response.headers.get("content-length");
    const byteLength = declaredLength && /^\d+$/u.test(declaredLength)
      ? Number(declaredLength)
      : Number.NaN;
    const contentType = response.headers.get("content-type");
    const cacheControl = response.headers.get("cache-control");
    const contract = response.headers.get(METADATA_HEADERS.contract);
    const purpose = response.headers.get(METADATA_HEADERS.purpose);
    const digest = response.headers.get(METADATA_HEADERS.digest);
    const metadataLength = response.headers.get(
      METADATA_HEADERS.byteLength,
    );
    const control = decodedControlMetadata(
      response.headers.get(METADATA_HEADERS.control),
    );
    const controlResult = PrivateObjectControlMetadataSchema.safeParse(control);
    if (
      !Number.isSafeInteger(byteLength)
      || byteLength !== object.byteLength
      || contentType !== object.contentType
      || cacheControl !== IMMUTABLE_CACHE_CONTROL
      || contract !== object.contractVersion
      || purpose !== object.purpose
      || digest !== object.digest
      || metadataLength !== String(object.byteLength)
      || !controlResult.success
    ) {
      throw new S3CompatibleObjectStorageError("INVALID_RESPONSE");
    }
    return object;
  }

  async createSignedReadUrl(
    inputValue: CreatePrivateSignedReadUrl,
    _options: PrivateObjectStorageCallOptions = {},
  ): Promise<PrivateSignedReadUrl> {
    const parsed = CreatePrivateSignedReadUrlSchema.safeParse(inputValue);
    if (!parsed.success) {
      throw new S3CompatibleObjectStorageError("INVALID_INPUT");
    }
    const object = assertReferenceIntegrity(parsed.data.object);
    if (parsed.data.expiresInSeconds > MAXIMUM_SIGNED_URL_SECONDS) {
      throw new S3CompatibleObjectStorageError("INVALID_INPUT");
    }
    const now = this.runtime.now();
    const url = createPresignedUrl(
      this.config,
      this.objectUrl(object.purpose, object.objectPath),
      parsed.data.expiresInSeconds,
      now,
    );
    return PrivateSignedReadUrlSchema.parse({
      url: url.toString(),
      expiresAtEpochMs: now + parsed.data.expiresInSeconds * 1_000,
    });
  }

  async deleteGeneratedObject(
    inputValue: DeletePrivateObject,
    options: PrivateObjectStorageCallOptions = {},
  ): Promise<void> {
    const parsed = DeletePrivateObjectSchema.safeParse(inputValue);
    if (!parsed.success) {
      throw new S3CompatibleObjectStorageError("INVALID_INPUT");
    }
    const object = assertReferenceIntegrity(parsed.data.object);
    if (object.purpose === "source") {
      throw new S3CompatibleObjectStorageError(
        "SOURCE_DELETE_FORBIDDEN",
      );
    }
    const response = await this.request(
      "DELETE",
      this.objectUrl(object.purpose, object.objectPath),
      {},
      undefined,
      options,
    );
    await cancelResponse(response);
    if (
      response.redirected
      || ![200, 202, 204, 404].includes(response.status)
    ) {
      throw new S3CompatibleObjectStorageError("REMOTE_REJECTED");
    }
  }
}
