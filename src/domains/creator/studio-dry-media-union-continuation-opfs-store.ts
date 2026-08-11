import {
  StudioOpfsSyncAccessError,
  probeStudioOpfsSyncAccessCapability,
  type StudioOpfsSyncAccessHandleLike,
  type StudioOpfsSyncDirectoryHandleLike,
} from "./studio-opfs-sync-access-store";
import { sha256HexPortable } from "./studio-sha256";

import type {
  StudioFreehandInputBinaryCasStore,
  StudioFreehandInputCasBlobKind,
} from "./studio-freehand-input-binary-spool-opfs-store";

export const STUDIO_DRY_MEDIA_UNION_CAS_ROOT_NAME =
  "toonspectrum-studio-dry-media-union-v1";
const MAX_BLOB_BYTES = 8 * 1024 * 1024;
const MAX_STAGING_BYTES = 1024 * 1024;
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const PENDING_FILE = /^([a-f0-9]{64})\.pending$/u;
const SAFE_STROKE_ID = /^[a-zA-Z0-9._-]{1,192}$/u;

interface SyncHandle extends StudioOpfsSyncAccessHandleLike {
  getSize(): number;
}

interface FileHandleLike {
  createSyncAccessHandle?: () => Promise<SyncHandle>;
}

function validateDigest(digest: string, bytes?: Uint8Array): void {
  if (!SHA256_HEX.test(digest) || (bytes && sha256HexPortable(bytes) !== digest)) {
    throw new StudioOpfsSyncAccessError(
      "INVALID_ARGUMENT",
      "Dry-media CAS digest does not match its domain-separated payload.",
    );
  }
}

function validateBytes(bytes: Uint8Array, maximum: number): void {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength <= 0 || bytes.byteLength > maximum) {
    throw new StudioOpfsSyncAccessError(
      "INVALID_ARGUMENT",
      "Dry-media CAS payload is outside its bounded page contract.",
    );
  }
}

async function openHandle(
  directory: StudioOpfsSyncDirectoryHandleLike,
  name: string,
  create: boolean,
): Promise<SyncHandle | null> {
  try {
    const file = await directory.getFileHandle(
      name,
      create ? { create: true } : undefined,
    ) as FileHandleLike;
    if (typeof file.createSyncAccessHandle !== "function") {
      throw new StudioOpfsSyncAccessError(
        "SYNC_ACCESS_UNAVAILABLE",
        "Dry-media CAS requires Dedicated Worker sync access.",
      );
    }
    return await file.createSyncAccessHandle();
  } catch (error) {
    if (
      !create
      && typeof error === "object"
      && error !== null
      && "name" in error
      && (error as { readonly name?: unknown }).name === "NotFoundError"
    ) return null;
    if (error instanceof StudioOpfsSyncAccessError) throw error;
    throw new StudioOpfsSyncAccessError(
      create ? "WRITE_FAILED" : "READ_FAILED",
      "Dry-media CAS sync handle open failed.",
      error,
    );
  }
}

function writeAll(handle: SyncHandle, bytes: Uint8Array, at: number): void {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const written = handle.write(bytes.subarray(offset), { at: at + offset });
    if (!Number.isSafeInteger(written) || written <= 0 || written > bytes.byteLength - offset) {
      throw new StudioOpfsSyncAccessError("WRITE_FAILED", "Dry-media CAS short write.");
    }
    offset += written;
  }
}

function readAll(handle: SyncHandle, size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  let offset = 0;
  while (offset < size) {
    const read = handle.read(bytes.subarray(offset), { at: offset });
    if (!Number.isSafeInteger(read) || read <= 0 || read > size - offset) {
      throw new StudioOpfsSyncAccessError("SHORT_READ", "Dry-media CAS short read.");
    }
    offset += read;
  }
  return bytes;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let mismatch = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    mismatch |= left[index]! ^ right[index]!;
  }
  return mismatch === 0;
}

type DigestFileState =
  | { readonly status: "missing" | "empty" | "corrupt" }
  | { readonly status: "valid"; readonly bytes: Uint8Array };

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object"
    && error !== null
    && "name" in error
    && (error as { readonly name?: unknown }).name === "NotFoundError"
  );
}

function pendingFileName(digest: string): string {
  return `${digest}.pending`;
}

function finalFileName(digest: string): string {
  return `${digest}.bin`;
}

function flush(handle: SyncHandle, label: string): void {
  try {
    handle.flush();
  } catch (error) {
    throw new StudioOpfsSyncAccessError(
      "FLUSH_FAILED",
      `Dry-media CAS ${label} flush failed.`,
      error,
    );
  }
}

