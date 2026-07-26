/**
 * Browser-local content-addressed store for verified VRM surface-paint PNG artifacts.
 *
 * Only a canonical artifact receipt and an immutable PNG Blob cross the IndexedDB boundary.
 * Canvas pixels, RGBA buffers, object URLs, and data URLs are deliberately unsupported.
 */

import {
  STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_LIMITS,
  STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_MIME,
  StudioVrmTexturePaintArtifactError,
  verifyStudioVrmTexturePaintArtifact,
  type StudioVrmTexturePaintArtifact,
  type StudioVrmTexturePaintArtifactHash,
  type StudioVrmTexturePaintArtifactLimits,
  type StudioVrmTexturePaintArtifactMetadata,
} from "./studio-vrm-texture-paint-artifact";

export const STUDIO_VRM_TEXTURE_PAINT_LIBRARY_DATABASE_NAME =
  "toonspectrum-studio-vrm-texture-paint-library";
export const STUDIO_VRM_TEXTURE_PAINT_LIBRARY_DATABASE_VERSION = 1;
export const STUDIO_VRM_TEXTURE_PAINT_LIBRARY_STORE_NAME = "png-artifacts";

/** Scene-v5 artifact/bundle ceilings. IndexedDB itself is not a single-project bundle. */
export const STUDIO_VRM_TEXTURE_PAINT_LIBRARY_LIMITS = Object.freeze({
  ...STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_LIMITS,
});

export interface StudioVrmTexturePaintLibraryLimits {
  readonly maxArtifactBytes: number;
  readonly maxAggregateBytes: number;
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly maxPixels: number;
  readonly maxAggregatePixels: number;
  readonly maxBindings: number;
  readonly maxArtifacts: number;
}

export interface StudioVrmTexturePaintLibraryOptions {
  readonly signal?: AbortSignal;
  /** Dependency injection for tests and non-window runtimes. null explicitly disables storage. */
  readonly indexedDb?: IDBFactory | null;
  /** Callers may lower, but never raise, the scene-v5 browser persistence limits. */
  readonly limits?: Partial<StudioVrmTexturePaintLibraryLimits>;
}

export interface StudioVrmTexturePaintLibrarySaveResult {
  readonly receipt: StudioVrmTexturePaintArtifactMetadata;
  readonly deduplicated: boolean;
}

export type StudioVrmTexturePaintLibraryErrorCode =
  | "ABORTED"
  | "ARTIFACT_INVALID"
  | "ARTIFACT_MISSING"
  | "CONTENT_HASH_INVALID"
  | "LIMIT_INVALID"
  | "STORAGE_CORRUPT"
  | "STORAGE_UNAVAILABLE"
  | "TRANSACTION_FAILED";

const ERROR_MESSAGES: Readonly<
  Record<StudioVrmTexturePaintLibraryErrorCode, string>
> = Object.freeze({
  ABORTED: "VRM 표면 페인팅 로컬 저장 작업이 취소되었습니다.",
  ARTIFACT_INVALID: "저장할 VRM 표면 페인팅 PNG artifact가 올바르지 않습니다.",
  ARTIFACT_MISSING: "요청한 VRM 표면 페인팅 PNG가 로컬 저장소에 없습니다.",
  CONTENT_HASH_INVALID: "VRM 표면 페인팅 PNG SHA-256 식별자가 올바르지 않습니다.",
  LIMIT_INVALID: "VRM 표면 페인팅 로컬 저장 안전 한도가 올바르지 않습니다.",
  STORAGE_CORRUPT:
    "로컬에 저장된 VRM 표면 페인팅 PNG 또는 무결성 receipt가 손상되었습니다.",
  STORAGE_UNAVAILABLE: "이 환경에서는 VRM 표면 페인팅 로컬 저장소를 사용할 수 없습니다.",
  TRANSACTION_FAILED: "VRM 표면 페인팅 로컬 저장 트랜잭션을 완료하지 못했습니다.",
});

export class StudioVrmTexturePaintLibraryError extends Error {
  constructor(
    readonly code: StudioVrmTexturePaintLibraryErrorCode,
    options?: ErrorOptions,
  ) {
    super(ERROR_MESSAGES[code], options);
    this.name = code === "ABORTED"
      ? "AbortError"
      : "StudioVrmTexturePaintLibraryError";
  }
}

interface StoredPaintArtifact {
  readonly contentHash: StudioVrmTexturePaintArtifactHash;
  readonly receipt: StudioVrmTexturePaintArtifactMetadata;
  readonly png: Blob;
}

const CONTENT_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const STORED_RECORD_KEYS = ["contentHash", "png", "receipt"] as const;

function libraryError(
  code: StudioVrmTexturePaintLibraryErrorCode,
  cause?: unknown,
): StudioVrmTexturePaintLibraryError {
  return new StudioVrmTexturePaintLibraryError(
    code,
    cause === undefined ? undefined : { cause },
  );
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw libraryError("ABORTED", signal.reason);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function hasExactDataKeys(
  value: unknown,
  expectedKeys: readonly string[],
): value is Readonly<Record<string, unknown>> {
  if (!isPlainRecord(value)) return false;
  let descriptors: Record<PropertyKey, PropertyDescriptor>;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return false;
  }
  const actualKeys = Object.keys(descriptors).sort();
  const sortedExpected = [...expectedKeys].sort();
  return actualKeys.length === sortedExpected.length
    && actualKeys.every((key, index) => key === sortedExpected[index])
    && actualKeys.every((key) => {
      const descriptor = descriptors[key];
      return descriptor !== undefined && "value" in descriptor;
    });
}

function strictContentHash(value: unknown): StudioVrmTexturePaintArtifactHash {
  if (typeof value !== "string" || !CONTENT_HASH_PATTERN.test(value)) {
    throw libraryError("CONTENT_HASH_INVALID");
  }
  return value as StudioVrmTexturePaintArtifactHash;
}

function resolveLimit(
  value: number | undefined,
  maximum: number,
): number {
  if (value === undefined) return maximum;
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw libraryError("LIMIT_INVALID");
  }
  return value;
}

function resolveLimits(
  value: Partial<StudioVrmTexturePaintLibraryLimits> | undefined,
): StudioVrmTexturePaintLibraryLimits {
  if (value !== undefined && !isPlainRecord(value)) {
    throw libraryError("LIMIT_INVALID");
  }
  return Object.freeze({
    maxArtifactBytes: resolveLimit(
      value?.maxArtifactBytes,
      STUDIO_VRM_TEXTURE_PAINT_LIBRARY_LIMITS.maxArtifactBytes,
    ),
    maxAggregateBytes: resolveLimit(
      value?.maxAggregateBytes,
      STUDIO_VRM_TEXTURE_PAINT_LIBRARY_LIMITS.maxAggregateBytes,
    ),
    maxWidth: resolveLimit(
      value?.maxWidth,
      STUDIO_VRM_TEXTURE_PAINT_LIBRARY_LIMITS.maxWidth,
    ),
    maxHeight: resolveLimit(
      value?.maxHeight,
      STUDIO_VRM_TEXTURE_PAINT_LIBRARY_LIMITS.maxHeight,
    ),
    maxPixels: resolveLimit(
      value?.maxPixels,
      STUDIO_VRM_TEXTURE_PAINT_LIBRARY_LIMITS.maxPixels,
    ),
    maxAggregatePixels: resolveLimit(
      value?.maxAggregatePixels,
      STUDIO_VRM_TEXTURE_PAINT_LIBRARY_LIMITS.maxAggregatePixels,
    ),
    maxBindings: resolveLimit(
      value?.maxBindings,
      STUDIO_VRM_TEXTURE_PAINT_LIBRARY_LIMITS.maxBindings,
    ),
    maxArtifacts: resolveLimit(
      value?.maxArtifacts,
      STUDIO_VRM_TEXTURE_PAINT_LIBRARY_LIMITS.maxArtifacts,
    ),
  });
}

function artifactLimits(
  limits: StudioVrmTexturePaintLibraryLimits,
): Partial<StudioVrmTexturePaintArtifactLimits> {
  return {
    maxArtifactBytes: limits.maxArtifactBytes,
    maxAggregateBytes: limits.maxAggregateBytes,
    maxWidth: limits.maxWidth,
    maxHeight: limits.maxHeight,
    maxPixels: limits.maxPixels,
    maxAggregatePixels: limits.maxAggregatePixels,
    maxBindings: limits.maxBindings,
    maxArtifacts: limits.maxArtifacts,
  };
}

function resolveIndexedDb(options: StudioVrmTexturePaintLibraryOptions): IDBFactory {
  if (options.indexedDb !== undefined) {
    if (options.indexedDb === null) throw libraryError("STORAGE_UNAVAILABLE");
    return options.indexedDb;
  }
  try {
    if (typeof globalThis.indexedDB !== "undefined") return globalThis.indexedDB;
  } catch {
    // Browser privacy settings can make IndexedDB property access throw.
  }
  throw libraryError("STORAGE_UNAVAILABLE");
}