async function inspectDigestFile(
  directory: StudioOpfsSyncDirectoryHandleLike,
  name: string,
  digest: string,
): Promise<DigestFileState> {
  const handle = await openHandle(directory, name, false);
  if (!handle) return { status: "missing" };
  try {
    const size = handle.getSize();
    if (size === 0) return { status: "empty" };
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_BLOB_BYTES) {
      return { status: "corrupt" };
    }
    const bytes = readAll(handle, size);
    return sha256HexPortable(bytes) === digest
      ? { status: "valid", bytes }
      : { status: "corrupt" };
  } finally {
    handle.close();
  }
}

async function removeIfPresent(
  directory: StudioOpfsSyncDirectoryHandleLike,
  name: string,
): Promise<void> {
  try {
    await directory.removeEntry(name);
  } catch (error) {
    if (isNotFoundError(error)) return;
    throw new StudioOpfsSyncAccessError(
      "WRITE_FAILED",
      "Dry-media CAS temporary-file cleanup failed.",
      error,
    );
  }
}

async function writeVerifiedFile(
  directory: StudioOpfsSyncDirectoryHandleLike,
  name: string,
  digest: string,
  bytes: Uint8Array,
  label: "staging" | "final",
): Promise<void> {
  const handle = await openHandle(directory, name, true);
  if (!handle) throw new Error("unreachable dry-media CAS create");
  try {
    handle.truncate(0);
    writeAll(handle, bytes, 0);
    handle.truncate(bytes.byteLength);
    flush(handle, label);
    const size = handle.getSize();
    if (
      size !== bytes.byteLength
      || !bytesEqual(readAll(handle, size), bytes)
      || sha256HexPortable(bytes) !== digest
    ) {
      throw new StudioOpfsSyncAccessError(
        "WRITE_FAILED",
        `Dry-media CAS ${label} verification failed.`,
      );
    }
  } finally {
    handle.close();
  }
}

async function flushVerifiedFile(
  directory: StudioOpfsSyncDirectoryHandleLike,
  name: string,
  digest: string,
  label: "staging" | "final",
): Promise<Uint8Array> {
  const handle = await openHandle(directory, name, false);
  if (!handle) {
    throw new StudioOpfsSyncAccessError(
      "WRITE_FAILED",
      `Dry-media CAS ${label} disappeared before verification.`,
    );
  }
  try {
    const size = handle.getSize();
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_BLOB_BYTES) {
      throw new StudioOpfsSyncAccessError(
        "WRITE_FAILED",
        `Dry-media CAS ${label} size failed verification.`,
      );
    }
    const before = readAll(handle, size);
    if (sha256HexPortable(before) !== digest) {
      throw new StudioOpfsSyncAccessError(
        "WRITE_FAILED",
        `Dry-media CAS ${label} digest failed verification.`,
      );
    }
    flush(handle, label);
    const afterSize = handle.getSize();
    if (
      afterSize !== size
      || !bytesEqual(readAll(handle, afterSize), before)
    ) {
      throw new StudioOpfsSyncAccessError(
        "WRITE_FAILED",
        `Dry-media CAS ${label} changed while becoming durable.`,
      );
    }
    return before;
  } finally {
    handle.close();
  }
}

async function ensureVerifiedPending(
  directory: StudioOpfsSyncDirectoryHandleLike,
  digest: string,
  bytes: Uint8Array,
): Promise<Uint8Array> {
  const name = pendingFileName(digest);
  const current = await inspectDigestFile(directory, name, digest);
  if (current.status === "valid") {
    if (!bytesEqual(current.bytes, bytes)) {
      throw new StudioOpfsSyncAccessError(
        "WRITE_FAILED",
        "Dry-media CAS staging digest collision.",
      );
    }
    return flushVerifiedFile(directory, name, digest, "staging");
  }
  await writeVerifiedFile(directory, name, digest, bytes, "staging");
  const verified = await inspectDigestFile(directory, name, digest);
  if (verified.status !== "valid" || !bytesEqual(verified.bytes, bytes)) {
    throw new StudioOpfsSyncAccessError(
      "WRITE_FAILED",
      "Dry-media CAS staging did not survive verification.",
    );
  }
  return verified.bytes;
}