function openDatabase(
  factory: IDBFactory,
  signal: AbortSignal | undefined,
): Promise<IDBDatabase> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(
        STUDIO_VRM_TEXTURE_PAINT_LIBRARY_DATABASE_NAME,
        STUDIO_VRM_TEXTURE_PAINT_LIBRARY_DATABASE_VERSION,
      );
    } catch (cause) {
      reject(libraryError("STORAGE_UNAVAILABLE", cause));
      return;
    }

    let settled = false;
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const fail = (error: StudioVrmTexturePaintLibraryError) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => fail(libraryError("ABORTED", signal?.reason));
    signal?.addEventListener("abort", onAbort, { once: true });

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STUDIO_VRM_TEXTURE_PAINT_LIBRARY_STORE_NAME)) {
        database.createObjectStore(STUDIO_VRM_TEXTURE_PAINT_LIBRARY_STORE_NAME, {
          keyPath: "contentHash",
        });
      }
    };
    request.onblocked = () => fail(libraryError("STORAGE_UNAVAILABLE"));
    request.onerror = () => fail(libraryError("STORAGE_UNAVAILABLE", request.error));
    request.onsuccess = () => {
      const database = request.result;
      if (settled || signal?.aborted) {
        database.close();
        if (!settled) fail(libraryError("ABORTED", signal?.reason));
        return;
      }
      try {
        if (!database.objectStoreNames.contains(STUDIO_VRM_TEXTURE_PAINT_LIBRARY_STORE_NAME)) {
          database.close();
          fail(libraryError("STORAGE_UNAVAILABLE"));
          return;
        }
        const transaction = database.transaction(
          STUDIO_VRM_TEXTURE_PAINT_LIBRARY_STORE_NAME,
          "readonly",
        );
        if (
          transaction.objectStore(STUDIO_VRM_TEXTURE_PAINT_LIBRARY_STORE_NAME).keyPath
          !== "contentHash"
        ) {
          transaction.abort();
          database.close();
          fail(libraryError("STORAGE_UNAVAILABLE"));
          return;
        }
      } catch (cause) {
        database.close();
        fail(libraryError("STORAGE_UNAVAILABLE", cause));
        return;
      }
      if (settled || signal?.aborted) {
        database.close();
        if (!settled) fail(libraryError("ABORTED", signal?.reason));
        return;
      }
      settled = true;
      cleanup();
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

function requestResult<T>(request: IDBRequest<T>, signal: AbortSignal | undefined): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(
      signal?.aborted
        ? libraryError("ABORTED", signal.reason)
        : libraryError("TRANSACTION_FAILED", request.error),
    );
  });
}

function monitorTransaction(
  transaction: IDBTransaction,
  signal: AbortSignal | undefined,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const finish = (error?: StudioVrmTexturePaintLibraryError) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => {
      try {
        transaction.abort();
      } catch {
        // The transaction may already be committed; the first terminal event remains authoritative.
      }
      finish(libraryError("ABORTED", signal?.reason));
    };
    transaction.oncomplete = () => finish();
    transaction.onerror = () => finish(
      signal?.aborted
        ? libraryError("ABORTED", signal.reason)
        : libraryError("TRANSACTION_FAILED", transaction.error),
    );
    transaction.onabort = () => finish(
      signal?.aborted
        ? libraryError("ABORTED", signal.reason)
        : libraryError("TRANSACTION_FAILED", transaction.error),
    );
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

function normalizeOperationError(
  cause: unknown,
  signal: AbortSignal | undefined,
): StudioVrmTexturePaintLibraryError {
  if (cause instanceof StudioVrmTexturePaintLibraryError) return cause;
  if (signal?.aborted || isAbortError(cause)) {
    return libraryError("ABORTED", signal?.reason ?? cause);
  }
  return libraryError("TRANSACTION_FAILED", cause);
}

async function withObjectStore<T>(
  mode: IDBTransactionMode,
  options: StudioVrmTexturePaintLibraryOptions,
  operation: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  throwIfAborted(options.signal);
  const database = await openDatabase(resolveIndexedDb(options), options.signal);
  try {
    throwIfAborted(options.signal);
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(
        STUDIO_VRM_TEXTURE_PAINT_LIBRARY_STORE_NAME,
        mode,
      );
    } catch (cause) {
      throw libraryError("STORAGE_UNAVAILABLE", cause);
    }
    const completion = monitorTransaction(transaction, options.signal);
    void completion.catch(() => undefined);
    try {
      const result = await operation(
        transaction.objectStore(STUDIO_VRM_TEXTURE_PAINT_LIBRARY_STORE_NAME),
      );
      await completion;
      return result;
    } catch (cause) {
      try {
        transaction.abort();
      } catch {
        // It may already be aborted or committed.
      }
      await completion.catch(() => undefined);
      throw normalizeOperationError(cause, options.signal);
    }
  } finally {
    database.close();
  }
}

function storedRecord(value: unknown): StoredPaintArtifact {
  if (!hasExactDataKeys(value, STORED_RECORD_KEYS)) {
    throw libraryError("STORAGE_CORRUPT");
  }
  const contentHash = strictContentHash(value.contentHash);
  if (
    !isPlainRecord(value.receipt)
    || value.receipt.contentHash !== contentHash
    || !(value.png instanceof Blob)
    || value.png.type !== STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_MIME
    || value.png.size < 1
  ) {
    throw libraryError("STORAGE_CORRUPT");
  }
  return value as unknown as StoredPaintArtifact;
}

function saveInputBlob(value: unknown): Blob {
  if (
    !isPlainRecord(value)
    || !isPlainRecord(value.archiveEntry)
    || !(value.archiveEntry.data instanceof Blob)
  ) {
    throw libraryError("ARTIFACT_INVALID");
  }
  return value.archiveEntry.data;
}

async function verifiedInputArtifact(
  value: unknown,
  limits: StudioVrmTexturePaintLibraryLimits,
  signal: AbortSignal | undefined,
): Promise<StudioVrmTexturePaintArtifact> {
  const png = saveInputBlob(value);
  const metadata = (value as Readonly<Record<string, unknown>>).metadata;
  try {
    return await verifyStudioVrmTexturePaintArtifact(metadata, png, {
      limits: artifactLimits(limits),
      signal,
    });
  } catch (cause) {
    if (
      signal?.aborted
      || isAbortError(cause)
      || (
        cause instanceof StudioVrmTexturePaintArtifactError
        && cause.code === "ABORTED"
      )
    ) {
      throw libraryError("ABORTED", signal?.reason ?? cause);
    }
    throw libraryError("ARTIFACT_INVALID", cause);
  }
}

async function verifiedStoredArtifact(
  value: unknown,
  contentHash: StudioVrmTexturePaintArtifactHash,
  limits: StudioVrmTexturePaintLibraryLimits,
  signal: AbortSignal | undefined,
): Promise<StudioVrmTexturePaintArtifact> {
  let record: StoredPaintArtifact;
  try {
    record = storedRecord(value);
  } catch (cause) {
    throw cause instanceof StudioVrmTexturePaintLibraryError
      ? cause
      : libraryError("STORAGE_CORRUPT", cause);
  }
  if (record.contentHash !== contentHash) throw libraryError("STORAGE_CORRUPT");
  try {
    return await verifyStudioVrmTexturePaintArtifact(record.receipt, record.png, {
      limits: artifactLimits(limits),
      signal,
    });
  } catch (cause) {
    if (
      signal?.aborted
      || isAbortError(cause)
      || (
        cause instanceof StudioVrmTexturePaintArtifactError
        && cause.code === "ABORTED"
      )
    ) {
      throw libraryError("ABORTED", signal?.reason ?? cause);
    }
    throw libraryError("STORAGE_CORRUPT", cause);
  }
}

/**
 * Verifies the artifact before opening IndexedDB, then atomically overwrites an existing hash
 * with the verified Blob. The overwrite repairs any same-key byte tampering while retaining one
 * content-addressed record. Aggregate project budgets are enforced by the manifest/bundle export
 * boundary, not across unrelated projects sharing this browser cache.
 */
export async function saveStudioVrmTexturePaintLibraryArtifact(
  value: StudioVrmTexturePaintArtifact,
  options: StudioVrmTexturePaintLibraryOptions = {},
): Promise<StudioVrmTexturePaintLibrarySaveResult> {
  const limits = resolveLimits(options.limits);
  const artifact = await verifiedInputArtifact(value, limits, options.signal);
  throwIfAborted(options.signal);
  return withObjectStore("readwrite", options, async (store) => {
    const existingValue = await requestResult<unknown>(
      store.get(artifact.metadata.contentHash),
      options.signal,
    );
    const record: StoredPaintArtifact = {
      contentHash: artifact.metadata.contentHash,
      receipt: artifact.metadata,
      png: artifact.archiveEntry.data,
    };
    await requestResult(store.put(record), options.signal);
    return Object.freeze({
      receipt: artifact.metadata,
      // The incoming artifact is already fully verified. Existing bytes are deliberately not
      // parsed before put: a malformed same-key row must remain repairable in this transaction.
      deduplicated: existingValue !== undefined,
    });
  });
}

/**
 * Resolves one strict content hash and revalidates PNG structure, receipt, dimensions, byte count,
 * and SHA-256 after the IndexedDB transaction has completed.
 */
export async function getStudioVrmTexturePaintLibraryArtifact(
  contentHashValue: StudioVrmTexturePaintArtifactHash | string,
  options: StudioVrmTexturePaintLibraryOptions = {},
): Promise<StudioVrmTexturePaintArtifact> {
  const contentHash = strictContentHash(contentHashValue);
  const limits = resolveLimits(options.limits);
  const stored = await withObjectStore("readonly", options, async (store) => {
    const value = await requestResult<unknown>(
      store.get(contentHash),
      options.signal,
    );
    if (value === undefined) throw libraryError("ARTIFACT_MISSING");
    return value;
  });
  return verifiedStoredArtifact(stored, contentHash, limits, options.signal);
}