async function promoteVerifiedPending(
  directory: StudioOpfsSyncDirectoryHandleLike,
  digest: string,
  pendingBytes: Uint8Array,
): Promise<void> {
  const finalName = finalFileName(digest);
  const current = await inspectDigestFile(directory, finalName, digest);
  if (current.status === "valid") {
    if (!bytesEqual(current.bytes, pendingBytes)) {
      throw new StudioOpfsSyncAccessError(
        "WRITE_FAILED",
        "Dry-media CAS immutable digest collision.",
      );
    }
    await flushVerifiedFile(directory, finalName, digest, "final");
    return;
  }
  await writeVerifiedFile(directory, finalName, digest, pendingBytes, "final");
  const verified = await inspectDigestFile(directory, finalName, digest);
  if (verified.status !== "valid" || !bytesEqual(verified.bytes, pendingBytes)) {
    throw new StudioOpfsSyncAccessError(
      "WRITE_FAILED",
      "Dry-media CAS final promotion did not survive verification.",
    );
  }
}

async function recoverDigest(
  directory: StudioOpfsSyncDirectoryHandleLike,
  digest: string,
): Promise<DigestFileState> {
  const finalName = finalFileName(digest);
  const pendingName = pendingFileName(digest);
  const final = await inspectDigestFile(directory, finalName, digest);
  if (final.status === "valid") {
    const pending = await inspectDigestFile(directory, pendingName, digest);
    if (pending.status === "valid") {
      if (!bytesEqual(final.bytes, pending.bytes)) {
        throw new StudioOpfsSyncAccessError(
          "WRITE_FAILED",
          "Dry-media CAS immutable digest collision.",
        );
      }
      await flushVerifiedFile(directory, pendingName, digest, "staging");
      await promoteVerifiedPending(directory, digest, pending.bytes);
    }
    if (pending.status !== "missing") await removeIfPresent(directory, pendingName);
    return final;
  }

  const pending = await inspectDigestFile(directory, pendingName, digest);
  if (pending.status !== "valid") {
    if (pending.status !== "missing") await removeIfPresent(directory, pendingName);
    return final;
  }

  const durablePending = await flushVerifiedFile(
    directory,
    pendingName,
    digest,
    "staging",
  );
  await promoteVerifiedPending(directory, digest, durablePending);
  await removeIfPresent(directory, pendingName);
  return { status: "valid", bytes: durablePending };
}

async function recoverDirectory(
  directory: StudioOpfsSyncDirectoryHandleLike,
): Promise<void> {
  for await (const name of directory.keys()) {
    const match = PENDING_FILE.exec(name);
    if (!match?.[1]) continue;
    await recoverDigest(directory, match[1]);
  }
}

class StudioDryMediaUnionOpfsCasStore implements StudioFreehandInputBinaryCasStore {
  readonly kind = "opfs-sync-cas" as const;
  readonly #directories: Readonly<Record<StudioFreehandInputCasBlobKind, StudioOpfsSyncDirectoryHandleLike>>;
  readonly #staging: StudioOpfsSyncDirectoryHandleLike;
  #tail: Promise<void> = Promise.resolve();
  #closed = false;

  constructor(input: Readonly<{
    directories: Readonly<Record<StudioFreehandInputCasBlobKind, StudioOpfsSyncDirectoryHandleLike>>;
    staging: StudioOpfsSyncDirectoryHandleLike;
  }>) {
    this.#directories = input.directories;
    this.#staging = input.staging;
  }

  async putCas(
    kind: StudioFreehandInputCasBlobKind,
    digest: string,
    bytes: Uint8Array,
  ): Promise<void> {
    validateBytes(bytes, MAX_BLOB_BYTES);
    const ownedBytes = bytes.slice();
    validateDigest(digest, ownedBytes);
    return this.#enqueue(async () => {
      const directory = this.#directories[kind];
      const final = await inspectDigestFile(directory, finalFileName(digest), digest);
      if (final.status === "valid") {
        if (!bytesEqual(final.bytes, ownedBytes)) {
          throw new StudioOpfsSyncAccessError(
            "WRITE_FAILED",
            "Dry-media CAS immutable digest collision.",
          );
        }
        await recoverDigest(directory, digest);
        return;
      }

      const existingPending = await inspectDigestFile(
        directory,
        pendingFileName(digest),
        digest,
      );
      if (final.status === "corrupt" && existingPending.status !== "valid") {
        if (existingPending.status !== "missing") {
          await removeIfPresent(directory, pendingFileName(digest));
        }
        throw new StudioOpfsSyncAccessError(
          "WRITE_FAILED",
          "Dry-media CAS found an unproven immutable final blob.",
        );
      }

      const pendingBytes = existingPending.status === "valid"
        ? await flushVerifiedFile(
            directory,
            pendingFileName(digest),
            digest,
            "staging",
          )
        : await ensureVerifiedPending(directory, digest, ownedBytes);
      if (!bytesEqual(pendingBytes, ownedBytes)) {
        throw new StudioOpfsSyncAccessError(
          "WRITE_FAILED",
          "Dry-media CAS staging digest collision.",
        );
      }
      await promoteVerifiedPending(directory, digest, pendingBytes);
      await removeIfPresent(directory, pendingFileName(digest));
    });
  }

  async getCas(
    kind: StudioFreehandInputCasBlobKind,
    digest: string,
  ): Promise<Uint8Array | null> {
    validateDigest(digest);
    return this.#enqueue(async () => {
      const recovered = await recoverDigest(this.#directories[kind], digest);
      if (recovered.status === "valid") return recovered.bytes;
      if (recovered.status === "corrupt") {
        throw new StudioOpfsSyncAccessError(
          "READ_FAILED",
          "Dry-media CAS immutable final blob failed verification.",
        );
      }
      return null;
    });
  }

  async appendStaging(
    strokeId: string,
    expectedByteOffset: bigint,
    bytes: Uint8Array,
  ): Promise<bigint> {
    validateBytes(bytes, MAX_STAGING_BYTES);
    if (!SAFE_STROKE_ID.test(strokeId) || expectedByteOffset < BigInt(0)) {
      throw new StudioOpfsSyncAccessError(
        "INVALID_ARGUMENT",
        "Dry-media staging identity/offset is invalid.",
      );
    }
    const ownedBytes = bytes.slice();
    return this.#enqueue(async () => {
      const handle = await openHandle(this.#staging, `${strokeId}.staging`, true);
      if (!handle) throw new Error("unreachable dry-media staging create");
      try {
        const size = handle.getSize();
        if (BigInt(size) !== expectedByteOffset) {
          throw new StudioOpfsSyncAccessError("WRITE_FAILED", "Dry-media staging cursor is stale.");
        }
        writeAll(handle, ownedBytes, size);
        handle.flush();
        return expectedByteOffset + BigInt(ownedBytes.byteLength);
      } finally {
        handle.close();
      }
    });
  }

  async removeStaging(strokeId: string): Promise<void> {
    if (!SAFE_STROKE_ID.test(strokeId)) return;
    return this.#enqueue(async () => {
      try {
        await this.#staging.removeEntry(`${strokeId}.staging`);
      } catch (error) {
        if (
          typeof error === "object"
          && error !== null
          && "name" in error
          && (error as { readonly name?: unknown }).name === "NotFoundError"
        ) return;
        throw error;
      }
    });
  }

  async close(): Promise<void> {
    return this.#enqueue(async () => {
      this.#closed = true;
    }, true);
  }

  #enqueue<T>(operation: () => Promise<T>, allowClosed = false): Promise<T> {
    const run = async () => {
      if (this.#closed && !allowClosed) {
        throw new StudioOpfsSyncAccessError("STORE_CLOSED", "Dry-media CAS store is closed.");
      }
      return operation();
    };
    const result = this.#tail.then(run, run);
    this.#tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

export async function createStudioDryMediaUnionContinuationOpfsCasStore(
  scope: unknown = globalThis,
): Promise<StudioFreehandInputBinaryCasStore> {
  const capability = probeStudioOpfsSyncAccessCapability(scope);
  if (!capability.supported) {
    throw new StudioOpfsSyncAccessError(
      capability.reason === "not-dedicated-worker"
        ? "NOT_DEDICATED_WORKER"
        : "OPFS_UNAVAILABLE",
      "Dry-media union CAS requires Dedicated Worker OPFS sync access.",
    );
  }
  const opfs = await capability.storageManager.getDirectory();
  const root = await opfs.getDirectoryHandle(STUDIO_DRY_MEDIA_UNION_CAS_ROOT_NAME, {
    create: true,
  });
  const [page, index, metadata, roots, staging] = await Promise.all([
    root.getDirectoryHandle("pages", { create: true }),
    root.getDirectoryHandle("indexes", { create: true }),
    root.getDirectoryHandle("metadata", { create: true }),
    root.getDirectoryHandle("roots", { create: true }),
    root.getDirectoryHandle("staging", { create: true }),
  ]);
  await Promise.all([
    recoverDirectory(page),
    recoverDirectory(index),
    recoverDirectory(metadata),
    recoverDirectory(roots),
  ]);
  return new StudioDryMediaUnionOpfsCasStore({
    directories: { page, index, metadata, root: roots },
    staging,
  });
}
